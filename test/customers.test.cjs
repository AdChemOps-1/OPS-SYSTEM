// Headless UI test for the Customers screen (public/customers.js): list, new customer, profile save + audit,
// search, per-member manage_customers permission, phone width. Uses the shared fake (test/_fake.cjs).
const assert = require('assert/strict');
const { chromium } = require('playwright');
const { makeFake, newPage } = require('./_fake.cjs');
const flat = s => (s || '').replace(/\s+/g, ' ').trim();

async function signIn(page, base, email){
  await page.goto(base+'/'); await page.waitForTimeout(400);
  await page.fill('#lEmail', email||'jamie@adchem.pro'); await page.fill('#lPass','correct-horse'); await page.click('#btnLogin'); await page.waitForTimeout(1000);
  assert.equal(await page.$eval('#app',e=>e.hidden), false, 'app shown');
}
const rows = page => page.$$eval('#custList .cust-row', e=>e.length);

(async()=>{
  const fake = makeFake(); const T = fake.T; const base = await fake.start();
  T.dispatch_members[0].is_super_admin = true;   // the seeded AdChem admin is the super admin (migration 005 seed)
  const b = await chromium.launch(); const pages = [];
  try {
  const page = await newPage(b, base); pages.push(page);
  await signIn(page, base);
  // tab and empty list
  assert.equal(await page.$eval('#tab-customers',e=>e.hidden), false, 'customers tab visible to an editor');
  await page.click('#tab-customers'); await page.waitForTimeout(300);
  assert.equal(await page.$eval('#panel-customers',e=>e.hidden), false, 'customers panel shown');
  assert.equal(await rows(page), 0);
  assert.match(flat(await page.textContent('#custList')), /No customers yet/);
  assert.equal(await page.$eval('#btnNewCustomer',e=>e.disabled), false, 'super admin can add');
  // new customer
  await page.click('#btnNewCustomer'); await page.waitForTimeout(200);
  assert.equal(await page.$eval('#custPage',e=>e.hidden), false, 'customer page open');
  assert.equal(await page.$eval('#custList',e=>e.closest('.card').hidden), true, 'list hidden while a customer is open');
  await page.fill('#cName','Type 7 Manufacturing'); await page.fill('#cLegal','Type 7 Manufacturing, Inc.');
  await page.selectOption('#cHub','EB');
  await page.fill('#cBillStreet','100 Main St'); await page.fill('#cBillCity','Oakland'); await page.fill('#cBillState','CA'); await page.fill('#cBillZip','94601');
  await page.click('#btnSaveCustomer'); await page.waitForTimeout(700);
  assert.equal(T.dispatch_customers.length, 1);
  const c = T.dispatch_customers[0];
  assert.equal(c.customer_id, 'ADC-0001');
  assert.deepEqual({company:c.company,name:c.name,legal_name:c.legal_name,account_status:c.account_status,primary_hub:c.primary_hub,billing:[c.billing_street,c.billing_city,c.billing_state,c.billing_zip],updated_by:c.updated_by,parent:c.parent_customer_id,verified:c.last_verified},
    {company:'adchem',name:'Type 7 Manufacturing',legal_name:'Type 7 Manufacturing, Inc.',account_status:'active',primary_hub:'EB',billing:['100 Main St','Oakland','CA','94601'],updated_by:'u1',parent:null,verified:null});
  assert.match(flat(await page.textContent('#custComplete')), /^\d+ of 15$/);
  assert.equal(flat(await page.textContent('#custComplete')), '8 of 15', 'name, legal, status, hub and four billing fields');
  assert.match(flat(await page.textContent('#custPage')), /ADC-0001/, 'page header shows the assigned ID');
  assert.equal(await rows(page), 1); assert.match(flat(await page.textContent('#custList')), /Type 7 Manufacturing.*ADC-0001/);
  // edit: one field changes, one audit row with that field only
  const logBefore = T.dispatch_log.length;
  await page.fill('#cBillZip','94607'); await page.click('#btnSaveCustomer'); await page.waitForTimeout(700);
  assert.equal(T.dispatch_customers.length, 1, 'edit updates, not inserts'); assert.equal(T.dispatch_customers[0].billing_zip, '94607');
  const audit = T.dispatch_log.slice(logBefore).filter(l=>l.table_name==='dispatch_customers');
  assert.equal(audit.length, 1, 'one audit row for the edit');
  assert.deepEqual({who:audit[0].who,what:audit[0].what,row_id:audit[0].row_id,company:audit[0].company,changes:audit[0].changes},
    {who:'u1',what:'change',row_id:c.id,company:'adchem',changes:{billing_zip:{from:'94601',to:'94607'}}});
  assert.ok(T.dispatch_log.some(l=>l.table_name==='dispatch_customers'&&l.changes.billing_zip&&l.changes.billing_zip.to==='94607'));
  assert.ok(T.dispatch_log.some(l=>l.table_name==='dispatch_customers'&&l.detail.op==='insert'&&l.changes.name.from===null&&l.changes.name.to==='Type 7 Manufacturing'), 'insert audited');
  // saving again with nothing changed writes no audit row
  const n2 = T.dispatch_log.length; await page.click('#btnSaveCustomer'); await page.waitForTimeout(500);
  assert.equal(T.dispatch_log.filter((l,i)=>i>=n2&&l.table_name==='dispatch_customers').length, 0, 'no-op save not audited');
  // close, then search
  await page.click('#btnCloseCustomer'); await page.waitForTimeout(200);
  assert.equal(await page.$eval('#custPage',e=>e.hidden), true); assert.equal(await page.$eval('#custList',e=>e.closest('.card').hidden), false);
  assert.equal(await page.evaluate(()=>state.customer), null);
  await page.fill('#custSearch','type'); await page.waitForTimeout(150); assert.equal(await rows(page), 1);
  await page.fill('#custSearch','zzz'); await page.waitForTimeout(150); assert.equal(await rows(page), 0);
  assert.match(flat(await page.textContent('#custList')), /No customers match/);
  await page.fill('#custSearch','adc-0001'); await page.waitForTimeout(150); assert.equal(await rows(page), 1, 'search by customer ID');
  await page.fill('#custSearch',''); await page.selectOption('#custHub','LA'); await page.waitForTimeout(150); assert.equal(await rows(page), 0, 'hub filter');
  await page.selectOption('#custHub','EB'); await page.selectOption('#custStatus','prospect'); await page.waitForTimeout(150); assert.equal(await rows(page), 0, 'status filter');
  await page.selectOption('#custStatus','active'); await page.check('#custIncomplete'); await page.waitForTimeout(150); assert.equal(await rows(page), 1, 'incomplete filter keeps an 8/15 profile');
  assert.match(flat(await page.textContent('#custList .cust-row')), /8\/15/);
  // coordinator without, then with, manage_customers
  for (const [perms, enabled] of [[{}, false], [{manage_customers:true}, true]]) {
    const p = await newPage(b, base, {members:[{user_id:'u1',company:'adchem',role:'coordinator',hub:'',active:true,is_super_admin:false,permissions:perms}]}); pages.push(p);
    await signIn(p, base);
    assert.equal(await p.$eval('#tab-customers',e=>e.hidden), false, 'coordinator sees customers');
    await p.click('#tab-customers'); await p.waitForTimeout(300);
    assert.equal(await rows(p), 1);
    assert.equal(await p.$eval('#btnNewCustomer',e=>e.disabled), !enabled, 'new customer button '+JSON.stringify(perms));
    await p.click('#custList .cust-row'); await p.waitForTimeout(300);
    assert.equal(await p.inputValue('#cName'), 'Type 7 Manufacturing');
    assert.equal(await p.$eval('#btnSaveCustomer',e=>e.disabled), !enabled, 'save button '+JSON.stringify(perms));
    assert.equal(await p.$eval('#cName',e=>e.disabled), !enabled, 'profile inputs follow the permission');
  }
  // a driver does not see the tab
  const d = await newPage(b, base, {members:[{user_id:'u1',company:'adchem',role:'driver',hub:'EB',active:true}]}); pages.push(d);
  await signIn(d, base); assert.equal(await d.$eval('#tab-customers',e=>e.hidden), true, 'driver has no customers tab');
  // phone width with the customer page open
  const m = await newPage(b, base, {viewport:{width:390,height:844},members:[{user_id:'u1',company:'adchem',role:'admin',hub:'',active:true,is_super_admin:true,permissions:{}}]}); pages.push(m);
  await signIn(m, base); await m.click('#tab-customers'); await m.waitForTimeout(300);
  assert.equal(await m.evaluate(()=>document.documentElement.scrollWidth), 390, 'no horizontal overflow on the list');
  await m.click('#custList .cust-row'); await m.waitForTimeout(300);
  assert.equal(await m.$eval('#custPage',e=>e.hidden), false);
  assert.equal(await m.evaluate(()=>document.documentElement.scrollWidth), 390, 'no horizontal overflow with the customer page open');
  for (const t of ['sites','contacts','activity','history']) { await m.click('#ctab-'+t); await m.waitForTimeout(100); assert.equal(await m.$eval('#cpane-'+t,e=>e.hidden), false, t+' pane shown'); assert.equal(await m.$eval('#cpane-profile',e=>e.hidden), true); }
  await m.click('#ctab-profile'); await m.waitForTimeout(100); assert.equal(await m.$eval('#cpane-profile',e=>e.hidden), false);
  assert.equal(await m.evaluate(()=>document.documentElement.scrollWidth), 390, 'no horizontal overflow after switching tabs');
  assert.deepEqual(pages.flatMap(p=>p.errs), [], 'unexpected page errors');
  } finally { await b.close(); await fake.stop(); }
})().then(()=>{ console.log('customers.test.cjs: ok'); }, e=>{ console.error(e); process.exit(1); });
