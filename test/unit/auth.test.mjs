import test from 'node:test';
import assert from 'node:assert/strict';
import { requireUser, hasPerm } from '../../functions/_lib/auth.js';

const env = { SUPABASE_URL: 'http://sb', SUPABASE_ANON_KEY: 'anon' };
const req = () => new Request('http://x/api', { headers: { authorization: 'Bearer tok' } });
const ok = (data) => new Response(JSON.stringify(data), { status: 200, headers: { 'content-type': 'application/json' } });

async function withMember(member, fn) {
  const real = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.includes('/auth/v1/user')) return ok({ id: 'u1', email: 'a@b.c' });
    if (u.includes('/rest/v1/dispatch_members')) return ok([{ company: 'adchem', role: 'coordinator', hub: null, active: true, ...member }]);
    if (u.includes('/rest/v1/dispatch_users')) return ok([{ email: 'a@b.c', name: 'A' }]);
    return new Response('nope', { status: 404 });
  };
  try { return await fn(); } finally { globalThis.fetch = real; }
}

test('coordinator without the permission is rejected with 403 forbidden', () =>
  withMember({ is_super_admin: false, permissions: {} }, async () => {
    let r;
    await assert.rejects(requireUser(req(), env, null, 'adchem', 'run_imports'), (e) => { r = e; return e instanceof Response && e.status === 403; });
    const body = await r.json();
    assert.equal(body.error.code, 'forbidden');
    assert.match(body.error.message, /run imports/);
  }));

test('member with the permission resolves and exposes perms', () =>
  withMember({ is_super_admin: false, permissions: { run_imports: true } }, async () => {
    const { me } = await requireUser(req(), env, null, 'adchem', 'run_imports');
    assert.equal(me.perms.run_imports, true);
    assert.equal(me.isSuper, false);
  }));

test('super admin passes any permission with empty permissions', () =>
  withMember({ is_super_admin: true, permissions: {} }, async () => {
    const { me } = await requireUser(req(), env, null, 'adchem', 'manage_people');
    assert.equal(me.isSuper, true);
  }));

test('hasPerm', () => {
  assert.equal(hasPerm({ isSuper: false, perms: { a: true } }, 'a'), true);
  assert.equal(hasPerm({ isSuper: false, perms: { a: true } }, 'b'), false);
});
