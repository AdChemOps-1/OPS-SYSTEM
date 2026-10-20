// Headless UI test for documents (public/documents.js): the customer page's Documents tab (add a license with a photo, a PSA,
// a paper-only record, open a file through a signed URL), the license/PSA chips and completeness in the customer header,
// the Documents hub (filters, pending count, company documents), the view/manage permissions, and phone width.
// Uses the shared fake (test/_fake.cjs).
const assert = require('assert/strict');
const { chromium } = require('playwright');
const { makeFake, newPage } = require('./_fake.cjs');
const flat = s => (s || '').replace(/\s+/g, ' ').trim();
const pad = n => (n < 10 ? '0' : '') + n;
const isoLocal = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const plusDays = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return isoLocal(d); };
const mdy = iso => (+iso.slice(5, 7)) + '/' + (+iso.slice(8, 10)) + '/' + iso.slice(0, 4);

async function signIn(page, base){
  await page.goto(base+'/'); await page.waitForTimeout(400);
  await page.fill('#lEmail','jamie@adchem.pro'); await page.fill('#lPass','correct-horse'); await page.click('#btnLogin'); await page.waitForTimeout(1000);
  assert.equal(await page.$eval('#app',e=>e.hidden), false, 'app shown');
}
// a 1x1 JPEG
const JPEG = Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=', 'base64');
const CID = '11111111-1111-4111-8111-111111111111';

