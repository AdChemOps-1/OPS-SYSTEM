// The one-time customer import (spec §8): read the office's customer workbook, propose a plan the importer reviews row by row,
// then turn the reviewed plan into rows to upsert. Pure — no I/O; /api/import does the reading and writing.
// Never reads a money column: Terms, Credit Limit, Balance, Payment Method, pricing, delivery fees, deposits/rentals and credit
// status stay in the AR Command Center. Licensing & Entity rows become cannabis_license documents and Account Terms rows PSA
// documents (the six agreement dates only); every other Account Terms column and Balance (auto) are never read.

export const TABS = { directory: "Customer Directory", customers: "Customers", licensing: "Licensing & Entity", delivery: "Delivery Notes", terms: "Account Terms" };

// Column names the planner reads. Names that repeat on the Directory (Street, City, First Name…) are taken positionally inside
// the group block named on the row above the headers, and written "GROUP › Header".
const G = (group, names) => names.map(n => group + " › " + n);
export const HEADERS = {
  directory: ["Customer (QuickBooks name)", "Also Known As", "Legal / Billing Company Name", "Account Status", "Primary Hub",
    ...G("BILLING ADDRESS", ["Street", "City", "State", "ZIP"]),
    "Same as billing?", ...G("DELIVERY ADDRESS", ["Street", "City", "State", "ZIP"]),
    "Delivery same as billing contact?", "Delivery Contact Name", "Delivery Phone",
    ...G("BILLING CONTACT", ["First Name", "Last Name", "Phone"]), "Billing / AP Email", "CC on Statements (emails)",
    "Owner same as billing contact?", ...G("COMPANY OWNER", ["First Name", "Last Name", "Phone", "Email"]),
    "Best Way to Reach", "Last Verified", "Notes", "Customer ID", "Parent / Related Account"],
  customers: ["Customer", "Also Known As", "Legal Name", "Account Status", "Street", "City", "State", "ZIP", "Contact", "Phone", "Email"],
  delivery: ["Customer", "Serving Hub", "Receiving Days / Hours", "Site Contact", "Site Phone", "Gate / Access Code",
    "Parking & Unloading (dock, liftgate, forklift)", "Scale on Route? (from East Bay)", "Route / Scale Notes (East Bay)",
    "Scale on Route? (from SoCal)", "Route / Scale Notes (SoCal)", "Hazmat / Site Restrictions",
    "Cylinder / Container Notes (pigs, dewars, bins, swaps)", "Special Delivery Instructions", "Last Verified"],
  // Balance (auto) is never read
  licensing: ["Customer", "Licensee Legal Name", "License #", "License Type", "Status", "Issued", "Expires", "County / Premises", "Owners on the License",
    "Entity Status (SOS)", "Source", "Checked", "Notes"],
  // the PSA dates only: Terms, Credit Limit, Payment Method, Card Fee, pricing, fees, deposits and credit are never read
  terms: ["Customer", "Quote Sent", "Quote Accepted", "PSA Sent for Signature", "PSA Signed (Customer)", "Countersigned (AdChem)", "Effective Date"],
};
const GROUPS = ["BILLING ADDRESS", "DELIVERY ADDRESS", "BILLING CONTACT", "COMPANY OWNER"];

// The columns a plan item may carry, and so the only ones applyPlan can ever write.
const CUSTOMER_COLS = ["name", "also_known_as", "legal_name", "account_status", "primary_hub", "billing_street", "billing_city", "billing_state", "billing_zip", "last_verified", "notes"];
const SITE_INPUT = ["delivery_street", "delivery_city", "delivery_state", "delivery_zip", "hub", "site_label"];
const SITE_OPS = ["receiving_hours", "gate_code", "parking_unloading", "hazmat_restrictions", "container_notes", "special_instructions"];
const FIELD_KEYS = [...CUSTOMER_COLS, ...SITE_INPUT, ...SITE_OPS, "site_last_verified"];
const DATE_FIELDS = new Set(["last_verified", "site_last_verified"]);
const DECISIONS = ["customer", "site", "related", "skip"];
const HUBS = ["EB", "LA", "CO"];
const STATUSES = ["active", "inactive", "prospect"];
const METHODS = ["phone", "email", "text"];

const s = (v) => v == null ? "" : String(v).trim();
const lc = (v) => s(v).toLowerCase();
const blank = (v) => v == null || s(v) === "";
const yes = (v) => /^(y|yes|true|x|✓|✔)$/i.test(s(v));
const scale = (v) => /^(y|yes|true)$/i.test(s(v)) ? true : /^(n|no|false)$/i.test(s(v)) ? false : null;
const num = (id) => { const m = s(id).match(/(\d+)\s*$/); return m ? parseInt(m[1], 10) : 0; };
const fmtId = (n) => "ADC-" + String(n).padStart(4, "0");
const normId = (v) => { const m = s(v).toUpperCase().match(/^ADC-?\s*(\d+)$/); return m ? fmtId(parseInt(m[1], 10)) : ""; };
const streetKey = (v) => lc(String(v || "").split(",")[0]).replace(/[^a-z0-9]/g, "");
// Legal names compare case-insensitively after dropping a " - <city>" tail and LLC / Inc / Inc. suffixes.
export function legalKey(v) {
  let x = lc(v).replace(/\s+-\s+[^-]+$/, "");
  for (let i = 0; i < 3; i++) x = x.replace(/[,\s]+(llc|inc\.?)$/i, "").replace(/[.,\s]+$/, "");
  return x.replace(/\s+/g, " ");
}
// sheet dates: YYYY-MM-DD, M/D/YYYY (or M/D/YY), or a sheet serial (days since 1899-12-30); a day that does not exist is not a date
function isoDate(v) {
  const t = s(v); let m, y, mo, d;
  if ((m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) [y, mo, d] = [+m[1], +m[2], +m[3]];
  else if ((m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/))) [y, mo, d] = [m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[1], +m[2]];
  else if (/^\d{5}$/.test(t)) return new Date(Date.UTC(1899, 11, 30) + Number(t) * 86400000).toISOString().slice(0, 10);
  else return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return dt.toISOString().slice(0, 10);
}
function hubCode(v) {
  const t = s(v).toUpperCase(); if (HUBS.includes(t)) return t;
  if (/EAST BAY|RICHMOND/.test(t)) return "EB"; if (/SOCAL|SOUTHERN|LOS ANGELES/.test(t)) return "LA"; if (/COLORADO|DENVER/.test(t)) return "CO";
  return "";
}
const status = (v) => STATUSES.includes(lc(v)) ? lc(v) : "";
const method = (v) => METHODS.includes(lc(v)) ? lc(v) : null;
const splitName = (v) => { const t = s(v).split(/\s+/).filter(Boolean); return [t[0] || "", t.slice(1).join(" ")]; };

