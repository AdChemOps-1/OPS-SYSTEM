// POST /api/feed — read FEED_ORDERS from the company's AR Command Center and refresh dispatch_sites for that company.
// Only the 14 FEED_ORDERS columns are read: no balances, terms, pricing or billing contacts.
import { gfetch } from "../_lib/google.js";
import { requireUser, sb, json, fail, handle, companyFrom, companyContext } from "../_lib/auth.js";

const HEADER = ["Customer","Payment Flag","Delivery Address","City","Hub","Site Contact","Site Phone","Gate / Access Code","Receiving Hours","Scale from East Bay","Scale from SoCal","Special Delivery Instructions","Site Label","Site Key"];
const CODES = ["D","COD","R","H","CHECK"];
function parseCode(raw){ const k=String(raw||"").trim().split(" - ")[0].trim().toUpperCase(); return CODES.includes(k)?k:null; }
function cleanAddr(a){ return String(a||"").replace(/\s*\(billing address[^)]*\)\s*/i,"").replace(/\s{2,}/g," ").trim(); }

export async function onRequestPost({ request, env }) {
  return handle(async () => {
    const body = await request.json().catch(() => ({}));
    const { token, company } = await requireUser(request, env, ["admin","coordinator"], companyFrom(request, body));
    const db = sb(env, token);
    const ctx = await companyContext(db, env, company);
    const sheetId = ctx.settings.sheetId || (company === "adchem" ? env.AR_SHEET_ID : "");
    if (!sheetId) return fail("No AR Command Center sheet ID is set for this company.", 400, "config");
    const range = encodeURIComponent("'FEED_ORDERS (publish)'!A1:N401");
    let data;
    try {
      data = await gfetch(env, `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}`);
    } catch (e) {
      return fail("Couldn't read the AR Command Center: " + e.message + ". Check that the sheet is shared with the Google user the server acts as.", 502, "google");
    }
    const values = data.values || [];
    const head = values[0] || [];
    const ok = HEADER.every((h, i) => String(head[i] || "").trim() === h);
    if (!ok) return fail("FEED_ORDERS doesn't have the expected columns, so nothing was read.", 409, "layout");
    const now = new Date().toISOString();
    const rows = [];
    for (const r of values.slice(1)) {
      const name = String(r[0] || "").trim(); if (!name) continue;
      const label = String(r[12] || "Primary").trim() || "Primary";
      rows.push({
        company, site_key: String(r[13] || "").trim() || (name + " — " + label),
        customer: name, code_raw: String(r[1] || "").trim(), code: parseCode(r[1]),
        addr: cleanAddr(r[2]), unconfirmed: /confirm the delivery site/i.test(String(r[2] || "")) || !cleanAddr(r[2]),
        city: String(r[3] || ""), hub: String(r[4] || "").trim().toUpperCase(), contact: String(r[5] || ""), phone: String(r[6] || ""),
        gate: String(r[7] || ""), hours: String(r[8] || ""), instr: String(r[11] || ""), site_label: label, synced_at: now,
      });
    }
    for (let i = 0; i < rows.length; i += 200) await db.upsert("dispatch_sites", rows.slice(i, i + 200), "company,site_key");
    const counts = {}; rows.forEach(r => { const k = r.code || "?"; counts[k] = (counts[k] || 0) + 1; });
    return json({ ok: true, sites: rows.length, customers: new Set(rows.map(r => r.customer.toLowerCase())).size, counts, unconfirmed: rows.filter(r => r.unconfirmed).length, syncedAt: now });
  });
}
