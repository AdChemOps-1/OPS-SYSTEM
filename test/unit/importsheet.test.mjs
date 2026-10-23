import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TABS, HEADERS, readTab, planImport, applyPlan, bindRows } from '../../functions/_lib/importsheet.js';

const WB = JSON.parse(readFileSync(new URL('../fixtures/import-workbook.json', import.meta.url)));
const clone = (x) => JSON.parse(JSON.stringify(x));
const NONE = { customers: [], sites: [], contacts: [], hubNotes: [] };
const MONEY = /terms|credit|balance|price|fee|deposit/i;
const byName = (plan, name) => plan.items.find(i => i.name === name);

test('TABS and HEADERS name the five tabs and the spec §8 columns', () => {
  assert.deepEqual(TABS, { directory: 'Customer Directory', customers: 'Customers', licensing: 'Licensing & Entity', delivery: 'Delivery Notes', terms: 'Account Terms' });
  for (const h of ['Customer (QuickBooks name)', 'Also Known As', 'Legal / Billing Company Name', 'Account Status', 'Primary Hub', 'Same as billing?', 'Delivery same as billing contact?',
    'Delivery Contact Name', 'Delivery Phone', 'Billing / AP Email', 'CC on Statements (emails)', 'Owner same as billing contact?', 'Best Way to Reach', 'Last Verified', 'Notes', 'Customer ID', 'Parent / Related Account',
    'BILLING ADDRESS › Street', 'BILLING ADDRESS › ZIP', 'DELIVERY ADDRESS › Street', 'DELIVERY ADDRESS › ZIP', 'BILLING CONTACT › First Name', 'BILLING CONTACT › Phone', 'COMPANY OWNER › Last Name', 'COMPANY OWNER › Email'])
    assert.ok(HEADERS.directory.includes(h), 'directory header ' + h);
  assert.deepEqual(HEADERS.customers, ['Customer', 'Also Known As', 'Legal Name', 'Account Status', 'Street', 'City', 'State', 'ZIP', 'Contact', 'Phone', 'Email']);
  assert.equal(HEADERS.delivery.length, 15); assert.ok(HEADERS.delivery.includes('Cylinder / Container Notes (pigs, dewars, bins, swaps)'));
  assert.deepEqual(HEADERS.licensing, ['Customer', 'Licensee Legal Name', 'License #', 'License Type', 'Status', 'Issued', 'Expires', 'County / Premises', 'Owners on the License', 'Entity Status (SOS)', 'Source', 'Checked', 'Notes']);
  assert.deepEqual(HEADERS.terms, ['Customer', 'Quote Sent', 'Quote Accepted', 'PSA Sent for Signature', 'PSA Signed (Customer)', 'Countersigned (AdChem)', 'Effective Date']);
  for (const t of Object.keys(HEADERS)) assert.ok(!HEADERS[t].some(h => MONEY.test(h)), t + ' reads no money column');
});

test('readTab: Directory header row found at index 3 (first row with Customer ID); duplicate headers split by group', () => {
  const r = readTab(WB.directory, undefined, HEADERS.directory);
  assert.equal(r.headerRow, 3);
  assert.deepEqual(r.missing, []);
  assert.equal(r.rows.length, 4);
  const t7 = r.rows[0];
  assert.equal(t7['Customer (QuickBooks name)'], 'Type 7 Manufacturing');
  assert.equal(t7['BILLING ADDRESS › Street'], '1 Billing Way'); assert.equal(t7['DELIVERY ADDRESS › Street'], '100 Main St');
  assert.equal(t7['BILLING CONTACT › First Name'], 'Pat'); assert.equal(t7['COMPANY OWNER › First Name'], 'Olu');
  assert.equal(t7['DELIVERY ADDRESS › ZIP'], '94607'); assert.equal(t7['Customer ID'], 'ADC-0001');
  assert.equal(t7._row, 5, 'sheet row number (1-based)');
  // header row given explicitly
  assert.deepEqual(readTab(WB.directory, 3, HEADERS.directory).missing, []);
});

test('readTab + planImport: a renamed Customer ID column is reported missing and named in problems', () => {
  const wb = clone(WB); wb.directory[3][30] = 'Cust #';
  const r = readTab(wb.directory, 3, HEADERS.directory);
  assert.ok(r.missing.includes('Customer ID'));
  assert.equal(readTab(wb.directory, undefined, HEADERS.directory).headerRow, 3, 'falls back to the row with the most expected headers');
  const plan = planImport(wb, NONE);
  assert.ok(plan.missingHeaders['Customer Directory'].includes('Customer ID'));
  assert.ok(plan.problems.some(p => p.includes('Customer Directory') && p.includes('Customer ID')), plan.problems.join(' | '));
  assert.ok(!plan.items.some(i => i.source.tab === 'Customer Directory' && i.action !== 'problem'), 'the Directory is not read with a column missing');
});

