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
const photoOk = (company, p) => typeof p === "string" && new RegExp("^" + company.replace(/-/g, "\\-") + "/asset/" + UUID_RE + "\\.jpg$", "i").test(p);

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
  if (e.photoPath != null && !photoOk(company, e.photoPath)) return "photoPath must be " + company + "/asset/<uuid>.jpg";
  if (e.gps != null && !isObj(e.gps)) return "gps must be an object";
  if (e.ocr != null && !isObj(e.ocr)) return "ocr must be an object";
  if (e.gps != null && JSON.stringify(e.gps).length > 2000) return "gps is too large";
  if (e.ocr != null && JSON.stringify(e.ocr).length > 10000) return "ocr is too large";
  if (e.note != null && !isText(e.note, MAX_NOTE)) return "note must be text of " + MAX_NOTE + " characters or fewer";
  return "";
}

// PostgREST's error body ({code, message}) as thrown by sb(); anything else keeps its text
function pgError(err) {
  const text = String((err && err.message) || err);
  try { const j = JSON.parse(text); if (j && typeof j === "object") return { code: String(j.code || ""), message: String(j.message || text) }; } catch (e) { /* not JSON */ }
  return { code: "", message: text };
}
const isDup = pe => pe.code === "23505" && /dispatch_asset_events_pkey/.test(pe.message);

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

async function applyOne(db, company, e) {
  const out = { id: e.id };
  const serial = normSerial(e.serial);
  try {
    // a retried batch: the event is already in (when the caller can see it), so nothing more is written
    const seen = await db.get("dispatch_asset_events?select=id&id=eq." + e.id).catch(() => []);
    if (seen.length) return { ...out, status: "duplicate" };

    const found = await db.rpc("dispatch_asset_by_serial", { p_company: company, p_serial: serial });
    let asset = Array.isArray(found) && found[0] ? found[0] : null;

    if (!asset) {
      const place = e.from || e.to;
      if (e.type !== "created" && !e.containerTypeId) return { ...out, status: "rejected", reason: "a new serial needs a container type" };
      if (!place) return { ...out, status: "rejected", reason: "a new serial needs a place (from or to)" };
      asset = {
        id: crypto.randomUUID(), company, serial,
        container_type_id: e.containerTypeId || null,
        owner_kind: e.ownerKind || "adchem", owner_id: e.ownerId || "",
        fill_state: "unknown", location_kind: place.kind, location_id: place.id,
      };
      await db.insert("dispatch_assets", [asset], true);
      out.assetId = asset.id; out.created = true;
      if (e.type !== "created") {
        await db.insert("dispatch_asset_events", [eventRow(company, asset.id, e, {
          id: crypto.randomUUID(), event_type: "created", from_kind: null, from_id: null,
          to_kind: place.kind, to_id: place.id, fill_after: null, order_id: null, bol_number: null,
          photo_path: null, gps: null, ocr: null, note: "",
        })], true);
      }
    } else {
      out.assetId = asset.id;
      if (e.type === "created") return { ...out, status: "rejected", reason: "serial " + serial + " is already in the register" };
    }

    // the register had it somewhere else: record where it really was first, a millisecond earlier so it sorts before the movement
    let at = { kind: asset.location_kind, id: asset.location_id };
    if (e.from && (e.from.kind !== at.kind || e.from.id !== at.id)) {
      try {
        await db.insert("dispatch_asset_events", [eventRow(company, asset.id, e, {
          id: crypto.randomUUID(), event_type: "sighted",
          from_kind: at.kind, from_id: at.id, to_kind: e.from.kind, to_id: e.from.id,
          fill_after: null, occurred_at: new Date(Date.parse(e.occurredAt) - 1).toISOString(),
          order_id: null, bol_number: null, photo_path: null, ocr: null,
          note: "was at " + at.kind + " " + at.id,
        })], true);
        out.corrected = true;
      } catch (err) {
        out.warning = "location correction not recorded: " + pgError(err).message;
      }
      at = { kind: e.from.kind, id: e.from.id };
    }

    let fillWarning = "";
    if (e.type === "filled") {
      if (at.kind !== "hub") fillWarning = "asset is not at a hub";
      else {
        const t = asset.container_type_id
          ? await db.get("dispatch_container_types?select=fill_lb&company=eq." + encodeURIComponent(company) + "&id=eq." + asset.container_type_id).catch(() => [])
          : [];
        if (!t[0] || t[0].fill_lb == null) fillWarning = "no fill weight on this container type";
      }
    }

    try {
      await db.insert("dispatch_asset_events", [eventRow(company, asset.id, e)], true);
    } catch (err) {
      const pe = pgError(err);
      if (isDup(pe)) return { ...out, status: "duplicate" };
      return { ...out, status: "rejected", reason: pe.message };
    }
    if (fillWarning) out.warning = out.warning ? out.warning + "; " + fillWarning : fillWarning;
    return { status: "applied", ...out };
  } catch (err) {
    return { ...out, status: "rejected", reason: pgError(err).message };
  }
}
