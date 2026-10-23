// Headless test for Stage 3B inventory. Task 1 is the harness: the app opens as a super admin, the Inventory tab is not built yet,
// and the fake backend's stock side (minimums, on-hand, delivered rule, /api/stock, stock alert, import slices) answers as the later tasks expect.
const assert = require('assert/strict');
const { chromium } = require('playwright');
const { makeFake, newPage } = require('./_fake.cjs');

async function signIn(page, base){
  await page.goto(base+'/'); await page.waitForTimeout(400);
  await page.fill('#lEmail','jamie@adchem.pro'); await page.fill('#lPass','correct-horse'); await page.click('#btnLogin'); await page.waitForTimeout(1000);
  assert.equal(await page.$eval('#app',e=>e.hidden), false, 'app shown');
}

(async()=>{
  const fake = makeFake(); const T = fake.T; const base = await fake.start();
  T.dispatch_members[0].is_super_admin = true;
  const api = async (p, body) => { const r = await fetch(base+p, {method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify(body)}); return {status:r.status, body:await r.json()}; };
  const b = await chromium.launch();
  try {
    const page = await newPage(b, base, {viewport:{width:390,height:844}});
    await signIn(page, base);
    const tab = await page.$('#tab-inventory');
    assert.ok(!tab || await tab.evaluate(e => e.hidden), '#tab-inventory is absent or hidden until Task 4');
    assert.deepEqual(page.errs, [], 'page errors');

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
    assert.equal((await api('/api/stock', {action:'below', company:'adchem'})).status, 403, 'no view_assets, no read');
    T.dispatch_members[0].permissions = {view_assets:true};
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
  } finally { await b.close(); await fake.stop(); }
})().then(()=>{ console.log('inventory.test.cjs: ok'); }, e=>{ console.error(e); process.exit(1); });
