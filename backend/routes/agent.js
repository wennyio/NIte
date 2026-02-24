const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { parseGeneratedOutput } = require('../generator/parser');
const { getSupabaseClient } = require('../modules/supabase');
const { getLiveAppFiles, getLatestLiveCustomer } = require('../modules/live-app');
const { upsertCatalogItemByName, deactivateCatalogItemByName } = require('../modules/catalog');
const { restoreCompiledFilesToDisk } = require('../modules/restore-generated');
const { FEATURE_MIN_TIER, getBillingSnapshot, evaluateFeatureAccess } = require('../modules/billing');
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

function getHostAndPort(rawHost) {
  const normalized = String(rawHost || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .split('/')[0];
  if (!normalized) return { host: '', port: '' };
  const [host, port] = normalized.split(':');
  return { host: host || '', port: port || '' };
}

function getPlatformHostInfo(req) {
  const configured = [
    process.env.PLATFORM_BASE_HOST,
    process.env.RAILWAY_PUBLIC_DOMAIN,
    process.env.RAILWAY_STATIC_URL
  ];
  for (const value of configured) {
    const parsed = getHostAndPort(value);
    if (parsed.host) {
      return { baseHost: parsed.host, localPort: '' };
    }
  }

  const forwarded = String(req.headers['x-forwarded-host'] || '').split(',')[0].trim();
  const hostHeader = forwarded || String(req.headers.host || '');
  const parsed = getHostAndPort(hostHeader);
  if (!parsed.host) return { baseHost: '', localPort: '' };

  if (parsed.host === 'localhost' || parsed.host.endsWith('.localhost')) {
    return {
      baseHost: 'localhost',
      localPort: parsed.port || String(req.headers['x-forwarded-port'] || '').trim() || '3000'
    };
  }

  const parts = parsed.host.split('.').filter(Boolean);
  if (parts.length >= 3) {
    return { baseHost: parts.slice(1).join('.'), localPort: '' };
  }
  return { baseHost: parsed.host, localPort: '' };
}

function resolveLiveBusinessUrl(req, customer) {
  const containerUrl = String(customer?.container_url || '').trim();
  if (containerUrl) {
    try {
      return new URL(containerUrl).origin;
    } catch {
      // Ignore invalid stored URL and continue fallback resolution.
    }
  }

  const subdomain = String(customer?.subdomain || '').trim().toLowerCase();
  if (!subdomain) return null;

  const { baseHost, localPort } = getPlatformHostInfo(req);
  if (!baseHost) return null;
  if (baseHost === 'localhost') {
    return `http://${subdomain}.localhost${localPort ? `:${localPort}` : ''}`;
  }
  return `https://${subdomain}.${baseHost}`;
}

function parseAgentResponse(rawResponse) {
  const raw = String(rawResponse || '');
  const fileMarker = '===FILE:';
  const firstFileIndex = raw.indexOf(fileMarker);
  let reply = firstFileIndex > -1
    ? raw.substring(0, firstFileIndex).trim()
    : raw.trim();
  reply = reply.replace(/===REBUILD===/g, '').trim();

  const filesChanged = [];
  const seen = new Set();
  const fileRegex = /===FILE:\s*(.+?)\s*===/g;
  let match;
  while ((match = fileRegex.exec(raw)) !== null) {
    const filePath = normalizePath(match[1]);
    if (!filePath || seen.has(filePath)) continue;
    seen.add(filePath);
    filesChanged.push(filePath);
  }

  if (!reply || reply.length < 10) {
    reply = filesChanged.length > 0
      ? 'Your site has been built! Keep chatting to make changes.'
      : 'Update complete. Keep chatting to make changes.';
  }

  return { reply, filesChanged };
}

function extractChangedPathsFromGeneratedFiles(files) {
  const paths = [];
  const seen = new Set();
  for (const file of Array.isArray(files) ? files : []) {
    const filePath = normalizePath(file?.path);
    if (!filePath || seen.has(filePath)) continue;
    seen.add(filePath);
    paths.push(filePath);
  }
  return paths;
}

function buildCustomerScopedQuery(query, customerId) {
  return customerId ? query.eq('customer_id', customerId) : query.is('customer_id', null);
}

async function listGeneratedRowsForCustomer(supabase, customerId) {
  const query = buildCustomerScopedQuery(
    supabase
      .from('generated_apps')
      .select('file_path, file_content, file_type')
      .in('file_type', ['source', 'compiled']),
    customerId
  );
  const { data, error } = await query;
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

function normalizeGeneratedRows(rows, customerId) {
  const normalized = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    const filePath = normalizePath(row.file_path);
    const fileType = row.file_type === 'compiled' ? 'compiled' : row.file_type === 'source' ? 'source' : null;
    if (!filePath || !fileType) continue;
    normalized.push({
      customer_id: customerId || null,
      file_path: filePath,
      file_content: String(row.file_content || ''),
      file_type: fileType
    });
  }
  return normalized;
}

async function replaceGeneratedRowsForCustomer(supabase, customerId, rows) {
  const deleteQuery = buildCustomerScopedQuery(supabase.from('generated_apps').delete(), customerId);
  const { error: deleteError } = await deleteQuery;
  if (deleteError) throw deleteError;

  const normalizedRows = normalizeGeneratedRows(rows, customerId);
  for (let i = 0; i < normalizedRows.length; i += 50) {
    const { error: insertError } = await supabase
      .from('generated_apps')
      .insert(normalizedRows.slice(i, i + 50));
    if (insertError) throw insertError;
  }
}

async function createRevisionSnapshot(supabase, customerId, summary) {
  const currentRows = await listGeneratedRowsForCustomer(supabase, customerId);
  const payload = normalizeGeneratedRows(currentRows, customerId).map((row) => ({
    file_path: row.file_path,
    file_content: row.file_content,
    file_type: row.file_type
  }));
  if (payload.length === 0) {
    return { saved: false, reason: 'empty-current-state' };
  }

  const latestQuery = buildCustomerScopedQuery(
    supabase
      .from('generated_app_revisions')
      .select('revision_number')
      .order('revision_number', { ascending: false })
      .limit(1),
    customerId
  );
  const latest = await latestQuery.maybeSingle();
  if (latest.error) throw latest.error;
  const nextRevision = Number(latest.data?.revision_number || 0) + 1;

  const insertPayload = {
    customer_id: customerId || null,
    revision_number: nextRevision,
    summary: String(summary || '').slice(0, 500),
    payload
  };
  const inserted = await supabase
    .from('generated_app_revisions')
    .insert(insertPayload)
    .select('id, revision_number')
    .single();
  if (inserted.error) throw inserted.error;

  return {
    saved: true,
    revisionId: inserted.data.id,
    revisionNumber: inserted.data.revision_number,
    files: payload.length
  };
}

async function getLatestRevisionSnapshot(supabase, customerId) {
  const query = buildCustomerScopedQuery(
    supabase
      .from('generated_app_revisions')
      .select('id, revision_number, summary, payload, created_at')
      .order('created_at', { ascending: false })
      .limit(1),
    customerId
  );
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data || null;
}

function restoreSourceFilesToDisk(rows) {
  let restoredCount = 0;
  let skippedCount = 0;

  for (const row of Array.isArray(rows) ? rows : []) {
    if (row.file_type !== 'source') continue;
    const normalizedPath = normalizePath(row.file_path);
    if (!normalizedPath.startsWith('frontend/src/') || LOCKED_FILES.includes(normalizedPath)) {
      skippedCount++;
      continue;
    }

    const fullPath = path.resolve(BASE_DIR, normalizedPath);
    if (!fullPath.startsWith(BASE_DIR + path.sep)) {
      skippedCount++;
      continue;
    }

    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, row.file_content || '', 'utf8');
    restoredCount++;
  }

  return { restoredCount, skippedCount };
}

