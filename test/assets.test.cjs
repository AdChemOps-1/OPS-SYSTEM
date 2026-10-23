// Headless UI test for the asset register (Stage 3A): the Assets tab and its permission switches, Setup -> Vendors and Container types,
// the register with detail and history, counts, the hub actions, and the driver's Cylinders sheet, offline queue, Load and My truck. Uses the shared fake (test/_fake.cjs).
const assert = require('assert/strict');
const { chromium } = require('playwright');
const { makeFake, newPage } = require('./_fake.cjs');
const flat = s => (s || '').replace(/\s+/g, ' ').trim();

// the browser logs a console error for each deliberately failed request; remove just that one entry
function dropExpected(page, status){ const i = page.errs.findIndex(e => e.includes('Failed to load resource') && e.includes(status)); assert.ok(i >= 0, 'expected a ' + status + ' console entry'); page.errs.splice(i, 1); }
async function signIn(page, base){
  await page.goto(base+'/'); await page.waitForTimeout(400);
  await page.fill('#lEmail','jamie@adchem.pro'); await page.fill('#lPass','correct-horse'); await page.click('#btnLogin'); await page.waitForTimeout(1000);
  assert.equal(await page.$eval('#app',e=>e.hidden), false, 'app shown');
}

(async()=>{
  const fake = makeFake(); const T = fake.T; const base = await fake.start();
  T.dispatch_members[0].is_super_admin = true;
  const b = await chromium.launch();
  try {
  const page = await newPage(b, base, {viewport:{width:390,height:844}});
  const errs = [];
  await signIn(page, base);
  assert.equal(await page.$eval('#tab-assets', e => e.hidden), false, 'assets tab visible to a super admin');
  await page.click('#tab-assets'); await page.waitForTimeout(200);
  assert.equal(await page.$eval('#panel-assets', e => e.hidden), false);
  for (const id of ['aRegister', 'aCounts', 'aActions']) assert.ok(flat(await page.textContent('#' + id)).length > 0, id + ' placeholder');

  // Setup -> Vendors and container types
  await page.click('#tab-setup'); await page.waitForTimeout(600);
  assert.equal(await page.$eval('#vendorsCard', e => e.hidden), false);
  assert.match(flat(await page.textContent('#vendorList')), /Airgas.*fill.*rent/);
  await page.click('#btnAddVendor'); await page.waitForTimeout(100);
  await page.fill('#vf_name', 'Linde'); await page.check('#vf_roles input[value=fill]'); await page.fill('#vf_contact', 'Dana'); await page.fill('#vf_phone', '555-0100');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 390, 'no horizontal overflow with the vendor form open');
  await page.click('#btnSaveVendor'); await page.waitForTimeout(600);
  assert.match(flat(await page.textContent('#vendorList')), /Linde.*fill/);
  const linde = T.dispatch_vendors.find(v => v.name === 'Linde');
  assert.ok(linde, 'Linde stored'); assert.deepEqual(linde.roles, ['fill']); assert.equal(linde.contact_name, 'Dana'); assert.equal(linde.company, 'adchem');
  // a duplicate name, any case
  await page.click('#btnAddVendor'); await page.fill('#vf_name', 'airgas'); await page.click('#btnSaveVendor'); await page.waitForTimeout(400);
  assert.match(flat(await page.textContent('#banners')), /A vendor with that name exists/);
  assert.equal(T.dispatch_vendors.length, 2, 'no duplicate stored');
  await page.click('#btnCancelVendor');
  // edit in place and deactivate
  await page.click('[data-edit-vendor="vend-airgas"]'); await page.check('#vf_roles input[value=supply]'); await page.click('#btnSaveVendor'); await page.waitForTimeout(500);
  assert.deepEqual(T.dispatch_vendors.find(v => v.id === 'vend-airgas').roles.sort(), ['fill', 'rent', 'supply']);
  await page.click('[data-toggle-vendor="' + linde.id + '"]'); await page.waitForTimeout(500);
  assert.equal(T.dispatch_vendors.find(v => v.id === linde.id).active, false, 'Linde deactivated');
  // container types
  assert.equal(await page.$$eval('#typeList [data-type]', e => e.length), 3, 'three seeded types (this company only)');
  await page.click('#typesDisc summary'); await page.waitForTimeout(100);
  assert.match(flat(await page.textContent('#typeList')), /50lb Cylinder.*20lb Cylinder.*260L Dewar|20lb Cylinder.*50lb Cylinder.*260L Dewar/);
  await page.click('#btnAddType'); await page.selectOption('#tf_kind', 'cylinder'); await page.selectOption('#tf_product', 'Propane'); await page.fill('#tf_size', '100lb Cylinder'); await page.fill('#tf_fill', '100');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 390, 'no horizontal overflow with the type form open');
  await page.click('#btnSaveType'); await page.waitForTimeout(600);
  const pt = T.dispatch_container_types.find(t => t.size_label === '100lb Cylinder');
  assert.ok(pt && pt.product === 'Propane' && pt.fill_lb === 100 && pt.company === 'adchem', 'type stored');
  assert.equal(await page.$$eval('#typeList [data-type]', e => e.length), 4);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 390, 'no horizontal overflow on Setup');
  await page.click('#tab-assets'); await page.waitForTimeout(200);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 390, 'no horizontal overflow on Assets');
  // the data layer
  assert.equal(await page.evaluate(() => normSerial(' ab-12 34 ')), 'AB1234');
  assert.deepEqual(await page.evaluate(async () => (await ADB.assets()).map(a => a.serial)), ['AB1234', 'CD5678', 'EF9012']);
  assert.equal(await page.evaluate(async () => (await ADB.assets({owner_kind: 'vendor'})).length), 1);
  assert.equal(await page.evaluate(async () => (await ADB.asset('as-ab1234')).serial), 'AB1234');
  assert.deepEqual(await page.evaluate(async () => (await ADB.events('as-ab1234'))), []);

  // ---- Task 6: the register, detail and history, counts, hub actions ----
  const evRow = (id, assetId, type, extra) => Object.assign({id, company:'adchem', asset_id:assetId, event_type:type, from_kind:null, from_id:null, to_kind:null, to_id:null,
    fill_after:null, occurred_at:'2026-10-01T00:00:00Z', recorded_by:'u1', order_id:null, bol_number:null, site_key:null, photo_path:null, gps:null, ocr:null, note:'', created_at:'2026-10-01T00:00:00Z'}, extra || {});
  T.dispatch_asset_events.push(evRow('ev-ab-created', 'as-ab1234', 'created', {to_kind:'hub', to_id:'EB'}));
  T.dispatch_asset_events.push(evRow('ev-ab-sighted', 'as-ab1234', 'sighted', {occurred_at:'2026-10-02T00:00:00Z', created_at:'2026-10-02T00:00:00Z', from_kind:'hub', from_id:'EB', to_kind:'hub', to_id:'EB',
    photo_path:'adchem/asset/ev-ab-sighted.jpg', note:'tag photo'}));
  (T.__objects = T.__objects || []).push('adchem/asset/ev-ab-sighted.jpg');
  await page.click('#tab-setup'); await page.waitForTimeout(300); await page.click('#tab-assets'); await page.waitForTimeout(700);
  const regRows = async () => page.$$eval('#aRegister .a-row', els => els.map(e => e.getAttribute('data-id')));
  assert.deepEqual(await regRows(), ['as-ab1234', 'as-cd5678', 'as-ef9012'], 'register lists the three seeded assets');
  const abRow = flat(await page.textContent('.a-row[data-id="as-ab1234"]'));
  assert.match(abRow, /AB1234/); assert.match(abRow, /50lb Cylinder/); assert.match(abRow, /full/); assert.match(abRow, /EB/);
  assert.equal(await page.$eval('.a-row[data-id="as-ab1234"] .chip.k-D', e => e.textContent), 'full');
  assert.equal(await page.$eval('.a-row[data-id="as-cd5678"] .chip.warn', e => e.textContent), 'empty');
  assert.match(flat(await page.textContent('.a-row[data-id="as-cd5678"]')), /Airgas.*ADC-0001/);
  assert.match(flat(await page.textContent('.a-row[data-id="as-ef9012"]')), /Airgas/);
  await page.fill('#aq', 'cd'); await page.waitForTimeout(350);
  assert.deepEqual(await regRows(), ['as-cd5678'], 'search cd');
  await page.fill('#aq', 'cd-56 7'); await page.waitForTimeout(350);
  assert.deepEqual(await regRows(), ['as-cd5678'], 'search is normalised like serials');
  await page.fill('#aq', ''); await page.waitForTimeout(350);
  await page.selectOption('#aPlace', 'vendor'); await page.waitForTimeout(150);
  assert.deepEqual(await regRows(), ['as-ef9012'], 'place = vendor');
  await page.selectOption('#aPlace', ''); await page.selectOption('#aHub', 'EB'); await page.waitForTimeout(150);
  assert.deepEqual(await regRows(), ['as-ab1234'], 'hub = EB');
  await page.selectOption('#aHub', ''); await page.selectOption('#aFill', 'empty'); await page.waitForTimeout(150);
  assert.deepEqual(await regRows(), ['as-cd5678'], 'fill = empty');
  await page.selectOption('#aFill', ''); await page.selectOption('#aType', 'ct-co2-20'); await page.waitForTimeout(150);
  assert.deepEqual(await regRows(), ['as-ef9012'], 'type = 20lb');
  await page.selectOption('#aType', ''); await page.selectOption('#aOwner', 'vendor'); await page.waitForTimeout(150);
  assert.deepEqual(await regRows(), ['as-cd5678'], 'owner = vendor');
  await page.selectOption('#aOwner', ''); await page.waitForTimeout(150);
  assert.equal((await regRows()).length, 3);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 390, 'no horizontal overflow on the register');

  // detail and history
  await page.click('.a-row[data-id="as-ab1234"]'); await page.waitForTimeout(600);
  assert.equal(await page.$eval('#aDetail', e => e.hidden), false, 'detail open');
  assert.match(flat(await page.textContent('#aDetail')), /AB1234.*50lb Cylinder/);
  const evs = await page.$$eval('#aDetail .a-ev', els => els.map(e => e.textContent.replace(/\s+/g, ' ')));
  assert.equal(evs.length, 2, 'two history rows');
  assert.match(evs[0], /sighted/); assert.match(evs[1], /created/); assert.match(evs[1], /→ EB/);
  assert.ok(await page.$('#aOwnerPick'), 'Change owner control');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 390, 'no horizontal overflow on the detail');
  // the photo opens in a tab pre-opened inside the click
  const [pop] = await Promise.all([page.waitForEvent('popup'), page.click('#aDetail [data-photo]')]);
  await pop.waitForURL(/sign\/dispatch-docs\/adchem\/asset\/ev-ab-sighted\.jpg/, {timeout:3000}); await pop.close();
  // change owner to Airgas
  await page.selectOption('#aOwnerPick', 'vendor:vend-airgas'); await page.click('#aOwnerSave'); await page.waitForTimeout(700);
  const ab = T.dispatch_assets.find(a => a.id === 'as-ab1234');
  assert.equal(ab.owner_kind, 'vendor'); assert.equal(ab.owner_id, 'vend-airgas');
  assert.ok(T.dispatch_asset_events.some(e => e.asset_id === 'as-ab1234' && e.event_type === 'corrected'), 'corrected event written');
  assert.match(flat(await page.textContent('#aDetail')), /corrected/);
  // edit form: notes
  await page.fill('#ae_notes', 'dented collar'); await page.click('#aEditSave'); await page.waitForTimeout(600);
  assert.equal(ab.notes, 'dented collar');
  await page.click('#aBack'); await page.waitForTimeout(300);
  assert.equal(await page.$eval('#aDetail', e => e.hidden), true);
  assert.match(flat(await page.textContent('.a-row[data-id="as-ab1234"]')), /Airgas/, 'row shows the new owner');

  // counts
  const cell = (ct, fill, col) => page.$eval('#aCounts table[data-ct="' + ct + '"] td[data-fill="' + fill + '"][data-col="' + col + '"]', e => e.textContent.trim());
  assert.match(flat(await page.textContent('#aCounts')), /50lb Cylinder.*At customers.*At vendors.*Lost/);
  assert.equal(await cell('ct-co2-50', 'full', 'hub:EB'), '1');
  assert.equal(await cell('ct-co2-50', 'empty', 'site'), '1');
  assert.equal(await cell('ct-co2-20', 'full', 'vendor'), '1');
  assert.equal(await cell('ct-co2-50', 'unknown', 'lost'), '0');

  // hub actions: Fill AB1234 and a new serial NEW1 (type 50lb) at EB
  assert.equal(await page.$$eval('#aActions button[data-act]', e => e.length), 5);
  await page.click('#aActions [data-act="fill"]'); await page.waitForTimeout(200);
  assert.equal(await page.$eval('#actSheet', e => e.hidden), false, 'action sheet open');
  await page.selectOption('#act_hub', 'EB'); await page.selectOption('#act_type', 'ct-co2-50');
  await page.fill('#act_serial', 'ab 1234'); await page.press('#act_serial', 'Enter');
  await page.fill('#act_serial', 'new1'); await page.press('#act_serial', 'Enter');
  await page.fill('#act_serial', 'AB-1234'); await page.press('#act_serial', 'Enter');
  assert.deepEqual(await page.$$eval('#act_list [data-serial]', e => e.map(x => x.getAttribute('data-serial'))), ['AB1234', 'NEW1'], 'normalised, no duplicates');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 390, 'no horizontal overflow with the action sheet open');
  await page.click('#act_confirm'); await page.waitForTimeout(900);
  const res = flat(await page.textContent('#actResults'));
  assert.equal((res.match(/applied/g) || []).length, 2, 'applied twice: ' + res);
  const fills = T.dispatch_stock_movements.filter(m => m.hub === 'EB' && m.qty === -50 && m.reason === 'filled');
  assert.equal(fills.length, 2, 'two -50 lb draw-downs at EB');
  const new1 = T.dispatch_assets.find(a => a.serial === 'NEW1');
  assert.ok(new1 && new1.container_type_id === 'ct-co2-50' && new1.location_kind === 'hub' && new1.location_id === 'EB', 'NEW1 created at EB');
  const sent = T.dispatch_asset_events.filter(e => e.event_type === 'filled');
  assert.equal(sent.length, 2); sent.forEach(e => assert.match(e.id, /^[0-9a-f-]{36}$/));
  // a fill on a type with no fill weight: the warning banner
  const ef = T.dispatch_assets.find(a => a.id === 'as-ef9012'); ef.container_type_id = 'ct-n2-260'; ef.location_kind = 'hub'; ef.location_id = 'EB';
  await page.fill('#act_serial', 'EF9012'); await page.press('#act_serial', 'Enter');
  await page.click('#act_confirm'); await page.waitForTimeout(800);
  assert.match(flat(await page.textContent('#actResults')), /EF9012.*applied.*no fill weight/);
  assert.match(flat(await page.textContent('#banners')), /Fill recorded — no fill weight on EF9012/);
  // a rejected event stays in the list with its reason: a new serial with no type
  await page.selectOption('#act_type', '');
  await page.fill('#act_serial', 'NEW2'); await page.press('#act_serial', 'Enter');
  await page.click('#act_confirm'); await page.waitForTimeout(400);
  assert.match(flat(await page.textContent('#banners')), /Choose a type/);
  assert.equal(T.dispatch_assets.some(a => a.serial === 'NEW2'), false);
  await page.click('[data-unlist="NEW2"]');
  assert.equal(await page.$$eval('#act_list [data-serial]', e => e.length), 0);
  await page.click('#actClose'); await page.waitForTimeout(200);
  assert.equal(await page.$eval('#actSheet', e => e.hidden), true);

  // To vendor with a scanned serial: upload, read, pick
  await page.click('#aActions [data-act="to_vendor"]'); await page.waitForTimeout(200);
  assert.equal(await page.$eval('#act_vendor', e => e.closest('[hidden]') === null), true, 'vendor select shown');
  await page.selectOption('#act_hub', 'EB'); await page.selectOption('#act_vendor', 'vend-airgas');
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  await page.setInputFiles('#act_photo', {name:'tag.png', mimeType:'image/png', buffer:png}); await page.waitForTimeout(900);
  assert.equal(await page.$eval('#actPick', e => e.hidden), false, 'candidate picker shown');
  assert.match(flat(await page.textContent('#actPick')), /AB1234.*DOT3AA2015/);
  const up = fake.calls.filter(c => c[0] === 'upload' && /^adchem\/asset\/[0-9a-f-]{36}\.jpg$/.test(c[1]));
  assert.equal(up.length, 1, 'photo uploaded under asset/<event id>.jpg');
  await page.click('#actPick [data-pick="AB1234"]'); await page.waitForTimeout(100);
  assert.deepEqual(await page.$$eval('#act_list [data-serial]', e => e.map(x => x.getAttribute('data-serial'))), ['AB1234']);
  await page.click('#act_confirm'); await page.waitForTimeout(800);
  assert.match(flat(await page.textContent('#actResults')), /AB1234.*applied/);
  const tv = T.dispatch_asset_events.find(e => e.event_type === 'to_vendor');
  assert.ok(tv && tv.from_kind === 'hub' && tv.from_id === 'EB' && tv.to_kind === 'vendor' && tv.to_id === 'vend-airgas', 'to_vendor event');
  assert.equal(tv.photo_path, up[0][1], 'the event carries the photo it was read from');
  assert.equal(tv.id, up[0][1].split('/')[2].replace('.jpg', ''), 'same event id as the photo');
  assert.equal(ab.location_kind, 'vendor');
  await page.click('#actClose');
  // From vendor, came back empty; then Move to LA
  await page.click('#aActions [data-act="from_vendor"]'); await page.waitForTimeout(200);
  await page.selectOption('#act_hub', 'EB'); await page.selectOption('#act_vendor', 'vend-airgas'); await page.check('#act_empty');
  await page.fill('#act_serial', 'AB1234'); await page.press('#act_serial', 'Enter'); await page.click('#act_confirm'); await page.waitForTimeout(800);
  assert.equal(ab.location_kind, 'hub'); assert.equal(ab.location_id, 'EB'); assert.equal(ab.fill_state, 'empty');
  await page.click('#actClose');
  await page.click('#aActions [data-act="move"]'); await page.waitForTimeout(200);
  await page.selectOption('#act_hub', 'EB'); await page.selectOption('#act_to_hub', 'LA');
  await page.fill('#act_serial', 'AB1234'); await page.press('#act_serial', 'Enter'); await page.click('#act_confirm'); await page.waitForTimeout(800);
  assert.equal(ab.location_id, 'LA');
  await page.click('#actClose');
  // Add assets: two new serials, owned by Airgas, at EB
  await page.click('#aActions [data-act="add"]'); await page.waitForTimeout(200);
  await page.selectOption('#act_hub', 'EB'); await page.selectOption('#act_type', 'ct-co2-20'); await page.selectOption('#act_owner', 'vendor:vend-airgas');
  await page.selectOption('#act_fill', 'full');
  for (const s of ['ADD1', 'ADD2']) { await page.fill('#act_serial', s); await page.press('#act_serial', 'Enter'); }
  // the network drops the first send: both stay listed as "not sent — try again", and the retry reuses the same event ids
  let firstIds = null;
  await page.route('**/api/assets', async route => { const b = JSON.parse(route.request().postData() || '{}');
    if (b.action === 'events' && !firstIds) { firstIds = b.events.map(e => e.id); return route.abort(); } return route.continue(); });
  await page.click('#act_confirm'); await page.waitForTimeout(600);
  assert.equal((flat(await page.textContent('#actResults')).match(/not sent — try again/g) || []).length, 2);
  assert.equal(await page.$$eval('#act_list [data-serial]', e => e.length), 2, 'unsent serials stay in the list');
  assert.equal(T.dispatch_assets.some(a => a.serial === 'ADD1'), false);
  await page.click('#act_confirm'); await page.waitForTimeout(900);
  await page.unroute('**/api/assets');
  assert.deepEqual(T.dispatch_asset_events.filter(e => e.event_type === 'created' && firstIds.includes(e.id)).length, 2, 'retry sent the same ids');
  assert.equal((flat(await page.textContent('#actResults')).match(/applied/g) || []).length, 2);
  const add1 = T.dispatch_assets.find(a => a.serial === 'ADD1');
  assert.ok(add1 && add1.owner_kind === 'vendor' && add1.owner_id === 'vend-airgas' && add1.location_id === 'EB' && add1.container_type_id === 'ct-co2-20', 'ADD1 created');
  assert.equal(add1.fill_state, 'full', 'ADD1 has the fill picked on the sheet');
  assert.equal(T.dispatch_assets.find(a => a.serial === 'ADD2').fill_state, 'full');
  // a whole-batch 400 (bad_event) is a refusal: shown as rejected, not as retryable
  await page.fill('#act_serial', 'ADD3'); await page.press('#act_serial', 'Enter');
  await page.route('**/api/assets', r => JSON.parse(r.request().postData() || '{}').action === 'events'
    ? r.fulfill({status:400, contentType:'application/json', body:JSON.stringify({error:{code:'bad_event', message:'event 0: occurredAt must be an ISO time'}})}) : r.continue());
  await page.click('#act_confirm'); await page.waitForTimeout(600);
  await page.unroute('**/api/assets');
  dropExpected(page, '400 (Bad Request)');
  const rej = flat(await page.textContent('#actResults'));
  assert.match(rej, /ADD3 — rejected: event 0: occurredAt must be an ISO time/); assert.doesNotMatch(rej, /try again/);
  await page.click('[data-unlist="ADD3"]');
  // 25 at once go as three calls (10, 10, 5) in order, and each result lines up with its serial: ADD1, 13th, is already registered
  const many = Array.from({length:25}, (_, i) => i === 12 ? 'ADD1' : 'BULK' + String(i + 1).padStart(2, '0'));
  for (const s of many) { await page.fill('#act_serial', s); await page.press('#act_serial', 'Enter'); }
  const nSends = fake.calls.filter(c => c[0] === 'assets-events').length;
  await page.click('#act_confirm'); await page.waitForTimeout(1500);
  const chunks = fake.calls.filter(c => c[0] === 'assets-events').slice(nSends).map(c => c[1]);
  assert.deepEqual(chunks.map(c => c.length), [6, 6, 6, 6, 1], 'sent in chunks of 6');
  assert.deepEqual(chunks.flat(), many, 'in order');
  const lines = await page.$$eval('#actResults > div', e => e.map(x => x.textContent.replace(/\s+/g, ' ').trim()));
  assert.equal(lines.length, 25);
  lines.forEach((l, i) => i === 12 ? assert.match(l, /^ADD1 — rejected: serial ADD1 is already in the register/) : assert.match(l, new RegExp('^' + many[i] + ' — applied')));
  assert.equal(T.dispatch_assets.filter(a => /^BULK/.test(a.serial) && a.fill_state === 'full').length, 24);
  await page.click('[data-unlist="ADD1"]');
  // drop the 24 again so the rest of the run sees the register it expects
  const bulk = new Set(T.dispatch_assets.filter(x => /^BULK/.test(x.serial)).map(x => x.id));
  for (const t of ['dispatch_assets', 'dispatch_asset_events']) { const keep = T[t].filter(x => !bulk.has(t === 'dispatch_assets' ? x.id : x.asset_id)); T[t].length = 0; T[t].push(...keep); }
  await page.click('#actClose'); await page.waitForTimeout(500);
  assert.equal((await regRows()).length, 6, 'register refreshed after the actions');
  // the detail's read fails: back on the register, not stuck on Loading, and the next visit does not reopen it
  await page.route('**/rest/v1/dispatch_assets?*id=eq.as-ef9012*', r => r.fulfill({status:500, contentType:'application/json', body:JSON.stringify({message:'boom'})}));
  await page.click('.a-row[data-id="as-ef9012"]'); await page.waitForTimeout(600);
  await page.unroute('**/rest/v1/dispatch_assets?*id=eq.as-ef9012*');
  dropExpected(page, '500 (Internal Server Error)');
  assert.match(flat(await page.textContent('#banners')), /Couldn't load the container/);
  assert.equal(await page.$eval('#aDetail', e => e.hidden), true, 'detail closed');
  assert.equal(await page.$eval('#aList', e => e.hidden), false, 'register list visible again');
  assert.equal(await page.$eval('#aTools', e => e.hidden), false, 'filters visible again');
  await page.click('#tab-setup'); await page.waitForTimeout(300); await page.click('#tab-assets'); await page.waitForTimeout(600);
  assert.equal(await page.$eval('#aDetail', e => e.hidden), true, 'not reopened on the next visit');
  assert.deepEqual(page.errs, [], 'no page errors after the failed detail');
  // Mark lost
  await page.click('.a-row[data-id="as-cd5678"]'); await page.waitForTimeout(500);
  await page.click('#aLost'); await page.waitForTimeout(600);
  assert.equal(T.dispatch_assets.find(a => a.id === 'as-cd5678').condition, 'lost');
  await page.click('#aBack'); await page.waitForTimeout(500);
  assert.equal(await cell('ct-co2-50', 'empty', 'lost'), '1', 'lost counted under Lost');
  assert.equal(await cell('ct-co2-50', 'empty', 'site'), '0', 'and not at the customer');
  assert.deepEqual(page.errs, [], 'unexpected page errors');

  // permissions: a coordinator with no switches, then with View assets, then with Manage assets
  for (const [perms, sees, manages] of [[{}, false, false], [{view_assets: true}, true, false], [{view_assets: true, manage_assets: true}, true, true]]) {
    const tag = JSON.stringify(perms);
    const p = await newPage(b, base, {viewport:{width:390,height:844}, members:[{user_id:'u1',company:'adchem',role:'coordinator',hub:'',active:true,is_super_admin:false,permissions:perms}]});
    await signIn(p, base);
    assert.equal(await p.$eval('#tab-assets', e => e.hidden), !sees, 'assets tab ' + tag);
    await p.click('#tab-setup'); await p.waitForTimeout(600);
    assert.equal(await p.$eval('#vendorsCard', e => e.hidden), !sees, 'vendors card ' + tag);
    if (sees) {
      await p.click('#tab-assets'); await p.waitForTimeout(700);
      assert.equal(await p.$$eval('#aRegister .a-row', e => e.length) > 0, true, 'register rows ' + tag);
      assert.equal(await p.$$eval('#aActions button', e => e.length) > 0, manages, 'action buttons ' + tag);
      assert.equal(await p.$('#aOwnerPick'), null);
      await p.click('#aRegister .a-row'); await p.waitForTimeout(500);
      assert.equal(!!(await p.$('#aOwnerPick')), manages, 'change owner ' + tag);
      assert.equal(!!(await p.$('#aEditSave')), manages, 'edit form ' + tag);
      await p.click('#tab-setup'); await p.waitForTimeout(600);
      assert.match(flat(await p.textContent('#vendorList')), /Airgas/);
      assert.equal(await p.$eval('#btnAddVendor', e => e.hidden), !manages, 'add vendor ' + tag);
      assert.equal(await p.$$eval('[data-edit-vendor]', e => e.length) > 0, manages, 'edit buttons ' + tag);
    }
    assert.deepEqual(p.errs, [], 'page errors ' + tag);
  }
  // a driver never sees the tab, even with the switch
  const d = await newPage(b, base, {members:[{user_id:'u1',company:'adchem',role:'driver',hub:'EB',active:true,is_super_admin:false,permissions:{view_assets:true}}]});
  await signIn(d, base);
  assert.equal(await d.$eval('#tab-assets', e => e.hidden), true, 'driver has no assets tab');

  // People: the two switches, and ticking View assets for a coordinator through the app shows them the tab
  T.dispatch_users.push({user_id:'u2',email:'casey@adchem.pro',name:'Casey',active:true});
  const adm = await newPage(b, base, {viewport:{width:1100,height:1500}, members:[{user_id:'u1',company:'adchem',role:'admin',hub:'',active:true,is_super_admin:true,permissions:{}},
    {user_id:'u2',company:'adchem',role:'coordinator',hub:'',active:true,is_super_admin:false,permissions:{}}]});
  await signIn(adm, base);
  await adm.click('#tab-users'); await adm.waitForTimeout(700);
  const row = flat(await adm.textContent('#userList'));
  assert.match(row, /View assets/); assert.match(row, /Manage assets/);
  await adm.check('[data-perm="u2:view_assets"]'); await adm.waitForTimeout(700);
  assert.equal(T.dispatch_members.find(m => m.user_id === 'u2').permissions.view_assets, true, 'switch stored');
  const cz = await newPage(b, base, {members:T.dispatch_members.map(m => m.user_id === 'u2' ? Object.assign({}, m, {user_id:'u1'}) : Object.assign({}, m, {user_id:'x'}))});
  await signIn(cz, base);
  assert.equal(await cz.$eval('#tab-assets', e => e.hidden), false, 'the coordinator now sees the tab');
  assert.deepEqual(adm.errs, [], 'page errors on People');

  // ---- Task 7: the driver's Cylinders sheet on Today, the offline queue, Load and My truck (a fresh fake, signed in as an EB driver) ----
  const fd = makeFake(); const TD = fd.T; const baseD = await fd.start();
  try {
    const CID = '11111111-1111-4111-8111-111111111111', SK = 'ADC-0001 — Primary', ORD = 'EB-261020-01';
    TD.dispatch_customers.push({id:CID,company:'adchem',customer_id:'ADC-0001',name:'Type 7 Manufacturing',account_status:'active',primary_hub:'EB'});
    TD.dispatch_sites.push({company:'adchem',site_key:SK,customer_id:CID,customer:'Type 7 Manufacturing',addr:'100 Main St, Oakland CA 94607',city:'Oakland',hub:'EB',site_label:'Primary',code_raw:'D - Deliver; no holds',code:'D',synced_at:'2026-10-20T08:00:00Z'});
    const od = {id:ORD,hub:'EB',date:'2026-10-20',status:'Scheduled',customer:'Type 7 Manufacturing',siteKey:SK,siteLabel:'Primary',code:'D',effCode:'D',window:'7:00a – 11:00a',truck:'T1',
      shipTo:'100 Main St, Oakland CA 94607',bolNo:9450,lines:[{category:'Gases',product:'Carbon Dioxide',container:'50lb Cylinder',qty:3,unitLb:50,unitDef:false,note:''}]};
    TD.dispatch_orders.push({company:'adchem',id:ORD,bol_no:9450,hub:'EB',date:'2026-10-20',status:'Scheduled',customer:'Type 7 Manufacturing',data:od,created_at:'2026-10-19T12:00:00Z',updated_at:'2026-10-19T12:00:00Z'});
    const dv = await newPage(b, baseD, {viewport:{width:390,height:844}, members:[{user_id:'u1',company:'adchem',role:'driver',hub:'EB',active:true,is_super_admin:false,permissions:{}}]});
    const posts = []; dv.on('request', r => { if (r.url().endsWith('/api/assets') && r.method() === 'POST') { const j = JSON.parse(r.postData() || '{}'); if (j.action === 'events') posts.push(j.events); } });
    await signIn(dv, baseD); await dv.waitForTimeout(600);
    assert.equal(await dv.evaluate(() => state.role), 'driver');
    assert.equal(await dv.$eval('#tab-assets', e => e.hidden), true, 'a driver cannot see the register');
    assert.equal(await dv.$eval('#truckCard', e => e.hidden), false, 'Load / My truck on Today for a driver');
    // the stop shows Cylinders; the sheet: three deliver slots and CD5678 (at the site) under Collecting
    assert.equal(await dv.$$eval('#todayList [data-cyl]', e => e.map(x => x.getAttribute('data-cyl'))).then(x => x.join()), ORD, 'Cylinders on the stop');
    await dv.click('#todayList [data-cyl="' + ORD + '"]'); await dv.waitForTimeout(400);
    assert.equal(await dv.$eval('#cylSheet', e => e.hidden), false, 'Cylinders sheet open');
    assert.equal(await dv.$$eval('#cylSlots [data-slot]', e => e.length), 3, 'one deliver slot per cylinder on the order');
    assert.match(flat(await dv.textContent('#cylSlots')), /50lb Cylinder.*50lb Cylinder/);
    assert.match(flat(await dv.textContent('#cylCollect')), /CD5678/, 'CD5678 under Collecting');
    assert.equal(await dv.evaluate(() => document.documentElement.scrollWidth), 390, 'no horizontal overflow with the Cylinders sheet open');
    // slot 1: scan -> upload -> read -> Yes
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
    await dv.click('#cylSlots [data-open="s:0"]'); await dv.waitForTimeout(100);
    assert.equal(await dv.$eval('#cylPick', e => e.hidden), false, 'slot picker open');
    await dv.setInputFiles('#cyl_photo', {name:'tag.png', mimeType:'image/png', buffer:png}); await dv.waitForTimeout(900);
    const upD = fd.calls.filter(c => c[0] === 'upload' && /^adchem\/asset\/[0-9a-f-]{36}\.jpg$/.test(c[1]));
    assert.equal(upD.length, 1, 'the tag photo uploaded under asset/<event id>.jpg');
    assert.match(flat(await dv.textContent('#cylCands')), /AB1234.*Yes.*DOT3AA2015/, 'top candidate, Yes, and an alternate');
    await dv.click('#cylYes'); await dv.waitForTimeout(500);
    const slot1 = flat(await dv.textContent('#cylSlots [data-slot="0"]'));
    assert.match(slot1, /AB1234/); assert.doesNotMatch(slot1, /was at/, 'AB1234 is at the hub, where a delivery starts');
    // slot 2: the same serial typed is refused, then an unknown serial opens the new form with the slot's type
    await dv.click('#cylSlots [data-open="s:1"]'); await dv.waitForTimeout(100);
    await dv.fill('#cyl_typed', 'ab 1234'); await dv.click('#cyl_use'); await dv.waitForTimeout(300);
    assert.match(flat(await dv.textContent('#cylPickMsg')), /already used/);
    assert.doesNotMatch(flat(await dv.textContent('#cylSlots [data-slot="1"]')), /AB1234/);
    await dv.fill('#cyl_typed', 'NEW9'); await dv.click('#cyl_use'); await dv.waitForTimeout(500);
    assert.equal(await dv.$eval('#cylNew', e => e.hidden), false, 'new container form');
    assert.equal(await dv.$eval('#cyln_type', e => e.value), 'ct-co2-50', 'type preselected from the slot');
    assert.equal(await dv.$eval('#cyln_fill', e => e.value), 'full');
    assert.equal(await dv.evaluate(() => document.documentElement.scrollWidth), 390, 'no horizontal overflow with the new form open');
    await dv.click('#cyln_ok'); await dv.waitForTimeout(200);
    assert.match(flat(await dv.textContent('#cylSlots [data-slot="1"]')), /NEW9.*new/);
    // collect CD5678, then Done
    await dv.click('#cylCollect [data-collect="as-cd5678"]'); await dv.waitForTimeout(100);
    await dv.click('#cylDone'); await dv.waitForFunction(() => state.cyl && !state.cyl.sending, null, {timeout:8000}); await dv.waitForTimeout(150);
    const at = s => { const a = TD.dispatch_assets.find(x => x.serial === s); return a && [a.location_kind, a.location_id, a.fill_state]; };
    assert.deepEqual(at('NEW9'), ['site', SK, 'full'], 'NEW9 delivered to the site');
    assert.deepEqual(at('AB1234'), ['site', SK, 'full'], 'AB1234 delivered to the site');
    assert.deepEqual(at('CD5678'), ['hub', 'EB', 'empty'], 'CD5678 collected to EB');
    const new9 = TD.dispatch_assets.find(a => a.serial === 'NEW9');
    assert.deepEqual(TD.dispatch_asset_events.filter(e => e.asset_id === new9.id).map(e => e.event_type).sort(), ['created', 'delivered'], 'created + delivered for NEW9');
    assert.equal(new9.container_type_id, 'ct-co2-50'); assert.equal(new9.owner_kind, 'adchem');
    const dAB = TD.dispatch_asset_events.find(e => e.event_type === 'delivered' && e.asset_id === 'as-ab1234');
    assert.deepEqual([dAB.from_kind, dAB.from_id, dAB.to_kind, dAB.to_id, dAB.order_id, dAB.bol_number, dAB.site_key, dAB.fill_after], ['hub', 'EB', 'site', SK, ORD, 9450, SK, 'full']);
    assert.equal(dAB.photo_path, upD[0][1], 'the delivery carries its tag photo'); assert.equal(dAB.id, upD[0][1].split('/')[2].replace('.jpg', ''), 'same id as the photo');
    assert.equal(dAB.ocr && dAB.ocr.picked, 'AB1234');
    assert.equal(TD.dispatch_asset_events.some(e => e.event_type === 'sighted'), false, 'no correction: everything was where the register had it');
    assert.equal(posts.length, 1); assert.equal(posts[0].length, 3, 'one batch of three events');
    assert.equal((flat(await dv.textContent('#cylSheet')).match(/recorded/g) || []).length, 3, 'three slots ticked');
    // the same batch again: duplicates, still one event per id
    const nEv = TD.dispatch_asset_events.length;
    const again = await dv.evaluate(ev => ADB.sendEvents(ev).then(r => r.results.map(x => x.status)), posts[0]);
    assert.deepEqual(again, ['duplicate', 'duplicate', 'duplicate']);
    assert.equal(TD.dispatch_asset_events.length, nEv, 'no second write');
    posts[0].forEach(e => assert.equal(TD.dispatch_asset_events.filter(x => x.id === e.id).length, 1));
    await dv.click('#cylClose'); await dv.waitForTimeout(900);
    assert.equal(await dv.$eval('#cylSheet', e => e.hidden), true);

    // reopened: what this stop already has is marked — the two delivered slots as sent (not scannable again), the third open, and
    // nothing delivered here offered under Collecting
    const reopen = async () => { await dv.click('#todayList [data-cyl="' + ORD + '"]'); await dv.waitForFunction(() => state.cyl && state.cyl.prior, null, {timeout:3000});
      await dv.evaluate(() => state.cyl.prior); await dv.waitForTimeout(100); };
    const slotTxt = i => dv.textContent('#cylSlots [data-slot="' + i + '"]').then(flat);
    await reopen();
    assert.match(await slotTxt(0), /AB1234.*sent earlier/); assert.match(await slotTxt(1), /NEW9.*sent earlier/);
    assert.equal(await dv.$('#cylSlots [data-open="s:0"]'), null, 'a sent slot is not re-scannable'); assert.equal(await dv.$('#cylSlots [data-clear="s:0"]'), null);
    assert.ok(await dv.$('#cylSlots [data-open="s:2"]'), 'the third slot is open');
    assert.doesNotMatch(flat(await dv.textContent('#cylCollect')), /AB1234|NEW9/, 'what was delivered here is not offered for pick-up');
    assert.match(flat(await dv.textContent('#cylWaiting')), /3 sent earlier today/, 'two delivered and one collected');

    // offline: slot 3 with a serial that can't be checked (the slot's type goes with it); Done keeps the batch in store a
    await dv.context().setOffline(true);
    await dv.click('#cylSlots [data-open="s:2"]'); await dv.fill('#cyl_typed', 'NEW10'); await dv.click('#cyl_use'); await dv.waitForTimeout(200);
    assert.match(await slotTxt(2), /NEW10.*not checked/);
    await dv.click('#cylDone'); await dv.waitForFunction(() => state.cyl && !state.cyl.sending, null, {timeout:8000}); await dv.waitForTimeout(150);
    assert.match(flat(await dv.textContent('#cylStatus')), /Not sent yet — no signal\. The photos are kept on this phone; press Send waiting photos on the Today list when you have signal\./);
    const qa = await dv.evaluate(() => cylQueueAll().then(q => q.map(x => [x.company, x.events.length, x.events[0].type, x.events[0].serial, x.events[0].containerTypeId])));
    assert.deepEqual(qa, [['adchem', 1, 'delivered', 'NEW10', 'ct-co2-50']], 'one batch in store a');
    assert.equal(TD.dispatch_assets.some(a => a.serial === 'NEW10'), false, 'nothing reached the server');
    await dv.click('#cylClose'); await dv.waitForTimeout(500);
    // reopened with no signal: the delivered slot shows waiting, the count line says 1, the serial can't be used again
    await reopen();
    assert.match(await slotTxt(2), /NEW10.*waiting to send/, 'the queued delivery is marked');
    assert.match(await slotTxt(0), /AB1234.*sent earlier/, 'sent this session, known with no signal');
    assert.match(flat(await dv.textContent('#cylWaiting')), /^1 waiting to send for this stop/);
    assert.equal(await dv.$('#cylSlots [data-open="s:2"]'), null);
    await dv.click('#cylAddCollect'); await dv.fill('#cyl_typed', 'new-10'); await dv.click('#cyl_use'); await dv.waitForTimeout(150);
    assert.match(flat(await dv.textContent('#cylPickMsg')), /NEW10 is already waiting to send for this stop/);
    await dv.click('#cyl_cancel'); await dv.click('#cylClose'); await dv.waitForTimeout(400);
    // offline Load of a serial that can't be checked: its type is asked for first, and travels on the event
    await dv.click('#btnLoad'); await dv.click('#cylAddSlot'); await dv.fill('#cyl_typed', 'LD7'); await dv.click('#cyl_use'); await dv.waitForTimeout(200);
    assert.equal(await dv.$eval('#cylNew', e => e.hidden), false, 'type asked for');
    assert.match(flat(await dv.textContent('#cylNewHead')), /LD7: no signal to check it/);
    await dv.selectOption('#cyln_type', 'ct-co2-20'); await dv.click('#cyln_ok');
    assert.match(await slotTxt(0), /LD7.*not checked/);
    await dv.click('#cylDone'); await dv.waitForFunction(() => state.cyl && !state.cyl.sending, null, {timeout:8000}); await dv.waitForTimeout(150);
    await dv.click('#cylClose'); await dv.waitForTimeout(400);
    assert.match(flat(await dv.textContent('#podQueueNote')), /2 photos waiting to send.*Cylinders.*Cylinders/, 'the queue note counts the batches');
    await dv.context().setOffline(false);
    await dv.click('#podFlush'); await dv.waitForTimeout(1500);
    assert.deepEqual(at('NEW10'), ['site', SK, 'full'], 'flushed: NEW10 delivered');
    assert.equal(TD.dispatch_assets.find(a => a.serial === 'NEW10').container_type_id, 'ct-co2-50');
    const ld7 = TD.dispatch_assets.find(a => a.serial === 'LD7');
    assert.ok(ld7 && ld7.container_type_id === 'ct-co2-20' && ld7.location_id === 'EB', 'LD7 added with the chosen type');
    assert.deepEqual(await dv.evaluate(() => cylQueueAll().then(q => q.length)), 0, 'store a empty');
    assert.equal(await dv.$eval('#podQueueNote', e => e.hidden), true);

    // write-ahead: the batch is in store a before it is sent; a send that never answers leaves it there, and a flush applies the same ids
    const loadOne = async serial => { await dv.click('#btnLoad'); await dv.click('#cylAddSlot'); await dv.fill('#cyl_typed', serial); await dv.click('#cyl_use'); await dv.waitForTimeout(300); };
    const doneWait = async () => { await dv.click('#cylDone'); await dv.waitForFunction(() => state.cyl && !state.cyl.sending, null, {timeout:8000}); await dv.waitForTimeout(150); };
    let ahead = null;
    await dv.route('**/api/assets', async r => { const j = JSON.parse(r.request().postData() || '{}');
      if (j.action === 'events' && ahead === null) { ahead = {sent:j.events.map(e => e.id), stored:await dv.evaluate(() => cylQueueAll().then(q => q.map(x => x.events.map(e => e.id))))}; return r.abort(); }
      return r.continue(); });
    await loadOne('CD5678'); await doneWait();
    await dv.unroute('**/api/assets');
    assert.ok(ahead, 'the send was attempted'); assert.deepEqual(ahead.stored, [ahead.sent], 'in store a before the send');
    assert.match(flat(await dv.textContent('#cylStatus')), /Not sent yet — no answer from the server/);
    assert.deepEqual(await dv.evaluate(() => cylQueueAll().then(q => q.map(x => x.events.map(e => e.id)))), [ahead.sent], 'still kept after the failed send');
    assert.equal(TD.dispatch_asset_events.some(e => e.id === ahead.sent[0]), false);
    await dv.click('#cylClose'); await dv.waitForTimeout(400);
    await dv.click('#podFlush'); await dv.waitForTimeout(1200);
    assert.ok(TD.dispatch_asset_events.some(e => e.id === ahead.sent[0] && e.event_type === 'loaded'), 'the flush applied it with the same id');
    assert.deepEqual(await dv.evaluate(() => cylQueueAll().then(q => q.length)), 0);
    // a 403 is not a refusal: kept, with "Not sent yet"; only the server's bad_event 400 marks the cylinders rejected
    await dv.route('**/api/assets', r => JSON.parse(r.request().postData() || '{}').action === 'events'
      ? r.fulfill({status:403, contentType:'application/json', body:JSON.stringify({error:{code:'forbidden', message:'Your role can\'t do that.'}})}) : r.continue());
    await loadOne('CD5678'); await doneWait();
    await dv.unroute('**/api/assets'); dropExpected(dv, '403 (Forbidden)');
    assert.match(flat(await dv.textContent('#cylStatus')), /Not sent yet — the server didn't take it just now \(Your role can't do that\.\)/);
    assert.match(await slotTxt(0), /waiting to send/);
    assert.equal(await dv.evaluate(() => cylQueueAll().then(q => q.length)), 1, 'kept after a 403');
    await dv.click('#cylClose'); await dv.waitForTimeout(400); await dv.click('#podFlush'); await dv.waitForTimeout(1200);
    assert.equal(await dv.evaluate(() => cylQueueAll().then(q => q.length)), 0, 'sent on the flush');
    await dv.route('**/api/assets', r => JSON.parse(r.request().postData() || '{}').action === 'events'
      ? r.fulfill({status:400, contentType:'application/json', body:JSON.stringify({error:{code:'bad_event', message:'event 0: occurredAt must be an ISO time'}})}) : r.continue());
    await loadOne('CD5678'); await doneWait();
    await dv.unroute('**/api/assets'); dropExpected(dv, '400 (Bad Request)');
    assert.match(await slotTxt(0), /rejected: event 0: occurredAt must be an ISO time/);
    assert.equal(await dv.evaluate(() => cylQueueAll().then(q => q.length)), 0, 'a bad_event refusal is not kept');
    await dv.click('#cylClose'); await dv.waitForTimeout(400);
    // a batch whose photo did not upload: the flush uploads it first, then sends (an object already there counts as uploaded)
    const qid = await dv.evaluate(async () => { const id = newUuid(), path = state.company + '/asset/' + id + '.jpg';
      await cylQueuePut({id:newUuid(), company:state.company, label:'test', at:Date.now(), blobs:{[id]:new Blob(['x'], {type:'image/jpeg'})},
        events:[{id, type:'loaded', serial:'CD5678', from:{kind:'hub', id:'EB'}, to:{kind:'hub', id:'EB'}, photoPath:path, occurredAt:new Date().toISOString()}]}); return id; });
    await dv.evaluate(() => updatePodQueueNote()); await dv.waitForTimeout(200);
    await dv.click('#podFlush'); await dv.waitForTimeout(1200);
    assert.ok((TD.__objects || []).includes('adchem/asset/' + qid + '.jpg'), 'the kept photo uploaded on flush');
    assert.ok(TD.dispatch_asset_events.some(e => e.id === qid && e.event_type === 'loaded' && e.photo_path === 'adchem/asset/' + qid + '.jpg'), 'then the event went');

    // Load: free-form slots, loaded to the hub; My truck: today's loaded minus delivered
    await dv.click('#btnLoad'); await dv.waitForTimeout(300);
    assert.equal(await dv.$eval('#cylSheet', e => e.hidden), false, 'Load opens the sheet');
    assert.equal(await dv.$eval('#cylCollectWrap', e => e.hidden), true, 'no Collecting in load mode');
    await dv.click('#cylAddSlot'); await dv.waitForTimeout(100);
    await dv.fill('#cyl_typed', 'NEW9'); await dv.click('#cyl_use'); await dv.waitForTimeout(500);
    assert.match(flat(await dv.textContent('#cylSlots [data-slot="0"]')), /NEW9.*was at/, 'NEW9 was at the customer');
    await dv.click('#cylDone'); await dv.waitForFunction(() => state.cyl && !state.cyl.sending, null, {timeout:8000}); await dv.waitForTimeout(150);
    const ld = TD.dispatch_asset_events.find(e => e.event_type === 'loaded' && e.asset_id === new9.id);
    assert.ok(ld && ld.to_kind === 'hub' && ld.to_id === 'EB', 'loaded to EB');
    assert.ok(TD.dispatch_asset_events.some(e => e.event_type === 'sighted' && e.asset_id === new9.id && e.from_kind === 'site' && e.to_id === 'EB'), 'the register is corrected');
    await dv.click('#cylClose'); await dv.waitForTimeout(600);
    await dv.click('#btnMyTruck'); await dv.waitForTimeout(800);
    const truck = flat(await dv.textContent('#truckList'));
    assert.match(truck, /CD5678/); assert.match(truck, /NEW9/); assert.doesNotMatch(truck, /AB1234/);
    assert.equal(await dv.evaluate(() => document.documentElement.scrollWidth), 390, 'no horizontal overflow on Today with My truck open');
    // the reads Today makes while the phone is offline (site notes, the register at the stop) are the only console errors
    assert.deepEqual(dv.errs.filter(e => !/ERR_INTERNET_DISCONNECTED/.test(e)), [], 'driver page errors');
  } finally { await fd.stop(); }

  // ---- another tab holds the old IndexedDB version (the upgrade is blocked), and the register saw AB1234 after this phone did ----
  const fb = makeFake(); const TB = fb.T; const baseB = await fb.start();
  try {
    const CID = '11111111-1111-4111-8111-111111111111', SK = 'ADC-0001 — Primary', ORD = 'EB-261020-01';
    TB.dispatch_customers.push({id:CID,company:'adchem',customer_id:'ADC-0001',name:'Type 7 Manufacturing',account_status:'active',primary_hub:'EB'});
    TB.dispatch_sites.push({company:'adchem',site_key:SK,customer_id:CID,customer:'Type 7 Manufacturing',addr:'100 Main St, Oakland CA 94607',city:'Oakland',hub:'EB',site_label:'Primary',code_raw:'D - Deliver; no holds',code:'D',synced_at:'2026-10-20T08:00:00Z'});
    const od = {id:ORD,hub:'EB',date:'2026-10-20',status:'Scheduled',customer:'Type 7 Manufacturing',siteKey:SK,siteLabel:'Primary',code:'D',effCode:'D',window:'7:00a – 11:00a',truck:'T1',
      shipTo:'100 Main St, Oakland CA 94607',bolNo:9450,lines:[{category:'Gases',product:'Carbon Dioxide',container:'50lb Cylinder',qty:1,unitLb:50,unitDef:false,note:''}]};
    TB.dispatch_orders.push({company:'adchem',id:ORD,bol_no:9450,hub:'EB',date:'2026-10-20',status:'Scheduled',customer:'Type 7 Manufacturing',data:od,created_at:'2026-10-19T12:00:00Z',updated_at:'2026-10-19T12:00:00Z'});
    const abB = TB.dispatch_assets.find(x => x.serial === 'AB1234'); abB.last_seen_at = '2099-01-01T00:00:00Z';   // this phone's delivery arrives late
    const bk = await newPage(b, baseB, {viewport:{width:390,height:844}, members:[{user_id:'u1',company:'adchem',role:'driver',hub:'EB',active:true,is_super_admin:false,permissions:{}}]});
    // an open request that only ever fires onblocked
    await bk.addInitScript(() => { indexedDB.open = function(){ const r = {}; setTimeout(() => { if (r.onblocked) r.onblocked({}); }, 50); return r; }; });
    await signIn(bk, baseB); await bk.waitForTimeout(600);
    assert.equal(await bk.evaluate(() => Promise.race([podIdb().then(d => d === null ? 'null' : 'db'), new Promise(r => setTimeout(() => r('hung'), 1000))])), 'null', 'a blocked open answers null within a second');
    await bk.click('#todayList [data-cyl="' + ORD + '"]'); await bk.waitForFunction(() => state.cyl && state.cyl.prior, null, {timeout:3000});
    await bk.evaluate(() => Promise.race([state.cyl.prior, new Promise((_, no) => setTimeout(() => no(new Error('the sheet is stuck on the queue')), 1500))]));
    await bk.click('#cylSlots [data-open="s:0"]'); await bk.fill('#cyl_typed', 'AB1234'); await bk.click('#cyl_use'); await bk.waitForTimeout(400);
    assert.match(flat(await bk.textContent('#cylSlots [data-slot="0"]')), /AB1234/, 'Use answers');
    // no signal and nowhere to keep it: Done says so and the slot stays ready
    await bk.context().setOffline(true);
    await bk.click('#cylDone'); await bk.waitForFunction(() => state.cyl && !state.cyl.sending, null, {timeout:4000}); await bk.waitForTimeout(150);
    assert.match(flat(await bk.textContent('#cylStatus')), /Not sent yet — no signal\. Keep this open and press Done again when you have signal\./);
    await bk.context().setOffline(false);
    await bk.click('#cylDone'); await bk.waitForFunction(() => state.cyl && !state.cyl.sending, null, {timeout:8000}); await bk.waitForTimeout(150);
    assert.match(flat(await bk.textContent('#cylSlots [data-slot="0"]')), /AB1234.*✓ recorded — recorded late — did not move the container/, 'the late warning on the slot');
    assert.deepEqual([abB.location_kind, abB.location_id], ['hub', 'EB'], 'the late delivery did not move it');
    assert.equal(TB.dispatch_asset_events.find(e => e.event_type === 'delivered' && e.asset_id === abB.id).applied, false, 'kept as history, applied = false');
    assert.deepEqual(bk.errs.filter(e => !/ERR_INTERNET_DISCONNECTED/.test(e)), [], 'blocked-store page errors');
  } finally { await fb.stop(); }
  } finally { await b.close(); await fake.stop(); }
})().then(()=>{ console.log('assets.test.cjs: ok'); }, e=>{ console.error(e); process.exit(1); });