// Read one tab: find the header row (the first row holding the tab's anchor header, else the row with the most expected
// headers), key each data row by header, and list expected headers that are not there. Rows carry _row, the sheet row number.
export function readTab(values, headerRowIndex, expected) {
  const vals = Array.isArray(values) ? values : [];
  const want = expected || [];
  const plain = want.map(h => h.includes(" › ") ? h.split(" › ")[1] : h);
  let hr = Number.isInteger(headerRowIndex) ? headerRowIndex : -1;
  if (hr < 0) {
    const anchor = want.includes("Customer ID") ? "Customer ID" : want[0];
    hr = vals.findIndex((r, i) => i < 15 && (r || []).some(c => s(c) === anchor));
    if (hr < 0) { let best = 0; vals.slice(0, 15).forEach((r, i) => { const n = (r || []).filter(c => plain.includes(s(c))).length; if (n > best) { best = n; hr = i; } }); }
  }
  if (hr < 0) return { rows: [], missing: want.slice(), headerRow: -1 };
  const head = (vals[hr] || []).map(s);
  const above = hr > 0 ? (vals[hr - 1] || []) : [];
  const keys = []; let group = "";
  head.forEach((h, j) => {
    const g = s(above[j]).toUpperCase(); if (g) group = GROUPS.includes(g) ? g : "";
    keys.push(group && h ? group + " › " + h : "");
  });
  const rows = [];
  for (let i = hr + 1; i < vals.length; i++) {
    const r = vals[i] || []; if (!r.some(c => s(c))) continue;
    const o = { _row: i + 1 };
    // only the columns the tab expects are read (a money column next to them never enters a row)
    head.forEach((h, j) => { if (!h || (want.length && !plain.includes(h))) return; if (!(h in o)) o[h] = s(r[j]); if (keys[j] && want.includes(keys[j])) o[keys[j]] = s(r[j]); });
    rows.push(o);
  }
  const have = new Set([...head.filter(Boolean), ...keys.filter(Boolean)]);
  return { rows, missing: want.filter(h => !have.has(h)), headerRow: hr };
}

function emptyFields() { const f = {}; for (const k of FIELD_KEYS) f[k] = DATE_FIELDS.has(k) ? null : ""; return f; }
function detailOf(it) {
  const f = it.fields, bits = [];
  const where = [f.delivery_street, f.delivery_city].filter(Boolean).join(", ");
  if (it.action === "site") bits.push(`site “${f.site_label}” of ${it.siteOfName}`);
  if (it.existing) bits.push("updates " + it.customer_id); else if (it.action === "customer") bits.push("new");
  if (it.parentName) bits.push("parent " + it.parentName);
  if (it.sameLegalAs && it.action !== "site") bits.push("same legal name as " + it.sameLegalAs);
  if (where) bits.push("delivers to " + where);
  if (it.contacts.length) bits.push(it.contacts.length + " contact" + (it.contacts.length > 1 ? "s" : ""));
  if (it.hubNotes.length) bits.push("route notes " + it.hubNotes.map(n => n.hub).join(", "));
  if (it.merged.length) bits.push(it.merged.join("; "));
  return bits.join(" · ");
}

