# Catacombs website

The public site is `index.html`. The private content dashboard is served at `/admin/` by Cloudflare Pages Functions. Event, resident, background-image and email-signup data are stored in Supabase; the Supabase service-role key and admin access code must never be placed in HTML or committed to Git.

## One-time setup

1. Create a Supabase project and run [`supabase/schema.sql`](supabase/schema.sql) in its SQL Editor. The script creates the content tables, initial event/resident records and a public image bucket. The bucket contains website images only; uploads are restricted to authenticated admin requests by the Pages Function.
2. Connect this repository to Cloudflare Pages and deploy the repository root. Pages detects the `functions/` directory automatically. Add `catacombevents.com` as a custom domain in the Pages project and follow Cloudflare's DNS instructions.
3. In the Pages project's **Settings → Variables and Secrets**, add:
   - `SUPABASE_URL` — the Supabase project URL.
   - `SUPABASE_SERVICE_ROLE_KEY` — a **secret**, never a browser/anon key.
   - `ADMIN_ACCESS_CODE` — a **secret** containing a newly generated random code of at least 16 characters. Do not reuse the code shared in the conversation.
   - `ADMIN_SESSION_SECRET` — a **secret** with at least 32 random bytes, used to sign short-lived admin sessions.
   Set production secrets, then redeploy. If using branch previews, give them a separate test database and different admin/session secrets; do not expose production service-role credentials to preview branches.
4. Add Cloudflare rate-limiting rules before launch: a conservative starting point is 5 `POST /api/admin/login` attempts per IP per 15 minutes and 10 `POST /api/loyalty-signups` requests per IP per hour. The signup form also has a honeypot, but that is not a substitute for rate limiting. Choose an EU region for Supabase if appropriate for your data residency needs, and review the providers' data-processing terms. If rotating the access code after a leak, rotate `ADMIN_SESSION_SECRET` too to invalidate existing sessions.
5. Open `https://catacombevents.com/admin/`, sign in with the new access code, and manage content. The code is verified server-side and is not included in the repository.

The site signup collects explicit opt-ins and stores them in Supabase. The dashboard can export a CSV or remove an address; it does not send marketing emails. Connect an email-marketing provider before sending campaigns, and review `privacy.html` for the final data-controller, retention and mailing-process details before launch.

## Admin and API

- `GET /api/site-data` returns only visible public events, residents and image settings.
- `/api/admin/*` uses an HttpOnly, Secure, SameSite session cookie. Content writes and image uploads require that session and same-origin requests.
- `POST /api/loyalty-signups` accepts an email only with explicit consent; signup records are not publicly readable.
- Uploaded images must be JPG, PNG, WebP or AVIF and no larger than 5 MB.

The local `file://` browser preview does not run Cloudflare Functions. Until the Cloudflare secrets and Supabase schema are configured, the public page uses its embedded preview data and the admin API is unavailable.
