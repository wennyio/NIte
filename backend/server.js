require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
const { checkBilling } = require('./modules/billing');
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

const routes = require('./routes/index');
app.use('/api', routes);

// Serve static frontend from disk (the base Nite app)
app.use(express.static(path.join(__dirname, '../frontend/dist')));

// For any non-API route, serve the React app
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/dist/index.html'));
});

const PORT = process.env.PORT || 3000;

runMigrations().then(async () => {
  app.listen(PORT, () => console.log(`App running on port ${PORT}`));

  // On startup, restore the latest generated app from Supabase to disk
  try {
    const { data: files, error } = await supabase
      .from('generated_apps')
      .select('file_path, file_content, file_type')
      .is('customer_id', null)
      .eq('file_type', 'source');

    if (!error && files && files.length > 0) {
      const BASE_DIR = path.join(__dirname, '../');
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

      for (const file of files) {
        if (LOCKED_FILES.includes(file.file_path)) continue;
        const fullPath = path.join(BASE_DIR, file.file_path);
        const dir = path.dirname(fullPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(fullPath, file.file_content, 'utf8');
      }
      console.log(`Restored ${files.length} generated source files from Supabase ✓`);
    }
  } catch (err) {
    console.error('Failed to restore generated files:', err.message);
  }
});
