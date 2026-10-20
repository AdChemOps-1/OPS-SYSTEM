import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { buildExpiryEmails, recipientsOf, DOC_TYPE_LABEL, todayIn } from '../../functions/_lib/expiry.js';
import { onRequestPost } from '../../functions/api/expiry.js';
import { buildMime } from '../../functions/_lib/mail.js';

const TODAY = '2026-10-20';
const COMPANIES = [{ id: 'adchem', name: 'AdChem, LLC', short_name: 'AdChem', data: { mailFrom: 'orders@adchem.pro' } },
  { id: 'north', name: 'North Supply Co', short_name: 'North', data: {} }];
const SETTINGS = { adchem: { expiryEmailRecipients: ['ops@adchem.pro', ' billing@adchem.pro ', 'not-an-email', 'OPS@adchem.pro'] }, north: { expiryEmailRecipients: [] } };
const row = (o) => ({ review_status: 'live', title: '', number: '', days_left: null, ...o });
const DUE = [
  row({ company: 'adchem', id: 'd1', subject_type: 'customer', subject_id: 'c1000000-0000-4000-8000-000000000001', subject_name: 'Type 7 Manufacturing', doc_type: 'cannabis_license', number: 'C11-0000123-LIC', expires: '2026-10-30' }),
  row({ company: 'adchem', id: 'd2', subject_type: 'customer', subject_id: 'c1000000-0000-4000-8000-000000000002', subject_name: 'Green Leaf', doc_type: 'resale_certificate', number: 'SR-77', expires: '2026-10-15' }),
  row({ company: 'adchem', id: 'd3', subject_type: 'company', subject_id: 'adchem', subject_name: 'AdChem, LLC', doc_type: 'dot_registration', number: 'USDOT 1234567', expires: '2026-11-04' }),
  row({ company: 'adchem', id: 'd4', subject_type: 'person', subject_id: 'a1000000-0000-4000-8000-000000000001', subject_name: 'Dana Driver', doc_type: 'cdl', number: 'D1234567', expires: '2026-10-20' }),
  row({ company: 'north', id: 'd5', subject_type: 'customer', subject_id: 'c2000000-0000-4000-8000-000000000001', subject_name: 'Northside', doc_type: 'psa', expires: '2026-10-25' }),
];

test('recipientsOf: valid addresses only, trimmed, de-duplicated; never a default', () => {
  assert.deepEqual(recipientsOf(SETTINGS.adchem), ['ops@adchem.pro', 'billing@adchem.pro']);
  assert.deepEqual(recipientsOf({}), []); assert.deepEqual(recipientsOf({ expiryEmailRecipients: 'ops@adchem.pro' }), []); assert.deepEqual(recipientsOf(null), []);
});

test('buildExpiryEmails: one email per company with recipients and due rows; groups, lines and day math', () => {
  const out = buildExpiryEmails(COMPANIES, DUE, SETTINGS, TODAY, 'https://ops.adchem.pro');
  assert.equal(out.length, 1, 'north has no recipients: no email');
  const [m] = out;
  assert.equal(m.company, 'adchem'); assert.deepEqual(m.to, ['ops@adchem.pro', 'billing@adchem.pro']); assert.equal(m.count, 4);
  assert.equal(m.subject, 'AdChem — documents expiring: 3 due, 1 expired');
  const L = m.text.split('\n');
  const at = h => L.indexOf(h);
  assert.ok(at('Customers') > 0 && at('AdChem') > at('Customers') && at('People') > at('AdChem'), 'Customers, then the company, then People');
  assert.deepEqual(L.slice(at('Customers') + 1, at('Customers') + 3), [
    'Green Leaf — Resale certificate — SR-77 — expires 10/15/2026 (EXPIRED 5 days ago)',
    'Type 7 Manufacturing — Cannabis license — C11-0000123-LIC — expires 10/30/2026 (10 days)']);
  assert.equal(L[at('AdChem') + 1], 'AdChem, LLC — DOT registration — USDOT 1234567 — expires 11/04/2026 (15 days)');
  assert.equal(L[at('People') + 1], 'Dana Driver — CDL — D1234567 — expires 10/20/2026 (0 days)');
  assert.equal(L[L.length - 1], 'Open AdChem Ops: https://ops.adchem.pro');
  assert.ok(!/Northside/.test(m.text), 'no other company\'s rows');
});

