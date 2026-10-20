// Headless UI test: serves public/ with a fake Supabase (in-memory tables + auth) and fake /api routes,
// then drives the app through sign-in, orders per code, BOL, Today load checks and the photo-and-send flow.
const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright');
const http = require('http'); const fs = require('fs'); const path = require('path');
const ROOT = path.join(__dirname, '..', 'public');

// ---- fake backend ----
const T = { dispatch_users: [{user_id:'u1',email:'jamie@adchem.pro',name:'Jamie',active:true}],
  dispatch_members: [{user_id:'u1',company:'adchem',role:'admin',hub:'',active:true},{user_id:'u1',company:'north',role:'coordinator',hub:'',active:true}],
  companies: [{id:'adchem',name:'AdChem, LLC',short_name:'AdChem',active:true,data:{}},{id:'north',name:'Northstar Gas Co.',short_name:'Northstar',active:true,data:{ordersTo:'orders@northstar.example'}}],
  dispatch_company_settings: [{company:'adchem',data:{tz:'America/Los_Angeles',sheetId:'1AGd',calendarId:'cal1',calendarConfirmed:true,nextBol:9450,ordersOutSheetId:'1OUT'}},{company:'north',data:{tz:'America/Los_Angeles'}}],
  dispatch_hubs: [{company:'adchem',code:'EB',name:'East Bay — Richmond',street:'525 De Carlo Ave',city:'Richmond',state:'CA',zip:'94801',phone:'(510) 725-7841',emerg:'(800) 633-8253 — PERS',settled:true,sort:1},{company:'adchem',code:'LA',name:'Southern California — Los Angeles',street:'',city:'',state:'CA',zip:'',phone:'',emerg:'(800) 633-8253 — PERS',settled:false,sort:2},{company:'adchem',code:'CO',name:'Colorado — Denver',street:'',city:'',state:'CO',zip:'',phone:'',emerg:'(800) 633-8253 — PERS',settled:false,tz:'America/Denver',products:null,sort:3}],
  dispatch_sites: [], dispatch_orders: [], dispatch_pods: [], dispatch_invites: [], dispatch_log: [] };
const SITES=[['Type 7 Manufacturing','D - Deliver; no holds','100 Main St, Oakland CA 94607','Oakland','EB','Sam','(510) 555-0101','4321','7–11am','','','Dock B','Primary','Type 7 — Primary'],
 ['Bio-Rad','COD - Collect before unloading','2000 Alfred Nobel Dr, Hercules CA 94547   (billing address - confirm the delivery site)','Hercules','','','','','','','','','Primary','Bio-Rad — Primary'],
 ['VKGL Manufacturing LLC','H - Hold, do not deliver','840 W Esther St, Long Beach CA 90813','Long Beach','LA','','','','','','','','Primary','VKGL — Primary'],
 ['Costa Cannabis','CHECK - accounting@adchem.pro','2325 E Anaheim St, Long Beach CA 90804','Long Beach','','Ana','(562) 555-0199','','','','','AM/PM two runs','Primary','Costa — Primary'],
 ['The Upside Group, Inc.','D - Deliver; no holds','804 Heinz Ave, Berkeley CA 94710','Berkeley','','','','','','','','','Primary','Upside — Primary'],
 ['The Upside Group, Inc.','D - Deliver; no holds','6201 Shellmound St, Emeryville CA 94608','Emeryville','','Receiving','(510) 555-0144','','8–3','','','Plant','Shellmound plant','Upside — Shellmound']];
