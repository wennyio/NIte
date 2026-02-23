function isMissingTableError(error) {
  const message = String(error?.message || '');
  return message.includes('Could not find the table') || message.includes('does not exist');
}

function normalizeCatalogItem(item = {}) {
  return {
    ...item,
    name: item.name || item.title || 'Service',
    price: Number(item.price || item.amount || 0),
    duration_minutes: item.duration_minutes || item.duration || 30,
    description: item.description || item.summary || '',
    is_active: item.is_active !== false,
    featured: Boolean(item.featured)
  };
}

async function resolveCatalogTable(supabase) {
  const servicesProbe = await supabase
    .from('services')
    .select('id', { head: true, count: 'exact' })
    .limit(1);
  if (!servicesProbe.error) return 'services';
  if (!isMissingTableError(servicesProbe.error)) throw servicesProbe.error;

  const productsProbe = await supabase
    .from('products')
    .select('id', { head: true, count: 'exact' })
    .limit(1);
  if (!productsProbe.error) return 'products';
  if (!isMissingTableError(productsProbe.error)) throw productsProbe.error;

  throw new Error('No catalog table found (services/products)');
}

async function listCatalog(supabase, options = {}) {
  const { activeOnly = false } = options;
  const table = await resolveCatalogTable(supabase);
  let query = supabase.from(table).select('*').order('price', { ascending: true });
  if (activeOnly) query = query.eq('is_active', true);
  const { data, error } = await query;
  if (error) throw error;
  return {
    table,
    items: (Array.isArray(data) ? data : []).map(normalizeCatalogItem)
  };
}

async function createCatalogItem(supabase, payload) {
  const table = await resolveCatalogTable(supabase);
  const base = {
    name: String(payload.name || '').trim(),
    price: Number(payload.price || 0),
    is_active: payload.is_active !== false
  };
  if (payload.description !== undefined) base.description = payload.description;
  if (payload.duration_minutes !== undefined) base.duration_minutes = Number(payload.duration_minutes);
  if (payload.featured !== undefined) base.featured = Boolean(payload.featured);

  let inserted = await supabase.from(table).insert(base).select('*').single();
  if (inserted.error) {
    // Compatibility fallback for schemas without extra columns.
    const minimal = { name: base.name, price: base.price, is_active: base.is_active };
    inserted = await supabase.from(table).insert(minimal).select('*').single();
  }
  if (inserted.error) throw inserted.error;
  return { table, item: normalizeCatalogItem(inserted.data) };
}

async function updateCatalogItem(supabase, id, patch) {
  const table = await resolveCatalogTable(supabase);
  const update = {};
  if (patch.name !== undefined) update.name = String(patch.name).trim();
  if (patch.price !== undefined) update.price = Number(patch.price);
  if (patch.description !== undefined) update.description = patch.description;
  if (patch.duration_minutes !== undefined) update.duration_minutes = Number(patch.duration_minutes);
  if (patch.featured !== undefined) update.featured = Boolean(patch.featured);
  if (patch.is_active !== undefined) update.is_active = Boolean(patch.is_active);

  let result = await supabase.from(table).update(update).eq('id', id).select('*').single();
  if (result.error) {
    const minimal = {};
    if (update.name !== undefined) minimal.name = update.name;
    if (update.price !== undefined) minimal.price = update.price;
    if (update.is_active !== undefined) minimal.is_active = update.is_active;
    result = await supabase.from(table).update(minimal).eq('id', id).select('*').single();
  }
  if (result.error) throw result.error;
  return { table, item: normalizeCatalogItem(result.data) };
}

async function findCatalogItemByName(supabase, serviceName) {
  const table = await resolveCatalogTable(supabase);
  const name = String(serviceName || '').trim();
  const exact = await supabase
    .from(table)
    .select('*')
    .ilike('name', name)
    .limit(1);
  if (exact.error) throw exact.error;
  if (Array.isArray(exact.data) && exact.data[0]) {
    return { table, item: normalizeCatalogItem(exact.data[0]) };
  }

  const fuzzy = await supabase
    .from(table)
    .select('*')
    .ilike('name', `%${name}%`)
    .limit(1);
  if (fuzzy.error) throw fuzzy.error;
  return {
    table,
    item: Array.isArray(fuzzy.data) && fuzzy.data[0] ? normalizeCatalogItem(fuzzy.data[0]) : null
  };
}

async function upsertCatalogItemByName(supabase, payload) {
  const { item } = await findCatalogItemByName(supabase, payload.name);
  if (item) {
    const updated = await updateCatalogItem(supabase, item.id, payload);
    return { action: 'updated', ...updated };
  }
  const created = await createCatalogItem(supabase, payload);
  return { action: 'created', ...created };
}

async function deactivateCatalogItem(supabase, id) {
  const table = await resolveCatalogTable(supabase);
  let result = await supabase
    .from(table)
    .update({ is_active: false })
    .eq('id', id)
    .select('*')
    .single();

  if (result.error) {
    const deleted = await supabase.from(table).delete().eq('id', id).select('*').single();
    if (deleted.error) throw deleted.error;
    return { table, item: normalizeCatalogItem(deleted.data), mode: 'deleted' };
  }

  return { table, item: normalizeCatalogItem(result.data), mode: 'deactivated' };
}

async function deactivateCatalogItemByName(supabase, name) {
  const found = await findCatalogItemByName(supabase, name);
  if (!found.item) return { ...found, item: null, mode: 'missing' };
  const result = await deactivateCatalogItem(supabase, found.item.id);
  return result;
}

module.exports = {
  isMissingTableError,
  normalizeCatalogItem,
  resolveCatalogTable,
  listCatalog,
  createCatalogItem,
  updateCatalogItem,
  findCatalogItemByName,
  upsertCatalogItemByName,
  deactivateCatalogItem,
  deactivateCatalogItemByName
};