test('planImport: customers, the LA site, parent, Customers-only row, skipped tabs', () => {
  const plan = planImport(WB, NONE);
  assert.deepEqual(plan.problems, []);
  assert.deepEqual(plan.missingHeaders, { 'Customer Directory': [], Customers: [], 'Delivery Notes': [], 'Licensing & Entity': [], 'Account Terms': [] });
  const t7 = byName(plan, 'Type 7 Manufacturing'), llc = byName(plan, 'VKGL Manufacturing LLC'), la = byName(plan, 'VKGL Manufacturing - LA'),
    costa = byName(plan, 'Costa Cannabis'), bio = byName(plan, 'Bio-Rad');
  assert.deepEqual([t7.action, t7.decision, t7.customer_id, t7.source], ['customer', 'customer', 'ADC-0001', { tab: 'Customer Directory', row: 5 }]);
  assert.deepEqual([llc.action, llc.customer_id], ['customer', 'ADC-0002']);
  assert.deepEqual([la.action, la.decision, la.siteOf], ['site', 'site', llc.key], 'same legal name, different delivery address → a site of VKGL LLC');
  assert.equal(la.fields.site_label, 'LA'); assert.equal(la.fields.delivery_street, '1200 E 7th St');
  assert.deepEqual([costa.action, costa.parent, costa.customer_id], ['customer', t7.key, 'ADC-0007']);
  assert.deepEqual([bio.action, bio.source.tab, bio.customer_id, bio.fields.legal_name, bio.fields.billing_city], ['customer', 'Customers', 'ADC-0008', 'Bio-Rad Laboratories, Inc.', 'Hercules'], 'Customers-only row, numbered max+1');
  assert.ok(bio.contacts.some(c => c.type === 'other' && c.first_name === 'Dana' && c.email === 'ap@bio-rad.example'), 'a Customers-tab contact is type other (spec §8), not billing (I10c)');
  assert.ok(!bio.contacts.some(c => c.type === 'billing'));
  // the Customers-tab duplicate of Type 7 merges (no own item) and fills only blanks: the Directory's AKA "T7" wins
  assert.equal(plan.items.filter(i => i.name === 'Type 7 Manufacturing' && i.action === 'customer').length, 1);
  assert.equal(t7.fields.also_known_as, 'T7');
  // one review row per Directory/Customers source row + one per Licensing & Entity / Account Terms row
  assert.equal(plan.items.length, 7);
  assert.deepEqual(plan.items.filter(i => i.action === 'license' || i.action === 'psa').map(s => [s.source.tab, s.source.row, s.action, s.decision, s.name]),
    [['Licensing & Entity', 2, 'license', 'license', 'Costa Cannabis'], ['Account Terms', 2, 'psa', 'psa', 'Type 7 Manufacturing']]);
  assert.ok(!plan.items.some(i => i.action === 'skip'), 'no tab is deferred any more');
  // field values
  assert.deepEqual({ ...t7.fields }, {
    name: 'Type 7 Manufacturing', also_known_as: 'T7', legal_name: 'Type 7 Manufacturing, Inc.', account_status: 'active', primary_hub: 'EB',
    billing_street: '1 Billing Way', billing_city: 'Oakland', billing_state: 'CA', billing_zip: '94601', last_verified: '2026-10-01', notes: 'Statements monthly',
    delivery_street: '100 Main St', delivery_city: 'Oakland', delivery_state: 'CA', delivery_zip: '94607', hub: 'EB', site_label: 'Primary',
    receiving_hours: 'Mon–Fri 7–11am', gate_code: '', parking_unloading: 'Dock B, liftgate', hazmat_restrictions: 'No smoking on the dock',
    container_notes: 'Swap pigs at the cage', special_instructions: 'Call 30 min ahead', site_last_verified: '2026-10-02' });
  assert.deepEqual(llc.fields.delivery_street, '840 W Esther St', 'Same as billing? = Yes copies the billing address');
  // Delivery Notes
  assert.deepEqual(t7.hubNotes, [{ hub: 'EB', scale_on_route: true, route_notes: 'Scale on 580 at Grant Line' }]);
  assert.equal(costa.fields.gate_code, '#4455'); assert.deepEqual(costa.hubNotes, []);
  // no money anywhere in fields
  for (const i of plan.items) for (const k of Object.keys(i.fields || {})) assert.ok(!MONEY.test(k), i.name + ' field ' + k);
  for (const money of ['5,000.00', 'Net 30', '1,250.00', '7,777.77', '1,500.00', 'Balance', 'Credit', 'Deposit'])
    assert.ok(!JSON.stringify(plan).includes(money), 'no money value anywhere in the plan: ' + money);
});

test('planImport: contacts from the three blocks, honouring the same-as flags', () => {
  const plan = planImport(WB, NONE);
  const t7 = byName(plan, 'Type 7 Manufacturing'), llc = byName(plan, 'VKGL Manufacturing LLC'), costa = byName(plan, 'Costa Cannabis');
  const types = t7.contacts.map(c => c.type);
  for (const t of ['receiving', 'billing', 'owner']) assert.ok(types.includes(t), 'Type 7 has a ' + t + ' contact');
  const rec = t7.contacts.filter(c => c.type === 'receiving');
  assert.deepEqual(rec.map(c => [c.first_name, c.last_name, c.phone, c.at_site]), [['Sam', 'Ortiz', '(510) 555-0101', true]], 'Delivery Notes site contact merges with the same person');
  assert.deepEqual(t7.contacts.find(c => c.type === 'owner'), { type: 'owner', first_name: 'Olu', last_name: 'Ade', phone: '(510) 555-0111', email: 'olu@type7.example', preferred_method: null, cc_on_statements: false, at_site: false });
  assert.deepEqual(t7.contacts.filter(c => c.cc_on_statements).map(c => c.email), ['controller@type7.example']);
  assert.equal(t7.contacts.find(c => c.type === 'billing' && !c.cc_on_statements).preferred_method, 'email');
  // VKGL LLC: owner same as billing → one object for both roles; delivery contact same as billing → a receiving copy at the site
  const both = llc.contacts.filter(c => c.type === 'billing' || c.type === 'owner');
  assert.equal(both.length, 1);
  assert.deepEqual([both[0].type, both[0].owner_same, both[0].first_name, both[0].email], ['billing', true, 'Vic', 'ap@vkgl.example']);
  assert.deepEqual(llc.contacts.filter(c => c.type === 'receiving').map(c => [c.first_name, c.phone, c.at_site]), [['Vic', '(562) 555-0123', true]]);
  // Costa: billing email only, owner separate
  assert.deepEqual(costa.contacts.map(c => c.type).sort(), ['billing', 'owner', 'receiving']);
});

const T7_EXISTING = { id: 'c-t7', company: 'adchem', customer_id: 'ADC-0001', name: 'Type 7 Manufacturing', also_known_as: '', legal_name: 'Type 7 Manufacturing, Inc.', account_status: 'active',
  primary_hub: 'EB', billing_street: '1 Billing Way', billing_city: 'Oakland', billing_state: 'CA', billing_zip: '94607', last_verified: null, notes: '', updated_by: 'u9', parent_customer_id: null };

test('applyPlan: an app-edited customer keeps its fields; blanks are filled; updated_by kept (Review Focus 3)', () => {
  const existing = { ...NONE, customers: [T7_EXISTING] };
  const plan = planImport(WB, existing);
  const out = applyPlan(plan, existing, 'u1');
  const t7 = out.customers.find(c => c.customer_id === 'ADC-0001');
  assert.equal(t7.billing_zip, '94607', 'app-edited billing_zip untouched');
  assert.equal(t7.also_known_as, 'T7', 'blank also_known_as filled');
  assert.equal(t7.last_verified, '2026-10-01', 'blank date filled');
  assert.equal(t7.notes, 'Statements monthly');
  assert.equal(t7.updated_by, 'u9', 'still counts as app-edited next time');
  // the same row last written by the importing user is overwritten
  const mine = applyPlan(planImport(WB, { ...NONE, customers: [{ ...T7_EXISTING, updated_by: 'u1' }] }), { ...NONE, customers: [{ ...T7_EXISTING, updated_by: 'u1' }] }, 'u1');
  const m7 = mine.customers.find(c => c.customer_id === 'ADC-0001');
  assert.deepEqual([m7.billing_zip, m7.updated_by], ['94601', 'u1']);
  // new rows are stamped with the importer and the source; blanks are '' never null
  const fresh = applyPlan(planImport(WB, NONE), NONE, 'u1');
  const bio = fresh.customers.find(c => c.customer_id === 'ADC-0008');
  assert.deepEqual([bio.updated_by, bio.import_source, bio.also_known_as, bio.notes, bio.primary_hub, bio.last_verified], ['u1', { tab: 'Customers', row: 3 }, '', '', '', null]);
  for (const c of fresh.customers) for (const [k, v] of Object.entries(c)) if (!['last_verified', 'import_source', 'updated_by', 'parent_ref'].includes(k)) assert.equal(typeof v, 'string', c.customer_id + '.' + k);
});

