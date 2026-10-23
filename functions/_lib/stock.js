// Stock movements and the stock-below-minimum email (migration 008). Both functions here are pure: movementsFor turns one entry
// from the Inventory screen into dispatch_stock_movements rows (or throws Error(message) on a bad shape), buildStockAlerts turns
// dispatch_stock_onhand_for rows into one email per company. sendStockAlerts (expiry.js) does the reads, the mail and the log.
import { isEmail } from "./email.js";

export const KINDS = ["received", "produced", "adjusted", "counted", "consumed"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_TEXT = 200, MAX_NOTE = 1000, MAX_QTY = 1e9;
const bad = m => { throw new Error(m); };
const text = (v, name, max = MAX_TEXT) => {
  if (v === undefined || v === null) return "";
  if (typeof v !== "string" || v.length > max) bad(name + " must be text of " + max + " characters or fewer");
  return v.trim();
};
const num = (v, name) => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  if (!Number.isFinite(n)) bad(name + " must be a number");
  if (Math.abs(n) > MAX_QTY) bad(name + " is too large");
  return n;
};

// The key of an entry, trimmed: bulk pounds (product only, lb), a counted container (product + container, count) or a supply
// (item only, count). Throws on any other combination or a unit that does not match.
export function stockKeyOf(entry) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) bad("entry must be an object");
  const hub = text(entry.hub, "hub", 64);
  if (!hub) bad("hub is required");
  const product = text(entry.product, "product"), container = text(entry.container, "container"), item = text(entry.item, "item");
  let kind;
  if (item) { if (product || container) bad("a supply has an item only (no product or container)"); kind = "supply"; }
  else if (!product) bad("product or item is required");
  else kind = container ? "container" : "bulk";
  const unit = kind === "bulk" ? "lb" : "count";
  if (entry.unit !== unit) bad("unit must be " + unit + " for " + (kind === "bulk" ? "bulk " + product : kind === "supply" ? item : product + " " + container));
  return { hub, product, container, item, unit, kind };
}

// The gas-container keys of a company, 'product|size_label' per container type row ({product, size_label}); the register owns the
// counts under those keys (full, in-service containers at a hub), so no stock entry may be written under one.
export function gasKeysOf(types) {
  return new Set((Array.isArray(types) ? types : []).filter(t => t && typeof t === "object")
    .map(t => String(t.product || "").trim() + "|" + String(t.size_label || "").trim()).filter(k => k !== "|"));
}

