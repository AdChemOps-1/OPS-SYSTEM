import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { TAB, HEADER, rowsFor, writeCustomersOut, tryWriteCustomersOut, dateSerial, stampSerial } from '../../functions/_lib/customersout.js';

const col = (name, nth = 1) => { let seen = 0; for (let i = 0; i < HEADER.length; i++) if (HEADER[i] === name && ++seen === nth) return i; return -1; };
const DS = col('Delivery Street'), DCITY = col('City', 2), DSTATE = col('State', 2), DZIP = col('ZIP', 2);

const C = { id: 'c1000000-0000-4000-8000-000000000001', company: 'adchem', customer_id: 'ADC-0007', name: 'Type 7 Manufacturing', also_known_as: 'T7', legal_name: 'Type 7 Manufacturing, Inc.',
  account_status: 'active', primary_hub: 'EB', parent_customer_id: 'p1000000-0000-4000-8000-000000000001', parent_name: 'Type 7 Holdings',
  billing_street: '1 Billing Way', billing_city: 'Oakland', billing_state: 'CA', billing_zip: '94601', last_verified: '2026-10-01' };
const SITES = [
  { site_key: 'ADC-0007 — Plant', site_label: 'Plant', customer_id: 'c1000000-0000-4000-8000-000000000001', addr: '6201 Shellmound St, Emeryville CA 94608', city: 'Emeryville', hub: 'EB' },
  { site_key: 'ADC-0007 — Primary', site_label: 'Primary', customer_id: 'c1000000-0000-4000-8000-000000000001', addr: '100 Main St', city: 'Oakland', hub: 'EB' },
];
const CONTACTS = [
  { customer_id: 'c1000000-0000-4000-8000-000000000001', type: 'receiving', first_name: 'Sam', last_name: 'Ortiz', phone: '(510) 555-0101', site_key: 'ADC-0007 — Primary', active: true },
  { customer_id: 'c1000000-0000-4000-8000-000000000001', type: 'receiving', first_name: 'Rae', last_name: 'Lin', phone: '(510) 555-0144', site_key: 'ADC-0007 — Plant', active: true },
  { customer_id: 'c1000000-0000-4000-8000-000000000001', type: 'billing', first_name: 'Pat', last_name: 'Ng', phone: '(510) 555-0199', email: 'pat@type7.example', cc_on_statements: false, active: true },
  { customer_id: 'c1000000-0000-4000-8000-000000000001', type: 'billing', first_name: 'AP', last_name: '', email: 'ap@type7.example', cc_on_statements: true, active: true },
  { customer_id: 'c1000000-0000-4000-8000-000000000001', type: 'billing', first_name: 'Old', last_name: '', email: 'old@type7.example', cc_on_statements: true, active: false },
  { customer_id: 'c1000000-0000-4000-8000-000000000001', type: 'owner', first_name: 'Olu', last_name: 'Ade', phone: '(510) 555-0111', email: 'olu@type7.example', active: true },
];
const STATUS = { id: 'c1000000-0000-4000-8000-000000000001', customer_id: 'ADC-0007', profile_complete: 9, license_status: 'missing', license_expires: null, license_number: null, psa_status: 'missing', entity_status: null };
const NOW = new Date('2026-10-20T17:05:00Z');
const near = (a, b, m) => assert.ok(typeof a === 'number' && Math.abs(a - b) < 1e-9, `${m}: ${a} vs ${b}`);   // serials are floats

test('HEADER is the 33 spec §9 columns in order', () => {
  assert.equal(HEADER.length, 33);
  assert.equal(TAB, 'Customers Out');
  assert.deepEqual(HEADER, ['Customer ID','Customer','Also Known As','Legal Name','Account Status','Primary Hub','Parent Account','Billing Street','City','State','ZIP',
    'Delivery Street','City','State','ZIP','Delivery Contact','Delivery Phone','Billing Contact','Billing Phone','Billing Email','CC Emails','Owner Name','Owner Phone','Owner Email',
    'License Status','License #','License Expires','Entity Status','PSA Status','PSA Effective','Profile Complete','Last Verified','Updated At']);
  assert.equal(DS, 11, 'Delivery Street is column L');
});