test('buildExpiryEmails: no footer without an app URL; empty groups left out; no recipients or no rows → nothing', () => {
  const [m] = buildExpiryEmails([COMPANIES[0]], DUE.filter(r => r.subject_type === 'customer'), SETTINGS, TODAY, '');
  assert.ok(!/Open AdChem Ops/.test(m.text)); assert.ok(!m.text.split('\n').includes('People')); assert.ok(!m.text.split('\n').includes('AdChem'));
  assert.deepEqual(buildExpiryEmails(COMPANIES, [], SETTINGS, TODAY, ''), []);
  assert.deepEqual(buildExpiryEmails(COMPANIES, DUE, {}, TODAY, ''), []);
  // across a month and a year end, and far past
  const [y] = buildExpiryEmails([COMPANIES[0]], [row({ company: 'adchem', subject_type: 'customer', subject_name: 'X', doc_type: 'other', title: 'Fire permit', expires: '2027-01-02' }),
    row({ company: 'adchem', subject_type: 'customer', subject_name: 'Y', doc_type: 'psa', expires: '2025-10-20' })], SETTINGS, '2026-12-30', '');
  assert.match(y.text, /X — Fire permit — expires 01\/02\/2027 \(3 days\)/, 'an Other uses its title; a blank number is left out');
  assert.match(y.text, /Y — PSA — expires 10\/20\/2025 \(EXPIRED 436 days ago\)/);
  assert.equal(Object.keys(DOC_TYPE_LABEL).length, 9);
  assert.equal(todayIn('America/Los_Angeles', new Date('2026-10-21T03:00:00Z')), '2026-10-20', 'the Pacific day, not the UTC day');
});

test('buildMime: header values never carry a line break', () => {
  const m = buildMime({ from: 'a@b.c', to: ['x@y.z\r\nBcc: evil@e.e'], subject: 's\nBcc: e@e.e', text: 'one\ntwo' });
  assert.ok(!/\r\nBcc:/.test(m)); assert.match(m, /\r\n\r\none\r\ntwo$/);
});

