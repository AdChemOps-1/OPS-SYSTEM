import test from 'node:test';
import assert from 'node:assert/strict';
import { movementsFor, buildStockAlerts, stockRecipientsOf, gasKeysOf } from '../../functions/_lib/stock.js';
import { onRequestPost } from '../../functions/api/stock.js';

const NOW = new Date('2026-10-23T15:00:00.000Z');
const WHO = 'u1000000-0000-4000-8000-000000000001';
const VENDOR = 'f1000000-0000-4000-8000-000000000001';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const base = { company: 'adchem', hub: 'EB', order_id: null, asset_event_id: null, occurred_at: NOW.toISOString(), recorded_by: WHO };
const BULK = { hub: 'EB', product: 'Carbon Dioxide', container: '', item: '', unit: 'lb' };
const BIN = { hub: 'EB', product: 'Dry Ice - Pellet', container: 'Bin', item: '', unit: 'count' };
const REG = { hub: 'EB', product: '', container: '', item: 'Regulator', unit: 'count' };
const mf = e => movementsFor(e, 'adchem', WHO, NOW);

test('movementsFor: received is one + row, shaped like the table, vendor optional', () => {
  assert.deepEqual(mf({ kind: 'received', ...BULK, qty: 800, vendorId: VENDOR, note: 'PO 12' }), [
    { ...base, product: 'Carbon Dioxide', container: '', item: '', qty: 800, unit: 'lb', reason: 'received', vendor_id: VENDOR, note: 'PO 12' }]);
  assert.deepEqual(mf({ kind: 'received', ...REG, qty: 10 }), [
    { ...base, product: '', container: '', item: 'Regulator', qty: 10, unit: 'count', reason: 'received', vendor_id: null, note: '' }]);
  assert.throws(() => mf({ kind: 'received', ...REG, qty: 0 }), /above zero/);
  assert.throws(() => mf({ kind: 'received', ...REG, qty: 1, vendorId: 'nope' }), /vendorId/);
});

test('movementsFor: consumed is one − row and needs a note; adjusted keeps its sign and needs a note', () => {
  assert.deepEqual(mf({ kind: 'consumed', ...REG, qty: 2, note: 'used on truck 4' }), [
    { ...base, product: '', container: '', item: 'Regulator', qty: -2, unit: 'count', reason: 'consumed', vendor_id: null, note: 'used on truck 4' }]);
  assert.throws(() => mf({ kind: 'consumed', ...REG, qty: 2 }), /note/);
  assert.throws(() => mf({ kind: 'consumed', ...REG, qty: -2, note: 'x' }), /above zero/);
  assert.equal(mf({ kind: 'adjusted', ...BIN, qty: -3, note: 'broken' })[0].qty, -3);
  assert.equal(mf({ kind: 'adjusted', ...BIN, qty: 3, note: 'found' })[0].reason, 'adjusted');
  assert.throws(() => mf({ kind: 'adjusted', ...BIN, qty: 3 }), /note/);
  assert.throws(() => mf({ kind: 'adjusted', ...BIN, qty: 3, note: '   ' }), /note/);
  assert.throws(() => mf({ kind: 'adjusted', ...BIN, qty: 0, note: 'x' }), /zero/);
  assert.throws(() => mf({ kind: 'adjusted', ...BIN, qty: 3, note: 'x', vendorId: VENDOR }), /vendorId/, 'vendor only on received');
});

test('movementsFor: counted writes the delta from the on-hand figure; zero delta writes nothing', () => {
  assert.deepEqual(mf({ kind: 'counted', ...BIN, qty: 5, onhand: 7 }), [
    { ...base, product: 'Dry Ice - Pellet', container: 'Bin', item: '', qty: -2, unit: 'count', reason: 'counted', vendor_id: null, note: '' }]);
  assert.equal(mf({ kind: 'counted', ...REG, qty: 4, onhand: 0 })[0].qty, 4, 'first count of a key: the delta is the count');
  assert.deepEqual(mf({ kind: 'counted', ...REG, qty: 4, onhand: 4 }), []);
  assert.equal(mf({ kind: 'counted', ...BULK, qty: 0, onhand: -300 })[0].qty, 300);
  assert.throws(() => mf({ kind: 'counted', ...REG, qty: -1, onhand: 0 }), /negative/);
});