function normalizeServiceName(name) {
  const cleaned = String(name || '')
    .replace(/\s+/g, ' ')
    .replace(/[.,;:!?]+$/g, '')
    .trim();
  return cleaned
    .split(' ')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function parseCatalogIntent(message) {
  const text = String(message || '').trim();
  if (!text) return null;

  const durationMatch = text.match(/(\d+)\s*(?:min|mins|minutes?)/i);
  const duration_minutes = durationMatch ? Number(durationMatch[1]) : undefined;
  const pricePatterns = [
    /(?:price\s+for|new)\s+([a-z][a-z\s&'/-]{2,60}?)\s+(?:is|to|at|for)\s*\$?\s*(\d{1,5}(?:\.\d{1,2})?)/i,
    /(?:add|create)\s+(?:new\s+)?([a-z][a-z\s&'/-]{2,60}?)\s+(?:service\s+)?(?:for|at|is)\s*\$?\s*(\d{1,5}(?:\.\d{1,2})?)/i,
    /(?:set|update|change)\s+(?:the\s+)?(?:price\s+for\s+)?([a-z][a-z\s&'/-]{2,60}?)\s+(?:to|at|is)\s*\$?\s*(\d{1,5}(?:\.\d{1,2})?)/i
  ];

  for (const pattern of pricePatterns) {
    const match = text.match(pattern);
    if (!match) continue;
    const name = normalizeServiceName(match[1]);
    const price = Number(match[2]);
    if (!name || !Number.isFinite(price)) continue;
    return {
      type: 'upsert',
      name,
      price,
      duration_minutes
    };
  }

  const removeMatch = text.match(/(?:remove|delete)\s+(?:the\s+)?service\s+([a-z][a-z\s&'/-]{2,60})/i);
  if (removeMatch) {
    const name = normalizeServiceName(removeMatch[1]);
    if (name) return { type: 'remove', name };
  }

  return null;
}

function hasVisualIntent(message, imageUrl) {
  if (imageUrl) return true;
  const visualPattern = /\b(hero|header|image|background|color|palette|layout|section|button|font|page|nav|footer|about|design|style|theme)\b/i;
  return visualPattern.test(String(message || ''));
}

async function executeCatalogIntent(supabase, intent) {
  if (!intent) return null;

  if (intent.type === 'upsert') {
    const result = await upsertCatalogItemByName(supabase, {
      name: intent.name,
      price: intent.price,
      duration_minutes: intent.duration_minutes || 60,
      is_active: true
    });
    return {
      summary: `Updated services data: ${result.action === 'created' ? 'added' : 'updated'} "${result.item.name}" at $${result.item.price}.`,
      details: result
    };
  }

  if (intent.type === 'remove') {
    const result = await deactivateCatalogItemByName(supabase, intent.name);
    if (!result.item) {
      return {
        summary: `I couldn't find a service named "${intent.name}" to remove.`,
        details: result
      };
    }
    return {
      summary: `Updated services data: removed "${result.item.name}" from active offerings.`,
      details: result
    };
  }

  return null;
}

// Read current source files from disk
function getCurrentFilesFromDisk() {
  const filePaths = [
    'frontend/src/pages/Public.jsx',
    'frontend/src/pages/Dashboard.jsx',
    'frontend/src/pages/Terms.jsx',
    'frontend/src/pages/Privacy.jsx',
    'frontend/src/pages/Contact.jsx',
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
      'frontend/src/pages/Terms.jsx',
      'frontend/src/pages/Privacy.jsx',
      'frontend/src/pages/Contact.jsx',
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

async function resolveAgentCustomer(req, supabase) {
  if (req.tenant?.id) return req.tenant;
  return getLatestLiveCustomer(supabase);
}

function sendAgentBillingError(res, access, snapshot) {
  const requiredTier = access.requiredTier || FEATURE_MIN_TIER['dashboard.agent'] || 'pro';
  const message = access.code === 'subscription_inactive'
    ? 'Subscription inactive.'
    : `This feature requires the ${requiredTier} plan.`;
  return res.status(402).json({
    error: message,
    code: access.code || 'plan_upgrade_required',
    feature: 'dashboard.agent',
    required_tier: requiredTier,
    current_tier: access.currentTier || snapshot.tier,
    subscription_status: access.status || snapshot.status,
    billing: {
      tier: snapshot.tier,
      status: snapshot.status,
      features: snapshot.features,
      requirements: FEATURE_MIN_TIER
    }
  });
}

router.use(async (req, res, next) => {
  try {
    const supabase = getSupabaseOrThrow();
    const customer = await resolveAgentCustomer(req, supabase);
    const snapshot = getBillingSnapshot({
      tier: customer?.tier,
      status: customer?.status
    });
    const access = evaluateFeatureAccess(
      { tier: snapshot.tier, status: snapshot.status },
      'dashboard.agent'
    );
    if (!access.allowed) {
      return sendAgentBillingError(res, access, snapshot);
    }
    req.agentBilling = { customer, snapshot };
    return next();
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

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

router.post('/restore-last', async (req, res) => {
  try {
    const supabase = getSupabaseOrThrow();
    const { targetCustomerId, liveCustomer } = await getCurrentFiles(supabase);
    const persistCustomerId = targetCustomerId || null;

    const snapshot = await getLatestRevisionSnapshot(supabase, persistCustomerId);
    if (!snapshot) {
      return res.status(404).json({ error: 'No restore snapshot available yet. Make one site update first.' });
    }

    const rows = normalizeGeneratedRows(snapshot.payload, persistCustomerId);
    if (rows.length === 0) {
      return res.status(400).json({ error: 'Latest snapshot is empty and cannot be restored.' });
    }

    const compiledRows = rows.filter((row) => row.file_type === 'compiled');
    if (compiledRows.length === 0) {
      return res.status(400).json({ error: 'Snapshot is missing compiled output and cannot be restored.' });
    }

    await replaceGeneratedRowsForCustomer(supabase, persistCustomerId, rows);
    const sourceStats = restoreSourceFilesToDisk(rows);
    const compiledStats = restoreCompiledFilesToDisk(compiledRows);

    return res.json({
      success: true,
      restored: true,
      restoredRevision: snapshot.revision_number,
      filesRestored: rows.length,
      sourceFilesRestored: sourceStats.restoredCount,
      compiledFilesRestored: compiledStats.restoredCount,
      liveBusiness: liveCustomer?.business_name || null,
      customerId: persistCustomerId
    });
  } catch (err) {
    console.error('Agent restore error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// Main agent chat endpoint
router.post('/chat', async (req, res) => {
  try {
    const { message, imageUrl, conversationHistory = [] } = req.body;
    if (!message) return res.status(400).json({ error: 'Message required' });

    const supabase = getSupabaseOrThrow();
    const catalogIntent = parseCatalogIntent(message);
    let catalogResult = null;
    if (catalogIntent) {
      try {
        catalogResult = await executeCatalogIntent(supabase, catalogIntent);
      } catch (err) {
        console.error('Catalog intent execution failed:', err.message);
      }
    }

    const { files: currentFiles, targetCustomerId, liveCustomer } = await getCurrentFiles(supabase);
    const contextCustomer = req.tenant?.id ? req.tenant : liveCustomer;
    const responseCustomerId = req.tenant?.id || targetCustomerId || liveCustomer?.id || null;
    const liveBusiness = resolveLiveBusinessUrl(req, contextCustomer);
    const liveBusinessName = contextCustomer?.business_name || liveCustomer?.business_name || 'Unknown business';

    if (catalogResult && !hasVisualIntent(message, imageUrl)) {
      return res.json({
        reply: `${catalogResult.summary} Refresh the page to see updated services and prices.`,
        rebuilt: false,
        filesChanged: [],
        liveBusiness,
        customerId: responseCustomerId
      });
    }

    const catalogPromptContext = catalogResult
      ? `\n\nCatalog data update already applied at DB level: ${catalogResult.summary}\nDo not fake service changes in fallback arrays. Keep frontend rendering from /api/services.\n`
      : '';

    const systemPrompt = `You are an AI assistant embedded in a business owner's website dashboard. You help them edit and improve their live website.

Current live business context: ${liveBusinessName}

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
- Keep legal pages available at /terms, /privacy, and /contact
- Social profile links must default to "#" unless the owner explicitly gives exact URLs
${catalogPromptContext}

Current website files:
${currentFiles.map(f => `\n--- ${f.path} ---\n${f.content}`).join('\n')}`;

    const userMessage = imageUrl
      ? `${message}\n\nImage URL to use: ${imageUrl}`
      : message;
    const safeConversationHistory = Array.isArray(conversationHistory) ? conversationHistory : [];

    const messages = [
      ...safeConversationHistory.slice(-10), // keep last 10 messages for context
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
    const parsedResponse = parseAgentResponse(rawOutput);
    const generatedFiles = parseGeneratedOutput(rawOutput);
    const generatedPaths = extractChangedPathsFromGeneratedFiles(generatedFiles);
    const filesChanged = generatedPaths.length > 0 ? generatedPaths : parsedResponse.filesChanged;
    const shouldRebuild = filesChanged.length > 0;

    if (shouldRebuild) {
      const persistCustomerId = responseCustomerId || null;
      try {
        await createRevisionSnapshot(
          supabase,
          persistCustomerId,
          `Before agent rebuild: ${String(message || '').slice(0, 220)}`
        );
      } catch (snapshotErr) {
        // Snapshot failure should not block a requested site update.
        console.error('Failed to capture restore snapshot:', snapshotErr.message);
      }

      // Parse and write changed files
      for (const file of generatedFiles) {
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
      const distDir = path.join(BASE_DIR, 'frontend/dist');
      const compiledRows = [];

      function readDist(dir) {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            readDist(fullPath);
          } else {
            const relativePath = normalizePath('frontend/dist' + fullPath.replace(distDir, ''));
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
        file_path: normalizePath(f.path),
        file_content: f.content,
        file_type: 'source'
      }));

      const allRows = [...sourceRows, ...compiledRows];
      await replaceGeneratedRowsForCustomer(supabase, persistCustomerId, allRows);

      const reply = catalogResult ? `${parsedResponse.reply}\n\n${catalogResult.summary}` : parsedResponse.reply;

      return res.json({
        reply,
        rebuilt: true,
        filesChanged,
        liveBusiness,
        customerId: persistCustomerId
      });
    }

    // Just a conversation response
    const reply = catalogResult ? `${parsedResponse.reply}\n\n${catalogResult.summary}` : parsedResponse.reply;
    return res.json({
      reply,
      rebuilt: false,
      filesChanged: [],
      liveBusiness,
      customerId: responseCustomerId
    });

  } catch (err) {
    console.error('Agent error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
