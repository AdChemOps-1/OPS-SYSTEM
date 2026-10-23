import test from 'node:test';
import assert from 'node:assert/strict';
import { movementsFor, buildStockAlerts, stockRecipientsOf } from '../../functions/_lib/stock.js';
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

// ---------- the route against stubbed Supabase ----------
const ok = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
async function run(body, { member = {}, onhand = [], insertError = null } = {}) {
  const calls = [], real = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url), method = init.method || 'GET';
    calls.push({ url: u, method, body: init.body ? JSON.parse(init.body) : null, headers: init.headers || {} });
    if (u.includes('/auth/v1/user')) return ok({ id: WHO, email: 'm@adchem.pro' });
    if (u.includes('/rest/v1/dispatch_members')) return ok([{ company: 'adchem', role: 'coordinator', hub: 'EB', active: true, is_super_admin: false, permissions: {}, ...member }]);
    if (u.includes('/rest/v1/dispatch_users')) return ok([{ email: 'm@adchem.pro', name: 'M' }]);
    if (u.endsWith('/rest/v1/rpc/dispatch_stock_onhand_for')) return ok(onhand);
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
  const first = await run({ action: 'move', entry: { kind: 'counted', ...REG, qty: 4 } }, { member: MANAGER, onhand: [] });
  assert.equal(first.inserts[0].body[0].qty, 4, 'no prior movements: the delta is the count');
  const same = await run({ action: 'move', entry: { kind: 'counted', ...BIN, qty: 7 } }, { member: MANAGER, onhand });
  assert.deepEqual(same.j, { ok: true, ids: [], note: 'no change' }); assert.equal(same.inserts.length, 0);
});

test('/api/stock move: produced records even when bulk is already below zero (never clamped)', async () => {
  const { res, j, inserts, calls } = await run({ action: 'move', entry: { kind: 'produced', ...BIN, qty: 6 } }, { member: { is_super_admin: true },
    onhand: [{ company: 'adchem', ...BULK, qty: -100, min_qty: 500, below: true }] });
  assert.equal(res.status, 200); assert.equal(j.ids.length, 2);
  assert.deepEqual(inserts[0].body.map(r => [r.product, r.qty, r.unit]), [['Dry Ice - Pellet', 6, 'count'], ['Carbon Dioxide', -300, 'lb']]);
  assert.ok(!calls.some(c => c.url.includes('/rpc/')), 'produced does not read on-hand');
});

test('/api/stock onhand and below: a view_assets holder or an editor reads; a driver without it is 403', async () => {
  const onhand = [{ company: 'adchem', ...BULK, qty: 450, min_qty: 500, below: true }, { company: 'adchem', ...BIN, qty: 6, min_qty: null, below: false }];
  const viewer = await run({ action: 'onhand' }, { member: { role: 'driver', permissions: { view_assets: true } }, onhand });
  assert.equal(viewer.res.status, 200); assert.deepEqual(viewer.j, { rows: onhand });
  const coord = await run({ action: 'onhand' }, { onhand });
  assert.equal(coord.res.status, 200, 'an editor reads on-hand');
  const below = await run({ action: 'below' }, { member: { permissions: { view_assets: true } }, onhand });
  assert.deepEqual(below.j, { rows: [onhand[0]] });
  const driver = await run({ action: 'onhand' }, { member: { role: 'driver' }, onhand });
  assert.equal(driver.res.status, 403); assert.ok(!driver.calls.some(c => c.url.includes('/rpc/')));
  const unknown = await run({ action: 'nope' }, { member: MANAGER });
  assert.equal(unknown.res.status, 400);
});
