const RESERVED_SUBDOMAINS = new Set(['www', 'admin', 'dashboard', 'start', 'api']);

const tenantCache = new Map();

function nowMs() {
  return Date.now();
}

function getCacheTtlMs() {
  const parsed = Number(process.env.TENANT_CACHE_TTL_MS || 30000);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 30000;
}

function getPlatformHosts() {
  const hosts = new Set(['localhost', '127.0.0.1']);
  const configured = [
    process.env.PLATFORM_BASE_HOST,
    process.env.RAILWAY_PUBLIC_DOMAIN,
    process.env.RAILWAY_STATIC_URL
  ];
  for (const value of configured) {
    const host = normalizeHost(value);
    if (host) hosts.add(host);
  }

  const extra = String(process.env.PLATFORM_HOSTS || '')
    .split(',')
    .map((value) => normalizeHost(value))
    .filter(Boolean);
  for (const host of extra) hosts.add(host);
  return hosts;
}

function normalizeHost(rawHost) {
  if (!rawHost) return '';
  const host = String(rawHost)
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .split('/')[0]
    .split(':')[0];
  return host;
}

function getRequestHost(req) {
  const forwarded = String(req.headers['x-forwarded-host'] || '').split(',')[0].trim();
  const hostHeader = forwarded || String(req.headers.host || '');
  return normalizeHost(hostHeader);
}

function isPlatformHost(host) {
  if (!host) return true;
  return getPlatformHosts().has(host);
}

function extractSubdomain(host) {
  if (!host || isPlatformHost(host)) return null;
  const parts = host.split('.').filter(Boolean);
  if (parts.length < 2) return null;
  const isLocalhostStyle = parts[parts.length - 1] === 'localhost';
  if (!isLocalhostStyle && parts.length < 3) return null;
  const subdomain = parts[0];
  if (!subdomain || RESERVED_SUBDOMAINS.has(subdomain)) return null;
  return subdomain;
}

function readTenantCache(host) {
  const existing = tenantCache.get(host);
  if (!existing) return null;
  if (existing.expiresAt < nowMs()) {
    tenantCache.delete(host);
    return null;
  }
  return existing.value;
}

function writeTenantCache(host, value) {
  tenantCache.set(host, {
    value,
    expiresAt: nowMs() + getCacheTtlMs()
  });
}

function shouldUseTenantRouting() {
  return process.env.ENABLE_TENANT_ROUTING !== 'false';
}

async function resolveTenantForRequest(supabase, req) {
  const host = getRequestHost(req);
  if (!shouldUseTenantRouting()) {
    return { host, subdomain: null, customer: null, source: 'disabled' };
  }

  const subdomain = extractSubdomain(host);
  if (!subdomain) {
    return { host, subdomain: null, customer: null, source: 'platform' };
  }

  const cached = readTenantCache(host);
  if (cached) {
    return { ...cached, source: 'cache' };
  }

  try {
    const lookup = await supabase
      .from('customers')
      .select('id, business_name, business_type, owner_name, owner_email, subdomain, container_url, app_status, status')
      .eq('subdomain', subdomain)
      .eq('status', 'active')
      .maybeSingle();
    if (lookup.error) throw lookup.error;

    const value = {
      host,
      subdomain,
      customer: lookup.data || null,
      source: 'db'
    };
    writeTenantCache(host, value);
    return value;
  } catch {
    const value = { host, subdomain, customer: null, source: 'lookup-error' };
    writeTenantCache(host, value);
    return value;
  }
}

function getContainerRedirectUrl(req, customer) {
  const containerUrl = String(customer?.container_url || '').trim();
  if (!containerUrl) return null;

  let parsed;
  try {
    parsed = new URL(containerUrl);
  } catch {
    return null;
  }

  const requestHost = getRequestHost(req);
  const targetHost = normalizeHost(parsed.host);
  if (!targetHost || requestHost === targetHost) return null;

  const original = req.originalUrl || req.url || '/';
  const pathWithQuery = original.startsWith('/') ? original : `/${original}`;
  return `${parsed.origin}${pathWithQuery}`;
}

module.exports = {
  getRequestHost,
  resolveTenantForRequest,
  getContainerRedirectUrl,
  extractSubdomain
};
