// POST /api/assets — the asset register's server side (migration 007; the database guards decide what each caller may record).
//   {action:'read', eventId, kind, photoPath} -> {candidates, raw[, error]}  Vision reads the photo, the picker ranks serials
//   {action:'events', events:[…]}             -> {ok, results}               a phone's batch, each event applied on its own
//   {action:'counts'}                         -> {rows}                       grouped counts, no serials
// read and events: a driver, manage_assets, or a super admin. counts: any member. Everything runs as the caller (RLS applies).
import { requireUser, sb, json, fail, handle, companyFrom, companyContext, hasPerm } from "../_lib/auth.js";
import { readText } from "../_lib/vision.js";
import { pickSerials } from "../_lib/serials.js";

const UUID_RE = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const UUID = new RegExp("^" + UUID_RE + "$", "i");
const TYPES = ["created", "delivered", "collected", "to_vendor", "from_vendor", "filled", "moved", "loaded", "sighted", "corrected"];
const PLACE_KINDS = ["hub", "site", "vendor"];
const OWNER_KINDS = ["adchem", "vendor", "customer"];
const FILLS = ["full", "empty", "unknown"];
const KINDS = ["cylinder", "dewar", "pig", "tank", "bin", "tote"];
const MAX_EVENTS = 200;
const MAX_TEXT = 200;
const MAX_NOTE = 1000;

export const normSerial = s => String(s == null ? "" : s).toUpperCase().replace(/[\s-]+/g, "");
const isText = (v, max = MAX_TEXT) => typeof v === "string" && v.length <= max;
const isObj = v => v !== null && typeof v === "object" && !Array.isArray(v);

export async function onRequestPost({ request, env }) {
  return handle(async () => {
    const body = await request.json().catch(() => ({}));
    const action = String((body && body.action) || "");
    if (!["read", "events", "counts"].includes(action)) return fail("Unknown action.", 400, "bad_action");
    const { me, token, company } = await requireUser(request, env, null, companyFrom(request, body));
    const db = sb(env, token);

    if (action === "counts") return json({ rows: await db.rpc("dispatch_asset_counts_for", { c: company }) });

    if (!(me.role === "driver" || hasPerm(me, "manage_assets"))) return fail("not allowed", 403, "forbidden");
    if (action === "read") return read(env, db, company, body);

    const events = body.events;
    if (!Array.isArray(events) || !events.length) return fail("events must be a non-empty list", 400, "bad_events");
    if (events.length > MAX_EVENTS) return fail("at most " + MAX_EVENTS + " events per batch", 400, "bad_events");
    for (let i = 0; i < events.length; i++) {
      const why = invalid(events[i], company);
      if (why) return fail("event " + i + ": " + why, 400, "bad_event");
    }
    const results = [];
    for (const e of events) results.push(await applyOne(db, company, e));
    return json({ ok: true, results });
  });
}

async function read(env, db, company, body) {
  const eventId = String(body.eventId || "");
  const kind = body.kind == null || body.kind === "" ? "cylinder" : String(body.kind);
  if (!UUID.test(eventId)) return fail("eventId must be a uuid", 400, "bad_id");
  if (!KINDS.includes(kind)) return fail("kind must be one of " + KINDS.join(", "), 400, "bad_kind");
  if (body.photoPath !== company + "/asset/" + eventId + ".jpg") return fail("bad path", 400, "bad_path");
  const bytes = await db.storageRead("dispatch-docs", body.photoPath);
  if (!bytes) return fail("photo not found", 400, "not_found");
  let rules;
  try { rules = (await companyContext(db, env, company)).settings.assetSerialRules; } catch (e) { rules = undefined; }
  try {
    const { blocks, raw, imageHeight } = await readText(env, bytes);
    return json({ candidates: pickSerials(blocks, { kind, rules: isObj(rules) ? rules : undefined, imageHeight }), raw });
  } catch (e) {
    // never 5xx: the sheet falls back to typing the serial
    return json({ candidates: [], raw: "", error: String((e && e.message) || e) });
  }
}

function placeBad(p) {
  if (p === undefined || p === null) return "";
  if (!isObj(p) || !PLACE_KINDS.includes(p.kind) || !isText(p.id) || !p.id.trim()) return "a place is {kind: hub|site|vendor, id}";
  return "";
}

