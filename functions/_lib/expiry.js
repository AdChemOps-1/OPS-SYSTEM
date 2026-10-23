// The daily expiry email: per company, the live documents inside its warning window or already past, to the addresses on
// Setup → Warnings (settings.expiryEmailRecipients). buildExpiryEmails is pure; sendExpiryEmails does the reads, the mail and the log.
import { mailFromOf } from "./auth.js";
import { sendMail } from "./mail.js";
import { buildStockAlerts, stockRecipientsOf } from "./stock.js";

// the app's DOC_TYPES (public/documents.js), which the server cannot import
export const DOC_TYPE_LABEL = { cannabis_license: "Cannabis license", resale_certificate: "Resale certificate", psa: "PSA", chp_hazmat_license: "CHP HazMat license",
  dot_registration: "DOT registration", insurance_certificate: "Insurance certificate", cdl: "CDL", medical_card: "Medical card", other: "Other" };
import { isEmail } from "./email.js";   // dispatch_set_warnings' rule for a recipient
export { isEmail };

// valid, trimmed, de-duplicated recipients from a company's settings; nothing else is ever added (no orders@ default)
export function recipientsOf(settings) {
  const r = settings && Array.isArray(settings.expiryEmailRecipients) ? settings.expiryEmailRecipients : [];
  const out = [];
  r.forEach(a => { if (isEmail(a)) { const t = a.trim(); if (!out.some(x => x.toLowerCase() === t.toLowerCase())) out.push(t); } });
  return out;
}
const dayNum = iso => Math.round(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86400000);
const mdY = iso => iso.slice(5, 7) + "/" + iso.slice(8, 10) + "/" + iso.slice(0, 4);
// YYYY-MM-DD in a time zone
export function todayIn(tz, now = new Date()) {
  const p = {}; new Intl.DateTimeFormat("en-CA", { timeZone: tz || "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(now).forEach(x => { p[x.type] = x.value; });
  return p.year + "-" + p.month + "-" + p.day;
}
const shortName = co => (co && (co.short_name || co.name || co.id)) || "";
const daysOf = (r, today) => (r.expires && today ? dayNum(String(r.expires)) - dayNum(today) : Number(r.days_left) || 0);

// companies: [{id, name, short_name}]; dueRows: dispatch_documents_due rows (any companies); settingsByCompany: {id: settings data};
// today: YYYY-MM-DD; appUrl: link in the footer ('' omits it). → [{company, to, subject, text, count}], one per company with
// at least one valid recipient and at least one due row.
export function buildExpiryEmails(companies, dueRows, settingsByCompany, today, appUrl) {
  const out = [];
  for (const co of companies || []) {
    const to = recipientsOf((settingsByCompany || {})[co.id]);
    const rows = (dueRows || []).filter(r => r.company === co.id && r.expires);
    if (!to.length || !rows.length) continue;
    const name = shortName(co);
    const withDays = rows.map(r => ({ r, d: daysOf(r, today) }))
      .sort((a, b) => a.d - b.d || String(a.r.subject_name || "").localeCompare(String(b.r.subject_name || "")));
    const expired = withDays.filter(x => x.d < 0).length, due = withDays.length - expired;
    const line = ({ r, d }) => {
      const label = r.doc_type === "other" && String(r.title || "").trim() ? String(r.title).trim() : (DOC_TYPE_LABEL[r.doc_type] || r.doc_type);
      return [r.subject_name || r.title || "(no name)", label, r.number || null, "expires " + mdY(String(r.expires)) + " " + (d < 0 ? "(EXPIRED " + -d + " days ago)" : "(" + d + " days)")]
        .filter(x => x !== null && x !== "").join(" — ");
    };
    const lines = [name + " documents expired or expiring within the warning window, as of " + mdY(today) + ":"];
    for (const [type, heading] of [["customer", "Customers"], ["company", name], ["person", "People"]]) {
      const g = withDays.filter(x => x.r.subject_type === type);
      if (g.length) lines.push("", heading, ...g.map(line));
    }
    if (appUrl) lines.push("", "Open AdChem Ops: " + appUrl);
    out.push({ company: co.id, to, subject: name + " — documents expiring: " + due + " due, " + expired + " expired", text: lines.join("\n"), count: withDays.length });
  }
  return out;
}

const DUE_COLS = "company,id,subject_type,subject_id,subject_name,doc_type,title,number,expires,days_left,review_status";
const enc = encodeURIComponent;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// dispatch_doc_subject_name answers only for a member who can see the subject, so under the service role (no auth.uid())
// every name is null: look the missing ones up directly.
async function fillNames(db, rows, companies) {
  const miss = rows.filter(r => !r.subject_name);
  if (!miss.length) return rows;
  const custIds = [...new Set(miss.filter(r => r.subject_type === "customer" && UUID.test(r.subject_id)).map(r => r.subject_id))];
  const userIds = [...new Set(miss.filter(r => r.subject_type === "person" && UUID.test(r.subject_id)).map(r => r.subject_id))];
  const cust = {}, users = {};
  if (custIds.length) (await db.get("dispatch_customers?select=id,company,name&id=in.(" + custIds.join(",") + ")")).forEach(c => { cust[c.company + "|" + c.id] = c.name; });
  if (userIds.length) (await db.get("dispatch_users?select=user_id,name,email&user_id=in.(" + userIds.join(",") + ")")).forEach(u => { users[u.user_id] = u.name || u.email; });
  const coName = {}; (companies || []).forEach(c => { coName[c.id] = c.name; });
  return rows.map(r => r.subject_name ? r : { ...r, subject_name:
    r.subject_type === "customer" ? cust[r.company + "|" + r.subject_id] || null :
    r.subject_type === "company" ? (r.subject_id === r.company ? coName[r.company] : null) || null :
    users[r.subject_id] || null });
}

// db: the client to read and log with (the caller's, or the service role on the cron path). company: one id, or null for every
// active company. who: the caller's user id, or null (cron). → {sent:[{company,to,count}], skipped:[{company,reason[,message]}]}
export async function sendExpiryEmails(env, db, { company, who, mailFrom, today, appUrl }) {
  const one = company ? "&id=eq." + enc(company) : "&active=eq.true";
  const companies = await db.get("companies?select=id,name,short_name,data" + one + "&order=id");
  const srows = await db.get("dispatch_company_settings?select=company,data" + (company ? "&company=eq." + enc(company) : ""));
  const settingsByCompany = {}; srows.forEach(s => { settingsByCompany[s.company] = s.data || {}; });
  let due = await db.getAll("dispatch_documents_due?select=" + DUE_COLS + (company ? "&company=eq." + enc(company) : "") + "&order=company,expires,id");
  const ids = new Set(companies.map(c => c.id));
  due = await fillNames(db, due.filter(r => ids.has(r.company)), companies);
  const url = s => appUrl || (s && s.appUrl) || "";
  const sent = [], skipped = [];
  for (const co of companies) {
    const s = settingsByCompany[co.id] || {};
    const [mail] = buildExpiryEmails([co], due, { [co.id]: s }, today, url(s));
    if (!mail) { skipped.push({ company: co.id, reason: recipientsOf(s).length ? "nothing_due" : "no_recipients" }); continue; }
    try { await sendMail(env, { from: (company && mailFrom) || mailFromOf(co.data, env), to: mail.to, subject: mail.subject, text: mail.text }); }
    catch (e) { skipped.push({ company: co.id, reason: "send_failed", message: String(e.message || e) }); continue; }
    sent.push({ company: co.id, to: mail.to, count: mail.count });
    try { await db.insert("dispatch_log", [{ company: co.id, who: who || null, what: "expiry_email", detail: { count: mail.count, to: mail.to } }], true); }
    catch (e) { /* the mail went out; a failed audit row does not undo it */ }
  }
  // the stock-below-minimum email rides the same run; nothing it does can change the documents result above
  let stock;
  try { stock = await sendStockAlerts(env, db, { company, who, mailFrom, today, appUrl, companies, settingsByCompany }); }
  catch (e) { stock = { sent: [], skipped: companies.map(co => ({ company: co.id, reason: "read_failed", message: String((e && e.message) || e) })) }; }
  return { sent, skipped, stock };
}

// The daily stock email (migration 008): per company with stockAlertRecipients, the dispatch_stock_onhand_for rows below their
// minimum whose minimum has its alert on (alert = false rows are flagged on the screen only). db: the caller's client (Send now) or the service role (cron; the 008 grant lets it read every company). companies and
// settingsByCompany may be passed in (sendExpiryEmails has just read them); otherwise they are read the same way.
// → {sent:[{company,to,count}], skipped:[{company, reason: no_recipients|nothing_below|send_failed|read_failed[, message]}]}
export async function sendStockAlerts(env, db, { company, who, mailFrom, today, appUrl, companies, settingsByCompany }) {
  if (!companies) companies = await db.get("companies?select=id,name,short_name,data" + (company ? "&id=eq." + enc(company) : "&active=eq.true") + "&order=id");
  if (!settingsByCompany) {
    settingsByCompany = {};
    (await db.get("dispatch_company_settings?select=company,data" + (company ? "&company=eq." + enc(company) : ""))).forEach(s => { settingsByCompany[s.company] = s.data || {}; });
  }
  const sent = [], skipped = [];
  for (const co of companies) {
    const s = settingsByCompany[co.id] || {};
    if (!stockRecipientsOf(s).length) { skipped.push({ company: co.id, reason: "no_recipients" }); continue; }
    let rows;
    try { rows = await db.rpc("dispatch_stock_onhand_for", { c: co.id }); }
    catch (e) { skipped.push({ company: co.id, reason: "read_failed", message: String((e && e.message) || e) }); continue; }
    const [mail] = buildStockAlerts([co], { [co.id]: (Array.isArray(rows) ? rows : []).filter(r => r && r.alert !== false) }, { [co.id]: s }, today, appUrl || s.appUrl || "");
    if (!mail) { skipped.push({ company: co.id, reason: "nothing_below" }); continue; }
    try { await sendMail(env, { from: (company && mailFrom) || mailFromOf(co.data, env), to: mail.to, subject: mail.subject, text: mail.text }); }
    catch (e) { skipped.push({ company: co.id, reason: "send_failed", message: String(e.message || e) }); continue; }
    sent.push({ company: co.id, to: mail.to, count: mail.count });
    try { await db.insert("dispatch_log", [{ company: co.id, who: who || null, what: "stock_alert", detail: { count: mail.count, to: mail.to } }], true); }
    catch (e) { /* the mail went out; a failed audit row does not undo it */ }
  }
  return { sent, skipped };
}