test('movementsFor: produced 6 bins is +6 count and −300 lb Carbon Dioxide, same note', () => {
  assert.deepEqual(mf({ kind: 'produced', ...BIN, qty: 6 }), [
    { ...base, product: 'Dry Ice - Pellet', container: 'Bin', item: '', qty: 6, unit: 'count', reason: 'produced', vendor_id: null, note: 'produced' },
    { ...base, product: 'Carbon Dioxide', container: '', item: '', qty: -300, unit: 'lb', reason: 'produced', vendor_id: null, note: 'produced' }]);
  const r = mf({ kind: 'produced', ...BIN, qty: 2, bulkProduct: 'Nitrogen', lbPerUnit: 40, note: 'night shift' });
  assert.deepEqual(r.map(x => [x.product, x.qty, x.unit, x.note]), [['Dry Ice - Pellet', 2, 'count', 'night shift'], ['Nitrogen', -80, 'lb', 'night shift']]);
  assert.throws(() => mf({ kind: 'produced', ...BULK, qty: 2 }), /container/);
  assert.throws(() => mf({ kind: 'produced', ...BIN, qty: 2, lbPerUnit: 0 }), /lbPerUnit/);
  assert.throws(() => mf({ kind: 'produced', ...BIN, qty: 0 }), /above zero/);
});

test('movementsFor: bad shapes throw', () => {
  assert.throws(() => mf({ ...BULK, kind: 'received', unit: 'count', qty: 1 }), /unit must be lb/, 'bulk is lb');
  assert.throws(() => mf({ ...BIN, kind: 'received', unit: 'lb', qty: 1 }), /unit must be count/);
  assert.throws(() => mf({ ...REG, kind: 'received', unit: 'lb', qty: 1 }), /unit must be count/);
  assert.throws(() => mf({ ...REG, kind: 'filled', qty: 1 }), /kind/);
  assert.throws(() => mf({ ...REG, kind: 'delivered', qty: 1 }), /kind/);
  assert.throws(() => mf({ ...REG, kind: 'received', qty: NaN }), /qty/);
  assert.throws(() => mf({ ...REG, kind: 'received', qty: Infinity }), /qty/);
  assert.throws(() => mf({ ...REG, kind: 'received', qty: '' }), /qty/);
  assert.throws(() => mf({ ...REG, kind: 'received', qty: null }), /qty/);
  assert.throws(() => mf({ ...REG, kind: 'received', qty: 1, hub: '' }), /hub/);
  assert.throws(() => mf({ kind: 'received', hub: 'EB', product: '', container: '', item: '', unit: 'count', qty: 1 }), /product or item/);
  assert.throws(() => mf({ kind: 'received', hub: 'EB', product: '', container: 'Bin', item: '', unit: 'count', qty: 1 }), /product or item/);
  assert.throws(() => mf({ kind: 'received', hub: 'EB', product: 'Acetone', container: '', item: 'Regulator', unit: 'count', qty: 1 }), /supply/);
  assert.throws(() => mf(null), /entry/);
  assert.throws(() => mf({ ...REG, kind: 'received', qty: 1, note: 5 }), /note/);
  assert.throws(() => mf({ ...REG, kind: 'adjusted', qty: 1, note: 'undelivered o1' }), /undelivered/, 'the trigger\'s reversal marker is reserved');
  assert.throws(() => mf({ ...REG, kind: 'counted', qty: 1, onhand: 0, note: 'Undelivered o1' }), /undelivered/);
});

const TYPES = [{ product: 'Carbon Dioxide', size_label: '50lb Cylinder' }, { product: 'Nitrogen', size_label: '260L Dewar' }];
const CYL = { hub: 'EB', product: 'Carbon Dioxide', container: '50lb Cylinder', item: '', unit: 'count' };