// shape only; what the caller may record is the database's call
function invalid(e, company) {
  if (!isObj(e)) return "not an object";
  if (typeof e.id !== "string" || !UUID.test(e.id)) return "id must be a uuid";
  if (!TYPES.includes(e.type)) return "type must be one of " + TYPES.join(", ");
  if (!isText(e.serial, 64) || !normSerial(e.serial)) return "serial is required";
  if (typeof e.occurredAt !== "string" || !/^\d{4}-\d{2}-\d{2}T/.test(e.occurredAt) || isNaN(Date.parse(e.occurredAt))) return "occurredAt must be an ISO time";
  const fb = placeBad(e.from); if (fb) return "from: " + fb;
  const tb = placeBad(e.to); if (tb) return "to: " + tb;
  if (e.containerTypeId != null && !(typeof e.containerTypeId === "string" && UUID.test(e.containerTypeId))) return "containerTypeId must be a uuid";
  if (e.ownerKind != null && !OWNER_KINDS.includes(e.ownerKind)) return "ownerKind must be one of " + OWNER_KINDS.join(", ");
  if (e.ownerId != null && !isText(e.ownerId)) return "ownerId must be text";
  if (e.fillAfter != null && !FILLS.includes(e.fillAfter)) return "fillAfter must be one of " + FILLS.join(", ");
  if (e.orderId != null && !isText(e.orderId)) return "orderId must be text";
  if (e.bolNumber != null && !(Number.isInteger(e.bolNumber) && e.bolNumber >= 0 && e.bolNumber <= 2147483647)) return "bolNumber must be a whole number";
  if (e.siteKey != null && !isText(e.siteKey)) return "siteKey must be text";
  if (e.photoPath != null && e.photoPath !== company + "/asset/" + e.id + ".jpg") return "photoPath must be " + company + "/asset/" + e.id + ".jpg";
  if (e.gps != null && !isObj(e.gps)) return "gps must be an object";
  if (e.ocr != null && !isObj(e.ocr)) return "ocr must be an object";
  if (e.gps != null && JSON.stringify(e.gps).length > 2000) return "gps is too large";
  if (e.ocr != null && JSON.stringify(e.ocr).length > 10000) return "ocr is too large";
  if (e.note != null && !isText(e.note, MAX_NOTE)) return "note must be text of " + MAX_NOTE + " characters or fewer";
  return "";
}

// A UUID-shaped SHA-256 of a seed (version 5 bits, RFC 4122 variant): the ids the server makes for an event's companions (its
// asset, its created event, its sighted correction) are the same on every retry, so the primary key catches a second write.
export async function derivedId(seed) {
  const b = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(seed))).slice(0, 16);
  b[6] = (b[6] & 0x0f) | 0x50; b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map(x => x.toString(16).padStart(2, "0")).join("");
  return h.slice(0, 8) + "-" + h.slice(8, 12) + "-" + h.slice(12, 16) + "-" + h.slice(16, 20) + "-" + h.slice(20);
}

// PostgREST's error body ({code, message, details}) as thrown by sb(); anything else (network, a gateway page) keeps its text
function pgError(err) {
  const text = String((err && err.message) || err);
  try {
    const j = JSON.parse(text);
    if (j && typeof j === "object" && !Array.isArray(j)) return { code: String(j.code || ""), message: String(j.message || text), details: String(j.details || "") };
  } catch (e) { /* not JSON */ }
  return { code: "", message: text, details: "" };
}
const dupOn = (pe, constraint) => pe.code === "23505" && pe.message.includes(constraint);
// a refusal the caller cannot fix by retrying (RLS, a guard raise) vs anything else, which the phone keeps and sends again
const refusal = pe => (pe.code === "42501" || pe.code === "P0001" ? { status: "rejected", reason: pe.message } : { status: "error", reason: pe.message });

async function lookup(db, company, serial) {
  const found = await db.rpc("dispatch_asset_by_serial", { p_company: company, p_serial: serial });
  return Array.isArray(found) && found[0] ? found[0] : null;
}

function eventRow(company, assetId, e, over = {}) {
  const row = {
    id: e.id, company, asset_id: assetId, event_type: e.type,
    from_kind: e.from ? e.from.kind : null, from_id: e.from ? e.from.id : null,
    to_kind: e.to ? e.to.kind : null, to_id: e.to ? e.to.id : null,
    fill_after: e.fillAfter == null ? null : e.fillAfter,
    occurred_at: e.occurredAt,
    order_id: e.orderId == null ? null : e.orderId,
    bol_number: e.bolNumber == null ? null : e.bolNumber,
    site_key: e.siteKey == null ? null : e.siteKey,
    photo_path: e.photoPath == null ? null : e.photoPath,
    gps: e.gps == null ? null : e.gps,
    ocr: e.ocr == null ? null : e.ocr,
    note: e.note == null ? "" : e.note,
  };
  return { ...row, ...over };
}
const COMPANION = { fill_after: null, order_id: null, bol_number: null, photo_path: null, gps: null, ocr: null };

// the created event of an asset the server made for event e (same id on every retry; already there is fine)
async function createdEvent(db, company, assetId, e, place) {
  try {
    await db.insert("dispatch_asset_events", [eventRow(company, assetId, e, {
      ...COMPANION, id: await derivedId(e.id + ":created"), event_type: "created", from_kind: null, from_id: null,
      to_kind: place.kind, to_id: place.id, site_key: null, note: "",
    })], true);
    return null;
  } catch (err) {
    const pe = pgError(err);
    return dupOn(pe, "dispatch_asset_events_pkey") ? null : refusal(pe);
  }
}

