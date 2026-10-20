// Who is calling, which company they are acting in, and what they may do there.
// The browser sends the Supabase session token; we ask Supabase who it belongs to and read their memberships.

export function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...extra } });
}
export function fail(message, status = 400, code = "error") {
  return json({ error: { code, message } }, status);
}

// company comes from ?company= on GET or body.company on POST (the body is read once by the route and passed in)
export function companyFrom(request, body) {
  const q = new URL(request.url).searchParams.get("company");
  return String((body && body.company) || q || "").toLowerCase().replace(/[^a-z0-9-]/g, "");
}

export async function requireUser(request, env, roles, company) {
  const auth = request.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) throw fail("Sign in first.", 401, "unauthenticated");
  const base = env.SUPABASE_URL;
  const anon = env.SUPABASE_ANON_KEY;
  if (!base || !anon) throw fail("Server is not configured (SUPABASE_URL / SUPABASE_ANON_KEY).", 500, "config");
  const h = { apikey: anon, authorization: "Bearer " + token };
  const u = await fetch(base + "/auth/v1/user", { headers: h });
  if (!u.ok) throw fail("Your session has expired. Sign in again.", 401, "unauthenticated");
  const user = await u.json();
  const mr = await fetch(base + "/rest/v1/dispatch_members?select=company,role,hub,active&active=eq.true&user_id=eq." + user.id, { headers: h });
  const memberships = mr.ok ? await mr.json() : [];
  if (!memberships.length) throw fail("This account has no access to AdChem Ops.", 403, "no_access");
  const c = company || memberships[0].company;
  const me = memberships.find(m => m.company === c);
  if (!me) throw fail("You are not a member of that company.", 403, "no_access");
  if (roles && !roles.includes(me.role)) throw fail("Your role can't do that.", 403, "forbidden");
  const ur = await fetch(base + "/rest/v1/dispatch_users?select=email,name&user_id=eq." + user.id, { headers: h });
  const urow = ur.ok ? (await ur.json())[0] : null;
  return { user, me: { ...me, email: (urow && urow.email) || user.email, name: (urow && urow.name) || "" }, token, company: c, memberships };
}

// A Supabase client for the server, acting as the caller (RLS applies).
export function sb(env, token) {
  const base = env.SUPABASE_URL, anon = env.SUPABASE_ANON_KEY;
  const h = { apikey: anon, authorization: "Bearer " + token, "content-type": "application/json" };
  return {
    async get(path) { const r = await fetch(base + "/rest/v1/" + path, { headers: h }); if (!r.ok) throw new Error(await r.text()); return r.json(); },
    async upsert(table, rows, onConflict) {
      const r = await fetch(base + "/rest/v1/" + table + (onConflict ? "?on_conflict=" + onConflict : ""), { method: "POST", headers: { ...h, prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(rows) });
      if (!r.ok) throw new Error(await r.text());
    },
    async patch(table, filter, data) {
      const r = await fetch(base + "/rest/v1/" + table + "?" + filter, { method: "PATCH", headers: { ...h, prefer: "return=minimal" }, body: JSON.stringify(data) });
      if (!r.ok) throw new Error(await r.text());
    },
    async insert(table, rows) {
      const r = await fetch(base + "/rest/v1/" + table, { method: "POST", headers: { ...h, prefer: "return=representation" }, body: JSON.stringify(rows) });
      if (!r.ok) throw new Error(await r.text()); return r.json();
    },
    async rpc(fn, args) {
      const r = await fetch(base + "/rest/v1/rpc/" + fn, { method: "POST", headers: h, body: JSON.stringify(args || {}) });
      if (!r.ok) throw new Error(await r.text()); return r.json();
    },
    async storageGet(bucket, path) {
      const r = await fetch(base + "/storage/v1/object/" + bucket + "/" + path, { headers: { apikey: anon, authorization: "Bearer " + token } });
      if (!r.ok) throw new Error("photo not found: " + r.status); return r;
    },
  };
}

// The company's settings (Setup tab) and its record (name, sending addresses). Addresses fall back to the server variables.
export async function companyContext(db, env, company) {
  const [srows, crows] = await Promise.all([
    db.get("dispatch_company_settings?select=data&company=eq." + encodeURIComponent(company)),
    db.get("companies?select=id,name,short_name,data&id=eq." + encodeURIComponent(company)),
  ]);
  const settings = (srows[0] && srows[0].data) || {};
  const co = crows[0] || { id: company, name: company, short_name: company, data: {} };
  const d = co.data || {};
  return {
    settings, co,
    ordersTo: d.ordersTo || env.ORDERS_TO || "orders@adchem.pro",
    accountingTo: d.accountingTo || env.ACCOUNTING_TO || "accounting@adchem.pro",
    mailFrom: d.mailFrom || env.GMAIL_FROM || env.GOOGLE_IMPERSONATE || env.ORDERS_TO || "orders@adchem.pro",
  };
}

export async function handle(fn) {
  try { return await fn(); }
  catch (e) {
    if (e instanceof Response) return e;
    return fail(String((e && e.message) || e), 500, "server");
  }
}