test('movementsFor: a gas-container key is refused for every kind (the register counts those); other keys pass', () => {
  const keys = gasKeysOf(TYPES);
  assert.deepEqual([...keys], ['Carbon Dioxide|50lb Cylinder', 'Nitrogen|260L Dewar']);
  assert.deepEqual([...gasKeysOf([{ product: '', size_label: '' }, null, 'x'])], [], 'blank or malformed types make no key');
  const g = e => movementsFor(e, 'adchem', WHO, NOW, keys);
  for (const e of [{ kind: 'received', ...CYL, qty: 1 }, { kind: 'adjusted', ...CYL, qty: 1, note: 'x' }, { kind: 'counted', ...CYL, qty: 1, onhand: 0 },
    { kind: 'produced', ...CYL, qty: 1 }, { kind: 'consumed', ...CYL, qty: 1, note: 'x' }]) {
    assert.throws(() => g(e), /Carbon Dioxide 50lb Cylinder is a gas container: the register counts those/, e.kind);
  }
  assert.equal(g({ kind: 'received', ...BIN, qty: 1 }).length, 1, 'a counted container passes');
  assert.equal(g({ kind: 'received', ...BULK, qty: 1 }).length, 1, 'bulk Carbon Dioxide (no container) passes');
  assert.equal(g({ kind: 'produced', ...BIN, qty: 1 }).length, 2);
  assert.equal(movementsFor({ kind: 'received', ...CYL, qty: 1 }, 'adchem', WHO, NOW, ['Carbon Dioxide|20lb Cylinder']).length, 1, 'only a listed key is refused');
  assert.throws(() => movementsFor({ kind: 'received', ...CYL, qty: 1 }, 'adchem', WHO, NOW, ['Carbon Dioxide|50lb Cylinder']), /gas container/, 'an array of keys works too');
  assert.equal(movementsFor({ kind: 'received', ...CYL, qty: 1 }, 'adchem', WHO, NOW).length, 1, 'without keys nothing is refused (the route always passes them)');
});

const CO = [{ id: 'adchem', name: 'AdChem, LLC', short_name: 'AdChem' }, { id: 'north', name: 'North Supply Co', short_name: 'North' }];
const BELOW = {
  adchem: [{ hub: 'EB', product: 'Carbon Dioxide', container: '', item: '', unit: 'lb', qty: 450, min_qty: 500, below: true },
    { hub: 'EB', product: '', container: '', item: 'Regulator', unit: 'count', qty: 3, min_qty: 4, below: true },
    { hub: 'EB', product: 'Dry Ice - Pellet', container: 'Bin', item: '', unit: 'count', qty: 9, min_qty: 2, below: false }],
  north: [{ hub: 'N1', product: 'Acetone', container: '55gal Drum', item: '', unit: 'count', qty: 0, min_qty: 1, below: true }],
};

test('stockRecipientsOf: stockAlertRecipients only, valid, trimmed, de-duplicated', () => {
  assert.deepEqual(stockRecipientsOf({ stockAlertRecipients: [' a@b.co ', 'A@b.co', 'bad'], expiryEmailRecipients: ['x@y.zz'] }), ['a@b.co']);
  assert.deepEqual(stockRecipientsOf({ expiryEmailRecipients: ['x@y.zz'] }), []);
  assert.deepEqual(stockRecipientsOf(null), []);
});

test('buildStockAlerts: one per company with recipients and below rows; subject count and line format', () => {
  const out = buildStockAlerts(CO, BELOW, { adchem: { stockAlertRecipients: ['ops@adchem.pro'] }, north: {} }, '2026-10-23', 'https://ops.adchem.pro');
  assert.equal(out.length, 1, 'north has no recipients');
  const [m] = out;
  assert.equal(m.company, 'adchem'); assert.deepEqual(m.to, ['ops@adchem.pro']); assert.equal(m.count, 2);
  assert.equal(m.subject, 'AdChem — stock below minimum: 2 item(s)');
  const L = m.text.split('\n');
  assert.ok(L.includes('EB: Carbon Dioxide 450 lb (min 500)'));
  assert.ok(L.includes('EB: Regulator 3 count (min 4)'));
  assert.ok(!/Dry Ice/.test(m.text), 'rows not below are left out');
  assert.match(L[0], /10\/23\/2026/);
  assert.equal(L[L.length - 1], 'Open AdChem Ops: https://ops.adchem.pro');
  const [n] = buildStockAlerts(CO, BELOW, { north: { stockAlertRecipients: ['n@north.example'] } }, '2026-10-23', '');
  assert.equal(n.company, 'north'); assert.ok(n.text.split('\n').includes('N1: Acetone 55gal Drum 0 count (min 1)'));
  assert.ok(!/Open AdChem Ops/.test(n.text));
  assert.deepEqual(buildStockAlerts(CO, { adchem: [BELOW.adchem[2]] }, { adchem: { stockAlertRecipients: ['ops@adchem.pro'] } }, '2026-10-23', ''), [], 'nothing below: no mail');
});