async function applyOne(db, company, e) {
  const out = { id: e.id };
  const serial = normSerial(e.serial);
  try {
    // a retried batch: the event is already in (when the caller can see it), so nothing more is written
    const seen = await db.get("dispatch_asset_events?select=id&id=eq." + e.id).catch(() => []);
    if (seen.length) return { ...out, status: "duplicate" };

    const myAssetId = await derivedId(e.id + ":asset");
    const place = e.from || e.to;
    let asset = await lookup(db, company, serial);
    let mine = false;   // the asset is the one this event creates (now, or on an earlier try of the same batch)

    if (!asset) {
      if (e.type !== "created" && !e.containerTypeId) return { ...out, status: "rejected", reason: "a new serial needs a container type" };
      if (!place) return { ...out, status: "rejected", reason: "a new serial needs a place (from or to)" };
      const row = {
        id: myAssetId, company, serial,
        container_type_id: e.containerTypeId || null,
        owner_kind: e.ownerKind || "adchem", owner_id: e.ownerId || "",
        fill_state: "unknown", location_kind: place.kind, location_id: place.id,
      };
      try {
        await db.insert("dispatch_assets", [row], true);
        asset = row; out.created = true;
      } catch (err) {
        const pe = pgError(err);
        if (pe.code !== "23505") return { ...out, ...refusal(pe) };
        // another phone (or an earlier try) created this serial a moment ago: look again, once
        asset = await lookup(db, company, serial);
        if (!asset) return { ...out, status: "error", reason: pe.message };
      }
    }
    out.assetId = asset.id;
    mine = asset.id === myAssetId;
    if (e.type === "created" && !mine) return { ...out, status: "rejected", reason: "serial " + serial + " is already in the register" };
    if (mine && e.type !== "created") {
      const bad = await createdEvent(db, company, asset.id, e, place);
      if (bad) return { ...out, ...bad };
    }

    // the register had it somewhere else: a sighted correction {from: current, to: from} goes in with the movement, in one
    // statement, so a retry whose movement is already in writes neither (and a stale correction can never move the asset back)
    const current = { kind: asset.location_kind, id: asset.location_id };
    const rows = [];
    let at = current;
    if (e.from && (e.from.kind !== current.kind || e.from.id !== current.id)) {
      rows.push(eventRow(company, asset.id, e, {
        ...COMPANION, id: await derivedId(e.id + ":sighted"), event_type: "sighted",
        from_kind: current.kind, from_id: current.id, to_kind: e.from.kind, to_id: e.from.id,
        note: "was at " + current.kind + " " + current.id,
      }));
      at = { kind: e.from.kind, id: e.from.id };
    }
    rows.push(eventRow(company, asset.id, e));

    let warning = "";
    if (e.type === "filled") {
      if (at.kind !== "hub") warning = "asset is not at a hub";
      else if (!asset.container_type_id) warning = "no fill weight on this container type";
      else {
        let t = null;
        try { t = await db.get("dispatch_container_types?select=fill_lb&company=eq." + encodeURIComponent(company) + "&id=eq." + asset.container_type_id); } catch (err) { t = null; }
        if (!t) warning = "could not read container type";
        else if (!t[0] || t[0].fill_lb == null) warning = "no fill weight on this container type";
      }
    }

    try {
      await db.insert("dispatch_asset_events", rows, true);
      if (rows.length > 1) out.corrected = true;
    } catch (err) {
      const pe = pgError(err);
      if (dupOn(pe, "dispatch_asset_events_pkey")) {
        // the correction's id already in means it went in with this movement before; either way, let the movement's own insert decide
        if (rows.length === 1 || !pe.details.includes(rows[0].id)) return { ...out, status: "duplicate" };
      } else if (rows.length === 1 || refusal(pe).status === "error") {
        return { ...out, ...refusal(pe) };
      } else {
        // the correction or the movement was refused: try the movement on its own (a driver's correction can name a place
        // that is not their stop); if the movement is the refused one it fails again below
        warning = "location correction not recorded: " + pe.message + (warning ? "; " + warning : "");
      }
      try {
        await db.insert("dispatch_asset_events", [rows[rows.length - 1]], true);
      } catch (err2) {
        const pe2 = pgError(err2);
        if (dupOn(pe2, "dispatch_asset_events_pkey")) return { ...out, status: "duplicate" };
        return { ...out, ...refusal(pe2) };
      }
    }
    if (warning) out.warning = warning;
    return { status: "applied", ...out };
  } catch (err) {
    return { ...out, ...refusal(pgError(err)) };
  }
}