test('applyPlan: an app-edited site keeps its Ops fields; app-edited hub note kept', () => {
  const t7 = { ...T7_EXISTING, updated_by: null };
  const site = { company: 'adchem', site_key: 'ADC-0001 — Primary', customer_id: 'c-t7', customer: 'Type 7 Manufacturing', addr: '100 Main St', city: 'Oakland', hub: 'EB', site_label: 'Primary',
    code_raw: '', code: null, receiving_hours: '6–9am', gate_code: '', parking_unloading: '', hazmat_restrictions: '', container_notes: '', special_instructions: '', last_verified: null, updated_by: 'u9' };
  const note = { company: 'adchem', site_key: 'ADC-0001 — Primary', hub: 'EB', scale_on_route: false, route_notes: 'No scale now', updated_by: 'u9' };
  const existing = { customers: [t7], sites: [site], contacts: [], hubNotes: [note] };
  const out = applyPlan(planImport(WB, existing), existing, 'u1');
  const s = out.sites.find(x => x.site_key === 'ADC-0001 — Primary');
  assert.deepEqual([s.receiving_hours, s.parking_unloading, s.updated_by, s.customer_ref], ['6–9am', 'Dock B, liftgate', 'u9', 'ADC-0001']);
  assert.equal(out.sites.filter(x => x.customer_ref === 'ADC-0001').length, 1, 'the app-created site is reused, not duplicated');
  assert.ok(!out.siteHubNotes.some(n => n.site_key === 'ADC-0001 — Primary' && n.hub === 'EB'), 'app-edited hub note left alone');
});

test('applyPlan: rows, keys, contacts, numbering', () => {
  const plan = planImport(WB, NONE);
  const out = applyPlan(plan, NONE, 'u1');
  assert.deepEqual(out.customers.map(c => c.customer_id), ['ADC-0001', 'ADC-0002', 'ADC-0007', 'ADC-0008'], 'the LA row is a site, not a customer');
  assert.equal(out.nextCustomerNumber, 9, 'highest imported ID is ADC-0008');
  assert.equal(out.customers.find(c => c.customer_id === 'ADC-0007').parent_ref, 'ADC-0001');
  assert.deepEqual(out.sites.map(s => [s.site_key, s.customer_ref, s.addr, s.city, s.hub, s.site_label]), [
    ['ADC-0001 — Primary', 'ADC-0001', '100 Main St, Oakland CA 94607', 'Oakland', 'EB', 'Primary'],
    ['ADC-0002 — Primary', 'ADC-0002', '840 W Esther St, Long Beach CA 90813', 'Long Beach', 'LA', 'Primary'],
    ['ADC-0002 — LA', 'ADC-0002', '1200 E 7th St, Los Angeles CA 90021', 'Los Angeles', 'LA', 'LA'],
    ['ADC-0007 — Primary', 'ADC-0007', '2330 E Anaheim St, Long Beach CA 90804', 'Long Beach', 'LA', 'Primary']], 'site_key = customer_id — label (Task 5)');
  const s7 = out.sites[0];
  assert.deepEqual([s7.code_raw, s7.code, s7.last_verified, s7.gate_code, s7.updated_by, s7.import_source], ['', null, '2026-10-02', '', 'u1', { tab: 'Customer Directory', row: 5 }]);
  const keys = (rows) => rows.map(r => Object.keys(r).sort().join());
  for (const t of ['customers', 'sites', 'siteHubNotes', 'contacts']) assert.equal(new Set(keys(out[t])).size, 1, t + ' rows share one key set (PostgREST bulk upsert)');
  assert.deepEqual(out.siteHubNotes, [{ site_key: 'ADC-0001 — Primary', hub: 'EB', scale_on_route: true, route_notes: 'Scale on 580 at Grant Line', updated_by: 'u1' }]);
  // contacts: VKGL LA's billing contact is the same person as VKGL LLC's → not duplicated; its receiving contact sits at the LA site
  const vk = out.contacts.filter(c => c.customer_ref === 'ADC-0002');
  assert.deepEqual(vk.map(c => [c.type, c.first_name, c.site_key, c.notes]).sort(), [
    ['billing', 'Vic', null, 'Also the company owner.'], ['receiving', 'Lee', 'ADC-0002 — LA', ''], ['receiving', 'Vic', 'ADC-0002 — Primary', '']].sort());
  assert.ok(out.contacts.every(c => c.updated_by === 'u1' && c.active === true));
  for (const t of ['customers', 'sites', 'contacts']) for (const r of out[t]) for (const k of Object.keys(r)) assert.ok(!MONEY.test(k), t + ' ' + k);
  // re-import against what the first import wrote: nothing duplicated
  const ids = new Map(out.customers.map((c, i) => [c.customer_id, 'id' + i]));
  const bound = bindRows(out, ids, 'adchem', '2026-10-20T00:00:00Z');
  const again = { customers: bound.customers.map(c => ({ ...c, id: ids.get(c.customer_id) })), sites: bound.sites, contacts: bound.contacts, hubNotes: bound.siteHubNotes };
  const out2 = applyPlan(planImport(WB, again), again, 'u1');
  assert.equal(out2.contacts.length, 0, 'every contact already exists');
  assert.deepEqual(out2.sites.map(s => s.site_key), out.sites.map(s => s.site_key), 'same site keys');
  assert.equal(out2.nextCustomerNumber, 9);
});

test('applyPlan: decisions — LA as its own customer, skip, related; numbering follows', () => {
  const plan = planImport(WB, NONE);
  const la = byName(plan, 'VKGL Manufacturing - LA');
  la.decision = 'customer';
  const out = applyPlan(plan, NONE, 'u1');
  assert.deepEqual(out.customers.map(c => c.customer_id).sort(), ['ADC-0001', 'ADC-0002', 'ADC-0003', 'ADC-0007', 'ADC-0008']);
  assert.ok(out.sites.some(s => s.site_key === 'ADC-0003 — Primary' && s.customer_ref === 'ADC-0003'));
  assert.equal(out.nextCustomerNumber, 9);
  la.decision = 'related';
  const rel = applyPlan(plan, NONE, 'u1');
  assert.equal(rel.customers.find(c => c.customer_id === 'ADC-0003').parent_ref, 'ADC-0002');
  byName(plan, 'Bio-Rad').decision = 'skip'; la.decision = 'skip';
  const sk = applyPlan(plan, NONE, 'u1');
  assert.deepEqual(sk.customers.map(c => c.customer_id), ['ADC-0001', 'ADC-0002', 'ADC-0007']);
  assert.equal(sk.nextCustomerNumber, 8);
  // a forged field or decision cannot reach another column
  const forged = planImport(WB, NONE); forged.items[0].fields.credit_limit = '99999'; forged.items[0].fields.balance = '1'; forged.items[0].decision = 'drop table';
  const f = applyPlan(forged, NONE, 'u1');
  assert.ok(f.customers.every(c => !('credit_limit' in c) && !('balance' in c)));
  assert.ok(!f.customers.some(c => c.customer_id === 'ADC-0001'), 'an unknown decision is treated as skip');
});

