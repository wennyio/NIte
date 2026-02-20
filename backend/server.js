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
app.get('/admin/ping', (req, res) => res.json({ ping: 'pong' }));
try {
  const adminRoutes = require('./routes/admin');
  app.use('/admin', adminRoutes);
  console.log('Admin routes loaded');
} catch (err) {
  console.error('Failed to load admin routes:', err.message);
}
app.use('/dashboard', checkBilling);
app.use('/api', checkBilling);
const routes = require('./routes/index');
app.use('/api', routes);
app.use(express.static(path.join(__dirname, '../frontend/dist')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, '../frontend/dist/index.html')));
const PORT = process.env.PORT || 3000;
runMigrations().then(() => app.listen(PORT, () => console.log(`App running on port ${PORT}`)));