// ---------- the route against stubbed Supabase + Google ----------
let SA;
async function serviceAccount() {
  if (SA) return SA;
  const kp = await webcrypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
  const der = Buffer.from(await webcrypto.subtle.exportKey('pkcs8', kp.privateKey)).toString('base64');
  SA = JSON.stringify({ client_email: 'sa@x.iam.gserviceaccount.com', private_key: '-----BEGIN PRIVATE KEY-----\n' + der + '\n-----END PRIVATE KEY-----\n' });
  return SA;
}
const ok = (data) => new Response(JSON.stringify(data), { status: 200, headers: { 'content-type': 'application/json' } });
const decode = raw => Buffer.from(raw.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
const eqParam = (u, k) => { const m = u.match(new RegExp('[?&]' + k + '=eq\\.([^&]+)')); return m ? decodeURIComponent(m[1]) : null; };

async function run({ headers = {}, body = { send: true }, member = {}, env: envExtra = {}, serviceNames = false } = {}) {
  const env = { SUPABASE_URL: 'http://sb', SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'svc-key', EXPIRY_SECRET: 's3cret-long-random', APP_URL: 'https://ops.adchem.pro', GOOGLE_SA_JSON: await serviceAccount(), ...envExtra };
  const calls = [], real = globalThis.fetch;
  const companies = [...COMPANIES, { id: 'west', name: 'West Co', short_name: 'West', data: {} }];
  const settings = [{ company: 'adchem', data: SETTINGS.adchem }, { company: 'north', data: SETTINGS.north }, { company: 'west', data: { expiryEmailRecipients: ['w@west.example'] } }];
  // as the service role the view's subject names are null (no auth.uid())
  const due = serviceNames ? DUE.map(r => ({ ...r, subject_name: null })) : DUE;
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url), method = init.method || 'GET';
    calls.push({ url: u, method, body: init.body ? (typeof init.body === 'string' ? JSON.parse(init.body) : String(init.body)) : null, headers: init.headers || {} });
    if (u.startsWith('https://oauth2.googleapis.com/token')) return ok({ access_token: 'gt', expires_in: 3600 });
    if (u.startsWith('https://gmail.googleapis.com/gmail/v1/users/me/messages/send')) return ok({ id: 'm' + calls.length });
    if (u.includes('/auth/v1/user')) return ok({ id: 'u1', email: 'boss@adchem.pro' });
    if (u.includes('/rest/v1/dispatch_members')) return ok([{ company: 'adchem', role: 'admin', active: true, is_super_admin: true, permissions: {}, ...member }]);
    if (u.includes('/rest/v1/dispatch_users')) return ok(u.includes('user_id=in.') ? [{ user_id: 'a1000000-0000-4000-8000-000000000001', name: 'Dana Driver' }] : [{ email: 'boss@adchem.pro', name: 'Boss' }]);
    if (u.includes('/rest/v1/companies')) { const id = eqParam(u, 'id'); return ok(companies.filter(c => !id || c.id === id)); }
    if (u.includes('/rest/v1/dispatch_company_settings')) { const c = eqParam(u, 'company'); return ok(settings.filter(s => !c || s.company === c)); }
    if (u.includes('/rest/v1/dispatch_documents_due')) { const c = eqParam(u, 'company'); return ok(due.filter(r => !c || r.company === c)); }
    if (u.includes('/rest/v1/dispatch_customers')) return ok([{ id: 'c1000000-0000-4000-8000-000000000001', company: 'adchem', name: 'Type 7 Manufacturing' },
      { id: 'c1000000-0000-4000-8000-000000000002', company: 'adchem', name: 'Green Leaf' }, { id: 'c2000000-0000-4000-8000-000000000001', company: 'north', name: 'Northside' }]);
    if (u.includes('/rest/v1/dispatch_log')) return new Response(null, { status: 201 });
    return new Response('nope ' + u, { status: 404 });
  };
  try {
    const req = new Request('http://x/api/expiry', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
    const res = await onRequestPost({ request: req, env });
    const gmail = calls.filter(c => c.url.includes('gmail.googleapis.com')).map(c => decode(c.body.raw));
    return { res, j: await res.json(), calls, gmail, sbCalls: calls.filter(c => c.url.startsWith('http://sb/')) };
  } finally { globalThis.fetch = real; }
}

test('cron: a wrong, empty or unconfigured secret is 403 and reads nothing', async () => {
  for (const r of [await run({ headers: { 'x-expiry-secret': 'wrong' } }), await run({ headers: { 'x-expiry-secret': '' } }),
    await run({ headers: { 'x-expiry-secret': '' }, env: { EXPIRY_SECRET: '' } }), await run({ headers: { 'x-expiry-secret': 'undefined' }, env: { EXPIRY_SECRET: undefined } })]) {
    assert.equal(r.res.status, 403); assert.equal(r.j.error.code, 'forbidden');
    assert.equal(r.calls.length, 0, 'no Supabase or Google call');
    assert.ok(!JSON.stringify(r.j).includes('s3cret'), 'the secret is never echoed');
  }
});