// workbook = {directory, customers, delivery, licensing, terms} as values arrays (a missing tab is null);
// existing = {customers, sites, documents} from the database; importUserId (optional) is who will import, so a document edited
// in the app since the last import can be shown as kept. Returns {items, problems, missingHeaders, unlinkedSites}.
export function planImport(workbook, existing, importUserId) {
  const wb = workbook || {}, ex = existing || {};
  const exCustomers = ex.customers || [];
  const items = [], problems = [], missingHeaders = {};
  const read = (tab) => {
    const name = TABS[tab];
    if (!Array.isArray(wb[tab]) || !wb[tab].length) { missingHeaders[name] = HEADERS[tab].slice(); problems.push(`${name}: tab not found or empty, so it was not read.`); return []; }
    const r = readTab(wb[tab], undefined, HEADERS[tab]);
    missingHeaders[name] = r.missing;
    if (r.missing.length) { problems.push(`${name}: missing column${r.missing.length > 1 ? "s" : ""} ${r.missing.join(", ")}, so the tab was not read.`); return []; }
    return r.rows;
  };
  const dir = read("directory"), cust = read("customers"), del = read("delivery");
  const exById = new Map(exCustomers.map(c => [s(c.customer_id), c])), exByName = new Map(exCustomers.map(c => [lc(c.name), c]));
  if (missingHeaders[TABS.directory].length) items.push({ key: "problem:directory", source: { tab: TABS.directory, row: 0 }, action: "problem", decision: "skip", customer_id: "", name: TABS.directory,
    detail: problems.find(p => p.startsWith(TABS.directory)), fields: emptyFields(), contacts: [], hubNotes: [], merged: [] });

  const contactsOf = (r, hasSite) => {
    const out = [];
    const bill = { type: "billing", first_name: r["BILLING CONTACT › First Name"], last_name: r["BILLING CONTACT › Last Name"], phone: r["BILLING CONTACT › Phone"],
      email: r["Billing / AP Email"], preferred_method: method(r["Best Way to Reach"]), cc_on_statements: false, at_site: false };
    const hasBill = [bill.first_name, bill.last_name, bill.phone, bill.email].some(Boolean);
    if (hasBill) out.push(bill);
    if (yes(r["Owner same as billing contact?"])) { if (hasBill) bill.owner_same = true; }
    else {
      const o = { type: "owner", first_name: r["COMPANY OWNER › First Name"], last_name: r["COMPANY OWNER › Last Name"], phone: r["COMPANY OWNER › Phone"], email: r["COMPANY OWNER › Email"], preferred_method: null, cc_on_statements: false, at_site: false };
      if ([o.first_name, o.last_name, o.phone, o.email].some(Boolean)) out.push(o);
    }
    if (yes(r["Delivery same as billing contact?"])) { if (hasBill) out.push({ type: "receiving", first_name: bill.first_name, last_name: bill.last_name, phone: bill.phone, email: bill.email, preferred_method: null, cc_on_statements: false, at_site: hasSite }); }
    else if (r["Delivery Contact Name"] || r["Delivery Phone"]) { const [f, l] = splitName(r["Delivery Contact Name"]); out.push({ type: "receiving", first_name: f, last_name: l, phone: r["Delivery Phone"], email: "", preferred_method: null, cc_on_statements: false, at_site: hasSite }); }
    for (const e of s(r["CC on Statements (emails)"]).split(/[,;\s]+/).filter(x => /@/.test(x)))
      if (lc(e) !== lc(bill.email)) out.push({ type: "billing", first_name: "", last_name: "", phone: "", email: e, preferred_method: null, cc_on_statements: true, at_site: false });
    return out;
  };

  // ---- Customer Directory ----
  const legalFirst = new Map();   // legalKey → the first customer item with that legal name
  const dirItems = [];
  for (const r of dir) {
    const name = r["Customer (QuickBooks name)"]; if (!name) continue;
    const f = emptyFields();
    Object.assign(f, { name, also_known_as: r["Also Known As"], legal_name: r["Legal / Billing Company Name"], account_status: status(r["Account Status"]), primary_hub: hubCode(r["Primary Hub"]),
      billing_street: r["BILLING ADDRESS › Street"], billing_city: r["BILLING ADDRESS › City"], billing_state: r["BILLING ADDRESS › State"], billing_zip: r["BILLING ADDRESS › ZIP"],
      last_verified: isoDate(r["Last Verified"]), notes: r["Notes"], hub: hubCode(r["Primary Hub"]), site_label: "Primary" });
    if (yes(r["Same as billing?"])) Object.assign(f, { delivery_street: f.billing_street, delivery_city: f.billing_city, delivery_state: f.billing_state, delivery_zip: f.billing_zip });
    else Object.assign(f, { delivery_street: r["DELIVERY ADDRESS › Street"], delivery_city: r["DELIVERY ADDRESS › City"], delivery_state: r["DELIVERY ADDRESS › State"], delivery_zip: r["DELIVERY ADDRESS › ZIP"] });
    const it = { key: "dir:" + r._row, source: { tab: TABS.directory, row: r._row }, action: "customer", decision: "customer", customer_id: normId(r["Customer ID"]), name, detail: "",
      fields: f, contacts: contactsOf(r, !!f.delivery_street), hubNotes: [], merged: [], parentRaw: r["Parent / Related Account"] };
    if (!it.customer_id && r["Customer ID"]) problems.push(`${TABS.directory} row ${r._row}: Customer ID “${r["Customer ID"]}” is not an ADC number; a new one is assigned.`);
    const lk = legalKey(f.legal_name || name), first = legalFirst.get(lk);
    const addr = (x) => [streetKey(x.delivery_street), lc(x.delivery_city), s(x.delivery_zip)].join("|");
    if (first) {
      it.sameLegalAs = first.name; it.siteOf = first.key; it.relatedTo = first.key;
      if (f.delivery_street && addr(f) !== addr(first.fields)) {
        it.action = "site"; it.decision = "site"; it.siteOfName = first.name;
        const tail = name.match(/\s+-\s+([^-]+)$/);
        f.site_label = s(tail && tail[1]) || f.delivery_city || "Site " + r._row;
      }
    } else legalFirst.set(lk, it);
    dirItems.push(it);
  }
  // parents: Parent / Related Account names another row (by name, Customer ID or legal name)
  for (const it of dirItems) {
    const p = lc(it.parentRaw); delete it.parentRaw; if (!p) continue;
    const hit = dirItems.find(o => o !== it && (lc(o.name) === p || lc(o.customer_id) === p || (o.fields.legal_name && lc(o.fields.legal_name) === p)));
    if (hit) { it.parent = hit.key; it.parentName = hit.name; }
    else { const e = exByName.get(p) || exById.get(normId(p)); if (e) { it.parentCustomerId = s(e.customer_id); it.parentName = e.name; } else problems.push(`${TABS.directory} row ${it.source.row}: parent “${p}” is not another row; no parent is set.`); }
  }

  // ---- Customers tab: match by name and fill only blank fields; a name not in the Directory is a new customer ----
  const byName = new Map(); for (const it of dirItems) if (!byName.has(lc(it.name))) byName.set(lc(it.name), it);
  const custItems = [];
  for (const r of cust) {
    const name = r["Customer"]; if (!name) continue;
    const vals = { also_known_as: r["Also Known As"], legal_name: r["Legal Name"], account_status: status(r["Account Status"]),
      billing_street: r["Street"], billing_city: r["City"], billing_state: r["State"], billing_zip: r["ZIP"] };
    const [cf, cl] = splitName(r["Contact"]);
    // the Customers tab's one contact has no role column, so it is "other" (spec §8), never billing
    const contact = (r["Contact"] || r["Phone"] || r["Email"]) ? { type: "other", first_name: cf, last_name: cl, phone: r["Phone"], email: r["Email"], preferred_method: null, cc_on_statements: false, at_site: false } : null;
    let it = byName.get(lc(name));
    if (it) {
      const filled = [];
      for (const [k, v] of Object.entries(vals)) if (blank(it.fields[k]) && !blank(v)) { it.fields[k] = v; filled.push(k.replace(/_/g, " ")); }
      if (contact && !it.contacts.some(c => c.type === "billing" && !c.cc_on_statements)) { it.contacts.push(contact); filled.push("contact"); }
      if (filled.length) it.merged.push(`Customers row ${r._row} filled ${filled.join(", ")}`);
      continue;
    }
    const f = Object.assign(emptyFields(), vals, { name });
    it = { key: "cust:" + r._row, source: { tab: TABS.customers, row: r._row }, action: "customer", decision: "customer", customer_id: "", name, detail: "", fields: f, contacts: contact ? [contact] : [], hubNotes: [], merged: [] };
    byName.set(lc(name), it); custItems.push(it);
  }

  // ---- Delivery Notes: attach by exact Customer name; site fields + EB/LA route notes ----
  const delProblems = [];
  for (const r of del) {
    const name = r["Customer"]; if (!name) continue;
    const it = [...dirItems, ...custItems].find(o => o.name === name);
    if (!it) { const msg = `${TABS.delivery} row ${r._row}: no customer named “${name}”; nothing from this row is imported.`; problems.push(msg);
      delProblems.push({ key: "del:" + r._row, source: { tab: TABS.delivery, row: r._row }, action: "problem", decision: "skip", customer_id: "", name, detail: msg, fields: emptyFields(), contacts: [], hubNotes: [], merged: [] }); continue; }
    const f = it.fields;
    const set = { hub: hubCode(r["Serving Hub"]), receiving_hours: r["Receiving Days / Hours"], gate_code: r["Gate / Access Code"], parking_unloading: r["Parking & Unloading (dock, liftgate, forklift)"],
      hazmat_restrictions: r["Hazmat / Site Restrictions"], container_notes: r["Cylinder / Container Notes (pigs, dewars, bins, swaps)"], special_instructions: r["Special Delivery Instructions"], site_last_verified: isoDate(r["Last Verified"]) };
    for (const [k, v] of Object.entries(set)) if (!blank(v)) f[k] = v;
    for (const [hub, sc, notes] of [["EB", "Scale on Route? (from East Bay)", "Route / Scale Notes (East Bay)"], ["LA", "Scale on Route? (from SoCal)", "Route / Scale Notes (SoCal)"]]) {
      const n = { hub, scale_on_route: scale(r[sc]), route_notes: r[notes] };
      if (n.scale_on_route !== null || n.route_notes) it.hubNotes.push(n);
    }
    if (r["Site Contact"] || r["Site Phone"]) {
      const [fn, ln] = splitName(r["Site Contact"]);
      const same = it.contacts.find(c => c.type === "receiving" && lc([c.first_name, c.last_name].join(" ")) === lc(r["Site Contact"]));
      if (same) { if (!same.phone) same.phone = r["Site Phone"]; }
      else it.contacts.push({ type: "receiving", first_name: fn, last_name: ln, phone: r["Site Phone"], email: "", preferred_method: null, cc_on_statements: false, at_site: true });
    }
  }

  // ---- customer numbers: the sheet's own, an existing customer's by name, else max + 1 ----
  let max = Math.max(0, ...exCustomers.map(c => num(c.customer_id)), ...dirItems.map(i => num(i.customer_id)));
  const used = new Set();
  for (const it of [...dirItems, ...custItems]) {
    if (it.customer_id && used.has(it.customer_id) && it.action !== "site") { problems.push(`${it.source.tab} row ${it.source.row}: Customer ID ${it.customer_id} is used twice; a new one is assigned.`); it.customer_id = ""; }
    if (!it.customer_id) { const e = exByName.get(lc(it.name)); if (e && !used.has(s(e.customer_id))) it.customer_id = s(e.customer_id); }
    if (!it.customer_id && it.action !== "site") it.customer_id = fmtId(++max);
    if (it.customer_id) used.add(it.customer_id);
    it.existing = exById.has(it.customer_id);
    // the sheet's number already belongs to a customer made in the app (no import_source) with another name and legal name:
    // a different customer, so the row is reported, never merged into it
    const e = it.existing && it.action !== "site" ? exById.get(it.customer_id) : null;
    if (e && !e.import_source && lc(e.name) !== lc(it.name) && !(s(e.legal_name) && s(it.fields.legal_name) && legalKey(e.legal_name) === legalKey(it.fields.legal_name))) {
      const msg = `${it.source.tab} row ${it.source.row}: Customer ID ${it.customer_id} already belongs to “${e.name}”, a customer added in the app; this row is not imported. Clear its Customer ID to give it a new number, or fix the sheet.`;
      problems.push(msg); Object.assign(it, { action: "problem", decision: "skip", detail: msg, existing: false });
    }
  }
  for (const it of [...dirItems, ...custItems]) {
    if (it.action === "problem") { it.options = ["skip"]; continue; }
    it.options = it.action === "site" ? ["site", "customer", "related", "skip"] : it.relatedTo ? ["customer", "related", "skip"] : ["customer", "skip"];
    it.detail = detailOf(it);
  }
  items.push(...dirItems, ...custItems, ...delProblems);

  // ---- Licensing & Entity / Account Terms: one document per row, for the customer named as Delivery Notes names it (exact name
  // of a planned row), else an existing customer by name or ADC number. Tabs that are absent are simply not read.
  const exDocs = ex.documents || [];
  const target = (cell) => {
    const it = [...dirItems, ...custItems].find(o => o.name === cell);
    if (it) { const owner = it.action === "site" ? [...dirItems, ...custItems].find(o => o.key === it.siteOf) || it : it; return { customerKey: it.key, customer_id: owner.customer_id, name: it.name }; }
    const e = exByName.get(lc(cell)) || exById.get(normId(cell));
    return e ? { customer_id: s(e.customer_id), name: e.name } : null;
  };
  const dateCell = (tab, row, col, v) => { const d = blank(v) ? "" : isoDate(v); if (d === null) problems.push(`${tab} row ${row}, ${col}: “${s(v)}” is not a date`); return d || ""; };
  const slice = (tab, pre, action, build) => {
    if (!Array.isArray(wb[tab]) || !wb[tab].length) return;
    for (const r of read(tab)) {
      const name = r["Customer"]; if (!name) continue;
      const src = { tab: TABS[tab], row: r._row }, t = target(name);
      if (!t) { const msg = `${TABS[tab]} row ${r._row}: no customer named “${name}”; nothing from this row is imported.`; problems.push(msg);
        items.push({ key: pre + r._row, source: src, action: "problem", decision: "skip", options: ["skip"], customer_id: "", name, detail: msg, fields: {}, contacts: [], hubNotes: [], merged: [] }); continue; }
      const { doc, detail } = build(r, (col) => dateCell(TABS[tab], r._row, col, r[col]));
      const it = { key: pre + r._row, source: src, action, decision: action, options: [action, "skip"], customer_id: t.customer_id, name: t.name, customerKey: t.customerKey, detail, doc,
        fields: {}, contacts: [], hubNotes: [], merged: [] };
      items.push(it); docLines.push(it);
    }
  };
  const docLines = [];
  slice("licensing", "lic:", "license", (r, date) => {
    const doc = { doc_type: "cannabis_license", number: r["License #"], status: r["Status"], issued: date("Issued"), expires: date("Expires"),
      extra: { licensee_legal_name: r["Licensee Legal Name"], license_type: r["License Type"], county_premises: r["County / Premises"], owners: r["Owners on the License"],
        entity_status_sos: r["Entity Status (SOS)"], source_note: r["Source"] },
      source: "import", checked_on: date("Checked"), notes: r["Notes"] };
    return { doc, detail: `${doc.number || "no number"} · expires ${doc.expires || "—"}` };
  });
  slice("terms", "psa:", "psa", (r, date) => {
    const extra = {}; for (const [k, col] of PSA_COLS) extra[k] = date(col);
    return { doc: { doc_type: "psa", extra }, detail: "PSA · " + psaStage(extra) };
  });
  // the document an earlier import wrote for the same customer and type (matchDocs); kept when edited in the app since
  const subj = (cid) => { const e = exById.get(s(cid)); return e && e.id != null ? String(e.id) : null; };
  matchDocs(docLines.map(it => ({ tab: it.source.tab, row: it.source.row, type: it.doc.doc_type, subject: subj(it.customer_id) })), exDocs).forEach((e, i) => {
    const it = docLines[i]; if (!e) return;
    if (appEdited(e, importUserId || null)) { it.kept = true; it.detail += " · kept: edited in the app since the last import"; }
    else { it.updates = true; it.detail += " · updates the imported document"; }
  });
  // feed sites (FEED_ORDERS) no customer will claim: no Ops link and a customer name matching no row and no existing customer.
  // Listed in the review; they stay unlinked until a later stage links them by hand (spec §8).
  const names = new Set([...dirItems, ...custItems].map(i => lc(i.name)).concat(exCustomers.map(c => lc(c.name))));
  const unlinkedSites = (ex.sites || []).filter(x => !x.customer_id && !names.has(lc(x.customer)))
    .map(x => ({ site_key: s(x.site_key), customer: s(x.customer), addr: s(x.addr) }));
  return { items, problems, missingHeaders, unlinkedSites };
}

