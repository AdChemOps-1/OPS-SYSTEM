// The Orders In return flow: one row per order in the company's "Dispatch Orders Out" sheet, keyed on Order ID.
// Twelve columns, in the order the master's Orders In tab expects. Derived from dispatch_orders; rebuildable at any time.
import { gfetch } from "./google.js";

export const TAB = "Dispatch Orders Out";
export const HEADER = ["Order #","Customer","Promised Date","Delivery Status","Delivered Date","Payment Collected","Invoice #","BOL #","Exception / Issue","Driver Note - from the field","Updated Contact / Phone","Reported"];

function sheetIdFrom(raw) {
  const s = String(raw || "").trim(); if (!s) return "";
  const m = s.match(/\/d\/([A-Za-z0-9_-]+)/); if (m) return m[1];
  return /^[A-Za-z0-9_-]{20,}$/.test(s) ? s : "";
}
function dayIn(iso, tz) {
  if (!iso) return "";
  try { return new Date(iso).toLocaleDateString("en-US", { timeZone: tz || "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" }); } catch (e) { return String(iso).slice(0, 10); }
}
function stampIn(d, tz) {
  try { return d.toLocaleString("en-US", { timeZone: tz || "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }); } catch (e) { return d.toISOString(); }
}

// One sheet row from one dispatch_orders row. `invoice` is whatever the office already typed in column G; the app never sets it.
export function rowFor(o, tz, invoice, now) {
  const d = o.data || {}, pod = d.pod || {};
  const delivered = ["Delivered", "POD Received", "Invoiced", "Paid"].includes(o.status);
  const collected = delivered ? Number(pod.collected != null ? pod.collected : 0) || 0 : "";
  const siteCopy = d.copyTo || "";
  const cc = (pod.cc || []).join(", ");
  return [
    o.id, o.customer || "", o.date || "", o.status || "", delivered ? dayIn(pod.sentAt, tz) : "",
    collected, invoice || "", o.bol_no || "", pod.issue || "", pod.note || "",
    (cc && cc !== siteCopy) ? cc : "", stampIn(now || new Date(), tz),
  ];
}

// Write the given orders (or everything, when rebuild is true) into the sheet. Returns counts.
export async function writeOrdersOut(env, db, ctx, company, orderIds, rebuild) {
  const sheetId = sheetIdFrom(ctx.settings.ordersOutSheetId);
  if (!sheetId) return { ok: false, skipped: "No Orders Out sheet is set on Setup." };
  const tz = ctx.settings.tz || "America/Los_Angeles";
  const base = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}`;
  const rng = (a1) => encodeURIComponent(`'${TAB}'!${a1}`);
  // existing rows: Order ID → row number, and the office's invoice number
  const existing = await gfetch(env, `${base}/values/${rng("A2:L")}`);
  const index = new Map();
  (existing.values || []).forEach((r, i) => { const id = String(r[0] || "").trim(); if (id) index.set(id, { row: i + 2, invoice: r[6] || "" }); });
  let orders;
  if (rebuild) {
    orders = await db.get(`dispatch_orders?select=id,bol_no,hub,date,status,customer,data&company=eq.${encodeURIComponent(company)}&order=date.asc,id.asc&limit=5000`);
  } else {
    const ids = (orderIds || []).map(s => String(s)).filter(Boolean);
    if (!ids.length) return { ok: true, updated: 0, appended: 0 };
    orders = await db.get(`dispatch_orders?select=id,bol_no,hub,date,status,customer,data&company=eq.${encodeURIComponent(company)}&id=in.(${ids.map(encodeURIComponent).join(",")})`);
  }
  const now = new Date();
  if (rebuild) {
    const rows = orders.map(o => rowFor(o, tz, (index.get(o.id) || {}).invoice, now));
    await gfetch(env, `${base}/values/${rng("A2:L")}:clear`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    if (rows.length) await gfetch(env, `${base}/values/${rng("A2:L")}?valueInputOption=USER_ENTERED`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ values: rows }) });
    return { ok: true, rebuilt: rows.length };
  }
  const updates = [], appends = [];
  for (const o of orders) {
    const hit = index.get(o.id);
    const row = rowFor(o, tz, hit ? hit.invoice : "", now);
    if (hit) updates.push({ range: `'${TAB}'!A${hit.row}:L${hit.row}`, values: [row] });
    else appends.push(row);
  }
  if (updates.length) await gfetch(env, `${base}/values:batchUpdate`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ valueInputOption: "USER_ENTERED", data: updates }) });
  if (appends.length) await gfetch(env, `${base}/values/${rng("A2:L")}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ values: appends }) });
  return { ok: true, updated: updates.length, appended: appends.length };
}

// Best effort from other routes: never let the return flow break the thing that triggered it.
export async function tryWriteOrdersOut(env, db, ctx, company, orderIds) {
  try { return await writeOrdersOut(env, db, ctx, company, orderIds, false); }
  catch (e) { return { ok: false, error: String(e && e.message || e) }; }
}