test('cron: the right secret mails every company with recipients, as the service role, one Gmail send', async () => {
  const { res, j, gmail, sbCalls, calls } = await run({ headers: { 'x-expiry-secret': 's3cret-long-random' }, serviceNames: true });
  assert.equal(res.status, 200);
  assert.deepEqual(j, { ok: true, sent: [{ company: 'adchem', to: ['ops@adchem.pro', 'billing@adchem.pro'], count: 4 }],
    skipped: [{ company: 'north', reason: 'no_recipients' }, { company: 'west', reason: 'nothing_due' }] });
  assert.equal(gmail.length, 1, 'Gmail called once');
  const m = gmail[0];
  assert.match(m, /^From: orders@adchem\.pro\r\n/); assert.match(m, /\r\nTo: ops@adchem\.pro, billing@adchem\.pro\r\n/);
  assert.ok(!/orders@adchem\.pro\r\nTo: .*orders@/.test(m) && !/\r\nCc:/.test(m), 'orders@ is not a recipient unless listed');
  assert.match(m, /Subject: =\?UTF-8\?B\?/);
  const subj = Buffer.from(m.match(/Subject: =\?UTF-8\?B\?([^?]+)\?=/)[1], 'base64').toString('utf8');
  assert.equal(subj, 'AdChem — documents expiring: 3 due, 1 expired');
  assert.match(m, /Type 7 Manufacturing — Cannabis license — C11-0000123-LIC — expires 10\/30\/2026/, 'names looked up when the view hides them');
  assert.match(m, /Dana Driver — CDL/); assert.match(m, /AdChem, LLC — DOT registration/); assert.match(m, /Open AdChem Ops: https:\/\/ops\.adchem\.pro/);
  assert.ok(!/Northside/.test(m));
  assert.ok(sbCalls.length >= 4);
  for (const c of sbCalls) { assert.equal(c.headers.apikey, 'svc-key', c.url); assert.equal(c.headers.authorization, 'Bearer svc-key', c.url); }
  assert.ok(sbCalls.find(c => c.url.includes('/rest/v1/companies')).url.includes('active=eq.true'), 'active companies only');
  assert.ok(!calls.some(c => c.url.includes('/auth/v1/user')), 'no user lookup on the cron path');
  const log = sbCalls.find(c => c.url.includes('/rest/v1/dispatch_log'));
  assert.deepEqual(log.body, [{ company: 'adchem', who: null, what: 'expiry_email', detail: { count: 4, to: ['ops@adchem.pro', 'billing@adchem.pro'] } }]);
});

test('Send now: a super admin mails their company only, as themselves, and the log row is theirs', async () => {
  const { res, j, gmail, sbCalls } = await run({ headers: { authorization: 'Bearer tok' }, body: { send: true, company: 'adchem' } });
  assert.equal(res.status, 200);
  assert.deepEqual(j, { ok: true, sent: [{ company: 'adchem', to: ['ops@adchem.pro', 'billing@adchem.pro'], count: 4 }], skipped: [] });
  assert.equal(gmail.length, 1); assert.match(gmail[0], /^From: orders@adchem\.pro\r\nTo: ops@adchem\.pro, billing@adchem\.pro\r\n/);
  for (const c of sbCalls) { assert.equal(c.headers.apikey, 'anon', c.url); assert.equal(c.headers.authorization, 'Bearer tok', c.url); }
  const due = sbCalls.find(c => c.url.includes('dispatch_documents_due'));
  assert.ok(due.url.includes('company=eq.adchem'));
  assert.ok(sbCalls.find(c => c.url.includes('/rest/v1/companies?select=id,name,short_name,data&id=eq.adchem')), 'that company only');
  const log = sbCalls.find(c => c.url.includes('/rest/v1/dispatch_log'));
  assert.deepEqual(log.body, [{ company: 'adchem', who: 'u1', what: 'expiry_email', detail: { count: 4, to: ['ops@adchem.pro', 'billing@adchem.pro'] } }]);
});

test('Send now: a company with no recipients is skipped, nothing sent', async () => {
  const { res, j, gmail } = await run({ headers: { authorization: 'Bearer tok' }, body: { send: true, company: 'north' }, member: { company: 'north' } });
  assert.equal(res.status, 200); assert.deepEqual(j, { ok: true, sent: [], skipped: [{ company: 'north', reason: 'no_recipients' }] }); assert.equal(gmail.length, 0);
});

