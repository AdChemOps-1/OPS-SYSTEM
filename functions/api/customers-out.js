// POST /api/customers-out — write customers to the company's "Customers Out" sheet (spec §9, read by the AR Command Center via IMPORTRANGE).
// {customerIds:[uuid]} rewrites those customers' rows; {rebuild:true} rewrites the whole tab from the database (the repair path).
import { requireUser, sb, json, fail, handle, companyFrom, companyContext } from "../_lib/auth.js";
import { writeCustomersOut } from "../_lib/customersout.js";

export async function onRequestPost({ request, env }) {
  return handle(async () => {
    const body = await request.json().catch(() => ({}));
    const { token, company } = await requireUser(request, env, ["admin","coordinator"], companyFrom(request, body));
    const db = sb(env, token);
    const ctx = await companyContext(db, env, company);
    let r;
    try { r = await writeCustomersOut(env, db, ctx, company, body.customerIds || [], !!body.rebuild); }
    catch (e) { return fail("Customers Out: " + e.message, 502, "google"); }
    if (r.skipped) return fail(r.skipped, 400, "config");
    return json(r);
  });
}
