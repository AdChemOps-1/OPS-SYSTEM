import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { onRequestPost } from '../../functions/api/assets.js';

const EV1 = 'e1000000-0000-4000-8000-000000000001';
const EV2 = 'e1000000-0000-4000-8000-000000000002';
const EV3 = 'e1000000-0000-4000-8000-000000000003';
const TYPE_CYL = 'a1000000-0000-4000-8000-000000000001';
const TYPE_DEWAR = 'a2000000-0000-4000-8000-000000000002';
const ASSET = 'b1000000-0000-4000-8000-000000000001';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const AT = '2026-10-23T15:00:00.000Z';
const PHOTO = 'adchem/asset/' + EV1 + '.jpg';
const ANNOTATE = 'https://vision.googleapis.com/v1/images:annotate';

let SA;
async function serviceAccount() {
  if (SA) return SA;
  const kp = await webcrypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
  const der = Buffer.from(await webcrypto.subtle.exportKey('pkcs8', kp.privateKey)).toString('base64');
  SA = JSON.stringify({ client_email: 'sa@x.iam.gserviceaccount.com', private_key: '-----BEGIN PRIVATE KEY-----\n' + der + '\n-----END PRIVATE KEY-----\n' });
  return SA;
}
const ok = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
const pgErr = (code, message, status = 400) => new Response(JSON.stringify({ code, message, details: null, hint: null }), { status, headers: { 'content-type': 'application/json' } });
const fixture = name => JSON.parse(readFileSync(new URL('../fixtures/vision/' + name, import.meta.url), 'utf8'));
const req = (body) => new Request('http://x/api/assets', { method: 'POST', headers: { authorization: 'Bearer tok' }, body: JSON.stringify({ company: 'adchem', ...body }) });

