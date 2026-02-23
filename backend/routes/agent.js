const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { parseGeneratedOutput } = require('../generator/parser');
const { getSupabaseClient } = require('../modules/supabase');
const { getLiveAppFiles } = require('../modules/live-app');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const BASE_DIR = path.resolve(__dirname, '../../');

const LOCKED_FILES = [
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

function getSupabaseOrThrow() {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('Supabase is not configured');
  return supabase;
}

function normalizePath(filePath) {
  return String(filePath || '')
    .replace(/\\/g, '/')
    .replace(/^\.?\//, '');
}

// Read current source files from disk
function getCurrentFilesFromDisk() {
  const filePaths = [
    'frontend/src/pages/Public.jsx',
    'frontend/src/pages/Dashboard.jsx',
    'frontend/src/App.jsx',
  ];
  const files = [];
  for (const p of filePaths) {
    const fullPath = path.join(BASE_DIR, p);
    if (fs.existsSync(fullPath)) {
      files.push({ path: p, content: fs.readFileSync(fullPath, 'utf8') });
    }
  }
  // Also grab any generated components
  const componentsDir = path.join(BASE_DIR, 'frontend/src/components');
  if (fs.existsSync(componentsDir)) {
    const entries = fs.readdirSync(componentsDir);
    for (const entry of entries) {
      const fullPath = path.join(componentsDir, entry);
      if (fs.statSync(fullPath).isFile()) {
        files.push({ path: `frontend/src/components/${entry}`, content: fs.readFileSync(fullPath, 'utf8') });
      }
    }
  }
  return files;
}

async function getCurrentFiles(supabase) {
  let fallbackTargetCustomerId = null;
  let fallbackLiveCustomer = null;
  try {
    const { files: sourceFiles, customerId, liveCustomer } = await getLiveAppFiles(
      supabase,
      ['source'],
      { allowGlobalFallback: false }
    );
    fallbackTargetCustomerId = customerId || null;
    fallbackLiveCustomer = liveCustomer || null;
    const importantPaths = new Set([
      'frontend/src/pages/Public.jsx',
      'frontend/src/pages/Dashboard.jsx',
      'frontend/src/App.jsx',
    ]);
    const files = [];
    for (const row of Array.isArray(sourceFiles) ? sourceFiles : []) {
      const normalizedPath = normalizePath(row.file_path);
      if (!normalizedPath) continue;
      if (importantPaths.has(normalizedPath) || normalizedPath.startsWith('frontend/src/components/')) {
        files.push({ path: normalizedPath, content: row.file_content || '' });
      }
    }
    if (files.length > 0) {
      return { files, targetCustomerId: customerId, liveCustomer };
    }
  } catch (err) {
    console.error('Failed to load source from Supabase for agent:', err.message);
  }

  return {
    files: getCurrentFilesFromDisk(),
    targetCustomerId: fallbackTargetCustomerId,
    liveCustomer: fallbackLiveCustomer
  };
}

// Upload image to Supabase Storage
router.post('/upload', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file provided' });

    const supabase = getSupabaseOrThrow();
    const ext = req.file.originalname.split('.').pop();
    const filename = `agent-uploads/${Date.now()}.${ext}`;

    const { data, error } = await supabase.storage
      .from('site-assets')
      .upload(filename, req.file.buffer, {
        contentType: req.file.mimetype,
        upsert: true
      });

    if (error) throw error;

    const { data: urlData } = supabase.storage.from('site-assets').getPublicUrl(filename);
    res.json({ url: urlData.publicUrl });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Main agent chat endpoint
router.post('/chat', async (req, res) => {
  try {
    const { message, imageUrl, conversationHistory = [] } = req.body;
    if (!message) return res.status(400).json({ error: 'Message required' });

    const supabase = getSupabaseOrThrow();
    const { files: currentFiles, targetCustomerId, liveCustomer } = await getCurrentFiles(supabase);
    const liveBusiness = liveCustomer?.business_name || 'Unknown business';

    const systemPrompt = `You are an AI assistant embedded in a business owner's website dashboard. You help them edit and improve their live website.

Current live business context: ${liveBusiness}

You have access to the current source files of their website. When the owner asks you to make a change, you can either:
1. RESPOND with helpful advice or answer their question (most messages)
2. EDIT FILES when they ask to change something on their site

When editing files, output ONLY the files that need to change using this exact format:
===FILE: [path/to/file]===
[complete file contents]
===END FILE===

Rules for editing:
- Only output files that actually changed
- Always output the COMPLETE file contents, never partial
- Never modify locked files: ${LOCKED_FILES.join(', ')}
- If adding an image URL, use it exactly as provided
- Make changes precisely — don't redesign everything when asked for a small change
- After listing changed files, add a line: ===REBUILD===  (only when files were changed)
- If just answering a question or chatting, do NOT output any FILE blocks

Current website files:
${currentFiles.map(f => `\n--- ${f.path} ---\n${f.content}`).join('\n')}`;

    const userMessage = imageUrl
      ? `${message}\n\nImage URL to use: ${imageUrl}`
      : message;

    const messages = [
      ...conversationHistory.slice(-10), // keep last 10 messages for context
      { role: 'user', content: userMessage }
    ];

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
        system: systemPrompt,
        messages
      })
    });

    const data = await response.json();
    if (data.error) throw new Error(data.error.message);

    const rawOutput = data.content.map(b => b.text || '').join('\n');
    const shouldRebuild = rawOutput.includes('===REBUILD===');

    if (shouldRebuild) {
      // Parse and write changed files
      const files = parseGeneratedOutput(rawOutput);

      for (const file of files) {
        const normalizedPath = normalizePath(file.path);
        if (!normalizedPath || LOCKED_FILES.includes(normalizedPath)) continue;
        const fullPath = path.resolve(BASE_DIR, normalizedPath);
        if (!fullPath.startsWith(BASE_DIR + path.sep)) continue;
        const dir = path.dirname(fullPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(fullPath, file.content, 'utf8');
      }

      // Rebuild frontend
      execSync('npm run build --prefix frontend -- --outDir dist', { cwd: BASE_DIR, stdio: 'inherit' });

      // Persist updates for the active live app context
      const persistCustomerId = targetCustomerId || null;
      const distDir = path.join(BASE_DIR, 'frontend/dist');
      const compiledRows = [];

      function readDist(dir) {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            readDist(fullPath);
          } else {
            const relativePath = 'frontend/dist' + fullPath.replace(distDir, '');
            try {
              compiledRows.push({
                customer_id: persistCustomerId,
                file_path: relativePath,
                file_content: fs.readFileSync(fullPath, 'utf8'),
                file_type: 'compiled'
              });
            } catch (e) { }
          }
        }
      }

      readDist(distDir);

      // Capture a full source snapshot so context stays consistent on next chat.
      const sourceRows = getCurrentFilesFromDisk().map((f) => ({
        customer_id: persistCustomerId,
        file_path: f.path,
        file_content: f.content,
        file_type: 'source'
      }));

      if (persistCustomerId) {
        await supabase.from('generated_apps').delete().eq('customer_id', persistCustomerId);
      } else {
        await supabase.from('generated_apps').delete().is('customer_id', null);
      }

      const allRows = [...sourceRows, ...compiledRows];
      for (let i = 0; i < allRows.length; i += 50) {
        await supabase.from('generated_apps').insert(allRows.slice(i, i + 50));
      }

      // Clean response text (remove file blocks)
      const cleanResponse = rawOutput
        .replace(/===FILE:[\s\S]*?===END FILE===/g, '')
        .replace(/===REBUILD===/g, '')
        .trim() || "Done! Your site has been updated. Refresh to see the changes.";

      return res.json({
        reply: cleanResponse,
        rebuilt: true,
        filesChanged: files.length,
        liveBusiness,
        customerId: persistCustomerId
      });
    }

    // Just a conversation response
    const cleanResponse = rawOutput.trim();
    res.json({
      reply: cleanResponse,
      rebuilt: false,
      liveBusiness,
      customerId: targetCustomerId || null
    });

  } catch (err) {
    console.error('Agent error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