test('rowsFor: one row for the Primary site, one per additional site, contacts by type', () => {
  const rows = rowsFor(C, SITES, CONTACTS, STATUS, 'America/Los_Angeles', NOW);
  assert.equal(rows.length, 2);
  rows.forEach(r => assert.equal(r.length, 33));
  const get = (r, name, nth) => r[col(name, nth)];
  const [r1, r2] = rows;
  // customer columns repeat on every row
  for (const r of rows) {
    assert.deepEqual(r.slice(0, 11), ['ADC-0007','Type 7 Manufacturing','T7','Type 7 Manufacturing, Inc.','active','EB','Type 7 Holdings','1 Billing Way','Oakland','CA','94601']);
    assert.equal(get(r, 'Billing Contact'), 'Pat Ng'); assert.equal(get(r, 'Billing Phone'), '(510) 555-0199'); assert.equal(get(r, 'Billing Email'), 'pat@type7.example');
    assert.equal(get(r, 'CC Emails'), 'ap@type7.example', 'active cc billing contacts only, not the main billing email');
    assert.deepEqual([get(r, 'Owner Name'), get(r, 'Owner Phone'), get(r, 'Owner Email')], ['Olu Ade', '(510) 555-0111', 'olu@type7.example']);
    assert.deepEqual([get(r, 'License Status'), get(r, 'License #'), get(r, 'License Expires'), get(r, 'Entity Status'), get(r, 'PSA Status'), get(r, 'PSA Effective')], ['missing', '', '', 'missing', 'missing', ''], 'blank dates stay blank');
    assert.equal(get(r, 'Profile Complete'), '9 of 15');
    assert.equal(get(r, 'Last Verified'), 46296, '2026-10-01 as a Sheets serial number');
    near(get(r, 'Updated At'), 46315 + (10 * 60 + 5) / 1440, '10/20/2026 10:05 Los Angeles time (17:05Z) as a fractional serial');
  }
  // row 1 = Primary site (even though it is listed second), row 2 = the plant, parsed from a feed-style address
  assert.deepEqual([r1[DS], r1[DCITY], r1[DSTATE], r1[DZIP]], ['100 Main St', 'Oakland', '', '']);
  assert.deepEqual([get(r1, 'Delivery Contact'), get(r1, 'Delivery Phone')], ['Sam Ortiz', '(510) 555-0101']);
  assert.deepEqual([r2[DS], r2[DCITY], r2[DSTATE], r2[DZIP]], ['6201 Shellmound St', 'Emeryville', 'CA', '94608']);
  assert.deepEqual([get(r2, 'Delivery Contact'), get(r2, 'Delivery Phone')], ['Rae Lin', '(510) 555-0144'], 'receiving contact of that site');
  // no money columns ever
  assert.ok(!HEADER.some(h => /balance|terms|credit|price|deposit|fee/i.test(h)));
});

test('date cells are serial numbers; text cells stay strings (ZIP leading zero, "=" names never formulas under RAW)', () => {
  assert.equal(dateSerial('2026-10-01'), 46296); assert.equal(dateSerial('1899-12-31'), 1); assert.equal(dateSerial(null), '');
  near(stampSerial(new Date('2026-01-15T20:30:00Z'), 'America/Los_Angeles'), dateSerial('2026-01-15') + (12 * 60 + 30) / 1440, 'PST');
  near(stampSerial(new Date('2026-10-21T02:00:00Z'), 'America/Los_Angeles'), dateSerial('2026-10-20') + 19 / 24, 'the company-tz day, not the UTC day');
  const [r] = rowsFor({ ...C, name: '=HYPERLINK("x")', billing_zip: '02134', last_verified: null }, [], [], { license_expires: '2027-03-31', psa_effective: '2026-01-02' }, 'America/Los_Angeles', NOW);
  assert.equal(r[col('Customer')], '=HYPERLINK("x")'); assert.equal(r[col('ZIP')], '02134');
  assert.deepEqual([r[col('License Expires')], r[col('PSA Effective')], r[col('Last Verified')]], [dateSerial('2027-03-31'), dateSerial('2026-01-02'), '']);
  const dateCols = new Set([col('License Expires'), col('PSA Effective'), col('Last Verified'), col('Updated At')]);
  r.forEach((v, i) => assert.equal(typeof v, dateCols.has(i) && v !== '' ? 'number' : 'string', HEADER[i] + ' type'));
});

test('rowsFor: a customer with no sites still gets one row; no Primary label → first site', () => {
  const none = rowsFor(C, [], [], { profile_complete: 3 }, 'America/Los_Angeles', NOW);
  assert.equal(none.length, 1); assert.equal(none[0].length, 33); assert.equal(none[0][DS], ''); assert.equal(none[0][col('Profile Complete')], '3 of 15');
  const two = rowsFor(C, [{ ...SITES[0] }, { ...SITES[1], site_label: 'Dock' }], [], null, 'America/Los_Angeles', NOW);
  assert.equal(two[0][DS], '6201 Shellmound St');
  assert.equal(two[0][col('Profile Complete')], '0 of 15');
});