// opts: member, assets [{serial,...}], types, eventErrors {id: Response}, existingEvents [ids], vision Response, photoMissing, settings
async function run(body, opts = {}) {
  const calls = [], real = globalThis.fetch;
  const assets = (opts.assets || []).map(a => ({ ...a }));
  const types = opts.types || [{ id: TYPE_CYL, fill_lb: 50 }, { id: TYPE_DEWAR, fill_lb: null }];
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url), method = init.method || 'GET';
    let parsed = null;
    try { parsed = init.body && typeof init.body === 'string' ? JSON.parse(init.body) : null; } catch (e) { parsed = null; }
    calls.push({ url: u, method, body: parsed, headers: init.headers });
    if (u === 'https://oauth2.googleapis.com/token') return ok({ access_token: 'vtok', expires_in: 3600 });
    if (u === ANNOTATE) return opts.vision || ok(fixture('cylinder-indented.json'));
    if (u.includes('/auth/v1/user')) return ok({ id: 'u1', email: 'a@b.c' });
    if (u.includes('/rest/v1/dispatch_members')) return ok([{ company: 'adchem', role: 'driver', hub: 'SAC', active: true, is_super_admin: false, permissions: {}, ...opts.member }]);
    if (u.includes('/rest/v1/dispatch_users')) return ok([{ email: 'a@b.c', name: 'A' }]);
    if (u.includes('/rest/v1/dispatch_company_settings')) return ok([{ data: opts.settings || {} }]);
    if (u.includes('/rest/v1/companies')) return ok([{ id: 'adchem', name: 'AdChem', short_name: 'AdChem', data: {} }]);
    if (u.includes('/storage/v1/object/authenticated/dispatch-docs/')) return opts.photoMissing ? new Response('{"statusCode":"404","error":"not_found"}', { status: 404 }) : new Response(new Uint8Array([1, 2, 3]), { status: 200 });
    if (u.endsWith('/rest/v1/rpc/dispatch_asset_by_serial')) return ok(assets.filter(a => a.serial === parsed.p_serial));
    if (u.endsWith('/rest/v1/rpc/dispatch_asset_counts_for')) return ok([{ container_type_id: TYPE_CYL, product: 'Argon', size_label: '300', fill_state: 'full', location_kind: 'hub', hub: 'SAC', condition: 'in_service', n: 4 }]);
    if (u.includes('/rest/v1/dispatch_container_types')) { const id = u.match(/id=eq\.([0-9a-f-]+)/)[1]; return ok(types.filter(t => t.id === id)); }
    if (u.includes('/rest/v1/dispatch_asset_events') && method === 'GET') { const id = u.match(/id=eq\.([0-9a-f-]+)/)[1]; return ok((opts.existingEvents || []).includes(id) ? [{ id }] : []); }
    if (u.endsWith('/rest/v1/dispatch_assets') && method === 'POST') { assets.push({ ...parsed[0] }); return new Response(null, { status: 201 }); }
    if (u.endsWith('/rest/v1/dispatch_asset_events') && method === 'POST') {
      const row = parsed[0];
      if (opts.eventErrors && opts.eventErrors[row.id]) return opts.eventErrors[row.id];
      return new Response(null, { status: 201 });
    }
    return new Response('nope', { status: 404 });
  };
  try {
    const env = { SUPABASE_URL: 'http://sb', SUPABASE_ANON_KEY: 'anon', GOOGLE_SA_JSON: await serviceAccount(), GOOGLE_IMPERSONATE: 'orders@adchem.pro' };
    const res = await onRequestPost({ request: req(body), env });
    return { res, j: await res.json(), calls, assets };
  } finally { globalThis.fetch = real; }
}
const posted = (calls, table) => calls.filter(c => c.method === 'POST' && c.url.endsWith('/rest/v1/' + table)).map(c => c.body[0]);
const EXISTING = { id: ASSET, serial: 'AB1234', container_type_id: TYPE_CYL, fill_state: 'full', location_kind: 'hub', location_id: 'SAC', owner_kind: 'adchem', owner_id: '' };
const ev = (o) => ({ id: EV1, serial: 'AB1234', type: 'delivered', from: { kind: 'hub', id: 'SAC' }, to: { kind: 'site', id: 'S-100' }, occurredAt: AT, ...o });

// ---------- read ----------
test('read: downloads the photo as the caller, returns candidates from Vision via the picker', async () => {
  const { res, j, calls } = await run({ action: 'read', eventId: EV1, kind: 'cylinder', photoPath: PHOTO });
  assert.equal(res.status, 200);
  assert.equal(j.raw, 'DOT-3AA2015\nTW 48.2\nAB1234\n2019');
  assert.equal(j.candidates[0].text, 'AB1234');
  assert.ok(!j.error);
  const get = calls.find(c => c.url.includes('/storage/v1/object/authenticated/'));
  assert.equal(get.url, 'http://sb/storage/v1/object/authenticated/dispatch-docs/' + PHOTO);
  assert.equal(get.headers.authorization, 'Bearer tok'); assert.equal(get.headers.apikey, 'anon');
});

test('read: company serial rules from settings reach the picker', async () => {
  const { j } = await run({ action: 'read', eventId: EV1, kind: 'cylinder', photoPath: PHOTO }, { settings: { assetSerialRules: { reject: ['^AB'] } } });
  const base = await run({ action: 'read', eventId: EV1, kind: 'cylinder', photoPath: PHOTO });
  const score = r => r.j ? r.j.candidates.find(c => c.text === 'AB1234').score : r.candidates.find(c => c.text === 'AB1234').score;
  assert.ok(score(j) < score(base) / 5, 'the company reject rule scales AB1234 down');
});

test('read: a Vision 403 answers 200 with no candidates and the message', async () => {
  const { res, j } = await run({ action: 'read', eventId: EV1, kind: 'cylinder', photoPath: PHOTO }, { vision: ok({ error: { code: 403, message: 'Cloud Vision API has not been used' } }, 403) });
  assert.equal(res.status, 200);
  assert.deepEqual(j.candidates, []); assert.equal(j.raw, '');
  assert.match(j.error, /has not been used/);
});

