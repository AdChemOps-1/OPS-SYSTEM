// Headless UI test for the asset register (Stage 3A). So far: the Assets tab and its permission switches, and Setup -> Vendors and
// Container types. Uses the shared fake (test/_fake.cjs).
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
