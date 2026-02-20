require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { checkBilling } = require('./modules/billing');
const { checkHealth } = require('./modules/health');
const { runMigrations } = require('./db/migrate');
const app = express();
app.use(cors());
app.use(express.json());
app.get('/health', checkHealth);
const adminRoutes = require('./routes/admin');
app.use('/admin', adminRoutes);
app.use('/dashboard', checkBilling);

// Dynamic route loading — picks up generated routes after rebuild
app.use('/api', checkBilling, (req, res, next) => {
  delete require.cache[require.resolve('./routes/index')];
  const routes = require('./routes/index');
  routes(req, res, next);
});

// Serve frontend with no-cache headers so new builds load immediately
app.use(express.static(path.join(__dirname, '../frontend/dist'), {
  etag: false,
  lastModified: false,
  setHeaders: (res) => {
    res.set('Cache-Control', 'no-store');
  }
}));
app.get('*', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.sendFile(path.join(__dirname, '../frontend/dist/index.html'));
});
const PORT = process.env.PORT || 3000;
runMigrations().then(() => app.listen(PORT, () => console.log(`App running on port ${PORT}`)));
