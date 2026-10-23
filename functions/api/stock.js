// POST /api/stock — stock movements and on-hand (migration 008; functions/_lib/stock.js shapes the rows).
//   {action:'move', entry:{kind, hub, product, container, item, qty, unit, vendorId?, note?, bulkProduct?, lbPerUnit?}} -> {ok, ids[, note]}
//        manage_assets (or a super admin). counted reads on-hand here and writes the delta from the server's figure (the client's
//        entry.onhand is ignored); a count that already matches writes nothing ({ok:true, ids:[], note:'no change'}). An entry under
//        a gas-container key (a product + container that is one of the company's container types) is 400: the register owns those.
//   {action:'onhand'} -> {rows}   dispatch_stock_onhand_for rows (qty, min_qty, below, alert); view_assets, an editor (admin /
//                                 coordinator), or a super admin
//   {action:'below'}  -> {rows}   the same rows with below = true (alert on or off: the screen flags both)
// Everything runs as the caller (RLS applies; dstock_insert refuses filled and delivered rows whatever is sent).
import { requireUser, sb, json, fail, handle, companyFrom, hasPerm } from "../_lib/auth.js";
import { movementsFor, stockKeyOf, gasKeysOf } from "../_lib/stock.js";

const EDITORS = ["admin", "coordinator"];

function pgError(err) {
  const t = String((err && err.message) || err);
  try { const j = JSON.parse(t); if (j && typeof j === "object" && !Array.isArray(j)) return { code: String(j.code || ""), message: String(j.message || t) }; } catch (e) { /* not JSON */ }
  return { code: "", message: t };
}

export async function onRequestPost({ request, env }) {
  return handle(async () => {
    const body = await request.json().catch(() => ({}));
    const action = String((body && body.action) || "");
    if (!["move", "onhand", "below"].includes(action)) return fail("Unknown action.", 400, "bad_action");
    const { user, me, token, company } = await requireUser(request, env, null, companyFrom(request, body));
    const db = sb(env, token);

    if (action !== "move") {
      if (!(hasPerm(me, "view_assets") || EDITORS.includes(me.role))) return fail("You don't have the view assets permission.", 403, "forbidden");
      const rows = await db.rpc("dispatch_stock_onhand_for", { c: company });
      return json({ rows: action === "below" ? rows.filter(r => r.below === true) : rows });
    }

    if (!hasPerm(me, "manage_assets")) return fail("You don't have the manage assets permission.", 403, "forbidden");
    const entry = body.entry;
    let gasKeys = null;
    const shape = e => { try { return { rows: movementsFor(e, company, user.id, new Date(), gasKeys) }; } catch (err) { return { why: String((err && err.message) || err) }; } };
    // the client's onhand is never used: counted reads the figure here, after the shape is checked (a bad entry is 400 before any read)
    let v = shape(entry && typeof entry === "object" && !Array.isArray(entry) ? { ...entry, onhand: 0 } : entry);
    if (v.why) return fail(v.why, 400, "bad_entry");
    // a gas-container key (product + size_label of one of the company's container types) is never written here: the register counts those
    gasKeys = gasKeysOf(await db.get("dispatch_container_types?select=product,size_label&company=eq." + encodeURIComponent(company)));
    v = shape({ ...entry, onhand: 0 });
    if (v.why) return fail(v.why, 400, "gas_key");
    if (entry.kind === "counted") {
      // the count's delta is taken from on-hand, so a caller who cannot read on-hand (no rows ≠ zero) may not count
      if (!(hasPerm(me, "view_assets") || EDITORS.includes(me.role))) return fail("counting needs View assets", 403, "forbidden");
      const k = stockKeyOf(entry);
      const all = await db.rpc("dispatch_stock_onhand_for", { c: company });
      const cur = (Array.isArray(all) ? all : []).find(r => (r.hub || "") === k.hub && (r.product || "") === k.product && (r.container || "") === k.container && (r.item || "") === k.item && r.unit === k.unit);
      v = shape({ ...entry, onhand: cur ? Number(cur.qty) : 0 });
      if (v.why) return fail(v.why, 400, "bad_entry");
    }
    const rows = v.rows;
    if (!rows.length) return json({ ok: true, ids: [], note: "no change" });
    // ids made here and inserted with return=minimal: a manage_assets holder without view_assets cannot read the rows back
    const withIds = rows.map(r => ({ id: crypto.randomUUID(), ...r }));
    try { await db.insert("dispatch_stock_movements", withIds, true); }
    catch (err) {
      const pe = pgError(err);
      if (pe.code === "42501") return fail(pe.message, 403, "forbidden");
      const refused = pe.code === "P0001" || /^2[23]/.test(pe.code);   // a guard raise, a constraint or a bad value
      return fail(pe.message, refused ? 400 : 500, refused ? "refused" : "server");
    }
    return json({ ok: true, ids: withIds.map(r => r.id) });
  });
}
