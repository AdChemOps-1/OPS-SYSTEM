// Headless test for Stage 3B inventory. Part 1 (Task 4): the Inventory tab as a super admin — on hand by block, the entry sheets
// (Receive, Use supplies, Count, Produce), the orders delivered rule seen through the Orders status select, minimums, the stock
// alert recipients on Setup -> Warnings, and the coordinator / driver switches. Part 2 (Task 1): the fake backend's stock side
// (minimums, on-hand, delivered rule, /api/stock, stock alert, import slices) answers as the server does. Each part has its own fake.
const assert = require('assert/strict');
const { chromium } = require('playwright');
const { makeFake, newPage } = require('./_fake.cjs');
const flat = s => (s || '').replace(/\s+/g, ' ').trim();

async function signIn(page, base){
  await page.goto(base+'/'); await page.waitForTimeout(400);
  await page.fill('#lEmail','jamie@adchem.pro'); await page.fill('#lPass','correct-horse'); await page.click('#btnLogin'); await page.waitForTimeout(1000);
  assert.equal(await page.$eval('#app',e=>e.hidden), false, 'app shown');
}

async function uiPart(b){
  const fake = makeFake(); const T = fake.T; const base = await fake.start();
  try {
    T.dispatch_members[0].is_super_admin = true;
    // the seeded fill: AB1234 filled at EB drew 50 lb of Carbon Dioxide (800 received - 50 = 750)
    T.dispatch_stock_movements.push({id:'sm-fill', company:'adchem', hub:'EB', product:'Carbon Dioxide', container:'', item:'', qty:-50, unit:'lb', reason:'filled', vendor_id:null, order_id:null, asset_event_id:'ev-fill', note:'', occurred_at:'2026-10-20T09:00:00Z', recorded_by:'u1'});
    // an order with a Bin line (2 bins) and a gas line, for the delivered rule
    const ORD = 'EB-261020-05';
    const od = {id:ORD, hub:'EB', date:'2026-10-20', status:'Scheduled', customer:'Type 7 Manufacturing', code:'D', effCode:'D', window:'7:00a – 11:00a', truck:'T1', shipTo:'100 Main St, Oakland CA 94607',
      lines:[{category:'Dry Ice', product:'Dry Ice - Pellet', container:'Bin', qty:2, unitLb:0, unitDef:false, note:''}, {category:'Gases', product:'Carbon Dioxide', container:'50lb Cylinder', qty:1, unitLb:50, unitDef:false, note:''}]};
    T.dispatch_orders.push({company:'adchem', id:ORD, bol_no:null, hub:'EB', date:'2026-10-20', status:'Scheduled', customer:'Type 7 Manufacturing', data:od, created_at:'2026-10-19T12:00:00Z', updated_at:'2026-10-19T12:00:00Z'});

    const page = await newPage(b, base, {viewport:{width:390,height:844}});
    await signIn(page, base);
    assert.equal(await page.$eval('#tab-inventory', e => e.hidden), false, 'the Inventory tab shows for a super admin');
    await page.click('#tab-inventory'); await page.waitForTimeout(600);
    assert.equal(await page.$eval('#panel-inventory', e => e.hidden), false);
    assert.equal(await page.$eval('#invHub', e => e.value), 'EB', 'the first hub by default');
    const K = {co2:'Carbon Dioxide||', bin:'Dry Ice - Pellet|Bin|', reg:'||Regulator', cyl:'Carbon Dioxide|50lb Cylinder|', ace:'Acetone|5gal Pail|'};
    const row = async (k, block) => { const el = await page.$((block ? '#' + block + ' ' : '#invOnhand ') + '.inv-row[data-key="' + k + '"]'); return el ? flat(await el.textContent()) : null; };
    const banners = async () => flat(await page.textContent('#banners'));
    assert.match(await row(K.co2, 'invBulk'), /^Carbon Dioxide 750 lb/);
    assert.match(await row(K.bin, 'invCont'), /^Dry Ice - Pellet Bin 6/);
    assert.match(await row(K.reg, 'invSup'), /^Regulator 10/);
    assert.match(await row(K.cyl, 'invGas'), /50lb Cylinder.*1 full/, 'full gas containers by size');
    assert.equal(await row(K.cyl, 'invCont'), null, 'gas containers only in their own block');
    assert.match(flat(await page.textContent('#invBelow')), /0 below minimum at EB/);

    // an entry sheet: open, fill, confirm
    const openAct = async name => { await page.click('#invActions [data-inv-act="' + name + '"]'); await page.waitForTimeout(150); assert.equal(await page.$eval('#invSheet', e => e.hidden), false, name + ' sheet open'); };
    const confirm = async () => { await page.click('#inv_confirm'); await page.waitForTimeout(600); };
    // Receive 5 regulators from Airgas
    await openAct('received');
    assert.equal(await page.$eval('#inv_vendorRow', e => e.hidden), false, 'Receive asks for the vendor');
    await page.selectOption('#inv_kind', 'supply'); await page.fill('#inv_item', 'Regulator'); await page.fill('#inv_qty', '5'); await page.selectOption('#inv_vendor', 'vend-airgas');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 390, 'no horizontal overflow with the sheet open');
    await confirm();
    assert.match(await banners(), /Recorded/);
    assert.equal(await page.$eval('#invSheet', e => e.hidden), true, 'the sheet closes');
    assert.match(await row(K.reg), /^Regulator 15/);
    const last = () => T.dispatch_stock_movements[T.dispatch_stock_movements.length - 1];
    assert.deepEqual([last().reason, last().item, last().qty, last().vendor_id], ['received', 'Regulator', 5, 'vend-airgas']);

    // Use supplies: a note is required; 12 regulators -> 3, below the minimum of 4
    await openAct('consumed');
    assert.equal(await page.$eval('#inv_kind', e => e.value), 'supply');
    await page.fill('#inv_item', 'Regulator'); await page.fill('#inv_qty', '12');
    const n0 = T.dispatch_stock_movements.length;
    await confirm();
    assert.match(await banners(), /note/i, 'refused without a note'); assert.equal(T.dispatch_stock_movements.length, n0, 'nothing written');
    await page.fill('#inv_note', 'jobs this week'); await confirm();
    assert.match(await row(K.reg), /^Regulator 3 .*below min 4/);
    assert.match(flat(await page.textContent('#invBelow')), /1 below minimum at EB/);

    // Count the dry ice bins at 4: the server writes the delta (-2)
    await openAct('counted');
    await page.selectOption('#inv_kind', 'container'); await page.selectOption('#inv_product', 'Dry Ice - Pellet'); await page.selectOption('#inv_container', 'Bin');
    assert.match(flat(await page.textContent('#inv_now')), /On hand now: 6/);
    await page.fill('#inv_qty', '4'); await confirm();
    assert.match(await row(K.bin), /^Dry Ice - Pellet Bin 4/);
    assert.deepEqual([last().reason, last().product, last().container, last().qty], ['counted', 'Dry Ice - Pellet', 'Bin', -2]);

    // Produce 10 bins: +10 bins, -500 lb of Carbon Dioxide (defaults 50 lb per bin)
    await openAct('produced');
    assert.deepEqual([await page.$eval('#inv_lb_per', e => e.value), await page.$eval('#inv_bulk', e => e.value)], ['50', 'Carbon Dioxide']);
    await page.selectOption('#inv_product', 'Dry Ice - Pellet'); await page.selectOption('#inv_container', 'Bin'); await page.fill('#inv_qty', '10'); await confirm();
    assert.match(await row(K.bin), /^Dry Ice - Pellet Bin 14/);
    assert.match(await row(K.co2), /^Carbon Dioxide 250 lb/);
    // Review Focus 3: 10 more with the bulk already short -> recorded, bulk negative and flagged
    await openAct('produced');
    await page.selectOption('#inv_product', 'Dry Ice - Pellet'); await page.selectOption('#inv_container', 'Bin'); await page.fill('#inv_qty', '10'); await confirm();
    assert.match(await row(K.co2), /^Carbon Dioxide −250 lb.*negative — enter receipts/);
    assert.equal(await page.$$eval('#invBulk .inv-row[data-key="Carbon Dioxide||"] .chip.st.stop', e => e.length), 1);
    assert.match(await row(K.bin), /^Dry Ice - Pellet Bin 24/);

    // Review Focus 1: the Orders status select; Delivered draws 2 bins once, Scheduled puts them back, Delivered again draws again
    const setStatus = async st => { await page.click('#tab-open'); await page.waitForTimeout(200); await page.selectOption('select[data-status="' + ORD + '"]', st); await page.waitForTimeout(500);
      await page.click('#tab-inventory'); await page.waitForTimeout(600); };
    await setStatus('Delivered'); assert.match(await row(K.bin), /^Dry Ice - Pellet Bin 22/);
    await setStatus('POD Received'); assert.match(await row(K.bin), /^Dry Ice - Pellet Bin 22/, 'Delivered -> POD Received draws nothing more');
    await setStatus('Scheduled'); assert.match(await row(K.bin), /^Dry Ice - Pellet Bin 24/);
    await setStatus('Delivered'); assert.match(await row(K.bin), /^Dry Ice - Pellet Bin 22/);
    assert.deepEqual(T.dispatch_stock_movements.filter(m => m.order_id === ORD).map(m => [m.reason, m.qty]), [['delivered', -2], ['adjusted', 2], ['delivered', -2]], 'the gas line is never counted here');

    // Review Focus 2: a first count of a key with no movements
    await openAct('counted');
    await page.selectOption('#inv_kind', 'container'); await page.selectOption('#inv_product', 'Acetone'); await page.selectOption('#inv_container', '5gal Pail');
    assert.match(flat(await page.textContent('#inv_now')), /On hand now: 0/);
    await page.fill('#inv_qty', '3'); await confirm();
    assert.match(await row(K.ace, 'invCont'), /^Acetone 5gal Pail 3/);
    assert.deepEqual([last().reason, last().qty], ['counted', 3]);

    // Minimums: listed per hub; Review Focus 4 — a unit that does not match the key is refused
    assert.match(flat(await page.textContent('#invMins')), /EB.*Carbon Dioxide.*500.*lb.*Regulator.*4.*count/);
    const mins0 = T.dispatch_stock_settings.length;
    await page.selectOption('#min_hub', 'EB'); await page.selectOption('#min_kind', 'bulk'); await page.selectOption('#min_product', 'Nitrogen');
    await page.fill('#min_qty', '100'); await page.selectOption('#min_unit', 'count'); await page.click('#btnSaveMin'); await page.waitForTimeout(400);
    assert.match(await banners(), /bulk is tracked in lb/); assert.equal(T.dispatch_stock_settings.length, mins0, 'nothing stored');
    await page.selectOption('#min_kind', 'supply'); await page.fill('#min_item', 'Pallet'); await page.fill('#min_qty', '2'); await page.selectOption('#min_unit', 'lb');
    await page.click('#btnSaveMin'); await page.waitForTimeout(400);
    assert.match(await banners(), /containers and supplies are counted/); assert.equal(T.dispatch_stock_settings.length, mins0);
    await page.selectOption('#min_unit', 'count'); await page.click('#btnSaveMin'); await page.waitForTimeout(600);
    const pal = T.dispatch_stock_settings.find(x => x.item === 'Pallet');
    assert.ok(pal, 'Pallet minimum stored'); assert.deepEqual([pal.hub, pal.product, pal.container, pal.min_qty, pal.unit, pal.alert], ['EB', '', '', 2, 'count', true]);
    assert.match(await row('||Pallet', 'invSup'), /^Pallet 0 .*below min 2/, 'a minimum with no stock shows at zero');
    assert.match(flat(await page.textContent('#invBelow')), /3 below minimum at EB/);
    // edit the regulator minimum down to 2 and the alert off, then delete the pallet minimum
    await page.click('#invMins [data-min-edit="min-reg"]'); await page.waitForTimeout(100);
    await page.fill('#min_qty', '2'); await page.uncheck('#min_alert'); await page.click('#btnSaveMin'); await page.waitForTimeout(600);
    assert.deepEqual([T.dispatch_stock_settings.find(x => x.id === 'min-reg').min_qty, T.dispatch_stock_settings.find(x => x.id === 'min-reg').alert], [2, false]);
    assert.doesNotMatch(await row(K.reg), /below/);
    await page.click('#invMins [data-min-del="' + pal.id + '"]'); await page.waitForTimeout(600);
    assert.ok(!T.dispatch_stock_settings.some(x => x.item === 'Pallet'), 'deleted');
    assert.match(flat(await page.textContent('#invBelow')), /1 below minimum at EB/, 'only the bulk is below now');

    // Setup -> Warnings: the stock alert recipients go through the RPC; a settings save never carries them
    await page.click('#tab-setup'); await page.waitForTimeout(500);
    assert.match(flat(await page.textContent('#warnCard')), /Stock alerts go to 0 addresses/);
    await page.fill('#warnStockTo', 'ops@adchem.pro\nnot-an-address');
    await page.click('#btnSaveWarnings'); await page.waitForTimeout(400);
    assert.match(await banners(), /Not an email address.*not-an-address/); assert.equal(T.dispatch_company_settings[0].data.stockAlertRecipients, undefined);
    await page.fill('#warnStockTo', 'ops@adchem.pro\n lead@adchem.pro \n');
    await page.click('#btnSaveWarnings'); await page.waitForTimeout(700);
    assert.deepEqual(T.dispatch_company_settings[0].data.stockAlertRecipients, ['ops@adchem.pro', 'lead@adchem.pro']);
    assert.ok(T.dispatch_log.some(l => l.what === 'warnings' && l.changes && l.changes.stockAlertRecipients), 'written by dispatch_set_stock_alerts');
    assert.match(flat(await page.textContent('#warnCard')), /Stock alerts go to 2 addresses/);
    assert.equal(await page.$eval('#warnStockTo', e => e.value), 'ops@adchem.pro\nlead@adchem.pro');
    await page.evaluate(async () => { state.settings.stockAlertRecipients = ['someone@else.example']; await DB.saveSettings(); });
    assert.deepEqual(T.dispatch_company_settings[0].data.stockAlertRecipients, ['ops@adchem.pro', 'lead@adchem.pro'], 'DB.saveSettings does not carry it');
    assert.deepEqual(page.errs, [], 'page errors');
    await page.close();

    // a coordinator with View assets sees the tab and the figures, no actions and no minimum form
    const cv = await newPage(b, base, {viewport:{width:390,height:844}, members:[{user_id:'u1',company:'adchem',role:'coordinator',hub:'',active:true,is_super_admin:false,permissions:{view_assets:true}}]});
    await signIn(cv, base);
    assert.equal(await cv.$eval('#tab-inventory', e => e.hidden), false);
    await cv.click('#tab-inventory'); await cv.waitForTimeout(600);
    assert.match(flat(await cv.textContent('#invOnhand .inv-row[data-key="Dry Ice - Pellet|Bin|"]')), /Bin 22/);
    assert.equal(await cv.$$eval('#invActions button', e => e.length), 0, 'no action buttons');
    assert.equal(await cv.$('#btnSaveMin'), null, 'no minimum form');
    assert.match(flat(await cv.textContent('#invMins')), /Carbon Dioxide.*500/);
    assert.equal(await cv.evaluate(() => document.documentElement.scrollWidth), 390);
    assert.deepEqual(cv.errs, [], 'coordinator page errors');
    await cv.close();
    // a driver sees no tab, even with the switch
    const dv = await newPage(b, base, {viewport:{width:390,height:844}, members:[{user_id:'u1',company:'adchem',role:'driver',hub:'EB',active:true,is_super_admin:false,permissions:{view_assets:true,manage_assets:true}}]});
    await signIn(dv, base);
    assert.equal(await dv.$eval('#tab-inventory', e => e.hidden), true, 'drivers see nothing of Inventory');
    assert.deepEqual(dv.errs, [], 'driver page errors');
    await dv.close();
  } finally { await fake.stop(); }
}

