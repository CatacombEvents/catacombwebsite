import { requireAdmin } from "../../../_lib/auth.js";
import { assertSameOrigin, json, serverError } from "../../../_lib/http.js";
import { supabaseRequest } from "../../../_lib/supabase.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function onRequestDelete({ request, env, params }) {
  const originError = assertSameOrigin(request);
  if (originError) return originError;
  const authError = await requireAdmin(request, env);
  if (authError) return authError;
  if (!UUID.test(params.id)) return json({ error: "Subscriber ID is invalid." }, 400);

  try {
    await supabaseRequest(env, `loyalty_signups?id=eq.${encodeURIComponent(params.id)}`, {
      method: "DELETE",
      headers: { prefer: "return=minimal" }
    });
    return json({ deleted: true });
  } catch (error) {
    return serverError(error);
  }
}