test('Send now: a coordinator or a plain admin is 403; nothing read or sent', async () => {
  for (const member of [{ role: 'coordinator', is_super_admin: false }, { role: 'admin', is_super_admin: false }]) {
    const { res, j, calls } = await run({ headers: { authorization: 'Bearer tok' }, body: { send: true, company: 'adchem' }, member });
    assert.equal(res.status, 403); assert.equal(j.error.code, 'forbidden');
    assert.ok(!calls.some(c => /gmail|dispatch_documents_due|dispatch_log/.test(c.url)));
  }
  const anon = await run({ body: { send: true, company: 'adchem' } });
  assert.equal(anon.res.status, 401, 'no session and no secret');
  const nosend = await run({ headers: { authorization: 'Bearer tok' }, body: { company: 'adchem' } });
  assert.equal(nosend.res.status, 400);
});

// ---------- health: the documents bucket and the expiry job ----------
import { onRequestGet as health } from '../../functions/api/health.js';
async function runHealth({ bucket, cron }) {
  const calls = [], real = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url); calls.push({ url: u, method: init.method || 'GET', headers: init.headers || {} });
    if (u.includes('/auth/v1/user')) return ok({ id: 'u1', email: 'boss@adchem.pro' });
    if (u.includes('/rest/v1/dispatch_members')) return ok([{ company: 'adchem', role: 'admin', active: true, is_super_admin: false, permissions: {} }]);
    if (u.includes('/rest/v1/dispatch_users')) return ok([{ email: 'boss@adchem.pro', name: 'Boss' }]);
    if (u.includes('/rest/v1/dispatch_company_settings')) return ok([{ data: {} }]);
    if (u.includes('/rest/v1/companies')) return ok([{ id: 'adchem', name: 'AdChem, LLC', short_name: 'AdChem', data: {} }]);
    if (u.endsWith('/rest/v1/rpc/dispatch_docs_bucket_ok')) return bucket;
    if (u.endsWith('/rest/v1/rpc/dispatch_cron_status')) return cron;
    return new Response('nope', { status: 404 });
  };
  try {
    const res = await health({ request: new Request('http://x/api/health?company=adchem', { headers: { authorization: 'Bearer tok' } }), env: { SUPABASE_URL: 'http://sb', SUPABASE_ANON_KEY: 'anon' } });
    return { j: await res.json(), calls };
  } finally { globalThis.fetch = real; }
}
test('health: docsBucket and expiryCron', async () => {
  const a = await runHealth({ bucket: ok('ok'), cron: ok([{ jobname: 'dispatch-expiry-email', schedule: '0 14 * * *', active: true }]) });
  assert.equal(a.j.checks.docsBucket, 'ok'); assert.equal(a.j.checks.expiryCron, 'ok — daily 06:00 Pacific');
  const b = a.calls.find(c => c.url.endsWith('/rest/v1/rpc/dispatch_docs_bucket_ok'));
  assert.equal(b.method, 'POST'); assert.deepEqual([b.headers.apikey, b.headers.authorization], ['anon', 'Bearer tok'], 'as the caller');
  assert.ok(!a.calls.some(c => c.url.includes('/storage/v1/')), 'no storage API read');
  const z = await runHealth({ bucket: ok('Bucket not found'), cron: ok([]) });
  assert.equal(z.j.checks.docsBucket, 'Bucket not found'); assert.equal(z.j.checks.expiryCron, 'not scheduled');
  const e = await runHealth({ bucket: new Response('{"message":"not allowed"}', { status: 400 }), cron: new Response('{"message":"not allowed"}', { status: 400 }) });
  assert.match(e.j.checks.docsBucket, /not allowed/, 'an RPC error gives its message'); assert.equal(e.j.checks.expiryCron, 'not scheduled', 'an RPC error reads not scheduled');
  const off = await runHealth({ bucket: ok('bucket is public'), cron: ok([{ jobname: 'dispatch-expiry-email', schedule: '0 14 * * *', active: false }]) });
  assert.equal(off.j.checks.docsBucket, 'bucket is public'); assert.equal(off.j.checks.expiryCron, 'not scheduled', 'an inactive job is not scheduled');
  const other = await runHealth({ bucket: ok('ok'), cron: ok([{ jobname: 'dispatch-expiry-email', schedule: '30 13 * * *', active: true }]) });
  assert.equal(other.j.checks.expiryCron, 'ok — 30 13 * * *', 'another schedule is shown as is');
});
