import { requireAdmin } from "../../_lib/auth.js";
import { assertSameOrigin, json, serverError } from "../../_lib/http.js";

const IMAGE_TYPES = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
  ["image/avif", "avif"]
]);
const MAX_FILE_SIZE = 5 * 1024 * 1024;

async function matchesImageType(file) {
  const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  if (file.type === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (file.type === "image/png") {
    return bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
      .every((byte, index) => bytes[index] === byte);
  }
  if (file.type === "image/webp") {
    return String.fromCharCode(...bytes.slice(0, 4)) === "RIFF"
      && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  }
  if (file.type === "image/avif") {
    return String.fromCharCode(...bytes.slice(4, 8)) === "ftyp"
      && ["avif", "avis"].includes(String.fromCharCode(...bytes.slice(8, 12)));
  }
  return false;
}

export async function onRequestPost({ request, env }) {
  const originError = assertSameOrigin(request);
  if (originError) return originError;
  const authError = await requireAdmin(request, env);
  if (authError) return authError;
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return json({ error: "The image store is not configured." }, 503);
  }

  try {
    const form = await request.formData();
    const file = form.get("image");
    if (!file || typeof file === "string" || !IMAGE_TYPES.has(file.type)) {
      return json({ error: "Choose a JPG, PNG, WebP or AVIF image." }, 400);
    }
    if (file.size < 1 || file.size > MAX_FILE_SIZE) {
      return json({ error: "Images must be smaller than 5 MB." }, 400);
    }
    if (!(await matchesImageType(file))) {
      return json({ error: "The uploaded file does not match its image type." }, 400);
    }

    const path = `${crypto.randomUUID()}.${IMAGE_TYPES.get(file.type)}`;
    const baseUrl = env.SUPABASE_URL.replace(/\/+$/, "");
    const response = await fetch(`${baseUrl}/storage/v1/object/catacombs-images/${path}`, {
      method: "POST",
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        "content-type": file.type,
        "x-upsert": "false"
      },
      body: file.stream()
    });
    if (!response.ok) throw new Error(`Supabase Storage returned HTTP ${response.status}.`);

    return json({
      url: `${baseUrl}/storage/v1/object/public/catacombs-images/${path}`
    });
  } catch (error) {
    return serverError(error);
  }
}