async function fakePart(b){
  const fake = makeFake(); const T = fake.T; const base = await fake.start();
  T.dispatch_members[0].is_super_admin = true;
  const api = async (p, body) => { const r = await fetch(base+p, {method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify(body)}); return {status:r.status, body:await r.json()}; };
  try {

    // seed: minimums and on-hand (800 lb CO2, 10 regulators, 6 bins, one full in-service 50lb cylinder at EB)
    const on = (await api('/api/stock', {action:'onhand', company:'adchem'})).body.rows;
    const find = (hub, product, container, item) => on.find(r => r.hub === hub && r.product === product && r.container === container && r.item === item);
    assert.deepEqual([find('EB','Carbon Dioxide','','').qty, find('EB','Carbon Dioxide','','').min_qty, find('EB','Carbon Dioxide','','').below], [800, 500, false]);
    assert.deepEqual([find('EB','','','Regulator').qty, find('EB','','','Regulator').min_qty], [10, 4]);
    assert.equal(find('EB','Dry Ice - Pellet','Bin','').qty, 6);
    assert.deepEqual([find('EB','Carbon Dioxide','50lb Cylinder','').qty, find('EB','Carbon Dioxide','50lb Cylinder','').unit], [1, 'count'], 'full in-service gas cylinders count by type');

    // /api/stock move: rules, 403, unit mismatch
    let r = await api('/api/stock', {action:'move', company:'adchem', entry:{kind:'consumed', hub:'EB', item:'Regulator', qty:7, unit:'count', note:'jobs'}});
    assert.equal(r.status, 200); assert.equal(r.body.ids.length, 1);
    assert.equal((await api('/api/stock', {action:'below', company:'adchem'})).body.rows.map(x => x.item).join(), 'Regulator', 'Regulator 3 < min 4');
    assert.equal((await api('/api/stock', {action:'move', company:'adchem', entry:{kind:'adjusted', hub:'EB', item:'Regulator', qty:1, unit:'count'}})).status, 400, 'adjusted needs a note');
    assert.equal((await api('/api/stock', {action:'move', company:'adchem', entry:{kind:'received', hub:'EB', product:'Carbon Dioxide', qty:5, unit:'count'}})).status, 400, 'bulk is lb');
    r = await api('/api/stock', {action:'move', company:'adchem', entry:{kind:'counted', hub:'EB', item:'Regulator', qty:5, unit:'count'}});
    assert.equal(T.dispatch_stock_movements.find(m => m.id === r.body.ids[0]).qty, 2, 'counted = count - server on-hand (3)');
    r = await api('/api/stock', {action:'move', company:'adchem', entry:{kind:'produced', hub:'EB', product:'Dry Ice - Pellet', container:'Bin', qty:2, unit:'count'}});
    assert.deepEqual(r.body.ids.map(id => { const m = T.dispatch_stock_movements.find(x => x.id === id); return [m.qty, m.unit]; }), [[2,'count'], [-100,'lb']]);
    T.dispatch_members[0].is_super_admin = false; T.dispatch_members[0].permissions = {view_assets:true};
    assert.equal((await api('/api/stock', {action:'move', company:'adchem', entry:{kind:'received', hub:'EB', item:'Pallet', qty:1, unit:'count'}})).status, 403, 'manage_assets needed');
    assert.equal((await api('/api/stock', {action:'onhand', company:'adchem'})).status, 200, 'view_assets reads');
    T.dispatch_members[0].permissions = {};
    assert.equal((await api('/api/stock', {action:'below', company:'adchem'})).status, 200, 'an editor (admin) reads without view_assets');
    T.dispatch_members[0].role = 'driver'; T.dispatch_members[0].permissions = {manage_assets:true};
    assert.equal((await api('/api/stock', {action:'below', company:'adchem'})).status, 403, 'a non-editor without view_assets cannot read');
    const before = T.dispatch_stock_movements.length;
    r = await api('/api/stock', {action:'move', company:'adchem', entry:{kind:'counted', hub:'EB', item:'Regulator', qty:9, unit:'count'}});
    assert.deepEqual([r.status, r.body.error.message], [403, 'counting needs View assets'], 'a manage-only member cannot count');
    assert.equal(T.dispatch_stock_movements.length, before, 'nothing written');
    T.dispatch_members[0].role = 'admin'; T.dispatch_members[0].permissions = {view_assets:true};
    T.dispatch_members[0].is_super_admin = true;

    // orders: entering Delivered draws the non-gas lines down once; leaving reverses
    const find2 = (p, c, i) => T.dispatch_stock_movements.filter(m => m.product === p && m.container === c && m.item === i).reduce((n, m) => n + m.qty, 0);
    T.dispatch_orders.push({id:'o1', company:'adchem', hub:'EB', status:'Scheduled', data:{lines:[{category:'Dry Ice', product:'Dry Ice - Pellet', container:'Bin', qty:3}, {category:'Gases', product:'Carbon Dioxide', container:'50lb Cylinder', qty:2}, {category:'Dry Ice', product:'Dry Ice - Pellet', container:'Box', qty:0}]}});
    const rest = (method, q, body) => fetch(base+'/rest/v1/dispatch_orders'+q, {method, headers:{'content-type':'application/json'}, body:JSON.stringify(body)});
    const o1 = () => T.dispatch_stock_movements.filter(m => m.order_id === 'o1');
    const step = async st => { await rest('PATCH', '?id=eq.o1', {status:st}); };
    await step('Delivered');
    assert.deepEqual(o1().map(m => [m.reason, m.product, m.container, m.qty]), [['delivered','Dry Ice - Pellet','Bin',-3]]);
    await step('POD Received'); assert.equal(o1().length, 1, 'Delivered -> POD Received writes nothing');
    await step('Scheduled');
    assert.deepEqual(o1().slice(1).map(m => [m.reason, m.qty, m.note]), [['adjusted', 3, 'undelivered o1']]);
    await step('Delivered');
    assert.deepEqual(o1().slice(2).map(m => [m.reason, m.qty]), [['delivered', -3]], 're-entering draws again');
    await step('POD Received'); assert.equal(o1().length, 3, 'POD Received again writes nothing');
    assert.equal(o1().reduce((n, m) => n + m.qty, 0), -3, 'net -3');
    // /api/pod only moves the pre-delivery statuses
    T.dispatch_orders.push({id:'o2', company:'adchem', hub:'EB', status:'Cancelled', data:{lines:[{category:'Dry Ice', product:'Dry Ice - Pellet', container:'Bin', qty:1}]}});
    await api('/api/pod', {orderId:'o2', photoPath:'adchem/EB/pod/o2/x.jpg'});
    assert.equal(T.dispatch_orders.find(o => o.id === 'o2').status, 'Cancelled', 'pod leaves other statuses alone');

    // a minimum with no stock rows still shows, at zero and below
    T.dispatch_stock_settings.push({id:'min-pal', company:'adchem', hub:'EB', product:'', container:'', item:'Pallet', min_qty:2, unit:'count'});
    const pal = (await api('/api/stock', {action:'onhand', company:'adchem'})).body.rows.find(r => r.item === 'Pallet');
    assert.deepEqual([pal.qty, pal.below], [0, true]);
    T.dispatch_stock_settings.pop();

    // minimum rows through REST need manage_assets; filled / delivered cannot be inserted by a client
    const bad = await fetch(base+'/rest/v1/dispatch_stock_movements', {method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({company:'adchem', hub:'EB', product:'x', container:'', item:'', qty:-1, unit:'lb', reason:'delivered'})});
    assert.equal(bad.status, 403);

    // alert recipients (RPC, super admin) and the stock alert on /api/expiry
    const rpc = (body) => fetch(base+'/rest/v1/rpc/dispatch_set_stock_alerts', {method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify(body)});
    assert.equal((await api('/api/expiry', {send:true, company:'adchem'})).body.stock.skipped[0].reason, 'no_recipients');
    assert.equal((await rpc({p_company:'adchem', p_recipients:['ops@adchem.pro']})).status, 200);
    assert.deepEqual(T.dispatch_company_settings[0].data.stockAlertRecipients, ['ops@adchem.pro']);
    await api('/api/expiry', {send:true, company:'adchem'});
    assert.equal(fake.calls.filter(c => c[0] === 'stock_alert').length, 0, 'nothing below, nothing sent');
    await api('/api/stock', {action:'move', company:'adchem', entry:{kind:'consumed', hub:'EB', item:'Regulator', qty:3, unit:'count', note:'jobs'}});
    await api('/api/expiry', {send:true, company:'adchem'});
    assert.deepEqual(fake.calls.filter(c => c[0] === 'stock_alert').map(c => c[1]), [{company:'adchem', to:['ops@adchem.pro'], count:1}]);
    T.dispatch_members[0].is_super_admin = false;
    assert.equal((await rpc({p_company:'adchem', p_recipients:[]})).status, 403, 'super admin only');
    T.dispatch_members[0].is_super_admin = true;

    // import slices: license and psa items, the document rows, no money
    T.__importSlices = true;
    T.dispatch_company_settings[0].data.importSheetId = '1ImportWorkbookXYZ_abc123';
    const rd = await api('/api/import', {company:'adchem', action:'read'});
    const items = rd.body.plan.items;
    assert.deepEqual(items.filter(i => i.action === 'license' || i.action === 'psa').map(i => [i.action, i.name]), [['license','Costa Cannabis'], ['psa','Type 7 Manufacturing']]);
    assert.ok(!/7,777|1,500|5,000\.00|Balance/.test(JSON.stringify(items.filter(i => i.doc))), 'no money or Balance in the slice items');
    const cm = await api('/api/import', {company:'adchem', action:'commit', plan:rd.body.plan});
    assert.equal(cm.status, 200);
    const docs = T.dispatch_documents.filter(d => d.source === 'import');
    assert.deepEqual(docs.map(d => [d.doc_type, d.subject_type, d.review_status, d.import_source.tab, d.import_source.row]).sort(), [['cannabis_license','customer','live','Licensing & Entity',2], ['psa','customer','live','Account Terms',2]]);
    const lic = docs.find(d => d.doc_type === 'cannabis_license');
    assert.deepEqual([lic.number, lic.expires, lic.extra.entity_status_sos, lic.extra.source_note], ['C11-0000001-LIC', '2027-03-31', 'Active', 'DCC lookup']);
    assert.equal(docs.find(d => d.doc_type === 'psa').extra.countersigned, '2026-09-15');
    assert.ok(!/7,777|1,500|Net 30|Balance/.test(JSON.stringify(docs)), 'no money in documents');
    const again = await api('/api/import', {company:'adchem', action:'commit', plan:(await api('/api/import', {company:'adchem', action:'read'})).body.plan});
    assert.equal(again.status, 200); assert.equal(T.dispatch_documents.filter(d => d.source === 'import').length, 2, 're-run updates, never duplicates');
  } finally { await fake.stop(); }
}

(async()=>{
  const b = await chromium.launch();
  try { await uiPart(b); await fakePart(b); } finally { await b.close(); }
})().then(()=>{ console.log('inventory.test.cjs: ok'); }, e=>{ console.error(e); process.exit(1); });
