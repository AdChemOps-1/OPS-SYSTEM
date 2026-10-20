// Headless UI test: serves public/ with the shared fake backend (test/_fake.cjs), then drives the app through
// sign-in, orders per code, BOL, Today load checks and the photo-and-send flow. Every check is an assertion.
const assert = require('assert/strict'); const path = require('path'); const { execSync } = require('child_process');
const { chromium } = require('playwright');
const { makeFake, newPage } = require('./_fake.cjs');
const flat = s => s.replace(/\s+/g, ' ').trim();

(async()=>{
  const fake = makeFake(); const T = fake.T, calls = fake.calls; const base = await fake.start();
  const b = await chromium.launch(); const page = await newPage(b, base);
  try {
  await page.goto(base+'/'); await page.waitForTimeout(600);
  assert.equal(await page.$eval('#login',e=>e.hidden), false, 'login shown');
  await page.fill('#lEmail','jamie@adchem.pro'); await page.fill('#lPass','bad'); await page.click('#btnLogin'); await page.waitForTimeout(400);
  assert.equal(await page.$eval('#login',e=>e.hidden), false, 'bad login keeps the login screen');
  assert.equal(await page.$eval('#app',e=>e.hidden), true, 'bad login does not open the app');
  await page.fill('#lPass','correct-horse'); await page.click('#btnLogin'); await page.waitForTimeout(1200);
  assert.equal(await page.$eval('#app',e=>e.hidden), false, 'app shown');
  assert.equal(await page.textContent('#roleChip'), 'Admin');
  assert.equal(await page.$eval('#tab-users',e=>e.hidden), false, 'users tab visible to admin');
  // refresh feed
  await page.click('#tab-setup'); await page.waitForTimeout(300); await page.click('#btnRefreshFeed'); await page.waitForTimeout(800);
  const feed=flat(await page.textContent('#feedState'));
  assert.match(feed, /^6 delivery sites · 5 customers/); assert.match(feed, /COD 1/); assert.match(feed, /1 site still showing the billi/);
  assert.equal(await page.$$eval('.segtable td.X',e=>e.length), 104); assert.equal(await page.$$eval('.segtable td.O',e=>e.length), 44);
  // delivery calendars: EB picked from the list, LA pasted — first a calendar the server can only read, then the right one
  await page.selectOption('[data-hubcal="EB"]','calEB'); await page.waitForTimeout(150);
  await page.fill('[data-hubcalid="LA"]','calNO'); await page.dispatchEvent('[data-hubcalid="LA"]','change'); await page.waitForTimeout(150);
  await page.click('#btnConfirmCal'); await page.waitForTimeout(500);
  assert.equal(await page.evaluate(()=>state.settings.calendarConfirmed), false, 'read-only calendar blocks confirm');
  assert.match(flat(await page.$$eval('#banners .banner',e=>e[0]&&e[0].innerText)), /^Not confirmed — the server can't write to this calendar calNO Access is reader\./);
  await page.fill('[data-hubcalid="CO"]','calCO'); await page.dispatchEvent('[data-hubcalid="CO"]','change'); await page.waitForTimeout(150);
  await page.fill('[data-hubcalid="LA"]','calLA@group.calendar.google.com'); await page.dispatchEvent('[data-hubcalid="LA"]','change'); await page.waitForTimeout(150);
  await page.click('#btnConfirmCal'); await page.waitForTimeout(500);
  assert.equal(await page.evaluate(()=>state.settings.calendarConfirmed), true, 'confirmed');
  const calState=flat(await page.textContent('#calState'));
  assert.ok(/EB → Deliveries — East Bay/.test(calState)&&/LA → Deliveries — SoCal/.test(calState)&&/CO → Deliveries — Denver/.test(calState), calState);
  await (await page.$('#calState')).evaluate(e=>e.closest('.card').scrollIntoView()); await page.locator('#calState').locator('xpath=ancestor::div[contains(@class,"card")][1]').screenshot({path:path.join(__dirname,'shot-calendars.png')});
  assert.deepEqual(T.dispatch_company_settings[0].data.hubCalendars, {EB:{id:'calEB',name:'Deliveries — East Bay'},LA:{id:'calLA@group.calendar.google.com',name:'Deliveries — SoCal'},CO:{id:'calCO',name:'Deliveries — Denver'}});
  await page.click('#tab-new'); await page.waitForTimeout(200);
  async function newOrder(cust,opts){
    await page.fill('#fCustomer',''); await page.fill('#fCustomer',cust); await page.dispatchEvent('#fCustomer','input'); await page.waitForTimeout(250);
    if(opts.site) await page.selectOption('#fSite',{label:opts.site});
    if(opts.hub){ await page.selectOption('#fHub',opts.hub); await page.dispatchEvent('#fHub','change'); }
    if(opts.cat) await page.selectOption('[data-line="0"] [data-k="category"]',opts.cat);
    if(opts.prod) await page.selectOption('[data-line="0"] [data-k="product"]',opts.prod);
    if(opts.cont) await page.selectOption('[data-line="0"] [data-k="container"]',opts.cont);
    if(opts.qty) await page.fill('[data-line="0"] [data-k="qty"]',String(opts.qty));
    if(opts.line2){ await page.click('#btnAddLine'); await page.selectOption('[data-line="1"] [data-k="category"]',opts.line2.cat); await page.selectOption('[data-line="1"] [data-k="product"]',opts.line2.prod); await page.selectOption('[data-line="1"] [data-k="container"]',opts.line2.cont); await page.fill('[data-line="1"] [data-k="qty"]',String(opts.line2.qty)); if(opts.line2.lb) await page.fill('[data-line="1"] [data-k="unitLb"]',String(opts.line2.lb)); }
    if(opts.cod!=null) await page.fill('#fCod',String(opts.cod));
    if(opts.confirm) await page.check('#fAddrConfirm');
    if(opts.truck) await page.fill('#fTruck',opts.truck);
    if(opts.copyTo) await page.fill('#fCopyTo',opts.copyTo);
    await page.waitForTimeout(250);
    await page.click('#btnSubmit'); await page.waitForTimeout(900);
    const bn=await page.$$eval('#banners .banner',els=>els.slice(0,1).map(e=>e.innerText.replace(/\s+/g,' ').slice(0,110)));
    return bn[0]||'';
  }
  const T7=await newOrder('Type 7 Manufacturing',{cat:'Gases',prod:'Butane',cont:'120lb Cylinder',qty:6,truck:'Truck 1',copyTo:'sam@type7.example'});
  assert.match(T7, /^Order created · BOL 9450 EB-261020-01 — Type 7 Manufacturing, 6 × Butane \(120lb Cylinder\)/);
  assert.match(await newOrder('Bio-Rad',{cat:'Gases',prod:'Nitrogen',cont:'300cu ft Cylinder',qty:6,cod:640,confirm:true,truck:'Truck 1'}), /^Order created · BOL 9451 EB-261020-02 — Bio-Rad/);
  assert.match(await newOrder('VKGL Manufacturing LLC',{cat:'Gases',prod:'Butane',cont:'120lb Cylinder',qty:12}), /^Hold — not scheduled Order LA-261020-01 is recorded on hold\. No BOL number, no calendar event/);
  assert.match(await newOrder('Costa Cannabis',{cat:'Gases',prod:'Butane',cont:'120lb Cylinder',qty:6}), /^Waiting on accounting Order LA-261020-02 is saved but not scheduled\./);
  // a DO NOT LOAD product is refused outright; the same order with heptanes goes through
  assert.match(await newOrder('The Upside Group, Inc.',{site:'Shellmound plant — 6201 Shellmound St, Emeryville CA 94608',cat:'Dry Ice',prod:'Dry Ice - Pellet',cont:'Bin',qty:2,line2:{cat:'Solvents',prod:'Acetone',cont:'55gal Drum',qty:1,lb:400},truck:'Truck 2'}), /^Not saved yet Line 2 — Acetone has no verified hazmat data on file/);
  assert.equal(T.dispatch_orders.some(o=>o.customer==='The Upside Group, Inc.'), false, 'acetone order not saved');
  await page.selectOption('[data-line="1"] [data-k="product"]','Heptanes'); await page.waitForTimeout(200); await page.click('#btnSubmit'); await page.waitForTimeout(900);
  assert.ok(T.dispatch_orders.some(o=>o.id==='LA-261020-03'&&o.status==='Scheduled'), 'heptanes order saved');
  // Denver: limit the hub to two products on Setup, then an order for butane out of CO is refused and dry ice goes through
  await page.click('#tab-setup'); await page.waitForTimeout(300);
  await page.check('[data-hlimit="2"][value="some"]'); await page.waitForTimeout(150);
  await page.check('[data-hp="2"][value="Dry Ice|Dry Ice - Pellet"]'); await page.check('[data-hp="2"][value="Gases|Carbon Dioxide"]');
  await page.click('#btnSaveHubs'); await page.waitForTimeout(400);
  await page.locator('[data-hpcount="2"]').locator('xpath=ancestor::div[contains(@class,"card")][1]').screenshot({path:path.join(__dirname,'shot-hub-co.png')});
  assert.deepEqual(T.dispatch_hubs.filter(h=>h.code==='CO').map(h=>({tz:h.tz,products:h.products})), [{tz:'America/Denver',products:['Dry Ice|Dry Ice - Pellet','Gases|Carbon Dioxide']}]);
  assert.equal(await page.evaluate(()=>new Set(PRODUCTS.map(p=>prodKey(p.cat,p.name))).size===PRODUCTS.length), true, 'product keys unique');
  await page.click('#tab-new'); await page.waitForTimeout(200);
  assert.match(await newOrder('Type 7 Manufacturing',{hub:'CO',cat:'Gases',prod:'Butane',cont:'120lb Cylinder',qty:2}), /^Not saved yet Line 1 — Butane is not offered from Colorado — Denver \(CO\)\./);
  assert.deepEqual(await page.$$eval('#lineEditor .lb',e=>e.map(x=>x.innerText).filter(t=>/Not offered/.test(t))), ['Not offered from Colorado — Denver (CO)']);
  await page.selectOption('[data-line="0"] [data-k="category"]','Dry Ice'); await page.waitForTimeout(150); await page.fill('[data-line="0"] [data-k="qty"]','2'); await page.waitForTimeout(150);
  await page.click('#btnSubmit'); await page.waitForTimeout(900);
  const co=T.dispatch_orders.find(o=>o.id.startsWith('CO-'));
  assert.ok(co, 'CO order saved'); assert.equal(co.id, 'CO-261020-01'); assert.equal(co.data.tz, 'America/Denver'); assert.deepEqual(co.data.lines.map(l=>l.product), ['Dry Ice - Pellet']);
  assert.deepEqual(calls.filter(c=>c[0]==='calendar').slice(-1).map(c=>c[1]), [{hub:'CO',cal:'calCO',moved:false,update:false,tz:'America/Denver'}]);
  assert.deepEqual(T.dispatch_orders.map(o=>({id:o.id,co:o.company,bol:o.bol_no,status:o.status,code:o.data.effCode,addr:o.data.addrState,cod:o.data.codAmount})), [
    {id:'EB-261020-01',co:'adchem',bol:9450,status:'Scheduled',code:'D',addr:'sheet',cod:0},
    {id:'EB-261020-02',co:'adchem',bol:9451,status:'Scheduled',code:'COD',addr:'confirmedNow',cod:640},
    {id:'LA-261020-01',co:'adchem',bol:null,status:'On Hold',code:'H',addr:'sheet',cod:0},
    {id:'LA-261020-02',co:'adchem',bol:null,status:'Awaiting accounting',code:'CHECK',addr:'sheet',cod:0},
    {id:'LA-261020-03',co:'adchem',bol:9452,status:'Scheduled',code:'D',addr:'sheet',cod:0},
    {id:'CO-261020-01',co:'adchem',bol:9453,status:'Scheduled',code:'D',addr:'sheet',cod:0}]);
  assert.deepEqual(calls.filter(c=>c[0]==='orderlog').map(c=>c[1].orderIds), [['EB-261020-01'],['EB-261020-02'],['LA-261020-03'],['CO-261020-01']]);
  // orders link to the Ops customer through the chosen site; an Ops-only customer (no feed row) saves as CHECK
  const ordersBefore=T.dispatch_orders.length;
  const u7='00000000-0000-4000-8000-000000000007', u8='00000000-0000-4000-8000-000000000008', u9='00000000-0000-4000-8000-000000000009';
  T.dispatch_customers.push({id:u7,customer_id:'ADC-0007',company:'adchem',name:'VKGL Manufacturing LLC'},{id:u8,customer_id:'ADC-0008',company:'adchem',name:'VKGL Manufacturing - LA'},{id:u9,customer_id:'ADC-0009',company:'adchem',name:'Ops Only Plastics'});
  T.dispatch_sites.find(s=>s.company==='adchem'&&s.site_key==='VKGL — Primary').customer_id=u7;
  T.dispatch_sites.push({company:'adchem',site_key:'VKGL LA — Plant',customer:'VKGL Manufacturing LLC',code_raw:'',code:null,addr:'1 Plant Rd, Carson CA 90745',hub:'LA',site_label:'LA Plant',customer_id:u8,synced_at:new Date().toISOString()},
    {company:'adchem',site_key:'Ops Only Plastics — Primary',customer:'Ops Only Plastics',code_raw:'',code:null,addr:'9 Ops Way, Hayward CA 94545',hub:'EB',site_label:'Primary',customer_id:u9,synced_at:new Date().toISOString()});
  await page.evaluate(async()=>{ state.customers=await CDB.customers(); await loadSitesFromDb(); });
  const lst=await page.$$eval('#customerList option',o=>o.map(x=>x.value));
  assert.ok(lst.includes('Ops Only Plastics')&&lst.includes('VKGL Manufacturing - LA'), 'datalist shows Ops customers');
  assert.equal(new Set(lst.map(x=>x.toLowerCase())).size, lst.length, 'datalist is deduplicated');
  await newOrder('VKGL Manufacturing LLC',{site:'LA Plant — 1 Plant Rd, Carson CA 90745',cat:'Gases',prod:'Butane',cont:'120lb Cylinder',qty:3});
  const oLA=T.dispatch_orders.slice(ordersBefore)[0];
  assert.ok(oLA, 'VKGL LA order saved'); assert.equal(oLA.data.customerNo,'ADC-0008'); assert.equal(oLA.data.customerId,u8); assert.equal(oLA.data.siteKey,'VKGL LA — Plant');
  await newOrder('Ops Only Plastics',{cat:'Gases',prod:'Butane',cont:'120lb Cylinder',qty:2});
  const oOps=T.dispatch_orders.slice(ordersBefore)[1];
  assert.ok(oOps, 'Ops-only order saved'); assert.equal(oOps.data.customerNo,'ADC-0009'); assert.equal(oOps.data.customerId,u9); assert.equal(oOps.data.effCode,'CHECK');
  // (a) a typed customer with no site at all resolves by exact name; (b) two same-name customers with no linked site stay unlinked
  T.dispatch_customers.push({id:'00000000-0000-4000-8000-000000000010',customer_id:'ADC-0010',company:'adchem',name:'Typed Only Co'},{id:'00000000-0000-4000-8000-000000000011',customer_id:'ADC-0011',company:'adchem',name:'Twin Co'},{id:'00000000-0000-4000-8000-000000000012',customer_id:'ADC-0012',company:'adchem',name:'Twin Co'});
  await page.evaluate(async()=>{ state.customers=await CDB.customers(); fillAccounts(); });
  const link=async n=>{ await page.fill('#fCustomer',n); await page.dispatchEvent('#fCustomer','input'); await page.waitForTimeout(200); return page.evaluate(()=>{var d=draftOrderFromForm();return [d.customerNo,d.customerId];}); };
  assert.deepEqual(await link('Typed Only Co'), ['ADC-0010','00000000-0000-4000-8000-000000000010']);
  assert.deepEqual(await link('Twin Co'), ['',null]);
  await page.fill('#fCustomer',''); await page.dispatchEvent('#fCustomer','input');
  // (c) an edit-save round trip keeps the link, even when the stored site no longer resolves
  const rt=await page.evaluate(async id=>{ var o=state.orders.find(x=>x.id===id); startEdit(o); await saveEdit(); var n=state.orders.find(x=>x.id===id); return [n.customerNo,n.customerId,n.rev]; }, oLA.id);
  assert.deepEqual(rt.slice(0,2), ['ADC-0008',u8]); assert.equal(rt[2], 2, 'edit saved');
  const rt2=await page.evaluate(async id=>{ var o=state.orders.find(x=>x.id===id); o.siteKey='gone'; startEdit(o); await saveEdit(); var n=state.orders.find(x=>x.id===id); return [n.customerNo,n.customerId,n.rev]; }, oLA.id);
  assert.deepEqual(rt2.slice(0,2), ['ADC-0008',u8]); assert.equal(rt2[2], 3, 'edit saved');
  assert.equal(await page.$eval('#coPick',e=>e.hidden), false, 'company picker shown');
  assert.deepEqual(await page.$$eval('#coPick option',o=>o.map(x=>x.textContent)), ['AdChem','Northstar']);
  assert.deepEqual(calls.filter(c=>c[0]==='calendar').map(c=>c[1].cal), ['calEB','calEB','calLA@group.calendar.google.com','calCO']);
  // an order moved from EB to LA moves its event to the SoCal calendar
  const mv=await page.evaluate(async()=>{ var o=state.orders.find(function(x){return x.id.indexOf('EB-')===0&&x.customer==='Type 7 Manufacturing';}); var before=o.eventCal; o.hub='LA'; var ok=await updateCalendarEvent(o); var r={before:before,after:o.eventCal,ok:ok}; o.hub='EB'; await updateCalendarEvent(o); r.back=o.eventCal; return r; });
  assert.deepEqual(mv, {before:'calEB',after:'calLA@group.calendar.google.com',ok:true,back:'calEB'});
  assert.deepEqual(calls.filter(c=>c[0]==='calendar').slice(-2).map(c=>[c[1].cal,c[1].moved,c[1].update]), [['calLA@group.calendar.google.com',true,true],['calEB',true,true]]);
  assert.equal(T.dispatch_sites.find(s=>s.customer==='Type 7 Manufacturing').copy_to, 'sam@type7.example');
  // Today: load checks
  await page.click('#tab-today'); await page.waitForTimeout(400);
  const flags=await page.$$eval('.flagline',els=>els.map(e=>e.innerText.replace(/\s+/g,' ')));
  assert.equal(flags.length, 4);
  assert.match(flags[0], /^✓ Placards — NONE Dry ice only — not regulated by highway\. Do not placard \(49 CFR 172\.502\)\./);
  assert.match(flags[1], /^– Placarded load — PLACARDS REQUIRED This truck carries 2,040 lb of Table 2 material/);
  assert.match(flags[2], /^i Cylinders Secured upright or braced/);
  assert.match(flags[3], /^✓ Placards — NOT BY THIS TRUCK 400 lb of Table 2 material \(FLAMMABLE 400 lb\)/);
  await page.screenshot({path:path.join(__dirname,'shot-today.png'),fullPage:true});
  // Morning Driver Sheet: render the HTML the button prints, as a PDF
  const dsHtml=await page.evaluate(()=>driverSheetHtml(document.getElementById('tDate').value));
  const ds=await b.newPage(); await ds.setContent(dsHtml.replace(/<script>[\s\S]*?<\/script>/,''),{waitUntil:'load'}); await ds.emulateMedia({media:'print'});
  await ds.pdf({path:path.join(__dirname,'driver-sheet.pdf'),format:'Letter',printBackground:true,margin:{top:'0.4in',bottom:'0.4in',left:'0.4in',right:'0.4in'}}); await ds.close();
  assert.equal((dsHtml.match(/class="page"/g)||[]).length, 3, 'driver sheet pages'); assert.equal((dsHtml.match(/class="cod"/g)||[]).length, 1, 'COD rows');
  // POD flow on Type 7
  const t7=T.dispatch_orders.find(o=>o.customer==='Type 7 Manufacturing');
  await page.fill('#tDriver','Omari');
  await page.click(`[data-pod="${t7.id}"]`); await page.waitForTimeout(200);
  assert.equal(await page.inputValue('#podCc'), 'sam@type7.example', 'pod cc prefilled');
  execSync("python3 -c \"from PIL import Image; Image.new('RGB',(2400,3000),'white').save('/tmp/fake-bol.jpg',quality=85)\"");
  await page.setInputFiles('#podFile','/tmp/fake-bol.jpg'); await page.waitForTimeout(800);
  await page.click('#podSend'); await page.waitForTimeout(1200);
  assert.match(flat(await page.textContent('#podStatus')), /^Sent\. The signed BOL went to orders@adchem\.pro and the customer's copy to sam@type7\.example\./);
  const podCalls=calls.filter(c=>c[0]==='pod').map(c=>({orderId:c[1].orderId,company:c[1].company,photoDir:c[1].photoPath.replace(/[^/]*$/,''),cc:c[1].cc,driver:c[1].driver,collected:c[1].collected}));
  assert.deepEqual(podCalls, [{orderId:'EB-261020-01',company:'adchem',photoDir:'adchem/EB/pod/EB-261020-01/',cc:['sam@type7.example'],driver:'Omari',collected:0}]);
  assert.equal(t7.status, 'Delivered');
  await page.click('#podDone'); await page.waitForTimeout(200);
  // failure -> queue. Gmail returns 502; that one browser console error is expected
  fake.setGmailFail('google'); const br=T.dispatch_orders.find(o=>o.customer==='Bio-Rad');
  await page.click(`[data-pod="${br.id}"]`); await page.waitForTimeout(200); await page.setInputFiles('#podFile','/tmp/fake-bol.jpg'); await page.waitForTimeout(800); await page.click('#podSend'); await page.waitForTimeout(800);
  assert.match(flat(await page.textContent('#podStatus')), /^Not sent\. Gmail: boom You can still use Share another way/);
  await page.click('#podClose');
  // People tab
  await page.click('#tab-users'); await page.waitForTimeout(400);
  await page.fill('#uEmail','driver-eb@adchem.pro'); await page.selectOption('#uRole','driver'); await page.selectOption('#uHub','EB'); await page.click('#btnGrant'); await page.waitForTimeout(500);
  const people=flat(await page.textContent('#userList'));
  assert.ok(/Jamie.*jamie@adchem\.pro.*admin/.test(people), people); assert.ok(/driver-eb@adchem\.pro.*driver EB.*invited — not yet signed up/.test(people), people);
  assert.equal(T.dispatch_invites.length, 1); assert.equal(T.dispatch_invites[0].email, 'driver-eb@adchem.pro');
  // switch to the second company: nothing of AdChem's shows
  await page.selectOption('#coPick','north'); await page.waitForTimeout(900);
  assert.deepEqual(await page.evaluate(()=>({orders:state.orders.length,hubs:state.hubs.length,role:state.role,shipper:coName()})), {orders:0,hubs:0,role:'coordinator',shipper:'Northstar Gas Co.'});
  await page.selectOption('#coPick','adchem'); await page.waitForTimeout(900);
  assert.equal(await page.evaluate(()=>state.orders.length), 8, 'back on AdChem');
  // print BOL one page
  await page.click('#tab-open'); await page.waitForTimeout(300); await page.click(`[data-bol="${br.id}"]`); await page.waitForTimeout(300);
  await page.emulateMedia({media:'print'}); await page.pdf({path:path.join(__dirname,'bol.pdf'),format:'Letter',printBackground:true,margin:{top:'0.4in',bottom:'0.4in',left:'0.4in',right:'0.4in'}}); await page.emulateMedia({media:'screen'});
  // site notes for the driver: Type 7's site gets its customer, gate code and hours; a receiving and a billing contact; EB and LA hub notes
  T.dispatch_customers.push({id:'c-t7',company:'adchem',customer_id:'ADC-0001',name:'Type 7 Manufacturing',account_status:'active',primary_hub:'EB'});
  Object.assign(T.dispatch_sites.find(s=>s.company==='adchem'&&s.site_key==='Type 7 — Primary'),{customer_id:'c-t7',gate_code:'4321',receiving_hours:'7–11am',parking_unloading:'Back in at dock B',hazmat_restrictions:'',container_notes:'Return empties to the cage',special_instructions:'',last_verified:null});
  T.dispatch_contacts.push({id:'ct-recv',company:'adchem',customer_id:'c-t7',site_key:'Type 7 — Primary',type:'receiving',first_name:'Sam',last_name:'Ortiz',phone:'(510) 555-0101',email:'',active:true},
    {id:'ct-bill',company:'adchem',customer_id:'c-t7',site_key:'Type 7 — Primary',type:'billing',first_name:'Pat',last_name:'Lee',phone:'(510) 555-0999',email:'ap@type7.example',active:true});
  T.dispatch_site_hub_notes.push({company:'adchem',site_key:'Type 7 — Primary',hub:'EB',scale_on_route:true,route_notes:'Scale on 580 — take the 24 bypass'},
    {company:'adchem',site_key:'Type 7 — Primary',hub:'LA',scale_on_route:false,route_notes:'LA only route note'});
  // mobile driver view
  const m=await newPage(b,base,{viewport:{width:390,height:844},members:[{user_id:'u1',company:'adchem',role:'driver',hub:'EB',active:true}]});
  await m.goto(base+'/'); await m.waitForTimeout(400); await m.fill('#lEmail','driver-eb@adchem.pro'); await m.fill('#lPass','correct-horse'); await m.click('#btnLogin'); await m.waitForTimeout(1000);
  assert.equal(await m.evaluate(()=>state.tab), 'today'); assert.equal(await m.$eval('#tab-new',e=>e.hidden), true, 'new-order tab hidden for driver');
  assert.equal(await m.evaluate(()=>document.documentElement.scrollWidth), 390, 'no horizontal overflow'); assert.equal((await m.$$eval('.stop',e=>e.length)), 3);
  await m.screenshot({path:path.join(__dirname,'shot-driver.png'),fullPage:true});
  // the Type 7 stop carries the site notes, this hub's route note and the receiving contact — not the billing contact or another hub's note
  const stop1=()=>m.$eval('#todayList .stop',e=>e.textContent.replace(/\s+/g,' '));
  const s1=await stop1();
  assert.match(s1, /Type 7 Manufacturing/); assert.match(s1, /4321/); assert.match(s1, /7–11am/); assert.match(s1, /Scale on 580 — take the 24 bypass/); assert.match(s1, /Back in at dock B/); assert.match(s1, /Return empties to the cage/);
  assert.doesNotMatch(s1, /LA only route note/); assert.doesNotMatch(s1, /555-0999|ap@type7/);
  assert.deepEqual(await m.$eval('#todayList .stop',e=>[...e.querySelectorAll('a[href^="tel:"]')].map(a=>a.getAttribute('href'))), ['tel:5105550101']);
  assert.equal(await m.$eval('#todayList .stop [data-note]',e=>e.getAttribute('data-note')), 'Type 7 — Primary');
  m.once('dialog', dlg=>dlg.accept('Gate moved to the north side'));
  await m.click('#todayList .stop [data-note]'); await m.waitForTimeout(800);
  const dn=T.dispatch_customer_activity.filter(a=>a.kind==='driver_note');
  assert.deepEqual(dn.map(a=>({kind:a.kind,status:a.status,logged_by:a.logged_by,method:a.method,site_key:a.site_key,customer_id:a.customer_id,summary:a.summary,company:a.company})),
    [{kind:'driver_note',status:'pending',logged_by:'u1',method:'app',site_key:'Type 7 — Primary',customer_id:'c-t7',summary:'Gate moved to the north side',company:'adchem'}]);
  assert.match(await stop1(), /Gate moved to the north side.*pending/, 'own note listed with its status');
  assert.equal(await m.evaluate(()=>document.documentElement.scrollWidth), 390, 'no horizontal overflow with site notes');
  // deposit slip from the driver's phone
  await m.click('#btnDeposit'); await m.waitForTimeout(200); await m.setInputFiles('#depFile','/tmp/fake-bol.jpg'); await m.waitForTimeout(800);
  await m.fill('#depAmount','1240.50'); await m.fill('#depNote','Chase Richmond'); await m.click('#depSend'); await m.waitForTimeout(1200);
  assert.match(flat(await m.textContent('#depStatus')), /^Sent\. The deposit slip went to accounting@adchem\.pro for \$1,240\.50\./);
  assert.deepEqual(calls.filter(c=>c[0]==='deposit').map(c=>({hub:c[1].hub,driver:c[1].driver,amount:c[1].amount,note:c[1].note,photoDir:c[1].photoPath.replace(/[^/]*$/,'')})), [{hub:'EB',driver:'Jamie',amount:1240.5,note:'Chase Richmond',photoDir:'adchem/EB/deposits/'}]);
  // the same person is also a driver at a second company (north, LA). North has its own 'Type 7 — Primary' site (same key, other values)
  // and two Type 7 orders at LA — one with the site key, one without (customer + hub fallback). After switching, no AdChem EB extras show, even on the first render.
  T.dispatch_members=[{user_id:'u1',company:'adchem',role:'driver',hub:'EB',active:true},{user_id:'u1',company:'north',role:'driver',hub:'LA',active:true}];
  T.dispatch_sites.push({company:'north',site_key:'Type 7 — Primary',customer:'Type 7 Manufacturing',code_raw:'D - Deliver; no holds',code:'D',addr:'9 North Rd, Long Beach CA 90813',city:'Long Beach',hub:'LA',site_label:'Primary',customer_id:'c-n7',gate_code:'9999',receiving_hours:'1–3pm',synced_at:new Date().toISOString()});
  T.dispatch_site_hub_notes.push({company:'north',site_key:'Type 7 — Primary',hub:'LA',scale_on_route:false,route_notes:'North route note'});
  const t7row=T.dispatch_orders.find(o=>o.company==='adchem'&&o.customer==='Type 7 Manufacturing'&&o.hub==='EB');
  [['LA-261020-91','Type 7 — Primary'],['LA-261020-92','']].forEach(([id,sk])=>T.dispatch_orders.push({...t7row,id,company:'north',hub:'LA',bol_no:null,status:'Scheduled',
    data:{...JSON.parse(JSON.stringify(t7row.data)),id,hub:'LA',status:'Scheduled',siteKey:sk,notes:'',contact:'',contactPhone:'',bolNo:null,pod:null}}));
  await m.reload(); await m.waitForTimeout(1200);
  assert.equal(await m.evaluate(()=>state.company), 'adchem');
  assert.match(await stop1(), /555-0101/, 'AdChem extras cached before the switch');
  const first=await m.evaluate(async()=>{ pickCompany('north'); await loadCompanyData(); return {company:state.company,stops:[...document.querySelectorAll('#todayList .stop')].map(e=>e.textContent)}; });
  assert.equal(first.company, 'north'); assert.equal(first.stops.length, 2, 'both north stops render');
  first.stops.forEach(t=>{ assert.doesNotMatch(t, /4321|Scale on 580|LA only route note|555-0101|Gate moved to the north side/, 'first render after the switch: no AdChem extras'); assert.match(t, /9999/); });
  await m.waitForTimeout(800);
  const after=await m.$$eval('#todayList .stop',e=>e.map(x=>x.textContent.replace(/\s+/g,' ')));
  assert.equal(after.length, 2);
  after.forEach(t=>{ assert.doesNotMatch(t, /4321|Scale on 580|LA only route note|555-0101|Gate moved to the north side/, 'no AdChem site notes for the Northstar driver'); assert.match(t, /9999/); assert.match(t, /North route note/); });
  // no page errors except the deliberate Gmail 502
  const errs=page.errs.concat(m.errs).filter(e=>!/status of 502/.test(e));
  assert.deepEqual(errs, [], 'unexpected page errors');
  assert.equal(page.errs.filter(e=>/status of 502/.test(e)).length, 1, 'the Gmail failure case ran');
  } finally { await b.close(); await fake.stop(); }
})().then(()=>{ console.log('ui.test.cjs: ok'); }, e=>{ console.error(e); process.exit(1); });
