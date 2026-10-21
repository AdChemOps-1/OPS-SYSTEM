// POST /api/expiry {send:true} — the expiring-documents email (functions/_lib/expiry.js).
// Two callers: the daily pg_cron job (header x-expiry-secret = EXPIRY_SECRET; every active company, as the service role) and a
// super admin pressing Send expiry email now on Setup → Warnings (their company only, as themselves; RLS applies).
// The cron path answers 202 at once and sends under waitUntil, so pg_net's request never waits on Gmail; each sent email leaves an
// expiry_email row in dispatch_log, which Health reports as the last run. Send now stays synchronous so the result shows on Setup.
import { requireUser, sb, sbService, json, fail, handle, companyFrom, companyContext } from "../_lib/auth.js";
import { sendExpiryEmails, todayIn } from "../_lib/expiry.js";

// constant-time: compare SHA-256 digests (always 32 bytes), never the strings themselves
async function sameSecret(a, b) {
  const enc = new TextEncoder();
  const [x, y] = await Promise.all([a, b].map(s => crypto.subtle.digest("SHA-256", enc.encode(s))));
  const u = new Uint8Array(x), v = new Uint8Array(y);
  let d = 0; for (let i = 0; i < u.length; i++) d |= u[i] ^ v[i];
  return d === 0;
}

export async function onRequestPost(context) {
  const { request, env } = context;
  return handle(async () => {
    const body = await request.json().catch(() => ({}));
    if (!body || body.send !== true) return fail("Nothing to do: send {send:true}.", 400, "bad_request");
    const today = todayIn("America/Los_Angeles");
    const header = request.headers.get("x-expiry-secret");
    if (header !== null) {
      // the cron path; a missing EXPIRY_SECRET disables it (an empty header never matches)
      const secret = env.EXPIRY_SECRET || "";
      if (!secret || !header || !(await sameSecret(header, secret))) return fail("Not allowed.", 403, "forbidden");
      const work = sendExpiryEmails(env, sbService(env), { company: null, who: null, today, appUrl: env.APP_URL || "" })
        .then(r => { r.skipped.filter(s => s.reason === "send_failed").forEach(s => console.error("expiry email " + s.company + ": " + s.message)); },
              e => { console.error("expiry email: " + String((e && e.message) || e)); });
      if (typeof context.waitUntil === "function") context.waitUntil(work); else await work;   // no waitUntil outside the Pages runtime
      return json({ ok: true, accepted: true }, 202);
    }
    const { user, me, token, company } = await requireUser(request, env, null, companyFrom(request, body));
    if (!me.isSuper) return fail("Only a super admin can send the expiry email.", 403, "forbidden");
    const db = sb(env, token);
    const ctx = await companyContext(db, env, company);
    const r = await sendExpiryEmails(env, db, { company, who: user.id, mailFrom: ctx.mailFrom, today, appUrl: env.APP_URL || "" });
    const failed = r.skipped.find(s => s.reason === "send_failed");
    if (failed) return fail("Gmail: " + failed.message, 502, "google");
    return json({ ok: true, ...r });
  });
}
