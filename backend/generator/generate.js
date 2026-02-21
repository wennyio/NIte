const fs = require('fs');
const path = require('path');
const { parseGeneratedOutput, validateFiles } = require('./parser');
const { createClient } = require('@supabase/supabase-js');

const SYSTEM_PROMPT = fs.readFileSync(
  path.join(__dirname, 'system-prompt.txt'),
  'utf8'
);

async function generateApp(businessContext, customerId) {
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  );

  console.log('Starting generation...');
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
      messages: [
        { role: 'user', content: prompt }
      ]
    })
  });

  const data = await response.json();
  if (data.error) {
    throw new Error(`Claude API error: ${data.error.message}`);
  }

  const rawOutput = data.content
    .map(block => block.text || '')
    .join('\n');

  console.log('Generation complete. Parsing...');
  const files = parseGeneratedOutput(rawOutput);
  console.log(`Parsed ${files.length} files`);

  const errors = validateFiles(files);
  if (errors.length > 0) {
    console.error('Validation failed:');
    errors.forEach(e => console.error(`  ✗ ${e}`));
    throw new Error('Generated code failed validation');
  }

  console.log('Validation passed ✓');

  // Delete old generated files for this customer
  if (customerId) {
    await supabase
      .from('generated_apps')
      .delete()
      .eq('customer_id', customerId);
  }

  // Save each file to Supabase
  const rows = files.map(f => ({
    customer_id: customerId || null,
    file_path: f.path,
    file_content: f.content
  }));

  const { error: insertError } = await supabase
    .from('generated_apps')
    .insert(rows);

  if (insertError) {
    throw new Error(`Failed to save generated files: ${insertError.message}`);
  }

  console.log(`Saved ${files.length} files to Supabase ✓`);
  return files;
}

module.exports = { generateApp };
