import { assertSameOrigin, json, serverError } from "../_lib/http.js";
import { supabaseRequest } from "../_lib/supabase.js";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function onRequestPost({ request, env }) {
  const originError = assertSameOrigin(request);
  if (originError) return originError;
  if (Number(request.headers.get("content-length") || 0) > 2048) {
    return json({ error: "Signup request is too large." }, 413);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Enter a valid email address." }, 400);
  }
  if (!body || typeof body !== "object") {
    return json({ error: "Enter a valid email address." }, 400);
  }
  if (typeof body.company === "string" && body.company.trim()) {
    return json({ accepted: true });
  }
  if (body.consent !== true || typeof body.email !== "string") {
    return json({ error: "Email and consent are required." }, 400);
  }

  const email = body.email.trim().toLowerCase();
  if (email.length > 254 || !EMAIL.test(email)) {
    return json({ error: "Enter a valid email address." }, 400);
  }

  try {
    await supabaseRequest(env, "loyalty_signups?on_conflict=email", {
      method: "POST",
      headers: { prefer: "resolution=ignore-duplicates,return=minimal" },
      body: JSON.stringify({ email, consented_at: new Date().toISOString() })
    });
    return json({ accepted: true });
  } catch (error) {
    return serverError(error);
  }
}
