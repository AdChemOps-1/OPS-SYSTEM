import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequestPost } from '../../functions/api/docs.js';
import { requireUser } from '../../functions/_lib/auth.js';

const env = { SUPABASE_URL: 'http://sb', SUPABASE_ANON_KEY: 'anon' };
const ID = 'd1000000-0000-4000-8000-000000000001';
const PATH = 'adchem/document/customer/c1/license.pdf';
const ok = (data) => new Response(JSON.stringify(data), { status: 200, headers: { 'content-type': 'application/json' } });
const req = (body) => new Request('http://x/api/docs', { method: 'POST', headers: { authorization: 'Bearer tok' }, body: JSON.stringify({ company: 'adchem', ...body }) });

// opts: member fields, docs rows, rpcError, logFails. Returns the calls made.
async function run(body, opts = {}) {
  const calls = [], real = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url), method = init.method || 'GET';
    calls.push({ url: u, method, body: init.body ? JSON.parse(init.body) : null, headers: init.headers });
    if (u.includes('/auth/v1/user')) return ok({ id: 'u1', email: 'a@b.c' });
    if (u.includes('/rest/v1/dispatch_members')) return ok([{ company: 'adchem', role: 'coordinator', active: true, is_super_admin: false, permissions: {}, ...opts.member }]);
    if (u.includes('/rest/v1/dispatch_users')) return ok([{ email: 'a@b.c', name: 'A' }]);
    if (u.includes('/rest/v1/dispatch_documents')) return ok('docs' in opts ? opts.docs : [{ id: ID, file_path: PATH, file_name: 'license.pdf', file_type: 'application/pdf' }]);
    if (u.includes('/storage/v1/object/sign/')) return ok({ signedURL: '/object/sign/dispatch-docs/' + PATH + '?token=t' });
    if (u.includes('/rest/v1/dispatch_log')) return opts.logFails ? new Response('denied', { status: 403 }) : new Response(null, { status: 201 });
    if (u.includes('/rest/v1/rpc/')) return opts.rpcError ? new Response(opts.rpcError, { status: 400 }) : ok(ID);
    return new Response('nope', { status: 404 });
  };
  try {
    const res = await onRequestPost({ request: req(body), env });
    return { res, j: await res.json(), calls };
  } finally { globalThis.fetch = real; }
}
const MANAGER = { permissions: { manage_documents: true } };

