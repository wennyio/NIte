require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { checkHealth } = require('./modules/health');
const { runMigrations } = require('./db/migrate');
const { getSupabaseClient } = require('./modules/supabase');
const { getLiveAppFiles } = require('./modules/live-app');
const { restoreCompiledFilesToDisk } = require('./modules/restore-generated');

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
app.use(express.static(path.join(__dirname, '../frontend/nite-dist'), { index: false }));

// Nite platform routes
app.get('/start*', (req, res) => res.sendFile(path.join(__dirname, '../frontend/nite-dist/index.html')));
app.get('/admin*', (req, res) => res.sendFile(path.join(__dirname, '../frontend/nite-dist/index.html')));
app.get('/dashboard*', (req, res) => res.sendFile(path.join(__dirname, '../frontend/nite-dist/index.html')));

// Generated app
app.use(express.static(path.join(__dirname, '../frontend/dist'), { index: false }));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/dist/index.html'));
});

async function restoreFromSupabase() {
  try {
    const supabase = getSupabaseClient();
    if (!supabase) {
      console.log('Supabase unavailable. Skipping restore from Supabase.');
      return;
    }

    const { files, customerId, source } = await getLiveAppFiles(supabase, ['compiled']);
    if (!files || files.length === 0) {
      console.log('No generated files to restore from Supabase');
      return;
    }
    const { restoredCount, skippedCount } = restoreCompiledFilesToDisk(files);

    console.log(`Restored ${restoredCount} files from Supabase (skipped ${skippedCount}) from ${source}${customerId ? `:${customerId}` : ''} ✓`);
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
