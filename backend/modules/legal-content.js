const PAGE_KEYS = ['terms', 'privacy', 'contact'];

const DEFAULT_LEGAL_CONTENT = {
  terms: {
    title: 'Terms of Service',
    content: [
      'These terms explain how customers use your website and booking services.',
      'Replace this placeholder with your own legal language for cancellations, payments, and liability.',
      'Need help? Ask the site assistant to rewrite this page in your brand tone.'
    ].join('\n\n')
  },
  privacy: {
    title: 'Privacy Policy',
    content: [
      'This page describes what customer information is collected and how it is used.',
      'Replace this placeholder with your own data handling and retention policy.',
      'Need help? Ask the site assistant to rewrite this page to match your business.'
    ].join('\n\n')
  },
  contact: {
    title: 'Contact Us',
    content: [
      'Use this page to share how customers can contact your business.',
      'Replace this text with your preferred response times, support email, and phone details.',
      'Need help? Ask the site assistant to rewrite this page with your business voice.'
    ].join('\n\n')
  }
};

function normalizePageKey(pageKey) {
  const key = String(pageKey || '').trim().toLowerCase();
  return PAGE_KEYS.includes(key) ? key : null;
}

function getDefaultLegalPage(pageKey) {
  const key = normalizePageKey(pageKey);
  if (!key) return null;
  return { page_key: key, ...DEFAULT_LEGAL_CONTENT[key], updated_at: null };
}

async function getLegalPage(supabase, customerId, pageKey) {
  const key = normalizePageKey(pageKey);
  if (!key) return null;

  if (!customerId) return getDefaultLegalPage(key);

  const { data, error } = await supabase
    .from('legal_pages')
    .select('page_key, title, content, updated_at')
    .eq('customer_id', customerId)
    .eq('page_key', key)
    .maybeSingle();
  if (error) throw error;

  return data || getDefaultLegalPage(key);
}

async function listLegalPages(supabase, customerId) {
  const pages = [];
  for (const key of PAGE_KEYS) {
    pages.push(await getLegalPage(supabase, customerId, key));
  }
  return pages;
}

async function upsertLegalPage(supabase, customerId, pageKey, payload) {
  const key = normalizePageKey(pageKey);
  if (!key) throw new Error('Invalid legal page key');
  if (!customerId) throw new Error('No live customer selected');

  const title = String(payload?.title || '').trim();
  const content = String(payload?.content || '').trim();
  if (!title) throw new Error('Title is required');
  if (!content) throw new Error('Content is required');

  const { data, error } = await supabase
    .from('legal_pages')
    .upsert({
      customer_id: customerId,
      page_key: key,
      title,
      content,
      updated_at: new Date().toISOString()
    }, { onConflict: 'customer_id,page_key' })
    .select('page_key, title, content, updated_at')
    .single();

  if (error) throw error;
  return data;
}

module.exports = {
  PAGE_KEYS,
  DEFAULT_LEGAL_CONTENT,
  normalizePageKey,
  getDefaultLegalPage,
  getLegalPage,
  listLegalPages,
  upsertLegalPage
};