test('buildStockAlerts: a below row whose minimum has its alert off is left out; alert on (or absent) is mailed', () => {
  const S = { adchem: { stockAlertRecipients: ['ops@adchem.pro'] } };
  const rows = [{ hub: 'EB', product: 'Carbon Dioxide', container: '', item: '', unit: 'lb', qty: 450, min_qty: 500, below: true, alert: true },
    { hub: 'EB', product: '', container: '', item: 'Regulator', unit: 'count', qty: 3, min_qty: 4, below: true, alert: false }];
  const [m] = buildStockAlerts(CO, { adchem: rows }, S, '2026-10-23', '');
  assert.equal(m.count, 1); assert.equal(m.subject, 'AdChem — stock below minimum: 1 item(s)');
  assert.ok(m.text.includes('EB: Carbon Dioxide 450 lb (min 500)')); assert.ok(!/Regulator/.test(m.text), 'alert off: not mailed');
  assert.deepEqual(buildStockAlerts(CO, { adchem: [rows[1]] }, S, '2026-10-23', ''), [], 'only alert-off rows below: no mail');
  const [n] = buildStockAlerts(CO, { adchem: [{ ...rows[1], alert: undefined }] }, S, '2026-10-23', '');
  assert.equal(n.count, 1, 'a row without the column (alert = null) is mailed');
});

// ---------- the route against stubbed Supabase ----------
const ok = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
async function run(body, { member = {}, onhand = [], insertError = null, types = [] } = {}) {
  const calls = [], real = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url), method = init.method || 'GET';
    calls.push({ url: u, method, body: init.body ? JSON.parse(init.body) : null, headers: init.headers || {} });
    if (u.includes('/auth/v1/user')) return ok({ id: WHO, email: 'm@adchem.pro' });
    if (u.includes('/rest/v1/dispatch_members')) return ok([{ company: 'adchem', role: 'coordinator', hub: 'EB', active: true, is_super_admin: false, permissions: {}, ...member }]);
    if (u.includes('/rest/v1/dispatch_users')) return ok([{ email: 'm@adchem.pro', name: 'M' }]);
    if (u.endsWith('/rest/v1/rpc/dispatch_stock_onhand_for')) return ok(onhand);
    if (u.includes('/rest/v1/dispatch_container_types')) return ok(types);
    if (u.endsWith('/rest/v1/dispatch_stock_movements') && method === 'POST') return insertError ? insertError.clone() : new Response(null, { status: 201 });
    return new Response('nope ' + u, { status: 404 });
  };
  try {
    const env = { SUPABASE_URL: 'http://sb', SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'svc-key' };
    const res = await onRequestPost({ request: new Request('http://x/api/stock', { method: 'POST', headers: { authorization: 'Bearer tok' }, body: JSON.stringify({ company: 'adchem', ...body }) }), env });
    const sbCalls = calls.filter(c => c.url.startsWith('http://sb/rest/'));
    for (const c of sbCalls) { assert.equal(c.headers.apikey, 'anon', c.url); assert.equal(c.headers.authorization, 'Bearer tok', 'always as the caller: ' + c.url); }
    return { res, j: await res.json(), calls, inserts: calls.filter(c => c.url.endsWith('/rest/v1/dispatch_stock_movements')) };
  } finally { globalThis.fetch = real; }
}
const MANAGER = { permissions: { manage_assets: true } };

test('/api/stock move: 403 without manage_assets, nothing written', async () => {
  for (const member of [{}, { permissions: { view_assets: true } }, { role: 'driver' }, { role: 'admin' }]) {
    const { res, j, inserts } = await run({ action: 'move', entry: { kind: 'received', ...REG, qty: 1 } }, { member });
    assert.equal(res.status, 403); assert.equal(j.error.code, 'forbidden'); assert.equal(inserts.length, 0);
  }
});

