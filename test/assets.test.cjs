// Headless UI test for the asset register (Stage 3A): the Assets tab and its permission switches, Setup -> Vendors and Container types,
// the register with detail and history, counts, and the hub actions. Uses the shared fake (test/_fake.cjs).
const assert = require('assert/strict');
const { chromium } = require('playwright');
const { makeFake, newPage } = require('./_fake.cjs');
const flat = s => (s || '').replace(/\s+/g, ' ').trim();

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
  await page.click('#actClose'); await page.waitForTimeout(500);
  assert.equal((await regRows()).length, 6, 'register refreshed after the actions');
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
  } finally { await b.close(); await fake.stop(); }
})().then(()=>{ console.log('assets.test.cjs: ok'); }, e=>{ console.error(e); process.exit(1); });
