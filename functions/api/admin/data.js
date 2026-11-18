import { requireAdmin } from "../../_lib/auth.js";
import { assertSameOrigin, json, readJson, serverError } from "../../_lib/http.js";
import {
  eventFromRow,
  residentFromRow,
  rowsToSettings,
  supabaseRequest
} from "../../_lib/supabase.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function safeUrl(value, field, { required = false, ra = false, instagram = false } = {}) {
  if (value == null || value === "") {
    if (required) throw new Error(`${field} is required.`);
    return null;
  }
  if (typeof value !== "string" || value.length > 2048) throw new Error(`${field} is invalid.`);

  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${field} must be a complete HTTPS URL.`);
  }
  if (url.protocol !== "https:") throw new Error(`${field} must use HTTPS.`);
  if (ra && (url.hostname !== "ra.co" || !url.pathname.startsWith("/events/"))) {
    throw new Error(`${field} must be a Resident Advisor event URL.`);
  }
  if (instagram && !["instagram.com", "www.instagram.com"].includes(url.hostname)) {
    throw new Error(`${field} must be an Instagram URL.`);
  }
  return url.toString();
}

function text(value, field, max = 5000) {
  if (typeof value !== "string" || value.length > max) throw new Error(`${field} is invalid.`);
  return value.trim();
}

function validatePayload(payload) {
  if (!payload || !Array.isArray(payload.events) || !Array.isArray(payload.residents)) {
    throw new Error("Events and residents must be arrays.");
  }
  if (payload.events.length > 500 || payload.residents.length > 200) {
    throw new Error("The content list is too large.");
  }

  const events = payload.events.map((event, index) => {
    if (!event || !UUID.test(event.id)) throw new Error(`Event ${index + 1} needs a valid ID.`);
    const date = text(event.date, "Event date", 10);
    if (!DATE.test(date) || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) {
      throw new Error(`Event ${index + 1} needs a valid YYYY-MM-DD date.`);
    }
    const price = Number(event.price ?? 0);
    if (!Number.isFinite(price) || price < 0 || price > 100000) {
      throw new Error(`Event ${index + 1} has an invalid price.`);
    }
    const raUrl = safeUrl(event.raUrl, "Resident Advisor link", { ra: true });
    const instagramUrl = safeUrl(event.instagramUrl, "Instagram link", { instagram: true });
    if (!raUrl && !instagramUrl) {
      throw new Error(`Event ${index + 1} needs a Resident Advisor or Instagram link.`);
    }
    const title = text(event.title, "Event title", 200);
    if (!title) throw new Error(`Event ${index + 1} needs a title.`);
    return {
      id: event.id,
      title,
      date,
      category: text(event.category || "", "Event category", 120),
      location: text(event.location || "", "Event location", 240),
      price,
      image: safeUrl(event.image, "Event image"),
      description: text(event.description || "", "Event description"),
      artists: text(event.artists || "", "Event lineup", 1000),
      raUrl,
      instagramUrl,
      featured: event.featured === true,
      visible: event.visible !== false,
      sortOrder: Number.isInteger(event.sortOrder) ? event.sortOrder : 0
    };
  });

  const residents = payload.residents.map((resident, index) => {
    if (!resident || !UUID.test(resident.id)) throw new Error(`Resident ${index + 1} needs a valid ID.`);
    const name = text(resident.name, "Resident name", 160);
    if (!name) throw new Error(`Resident ${index + 1} needs a name.`);
    return {
      id: resident.id,
      name,
      role: text(resident.role || "", "Resident role", 160),
      bio: text(resident.bio || "", "Resident bio", 2000),
      image: safeUrl(resident.image, "Resident image"),
      visible: resident.visible !== false,
      sortOrder: Number.isInteger(resident.sortOrder) ? resident.sortOrder : 0
    };
  });

  const settings = payload.settings || {};
  return {
    events,
    residents,
    settings: {
      hero_image_url: safeUrl(settings.hero_image_url, "Hero image"),
      community_image_url: safeUrl(settings.community_image_url, "Community image")
    }
  };
}

async function getAllSignups(env) {
  const pageSize = 500;
  const signups = [];
  for (let offset = 0; offset <= 100000; offset += pageSize) {
    const page = await supabaseRequest(
      env,
      `loyalty_signups?select=id,email,consented_at,created_at&order=created_at.desc&limit=${pageSize}&offset=${offset}`
    );
    signups.push(...page);
    if (page.length < pageSize) return signups;
  }
  throw new Error("Email signup list exceeds the dashboard export limit.");
}

export async function onRequestGet({ request, env }) {
  const authError = await requireAdmin(request, env);
  if (authError) return authError;

  try {
    const [events, residents, settings, signups] = await Promise.all([
      supabaseRequest(env, "events?select=*&order=event_date.desc,sort_order.asc"),
      supabaseRequest(env, "residents?select=*&order=sort_order.asc"),
      supabaseRequest(env, "site_settings?select=key,value"),
      getAllSignups(env)
    ]);
    return json({
      events: events.map(eventFromRow),
      residents: residents.map(residentFromRow),
      settings: rowsToSettings(settings),
      signups
    });
  } catch (error) {
    return serverError(error);
  }
}

export async function onRequestPut({ request, env }) {
  const originError = assertSameOrigin(request);
  if (originError) return originError;
  const authError = await requireAdmin(request, env);
  if (authError) return authError;

  try {
    const payload = validatePayload(await readJson(request));
    await supabaseRequest(env, "rpc/replace_site_content", {
      method: "POST",
      body: JSON.stringify({ payload })
    });
    return json({ saved: true });
  } catch (error) {
    if (error?.status) return serverError(error);
    if (error instanceof Error && !error.message.startsWith("Supabase returned")) {
      return json({ error: error.message }, 400);
    }
    return serverError(error);
  }
}