test('read: a path that is not <company>/asset/<eventId>.jpg is 400 bad path; a missing photo is 400', async () => {
  for (const p of ['other/asset/' + EV1 + '.jpg', 'adchem/asset/' + EV2 + '.jpg', 'adchem/asset/../x/' + EV1 + '.jpg', 'adchem/document/' + EV1 + '.jpg']) {
    const { res, j, calls } = await run({ action: 'read', eventId: EV1, kind: 'cylinder', photoPath: p });
    assert.equal(res.status, 400, p); assert.equal(j.error.message, 'bad path');
    assert.ok(!calls.some(c => c.url.includes('/storage/')));
  }
  const m = await run({ action: 'read', eventId: EV1, kind: 'cylinder', photoPath: PHOTO }, { photoMissing: true });
  assert.equal(m.res.status, 400); assert.equal(m.j.error.message, 'photo not found');
});

test('read: a coordinator without manage_assets is 403; with it, allowed', async () => {
  const a = await run({ action: 'read', eventId: EV1, kind: 'cylinder', photoPath: PHOTO }, { member: { role: 'coordinator' } });
  assert.equal(a.res.status, 403); assert.equal(a.j.error.message, 'not allowed');
  const b = await run({ action: 'read', eventId: EV1, kind: 'cylinder', photoPath: PHOTO }, { member: { role: 'coordinator', permissions: { manage_assets: true } } });
  assert.equal(b.res.status, 200);
  const c = await run({ action: 'read', eventId: EV1, kind: 'cylinder', photoPath: PHOTO }, { member: { role: 'coordinator', is_super_admin: true } });
  assert.equal(c.res.status, 200);
});

// ---------- events ----------
test('events: an unknown serial is created, then its created event, then the delivered one, same occurredAt', async () => {
  const { res, j, calls } = await run({ action: 'events', events: [ev({ serial: 'zz-9876 ', containerTypeId: TYPE_CYL })] });
  assert.equal(res.status, 200); assert.equal(j.ok, true);
  const a = posted(calls, 'dispatch_assets');
  assert.equal(a.length, 1);
  assert.ok(UUID.test(a[0].id));
  assert.deepEqual({ ...a[0], id: 'x' }, { id: 'x', company: 'adchem', serial: 'ZZ9876', container_type_id: TYPE_CYL, owner_kind: 'adchem', owner_id: '', fill_state: 'unknown', location_kind: 'hub', location_id: 'SAC' });
  const e = posted(calls, 'dispatch_asset_events');
  assert.deepEqual(e.map(r => r.event_type), ['created', 'delivered']);
  assert.ok(e.every(r => r.occurred_at === AT && r.asset_id === a[0].id && r.company === 'adchem'));
  assert.equal(e[1].id, EV1); assert.notEqual(e[0].id, EV1);
  assert.deepEqual([e[1].from_kind, e[1].from_id, e[1].to_kind, e[1].to_id], ['hub', 'SAC', 'site', 'S-100']);
  assert.ok(!('recorded_by' in e[1]), 'the guard sets recorded_by');
  assert.equal(j.results[0].status, 'applied'); assert.equal(j.results[0].assetId, a[0].id); assert.equal(j.results[0].created, true);
  const ai = calls.findIndex(c => c.url.endsWith('/rest/v1/dispatch_assets'));
  const ei = calls.findIndex(c => c.url.endsWith('/rest/v1/dispatch_asset_events') && c.method === 'POST');
  assert.ok(ai < ei);
});

test('events: an unknown serial without a container type is rejected and writes nothing', async () => {
  const { j, calls } = await run({ action: 'events', events: [ev({ serial: 'NEW555' })] });
  assert.equal(j.results[0].status, 'rejected'); assert.match(j.results[0].reason, /container type/);
  assert.equal(posted(calls, 'dispatch_assets').length, 0); assert.equal(posted(calls, 'dispatch_asset_events').length, 0);
});

