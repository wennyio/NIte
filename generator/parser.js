const fs = require('fs');
const path = require('path');

function parseGeneratedOutput(rawOutput) {
  const files = [];
  const regex = /===FILE:\s*(.+?)===\s*\n([\s\S]*?)===END FILE===/g;
  let match;

  while ((match = regex.exec(rawOutput)) !== null) {
    files.push({
      path: match[1].trim(),
      content: match[2].trim()
    });
  }

  return files;
}

function writeFiles(files, baseDir) {
  const results = [];

  for (const file of files) {
    const fullPath = path.join(baseDir, file.path);
    const dir = path.dirname(fullPath);

    // Create directory if it doesn't exist
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Safety check — never overwrite locked files
    const lockedFiles = [
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

    if (lockedFiles.includes(file.path)) {
      results.push({ path: file.path, status: 'SKIPPED — locked file' });
      continue;
    }

    fs.writeFileSync(fullPath, file.content, 'utf8');
    results.push({ path: file.path, status: 'WRITTEN' });
  }

  return results;
}

function validateFiles(files) {
  const errors = [];
  const approvedPackages = [
    'react', 'react-dom', 'react-router-dom', 'axios',
    'express', '@supabase/supabase-js', 'jsonwebtoken', 'stripe'
  ];

  for (const file of files) {
    // Check for unauthorized imports
    const importMatches = file.content.match(/require\(['"](.+?)['"]\)|from ['"](.+?)['"]/g) || [];

    for (const imp of importMatches) {
      const pkg = imp.match(/['"](.+?)['"]/)?.[1];
      if (!pkg) continue;

      // Skip relative imports
      if (pkg.startsWith('.') || pkg.startsWith('/')) continue;

      // Skip built-in Node modules
      const builtins = ['fs', 'path', 'crypto', 'http', 'https'];
      if (builtins.includes(pkg)) continue;

      // Check against approved list
      if (!approvedPackages.some(ap => pkg === ap || pkg.startsWith(ap + '/'))) {
        errors.push(`Unauthorized package "${pkg}" in ${file.path}`);
      }
    }

    // Check for raw SQL in frontend files
    if (file.path.startsWith('frontend/') && file.content.includes('supabase')) {
      errors.push(`Direct Supabase access in frontend file ${file.path} — must use /api routes`);
    }
  }

  return errors;
}

module.exports = { parseGeneratedOutput, writeFiles, validateFiles };

// CLI usage: node parser.js <input-file> <output-dir>
if (require.main === module) {
  const inputFile = process.argv[2];
  const outputDir = process.argv[3] || '.';

  if (!inputFile) {
    console.error('Usage: node parser.js <input-file> [output-dir]');
    process.exit(1);
  }

  const raw = fs.readFileSync(inputFile, 'utf8');
  const files = parseGeneratedOutput(raw);

  console.log(`Parsed ${files.length} files`);

  // Validate
  const errors = validateFiles(files);
  if (errors.length > 0) {
    console.error('Validation errors:');
    errors.forEach(e => console.error(`  ✗ ${e}`));
    process.exit(1);
  }

  console.log('Validation passed ✓');

  // Write
  const results = writeFiles(files, outputDir);
  results.forEach(r => console.log(`  ${r.status}: ${r.path}`));
  console.log('Done ✓');
}