(async()=>{
  const fake = makeFake(); const T = fake.T; const base = await fake.start();
  const today = isoLocal(new Date()); T.__today = today;   // the fake's "today" and the browser's agree
  T.dispatch_members[0].is_super_admin = true;
  T.dispatch_company_settings[0].data.nextCustomerNumber = 2;
  // a customer complete on the twelve Stage 1 fields (Stage 1 fixture): 12 of 15 before any document
  T.dispatch_customers.push({id:CID,company:'adchem',customer_id:'ADC-0001',name:'Costa Cannabis',also_known_as:'',legal_name:'Costa Cannabis, Inc.',account_status:'active',primary_hub:'LA',parent_customer_id:null,
    billing_street:'2325 E Anaheim St',billing_city:'Long Beach',billing_state:'CA',billing_zip:'90804',last_verified:'2026-10-01',notes:''});
  T.dispatch_sites.push({company:'adchem',site_key:'ADC-0001 — Primary',customer_id:CID,customer:'Costa Cannabis',addr:'2325 E Anaheim St',city:'Long Beach',hub:'LA',site_label:'Primary',code_raw:'',code:null,synced_at:new Date().toISOString()});
  T.dispatch_contacts.push({id:'c-rcv',company:'adchem',customer_id:CID,type:'receiving',first_name:'Ana',last_name:'Ruiz',phone:'(562) 555-0199',email:'',active:true},
    {id:'c-bill',company:'adchem',customer_id:CID,type:'billing',first_name:'Pat',last_name:'',phone:'',email:'ap@costa.example',active:true});
  const b = await chromium.launch(); const pages = [];
  try {
  const page = await newPage(b, base); pages.push(page);
  await page.addInitScript(() => { window.__opened = []; window.open = (u) => { window.__opened.push(u); return null; }; });
  const docPosts = []; page.on('request', r => { if (r.url().endsWith('/api/docs') && r.method() === 'POST') docPosts.push(JSON.parse(r.postData() || '{}')); });
  await signIn(page, base);
  assert.equal(await page.$eval('#tab-documents',e=>e.hidden), false, 'documents tab visible to a super admin');
  // the customer page: chips before any document, then the Documents tab
  await page.click('#tab-customers'); await page.waitForTimeout(300);
  await page.click('#custList .cust-row'); await page.waitForTimeout(500);
  const badge = async (p) => flat(await (p||page).textContent('#custComplete'));
  assert.equal(await badge(), '12 of 15', 'the Stage 1 fields are complete');
  assert.equal(flat(await page.textContent('#custLicChip')), 'No license on file');
  assert.match(await page.$eval('#custLicChip',e=>e.className), /st stop/, 'missing license is red');
  assert.equal(flat(await page.textContent('#custPsaChip')), 'PSA not signed');
  assert.equal(await page.$eval('#ctab-documents',e=>e.hidden), false, 'customer page has a Documents tab');
  await page.click('#ctab-documents'); await page.waitForTimeout(400);
  assert.equal(await page.$eval('#cpane-documents',e=>e.hidden), false); assert.equal(await page.$eval('#cpane-profile',e=>e.hidden), true);
  assert.equal(await page.$$eval('#docList [data-doc]',e=>e.length), 0, 'no documents yet');
  assert.match(flat(await page.textContent('#docList')), /No documents yet/);
  assert.equal(await page.$eval('#btnAddDoc',e=>e.disabled), false);
  // a cannabis license with a photo, expiring in 10 days
  const licExp = plusDays(today, 10);
  await page.click('#btnAddDoc'); await page.waitForTimeout(150);
  assert.equal(await page.$eval('#docForm',e=>e.hidden), false, 'document form open');
  await page.selectOption('#df_type','cannabis_license'); await page.waitForTimeout(50);
  assert.equal(await page.$eval('#dfLicense',e=>e.hidden), false, 'license fields shown for a license');
  assert.equal(await page.$eval('#dfPsa',e=>e.hidden), true, 'PSA fields hidden for a license');
  await page.fill('#df_number','C11-0000123-LIC'); await page.fill('#df_status','Active');
  await page.fill('#df_issued',plusDays(today,-355)); await page.fill('#df_expires',licExp); await page.fill('#df_checked',today);
  await page.fill('#df_source','DCC license search'); await page.fill('#df_licensee','Costa Cannabis, Inc.'); await page.fill('#df_license_type','Adult-Use Distributor');
  await page.fill('#df_county','Los Angeles'); await page.fill('#df_owners','A. Costa'); await page.fill('#df_entity','Active');
  await page.setInputFiles('#df_file', {name:'license photo.jpg', mimeType:'image/jpeg', buffer:JPEG});
  await page.click('#dfSave'); await page.waitForTimeout(1200);
  assert.equal(T.dispatch_documents.length, 1, 'one document row');
  const lic = T.dispatch_documents[0];
  assert.deepEqual({company:lic.company,subject_type:lic.subject_type,subject_id:lic.subject_id,doc_type:lic.doc_type,number:lic.number,status:lic.status,expires:lic.expires,checked_on:lic.checked_on,checked_by:lic.checked_by,source:lic.source,review_status:lic.review_status,extra:lic.extra},
    {company:'adchem',subject_type:'customer',subject_id:CID,doc_type:'cannabis_license',number:'C11-0000123-LIC',status:'Active',expires:licExp,checked_on:today,checked_by:'u1',source:'DCC license search',review_status:'live',
     extra:{licensee_legal_name:'Costa Cannabis, Inc.',license_type:'Adult-Use Distributor',county_premises:'Los Angeles',owners:'A. Costa',entity_status_sos:'Active'}});
  assert.ok(lic.file_path.startsWith('adchem/document/customer/'+CID+'/'+lic.id+'/'), 'file under the document path: '+lic.file_path);
  assert.equal(lic.file_name, 'license_photo.jpg', 'file name made safe, extension kept');
  assert.deepEqual([lic.file_type, lic.file_size>0], ['image/jpeg', true]);
  assert.ok(fake.calls.some(c=>c[0]==='upload'&&c[1]===lic.file_path), 'uploaded to dispatch-docs at that path');
  const licRow = `#docList [data-doc="${lic.id}"]`;
  assert.match(flat(await page.textContent(licRow)), /Cannabis license.*C11-0000123-LIC/);
  assert.match(flat(await page.textContent(licRow)), /license_photo\.jpg/);
  assert.equal(flat(await page.$eval(licRow+' .chip.warn',e=>e.textContent)), 'expiring '+mdy(licExp), 'amber expiring chip with the date');
  assert.equal(flat(await page.textContent('#custLicChip')), 'License expires '+mdy(licExp), 'header chip shows the expiry');
  assert.match(await page.$eval('#custLicChip',e=>e.className), /warn/, 'expiring is amber');
  assert.equal(await badge(), '14 of 15', 'license on file and its expiry count');
  // a PSA with every stage date: signed
  await page.click('#btnAddDoc'); await page.waitForTimeout(150);
  assert.equal(await page.inputValue('#df_number'), '', 'form cleared for the next document');
  await page.selectOption('#df_type','psa'); await page.waitForTimeout(50);
  assert.equal(await page.$eval('#dfPsa',e=>e.hidden), false); assert.equal(await page.$eval('#dfLicense',e=>e.hidden), true);
  const psaDates = {df_quote_sent:'2026-09-01',df_quote_accepted:'2026-09-03',df_sent_sig:'2026-09-05',df_signed_cust:'2026-09-08',df_countersigned:'2026-09-09',df_effective:'2026-09-10'};
  for (const [k,v] of Object.entries(psaDates)) await page.fill('#'+k, v);
  await page.click('#dfSave'); await page.waitForTimeout(1000);
  assert.equal(T.dispatch_documents.length, 2);
  const psa = T.dispatch_documents.find(d=>d.doc_type==='psa');
  assert.deepEqual(psa.extra, {quote_sent:'2026-09-01',quote_accepted:'2026-09-03',sent_for_signature:'2026-09-05',signed_customer:'2026-09-08',countersigned:'2026-09-09',effective_date:'2026-09-10'});
  assert.equal(psa.file_path==null, true, 'no file uploaded for the PSA');
  assert.equal(await page.evaluate(id=>state.custStatus[id].psa_status, CID), 'signed');
  assert.equal(flat(await page.textContent('#custPsaChip')), 'PSA signed'); assert.match(await page.$eval('#custPsaChip',e=>e.className), /k-D/);
  assert.equal(await badge(), '15 of 15', 'PSA signed completes the profile');
  assert.match(await page.$eval('#custComplete',e=>e.className), /full/);
  // open the license file: a signed URL from /api/docs, opened in a new tab
  const logN = T.dispatch_log.length;
  await page.click(`${licRow} [data-open="${lic.id}"]`); await page.waitForTimeout(600);
  assert.deepEqual(docPosts.filter(x=>x.action==='sign'), [{company:'adchem',action:'sign',id:lic.id}], 'one /api/docs sign call');
  assert.ok(T.dispatch_log.slice(logN).some(l=>l.what==='file_view'&&l.detail.documentId===lic.id), 'the file view is logged by the server');
  const opened = await page.evaluate(()=>window.__opened);
  assert.deepEqual(opened.map(u=>u===''?'':'url'), ['','url'], 'a blank tab opened in the click; the stub returns null, so the signed URL is opened after the sign');
  assert.match(opened[1], /object\/sign\/dispatch-docs\/adchem\/document\/customer\//, 'window.open got the signed URL');
  // a real browser returns the tab: it is pointed at the signed URL, and closed again when the sign fails
  await page.evaluate(()=>{ window.__tabs=[]; window.open=(u)=>{ const t={opened:u,location:null,closed:false,close(){ this.closed=true; }}; window.__tabs.push(t); return t; }; });
  await page.click(`${licRow} [data-open="${lic.id}"]`); await page.waitForTimeout(600);
  const tabs1 = await page.evaluate(()=>window.__tabs.map(t=>({opened:t.opened,location:String(t.location),closed:t.closed})));
  assert.equal(tabs1.length, 1, 'one tab, opened in the click'); assert.equal(tabs1[0].opened, '');
  assert.match(tabs1[0].location, /object\/sign\/dispatch-docs\/adchem\/document\/customer\//, 'the tab is sent to the signed URL'); assert.equal(tabs1[0].closed, false);
  await page.route('**/api/docs', r=>r.fulfill({status:404,contentType:'application/json',body:JSON.stringify({error:{code:'not_found',message:'Document not found.'}})}));
  await page.click(`${licRow} [data-open="${lic.id}"]`); await page.waitForTimeout(600);
  const tabs2 = await page.evaluate(()=>window.__tabs.map(t=>({location:t.location,closed:t.closed})));
  assert.deepEqual(tabs2[1], {location:null,closed:true}, 'a failed sign closes the blank tab');
  assert.match(flat(await page.textContent('#banners')), /Couldn't open the file.*Document not found/);
  await page.unroute('**/api/docs');
  await page.evaluate(()=>{ window.open=(u)=>{ window.__opened.push(u); return null; }; });
  // a resale certificate typed from paper: no file, still a real record with a status
  const rsExp = plusDays(today, 120);
  await page.click('#btnAddDoc'); await page.waitForTimeout(150);
  await page.selectOption('#df_type','resale_certificate'); await page.waitForTimeout(50);
  assert.equal(await page.$eval('#dfLicense',e=>e.hidden), true); assert.equal(await page.$eval('#dfPsa',e=>e.hidden), true);
  await page.fill('#df_number','SR-FH-100-200'); await page.fill('#df_expires',rsExp); await page.fill('#df_notes','Typed from the paper copy in the binder');
  await page.click('#dfSave'); await page.waitForTimeout(900);
  assert.equal(T.dispatch_documents.length, 3);
  const rs = T.dispatch_documents.find(d=>d.doc_type==='resale_certificate');
  assert.deepEqual([rs.file_path==null, rs.number, rs.expires, rs.notes], [true, 'SR-FH-100-200', rsExp, 'Typed from the paper copy in the binder']);
  const rsRow = `#docList [data-doc="${rs.id}"]`;
  assert.match(flat(await page.textContent(rsRow)), /Resale certificate.*SR-FH-100-200.*no file/);
  assert.equal(await page.$$eval(rsRow+' [data-open]',e=>e.length), 0, 'no Open button without a file');
  assert.equal(flat(await page.$eval(rsRow+' .chip.k-D',e=>e.textContent)), 'valid '+mdy(rsExp), 'status chip computed without a file');
  assert.equal(await page.$$eval('#docList [data-doc]',e=>e.length), 3);
  // edit the paper record: the form opens with its values, a change is saved in place
  await page.click(`${rsRow} [data-edit-doc="${rs.id}"]`); await page.waitForTimeout(150);
  assert.equal(await page.inputValue('#df_number'), 'SR-FH-100-200'); assert.equal(await page.inputValue('#df_type'), 'resale_certificate');
  await page.fill('#df_status','Valid'); await page.click('#dfSave'); await page.waitForTimeout(800);
  assert.equal(T.dispatch_documents.length, 3, 'edit updates, not inserts'); assert.equal(rs.status, 'Valid');
  assert.ok(T.dispatch_log.some(l=>l.table_name==='dispatch_documents'&&l.row_id===rs.id&&l.changes.status&&l.changes.status.to==='Valid'), 'edit audited');

  // ---------- the Documents hub ----------
  await page.click('#tab-documents'); await page.waitForTimeout(500);
  assert.equal(await page.$eval('#panel-documents',e=>e.hidden), false, 'hub shown');
  const hubIds = () => page.$$eval('#dhList [data-hdoc]',e=>e.map(x=>x.getAttribute('data-hdoc')));
  assert.deepEqual(await hubIds(), [lic.id, rs.id, psa.id], 'all documents, by expiry, no expiry last');
  assert.match(flat(await page.textContent('#dhList')), /Costa Cannabis/, 'rows name the subject');
  assert.equal(flat(await page.textContent('#dhPendingCount')), '0', 'nothing pending review');
  await page.selectOption('#dhExpiring','30'); await page.waitForTimeout(150);
  assert.deepEqual(await hubIds(), [lic.id], 'expiring within 30 days: the license only');
  await page.selectOption('#dhExpiring','all'); await page.selectOption('#dhType','resale_certificate'); await page.waitForTimeout(150);
  assert.deepEqual(await hubIds(), [rs.id], 'type filter');
  await page.selectOption('#dhType',''); await page.fill('#dhSearch','c11-0000123'); await page.waitForTimeout(150);
  assert.deepEqual(await hubIds(), [lic.id], 'search by number');
  await page.fill('#dhSearch',''); await page.selectOption('#dhSubject','company'); await page.waitForTimeout(150);
  assert.deepEqual(await hubIds(), [], 'no company documents yet');
  assert.match(flat(await page.textContent('#dhList')), /No documents match/);
  await page.check('#dhPending'); await page.selectOption('#dhSubject',''); await page.waitForTimeout(150);
  assert.deepEqual(await hubIds(), [], 'pending only: none'); await page.uncheck('#dhPending'); await page.waitForTimeout(100);
  // a company document, from the hub, with an inline editor
  await page.click('#btnAddCompanyDoc'); await page.waitForTimeout(150);
  assert.equal(await page.$eval('#docForm',e=>e.hidden), false, 'form open in the hub');
  assert.ok(await page.$eval('#docForm',e=>!!e.closest('#panel-documents')), 'the form sits in the hub');
  await page.selectOption('#df_type','chp_hazmat_license'); await page.fill('#df_number','HM-9988'); await page.fill('#df_expires',plusDays(today,200));
  await page.click('#dfSave'); await page.waitForTimeout(900);
  const co = T.dispatch_documents.find(d=>d.doc_type==='chp_hazmat_license');
  assert.deepEqual([co.subject_type, co.subject_id, co.company, co.number], ['company','adchem','adchem','HM-9988']);
  assert.equal(await page.$eval('#docForm',e=>e.hidden), true, 'form closes after saving');
  assert.equal((await hubIds()).length, 4);
  await page.selectOption('#dhSubject','company'); await page.waitForTimeout(150);
  assert.deepEqual(await hubIds(), [co.id]); assert.match(flat(await page.textContent('#dhList')), /AdChem/);
  await page.click(`#dhList [data-hdoc="${co.id}"]`); await page.waitForTimeout(200);
  assert.equal(await page.$eval('#docForm',e=>e.hidden), false, 'a company document opens in the inline editor');
  assert.equal(await page.inputValue('#df_number'), 'HM-9988');
  await page.click('#dfCancel'); await page.waitForTimeout(100); assert.equal(await page.$eval('#docForm',e=>e.hidden), true);
  // a customer document opens the customer page on its Documents tab
  await page.selectOption('#dhSubject','customer'); await page.waitForTimeout(150);
  await page.click(`#dhList [data-hdoc="${rs.id}"]`); await page.waitForTimeout(700);
  assert.equal(await page.$eval('#panel-customers',e=>e.hidden), false, 'customer page shown');
  assert.equal(await page.$eval('#cpane-documents',e=>e.hidden), false, 'on its Documents tab');
  assert.equal(flat(await page.textContent('#custTitle')), 'Costa Cannabis');
  assert.equal(await page.$$eval('#docList [data-doc]',e=>e.length), 3);
  // DDB reads the due view, scoped to the company
  assert.deepEqual(await page.evaluate(async()=>(await DDB.due()).map(d=>d.number)), ['C11-0000123-LIC']);

  // ---------- permissions ----------
  const saved = T.dispatch_members.slice();
  for (const [perms, sees, manages] of [[{}, false, false], [{view_documents:true}, true, false], [{view_documents:true,manage_documents:true}, true, true]]) {
    const tag = JSON.stringify(perms);
    const p = await newPage(b, base, {members:[{user_id:'u1',company:'adchem',role:'coordinator',hub:'',active:true,is_super_admin:false,permissions:perms}]}); pages.push(p);
    await signIn(p, base);
    assert.equal(await p.$eval('#tab-documents',e=>e.hidden), !sees, 'documents tab '+tag);
    assert.equal(await p.evaluate(async()=>(await DDB.list()).length), sees?4:0, 'rows the database lets '+tag+' read');
    await p.click('#tab-customers'); await p.waitForTimeout(300); await p.click('#custList .cust-row'); await p.waitForTimeout(500);
    assert.equal(flat(await p.textContent('#custLicChip')), 'License expires '+mdy(licExp), 'header license chip '+tag);
    assert.equal(flat(await p.textContent('#custPsaChip')), 'PSA signed', 'header PSA chip '+tag);
    assert.equal(await badge(p), '15 of 15');
    await p.click('#ctab-documents'); await p.waitForTimeout(500);
    const pane = flat(await p.textContent('#cpane-documents'));
    assert.match(pane, /License expires/, 'pane chips '+tag); assert.match(pane, /PSA signed/);
    if (!sees) {
      assert.equal(await p.$eval('#docPermNote',e=>e.hidden), false, 'permission sentence shown');
      assert.equal(flat(await p.textContent('#docPermNote')), 'Document details need the View documents permission.');
      assert.equal(await p.$$eval('#docList [data-doc]',e=>e.length), 0, 'no list without view_documents');
      assert.equal(await p.$eval('#btnAddDoc',e=>e.hidden), true, 'no Add document without view_documents');
    } else {
      assert.equal(await p.$eval('#docPermNote',e=>e.hidden), true, 'no permission sentence '+tag);
      assert.equal(await p.$$eval('#docList [data-doc]',e=>e.length), 3, 'list visible '+tag);
      assert.equal(await p.$eval('#btnAddDoc',e=>e.disabled), !manages, 'Add document '+tag);
      assert.equal(await p.$$eval('#docList [data-edit-doc]',e=>e.length), manages?3:0, 'edit buttons '+tag);
      assert.equal(await p.$$eval('#docList [data-open]',e=>e.length), 1, 'Open file for the one document with a file '+tag);
      await p.click('#tab-documents'); await p.waitForTimeout(400);
      assert.equal(await p.$$eval('#dhList [data-hdoc]',e=>e.length), 4, 'hub lists '+tag);
      assert.equal(await p.$eval('#btnAddCompanyDoc',e=>e.disabled), !manages, 'Add company document '+tag);
    }
  }
  T.dispatch_members = saved;
  // a driver sees no documents tab
  const d = await newPage(b, base, {members:[{user_id:'u1',company:'adchem',role:'driver',hub:'LA',active:true}]}); pages.push(d);
  await signIn(d, base); assert.equal(await d.$eval('#tab-documents',e=>e.hidden), true, 'driver has no documents tab');
  T.dispatch_members = saved;

  // ---------- an upload failure leaves the record without a file and says so ----------
  await page.route('**/storage/v1/object/dispatch-docs/**', r=>r.fulfill({status:400,contentType:'application/json',body:JSON.stringify({statusCode:'400',error:'Bad',message:'The object exceeded the maximum allowed size'})}));
  await page.click('#btnAddDoc'); await page.waitForTimeout(150);
  await page.selectOption('#df_type','insurance_certificate'); await page.fill('#df_number','INS-1');
  await page.setInputFiles('#df_file', {name:'coi.pdf', mimeType:'application/pdf', buffer:Buffer.from('%PDF-1.4 fake')});
  await page.click('#dfSave'); await page.waitForTimeout(1000);
  const ins = T.dispatch_documents.find(d=>d.number==='INS-1');
  assert.ok(ins, 'the record is saved'); assert.equal(ins.file_path==null, true, 'without a file');
  assert.match(flat(await page.textContent('#banners')), /File not uploaded.*exceeded the maximum allowed size/);
  assert.match(flat(await page.textContent(`#docList [data-doc="${ins.id}"]`)), /no file/);
  await page.unroute('**/storage/v1/object/dispatch-docs/**');

  // ---------- phone width ----------
  const m = await newPage(b, base, {viewport:{width:390,height:844},members:[{user_id:'u1',company:'adchem',role:'admin',hub:'',active:true,is_super_admin:true,permissions:{}}]}); pages.push(m);
  await signIn(m, base); await m.click('#tab-documents'); await m.waitForTimeout(500);
  assert.equal(await m.$$eval('#dhList [data-hdoc]',e=>e.length), 5);
  assert.equal(await m.evaluate(()=>document.documentElement.scrollWidth), 390, 'no horizontal overflow on the hub');
  await m.click('#btnAddCompanyDoc'); await m.waitForTimeout(150); await m.selectOption('#df_type','cannabis_license'); await m.waitForTimeout(50);
  assert.equal(await m.evaluate(()=>document.documentElement.scrollWidth), 390, 'no horizontal overflow with the hub form open');
  await m.click('#tab-customers'); await m.waitForTimeout(300); await m.click('#custList .cust-row'); await m.waitForTimeout(400);
  await m.click('#ctab-documents'); await m.waitForTimeout(500);
  assert.equal(await m.evaluate(()=>document.documentElement.scrollWidth), 390, 'no horizontal overflow on the documents pane');
  await m.click('#btnAddDoc'); await m.waitForTimeout(150); await m.selectOption('#df_type','psa'); await m.waitForTimeout(50);
  assert.equal(await m.evaluate(()=>document.documentElement.scrollWidth), 390, 'no horizontal overflow with the document form open');

  // the upload failure's 400 and the failed sign's 404 are the only console errors
  assert.deepEqual(pages.flatMap(p=>p.errs).filter(e=>!/status of (400|404)/.test(e)), [], 'unexpected page errors');
  } finally { await b.close(); await fake.stop(); }
})().then(()=>{ console.log('documents.test.cjs: ok'); }, e=>{ console.error(e); process.exit(1); });