// ---------- writeCustomersOut against stubbed Google + database ----------
let SA;
async function serviceAccount() {
  if (SA) return SA;
  const kp = await webcrypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
  const der = Buffer.from(await webcrypto.subtle.exportKey('pkcs8', kp.privateKey)).toString('base64');
  SA = JSON.stringify({ client_email: 'sa@x.iam.gserviceaccount.com', private_key: '-----BEGIN PRIVATE KEY-----\n' + der + '\n-----END PRIVATE KEY-----\n' });
  return SA;
}
const ok = (data) => new Response(JSON.stringify(data), { status: 200, headers: { 'content-type': 'application/json' } });

// sheetRows: the tab's rows from row 2 down. Returns the Sheets calls made (token exchange excluded).
async function run(sheetRows, customerIds, rebuild, data) {
  const env = { GOOGLE_SA_JSON: await serviceAccount() };
  const seen = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const u = decodeURIComponent(String(url)), method = init.method || 'GET';
    if (u.startsWith('https://oauth2.googleapis.com/token')) return ok({ access_token: 'gt', expires_in: 3600 });
    const body = init.body ? JSON.parse(init.body) : null;
    seen.push({ method, url: u, body });
    if (method === 'GET' && u.includes('/values/')) return ok({ values: sheetRows });
    if (method === 'GET' && u.includes('fields=sheets.properties')) return ok({ sheets: [{ properties: { sheetId: 0, title: 'Other' } }, { properties: { sheetId: 777, title: TAB } }] });
    return ok({});
  };
  const db = { async get(p) {
    seen.push({ method: 'DB', url: p });
    const t = p.split('?')[0];
    return (data[t] || []).slice();
  } };
  const ctx = { settings: { customersOutSheetId: 'https://docs.google.com/spreadsheets/d/1COUTsheetIdAAAAAAAAAAA/edit#gid=0', tz: 'America/Los_Angeles' } };
  try { return { r: await writeCustomersOut(env, db, ctx, 'adchem', customerIds, rebuild), seen: seen.filter(s => s.method !== 'DB'), db: seen.filter(s => s.method === 'DB') }; }
  finally { globalThis.fetch = real; }
}
const DATA = { dispatch_customers: [C, { id: 'p1000000-0000-4000-8000-000000000001', customer_id: 'ADC-0001', name: 'Type 7 Holdings' }], dispatch_sites: SITES, dispatch_contacts: CONTACTS, dispatch_customer_status: [STATUS] };
const blankRow = (id, street) => { const r = new Array(33).fill(''); r[0] = id; r[11] = street; return r; };

test('rebuild clears A2:AG then writes every row under the header', async () => {
  const { r, seen } = await run([blankRow('ADC-0099', 'gone')], [], true, DATA);
  assert.deepEqual(r, { ok: true, rebuilt: 3 });
  const clear = seen.findIndex(s => s.method === 'POST' && s.url.includes(`'${TAB}'!A2:AG:clear`));
  const put = seen.findIndex(s => s.method === 'PUT');
  assert.ok(clear >= 0, 'clear issued'); assert.ok(put > clear, 'PUT after clear');
  const vals = seen[put].body.values;
  assert.match(seen[put].url, new RegExp(`'${TAB}'!A1:AG\\?valueInputOption=RAW`));
  assert.deepEqual(vals[0], HEADER);
  assert.equal(vals.length - 1, 3, 'Type 7 has two site rows, the parent one row');
  assert.ok(vals.slice(1).every(v => v.length === 33));
  assert.ok(!vals.some(v => v[0] === 'ADC-0099'), 'a customer that no longer exists is gone after rebuild');
  assert.ok(!seen.some(s => s.url.includes(':append')), 'rebuild never appends');
  const fmt = seen.findIndex(s => s.url.endsWith(':batchUpdate') && s.body && s.body.requests);
  assert.ok(fmt > put, 'date formats applied after the write');
  assert.deepEqual(seen[fmt].body.requests.map(q => [q.repeatCell.range, q.repeatCell.cell.userEnteredFormat.numberFormat, q.repeatCell.fields]), [
    [{ sheetId: 777, startRowIndex: 1, startColumnIndex: 26, endColumnIndex: 27 }, { type: 'DATE', pattern: 'mm/dd/yyyy' }, 'userEnteredFormat.numberFormat'],
    [{ sheetId: 777, startRowIndex: 1, startColumnIndex: 29, endColumnIndex: 30 }, { type: 'DATE', pattern: 'mm/dd/yyyy' }, 'userEnteredFormat.numberFormat'],
    [{ sheetId: 777, startRowIndex: 1, startColumnIndex: 31, endColumnIndex: 32 }, { type: 'DATE', pattern: 'mm/dd/yyyy' }, 'userEnteredFormat.numberFormat'],
    [{ sheetId: 777, startRowIndex: 1, startColumnIndex: 32, endColumnIndex: 33 }, { type: 'DATE_TIME', pattern: 'mm/dd/yyyy hh:mm' }, 'userEnteredFormat.numberFormat']]);
  assert.equal(typeof vals[1][31], 'number', 'Last Verified written as a number');
});