// A row counts as app-edited — its fields are kept and only blanks are filled — when it changed after the import last wrote it
// (updated_at later than import_source.at, which /api/import stamps), so the importer's own app edits count too; or when someone
// other than the importer last wrote it (the only test for a row the import never wrote).
const ms = (v) => { const t = v ? Date.parse(v) : NaN; return isNaN(t) ? null : t; };
function appEdited(row, uid) {
  if (!row) return false;
  const at = ms(row.import_source && row.import_source.at), up = ms(row.updated_at);
  if (at !== null && up !== null && up > at) return true;
  return row.updated_by != null && row.updated_by !== uid;
}
const PSA_COLS = [["quote_sent", "Quote Sent"], ["quote_accepted", "Quote Accepted"], ["sent_for_signature", "PSA Sent for Signature"],
  ["signed_customer", "PSA Signed (Customer)"], ["countersigned", "Countersigned (AdChem)"], ["effective_date", "Effective Date"]];
const LIC_EXTRA = ["licensee_legal_name", "license_type", "county_premises", "owners", "entity_status_sos", "source_note"];
export function psaStage(x) { const v = x || {}; return v.signed_customer && v.countersigned ? "signed" : PSA_COLS.some(([k]) => v[k]) ? "in progress" : "none"; }
// The documents earlier imports wrote, matched to this run's lines = [{tab, row, type, subject}] (subject: the customer's uuid, null for a
// customer not yet in the database). A document is reused only for the same doc type and the same customer: first the one from the
// same sheet row, then (rows moved in the sheet) another of the same tab, type and customer. Each document is claimed by one line.
function matchDocs(lines, docs) {
  const pool = (docs || []).filter(d => d && d.id != null && d.import_source), claimed = new Set(), out = lines.map(() => null);
  const ok = (d, l) => !claimed.has(d.id) && l.subject != null && d.doc_type === l.type && String(d.subject_id) === l.subject && s(d.import_source.tab) === l.tab;
  for (const exact of [true, false]) lines.forEach((l, i) => {
    if (out[i]) return;
    const d = pool.find(x => ok(x, l) && (!exact || Number(x.import_source.row) === l.row));
    if (d) { out[i] = d; claimed.add(d.id); }
  });
  return out;
}
// an app-edited row keeps the stamp of the import that last wrote it, so its edit still counts on the next run
const stamp = (srcObj, e, edited) => edited && e && e.import_source && e.import_source.at ? { ...srcObj, at: e.import_source.at } : srcObj;
function merge(e, v, edited) {
  if (!e) return v;
  if (edited) return blank(e) ? v : e;
  return blank(v) ? e : v;
}
const val = (k, v) => DATE_FIELDS.has(k) ? (isoDate(v) || null) : s(v);

