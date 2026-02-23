require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { checkHealth } = require('./modules/health');
const { runMigrations } = require('./db/migrate');
const { getSupabaseClient } = require('./modules/supabase');

const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', checkHealth);
app.get('/admin/ping', (req, res) => res.json({ ping: 'pong' }));
const adminRoutes = require('./routes/admin');
app.use('/admin', adminRoutes);

const agentRoutes = require('./routes/agent');
app.use('/api/agent', agentRoutes);

app.use('/api', (req, res, next) => {
  const routesPath = path.join(__dirname, 'routes/index.js');
  delete require.cache[require.resolve(routesPath)];
  const routes = require(routesPath);
  routes(req, res, next);
});

// Nite platform assets
app.use(express.static(path.join(__dirname, '../frontend/nite-dist')));

// Nite platform routes
app.get('/start*', (req, res) => res.sendFile(path.join(__dirname, '../frontend/nite-dist/index.html')));
app.get('/admin*', (req, res) => res.sendFile(path.join(__dirname, '../frontend/nite-dist/index.html')));
app.get('/dashboard*', (req, res) => res.sendFile(path.join(__dirname, '../frontend/nite-dist/index.html')));

// Generated app
app.use(express.static(path.join(__dirname, '../frontend/dist')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/dist/index.html'));
});

const LOCKED_FILES = [
  'backend/server.js',
  'backend/modules/auth.js',
  'backend/modules/billing.js',
  'backend/modules/health.js',
  'backend/db/migrate.js',
  'backend/db/schema.sql',
  'backend/routes/index.js',
  'frontend/src/main.jsx',
  'frontend/vite.config.js',
  'frontend/index.html',
  'config/env.template',
  'Dockerfile'
];

async function restoreFromSupabase() {
  try {
    const supabase = getSupabaseClient();
    if (!supabase) {
      console.log('Supabase unavailable. Skipping restore from Supabase.');
      return;
    }

    const { data: files, error } = await supabase
      .from('generated_apps')
      .select('file_path, file_content, file_type')
      .is('customer_id', null)
      .in('file_type', ['source', 'compiled']);

    if (error || !files || files.length === 0) {
      console.log('No generated files to restore from Supabase');
      return;
    }

    const BASE_DIR = path.resolve(__dirname, '../');
    let restoredCount = 0;
    let skippedCount = 0;

    for (const file of files) {
      const normalizedPath = String(file.file_path || '')
        .replace(/\\/g, '/')
        .replace(/^\.?\//, '');

      // Never restore backend source from Supabase.
      if (!normalizedPath || normalizedPath.startsWith('backend/')) {
        skippedCount++;
        continue;
      }
      if (LOCKED_FILES.includes(normalizedPath)) {
        skippedCount++;
        continue;
      }

      const fullPath = path.resolve(BASE_DIR, normalizedPath);
      if (!fullPath.startsWith(BASE_DIR + path.sep)) {
        skippedCount++;
        continue;
      }

      const dir = path.dirname(fullPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(fullPath, file.file_content, 'utf8');
      restoredCount++;
    }

    console.log(`Restored ${restoredCount} files from Supabase (skipped ${skippedCount}) ✓`);
  } catch (err) {
    console.error('Failed to restore from Supabase:', err.message);
  }
}

const PORT = process.env.PORT || 3000;

async function bootstrap() {
  app.listen(PORT, () => console.log(`App running on port ${PORT}`));

  try {
    await runMigrations();
  } catch (err) {
    // Keep the app bootable when migration fails unexpectedly.
    console.error('Startup migration error:', err.message);
  }

  await restoreFromSupabase();
}

bootstrap().catch((err) => {
  console.error('Fatal startup error:', err.message);
  process.exit(1);
});
