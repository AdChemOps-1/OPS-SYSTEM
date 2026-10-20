// Headless UI test for the Customers screen (public/customers.js): list, new customer, profile save + audit,
// search, per-member manage_customers permission, sites + hub notes, contacts, activity + driver-note review, history, phone width. Uses the shared fake (test/_fake.cjs).
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
  T.dispatch_company_settings[0].data.customersOutSheetId = '1COUTseedAAAAAAAAAAAAAA';   // saves report to Customers Out only when a sheet is set
  const coCalls = () => fake.calls.filter(x=>x[0]==='customers-out');
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
  assert.deepEqual(coCalls(), [['customers-out',{customerIds:[c.id]}]], 'a customer save rewrites its Customers Out rows');
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

  // ---------- sites, contacts, activity, history (reopen the saved customer) ----------
  await page.uncheck('#custIncomplete'); await page.selectOption('#custStatus',''); await page.waitForTimeout(150);
  await page.click('#custList .cust-row'); await page.waitForTimeout(400);
  const badge = async () => parseInt(flat(await page.textContent('#custComplete')), 10);
  assert.equal(await badge(), 8);
  // sites: add one from the billing address, with a per-hub route note
  await page.click('#ctab-sites'); await page.waitForTimeout(400);
  assert.match(flat(await page.textContent('#siteList')), /No sites yet/);
  await page.click('#btnAddSite'); await page.waitForTimeout(150);
  assert.equal(await page.$eval('#siteNew',e=>e.hidden), false, 'new site form open');
  assert.equal(await page.$eval('#siteNew form',e=>e.getAttribute('data-site')), '', 'new site form has an empty data-site');
  await page.check('#sSameAsBilling'); await page.waitForTimeout(50);
  assert.equal(await page.inputValue('#siteNew [data-k=addr]'), '100 Main St', 'same as billing fills the street');
  assert.equal(await page.inputValue('#siteNew [data-k=city]'), 'Oakland', 'same as billing fills the city');
  assert.equal(await page.inputValue('#siteNew [data-k=hub]'), 'EB', 'hub defaults to the primary hub');
  await page.fill('#siteNew [data-k=site_label]','Primary');
  await page.fill('#siteNew [data-k=gate_code]','4321'); await page.fill('#siteNew [data-k=receiving_hours]','7–11am');
  await page.selectOption('#siteNew [data-hubnote=EB] [data-n=scale_on_route]','yes');
  await page.fill('#siteNew [data-hubnote=EB] [data-n=route_notes]','Scale on 580');
  const coBeforeSite = coCalls().length;
  await page.click('#siteNew [data-save-site]'); await page.waitForTimeout(800);
  assert.equal(T.dispatch_sites.length, 1, 'one site row');
  assert.deepEqual(coCalls().slice(coBeforeSite), [['customers-out',{customerIds:[c.id]}]], 'a site save rewrites the customer\'s Customers Out rows');
  const s = T.dispatch_sites[0];
  assert.deepEqual({company:s.company,site_key:s.site_key,customer_id:s.customer_id,customer:s.customer,addr:s.addr,city:s.city,hub:s.hub,code_raw:s.code_raw,code:s.code,gate_code:s.gate_code,receiving_hours:s.receiving_hours,site_label:s.site_label,updated_by:s.updated_by,last_verified:s.last_verified},
    {company:'adchem',site_key:'ADC-0001 — Primary',customer_id:c.id,customer:'Type 7 Manufacturing',addr:'100 Main St',city:'Oakland',hub:'EB',code_raw:'',code:null,gate_code:'4321',receiving_hours:'7–11am',site_label:'Primary',updated_by:'u1',last_verified:null});
  assert.ok(s.synced_at && !isNaN(Date.parse(s.synced_at)), 'synced_at set');
  assert.equal(T.dispatch_site_hub_notes.length, 1, 'only the hub with a note is written');
  const hn = T.dispatch_site_hub_notes[0];
  assert.deepEqual({hub:hn.hub,scale_on_route:hn.scale_on_route,route_notes:hn.route_notes,site_key:hn.site_key,company:hn.company},
    {hub:'EB',scale_on_route:true,route_notes:'Scale on 580',site_key:'ADC-0001 — Primary',company:'adchem'});
  assert.equal(await page.$eval('#siteNew',e=>e.hidden), true, 'new site form closes after saving');
  const sf = '#siteList form[data-site="ADC-0001 — Primary"]';
  assert.match(await page.$eval(sf,e=>e.id), /^s_[a-z0-9]+$/, 'site form id is s_ + hash');
  assert.equal(await page.inputValue(sf+' [data-k=gate_code]'), '4321');
  assert.equal(await page.inputValue(sf+' [data-hubnote=EB] [data-n=scale_on_route]'), 'yes', 'hub note read back');
  assert.equal(await page.inputValue(sf+' [data-hubnote=LA] [data-n=scale_on_route]'), '', 'other hubs unknown');
  assert.equal(await badge(), 9, 'a site with an address counts toward completeness');
  // edit the site: one field changes, one audit row with that field only
  const sl = T.dispatch_log.length;
  await page.fill(sf+' [data-k=special_instructions]','Dock B'); await page.click(sf+' [data-save-site]'); await page.waitForTimeout(700);
  assert.equal(T.dispatch_sites.length, 1, 'site edit updates'); assert.equal(T.dispatch_sites[0].special_instructions, 'Dock B');
  assert.deepEqual(T.dispatch_log.slice(sl).map(l=>[l.table_name,l.row_id,l.changes]), [['dispatch_sites','ADC-0001 — Primary',{special_instructions:{from:'',to:'Dock B'}}]], 'site edit audited, hub notes untouched');
  // a label with a comma keeps it in the key (the import builds the same key); its hub notes and history still resolve
  await page.click('#btnAddSite'); await page.waitForTimeout(150);
  await page.fill('#siteNew [data-k=site_label]','Plant 2, Dock B'); await page.fill('#siteNew [data-k=addr]','200 Side St'); await page.fill('#siteNew [data-k=city]','San Leandro');
  await page.fill('#siteNew [data-hubnote=LA] [data-n=route_notes]','Via 880');
  await page.click('#siteNew [data-save-site]'); await page.waitForTimeout(800);
  assert.equal(T.dispatch_sites.length, 2);
  assert.equal(T.dispatch_sites[1].site_key, 'ADC-0001 — Plant 2, Dock B', 'key is customer_id — label, exactly');
  assert.deepEqual(T.dispatch_site_hub_notes.filter(n=>n.site_key==='ADC-0001 — Plant 2, Dock B').map(n=>[n.hub,n.route_notes,n.scale_on_route]), [['LA','Via 880',null]]);
  const sf2 = '#siteList form[data-site="ADC-0001 — Plant 2, Dock B"]';
  assert.equal(await page.inputValue(sf2+' [data-hubnote=LA] [data-n=route_notes]'), 'Via 880', 'hub note read back for a comma key');
  assert.equal(await page.inputValue(sf+' [data-hubnote=EB] [data-n=route_notes]'), 'Scale on 580', 'first site unaffected');
  // contacts: receiving with phone, billing with email
  await page.click('#ctab-contacts'); await page.waitForTimeout(400);
  const b0 = await badge();
  await page.click('#btnAddContact'); await page.waitForTimeout(100);
  await page.selectOption('#cf_type','receiving'); await page.fill('#cf_first','Sam'); await page.fill('#cf_last','Ortiz'); await page.fill('#cf_phone','(510) 555-0101');
  await page.selectOption('#cf_method','phone'); await page.selectOption('#cf_site','ADC-0001 — Primary');
  await page.click('#cfSave'); await page.waitForTimeout(700);
  await page.click('#btnAddContact'); await page.waitForTimeout(100);
  assert.equal(await page.inputValue('#cf_first'), '', 'form cleared for the next contact');
  await page.selectOption('#cf_type','billing'); await page.fill('#cf_first','Pat'); await page.fill('#cf_email','ap@type7.example'); await page.check('#cf_cc'); await page.fill('#cf_notes','Statements monthly');
  await page.click('#cfSave'); await page.waitForTimeout(700);
  assert.equal(T.dispatch_contacts.length, 2);
  assert.ok(coCalls().slice(-2).every(x=>JSON.stringify(x)===JSON.stringify(['customers-out',{customerIds:[c.id]}])), 'each contact save rewrites the customer\'s rows');
  const sam = T.dispatch_contacts.find(x=>x.first_name==='Sam'), pat = T.dispatch_contacts.find(x=>x.first_name==='Pat');
  assert.deepEqual({company:sam.company,customer_id:sam.customer_id,type:sam.type,last:sam.last_name,phone:sam.phone,method:sam.preferred_method,site:sam.site_key,active:sam.active,cc:sam.cc_on_statements},
    {company:'adchem',customer_id:c.id,type:'receiving',last:'Ortiz',phone:'(510) 555-0101',method:'phone',site:'ADC-0001 — Primary',active:true,cc:false});
  assert.deepEqual({type:pat.type,email:pat.email,method:pat.preferred_method,site:pat.site_key,cc:pat.cc_on_statements,notes:pat.notes},
    {type:'billing',email:'ap@type7.example',method:null,site:null,cc:true,notes:'Statements monthly'});
  assert.equal(await page.$eval('#contactList a[href^="tel:"]',e=>e.getAttribute('href')), 'tel:5105550101');
  assert.equal(await page.$eval('#contactList a[href^="mailto:"]',e=>e.getAttribute('href')), 'mailto:ap@type7.example');
  assert.deepEqual(await page.$$eval('#contactList [data-ctype]',e=>e.map(x=>x.getAttribute('data-ctype'))), ['receiving','billing'], 'grouped by type in order');
  assert.match(flat(await page.textContent('#contactList')), /Sam Ortiz.*Pat/);
  assert.equal(await badge(), b0+2, 'receiving phone and billing email each count');
  await page.click(`#contactList [data-deact="${pat.id}"]`); await page.waitForTimeout(600);
  assert.equal(pat.active, false, 'deactivated'); assert.match(flat(await page.textContent(`#contactList [data-contact="${pat.id}"]`)), /inactive/);
  await page.click(`#contactList [data-deact="${pat.id}"]`); await page.waitForTimeout(600);
  assert.equal(pat.active, true, 'reactivated');
  // activity: a note, then pending driver notes approved / rejected
  await page.click('#ctab-activity'); await page.waitForTimeout(400);
  assert.match(flat(await page.textContent('#actList')), /No activity yet/);
  await page.selectOption('#act_method','call'); await page.fill('#act_summary','Confirmed Tuesday delivery'); await page.selectOption('#act_contact',sam.id);
  await page.click('#actAdd button[type=submit]'); await page.waitForTimeout(700);
  assert.equal(T.dispatch_customer_activity.length, 1);
  const a0 = T.dispatch_customer_activity[0];
  assert.deepEqual({kind:a0.kind,status:a0.status,logged_by:a0.logged_by,method:a0.method,summary:a0.summary,contact_id:a0.contact_id,customer_id:a0.customer_id,company:a0.company},
    {kind:'note',status:'approved',logged_by:'u1',method:'call',summary:'Confirmed Tuesday delivery',contact_id:sam.id,customer_id:c.id,company:'adchem'});
  assert.equal(await page.inputValue('#act_summary'), '', 'summary cleared');
  assert.match(flat(await page.textContent('#actList')), /Call.*Confirmed Tuesday delivery/);
  const old = new Date(Date.now()-86400000).toISOString();
  T.dispatch_customer_activity.push({id:'a-drv-1',company:'adchem',customer_id:c.id,occurred_at:old,method:'app',summary:'Gate code changed to 5555',kind:'driver_note',status:'pending',logged_by:'u2',reviewed_by:null,reviewed_at:null,rejection_reason:null},
    {id:'a-drv-2',company:'adchem',customer_id:c.id,occurred_at:old,method:'app',summary:'Dog in the yard',kind:'driver_note',status:'pending',logged_by:'u2',reviewed_by:null,reviewed_at:null,rejection_reason:null});
  await page.click('#ctab-history'); await page.click('#ctab-activity'); await page.waitForTimeout(500);
  assert.equal(await page.$$eval('#actList [data-approve]',e=>e.length), 2, 'approve buttons for a super admin');
  assert.ok(await page.$eval('#actList .act-row',e=>!!e.querySelector('[data-approve]')), 'pending notes first, though older');
  await page.click('#actList [data-approve="a-drv-1"]'); await page.waitForTimeout(600);
  const d1 = T.dispatch_customer_activity.find(x=>x.id==='a-drv-1');
  assert.deepEqual({status:d1.status,reviewed_by:d1.reviewed_by,reason:d1.rejection_reason}, {status:'approved',reviewed_by:'u1',reason:null}); assert.ok(d1.reviewed_at);
  page.once('dialog', dlg=>dlg.accept('Not our yard'));
  await page.click('#actList [data-reject="a-drv-2"]'); await page.waitForTimeout(600);
  const d2 = T.dispatch_customer_activity.find(x=>x.id==='a-drv-2');
  assert.deepEqual({status:d2.status,reviewed_by:d2.reviewed_by,reason:d2.rejection_reason}, {status:'rejected',reviewed_by:'u1',reason:'Not our yard'});
  assert.equal(await page.$$eval('#actList [data-approve]',e=>e.length), 0, 'no pending notes left');
  assert.match(flat(await page.textContent('#actList')), /rejected.*Not our yard/);
  // history
  await page.click('#ctab-history'); await page.waitForTimeout(600);
  const hist = flat(await page.textContent('#histList'));
  assert.match(hist, /billing_zip: 94601 → 94607/);
  assert.match(hist, /Primary.*gate_code: — → 4321/, 'site insert in history');
  assert.match(hist, /special_instructions: → Dock B|special_instructions: — → Dock B/, 'site edit in history');
  assert.match(hist, /route_notes: — → Scale on 580/, 'hub note in history');
  assert.match(hist, /site ADC-0001 — Plant 2, Dock B › addr: — → 200 Side St/, 'comma-key site in history');
  assert.match(hist, /site ADC-0001 — Plant 2, Dock B › hub LA › route_notes: — → Via 880/, 'comma-key hub note in history');
  assert.match(hist, /active: true → false/, 'contact change in history');
  assert.match(hist, /status: pending → rejected/, 'activity review in history');
  assert.ok(await page.$$eval('#histList .hist-line',e=>e.every(x=>/ · /.test(x.textContent))), 'when · who · change lines');
  // ---------- Setup: Customers Out card — save the link, rebuild; a failed write warns but never blocks the save ----------
  await page.click('#tab-setup'); await page.waitForTimeout(400);
  assert.match(flat(await page.textContent('#customersOutState')), /Customers Out is set/);
  assert.equal(await page.inputValue('#sCustomersOut'), '1COUTseedAAAAAAAAAAAAAA');
  await page.fill('#sCustomersOut','https://docs.google.com/spreadsheets/d/1CustomersOutSheetIdXYZ_abc/edit#gid=0');
  await page.click('#btnSaveCustomersOut'); await page.waitForTimeout(600);
  assert.equal(T.dispatch_company_settings[0].data.customersOutSheetId, '1CustomersOutSheetIdXYZ_abc', 'the ID, not the link, is saved');
  assert.equal(T.dispatch_company_settings[0].data.ordersOutSheetId, '1OUT', 'Orders Out untouched');
  page.once('dialog', dlg=>dlg.accept());
  await page.click('#btnRebuildCustomersOut'); await page.waitForTimeout(600);
  assert.deepEqual(coCalls().slice(-1), [['customers-out',{rebuild:true}]]);
  assert.match(flat(await page.textContent('body')), /Customers Out rebuilt.*1 rows written/);
  // a sheet failure on save: banner, data still saved
  await page.route('**/api/customers-out', r=>r.fulfill({status:502,contentType:'application/json',body:JSON.stringify({error:{code:'google',message:'Customers Out: The caller does not have permission'}})}));
  await page.click('#tab-customers'); await page.waitForTimeout(300);
  assert.equal(await page.$eval('#custPage',e=>e.hidden), false, 'customer still open'); await page.click('#ctab-profile'); await page.waitForTimeout(200);
  await page.fill('#cAka','T7'); await page.click('#btnSaveCustomer'); await page.waitForTimeout(800);
  assert.equal(T.dispatch_customers[0].also_known_as, 'T7', 'the save went through');
  assert.match(flat(await page.textContent('body')), /Customers Out not updated.*does not have permission.*The change is saved/);
  await page.unroute('**/api/customers-out');
  // no sheet set: saves do not call the writer at all
  T.dispatch_company_settings[0].data.customersOutSheetId = '';
  await page.evaluate(()=>{ state.settings.customersOutSheetId=''; });
  const nNo = coCalls().length; await page.fill('#cAka','T-7'); await page.click('#btnSaveCustomer'); await page.waitForTimeout(700);
  assert.equal(coCalls().length, nNo, 'no Customers Out call without a sheet');
  await page.click('#btnCloseCustomer'); await page.waitForTimeout(200);
  // ---------- People: per-member permissions and super admin, written through the RPCs ----------
  T.dispatch_users.push({user_id:'u2',email:'casey@adchem.pro',name:'Casey',active:true});
  T.dispatch_members.push({user_id:'u2',company:'adchem',role:'coordinator',hub:'',active:true,is_super_admin:false,permissions:{}});
  await page.click('#tab-users'); await page.waitForTimeout(500);
  assert.match(flat(await page.textContent('#panel-users')), /Drivers: one account per person, with their hub\./);
  assert.doesNotMatch(flat(await page.textContent('#panel-users')), /one account per hub/);
  assert.deepEqual(await page.$$eval('[data-perm^="u2:"]',e=>e.map(x=>x.getAttribute('data-perm'))), ['u2:manage_customers','u2:approve_driver_notes','u2:run_imports','u2:manage_people']);
  assert.equal(await page.$eval('[data-perm="u2:manage_customers"]',e=>e.checked), false);
  await page.check('[data-perm="u2:manage_customers"]'); await page.waitForTimeout(600);
  const u2 = () => T.dispatch_members.find(x=>x.user_id==='u2'&&x.company==='adchem');
  assert.deepEqual(u2().permissions, {manage_customers:true,approve_driver_notes:false,run_imports:false,manage_people:false}, 'permissions written through dispatch_set_permissions');
  assert.equal(await page.$eval('[data-perm="u2:manage_customers"]',e=>e.checked), true, 're-rendered from the database');
  assert.equal(await page.$eval('[data-super="u2"]',e=>e.checked), false);
  await page.check('[data-super="u2"]'); await page.waitForTimeout(600);
  assert.equal(u2().is_super_admin, true, 'super admin written through dispatch_set_super_admin');
  assert.equal(await page.$eval('[data-super="u2"]',e=>e.checked), true);
  assert.equal(await page.$eval('[data-super="u1"]',e=>e.checked), true, 'the signed-in super admin shows as one');
  // a plain admin: permission switches, no super admin switches
  { const savedMembers = T.dispatch_members.slice();
    const pa = await newPage(b, base, {members:[{user_id:'u1',company:'adchem',role:'admin',hub:'',active:true,is_super_admin:false,permissions:{}},
      {user_id:'u2',company:'adchem',role:'coordinator',hub:'',active:true,is_super_admin:false,permissions:{}}]}); pages.push(pa);
    await signIn(pa, base); await pa.click('#tab-users'); await pa.waitForTimeout(500);
    assert.equal(await pa.$$eval('[data-perm="u2:manage_customers"]',e=>e.length), 1, 'admin sees permission switches');
    assert.equal(await pa.$$eval('[data-super]',e=>e.length), 0, 'no super admin switches for a plain admin');
    T.dispatch_members = savedMembers; }
  // a pending note for the permission checks below
  T.dispatch_customer_activity.push({id:'a-drv-3',company:'adchem',customer_id:c.id,occurred_at:old,method:'app',summary:'Forklift broken',kind:'driver_note',status:'pending',logged_by:'u2',reviewed_by:null,reviewed_at:null,rejection_reason:null});
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
    await p.click('#ctab-sites'); await p.waitForTimeout(400);
    assert.equal(await p.$eval('#btnAddSite',e=>e.disabled), !enabled, 'add site '+JSON.stringify(perms));
    assert.equal(await p.$eval('#siteList [data-save-site]',e=>e.disabled), !enabled, 'save site '+JSON.stringify(perms));
    await p.click('#ctab-contacts'); await p.waitForTimeout(400);
    assert.equal(await p.$eval('#btnAddContact',e=>e.disabled), !enabled, 'add contact '+JSON.stringify(perms));
    assert.equal(await p.$$eval('#contactList [data-deact]',e=>e.length), enabled?2:0, 'deactivate buttons '+JSON.stringify(perms));
    await p.click('#ctab-activity'); await p.waitForTimeout(400);
    assert.match(flat(await p.textContent('#actList')), /Forklift broken/, 'pending note visible');
    assert.equal(await p.$$eval('#actList [data-approve],#actList [data-reject]',e=>e.length), 0, 'no review buttons without approve_driver_notes');
    assert.equal(await p.$eval('#actAdd button[type=submit]',e=>e.disabled), !enabled, 'add note '+JSON.stringify(perms));
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
  for (const t of ['sites','contacts','activity','history']) { await m.click('#ctab-'+t); await m.waitForTimeout(400); assert.equal(await m.$eval('#cpane-'+t,e=>e.hidden), false, t+' pane shown'); assert.equal(await m.$eval('#cpane-profile',e=>e.hidden), true);
    assert.equal(await m.evaluate(()=>document.documentElement.scrollWidth), 390, 'no horizontal overflow with the '+t+' pane open'); }
  await m.click('#ctab-sites'); await m.click('#btnAddSite'); await m.waitForTimeout(100);
  assert.equal(await m.evaluate(()=>document.documentElement.scrollWidth), 390, 'no horizontal overflow with the new site form open');
  await m.click('#ctab-contacts'); await m.click('#btnAddContact'); await m.waitForTimeout(100);
  assert.equal(await m.evaluate(()=>document.documentElement.scrollWidth), 390, 'no horizontal overflow with the contact form open');
  await m.click('#ctab-profile'); await m.waitForTimeout(100); assert.equal(await m.$eval('#cpane-profile',e=>e.hidden), false);
  assert.equal(await m.evaluate(()=>document.documentElement.scrollWidth), 390, 'no horizontal overflow after switching tabs');
  // no page errors except the deliberate Customers Out 502
  assert.deepEqual(pages.flatMap(p=>p.errs).filter(e=>!/status of 502/.test(e)), [], 'unexpected page errors');
  assert.equal(page.errs.filter(e=>/status of 502/.test(e)).length, 1, 'the Customers Out failure case ran');
  } finally { await b.close(); await fake.stop(); }
})().then(()=>{ console.log('customers.test.cjs: ok'); }, e=>{ console.error(e); process.exit(1); });
