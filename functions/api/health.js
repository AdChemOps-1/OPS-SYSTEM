// GET /api/health?company=… — what the server can reach for that company. Admin only; never returns secrets.
import { googleToken, gfetch } from "../_lib/google.js";
import { requireUser, sb, json, handle, companyFrom, companyContext } from "../_lib/auth.js";
import { TAB, sheetIdFrom } from "../_lib/orderlog.js";
import { TAB as CUSTOMERS_TAB } from "../_lib/customersout.js";
import { probeCalendar } from "../_lib/calendars.js";
import { probe as probeVision } from "../_lib/vision.js";

export async function onRequestGet({ request, env }) {
  return handle(async () => {
    const { token, company } = await requireUser(request, env, ["admin"], companyFrom(request));
    const db = sb(env, token);
    const ctx = await companyContext(db, env, company);
    const out = { company, supabase: true, googleConfigured: !!env.GOOGLE_SA_JSON, impersonate: env.GOOGLE_IMPERSONATE || "", mailFrom: ctx.mailFrom, ordersTo: ctx.ordersTo, accountingTo: ctx.accountingTo, checks: {} };
    // the private documents bucket (storage.buckets is not readable as a member, so a security-definer RPC answers)
    try { out.checks.docsBucket = await db.rpc("dispatch_docs_bucket_ok"); } catch (e) { out.checks.docsBucket = /PGRST202|Could not find the function/.test(e.message) ? "not created yet — apply migration 006_documents.sql" : e.message; }
    // the daily expiry email job (dispatch_cron_status refuses non-admins; this route is admin-only)
    try {
      const rows = await db.rpc("dispatch_cron_status");
      const j = (Array.isArray(rows) ? rows : []).find(x => x && x.active);
      out.checks.expiryCron = j ? "ok — " + (j.schedule === "0 14 * * *" ? "daily 06:00 Pacific" : j.schedule) : "not scheduled";
    } catch (e) { out.checks.expiryCron = "not scheduled"; }
    // when the expiry email last went out for this company: its newest expiry_email log row (admins read the log). A run with
    // nothing due sends nothing and logs nothing. Informational, so it sits outside checks and never turns the banner amber.
    try {
      const rows = await db.get("dispatch_log?select=at&company=eq." + encodeURIComponent(company) + "&what=eq.expiry_email&order=at.desc&limit=1");
      out.lastExpiryEmail = (Array.isArray(rows) && rows[0] && rows[0].at) || null;
    } catch (e) { out.lastExpiryEmail = null; }
    if (!env.GOOGLE_SA_JSON) return json(out);
    try { await googleToken(env); out.checks.token = "ok"; } catch (e) { out.checks.token = e.message; return json(out); }
    out.checks.vision = await probeVision(env);   // Cloud Vision (asset serial photos): enabled and billed?
    const sheetId = ctx.settings.sheetId || (company === "adchem" ? env.AR_SHEET_ID : "");
    if (sheetId) { try { const r = await gfetch(env, `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent("'FEED_ORDERS (publish)'!A1:B2")}`); out.checks.sheet = (r.values && r.values[0] && r.values[0][0] === "Customer") ? "ok" : "unexpected layout"; } catch (e) { out.checks.sheet = e.message; } }
    else out.checks.sheet = "no sheet ID set on Setup";
    {
      // Each delivery calendar the company uses: the default and every hub's own. ok only if all are writable.
      const s = ctx.settings || {}, hubs = s.hubCalendars || {};
      const want = [];
      if (s.calendarId) want.push(["default", s.calendarId]);
      Object.keys(hubs).sort().forEach(h => { if (hubs[h] && hubs[h].id) want.push([h, hubs[h].id]); });
      if (!want.length) out.checks.calendar = "no delivery calendar set on Setup";
      else {
        const parts = []; let all = true;
        for (const [label, id] of want) {
          try { const p = await probeCalendar(env, id); parts.push(label + ": " + p.summary + (p.ok ? "" : " (can see it, cannot write — share it to orders@ as Make changes to events)")); if (!p.ok) all = false; }
          catch (e) { parts.push(label + ": " + e.message); all = false; }
        }
        out.checks.calendar = (all ? "ok — " : "") + parts.join(" · ") + (s.calendarConfirmed ? "" : " · not confirmed on Setup");
      }
    }
    try { const r = await gfetch(env, "https://www.googleapis.com/drive/v3/about?fields=user"); out.checks.drive = "ok as " + ((r.user && r.user.emailAddress) || "?"); } catch (e) { out.checks.drive = e.message; }
    try {
      const r = await gfetch(env, "https://gmail.googleapis.com/gmail/v1/users/me/settings/sendAs");
      const aliases = (r.sendAs || []).map(a => a.sendAsEmail.toLowerCase());
      const want = String(ctx.mailFrom).toLowerCase();
      out.checks.gmail = aliases.includes(want) ? "ok — can send as " + ctx.mailFrom : "signed in, but " + ctx.mailFrom + " is NOT a verified Send-mail-as address (mail would go out as the account itself)";
    } catch (e) { out.checks.gmail = e.message; }
    const oo = ctx.settings.ordersOutSheetId;
    if (oo) { try { const r = await gfetch(env, `https://sheets.googleapis.com/v4/spreadsheets/${String(oo).replace(/.*\/d\/([A-Za-z0-9_-]+).*/, "$1")}/values/${encodeURIComponent("'" + TAB + "'!A1:L1")}`); out.checks.ordersOut = (r.values && r.values[0] && r.values[0][0] === "Order #") ? "ok" : "tab found but the header row is not the twelve Orders In columns"; } catch (e) { out.checks.ordersOut = e.message; } }
    else out.checks.ordersOut = "no Orders Out sheet set on Setup";
    const co = sheetIdFrom(ctx.settings.customersOutSheetId);
    if (co) { try { const r = await gfetch(env, `https://sheets.googleapis.com/v4/spreadsheets/${co}/values/${encodeURIComponent("'" + CUSTOMERS_TAB + "'!A1:AG1")}`); out.checks.customersOut = (r && r.values && r.values[0] && r.values[0][0] === "Customer ID") ? "ok" : "tab found but the header row is not the Customers Out columns (press Rebuild Customers Out on Setup)"; } catch (e) { out.checks.customersOut = e.message; } }
    else out.checks.customersOut = "no Customers Out sheet set on Setup";
    const im = sheetIdFrom(ctx.settings.importSheetId);
    if (im) {
      try {
        const r = await gfetch(env, `https://sheets.googleapis.com/v4/spreadsheets/${im}/values/${encodeURIComponent("'Customer Directory'!A1:AZ6")}`);
        const found = ((r && r.values) || []).some(row => (row || []).some(c => String(c).trim() === "Customer ID"));
        out.checks.importSheet = found ? "ok" : "tab found but no Customer ID header in its first rows";
      } catch (e) { out.checks.importSheet = e.message; }
    } else out.checks.importSheet = "no import sheet set on Setup";
    return json(out);
  });
}