// entry = {kind, hub, product, container, item, qty, unit, vendorId?, note?, bulkProduct?, lbPerUnit?, onhand?}; company; who (the
// caller's user id); now (a Date); gasKeys (optional: a Set from gasKeysOf, or an array of 'product|container' strings). → rows
// shaped as dispatch_stock_movements (no id). counted uses entry.onhand as the current figure (the server passes its own) and
// writes nothing when the count already matches. Any kind whose key is a gas-container key throws (the register counts those).
export function movementsFor(entry, company, who, now, gasKeys) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) bad("entry must be an object");
  if (!KINDS.includes(entry.kind)) bad("kind must be one of " + KINDS.join(", "));
  const k = stockKeyOf(entry);
  if (k.kind === "container" && gasKeys && (gasKeys instanceof Set ? gasKeys.has(k.product + "|" + k.container) : Array.isArray(gasKeys) && gasKeys.includes(k.product + "|" + k.container)))
    bad(k.product + " " + k.container + " is a gas container: the register counts those (record fills and moves on the Assets tab)");
  const qty = num(entry.qty, "qty");
  const note = text(entry.note, "note", MAX_NOTE);
  // 'undelivered <order id>' is the orders trigger's reversal marker (008 net rule); a hand entry must never look like one
  if (/^undelivered /i.test(note)) bad("a note cannot start with \"undelivered \" (reserved for order reversals)");
  let vendor = null;
  if (entry.vendorId !== undefined && entry.vendorId !== null && entry.vendorId !== "") {
    if (entry.kind !== "received") bad("vendorId is only for received");
    if (typeof entry.vendorId !== "string" || !UUID.test(entry.vendorId)) bad("vendorId must be a uuid");
    vendor = entry.vendorId;
  }
  const at = (now instanceof Date ? now : new Date()).toISOString();
  const row = (product, container, item, unit, q, n) => ({ company, hub: k.hub, product, container, item, qty: q, unit,
    reason: entry.kind, vendor_id: vendor, order_id: null, asset_event_id: null, note: n, occurred_at: at, recorded_by: who || null });
  const same = q => row(k.product, k.container, k.item, k.unit, q, note);
  const positive = () => { if (!(qty > 0)) bad("qty must be above zero"); };
  switch (entry.kind) {
    case "received": positive(); return [same(qty)];
    case "consumed": positive(); if (!note) bad("a note is required for consumed"); return [same(-qty)];
    case "adjusted": if (qty === 0) bad("qty must not be zero"); if (!note) bad("a note is required for adjusted"); return [same(qty)];
    case "counted": {
      if (qty < 0) bad("a count cannot be negative");
      const cur = entry.onhand === undefined || entry.onhand === null ? 0 : num(entry.onhand, "onhand");
      const delta = qty - cur;
      return delta === 0 ? [] : [same(delta)];
    }
    default: {   // produced: + containers of (product, container), − pounds of the bulk product
      positive();
      if (k.kind !== "container") bad("produced needs a counted container (product and container)");
      const bulk = entry.bulkProduct === undefined || entry.bulkProduct === null ? "Carbon Dioxide" : text(entry.bulkProduct, "bulkProduct");
      if (!bulk) bad("bulkProduct is required");
      const lb = entry.lbPerUnit === undefined || entry.lbPerUnit === null ? 50 : num(entry.lbPerUnit, "lbPerUnit");
      if (!(lb > 0)) bad("lbPerUnit must be above zero");
      const n = note || "produced";
      return [row(k.product, k.container, "", "count", qty, n), row(bulk, "", "", "lb", -(qty * lb), n)];
    }
  }
}

// valid, trimmed, de-duplicated stock alert recipients (settings.stockAlertRecipients); nothing else is ever added
export function stockRecipientsOf(settings) {
  const r = settings && Array.isArray(settings.stockAlertRecipients) ? settings.stockAlertRecipients : [];
  const out = [];
  r.forEach(a => { if (isEmail(a)) { const t = a.trim(); if (!out.some(x => x.toLowerCase() === t.toLowerCase())) out.push(t); } });
  return out;
}

const mdY = iso => iso.slice(5, 7) + "/" + iso.slice(8, 10) + "/" + iso.slice(0, 4);
const shortName = co => (co && (co.short_name || co.name || co.id)) || "";
export const stockLabel = r => r.item ? String(r.item) : String(r.product || "") + (r.container ? " " + r.container : "");
const fmt = v => (v === null || v === undefined ? "—" : String(Number(v)));

// companies: [{id, name, short_name}]; belowRowsByCompany: {id: dispatch_stock_onhand_for rows} (rows not below, and rows whose
// minimum has alert = false, are ignored); settingsByCompany: {id: settings data}; today: YYYY-MM-DD; appUrl: footer link ('' omits it).
// → [{company, to, subject, text, count}], one per company with at least one valid recipient and at least one row below minimum with
// its alert on.
export function buildStockAlerts(companies, belowRowsByCompany, settingsByCompany, today, appUrl) {
  const out = [];
  for (const co of companies || []) {
    const to = stockRecipientsOf((settingsByCompany || {})[co.id]);
    const rows = (((belowRowsByCompany || {})[co.id]) || []).filter(r => r && r.below === true && r.alert !== false)
      .sort((a, b) => String(a.hub).localeCompare(String(b.hub)) || stockLabel(a).localeCompare(stockLabel(b)));
    if (!to.length || !rows.length) continue;
    const name = shortName(co);
    const lines = [name + " stock below minimum, as of " + mdY(today) + ":", "",
      ...rows.map(r => r.hub + ": " + stockLabel(r) + " " + fmt(r.qty) + " " + r.unit + " (min " + fmt(r.min_qty) + ")")];
    if (appUrl) lines.push("", "Open AdChem Ops: " + appUrl);
    out.push({ company: co.id, to, subject: name + " — stock below minimum: " + rows.length + " item(s)", text: lines.join("\n"), count: rows.length });
  }
  return out;
}