test("events: ' ab 1234 ' finds the existing AB1234 through the RPC; no new asset", async () => {
  const { j, calls } = await run({ action: 'events', events: [ev({ serial: ' ab 1234 ' })] }, { assets: [EXISTING] });
  const rpc = calls.find(c => c.url.endsWith('/rpc/dispatch_asset_by_serial'));
  assert.deepEqual(rpc.body, { p_company: 'adchem', p_serial: 'AB1234' });
  assert.equal(posted(calls, 'dispatch_assets').length, 0);
  const e = posted(calls, 'dispatch_asset_events');
  assert.deepEqual(e.map(r => r.event_type), ['delivered']);
  assert.equal(e[0].asset_id, ASSET);
  assert.equal(j.results[0].status, 'applied');
});

test('events: a sighted correction goes in before a delivered whose from differs from the register', async () => {
  const { j, calls } = await run({ action: 'events', events: [ev({ from: { kind: 'hub', id: 'OAK' } })] }, { assets: [EXISTING] });
  const e = posted(calls, 'dispatch_asset_events');
  assert.deepEqual(e.map(r => r.event_type), ['sighted', 'delivered']);
  assert.deepEqual([e[0].from_kind, e[0].from_id, e[0].to_kind, e[0].to_id], ['hub', 'SAC', 'hub', 'OAK']);
  assert.equal(e[0].note, 'was at hub SAC');
  assert.ok(UUID.test(e[0].id) && e[0].id !== EV1);
  assert.ok(Date.parse(e[0].occurred_at) < Date.parse(AT), 'the correction sorts before the movement');
  assert.equal(j.results[0].status, 'applied'); assert.equal(j.results[0].corrected, true);
  // same place: no correction
  const same = await run({ action: 'events', events: [ev()] }, { assets: [EXISTING] });
  assert.deepEqual(posted(same.calls, 'dispatch_asset_events').map(r => r.event_type), ['delivered']);
});

test('events: a known event id is duplicate, the batch continues', async () => {
  const { j, calls } = await run({ action: 'events', events: [ev(), ev({ id: EV2 })] }, { assets: [EXISTING], eventErrors: { [EV1]: pgErr('23505', 'duplicate key value violates unique constraint "dispatch_asset_events_pkey"', 409) } });
  assert.deepEqual(j.results.map(r => [r.id, r.status]), [[EV1, 'duplicate'], [EV2, 'applied']]);
  assert.equal(posted(calls, 'dispatch_asset_events').length, 2);
});

test('events: an event id the caller can already read is duplicate without any write (retry safety)', async () => {
  const { j, calls } = await run({ action: 'events', events: [ev({ from: { kind: 'hub', id: 'OAK' } })] }, { assets: [EXISTING], existingEvents: [EV1] });
  assert.equal(j.results[0].status, 'duplicate');
  assert.equal(posted(calls, 'dispatch_asset_events').length, 0);
});

test("events: a 42501 / guard raise is rejected with the guard's message, the batch continues", async () => {
  const { j } = await run({ action: 'events', events: [ev(), ev({ id: EV2, type: 'filled', from: undefined, to: undefined }), ev({ id: EV3 })] }, {
    assets: [EXISTING],
    eventErrors: { [EV1]: pgErr('P0001', 'not your stop'), [EV2]: pgErr('42501', 'new row violates row-level security policy for table "dispatch_asset_events"', 403) },
  });
  assert.deepEqual(j.results.map(r => r.status), ['rejected', 'rejected', 'applied']);
  assert.equal(j.results[0].reason, 'not your stop');
  assert.match(j.results[1].reason, /row-level security/);
});

