import { hasAdminSession } from "../../_lib/auth.js";
import { json } from "../../_lib/http.js";

export async function onRequestGet({ request, env }) {
  const authenticated = await hasAdminSession(request, env);
  return json({ authenticated }, authenticated ? 200 : 401);
}