// plan (as reviewed) + existing = {customers, sites, contacts, hubNotes} → the rows to write. Sites, hub notes and contacts refer to their
// customer by customer_ref (the ADC number); bindRows swaps in the database ids once the customers are written.
export function applyPlan(plan, existing, importUserId) {
  const ex = existing || {}, uid = importUserId || null;
  const exC = ex.customers || [], exS = ex.sites || [], exK = ex.contacts || [], exN = ex.hubNotes || [];
  const byId = new Map(exC.map(c => [s(c.customer_id), c])), byUuid = new Map(exC.map(c => [c.id, c]));
  const items = ((plan && plan.items) || []).filter(i => i && i.key && i.fields);
  const byKey = new Map(items.map(i => [i.key, i]));
  const problems = [];
  const decided = (it) => {
    const d = DECISIONS.includes(it.decision) ? it.decision : "skip";
    if (it.action === "skip" || it.action === "problem") return "skip";
    if (d === "site" && !byKey.has(it.siteOf)) return "skip";
    if (d === "related" && !byKey.has(it.relatedTo || it.siteOf)) return "customer";
    return d;
  };
  // customer numbers: rows without one (a site turned into a customer) take max + 1
  // (a row with no sheet ID reuses an existing customer of the same name first, so committing the same plan twice never numbers it twice)
  let max = Math.max(0, ...exC.map(c => num(c.customer_id)), ...items.map(i => num(normId(i.customer_id))));
  const byName = new Map(); for (const c of exC) if (!byName.has(lc(c.name))) byName.set(lc(c.name), c);
  const cidOf = new Map();
  for (const it of items) { const d = decided(it); if (d === "customer" || d === "related") { const e = byName.get(lc(it.name));
    cidOf.set(it.key, normId(it.customer_id) || (e && normId(e.customer_id)) || fmtId(++max)); } }
  const seen = new Set();
  for (const [k, id] of [...cidOf]) { if (seen.has(id)) { const n = fmtId(++max); cidOf.set(k, n); problems.push(`${byKey.get(k).name}: Customer ID ${id} is used twice; ${n} is assigned.`); } seen.add(cidOf.get(k)); }

  const customers = [], sites = new Map(), notes = [], contacts = [];
  const src = (it) => ({ tab: s(it.source && it.source.tab), row: Number(it.source && it.source.row) || 0 });
  for (const it of items) {
    const d = decided(it); if (d === "skip" || d === "site") continue;
    const cid = cidOf.get(it.key), e = byId.get(cid), edited = appEdited(e, uid), f = it.fields;
    const row = { customer_id: cid };
    for (const k of CUSTOMER_COLS) row[k] = merge(e && (DATE_FIELDS.has(k) ? (e[k] || null) : s(e[k])), val(k, f[k]), edited);
    if (!STATUSES.includes(row.account_status)) row.account_status = "active";
    if (!HUBS.includes(row.primary_hub) && !e) row.primary_hub = "";
    if (!row.name) row.name = s(it.name) || cid;
    row.import_source = stamp(src(it), e, edited); row.updated_by = edited ? e.updated_by : uid;
    const pKey = d === "related" ? (it.relatedTo || it.siteOf) : it.parent;
    let parent = pKey && cidOf.get(pKey) || (d !== "related" && normId(it.parentCustomerId)) || null;
    if (parent === cid) parent = null;
    if (e && edited && e.parent_customer_id) parent = null;   // an app-set parent stays
    row.parent_ref = parent;
    customers.push(row);
  }
  const known = new Set([...customers.map(c => c.customer_id), ...byId.keys()]);
  const nameOf = new Map([...exC.map(c => [s(c.customer_id), c.name]), ...customers.map(c => [c.customer_id, c.name])]);

  // sites: reuse the customer's existing site (by its Ops link, else the feed's customer name) at the same street; else the Task 5 key
  const claimed = new Set();
  const siteFor = (cid, names, label, street) => {
    const uuid = byId.get(cid) && byId.get(cid).id;
    const mine = exS.filter(x => !claimed.has(x.site_key) && ((uuid && x.customer_id === uuid) || (!x.customer_id && names.some(n => n && lc(x.customer) === lc(n)))));
    const key = cid + " — " + label;
    return mine.find(x => street && streetKey(x.addr) === streetKey(street))
      || exS.find(x => x.site_key === key && (!x.customer_id || x.customer_id === uuid))
      || (label === "Primary" && mine.find(x => x.site_label === "Primary" && (blank(x.addr) || x.unconfirmed)))
      || (!street && (mine.find(x => x.site_label === label) || (mine.length === 1 ? mine[0] : null)))   // no street to compare: the customer's site by label, or its only one
      || null;
  };
  const siteKeyOf = new Map();
  for (const it of items) {
    const d = decided(it); if (d === "skip") continue;
    const f = it.fields;
    // no delivery street: still import Delivery Notes (site fields, route notes, site contacts) onto the customer's site
    const notesOnly = blank(f.delivery_street) && (SITE_OPS.some(k => !blank(f[k])) || !blank(f.site_last_verified) || (it.hubNotes || []).length || (it.contacts || []).some(c => c.at_site));
    if (blank(f.delivery_street) && !notesOnly) continue;
    const owner = d === "site" ? byKey.get(it.siteOf) : it, cid = d === "site" ? cidOf.get(it.siteOf) : cidOf.get(it.key);
    if (!cid || !known.has(cid)) { problems.push(`${it.name}: its customer is skipped, so the site is not imported.`); continue; }
    const label = d === "site" ? (s(f.site_label) || s(f.delivery_city) || "Site") : "Primary";
    const street = s(f.delivery_street), city = s(f.delivery_city);
    const addr = street + (city && s(f.delivery_state) && s(f.delivery_zip) ? `, ${city} ${s(f.delivery_state)} ${s(f.delivery_zip)}` : "");
    const e = siteFor(cid, [nameOf.get(cid), owner.name, it.name], label, street);
    const key = e ? e.site_key : cid + " — " + label; claimed.add(key); siteKeyOf.set(it.key, key);
    if (!e && notesOnly) problems.push(`${it.name}: no delivery address in the workbook; its Delivery Notes go on a new site “${key}” with a blank address. Add the address on the customer's Sites tab.`);
    const edited = appEdited(e, uid);
    const prev = sites.get(key);
    const row = { site_key: key, customer_ref: cid, customer: (e && s(e.customer)) || nameOf.get(cid) || owner.name,
      addr: merge(e && s(e.addr), addr, edited), city: merge(e && s(e.city), city, edited), hub: merge(e && s(e.hub), HUBS.includes(f.hub) ? f.hub : "", edited),
      site_label: e ? (s(e.site_label) || label) : label, code_raw: e ? s(e.code_raw) : "", code: e ? (e.code || null) : null };
    for (const k of SITE_OPS) row[k] = merge(e && s(e[k]), s(f[k]), edited);
    row.last_verified = merge(e && (e.last_verified || null), isoDate(f.site_last_verified), edited);
    row.import_source = stamp(src(it), e, edited); row.updated_by = edited ? e.updated_by : uid;
    if (prev) for (const k of [...SITE_OPS, "addr", "city", "hub", "last_verified"]) if (!blank(prev[k])) row[k] = prev[k];
    sites.set(key, row);
    for (const n of it.hubNotes || []) {
      const hub = hubCode(n.hub); if (!hub) continue;
      const en = exN.find(x => x.site_key === key && x.hub === hub);
      if (appEdited(en, uid)) continue;
      const sc = typeof n.scale_on_route === "boolean" ? n.scale_on_route : null;
      const nr = { site_key: key, hub, scale_on_route: sc === null && en ? (en.scale_on_route ?? null) : sc, route_notes: merge(en && s(en.route_notes), s(n.route_notes), false), updated_by: uid };
      const i = notes.findIndex(x => x.site_key === key && x.hub === hub); if (i >= 0) notes[i] = nr; else notes.push(nr);
    }
  }

  // contacts: inserted only when (customer, type, email|phone|name) is new
  const exCid = (c) => { const x = byUuid.get(c.customer_id); return x ? s(x.customer_id) : ""; };
  const dupKey = (cid, c) => [cid, c.type, lc(c.email) || lc(c.phone).replace(/\D/g, "") || lc([c.first_name, c.last_name].join(" ").trim())].join("|");
  const have = new Set(exK.map(c => dupKey(exCid(c), c)));
  for (const it of items) {
    const d = decided(it); if (d === "skip") continue;
    const cid = d === "site" ? cidOf.get(it.siteOf) : cidOf.get(it.key); if (!cid || !known.has(cid)) continue;
    for (const c of it.contacts || []) {
      const type = ["receiving", "billing", "owner"].includes(c.type) ? c.type : "other";
      const row = { customer_ref: cid, site_key: c.at_site && siteKeyOf.has(it.key) ? siteKeyOf.get(it.key) : null, type,
        first_name: s(c.first_name), last_name: s(c.last_name), phone: s(c.phone), email: s(c.email), preferred_method: method(c.preferred_method),
        cc_on_statements: !!c.cc_on_statements, notes: c.owner_same ? "Also the company owner." : "", active: true, import_source: src(it), updated_by: uid };
      if (![row.first_name, row.last_name, row.phone, row.email].some(Boolean)) continue;
      const k = dupKey(cid, row); if (have.has(k)) continue; have.add(k); contacts.push(row);
    }
  }
  // documents: one per license / PSA line whose customer is imported or already exists; the one an earlier import wrote for the same
  // sheet row is updated in place (by its id), unless it was edited in the app since — then it is kept as it is
  const documents = [], documentsKept = [], lines = [];
  const dateOrNull = (v) => isoDate(v) || null;
  for (const it of ((plan && plan.items) || [])) {
    if (!it || !it.doc || !((it.action === "license" && it.decision === "license") || (it.action === "psa" && it.decision === "psa"))) continue;
    const srcObj = src(it), what = it.action === "psa" ? "PSA" : "license", tab = it.action === "psa" ? TABS.terms : TABS.licensing;
    // a line's tab follows its kind: a license comes from Licensing & Entity, a PSA from Account Terms, whatever the plan says
    if (srcObj.tab !== tab) { problems.push(`${s(it.name)}: a ${what} line must come from the ${tab} tab, not “${srcObj.tab}”; it is not imported.`); continue; }
    let cid = "";
    if (it.customerKey && byKey.has(it.customerKey)) { const c = byKey.get(it.customerKey), d = decided(c); cid = d === "site" ? cidOf.get(c.siteOf) : cidOf.get(c.key); }
    else if (!it.customerKey) cid = normId(it.customer_id);
    if (!cid || !known.has(cid)) { problems.push(`${srcObj.tab} row ${srcObj.row}: its customer “${s(it.name)}” is skipped, so the ${what} is not imported.`); continue; }
    const e = byId.get(cid);
    lines.push({ it, srcObj, cid, tab, row: srcObj.row, type: it.action === "psa" ? "psa" : "cannabis_license", subject: e && e.id != null ? String(e.id) : null });
  }
  const matched = matchDocs(lines, ex.documents), usedIds = new Set();
  lines.forEach((l, i) => {
    const { it, srcObj, cid } = l; let e = matched[i];
    if (e && usedIds.has(e.id)) { problems.push(`${srcObj.tab} row ${srcObj.row}: its document is already updated by another line; a new one is added.`); e = null; }
    if (e) usedIds.add(e.id);
    if (e && appEdited(e, uid)) { documentsKept.push({ id: e.id, tab: srcObj.tab, row: srcObj.row, name: s(it.name) }); return; }
    const x = it.doc.extra || {}, extra = {};
    let doc;
    if (it.action === "license") {
      for (const k of LIC_EXTRA) extra[k] = s(x[k]);
      doc = { doc_type: "cannabis_license", title: "", number: s(it.doc.number), status: s(it.doc.status), issued: dateOrNull(it.doc.issued), expires: dateOrNull(it.doc.expires),
        checked_on: dateOrNull(it.doc.checked_on), notes: s(it.doc.notes), extra };
    } else {
      for (const [k] of PSA_COLS) extra[k] = isoDate(x[k]) || "";
      doc = { doc_type: "psa", title: "", number: "", status: "", issued: null, expires: null, checked_on: null, notes: "", extra };
    }
    documents.push({ ...(e ? { id: e.id, subject_id: String(e.subject_id) } : {}), customer_key: cid, doc, import_source: srcObj, updated_by: uid });
  });
  const nextCustomerNumber = Math.max(0, ...exC.map(c => num(c.customer_id)), ...customers.map(c => num(c.customer_id))) + 1;
  return { customers, sites: [...sites.values()], siteHubNotes: notes, contacts, documents, documentsKept, nextCustomerNumber, problems };
}

