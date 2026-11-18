export async function supabaseRequest(env, path, options = {}) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    const error = new Error("Supabase is not configured.");
    error.status = 503;
    throw error;
  }

  const baseUrl = env.SUPABASE_URL.replace(/\/+$/, "");
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  const headers = {
    apikey: key,
    "content-type": "application/json",
    ...(key.startsWith("sb_secret_") ? {} : { authorization: `Bearer ${key}` }),
    ...options.headers
  };

  const response = await fetch(`${baseUrl}/rest/v1/${path}`, {
    ...options,
    headers
  });

  if (!response.ok) {
    const error = new Error(`Supabase returned HTTP ${response.status}.`);
    error.status = 502;
    throw error;
  }

  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

export function eventFromRow(row) {
  return {
    id: row.id,
    title: row.title,
    date: row.event_date,
    category: row.category,
    location: row.location,
    price: Number(row.price),
    image: row.image_url,
    description: row.description,
    artists: row.artists,
    raUrl: row.ra_url,
    instagramUrl: row.instagram_url,
    featured: row.featured,
    visible: row.visible,
    sortOrder: row.sort_order
  };
}

export function residentFromRow(row) {
  return {
    id: row.id,
    name: row.name,
    role: row.role,
    bio: row.bio,
    image: row.image_url,
    visible: row.visible,
    sortOrder: row.sort_order
  };
}

export function rowsToSettings(rows) {
  return Object.fromEntries(rows.map(row => [row.key, row.value]));
}
