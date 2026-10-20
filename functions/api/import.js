// POST /api/import — the one-time customer import (spec §8). Needs the run_imports permission (or super admin).
// {action:'read'}   reads the five tabs of the workbook named by Setup's importSheetId and returns {plan, sheetId} for review.
// {action:'commit', plan} writes the reviewed plan: customers, then sites, hub notes and contacts, logs the import, moves
// nextCustomerNumber past the highest ID, and rebuilds Customers Out. Money columns are never read or written (importsheet.js).
import { gfetch } from "../_lib/google.js";
import { requireUser, sb, json, fail, handle, companyFrom, companyContext, hasPerm } from "../_lib/auth.js";
import { sheetIdFrom } from "../_lib/orderlog.js";
import { TABS, planImport, applyPlan, bindRows } from "../_lib/importsheet.js";
import { tryWriteCustomersOut } from "../_lib/customersout.js";

const BATCH = 200;
const batches = async (rows, fn) => { for (let i = 0; i < rows.length; i += BATCH) await fn(rows.slice(i, i + BATCH)); };

export async function existingFor(db, company) {
  const co = encodeURIComponent(company);
  const [customers, sites, contacts, hubNotes] = await Promise.all([
    db.get(`dispatch_customers?select=*&company=eq.${co}&limit=20000`),
    db.get(`dispatch_sites?select=*&company=eq.${co}&limit=20000`),
    db.get(`dispatch_contacts?select=id,customer_id,type,first_name,last_name,phone,email&company=eq.${co}&limit=50000`),
    db.get(`dispatch_site_hub_notes?select=*&company=eq.${co}&limit=50000`),
  ]);
  return { customers: customers || [], sites: sites || [], contacts: contacts || [], hubNotes: hubNotes || [] };
}

async function readWorkbook(env, sheetId) {
  const wb = {};
  await Promise.all(Object.entries(TABS).map(async ([k, title]) => {
    const range = encodeURIComponent(`'${title}'!A1:AZ2000`);
    try { const d = await gfetch(env, `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}`); wb[k] = d.values || []; }
    catch (e) {
      if (e.status === 400 && /Unable to parse range/i.test(e.message)) { wb[k] = null; return; }   // tab absent: planImport reports it
      throw e;
    }
  }));
  return wb;
}

export async function onRequestPost({ request, env }) {
  return handle(async () => {
    const body = await request.json().catch(() => ({}));
    const { token, company, user, me } = await requireUser(request, env, ["admin", "coordinator"], companyFrom(request, body), "run_imports");
    const db = sb(env, token);
    const ctx = await companyContext(db, env, company);
    const sheetId = sheetIdFrom(ctx.settings.importSheetId);
    if (!sheetId) return fail("No import workbook is set. Paste its link on Setup first.", 400, "config");

    if (body.action === "read") {
      let wb;
      try { wb = await readWorkbook(env, sheetId); }
      catch (e) { return fail("Couldn't read the import workbook: " + e.message + ". Check that it is shared with the Google user the server acts as.", 502, "google"); }
      const existing = await existingFor(db, company);
      return json({ plan: planImport(wb, existing), sheetId });
    }

    if (body.action !== "commit") return fail("Unknown action.", 400, "bad_request");
    // writing customers and contacts also needs manage_customers (the tables' policies require it); say so before writing anything
    if (!hasPerm(me, "manage_customers")) return fail("Importing writes customers, so it also needs the manage customers permission.", 403, "forbidden");
    const plan = body.plan;
    if (!plan || !Array.isArray(plan.items) || plan.items.length > 20000) return fail("Read the workbook and review the plan first.", 400, "bad_request");
    const co = encodeURIComponent(company);
    const now = new Date().toISOString();
    const applied = applyPlan(plan, await existingFor(db, company), user.id);
    const src = (r) => ({ ...r, import_source: { ...(r.import_source || {}), sheetId, at: now } });

    // 1. customers, then their ids
    const head = bindRows({ customers: applied.customers }, new Map(), company, now);
    await batches(head.customers.map(src), rows => db.upsert("dispatch_customers", rows, "company,customer_id"));
    // 2. numbering, straight away: if a later write fails, the trigger still never hands out an ID the import just used
    //    (fresh read, never below what the company already uses)
    const srow = (await db.get(`dispatch_company_settings?select=data&company=eq.${co}`) || [])[0];
    const data = (srow && srow.data) || {};
    const next = Math.max(Number(data.nextCustomerNumber) || 1, applied.nextCustomerNumber);
    await db.upsert("dispatch_company_settings", [{ company, data: { ...data, nextCustomerNumber: next }, updated_at: now }], "company");
    const ids = new Map((await db.get(`dispatch_customers?select=id,customer_id&company=eq.${co}&limit=20000`) || []).map(r => [r.customer_id, r.id]));
    const rows = bindRows(applied, ids, company, now);
    for (const p of rows.parents)
      await db.patch("dispatch_customers", `company=eq.${co}&customer_id=eq.${encodeURIComponent(p.customer_id)}`, { parent_customer_id: p.parent_customer_id });
    // 3. sites, hub notes, contacts
    await batches(rows.sites.map(src), r => db.upsert("dispatch_sites", r, "company,site_key"));
    await batches(rows.siteHubNotes, r => db.upsert("dispatch_site_hub_notes", r, "company,site_key,hub"));
    await batches(rows.contacts.map(src), r => db.insert("dispatch_contacts", r));

    const counts = { customers: rows.customers.length, sites: rows.sites.length, hubNotes: rows.siteHubNotes.length, contacts: rows.contacts.length,
      skipped: plan.items.filter(i => i && i.decision === "skip").length };
    await db.insert("dispatch_log", [{ company, who: user.id, what: "import", detail: { counts, sheetId } }]);
    // 4. Customers Out, best effort
    const customersOut = await tryWriteCustomersOut(env, db, { ...ctx, settings: { ...ctx.settings, ...data } }, company, [], true);
    return json({ ok: true, counts, nextCustomerNumber: next, problems: applied.problems, customersOut });
  });
}
