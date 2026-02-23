const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const { createHash } = require('crypto');
const dns = require('dns');

const PLATFORM_SCHEMA_SQL = `
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_name TEXT NOT NULL,
  business_type TEXT,
  owner_name TEXT,
  owner_email TEXT NOT NULL,
  subdomain TEXT UNIQUE,
  status TEXT DEFAULT 'active',
  tier TEXT DEFAULT 'growth',
  app_status TEXT DEFAULT 'pending',
  container_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS generated_apps (
  id BIGSERIAL PRIMARY KEY,
  customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  file_content TEXT NOT NULL,
  file_type TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS generated_apps_customer_path_unique
  ON generated_apps (customer_id, file_path);
CREATE INDEX IF NOT EXISTS generated_apps_customer_file_type_idx
  ON generated_apps (customer_id, file_type);

CREATE TABLE IF NOT EXISTS generated_app_revisions (
  id BIGSERIAL PRIMARY KEY,
  customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
  revision_number BIGINT NOT NULL,
  summary TEXT,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS generated_app_revisions_customer_created_idx
  ON generated_app_revisions (customer_id, created_at DESC);

CREATE TABLE IF NOT EXISTS legal_pages (
  id BIGSERIAL PRIMARY KEY,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  page_key TEXT NOT NULL CHECK (page_key IN ('terms', 'privacy', 'contact')),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(customer_id, page_key)
);

CREATE TABLE IF NOT EXISTS business_profiles (
  id BIGSERIAL PRIMARY KEY,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE UNIQUE,
  display_name TEXT,
  tagline TEXT,
  about_text TEXT,
  logo_url TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  contact_address TEXT,
  website_url TEXT,
  social_instagram TEXT DEFAULT '#',
  social_facebook TEXT DEFAULT '#',
  social_tiktok TEXT DEFAULT '#',
  social_twitter TEXT DEFAULT '#',
  booking_confirmation_enabled BOOLEAN DEFAULT true,
  hours_json JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS business_profiles_customer_idx
  ON business_profiles (customer_id);

CREATE TABLE IF NOT EXISTS nite_schema_migrations (
  name TEXT PRIMARY KEY,
  checksum TEXT NOT NULL,
  applied_at TIMESTAMPTZ DEFAULT now()
);
`;

function checksum(content) {
  return createHash('sha256').update(content).digest('hex');
}

function isConnectivityError(err) {
  const codes = new Set(['ENETUNREACH', 'EHOSTUNREACH', 'ECONNREFUSED', 'ETIMEDOUT', 'EAI_AGAIN']);
  return !!(err && (codes.has(err.code) || (typeof err.message === 'string' && err.message.includes('ENETUNREACH'))));
}

function normalizeDatabaseUrl(databaseUrl) {
  try {
    const url = new URL(databaseUrl);
    const sslMode = (url.searchParams.get('sslmode') || '').toLowerCase();
    if (!sslMode || sslMode === 'prefer' || sslMode === 'require' || sslMode === 'verify-ca') {
      url.searchParams.set('sslmode', 'verify-full');
    }
    return url.toString();
  } catch {
    return databaseUrl;
  }
}

const runMigrations = async () => {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.log('DATABASE_URL not set. Skipping SQL migrations.');
    return;
  }

  // Prefer IPv4 first so platforms without IPv6 egress can still connect.
  if (typeof dns.setDefaultResultOrder === 'function') {
    dns.setDefaultResultOrder('ipv4first');
  }

  const schemaPath = path.join(__dirname, 'schema.sql');
  if (!fs.existsSync(schemaPath)) {
    console.log('No schema, skipping');
    return;
  }

  const schemaSql = fs.readFileSync(schemaPath, 'utf8');
  const schemaChecksum = checksum(schemaSql);
  const migrationName = 'backend/db/schema.sql';

  const sslMode = (process.env.PGSSLMODE || '').toLowerCase();
  const normalizedDatabaseUrl = normalizeDatabaseUrl(databaseUrl);
  const clientConfig = { connectionString: normalizedDatabaseUrl };
  if (sslMode === 'disable') {
    clientConfig.ssl = false;
  } else if (sslMode === 'insecure') {
    clientConfig.ssl = { rejectUnauthorized: false };
  }
  const client = new Client(clientConfig);

  try {
    await client.connect();
    await client.query('BEGIN');

    await client.query(PLATFORM_SCHEMA_SQL);
    const { rows } = await client.query(
      'SELECT checksum FROM nite_schema_migrations WHERE name = $1',
      [migrationName]
    );

    const appliedChecksum = rows[0]?.checksum;
    if (appliedChecksum !== schemaChecksum) {
      await client.query(schemaSql);
      await client.query(
        `INSERT INTO nite_schema_migrations (name, checksum, applied_at)
         VALUES ($1, $2, now())
         ON CONFLICT (name) DO UPDATE
         SET checksum = EXCLUDED.checksum, applied_at = EXCLUDED.applied_at`,
        [migrationName, schemaChecksum]
      );
      console.log('Applied schema.sql migration ✓');
    } else {
      console.log('Schema unchanged, skipping schema.sql migration');
    }

    await client.query('COMMIT');
    console.log('Migrations complete');
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch { }
    if (isConnectivityError(err) && process.env.MIGRATIONS_STRICT !== 'true') {
      console.error('Migration DB connectivity failed; continuing startup without SQL migration:', err.message);
      return;
    }
    console.error('Migration failed:', err.message);
    throw err;
  } finally {
    try { await client.end(); } catch { }
  }
};

module.exports = { runMigrations };