test('bindRows: refs become uuids, company and times added', () => {
  const out = applyPlan(planImport(WB, NONE), NONE, 'u1');
  const ids = new Map(out.customers.map((c, i) => [c.customer_id, 'uuid-' + i]));
  const b = bindRows(out, ids, 'adchem', '2026-10-20T00:00:00Z');
  assert.ok(b.customers.every(c => c.company === 'adchem' && !('parent_ref' in c) && c.updated_at === '2026-10-20T00:00:00Z'));
  assert.ok(b.sites.every(s => !('customer_ref' in s) && /^uuid-/.test(s.customer_id) && s.synced_at === '2026-10-20T00:00:00Z'));
  assert.ok(b.contacts.every(c => /^uuid-/.test(c.customer_id) && c.company === 'adchem'));
  assert.deepEqual(b.parents, [{ customer_id: 'ADC-0007', parent_customer_id: 'uuid-0' }]);
  assert.ok(b.siteHubNotes.every(n => n.company === 'adchem' && n.updated_at));
});

// ---------- /api/import against a stubbed Supabase + Google ----------
import { webcrypto } from 'node:crypto';
import { onRequestPost } from '../../functions/api/import.js';
let SA;
async function serviceAccount() {
  if (SA) return SA;
  const kp = await webcrypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
  const der = Buffer.from(await webcrypto.subtle.exportKey('pkcs8', kp.privateKey)).toString('base64');
  SA = JSON.stringify({ client_email: 'sa@x.iam.gserviceaccount.com', private_key: '-----BEGIN PRIVATE KEY-----\n' + der + '\n-----END PRIVATE KEY-----\n' });
  return SA;
}
const res = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
async function route(body, member, seed) {
  const env = { SUPABASE_URL: 'https://sb.example', SUPABASE_ANON_KEY: 'anon', GOOGLE_SA_JSON: await serviceAccount() };
  const writes = [], gets = [];
  const db = { dispatch_customers: [], dispatch_documents: [], ...(seed || {}) };
  const settings = { importSheetId: 'https://docs.google.com/spreadsheets/d/1IMPORTworkbookAAAAAAAAAA/edit', nextCustomerNumber: 3, tz: 'America/Los_Angeles' };
  const tabOf = { 'Customer Directory': 'directory', Customers: 'customers', 'Delivery Notes': 'delivery', 'Account Terms': 'terms' };
  const real = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const u = decodeURIComponent(String(url)), method = init.method || 'GET';
    if (u.startsWith('https://oauth2.googleapis.com/token')) return res({ access_token: 'gt', expires_in: 3600 });
    if (u.startsWith('https://sheets.googleapis.com/')) {
      assert.ok(u.includes('/spreadsheets/1IMPORTworkbookAAAAAAAAAA/values/'), u);
      const title = u.match(/values\/'([^']+)'!A1:AZ2000$/)[1];
      if (!tabOf[title]) return res({ error: { code: 400, message: `Unable to parse range: '${title}'!A1:AZ2000` } }, 400);
      return res({ values: WB[tabOf[title]] });
    }
    if (u === 'https://sb.example/auth/v1/user') return res({ id: 'u1', email: 'jamie@adchem.pro' });
    const m = u.match(/^https:\/\/sb\.example\/rest\/v1\/([a-z_]+)(\?.*)?$/); assert.ok(m, u);
    const t = m[1], body = init.body ? JSON.parse(init.body) : null;
    if (method === 'GET') {
      gets.push(u);
      if (t === 'dispatch_members') return res([member]);
      if (t === 'dispatch_users') return res([{ email: 'jamie@adchem.pro', name: 'Jamie' }]);
      if (t === 'dispatch_company_settings') return res([{ data: settings }]);
      if (t === 'dispatch_customers') return res(db.dispatch_customers);
      if (t === 'dispatch_documents') { assert.match(u, /source=eq\.import/); return res(db.dispatch_documents); }
      return res([]);
    }
    writes.push({ method, t, q: m[2] || '', body, prefer: init.headers && init.headers.prefer });
    if (t === 'dispatch_customers' && method === 'POST') body.forEach((r, i) => db.dispatch_customers.push({ ...r, id: 'uuid-' + r.customer_id }));
    return method === 'POST' ? res(body, 201) : new Response(null, { status: 204 });
  };
  const request = new Request('https://ops.example/api/import', { method: 'POST', headers: { authorization: 'Bearer tok', 'content-type': 'application/json' }, body: JSON.stringify(body) });
  try { const r = await onRequestPost({ request, env }); return { status: r.status, json: await r.json(), writes, gets }; }
  finally { globalThis.fetch = real; }
}
const COORD = { company: 'adchem', role: 'coordinator', hub: '', active: true, is_super_admin: false, permissions: { run_imports: true } };

test('/api/import: 403 without run_imports; read returns the plan; a missing tab is just absent', async () => {
  const no = await route({ company: 'adchem', action: 'read' }, { ...COORD, permissions: { manage_customers: true } });
  assert.equal(no.status, 403); assert.match(no.json.error.message, /run imports/);
  assert.equal(no.writes.length, 0);
  const r = await route({ company: 'adchem', action: 'read' }, COORD);
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.equal(r.json.sheetId, '1IMPORTworkbookAAAAAAAAAA');
  assert.deepEqual(r.json.plan.items.map(i => [i.name, i.action]), [['Type 7 Manufacturing', 'customer'], ['VKGL Manufacturing LLC', 'customer'], ['VKGL Manufacturing - LA', 'site'],
    ['Costa Cannabis', 'customer'], ['Bio-Rad', 'customer'], ['Type 7 Manufacturing', 'psa']], 'Licensing & Entity tab absent in this workbook');
  assert.equal(r.writes.length, 0, 'read writes nothing');
  const nm = await route({ company: 'adchem', action: 'commit', plan: r.json.plan }, COORD);
  assert.equal(nm.status, 403, 'commit also needs manage_customers'); assert.match(nm.json.error.message, /manage customers/); assert.equal(nm.writes.length, 0);
});