test('incremental: an existing (Customer ID, Delivery Street) row is rewritten in place, never duplicated', async () => {
  const sheet = [blankRow('ADC-0001', ''), blankRow('ADC-0007', '100 Main St'), blankRow('ADC-0007', '6201 Shellmound St')];
  const { r, seen, db } = await run(sheet, ['c1000000-0000-4000-8000-000000000001'], false, DATA);
  assert.deepEqual(r, { ok: true, updated: 2, appended: 0, deleted: 0 });
  const bu = seen.filter(s => s.url.endsWith('/values:batchUpdate'));
  assert.equal(bu.length, 1);
  assert.equal(bu[0].body.valueInputOption, 'RAW');
  assert.deepEqual(bu[0].body.data.map(d => [d.range, d.values[0][0], d.values[0][11]]), [[`'${TAB}'!A3:AG3`, 'ADC-0007', '100 Main St'], [`'${TAB}'!A4:AG4`, 'ADC-0007', '6201 Shellmound St']]);
  assert.ok(!seen.some(s => s.url.includes(':append')), 'no append');
  assert.ok(!seen.some(s => s.body && s.body.requests), 'no delete');
  assert.ok(db.some(d => d.url.startsWith('dispatch_customer_status?select=*&company=eq.adchem')), 'status read from the view');
});

test('incremental: a new site is appended; a row for a site the customer no longer has is deleted (Review Focus 4)', async () => {
  const sheet = [blankRow('ADC-0007', '100 Main St'), blankRow('ADC-0001', ''), blankRow('ADC-0007', '9 Old Merged Rd'), blankRow('ADC-0007', '8 Older Rd')];
  const { r, seen } = await run(sheet, ['c1000000-0000-4000-8000-000000000001'], false, DATA);
  assert.deepEqual(r, { ok: true, updated: 1, appended: 1, deleted: 2 });
  const del = seen.find(s => s.url.endsWith(':batchUpdate') && !s.url.endsWith('/values:batchUpdate'));
  assert.ok(del, 'spreadsheet batchUpdate issued');
  assert.deepEqual(del.body.requests, [
    { deleteDimension: { range: { sheetId: 777, dimension: 'ROWS', startIndex: 4, endIndex: 5 } } },   // sheet row 5 first (bottom-up)
    { deleteDimension: { range: { sheetId: 777, dimension: 'ROWS', startIndex: 3, endIndex: 4 } } }]);
  const ap = seen.find(s => s.url.includes(':append'));
  assert.equal(ap.body.values.length, 1); assert.equal(ap.body.values[0][11], '6201 Shellmound St');
  const order = seen.map(s => s.url.endsWith('/values:batchUpdate') ? 'update' : s.body && s.body.requests ? 'delete' : s.url.includes(':append') ? 'append' : null).filter(Boolean);
  assert.deepEqual(order, ['update', 'delete', 'append'], 'row numbers are used before any delete shifts them');
  assert.ok(!seen.some(s => s.url.includes(':clear')), 'incremental never clears');
});

test('no sheet set → skipped; tryWriteCustomersOut never throws', async () => {
  const r = await writeCustomersOut({}, { get: async () => [] }, { settings: {} }, 'adchem', ['c1000000-0000-4000-8000-000000000001'], false);
  assert.match(r.skipped, /No Customers Out sheet/);
  const real = globalThis.fetch; globalThis.fetch = async () => { throw new Error('network down'); };
  try {
    const t = await tryWriteCustomersOut({ GOOGLE_SA_JSON: await serviceAccount() }, { get: async () => [] }, { settings: { customersOutSheetId: '1COUTsheetIdAAAAAAAAAAA' } }, 'adchem', ['c1000000-0000-4000-8000-000000000001']);
    assert.equal(t.ok, false); assert.match(t.error, /network down|Google token/);
  } finally { globalThis.fetch = real; }
});
