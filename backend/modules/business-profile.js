const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

const DEFAULT_HOURS = {
  mon: '9:00 AM - 5:00 PM',
  tue: '9:00 AM - 5:00 PM',
  wed: '9:00 AM - 5:00 PM',
  thu: '9:00 AM - 5:00 PM',
  fri: '9:00 AM - 5:00 PM',
  sat: '10:00 AM - 4:00 PM',
  sun: 'Closed'
};

function sanitizeText(value, fallback = '') {
  const next = String(value ?? '').trim();
  return next || fallback;
}

function sanitizeUrl(value) {
  const next = String(value ?? '').trim();
  if (!next) return '';
  if (/^https?:\/\//i.test(next)) return next;
  return '';
}

function sanitizeSocialUrl(value) {
  const next = String(value ?? '').trim();
  if (!next || next === '#') return '#';
  if (/^https?:\/\//i.test(next)) return next;
  return '#';
}

function normalizeHours(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const normalized = {};
  for (const day of DAYS) {
    normalized[day] = sanitizeText(source[day], DEFAULT_HOURS[day]);
  }
  return normalized;
}

function getDefaultBusinessProfile(customer = null) {
  return {
    customer_id: customer?.id || null,
    display_name: sanitizeText(customer?.business_name, 'Your Business'),
    tagline: 'Premium service with personalized care.',
    about_text: 'Tell customers what makes your business special and why they should book with you.',
    logo_url: '',
    contact_email: sanitizeText(customer?.owner_email, ''),
    contact_phone: '',
    contact_address: '',
    website_url: '',
    social_instagram: '#',
    social_facebook: '#',
    social_tiktok: '#',
    social_twitter: '#',
    booking_confirmation_enabled: true,
    hours_json: { ...DEFAULT_HOURS },
    updated_at: null
  };
}

function mergeProfileWithDefaults(defaults, row) {
  const source = row && typeof row === 'object' ? row : {};
  return {
    ...defaults,
    ...source,
    display_name: sanitizeText(source.display_name, defaults.display_name),
    tagline: sanitizeText(source.tagline, defaults.tagline),
    about_text: sanitizeText(source.about_text, defaults.about_text),
    logo_url: sanitizeUrl(source.logo_url),
    contact_email: sanitizeText(source.contact_email, defaults.contact_email),
    contact_phone: sanitizeText(source.contact_phone, defaults.contact_phone),
    contact_address: sanitizeText(source.contact_address, defaults.contact_address),
    website_url: sanitizeUrl(source.website_url),
    social_instagram: sanitizeSocialUrl(source.social_instagram),
    social_facebook: sanitizeSocialUrl(source.social_facebook),
    social_tiktok: sanitizeSocialUrl(source.social_tiktok),
    social_twitter: sanitizeSocialUrl(source.social_twitter),
    booking_confirmation_enabled: source.booking_confirmation_enabled !== false,
    hours_json: normalizeHours(source.hours_json)
  };
}

async function getBusinessProfile(supabase, customer = null) {
  const defaults = getDefaultBusinessProfile(customer);
  if (!customer?.id) return defaults;

  const { data, error } = await supabase
    .from('business_profiles')
    .select(`
      customer_id,
      display_name,
      tagline,
      about_text,
      logo_url,
      contact_email,
      contact_phone,
      contact_address,
      website_url,
      social_instagram,
      social_facebook,
      social_tiktok,
      social_twitter,
      booking_confirmation_enabled,
      hours_json,
      updated_at
    `)
    .eq('customer_id', customer.id)
    .maybeSingle();
  if (error) throw error;

  return mergeProfileWithDefaults(defaults, data);
}

async function upsertBusinessProfile(supabase, customer, payload = {}) {
  if (!customer?.id) throw new Error('No live customer selected');
  const current = await getBusinessProfile(supabase, customer);
  const incoming = payload && typeof payload === 'object' ? payload : {};

  const merged = mergeProfileWithDefaults(current, {
    ...current,
    display_name: incoming.display_name ?? current.display_name,
    tagline: incoming.tagline ?? current.tagline,
    about_text: incoming.about_text ?? current.about_text,
    logo_url: incoming.logo_url ?? current.logo_url,
    contact_email: incoming.contact_email ?? current.contact_email,
    contact_phone: incoming.contact_phone ?? current.contact_phone,
    contact_address: incoming.contact_address ?? current.contact_address,
    website_url: incoming.website_url ?? current.website_url,
    social_instagram: incoming.social_instagram ?? current.social_instagram,
    social_facebook: incoming.social_facebook ?? current.social_facebook,
    social_tiktok: incoming.social_tiktok ?? current.social_tiktok,
    social_twitter: incoming.social_twitter ?? current.social_twitter,
    booking_confirmation_enabled: incoming.booking_confirmation_enabled ?? current.booking_confirmation_enabled,
    hours_json: incoming.hours_json ?? current.hours_json
  });

  const upsertPayload = {
    customer_id: customer.id,
    display_name: merged.display_name,
    tagline: merged.tagline,
    about_text: merged.about_text,
    logo_url: merged.logo_url,
    contact_email: merged.contact_email,
    contact_phone: merged.contact_phone,
    contact_address: merged.contact_address,
    website_url: merged.website_url,
    social_instagram: merged.social_instagram,
    social_facebook: merged.social_facebook,
    social_tiktok: merged.social_tiktok,
    social_twitter: merged.social_twitter,
    booking_confirmation_enabled: merged.booking_confirmation_enabled,
    hours_json: merged.hours_json,
    updated_at: new Date().toISOString()
  };

  const { data, error } = await supabase
    .from('business_profiles')
    .upsert(upsertPayload, { onConflict: 'customer_id' })
    .select(`
      customer_id,
      display_name,
      tagline,
      about_text,
      logo_url,
      contact_email,
      contact_phone,
      contact_address,
      website_url,
      social_instagram,
      social_facebook,
      social_tiktok,
      social_twitter,
      booking_confirmation_enabled,
      hours_json,
      updated_at
    `)
    .single();
  if (error) throw error;

  return mergeProfileWithDefaults(getDefaultBusinessProfile(customer), data);
}

module.exports = {
  DAYS,
  DEFAULT_HOURS,
  getDefaultBusinessProfile,
  getBusinessProfile,
  upsertBusinessProfile,
  normalizeHours
};
