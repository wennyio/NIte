require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
const { checkHealth } = require('./modules/health');
const { runMigrations } = require('./db/migrate');

const app = express();
app.use(cors());
app.use(express.json());

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

app.get('/health', checkHealth);
app.get('/admin/ping', (req, res) => res.json({ ping: 'pong' }));

const adminRoutes = require('./routes/admin');
app.use('/admin', adminRoutes);

// Dynamic API routes — clears Node cache on every request
// This ensures the latest routes/index.js is always used after generation
app.use('/api', (req, res, next) => {
  const routesPath = path.join(__dirname, 'routes/index.js');
  delete require.cache[require.resolve(routesPath)];
  const routes = require(routesPath);
  routes(req, res, next);
});

// Nite platform routes — served from nite-dist (never overwritten)
app.use('/start', express.static(path.join(__dirname, '../frontend/nite-dist')));
app.use('/admin', express.static(path.join(__dirname, '../frontend/nite-dist')));
app.get('/start*', (req, res) => res.sendFile(path.join(__dirname, '../frontend/nite-dist/index.html')));
app.get('/admin*', (req, res) => res.sendFile(path.join(__dirname, '../frontend/nite-dist/index.html')));

// Generated app — served from dist
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
  'frontend/src/main.jsx',
  'frontend/vite.config.js',
  'frontend/index.html',
  'config/env.template',
  'Dockerfile'
];

async function restoreFromSupabase() {
  try {
    const { data: files, error } = await supabase
      .from('generated_apps')
      .select('file_path, file_content, file_type')
      .is('customer_id', null)
      .in('file_type', ['source', 'compiled']);

    if (error || !files || files.length === 0) {
      console.log('No generated files to restore from Supabase');
      return;
    }

    const BASE_DIR = path.join(__dirname, '../');

    for (const file of files) {
      if (LOCKED_FILES.includes(file.file_path)) continue;
      const fullPath = path.join(BASE_DIR, file.file_path);
      const dir = path.dirname(fullPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(fullPath, file.file_content, 'utf8');
    }

    console.log(`Restored ${files.length} files from Supabase ✓`);
  } catch (err) {
    console.error('Failed to restore from Supabase:', err.message);
  }
}

const PORT = process.env.PORT || 3000;

runMigrations().then(async () => {
  // Restore BEFORE listening so routes are ready on first request
  await restoreFromSupabase();
  app.listen(PORT, () => console.log(`App running on port ${PORT}`));
});