test('/api/import commit: customers first, then sites, hub notes, contacts; log; numbering; Customers Out', async () => {
  const plan = planImport(WB, NONE);
  const r = await route({ company: 'adchem', action: 'commit', plan }, { ...COORD, is_super_admin: true, permissions: {} });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.deepEqual(r.json.counts, { customers: 4, sites: 4, hubNotes: 1, contacts: 11, licenses: 1, psas: 1, documentsKept: 0, skipped: 0 });
  assert.equal(r.json.nextCustomerNumber, 9);
  assert.match(r.json.customersOut.skipped, /No Customers Out sheet/, 'Customers Out attempted (best effort)');
  const order = r.writes.map(w => w.t + (w.q.includes('on_conflict') ? '?' + w.q.split('on_conflict=')[1] : '') + ' ' + w.method);
  assert.deepEqual(order, ['dispatch_customers?company,customer_id POST', 'dispatch_company_settings?company POST', 'dispatch_customers?company,customer_id POST', 'dispatch_sites?company,site_key POST',
    'dispatch_site_hub_notes?company,site_key,hub POST', 'dispatch_contacts POST', 'dispatch_documents POST', 'dispatch_log POST']);
  assert.ok(order.indexOf('dispatch_company_settings?company POST') < order.indexOf('dispatch_sites?company,site_key POST'), 'numbering moves before any site/note/contact write');
  const [cust, settings, parent, sites, , contacts, docs, log] = r.writes;
  assert.deepEqual(docs.body.map(d => [d.doc_type, d.subject_type, d.subject_id, d.review_status, d.source, d.import_source.tab, d.import_source.row, d.import_source.sheetId, d.updated_by]).sort(), [
    ['cannabis_license', 'customer', 'uuid-ADC-0007', 'live', 'import', 'Licensing & Entity', 2, '1IMPORTworkbookAAAAAAAAAA', 'u1'],
    ['psa', 'customer', 'uuid-ADC-0001', 'live', 'import', 'Account Terms', 2, '1IMPORTworkbookAAAAAAAAAA', 'u1']]);
  assert.equal(new Set(docs.body.map(d => Object.keys(d).sort().join())).size, 1, 'document rows share one key set');
  assert.ok(docs.body.every(d => !('id' in d)), 'new documents are inserted, not upserted on an id');
  assert.ok(cust.body.every(c => c.company === 'adchem' && c.updated_by === 'u1' && c.import_source.sheetId === '1IMPORTworkbookAAAAAAAAAA' && !('id' in c) && !('parent_ref' in c)));
  // parent links: one batched upsert of the linked rows (I9), not a PATCH per row
  assert.equal(r.writes.filter(w => w.method === 'PATCH').length, 0, 'no per-row PATCH');
  assert.deepEqual(parent.body.map(p => [p.customer_id, p.parent_customer_id, p.name, p.company]), [['ADC-0007', 'uuid-ADC-0001', 'Costa Cannabis', 'adchem']]);
  assert.deepEqual(Object.keys(parent.body[0]).sort(), [...Object.keys(cust.body[0]), 'parent_customer_id'].sort(), 'the whole row (NOT NULL columns), plus the parent');
  assert.ok(r.gets.filter(u => /dispatch_(customers|sites|contacts|site_hub_notes)\?/.test(u)).every(u => !/limit=/.test(u) && /order=/.test(u)), 'paged, ordered reads (getAll), no row cap');
  assert.equal(log.prefer, 'return=minimal', 'the log row is inserted without reading it back (a coordinator cannot read import rows)');
  assert.ok(sites.body.every(s => /^uuid-ADC-/.test(s.customer_id) && s.company === 'adchem'));
  assert.ok(contacts.body.every(c => /^uuid-ADC-/.test(c.customer_id)));
  assert.deepEqual(log.body, [{ company: 'adchem', who: 'u1', what: 'import', detail: { counts: r.json.counts, sheetId: '1IMPORTworkbookAAAAAAAAAA' } }]);
  assert.equal(settings.body[0].data.nextCustomerNumber, 9); assert.equal(settings.body[0].data.tz, 'America/Los_Angeles', 'other settings kept');
  // (the Account Terms tab's name is the documents' import_source, not a money value)
  for (const w of r.writes) assert.ok(!/credit|balance|terms|price|deposit|"fee/i.test(JSON.stringify(w.body).replace(/"Account Terms"/g, '')), 'no money in ' + w.t);
});

// ---------- review fixes ----------
const BIO_NOTES = ['Bio-Rad', 'EB', '8–4', 'Dana Fox', '(510) 555-0160', '#77', '', 'No', 'Via 80', '', '', '', '', '', ''];

test('Delivery Notes for a customer with no delivery street: a new blank-address Primary site + a problem', () => {
  const wb = clone(WB); wb.delivery.push(BIO_NOTES);
  const plan = planImport(wb, NONE);
  assert.equal(byName(plan, 'Bio-Rad').fields.gate_code, '#77');
  const out = applyPlan(plan, NONE, 'u1');
  const site = out.sites.find(x => x.customer_ref === 'ADC-0008');
  assert.ok(site, 'a site is created for the notes');
  assert.deepEqual([site.site_key, site.addr, site.gate_code, site.receiving_hours, site.hub], ['ADC-0008 — Primary', '', '#77', '8–4', 'EB']);
  assert.deepEqual(out.siteHubNotes.filter(n => n.site_key === 'ADC-0008 — Primary').map(n => [n.hub, n.scale_on_route, n.route_notes]), [['EB', false, 'Via 80']]);
  assert.ok(out.contacts.some(c => c.customer_ref === 'ADC-0008' && c.type === 'receiving' && c.site_key === 'ADC-0008 — Primary'), 'site contact linked to the site');
  assert.ok(out.problems.some(p => /Bio-Rad/.test(p) && /no delivery address/.test(p)), out.problems.join(' | '));
});

test('Delivery Notes for a customer with no delivery street land on its existing feed site', () => {
  const wb = clone(WB); wb.delivery.push(BIO_NOTES);
  const feed = { company: 'adchem', site_key: 'Bio-Rad — Primary', customer: 'Bio-Rad', customer_id: null, code_raw: 'COD - Collect before unloading', code: 'COD',
    addr: '2000 Alfred Nobel Dr, Hercules CA 94547', unconfirmed: true, city: 'Hercules', hub: '', site_label: 'Primary', updated_by: null };
  const existing = { ...NONE, sites: [feed] };
  const out = applyPlan(planImport(wb, existing), existing, 'u1');
  const bio = out.sites.filter(x => x.customer_ref === 'ADC-0008');
  assert.deepEqual(bio.map(x => [x.site_key, x.addr, x.gate_code, x.code_raw]), [['Bio-Rad — Primary', '2000 Alfred Nobel Dr, Hercules CA 94547', '#77', 'COD - Collect before unloading']]);
  assert.deepEqual(out.siteHubNotes.filter(n => n.site_key === 'Bio-Rad — Primary').map(n => [n.hub, n.route_notes]), [['EB', 'Via 80']]);
  assert.ok(!out.problems.some(p => /Bio-Rad/.test(p)), 'nothing to report');
});

test('applyPlan twice (first result fed back as existing): a flipped row with no sheet ID keeps its number', () => {
  const plan = planImport(WB, NONE);
  const la = byName(plan, 'VKGL Manufacturing - LA'); la.customer_id = ''; la.decision = 'customer';
  const out1 = applyPlan(plan, NONE, 'u1');
  const id1 = out1.customers.find(c => c.name === 'VKGL Manufacturing - LA').customer_id;
  assert.equal(id1, 'ADC-0009');
  const ids = new Map(out1.customers.map(c => [c.customer_id, 'uuid-' + c.customer_id]));
  const b = bindRows(out1, ids, 'adchem', '2026-10-20T00:00:00Z');
  const again = { customers: b.customers.map(c => ({ ...c, id: ids.get(c.customer_id) })), sites: b.sites, contacts: b.contacts, hubNotes: b.siteHubNotes };
  const out2 = applyPlan(plan, again, 'u1');
  assert.equal(out2.customers.find(c => c.name === 'VKGL Manufacturing - LA').customer_id, id1, 'same customer_id on the retry');
  assert.equal(out2.customers.length, out1.customers.length);
  assert.equal(out2.contacts.length, 0, 'no duplicate contacts');
  assert.equal(out2.nextCustomerNumber, 10);
});

// ---------- final-review fixes ----------
test('planImport: a sheet Customer ID held by an app-made customer with another name and legal name is a problem, not an update (I3)', () => {
  const appMade = { id: 'c-app', company: 'adchem', customer_id: 'ADC-0001', name: 'Zed Welding', legal_name: 'Zed Welding Co', account_status: 'active', primary_hub: 'EB',
    billing_street: '', billing_city: '', billing_state: '', billing_zip: '', last_verified: null, notes: '', updated_by: 'u9', import_source: null, parent_customer_id: null };
  const existing = { ...NONE, customers: [appMade] };
  const plan = planImport(WB, existing);
  const t7 = byName(plan, 'Type 7 Manufacturing');
  assert.deepEqual([t7.action, t7.decision, t7.options, t7.existing], ['problem', 'skip', ['skip'], false]);
  assert.match(t7.detail, /ADC-0001 already belongs to “Zed Welding”/);
  assert.ok(plan.problems.some(p => /ADC-0001 already belongs to “Zed Welding”/.test(p)), plan.problems.join(' | '));
  const out = applyPlan(plan, existing, 'u1');
  assert.ok(!out.customers.some(c => c.customer_id === 'ADC-0001'), 'the app customer is not overwritten');
  assert.ok(!out.contacts.some(c => c.customer_ref === 'ADC-0001'));
  // the same number on a customer the import wrote before (import_source set), or with the same legal name, still updates
  for (const e of [{ ...appMade, import_source: { tab: 'Customer Directory', row: 5 } }, { ...appMade, legal_name: 'Type 7 Manufacturing, Inc' }]) {
    const p2 = planImport(WB, { ...NONE, customers: [e] });
    assert.deepEqual([byName(p2, 'Type 7 Manufacturing').action, byName(p2, 'Type 7 Manufacturing').existing], ['customer', true]);
  }
});

test('applyPlan: the importer\'s own app edit after an import is kept on the next run (I4)', () => {
  const T1 = '2026-10-20T10:00:00.000Z', T2 = '2026-10-20T11:30:00.123456+00:00', T3 = '2026-10-21T09:00:00.000Z';
  const plan = planImport(WB, NONE);
  const out1 = applyPlan(plan, NONE, 'u1');
  const ids = new Map(out1.customers.map(c => [c.customer_id, 'uuid-' + c.customer_id]));
  const b1 = bindRows(out1, ids, 'adchem', T1);
  const stamp = (r) => ({ ...r, import_source: { ...r.import_source, sheetId: 'S', at: (r.import_source && r.import_source.at) || T1 } });   // what /api/import adds
  let db = { customers: b1.customers.map(c => stamp({ ...c, id: ids.get(c.customer_id) })), sites: b1.sites.map(stamp), contacts: b1.contacts, hubNotes: b1.siteHubNotes };
  assert.ok(db.customers.every(c => c.updated_by === 'u1' && c.updated_at === T1 && c.import_source.at === T1));
  // the importer (u1) edits Type 7's billing ZIP and its site's receiving hours in the app
  db.customers = db.customers.map(c => c.customer_id === 'ADC-0001' ? { ...c, billing_zip: '94999', updated_at: T2, updated_by: 'u1' } : c);
  db.sites = db.sites.map(x => x.site_key === 'ADC-0001 — Primary' ? { ...x, receiving_hours: 'By appointment', updated_at: T2, updated_by: 'u1' } : x);
  const out2 = applyPlan(planImport(WB, db), db, 'u1');
  const t7 = out2.customers.find(c => c.customer_id === 'ADC-0001'), s7 = out2.sites.find(x => x.site_key === 'ADC-0001 — Primary');
  assert.equal(t7.billing_zip, '94999', 'importer\'s own customer edit kept');
  assert.equal(s7.receiving_hours, 'By appointment', 'importer\'s own site edit kept');
  assert.equal(t7.import_source.at, T1, 'the edited row keeps the earlier import stamp, so the edit still counts next time');
  assert.equal(out2.customers.find(c => c.customer_id === 'ADC-0002').import_source.at, undefined, 'an untouched row takes the new stamp (the route adds it)');
  // a third run (after the second wrote everything at T3) still keeps the edit
  const b2 = bindRows(out2, ids, 'adchem', T3);
  const stamp3 = (r) => ({ ...r, import_source: { ...r.import_source, sheetId: 'S', at: (r.import_source && r.import_source.at) || T3 } });
  const db3 = { customers: b2.customers.map(c => stamp3({ ...c, id: ids.get(c.customer_id) })), sites: b2.sites.map(stamp3), contacts: db.contacts, hubNotes: b2.siteHubNotes };
  const out3 = applyPlan(planImport(WB, db3), db3, 'u1');
  assert.equal(out3.customers.find(c => c.customer_id === 'ADC-0001').billing_zip, '94999');
  assert.equal(out3.sites.find(x => x.site_key === 'ADC-0001 — Primary').receiving_hours, 'By appointment');
  assert.equal(out3.customers.find(c => c.customer_id === 'ADC-0002').billing_zip, '90813', 'an unedited row is still refreshed from the sheet');
  assert.ok(b1.sites.every(x => x.updated_at === T1), 'sites carry updated_at so the test can compare it');
});

test('planImport: feed sites no customer claims are listed for later linking', () => {
  const feed = (key, customer, extra) => ({ company: 'adchem', site_key: key, customer, customer_id: null, code_raw: 'D - Deliver', addr: '1 Feed St, Oakland CA 94601', site_label: 'Primary', ...extra });
  const existing = { ...NONE, sites: [feed('Type 7 — Primary', 'Type 7 Manufacturing'), feed('Upside — Primary', 'The Upside Group, Inc.'), feed('Linked — Primary', 'Somebody', { customer_id: 'c-x' })] };
  const plan = planImport(WB, existing);
  assert.deepEqual(plan.unlinkedSites, [{ site_key: 'Upside — Primary', customer: 'The Upside Group, Inc.', addr: '1 Feed St, Oakland CA 94601' }]);
  assert.deepEqual(planImport(WB, NONE).unlinkedSites, []);
});

// ---------- Stage 3B: Licensing & Entity and Account Terms ----------
const lic = (plan) => plan.items.find(i => i.action === 'license');
const psa = (plan) => plan.items.find(i => i.action === 'psa');

test('planImport: a Licensing & Entity row becomes a license item; Balance (auto) is never read', () => {
  const r = readTab(WB.licensing, undefined, HEADERS.licensing);
  assert.deepEqual(r.missing, []);
  assert.ok(!('Balance (auto)' in r.rows[0]), 'a column the tab does not expect is not read');
  const plan = planImport(WB, NONE), it = lic(plan);
  assert.deepEqual([it.key, it.action, it.decision, it.options, it.customer_id, it.name, it.detail], ['lic:2', 'license', 'license', ['license', 'skip'], 'ADC-0007', 'Costa Cannabis', 'C11-0000001-LIC · expires 2027-03-31']);
  assert.deepEqual(it.doc, { doc_type: 'cannabis_license', number: 'C11-0000001-LIC', status: 'Active', issued: '2026-04-01', expires: '2027-03-31',
    extra: { licensee_legal_name: 'Costa Cannabis Inc.', license_type: 'Distributor', county_premises: 'Los Angeles', owners: 'Rita Costa', entity_status_sos: 'Active', source_note: 'DCC lookup' },
    source: 'import', checked_on: '2026-10-01', notes: 'Renewal due spring' });
  assert.ok(!JSON.stringify(plan).includes('7,777.77') && !/Balance/.test(JSON.stringify(plan)), 'Balance (auto) absent from everything');
});

test('planImport: an Account Terms row becomes a psa item with the six dates and nothing else', () => {
  const plan = planImport(WB, NONE), it = psa(plan);
  assert.deepEqual([it.key, it.action, it.decision, it.options, it.customer_id, it.name, it.detail], ['psa:2', 'psa', 'psa', ['psa', 'skip'], 'ADC-0001', 'Type 7 Manufacturing', 'PSA · signed']);
  assert.deepEqual(it.doc, { doc_type: 'psa', extra: { quote_sent: '2026-09-01', quote_accepted: '2026-09-05', sent_for_signature: '2026-09-10', signed_customer: '2026-09-12', countersigned: '2026-09-15', effective_date: '2026-10-01' } });
  for (const money of ['Net 30', '5,000.00', '1,500.00', 'Good', 'Signed"']) assert.ok(!JSON.stringify(it).includes(money), 'no ' + money);
});

test('planImport: a date typed as "pending" leaves the field empty, keeps the item, and names the cell (Review Focus 5)', () => {
  const wb = clone(WB); wb.terms[1][6] = 'pending'; wb.terms[1][11] = 'n/a'; wb.terms[1][8] = '46112';
  const plan = planImport(wb, NONE), it = psa(plan);
  assert.equal(it.action, 'psa');
  assert.deepEqual(it.doc.extra, { quote_sent: '', quote_accepted: '2026-09-05', sent_for_signature: '2026-03-31', signed_customer: '2026-09-12', countersigned: '2026-09-15', effective_date: '' }, 'a sheet serial parses');
  assert.ok(plan.problems.includes('Account Terms row 2, Quote Sent: “pending” is not a date'), plan.problems.join(' | '));
  assert.ok(plan.problems.includes('Account Terms row 2, Effective Date: “n/a” is not a date'), plan.problems.join(' | '));
  const wl = clone(WB); wl.licensing[1][6] = '13/45/2026';
  const pl = planImport(wl, NONE);
  assert.deepEqual([lic(pl).doc.expires, lic(pl).detail], ['', 'C11-0000001-LIC · expires —']);
  assert.ok(pl.problems.includes('Licensing & Entity row 2, Expires: “13/45/2026” is not a date'), pl.problems.join(' | '));
  // PSA stages: no dates → none; some → in progress
  wb.terms[1].splice(6, 6, '', '', '', '', '', ''); assert.equal(psa(planImport(wb, NONE)).detail, 'PSA · none');
  wb.terms[1][6] = '09/01/2026'; assert.equal(psa(planImport(wb, NONE)).detail, 'PSA · in progress');
});

test('planImport: a slice row naming no customer is a problem; an existing customer matches by name or ID', () => {
  const wb = clone(WB); wb.licensing.push(['Nobody Farms', 'Nobody LLC', 'C11-9', 'Cultivator', 'Active', '', '', '', '', '', '', '', '']);
  wb.terms.push(['ADC-0042', 'Net 15', '', '', '', '', '10/01/2026', '', '', '', '', '', '', '', '']);
  const plan = planImport(wb, NONE);
  const bad = plan.items.filter(i => i.action === 'problem');
  assert.deepEqual(bad.map(i => [i.key, i.source.tab, i.source.row, i.decision]), [['lic:3', 'Licensing & Entity', 3, 'skip'], ['psa:3', 'Account Terms', 3, 'skip']]);
  assert.match(bad[0].detail, /^Licensing & Entity row 3: no customer named “Nobody Farms”/);
  assert.ok(plan.problems.some(p => /^Account Terms row 3: no customer named “ADC-0042”/.test(p)), plan.problems.join(' | '));
  const existing = { ...NONE, customers: [{ id: 'c-42', company: 'adchem', customer_id: 'ADC-0042', name: 'Nobody Farms', updated_by: 'u9' }] };
  const p2 = planImport(wb, existing);
  assert.deepEqual(p2.items.filter(i => i.source.row === 3 && (i.action === 'license' || i.action === 'psa')).map(i => [i.action, i.customer_id, i.name]),
    [['license', 'ADC-0042', 'Nobody Farms'], ['psa', 'ADC-0042', 'Nobody Farms']]);
  const out = applyPlan(p2, existing, 'u1');
  assert.deepEqual(out.documents.filter(d => d.customer_key === 'ADC-0042').map(d => d.doc.doc_type), ['cannabis_license', 'psa']);
});

test('applyPlan + bindRows: documents for the bound customers; skipping drops them', () => {
  const plan = planImport(WB, NONE);
  const out = applyPlan(plan, NONE, 'u1');
  assert.deepEqual(out.documents.map(d => [d.customer_key, d.doc.doc_type, d.import_source]), [['ADC-0007', 'cannabis_license', { tab: 'Licensing & Entity', row: 2 }], ['ADC-0001', 'psa', { tab: 'Account Terms', row: 2 }]]);
  const ids = new Map(out.customers.map(c => [c.customer_id, 'uuid-' + c.customer_id]));
  const b = bindRows(out, ids, 'adchem', '2026-10-20T00:00:00Z');
  assert.equal(b.documents.length, 2);
  const l = b.documents.find(d => d.doc_type === 'cannabis_license'), p = b.documents.find(d => d.doc_type === 'psa');
  assert.deepEqual([l.company, l.subject_type, l.subject_id, l.review_status, l.source, l.import_source, l.updated_by, l.updated_at, l.number, l.expires, l.extra.entity_status_sos],
    ['adchem', 'customer', 'uuid-ADC-0007', 'live', 'import', { tab: 'Licensing & Entity', row: 2, at: '2026-10-20T00:00:00Z' }, 'u1', '2026-10-20T00:00:00Z', 'C11-0000001-LIC', '2027-03-31', 'Active']);
  assert.deepEqual([p.subject_id, p.title, p.number, p.status, p.issued, p.expires, p.notes, p.extra.countersigned], ['uuid-ADC-0001', '', '', '', null, null, '', '2026-09-15'], 'a PSA carries the six dates and the defaults');
  assert.ok(!b.documents.some(d => 'customer_key' in d || 'id' in d));
  // the importer skips the license line, or the customer it belongs to
  lic(plan).decision = 'skip';
  assert.deepEqual(applyPlan(plan, NONE, 'u1').documents.map(d => d.doc.doc_type), ['psa']);
  lic(plan).decision = 'license'; byName(plan, 'Costa Cannabis').decision = 'skip';
  const sk = applyPlan(plan, NONE, 'u1');
  assert.deepEqual(sk.documents.map(d => d.doc.doc_type), ['psa']);
  assert.ok(sk.problems.some(p => /Licensing & Entity row 2/.test(p) && /skipped/.test(p)), sk.problems.join(' | '));
  // a forged doc type or column cannot reach the table
  const f = planImport(WB, NONE); lic(f).doc.doc_type = 'insurance_certificate'; lic(f).doc.credit_limit = '1'; psa(f).doc.number = 'X'; psa(f).doc.extra.balance = '9';
  const fo = applyPlan(f, NONE, 'u1');
  assert.deepEqual(fo.documents.map(d => d.doc.doc_type), ['cannabis_license', 'psa']);
  assert.ok(!JSON.stringify(fo.documents).includes('credit_limit') && !JSON.stringify(fo.documents).includes('balance') && fo.documents[1].doc.number === '');
});

test('re-run: the document the import created is updated in place; one edited in the app since is kept', () => {
  const at = '2026-10-20T00:00:00Z';
  const docs = [
    { id: 'd-lic', company: 'adchem', doc_type: 'cannabis_license', subject_id: 'uuid-ADC-0007', source: 'import', import_source: { tab: 'Licensing & Entity', row: 2, at }, updated_by: 'u1', updated_at: at },
    { id: 'd-psa', company: 'adchem', doc_type: 'psa', subject_id: 'uuid-ADC-0001', source: 'import', import_source: { tab: 'Account Terms', row: 2, at }, updated_by: 'u9', updated_at: '2026-10-21T00:00:00Z' }];
  const existing = { ...NONE, documents: docs };
  const plan = planImport(WB, existing, 'u1');
  assert.deepEqual([lic(plan).kept, psa(plan).kept], [undefined, true]);
  assert.match(psa(plan).detail, /kept: edited in the app/);
  const out = applyPlan(plan, existing, 'u1');
  assert.deepEqual(out.documents.map(d => [d.id, d.doc.doc_type]), [['d-lic', 'cannabis_license']]);
  assert.deepEqual(out.documentsKept, [{ id: 'd-psa', tab: 'Account Terms', row: 2, name: 'Type 7 Manufacturing' }]);
  const b = bindRows(out, new Map([['ADC-0007', 'uuid-ADC-0007']]), 'adchem', '2026-10-22T00:00:00Z');
  assert.deepEqual([b.documents[0].id, b.documents[0].import_source.at], ['d-lic', '2026-10-22T00:00:00Z']);
  // the importer's own app edit after the import counts too (updated_at after import_source.at)
  const mineEdited = { ...NONE, documents: [{ ...docs[0], updated_at: '2026-10-21T00:00:00Z' }] };
  assert.deepEqual(applyPlan(planImport(WB, mineEdited, 'u1'), mineEdited, 'u1').documentsKept.map(k => k.id), ['d-lic']);
});

test('/api/import commit: documents need manage_documents; a re-run upserts on id and keeps the app-edited one', async () => {
  const plan = planImport(WB, NONE);
  const coord = { ...COORD, permissions: { run_imports: true, manage_customers: true, view_documents: true } };
  const no = await route({ company: 'adchem', action: 'commit', plan }, coord);
  assert.equal(no.status, 403); assert.match(no.json.error.message, /manage documents/); assert.equal(no.writes.length, 0, 'refused before anything is written');
  const skipped = clone(plan); skipped.items.forEach(i => { if (i.action === 'license' || i.action === 'psa') i.decision = 'skip'; });
  const ok = await route({ company: 'adchem', action: 'commit', plan: skipped }, coord);
  assert.equal(ok.status, 200, 'with the documents skipped, no documents permission is needed');
  assert.ok(!ok.writes.some(w => w.t === 'dispatch_documents'));
  const at = '2026-10-20T00:00:00Z';
  const seed = { dispatch_documents: [
    { id: 'd-lic', doc_type: 'cannabis_license', import_source: { tab: 'Licensing & Entity', row: 2, at }, updated_by: 'u1', updated_at: at },
    { id: 'd-psa', doc_type: 'psa', import_source: { tab: 'Account Terms', row: 2, at }, updated_by: 'u9', updated_at: at }] };
  const again = await route({ company: 'adchem', action: 'commit', plan }, { ...COORD, is_super_admin: true, permissions: {} }, seed);
  assert.equal(again.status, 200, JSON.stringify(again.json));
  const dw = again.writes.filter(w => w.t === 'dispatch_documents');
  assert.deepEqual(dw.map(w => [w.q, w.body.map(d => d.id)]), [['?on_conflict=id', ['d-lic']]]);
  assert.deepEqual([again.json.counts.licenses, again.json.counts.psas, again.json.counts.documentsKept], [1, 0, 1]);
});