test('/api/stock move: received inserts as the caller and returns the ids', async () => {
  const { res, j, inserts } = await run({ action: 'move', entry: { kind: 'received', ...BULK, qty: 800, vendorId: VENDOR } }, { member: MANAGER });
  assert.equal(res.status, 200); assert.equal(j.ok, true); assert.equal(j.ids.length, 1); assert.ok(UUID.test(j.ids[0]));
  assert.equal(inserts.length, 1);
  const [row] = inserts[0].body;
  assert.equal(row.id, j.ids[0]);
  assert.deepEqual({ ...row, id: undefined, occurred_at: undefined }, { id: undefined, occurred_at: undefined, company: 'adchem', hub: 'EB', product: 'Carbon Dioxide', container: '', item: '', qty: 800, unit: 'lb',
    reason: 'received', vendor_id: VENDOR, order_id: null, asset_event_id: null, note: '', recorded_by: WHO });
});

test('/api/stock move: a bad entry is 400 and writes nothing; a refused insert is 403', async () => {
  const bad = await run({ action: 'move', entry: { kind: 'received', ...BULK, unit: 'count', qty: 1 } }, { member: MANAGER });
  assert.equal(bad.res.status, 400); assert.equal(bad.j.error.code, 'bad_entry'); assert.match(bad.j.error.message, /unit must be lb/); assert.equal(bad.inserts.length, 0);
  const rls = await run({ action: 'move', entry: { kind: 'received', ...REG, qty: 1 } }, { member: MANAGER,
    insertError: ok({ code: '42501', message: 'new row violates row-level security policy for table "dispatch_stock_movements"' }, 403) });
  assert.equal(rls.res.status, 403); assert.equal(rls.j.error.code, 'forbidden');
});

test('/api/stock move: counted re-reads on-hand on the server and ignores the client figure', async () => {
  const onhand = [{ company: 'adchem', ...BIN, qty: 7, min_qty: null, below: false }, { company: 'adchem', ...BIN, hub: 'SAC', qty: 99, min_qty: null, below: false }];
  const { res, j, calls, inserts } = await run({ action: 'move', entry: { kind: 'counted', ...BIN, qty: 5, onhand: 100 } }, { member: MANAGER, onhand });
  assert.equal(res.status, 200); assert.equal(j.ids.length, 1);
  const rpc = calls.find(c => c.url.endsWith('/rpc/dispatch_stock_onhand_for'));
  assert.deepEqual(rpc.body, { c: 'adchem' });
  assert.equal(inserts[0].body[0].qty, -2); assert.equal(inserts[0].body[0].reason, 'counted');
  const nulls = await run({ action: 'move', entry: { kind: 'counted', ...REG, qty: 5 } }, { member: MANAGER,
    onhand: [{ company: 'adchem', hub: 'EB', product: null, container: null, item: 'Regulator', unit: 'count', qty: 3, min_qty: 4, below: true }] });
  assert.equal(nulls.inserts[0].body[0].qty, 2, 'null key parts match as empty');
  const first = await run({ action: 'move', entry: { kind: 'counted', ...REG, qty: 4 } }, { member: MANAGER, onhand: [] });
  assert.equal(first.inserts[0].body[0].qty, 4, 'no prior movements: the delta is the count');
  const same = await run({ action: 'move', entry: { kind: 'counted', ...BIN, qty: 7 } }, { member: MANAGER, onhand });
  assert.deepEqual(same.j, { ok: true, ids: [], note: 'no change' }); assert.equal(same.inserts.length, 0);
});

test('/api/stock move: counted refuses a manage_assets-only member who cannot read on-hand; nothing read or inserted', async () => {
  const { res, j, calls, inserts } = await run({ action: 'move', entry: { kind: 'counted', ...REG, qty: 5 } }, { member: { role: 'driver', permissions: { manage_assets: true } },
    onhand: [{ company: 'adchem', ...REG, qty: 3, min_qty: 4, below: true }] });
  assert.equal(res.status, 403); assert.equal(j.error.code, 'forbidden'); assert.equal(j.error.message, 'counting needs View assets');
  assert.ok(!calls.some(c => c.url.includes('/rpc/')), 'on-hand not read'); assert.equal(inserts.length, 0);
  const ok2 = await run({ action: 'move', entry: { kind: 'received', ...REG, qty: 1 } }, { member: { role: 'driver', permissions: { manage_assets: true } } });
  assert.equal(ok2.res.status, 200, 'the same member may still receive');
  const vw = await run({ action: 'move', entry: { kind: 'counted', ...REG, qty: 5 } }, { member: { role: 'driver', permissions: { manage_assets: true, view_assets: true } }, onhand: [{ company: 'adchem', ...REG, qty: 3 }] });
  assert.equal(vw.inserts[0].body[0].qty, 2, 'with view_assets the count goes in');
});

