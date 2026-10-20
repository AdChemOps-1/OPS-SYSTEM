// POST /api/orderlog — write orders to the company's "Dispatch Orders Out" sheet (the Orders In return flow).
// {orderIds:[...]} writes those; {rebuild:true} rewrites the whole sheet from the database (the repair path).
import { requireUser, sb, json, fail, handle, companyFrom, companyContext } from "../_lib/auth.js";
import { writeOrdersOut } from "../_lib/orderlog.js";

export async function onRequestPost({ request, env }) {
  return handle(async () => {
    const body = await request.json().catch(() => ({}));
    const { token, company } = await requireUser(request, env, ["admin","coordinator"], companyFrom(request, body));
    const db = sb(env, token);
    const ctx = await companyContext(db, env, company);
    let r;
    try { r = await writeOrdersOut(env, db, ctx, company, body.orderIds || [], !!body.rebuild); }
    catch (e) { return fail("Orders Out: " + e.message, 502, "google"); }
    if (r.skipped) return fail(r.skipped, 400, "config");
    return json(r);
  });
}