// Swap customer_ref for database ids (idMap: ADC number → dispatch_customers.id) and add company and times. Rows whose customer
// has no id are dropped. parents lists the parent links to set once every customer exists.
export function bindRows(applied, idMap, company, now) {
  const get = (ref) => idMap instanceof Map ? idMap.get(ref) : idMap[ref];
  const a = applied || {};
  const customers = (a.customers || []).map(({ parent_ref, ...c }) => ({ ...c, company, updated_at: now }));
  const parents = (a.customers || []).filter(c => c.parent_ref && get(c.parent_ref)).map(c => ({ customer_id: c.customer_id, parent_customer_id: get(c.parent_ref) }));
  const sites = (a.sites || []).filter(x => get(x.customer_ref)).map(({ customer_ref, ...x }) => ({ ...x, company, customer_id: get(customer_ref), synced_at: now, updated_at: now }));
  const siteHubNotes = (a.siteHubNotes || []).map(n => ({ ...n, company, updated_at: now }));
  const contacts = (a.contacts || []).filter(x => get(x.customer_ref)).map(({ customer_ref, ...x }) => ({ ...x, company, customer_id: get(customer_ref) }));
  // a document id is reused only for the customer it already belongs to, and once per call
  const seenDoc = new Set();
  const documents = (a.documents || []).filter(x => get(x.customer_key)).map(x => {
    const subject = String(get(x.customer_key)), reuse = x.id != null && String(x.subject_id) === subject && !seenDoc.has(x.id);
    if (reuse) seenDoc.add(x.id);
    return { ...(reuse ? { id: x.id } : {}), company, subject_type: "customer", subject_id: subject,
      ...x.doc, source: "import", review_status: "live", import_source: { ...x.import_source, at: now }, updated_by: x.updated_by, updated_at: now };
  });
  return { customers, parents, sites, siteHubNotes, contacts, documents };
}
