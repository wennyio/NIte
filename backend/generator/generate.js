const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { parseGeneratedOutput, validateFiles } = require('./parser');
const { createClient } = require('@supabase/supabase-js');

const SYSTEM_PROMPT = fs.readFileSync(
  path.join(__dirname, 'system-prompt.txt'),
  'utf8'
);

const BASE_DIR = path.join(__dirname, '../../');

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

async function generateApp(businessContext, customerId) {
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  );

  console.log('Starting generation for:', businessContext.business_name);

  const prompt = SYSTEM_PROMPT.replace(
    '{{BUSINESS_CONTEXT}}',
    JSON.stringify(businessContext, null, 2)
  );

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.CLAUDE_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 16000,
      messages: [{ role: 'user', content: prompt }]
    })
  });

  const data = await response.json();
  if (data.error) throw new Error(`Claude API error: ${data.error.message}`);

  const rawOutput = data.content.map(block => block.text || '').join('\n');
  console.log('Generation complete. Parsing...');

  const files = parseGeneratedOutput(rawOutput);
  console.log(`Parsed ${files.length} files`);

  const errors = validateFiles(files);
  if (errors.length > 0) {
    errors.forEach(e => console.error(`  ✗ ${e}`));
    throw new Error('Generated code failed validation');
  }
  console.log('Validation passed ✓');

  // Write source files to disk
  for (const file of files) {
    if (LOCKED_FILES.includes(file.path)) continue;
    const fullPath = path.join(BASE_DIR, file.path);
    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(fullPath, file.content, 'utf8');
  }
  console.log('Source files written to disk ✓');

  // Run Vite build
  console.log('Building frontend...');
  execSync('npm run build --prefix frontend', {
    cwd: BASE_DIR,
    stdio: 'inherit'
  });
  console.log('Frontend built ✓');

  // Delete old files for this customer
  if (customerId) {
    await supabase.from('generated_apps').delete().eq('customer_id', customerId);
  } else {
    await supabase.from('generated_apps').delete().is('customer_id', null);
  }

  // Save source files to Supabase
  const sourceRows = files
    .filter(f => !LOCKED_FILES.includes(f.path))
    .map(f => ({
      customer_id: customerId || null,
      file_path: f.path,
      file_content: f.content,
      file_type: 'source'
    }));

  // Save compiled dist files to Supabase
  const distDir = path.join(BASE_DIR, 'frontend/dist');
  const compiledRows = [];

  function readDistDir(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        readDistDir(fullPath);
      } else {
        const relativePath = 'frontend/dist' + fullPath.replace(distDir, '');
        try {
          const content = fs.readFileSync(fullPath, 'utf8');
          compiledRows.push({
            customer_id: customerId || null,
            file_path: relativePath,
            file_content: content,
            file_type: 'compiled'
          });
        } catch (e) {
          console.log(`Skipping binary file: ${relativePath}`);
        }
      }
    }
  }

  readDistDir(distDir);

  // Insert all rows in batches of 50
  const allRows = [...sourceRows, ...compiledRows];
  for (let i = 0; i < allRows.length; i += 50) {
    const batch = allRows.slice(i, i + 50);
    const { error } = await supabase.from('generated_apps').insert(batch);
    if (error) throw new Error(`Failed to save batch to Supabase: ${error.message}`);
  }

  console.log(`Saved ${sourceRows.length} source + ${compiledRows.length} compiled files to Supabase ✓`);
  return files;
}

module.exports = { generateApp };
