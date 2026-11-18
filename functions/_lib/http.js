export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      ...headers
    }
  });
}

export function assertSameOrigin(request) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) {
    return json({ error: "Request origin was rejected." }, 403);
  }
  return null;
}

export function serverError(error) {
  console.error("Catacombs API request failed:", error);
  if (error?.status === 503) return json({ error: "The content service is not configured." }, 503);
  if (error?.status === 502) return json({ error: "The content service is unavailable." }, 502);
  return json({ error: "The request could not be completed." }, 500);
}

export async function readJson(request) {
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > 1_000_000) throw new Error("Request is too large.");

  try {
    return await request.json();
  } catch {
    throw new Error("Request body must be valid JSON.");
  }
}