test('sign: returns a 300s signed URL, scoped by company and id, and logs file_view', async () => {
  const { res, j, calls } = await run({ action: 'sign', id: ID });
  assert.equal(res.status, 200);
  assert.equal(j.url, 'http://sb/storage/v1/object/sign/dispatch-docs/' + PATH + '?token=t');
  assert.match(j.url, /\/storage\/v1\/object\/sign\/dispatch-docs\/adchem\/document\/customer\//);
  assert.deepEqual([j.expiresIn, j.fileName, j.fileType], [300, 'license.pdf', 'application/pdf']);
  const sign = calls.find(c => c.url.includes('/object/sign/'));
  assert.equal(sign.method, 'POST'); assert.deepEqual(sign.body, { expiresIn: 300 });
  assert.equal(sign.headers.authorization, 'Bearer tok'); assert.equal(sign.headers.apikey, 'anon');
  assert.ok(calls.find(c => c.url.includes('/rest/v1/dispatch_documents')).url.endsWith('company=eq.adchem&id=eq.' + ID));
  const log = calls.find(c => c.url.includes('/rest/v1/dispatch_log'));
  assert.deepEqual(log.body, [{ company: 'adchem', who: 'u1', what: 'file_view', detail: { documentId: ID } }]);
});

test('sign: a row the caller cannot read is 404; a row with no file is 400 no_file; neither signs or logs', async () => {
  const a = await run({ action: 'sign', id: ID }, { docs: [] });
  assert.equal(a.res.status, 404); assert.equal(a.j.error.code, 'not_found');
  const b = await run({ action: 'sign', id: ID }, { docs: [{ id: ID, file_path: null, file_name: null, file_type: null }] });
  assert.equal(b.res.status, 400); assert.equal(b.j.error.code, 'no_file');
  for (const r of [a, b]) assert.ok(!r.calls.some(c => c.url.includes('/object/sign/') || c.url.includes('dispatch_log')));
});

test('sign: a failing log write does not block the URL', async () => {
  const { res, j } = await run({ action: 'sign', id: ID }, { logFails: true });
  assert.equal(res.status, 200); assert.ok(j.url);
});

test('a non-uuid id is rejected before any database call', async () => {
  const { res, j, calls } = await run({ action: 'sign', id: ID + '&company=neq.x' });
  assert.equal(res.status, 400); assert.equal(j.error.code, 'bad_id'); assert.equal(calls.length, 0);
});

test('review without manage_documents is 403 and calls no RPC', async () => {
  const { res, j, calls } = await run({ action: 'review', id: ID, decision: 'approve', fields: {} });
  assert.equal(res.status, 403); assert.match(j.error.message, /manage documents/);
  assert.ok(!calls.some(c => c.url.includes('/rpc/')));
});

test('review approve calls the RPC with only the allowed fields', async () => {
  const { res, j, calls } = await run({ action: 'review', id: ID, decision: 'approve', fields: { doc_type: 'license', number: 'L1', expires: '2027-01-01', extra: { a: 1 }, company: 'evil', file_path: 'x', status: 'valid' } }, { member: MANAGER });
  assert.equal(res.status, 200); assert.deepEqual(j, { ok: true, id: ID });
  const rpc = calls.find(c => c.url.endsWith('/rest/v1/rpc/dispatch_approve_capture'));
  assert.deepEqual(rpc.body, { p_id: ID, p_fields: { doc_type: 'license', number: 'L1', status: 'valid', expires: '2027-01-01', extra: { a: 1 } } });
});

test('review approve with no fields sends an empty object', async () => {
  const { calls } = await run({ action: 'review', id: ID, decision: 'approve' }, { member: MANAGER });
  assert.deepEqual(calls.find(c => c.url.includes('/rpc/')).body, { p_id: ID, p_fields: {} });
});

test('review reject passes the reason; over 300 chars is 400; bad decision is 400', async () => {
  const a = await run({ action: 'review', id: ID, decision: 'reject', reason: 'blurry' }, { member: MANAGER });
  assert.equal(a.res.status, 200);
  assert.deepEqual(a.calls.find(c => c.url.endsWith('/rpc/dispatch_reject_capture')).body, { p_id: ID, p_reason: 'blurry' });
  const b = await run({ action: 'review', id: ID, decision: 'reject', reason: 'x'.repeat(301) }, { member: MANAGER });
  assert.equal(b.res.status, 400); assert.ok(!b.calls.some(c => c.url.includes('/rpc/')));
  const c = await run({ action: 'review', id: ID, decision: 'maybe' }, { member: MANAGER });
  assert.equal(c.res.status, 400); assert.equal(c.j.error.code, 'bad_decision');
});

test('review: "not pending review" is 409 not_pending; other RPC errors are 500', async () => {
  const a = await run({ action: 'review', id: ID, decision: 'approve' }, { member: MANAGER, rpcError: '{"message":"not pending review"}' });
  assert.equal(a.res.status, 409); assert.equal(a.j.error.code, 'not_pending');
  const b = await run({ action: 'review', id: ID, decision: 'reject', reason: 'r' }, { member: MANAGER, rpcError: 'boom' });
  assert.equal(b.res.status, 500);
});

test('permission labels: view_documents and manage_documents read as words', async () => {
  const real = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.includes('/auth/v1/user')) return ok({ id: 'u1' });
    return ok([{ company: 'adchem', role: 'coordinator', active: true, is_super_admin: false, permissions: {} }]);
  };
  try {
    for (const [perm, words] of [['view_documents', 'view documents'], ['manage_documents', 'manage documents']]) {
      let r;
      await assert.rejects(requireUser(new Request('http://x', { headers: { authorization: 'Bearer t' } }), env, null, 'adchem', perm), (e) => { r = e; return e.status === 403; });
      assert.match((await r.json()).error.message, new RegExp(words));
    }
  } finally { globalThis.fetch = real; }
});
