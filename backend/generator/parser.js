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
      'backend/db/schema.sql',
      'backend/routes/index.js',
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

  // Enforce AgentWidget in every generated dashboard.
  const dashboard = files.find(f => f.path === 'frontend/src/pages/Dashboard.jsx');
  if (!dashboard) {
    errors.push('Missing required file frontend/src/pages/Dashboard.jsx');
    return errors;
  }

  const dashboardContent = dashboard.content || '';
  if (!/import\s*\{\s*[^}]*\buseRef\b[^}]*\}\s*from\s*['"]react['"]/.test(dashboardContent)) {
    errors.push('Dashboard.jsx must import useRef from react for AgentWidget');
  }
  if (!/import\s+axios\s+from\s+['"]axios['"]/.test(dashboardContent)) {
    errors.push('Dashboard.jsx must import axios for AgentWidget');
  }
  if (!dashboardContent.includes('function AgentWidget()')) {
    errors.push('Dashboard.jsx must define function AgentWidget()');
  }
  if (!dashboardContent.includes('<AgentWidget />')) {
    errors.push('Dashboard.jsx must render <AgentWidget />');
  }
  if (!dashboardContent.includes('/api/agent/chat')) {
    errors.push('Dashboard.jsx AgentWidget must call /api/agent/chat');
  }
  if (!dashboardContent.includes('/api/agent/upload')) {
    errors.push('Dashboard.jsx AgentWidget must call /api/agent/upload');
  }
  if (!dashboardContent.includes('/api/agent/restore-last')) {
    errors.push('Dashboard.jsx AgentWidget must call /api/agent/restore-last');
  }

  const requiredLegalFiles = [
    'frontend/src/pages/Terms.jsx',
    'frontend/src/pages/Privacy.jsx',
    'frontend/src/pages/Contact.jsx'
  ];
  for (const legalPath of requiredLegalFiles) {
    if (!files.some(f => f.path === legalPath)) {
      errors.push(`Missing required legal page ${legalPath}`);
    }
  }

  const appFile = files.find(f => f.path === 'frontend/src/App.jsx');
  if (!appFile) {
    errors.push('Missing required file frontend/src/App.jsx');
  } else {
    const appContent = appFile.content || '';
    if (!appContent.includes('/terms')) errors.push('App.jsx must include route for /terms');
    if (!appContent.includes('/privacy')) errors.push('App.jsx must include route for /privacy');
    if (!appContent.includes('/contact')) errors.push('App.jsx must include route for /contact');
  }

  const publicPage = files.find(f => f.path === 'frontend/src/pages/Public.jsx');
  if (publicPage) {
    const publicContent = publicPage.content || '';
    if (!publicContent.includes('/terms')) errors.push('Public.jsx footer must link to /terms');
    if (!publicContent.includes('/privacy')) errors.push('Public.jsx footer must link to /privacy');
    if (!publicContent.includes('/contact')) errors.push('Public.jsx footer must link to /contact');
  }

  const socialUrlPattern = /https?:\/\/(?:www\.)?(instagram\.com|facebook\.com|tiktok\.com|twitter\.com|x\.com)\//i;
  for (const file of files) {
    if (file.path.startsWith('frontend/')) {
      if (socialUrlPattern.test(file.content || '')) {
        errors.push(`Social links must default to "#" placeholders, found real social URL in ${file.path}`);
      }
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