test('/api/stock move: a gas-container key (one of the company\'s container types) is 400 gas_key, nothing written; types are read as the caller', async () => {
  const types = [{ product: 'Carbon Dioxide', size_label: '50lb Cylinder' }];
  for (const entry of [{ kind: 'received', ...CYL, qty: 2 }, { kind: 'adjusted', ...CYL, qty: -1, note: 'x' }, { kind: 'counted', ...CYL, qty: 3 }, { kind: 'produced', ...CYL, qty: 1 }]) {
    const { res, j, calls, inserts } = await run({ action: 'move', entry }, { member: { is_super_admin: true }, types, onhand: [{ company: 'adchem', ...CYL, qty: 1 }] });
    assert.equal(res.status, 400, entry.kind); assert.equal(j.error.code, 'gas_key'); assert.match(j.error.message, /50lb Cylinder is a gas container/);
    assert.equal(inserts.length, 0, 'nothing written');
    const t = calls.find(c => c.url.includes('/rest/v1/dispatch_container_types'));
    assert.ok(t && /select=product,size_label/.test(t.url) && /company=eq\.adchem/.test(t.url), 'the company\'s types are read');
  }
  const ok2 = await run({ action: 'move', entry: { kind: 'received', ...CYL, qty: 2 } }, { member: MANAGER, types: [{ product: 'Carbon Dioxide', size_label: '20lb Cylinder' }] });
  assert.equal(ok2.res.status, 200, 'a product + container that is not a type of this company passes');
  const bulk = await run({ action: 'move', entry: { kind: 'received', ...BULK, qty: 2 } }, { member: MANAGER, types });
  assert.equal(bulk.res.status, 200, 'bulk Carbon Dioxide is not a gas-container key');
  const bad = await run({ action: 'move', entry: { kind: 'received', ...CYL, unit: 'lb', qty: 2 } }, { member: MANAGER, types });
  assert.equal(bad.j.error.code, 'bad_entry', 'the shape is checked before the types are read');
  assert.ok(!bad.calls.some(c => c.url.includes('dispatch_container_types')));
});

test('/api/stock move: produced records even when bulk is already below zero (never clamped)', async () => {
  const { res, j, inserts, calls } = await run({ action: 'move', entry: { kind: 'produced', ...BIN, qty: 6 } }, { member: { is_super_admin: true },
    onhand: [{ company: 'adchem', ...BULK, qty: -100, min_qty: 500, below: true }] });
  assert.equal(res.status, 200); assert.equal(j.ids.length, 2);
  assert.deepEqual(inserts[0].body.map(r => [r.product, r.qty, r.unit]), [['Dry Ice - Pellet', 6, 'count'], ['Carbon Dioxide', -300, 'lb']]);
  assert.ok(!calls.some(c => c.url.includes('/rpc/')), 'produced does not read on-hand');
});

test('/api/stock onhand and below: a view_assets holder or an editor reads; a driver without it is 403', async () => {
  const onhand = [{ company: 'adchem', ...BULK, qty: 450, min_qty: 500, below: true, alert: true }, { company: 'adchem', ...BIN, qty: 6, min_qty: null, below: false, alert: false },
    { company: 'adchem', ...REG, qty: 3, min_qty: 4, below: true, alert: false }];
  const viewer = await run({ action: 'onhand' }, { member: { role: 'driver', permissions: { view_assets: true } }, onhand });
  assert.equal(viewer.res.status, 200); assert.deepEqual(viewer.j, { rows: onhand });
  const coord = await run({ action: 'onhand' }, { onhand });
  assert.equal(coord.res.status, 200, 'an editor reads on-hand');
  const below = await run({ action: 'below' }, { member: { permissions: { view_assets: true } }, onhand });
  assert.deepEqual(below.j, { rows: [onhand[0], onhand[2]] }, 'below carries alert-off rows too (the screen flags them; only the email drops them)');
  const driver = await run({ action: 'onhand' }, { member: { role: 'driver' }, onhand });
  assert.equal(driver.res.status, 403); assert.ok(!driver.calls.some(c => c.url.includes('/rpc/')));
  const unknown = await run({ action: 'nope' }, { member: MANAGER });
  assert.equal(unknown.res.status, 400);
});