let gmailFail=null; const calls=[]; const EVENTS={}; let CAL;
function parseFilters(q){ const f=[]; for(const [k,v] of q){ if(['select','order','limit','on_conflict'].includes(k)) continue; if(k==='or'){ f.push(['__or',v]); continue;} const m=v.match(/^(eq|neq|gte|lte|in)\.(.*)$/); if(m) f.push([k,m[1],m[2]]); } return f; }
function match(row,f){ return f.every(([k,op,val])=>{ if(k==='__or') return true; const x=row[k]; if(op==='eq') return String(x)===String(val); if(op==='neq') return String(x)!==String(val); if(op==='gte') return String(x)>=val; if(op==='lte') return String(x)<=val; if(op==='in') return val.replace(/^\(|\)$/g,'').split(',').includes(String(x)); return true; }); }
const server=http.createServer(async (req,res)=>{
  const u=new URL(req.url,'http://x'); let body=''; for await (const c of req) body+=c;
  const send=(code,obj,hdr={})=>{res.writeHead(code,{'content-type':'application/json',...hdr});res.end(JSON.stringify(obj));};
  if(u.pathname.startsWith('/auth/v1/token')){ const b=JSON.parse(body); if(b.password==='bad') return send(400,{error:'invalid',error_description:'Invalid login credentials',msg:'Invalid login credentials'}); return send(200,{access_token:'tok',token_type:'bearer',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,refresh_token:'r',user:{id:'u1',email:b.email,aud:'authenticated',role:'authenticated'}}); }
  if(u.pathname==='/auth/v1/user') return send(200,{id:'u1',email:'jamie@adchem.pro',aud:'authenticated',role:'authenticated'});
  if(u.pathname==='/auth/v1/logout') return send(204,{});
  if(u.pathname.startsWith('/rest/v1/rpc/')){ const fn=u.pathname.split('/').pop(); const b=JSON.parse(body||'{}');
    if(fn==='dispatch_next_bol'){ const s=T.dispatch_company_settings.find(x=>x.company===(b.p_company||'adchem')).data; const o=T.dispatch_orders.find(x=>x.id===b.p_order_id&&x.company===(b.p_company||'adchem')); if(o&&o.bol_no) return send(200,o.bol_no); if(!s.nextBol) return send(200,null); const n=s.nextBol; s.nextBol=n+1; if(o) o.bol_no=n; return send(200,n); }
    if(fn==='dispatch_grant'){ T.dispatch_invites.push({email:b.p_email,name:b.p_name,role:b.p_role,hub:b.p_hub,company:b.p_company,invited_at:new Date().toISOString()}); return send(200,'invited'); }
    if(fn==='dispatch_add_company'){ T.companies.push({id:b.p_id,name:b.p_name,short_name:b.p_short,active:true,data:{}}); T.dispatch_members.push({user_id:'u1',company:b.p_id,role:'admin',hub:'',active:true}); T.dispatch_company_settings.push({company:b.p_id,data:{}}); return send(200,null); }
    if(fn==='dispatch_revoke'){ const u=T.dispatch_users.find(x=>x.email===b.p_email); if(u) T.dispatch_members.forEach(m=>{if(m.user_id===u.user_id&&m.company===b.p_company)m.active=false;}); return send(200,null); }
    return send(404,{message:'no fn'}); }
  if(u.pathname.startsWith('/rest/v1/')){ const t=u.pathname.split('/')[3]; const f=parseFilters(u.searchParams); const rows=T[t]||[];
    if(req.method==='GET'){ let out=rows.filter(r=>match(r,f)); if(req.headers.accept&&req.headers.accept.includes('vnd.pgrst.object')) return out.length?send(200,out[0]):send(406,{message:'none'}); return send(200,out); }
    if(req.method==='POST'){ const arr=[].concat(JSON.parse(body)); const keys=(u.searchParams.get('on_conflict')||'id').split(','); arr.forEach(r=>{ const i=rows.findIndex(x=>keys.every(k=>String(x[k])===String(r[k]))); if(i>=0) rows[i]={...rows[i],...r}; else rows.push(r); }); return send(201,arr); }
    if(req.method==='PATCH'){ const d=JSON.parse(body); rows.filter(r=>match(r,f)).forEach(r=>Object.assign(r,d)); return send(204,{}); }
  }
  if(u.pathname.startsWith('/storage/v1/object/dispatch-pods/')){ calls.push(['upload',u.pathname]); return send(200,{Key:u.pathname.replace('/storage/v1/object/','')}); }
  if(u.pathname==='/api/feed'){ const co=JSON.parse(body||'{}').company||'adchem'; T.dispatch_sites=T.dispatch_sites.filter(s=>s.company!==co).concat(SITES.map(r=>({company:co,site_key:r[13],customer:r[0],code_raw:r[1],code:r[1].split(' - ')[0],addr:r[2].replace(/\s*\(billing address[^)]*\)\s*/,'').trim(),unconfirmed:/confirm the delivery/.test(r[2]),city:r[3],hub:r[4],contact:r[5],phone:r[6],gate:r[7],hours:r[8],instr:r[11],site_label:r[12],copy_to:'',synced_at:new Date().toISOString()}))); return send(200,{ok:true,sites:SITES.length,customers:5,unconfirmed:1}); }
  if(u.pathname==='/api/calendar'&&req.method==='GET') return send(200,{calendars:[{id:'cal1',summary:'Dispatch',timeZone:'America/Los_Angeles'},{id:'calEB',summary:'Deliveries — East Bay',timeZone:'America/Los_Angeles'}]});
  if(u.pathname==='/api/calendar'){ const b=JSON.parse(body);
    // mirrors functions/api/calendar.js, using its real calendar resolution
    if(b.action==='check') return send(200,{results:b.ids.map(id=>id==='calNO'?{id,ok:false,accessRole:'reader'}:{id,ok:true,summary:id==='calLA@group.calendar.google.com'?'Deliveries — SoCal':id==='calEB'?'Deliveries — East Bay':id==='calCO'?'Deliveries — Denver':'Dispatch'})});
    const st=T.dispatch_company_settings.find(x=>x.company===(b.company||'adchem')).data; const to=CAL.calendarFor(st,b.hub);
    if(!to||!st.calendarConfirmed) return send(400,{error:{code:'no_calendar',message:'No confirmed calendar for hub '+b.hub}});
    let moved=false, id=b.eventId;
    if(id&&id!=='created'){ const from=b.eventCal||st.calendarId||to; if(from!==to){ if(!CAL.companyCalendars(st).has(from)) return send(400,{error:{code:'bad_calendar',message:'x'}}); if(EVENTS[id]!==from) return send(404,{error:{code:'google',message:'event not on '+from}}); EVENTS[id]=to; moved=true; } }
    else { id='ev'+(Object.keys(EVENTS).length+1); EVENTS[id]=to; }
    calls.push(['calendar',{hub:b.hub,cal:to,moved,update:!!b.eventId,tz:b.timeZone}]); return send(200,{ok:true,eventId:id,calendarId:to,moved}); }
  if(u.pathname==='/api/drive') return send(200,{ok:true,id:'f1',webViewLink:''});
  if(u.pathname==='/api/pod'){ const b=JSON.parse(body); calls.push(['pod',b]); if(gmailFail) return send(502,{error:{code:gmailFail,message:'Gmail: boom'}}); const o=T.dispatch_orders.find(x=>x.id===b.orderId); if(!o||!b.photoPath.startsWith('adchem/'+o.hub+'/pod/'+o.id+'/')) return send(400,{error:{code:'bad_path',message:'path '+b.photoPath}}); if(o){o.status='Delivered'; o.data.pod={collected:b.collected,issue:b.issue,note:b.note};} return send(200,{ok:true,sentAt:new Date().toISOString(),to:'orders@adchem.pro',cc:b.cc,msgId:'m1',status:'Delivered'}); }
  if(u.pathname==='/api/deposit'){ const b=JSON.parse(body); calls.push(['deposit',b]); if(!b.photoPath.startsWith('adchem/'+b.hub+'/deposits/')) return send(400,{error:{code:'bad_path',message:'path '+b.photoPath}}); return send(200,{ok:true,sentAt:new Date().toISOString(),to:'accounting@adchem.pro',msgId:'d1'}); }
  if(u.pathname==='/api/orderlog'){ const b=JSON.parse(body); calls.push(['orderlog',b]); return send(200,b.rebuild?{ok:true,rebuilt:T.dispatch_orders.length}:{ok:true,updated:0,appended:(b.orderIds||[]).length}); }
  if(u.pathname==='/api/health') return send(200,{googleConfigured:false});
  // static
  let p=path.join(ROOT,u.pathname==='/'?'index.html':u.pathname); if(!fs.existsSync(p)) return send(404,{});
  const ext=path.extname(p); res.writeHead(200,{'content-type':{'.html':'text/html','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json'}[ext]||'application/octet-stream'}); fs.createReadStream(p).pipe(res);
});
(async()=>{
  CAL=await import(path.join(__dirname,'..','functions','_lib','calendars.js'));
  await new Promise(r=>server.listen(0,r)); const port=server.address().port; const base='http://127.0.0.1:'+port;
  // config pointing supabase at the fake
  const cfg=fs.readFileSync(path.join(ROOT,'config.js'),'utf8');
  const b=await chromium.launch(); const page=await b.newPage({viewport:{width:1100,height:1500}}); const errs=[]; page.on('pageerror',e=>errs.push(String(e))); page.on('console',m=>{ if(m.type()==='error'&&!/fonts|ERR_FAILED/.test(m.text())) errs.push(m.text()); });
  await page.route('**/fonts.*/**',r=>r.abort());
  await page.route('**/config.js',r=>r.fulfill({contentType:'application/javascript',body:`window.ADCHEM_CONFIG={supabaseUrl:"${base}",supabaseAnonKey:"anon",ordersTo:"orders@adchem.pro"};`}));
  await page.goto(base+'/'); await page.waitForTimeout(600);
  console.log('login shown:', !(await page.$eval('#login',e=>e.hidden)));
  await page.fill('#lEmail','jamie@adchem.pro'); await page.fill('#lPass','bad-pass-x'); await page.fill('#lPass','bad'); await page.click('#btnLogin'); await page.waitForTimeout(400);
  console.log('bad login msg:', (await page.textContent('#loginMsg')).trim().slice(0,40));
  await page.fill('#lPass','correct-horse'); await page.click('#btnLogin'); await page.waitForTimeout(1200);
  console.log('app shown:', !(await page.$eval('#app',e=>e.hidden)), '| role chip:', await page.textContent('#roleChip'), '| users tab visible:', !(await page.$eval('#tab-users',e=>e.hidden)));
  // refresh feed
  await page.click('#tab-setup'); await page.waitForTimeout(300); await page.click('#btnRefreshFeed'); await page.waitForTimeout(800);
  console.log('feed:', (await page.textContent('#feedState')).replace(/\s+/g,' ').slice(0,90));
  console.log('seg table cells:', await page.$$eval('.segtable td.X',e=>e.length),'X /', await page.$$eval('.segtable td.O',e=>e.length),'O');
  // delivery calendars: EB picked from the list, LA pasted — first a calendar the server can only read, then the right one
  await page.selectOption('[data-hubcal="EB"]','calEB'); await page.waitForTimeout(150);
  await page.fill('[data-hubcalid="LA"]','calNO'); await page.dispatchEvent('[data-hubcalid="LA"]','change'); await page.waitForTimeout(150);
  await page.click('#btnConfirmCal'); await page.waitForTimeout(500);
  console.log('confirm with a read-only calendar:', await page.evaluate(()=>state.settings.calendarConfirmed), '|', (await page.$$eval('#banners .banner',e=>e[0]&&e[0].innerText.replace(/\s+/g,' ').slice(0,90))));
  await page.fill('[data-hubcalid="CO"]','calCO'); await page.dispatchEvent('[data-hubcalid="CO"]','change'); await page.waitForTimeout(150);
  await page.fill('[data-hubcalid="LA"]','calLA@group.calendar.google.com'); await page.dispatchEvent('[data-hubcalid="LA"]','change'); await page.waitForTimeout(150);
  await page.click('#btnConfirmCal'); await page.waitForTimeout(500);
  console.log('confirmed:', await page.evaluate(()=>state.settings.calendarConfirmed), '| calState:', (await page.textContent('#calState')).replace(/\s+/g,' ').slice(0,160));
  await (await page.$('#calState')).evaluate(e=>e.closest('.card').scrollIntoView()); await (await page.$('#calState')).evaluate(e=>e.closest('.card')).then(()=>0); await page.locator('#calState').locator('xpath=ancestor::div[contains(@class,"card")][1]').screenshot({path:path.join(__dirname,'shot-calendars.png')});
  console.log('saved hubCalendars:', JSON.stringify(T.dispatch_company_settings[0].data.hubCalendars));
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
    console.log('  ', cust, '→', JSON.stringify(bn));
  }
  await newOrder('Type 7 Manufacturing',{cat:'Gases',prod:'Butane',cont:'120lb Cylinder',qty:6,truck:'Truck 1',copyTo:'sam@type7.example'});
  await newOrder('Bio-Rad',{cat:'Gases',prod:'Nitrogen',cont:'300cu ft Cylinder',qty:6,cod:640,confirm:true,truck:'Truck 1'});
  await newOrder('VKGL Manufacturing LLC',{cat:'Gases',prod:'Butane',cont:'120lb Cylinder',qty:12});
  await newOrder('Costa Cannabis',{cat:'Gases',prod:'Butane',cont:'120lb Cylinder',qty:6});
  // a DO NOT LOAD product is refused outright; the same order with heptanes goes through
  await newOrder('The Upside Group, Inc.',{site:'Shellmound plant — 6201 Shellmound St, Emeryville CA 94608',cat:'Dry Ice',prod:'Dry Ice - Pellet',cont:'Bin',qty:2,line2:{cat:'Solvents',prod:'Acetone',cont:'55gal Drum',qty:1,lb:400},truck:'Truck 2'});
  console.log('  acetone order saved?', T.dispatch_orders.some(o=>o.customer==='The Upside Group, Inc.'));
  await page.selectOption('[data-line="1"] [data-k="product"]','Heptanes'); await page.waitForTimeout(200); await page.click('#btnSubmit'); await page.waitForTimeout(900);
  // Denver: limit the hub to two products on Setup, then an order for butane out of CO is refused and dry ice goes through
  await page.click('#tab-setup'); await page.waitForTimeout(300);
  await page.check('[data-hlimit="2"][value="some"]'); await page.waitForTimeout(150);
  await page.check('[data-hp="2"][value="Dry Ice|Dry Ice - Pellet"]'); await page.check('[data-hp="2"][value="Gases|Carbon Dioxide"]');
  await page.click('#btnSaveHubs'); await page.waitForTimeout(400);
  await page.locator('[data-hpcount="2"]').locator('xpath=ancestor::div[contains(@class,"card")][1]').screenshot({path:path.join(__dirname,'shot-hub-co.png')});
  console.log('CO hub saved:', JSON.stringify(T.dispatch_hubs.filter(h=>h.code==='CO').map(h=>({tz:h.tz,products:h.products}))), '| keys unique:', await page.evaluate(()=>new Set(PRODUCTS.map(p=>prodKey(p.cat,p.name))).size===PRODUCTS.length));
  await page.click('#tab-new'); await page.waitForTimeout(200);
  await newOrder('Type 7 Manufacturing',{hub:'CO',cat:'Gases',prod:'Butane',cont:'120lb Cylinder',qty:2});
  console.log('  line flag:', await page.$$eval('#lineEditor .lb',e=>e.map(x=>x.innerText).filter(t=>/Not offered/.test(t))));
  await page.selectOption('[data-line="0"] [data-k="category"]','Dry Ice'); await page.waitForTimeout(150); await page.fill('[data-line="0"] [data-k="qty"]','2'); await page.waitForTimeout(150);
  await page.click('#btnSubmit'); await page.waitForTimeout(900);
  const co=T.dispatch_orders.find(o=>o.id.startsWith('CO-')); console.log('  CO order:', co&&co.id, co&&co.data.tz, co&&co.data.lines.map(l=>l.product), '| event:', JSON.stringify(calls.filter(c=>c[0]==='calendar').slice(-1).map(c=>c[1])));
  console.table(T.dispatch_orders.map(o=>({id:o.id,co:o.company,bol:o.bol_no,status:o.status,code:o.data.effCode,addr:o.data.addrState,cod:o.data.codAmount})));
  console.log('orderlog calls:', JSON.stringify(calls.filter(c=>c[0]==='orderlog').map(c=>c[1].orderIds)));
  console.log('company picker shown:', !(await page.$eval('#coPick',e=>e.hidden)), '| options:', await page.$$eval('#coPick option',o=>o.map(x=>x.textContent)));
  console.log('calendar calls:', JSON.stringify(calls.filter(c=>c[0]==='calendar').map(c=>c[1])));
  // an order moved from EB to LA moves its event to the SoCal calendar
  const mv=await page.evaluate(async()=>{ var o=state.orders.find(function(x){return x.id.indexOf('EB-')===0&&x.customer==='Type 7 Manufacturing';}); var before=o.eventCal; o.hub='LA'; var ok=await updateCalendarEvent(o); var r={before:before,after:o.eventCal,ok:ok}; o.hub='EB'; await updateCalendarEvent(o); r.back=o.eventCal; return r; });
  console.log('hub move:', JSON.stringify(mv), '| calls:', JSON.stringify(calls.filter(c=>c[0]==='calendar').slice(-2).map(c=>c[1])));
  console.log('site copy_to saved:', T.dispatch_sites.find(s=>s.customer==='Type 7 Manufacturing').copy_to);
  // Today: load checks
  await page.click('#tab-today'); await page.waitForTimeout(400);
  console.log('TODAY flags:', await page.$$eval('.flagline',els=>els.map(e=>e.innerText.replace(/\s+/g,' ').slice(0,120))));
  await page.screenshot({path:path.join(__dirname,'shot-today.png'),fullPage:true});
  // Morning Driver Sheet: render the HTML the button prints, as a PDF
  const dsHtml=await page.evaluate(()=>driverSheetHtml(document.getElementById('tDate').value));
  const ds=await b.newPage(); await ds.setContent(dsHtml.replace(/<script>[\s\S]*?<\/script>/,''),{waitUntil:'load'}); await ds.emulateMedia({media:'print'});
  await ds.pdf({path:path.join(__dirname,'driver-sheet.pdf'),format:'Letter',printBackground:true,margin:{top:'0.4in',bottom:'0.4in',left:'0.4in',right:'0.4in'}}); await ds.close();
  console.log('driver sheet pages:', (dsHtml.match(/class="page"/g)||[]).length, '| COD rows:', (dsHtml.match(/class="cod"/g)||[]).length);
  // POD flow on Type 7
  const t7=T.dispatch_orders.find(o=>o.customer==='Type 7 Manufacturing');
  await page.fill('#tDriver','Omari');
  await page.click(`[data-pod="${t7.id}"]`); await page.waitForTimeout(200);
  console.log('pod cc prefilled:', await page.inputValue('#podCc'));
  require('child_process').execSync("python3 -c \"from PIL import Image; Image.new('RGB',(2400,3000),'white').save('/tmp/fake-bol.jpg',quality=85)\"");
  await page.setInputFiles('#podFile','/tmp/fake-bol.jpg'); await page.waitForTimeout(800);
  await page.click('#podSend'); await page.waitForTimeout(1200);
  console.log('pod status:', (await page.textContent('#podStatus')).replace(/\s+/g,' ').slice(0,100));
  console.log('pod api body:', JSON.stringify(calls.filter(c=>c[0]==='pod').map(c=>({orderId:c[1].orderId,company:c[1].company,photo:c[1].photoPath.slice(0,32),cc:c[1].cc,driver:c[1].driver,collected:c[1].collected}))));
  console.log('order status now:', t7.status);
  await page.click('#podDone'); await page.waitForTimeout(200);
  // failure → queue
  gmailFail='google'; const br=T.dispatch_orders.find(o=>o.customer==='Bio-Rad');
  await page.click(`[data-pod="${br.id}"]`); await page.waitForTimeout(200); await page.setInputFiles('#podFile','/tmp/fake-bol.jpg'); await page.waitForTimeout(800); await page.click('#podSend'); await page.waitForTimeout(800);
  console.log('gmail fail status:', (await page.textContent('#podStatus')).replace(/\s+/g,' ').slice(0,80));
  await page.click('#podClose');
  // People tab
  await page.click('#tab-users'); await page.waitForTimeout(400);
  await page.fill('#uEmail','driver-eb@adchem.pro'); await page.selectOption('#uRole','driver'); await page.selectOption('#uHub','EB'); await page.click('#btnGrant'); await page.waitForTimeout(500);
  console.log('people:', (await page.textContent('#userList')).replace(/\s+/g,' ').slice(0,200));
  // switch to the second company: nothing of AdChem's shows
  await page.selectOption('#coPick','north'); await page.waitForTimeout(900);
  console.log('after switch — orders:', await page.evaluate(()=>state.orders.length), '| hubs:', await page.evaluate(()=>state.hubs.length), '| role:', await page.evaluate(()=>state.role), '| shipper on BOL:', await page.evaluate(()=>coName()));
  await page.selectOption('#coPick','adchem'); await page.waitForTimeout(900);
  console.log('back — orders:', await page.evaluate(()=>state.orders.length));
  // print BOL one page
  await page.click('#tab-open'); await page.waitForTimeout(300); await page.click(`[data-bol="${br.id}"]`); await page.waitForTimeout(300);
  await page.emulateMedia({media:'print'}); await page.pdf({path:path.join(__dirname,'bol.pdf'),format:'Letter',printBackground:true,margin:{top:'0.4in',bottom:'0.4in',left:'0.4in',right:'0.4in'}}); await page.emulateMedia({media:'screen'});
  // mobile driver view
  const m=await b.newPage({viewport:{width:390,height:844}}); await m.route('**/fonts.*/**',r=>r.abort()); await m.route('**/config.js',r=>r.fulfill({contentType:'application/javascript',body:`window.ADCHEM_CONFIG={supabaseUrl:"${base}",supabaseAnonKey:"anon"};`}));
  T.dispatch_members=[{user_id:'u1',company:'adchem',role:'driver',hub:'EB',active:true}];
  await m.goto(base+'/'); await m.waitForTimeout(400); await m.fill('#lEmail','driver-eb@adchem.pro'); await m.fill('#lPass','correct-horse'); await m.click('#btnLogin'); await m.waitForTimeout(1000);
  console.log('driver tab:', await m.evaluate(()=>state.tab), '| new-order tab hidden:', await m.$eval('#tab-new',e=>e.hidden), '| overflow:', await m.evaluate(()=>document.documentElement.scrollWidth), '| stops:', await m.$$eval('.stop',e=>e.length));
  await m.screenshot({path:path.join(__dirname,'shot-driver.png'),fullPage:true});
  // deposit slip from the driver's phone
  await m.click('#btnDeposit'); await m.waitForTimeout(200); await m.setInputFiles('#depFile','/tmp/fake-bol.jpg'); await m.waitForTimeout(800);
  await m.fill('#depAmount','1240.50'); await m.fill('#depNote','Chase Richmond'); await m.click('#depSend'); await m.waitForTimeout(1200);
  console.log('deposit status:', (await m.textContent('#depStatus')).replace(/\s+/g,' ').slice(0,90));
  console.log('deposit api body:', JSON.stringify(calls.filter(c=>c[0]==='deposit').map(c=>({hub:c[1].hub,driver:c[1].driver,amount:c[1].amount,note:c[1].note,photo:c[1].photoPath.slice(0,24)}))));
  console.log('ERRORS:', errs);
  await b.close(); server.close();
})();
