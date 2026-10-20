// Customers Out (spec §9): the sheet the AR Command Center, FEED_ORDERS and the Order Log read by IMPORTRANGE in place of the
// office's hand-kept directory. One row per customer with its primary site, plus one per additional site; keyed on
// column A (Customer ID) + column L (Delivery Street). Derived from the database and rebuildable at any time; never hand-edited.
// Never carries balances, terms, prices, files, notes, activity or assets.
import { gfetch } from "./google.js";
import { sheetIdFrom, stampIn } from "./orderlog.js";

export const TAB = "Customers Out";
export const HEADER = ["Customer ID","Customer","Also Known As","Legal Name","Account Status","Primary Hub","Parent Account",
  "Billing Street","City","State","ZIP","Delivery Street","City","State","ZIP","Delivery Contact","Delivery Phone",
  "Billing Contact","Billing Phone","Billing Email","CC Emails","Owner Name","Owner Phone","Owner Email",
  "License Status","License #","License Expires","Entity Status","PSA Status","PSA Effective","Profile Complete","Last Verified","Updated At"];
const MUST = 15;            // the must-have fields counted by dispatch_customer_status.profile_complete
const DELIVERY_STREET = 11; // column L
const LAST = "AG";          // column 33

const s = (v) => v == null ? "" : String(v).trim();
const name = (x) => x ? [s(x.first_name), s(x.last_name)].filter(Boolean).join(" ") : "";
// a date column (YYYY-MM-DD from Postgres) as MM/DD/YYYY, without a time-zone shift
function mdy(v) {
  const m = s(v).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[2]}/${m[3]}/${m[1]}` : s(v);
}
// A site's delivery address. App-entered sites carry street and city separately; feed sites carry the whole address in addr
// ("100 Main St, Oakland CA 94607"), which is split so the key street is the same whichever way the site was written.
function deliveryOf(site) {
  if (!site) return ["", "", "", ""];
  const addr = s(site.addr);
  const m = addr.match(/^(.+?),\s*(.+?),?\s+([A-Z]{2})\s+(\d{5}(?:-\d{4})?)$/);
  if (m) return [m[1].trim(), s(site.city) || m[2].trim(), m[3], m[4]];
  return [addr, s(site.city), s(site.state), s(site.zip)];
}

// The sheet rows for one customer. `c.parent_name` is the parent account's name (the writer looks it up); `status` is the
// customer's dispatch_customer_status row (license/PSA are 'missing' until Stage 2).
export function rowsFor(c, sites, contacts, status, tz, now) {
  const st = status || {};
  const live = (contacts || []).filter(x => x.active !== false);
  const ofType = (t) => live.filter(x => x.type === t);
  const billingAll = ofType("billing");
  const billing = billingAll.find(x => !x.cc_on_statements) || billingAll[0] || null;
  const cc = billingAll.filter(x => x.cc_on_statements && x !== billing && s(x.email)).map(x => s(x.email))
    .filter((e, i, a) => a.indexOf(e) === i && e !== s(billing && billing.email)).join(", ");
  const owner = ofType("owner")[0] || null;
  const receiving = ofType("receiving");
  const list = (sites || []).slice();
  const pi = list.findIndex(x => x.site_label === "Primary");
  const ordered = list.length ? [list[pi >= 0 ? pi : 0]].concat(list.filter((_, i) => i !== (pi >= 0 ? pi : 0))) : [null];
  const stamp = stampIn(now || new Date(), tz);
  return ordered.map(site => {
    const recv = (site && receiving.find(x => x.site_key === site.site_key)) || receiving.find(x => !x.site_key) || receiving[0] || null;
    return [
      s(c.customer_id), s(c.name), s(c.also_known_as), s(c.legal_name), s(c.account_status), s(c.primary_hub), s(c.parent_name),
      s(c.billing_street), s(c.billing_city), s(c.billing_state), s(c.billing_zip),
      ...deliveryOf(site), name(recv), s(recv && recv.phone),
      name(billing), s(billing && billing.phone), s(billing && billing.email), cc,
      name(owner), s(owner && owner.phone), s(owner && owner.email),
      s(st.license_status) || "missing", s(st.license_number), mdy(st.license_expires), s(st.entity_status) || "missing",
      s(st.psa_status) || "missing", mdy(st.psa_effective),
      `${Number(st.profile_complete) || 0} of ${MUST}`, mdy(c.last_verified), stamp,
    ];
  });
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const groupBy = (rows, k) => { const m = new Map(); for (const r of rows || []) { const v = r[k]; if (!m.has(v)) m.set(v, []); m.get(v).push(r); } return m; };
const keyOf = (r) => s(r[0]) + "\u0000" + s(r[DELIVERY_STREET]);

// Write the given customers' rows (or every customer, when rebuild is true). customerIds are dispatch_customers.id uuids.
// Incremental: a sheet row with the same (Customer ID, Delivery Street) is rewritten in place, new pairs are appended, and
// rows of a listed customer whose site is gone (merged, relabelled, deleted) are deleted, so no pair is ever duplicated.
// Values are written RAW: ZIPs and phones keep their leading zeros and a name starting with "=" is never a formula.
export async function writeCustomersOut(env, db, ctx, company, customerIds, rebuild) {
  const sheetId = sheetIdFrom(ctx.settings.customersOutSheetId);
  if (!sheetId) return { ok: false, skipped: "No Customers Out sheet is set on Setup." };
  const tz = ctx.settings.tz || "America/Los_Angeles";
  const base = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}`;
  const rng = (a1) => encodeURIComponent(`'${TAB}'!${a1}`);
  const co = encodeURIComponent(company);
  const json = (body) => ({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

  const ids = rebuild ? null : [...new Set((customerIds || []).map(String).filter(x => UUID.test(x)))];
  if (ids && !ids.length) return { ok: true, updated: 0, appended: 0, deleted: 0 };
  const inIds = ids ? `&id=in.(${ids.join(",")})` : "";
  const inCust = ids ? `&customer_id=in.(${ids.join(",")})` : "&customer_id=not.is.null";
  const want = (r, k) => !ids || ids.includes(r[k]);
  const customers = (await db.get(`dispatch_customers?select=*&company=eq.${co}${inIds}&order=name.asc,customer_id.asc&limit=10000`) || []).filter(c => want(c, "id"));
  const sites = groupBy((await db.get(`dispatch_sites?select=*&company=eq.${co}${inCust}&order=site_key.asc&limit=20000`) || []).filter(x => want(x, "customer_id")), "customer_id");
  const contacts = groupBy((await db.get(`dispatch_contacts?select=*&company=eq.${co}${inCust}&active=eq.true&order=created_at.asc&limit=50000`) || []).filter(x => want(x, "customer_id")), "customer_id");
  const status = new Map((await db.get(`dispatch_customer_status?select=*&company=eq.${co}${inIds}`) || []).map(r => [r.id, r]));
  // parent names: in a rebuild every customer is at hand; otherwise read just the parents
  const names = new Map(customers.map(c => [c.id, c.name]));
  const parents = [...new Set(customers.map(c => c.parent_customer_id).filter(p => p && UUID.test(p) && !names.has(p)))];
  if (parents.length) (await db.get(`dispatch_customers?select=id,name&company=eq.${co}&id=in.(${parents.join(",")})`) || []).forEach(p => names.set(p.id, p.name));

  const now = new Date();
  const rowsOf = (c) => rowsFor({ ...c, parent_name: names.get(c.parent_customer_id) || "" }, sites.get(c.id), contacts.get(c.id), status.get(c.id), tz, now);

  if (rebuild) {
    const rows = customers.flatMap(rowsOf);
    await gfetch(env, `${base}/values/${rng(`A2:${LAST}`)}:clear`, json({}));
    await gfetch(env, `${base}/values/${rng(`A1:${LAST}`)}?valueInputOption=RAW`, { ...json({ values: [HEADER, ...rows] }), method: "PUT" });
    return { ok: true, rebuilt: rows.length };
  }

  // existing rows of the listed customers: key → sheet row numbers (a pair seen twice is a duplicate to remove)
  const listed = new Set(customers.map(c => s(c.customer_id)));
  const existing = await gfetch(env, `${base}/values/${rng(`A2:${LAST}`)}`);
  const index = new Map();
  (existing && existing.values || []).forEach((r, i) => {
    if (!listed.has(s(r[0]))) return;
    const k = keyOf(r); if (!index.has(k)) index.set(k, []); index.get(k).push(i + 2);
  });
  const updates = [], appends = [];
  for (const row of customers.flatMap(rowsOf)) {
    const hit = (index.get(keyOf(row)) || []).shift();
    if (hit) updates.push({ range: `'${TAB}'!A${hit}:${LAST}${hit}`, values: [row] });
    else appends.push(row);
  }
  const stale = [...index.values()].flat().sort((a, b) => b - a);   // bottom-up so earlier deletes don't shift later ones
  if (updates.length) await gfetch(env, `${base}/values:batchUpdate`, json({ valueInputOption: "RAW", data: updates }));
  if (stale.length) {
    const meta = await gfetch(env, `${base}?fields=sheets.properties`);
    const tab = (meta && meta.sheets || []).map(x => x.properties || {}).find(p => p.title === TAB);
    if (!tab) throw new Error(`no "${TAB}" tab in the Customers Out sheet`);
    await gfetch(env, `${base}:batchUpdate`, json({ requests: stale.map(r => ({ deleteDimension: { range: { sheetId: tab.sheetId, dimension: "ROWS", startIndex: r - 1, endIndex: r } } })) }));
  }
  if (appends.length) await gfetch(env, `${base}/values/${rng(`A2:${LAST}`)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, json({ values: appends }));
  return { ok: true, updated: updates.length, appended: appends.length, deleted: stale.length };
}

// Best effort from other routes (the import, later document saves): never let the sheet break the thing that triggered it.
export async function tryWriteCustomersOut(env, db, ctx, company, customerIds, rebuild) {
  try { return await writeCustomersOut(env, db, ctx, company, customerIds, !!rebuild); }
  catch (e) { return { ok: false, error: String(e && e.message || e) }; }
}
