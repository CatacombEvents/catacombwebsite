import { json, serverError } from "../_lib/http.js";
import {
  eventFromRow,
  residentFromRow,
  rowsToSettings,
  supabaseRequest
} from "../_lib/supabase.js";

export async function onRequestGet({ env }) {
  try {
    const [events, residents, settings] = await Promise.all([
      supabaseRequest(env, "events?select=*&visible=eq.true&order=event_date.desc,sort_order.asc"),
      supabaseRequest(env, "residents?select=*&visible=eq.true&order=sort_order.asc"),
      supabaseRequest(env, "site_settings?select=key,value")
    ]);
    return json({
      events: events.map(eventFromRow),
      residents: residents.map(residentFromRow),
      settings: rowsToSettings(settings)
    }, 200, { "cache-control": "no-store" });
  } catch (error) {
    return serverError(error);
  }
}