test('events: a dewar fill (no fill_lb) is applied with a warning; a hub cylinder fill has none; off-hub fill warns', async () => {
  const MGR = { member: { role: 'coordinator', permissions: { manage_assets: true } } };
  const dewar = { ...EXISTING, container_type_id: TYPE_DEWAR };
  const a = await run({ action: 'events', events: [ev({ type: 'filled', from: undefined, to: undefined })] }, { ...MGR, assets: [dewar] });
  assert.equal(a.j.results[0].status, 'applied'); assert.equal(a.j.results[0].warning, 'no fill weight on this container type');
  const b = await run({ action: 'events', events: [ev({ type: 'filled', from: undefined, to: undefined })] }, { ...MGR, assets: [EXISTING] });
  assert.equal(b.j.results[0].status, 'applied'); assert.ok(!b.j.results[0].warning);
  const c = await run({ action: 'events', events: [ev({ type: 'filled', from: undefined, to: undefined })] }, { ...MGR, assets: [{ ...EXISTING, location_kind: 'site', location_id: 'S-1' }] });
  assert.equal(c.j.results[0].warning, 'asset is not at a hub');
});

test('events: photo_path is stored as given when it is <company>/asset/<uuid>.jpg, never moved', async () => {
  const { calls } = await run({ action: 'events', events: [ev({ photoPath: PHOTO, gps: { lat: 38.5, lng: -121.4 }, ocr: { picked: 'AB1234' }, orderId: 'O-1', bolNumber: 77, siteKey: 'S-100', note: 'by the door' })] }, { assets: [EXISTING] });
  const e = posted(calls, 'dispatch_asset_events')[0];
  assert.equal(e.photo_path, PHOTO);
  assert.deepEqual([e.order_id, e.bol_number, e.site_key, e.note], ['O-1', 77, 'S-100', 'by the door']);
  assert.deepEqual(e.gps, { lat: 38.5, lng: -121.4 }); assert.deepEqual(e.ocr, { picked: 'AB1234' });
  assert.ok(!calls.some(c => c.url.includes('/storage/')));
});

test('events: a malformed batch is 400 naming the first bad index, before any write', async () => {
  const bad = [
    [ev(), ev({ id: 'nope' })],
    [ev(), ev({ id: EV2, type: 'teleported' })],
    [ev(), ev({ id: EV2, serial: '  ' })],
    [ev(), ev({ id: EV2, to: { kind: 'truck', id: 'T1' } })],
    [ev(), ev({ id: EV2, photoPath: 'adchem/asset/new/x.jpg' })],
    [ev(), ev({ id: EV2, containerTypeId: 'x' })],
    [ev(), ev({ id: EV2, occurredAt: 'yesterday' })],
  ];
  for (const events of bad) {
    const { res, j, calls } = await run({ action: 'events', events }, { assets: [EXISTING] });
    assert.equal(res.status, 400, JSON.stringify(events[1]));
    assert.match(j.error.message, /^event 1: /);
    assert.ok(!calls.some(c => c.url.includes('/rest/v1/dispatch_asset') || c.url.includes('/rpc/')));
  }
});

test('events: a coordinator without manage_assets is 403', async () => {
  const { res } = await run({ action: 'events', events: [ev()] }, { member: { role: 'coordinator' }, assets: [EXISTING] });
  assert.equal(res.status, 403);
});

// ---------- counts ----------
test('counts: any member gets the RPC rows', async () => {
  const { res, j, calls } = await run({ action: 'counts' }, { member: { role: 'coordinator' } });
  assert.equal(res.status, 200);
  assert.equal(j.rows.length, 1); assert.equal(j.rows[0].n, 4);
  assert.deepEqual(calls.find(c => c.url.endsWith('/rpc/dispatch_asset_counts_for')).body, { c: 'adchem' });
});

test('an unknown action is 400', async () => {
  const { res } = await run({ action: 'nope' });
  assert.equal(res.status, 400);
});
