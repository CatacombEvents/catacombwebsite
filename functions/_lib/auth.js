import { assertSameOrigin, json } from "./http.js";

const COOKIE_NAME = "catacombs_admin";
const SESSION_SECONDS = 8 * 60 * 60;
const encoder = new TextEncoder();

function toBase64Url(bytes) {
  let binary = "";
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(value) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  return Uint8Array.from(atob(padded), character => character.charCodeAt(0));
}

async function hmacKey(secret) {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

async function codeMatches(code, expected) {
  const [submitted, configured] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(code)),
    crypto.subtle.digest("SHA-256", encoder.encode(expected))
  ]);
  const a = new Uint8Array(submitted);
  const b = new Uint8Array(configured);
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) difference |= a[index] ^ b[index];
  return difference === 0;
}

function sessionCookie(value, maxAge) {
  return `${COOKIE_NAME}=${value}; HttpOnly; Secure; SameSite=Strict; Path=/api/admin; Max-Age=${maxAge}`;
}

export async function login(request, env) {
  const originError = assertSameOrigin(request);
  if (originError) return originError;
  if (Number(request.headers.get("content-length") || 0) > 2048) {
    return json({ error: "Login request is too large." }, 413);
  }

  if (!env.ADMIN_ACCESS_CODE || env.ADMIN_ACCESS_CODE.length < 16
      || !env.ADMIN_SESSION_SECRET || encoder.encode(env.ADMIN_SESSION_SECRET).length < 32) {
    return json({ error: "Admin access is not configured." }, 503);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Enter the access code." }, 400);
  }

  const code = body && typeof body === "object" && typeof body.code === "string" ? body.code : "";
  if (!code || code.length > 256 || !(await codeMatches(code, env.ADMIN_ACCESS_CODE))) {
    return json({ error: "The access code is not valid." }, 401);
  }

  const payload = toBase64Url(encoder.encode(JSON.stringify({
    expiresAt: Date.now() + SESSION_SECONDS * 1000,
    nonce: crypto.randomUUID()
  })));
  const key = await hmacKey(env.ADMIN_SESSION_SECRET);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  const token = `${payload}.${toBase64Url(signature)}`;

  return json({ authenticated: true }, 200, {
    "set-cookie": sessionCookie(token, SESSION_SECONDS)
  });
}

export async function hasAdminSession(request, env) {
  if (!env.ADMIN_SESSION_SECRET) return false;

  const cookie = request.headers.get("cookie") || "";
  const token = cookie.split(";").map(value => value.trim())
    .find(value => value.startsWith(`${COOKIE_NAME}=`))
    ?.slice(COOKIE_NAME.length + 1);
  if (!token) return false;

  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra) return false;

  try {
    const key = await hmacKey(env.ADMIN_SESSION_SECRET);
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      fromBase64Url(signature),
      encoder.encode(payload)
    );
    if (!valid) return false;

    const session = JSON.parse(new TextDecoder().decode(fromBase64Url(payload)));
    return Number.isFinite(session.expiresAt) && session.expiresAt > Date.now();
  } catch {
    return false;
  }
}

export async function requireAdmin(request, env) {
  return await hasAdminSession(request, env)
    ? null
    : json({ error: "Sign in to continue." }, 401);
}

export function logout(request) {
  const originError = assertSameOrigin(request);
  if (originError) return originError;
  return json({ authenticated: false }, 200, {
    "set-cookie": sessionCookie("", 0)
  });
}
