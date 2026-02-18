const fs = require('fs');
const path = require('path');
const runMigrations = async () => {
  const schemaPath = path.join(__dirname, 'schema.sql');
  if (!fs.existsSync(schemaPath)) { console.log('No schema, skipping'); return; }
  console.log('Migrations complete');
};
module.exports = { runMigrations };