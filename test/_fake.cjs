// Shared test fake: an in-memory Supabase (auth + REST + RPC + storage) and the app's /api routes, serving public/.
// Used by test/*.test.cjs. makeFake(seed) -> { server, T, calls, start(), stop(), setGmailFail(code|null) }; newPage(browser, base, opts) -> page.
const http = require('http'); const fs = require('fs'); const path = require('path');
const ROOT = path.join(__dirname, '..', 'public');

function seedTables(){ return {
  dispatch_users: [{user_id:'u1',email:'jamie@adchem.pro',name:'Jamie',active:true}],
  dispatch_members: [{user_id:'u1',company:'adchem',role:'admin',hub:'',active:true},{user_id:'u1',company:'north',role:'coordinator',hub:'',active:true}],
  companies: [{id:'adchem',name:'AdChem, LLC',short_name:'AdChem',active:true,data:{}},{id:'north',name:'Northstar Gas Co.',short_name:'Northstar',active:true,data:{ordersTo:'orders@northstar.example'}}],
  dispatch_company_settings: [{company:'adchem',data:{tz:'America/Los_Angeles',sheetId:'1AGd',calendarId:'cal1',calendarConfirmed:true,nextBol:9450,ordersOutSheetId:'1OUT',nextCustomerNumber:1}},{company:'north',data:{tz:'America/Los_Angeles'}}],
  dispatch_hubs: [{company:'adchem',code:'EB',name:'East Bay — Richmond',street:'525 De Carlo Ave',city:'Richmond',state:'CA',zip:'94801',phone:'(510) 725-7841',emerg:'(800) 633-8253 — PERS',settled:true,sort:1},{company:'adchem',code:'LA',name:'Southern California — Los Angeles',street:'',city:'',state:'CA',zip:'',phone:'',emerg:'(800) 633-8253 — PERS',settled:false,sort:2},{company:'adchem',code:'CO',name:'Colorado — Denver',street:'',city:'',state:'CO',zip:'',phone:'',emerg:'(800) 633-8253 — PERS',settled:false,tz:'America/Denver',products:null,sort:3}],
  dispatch_sites: [], dispatch_orders: [], dispatch_pods: [], dispatch_invites: [], dispatch_log: [],
  dispatch_customers: [], dispatch_contacts: [], dispatch_site_hub_notes: [], dispatch_customer_activity: [] }; }

const SITES=[['Type 7 Manufacturing','D - Deliver; no holds','100 Main St, Oakland CA 94607','Oakland','EB','Sam','(510) 555-0101','4321','7–11am','','','Dock B','Primary','Type 7 — Primary'],
 ['Bio-Rad','COD - Collect before unloading','2000 Alfred Nobel Dr, Hercules CA 94547   (billing address - confirm the delivery site)','Hercules','','','','','','','','','Primary','Bio-Rad — Primary'],
 ['VKGL Manufacturing LLC','H - Hold, do not deliver','840 W Esther St, Long Beach CA 90813','Long Beach','LA','','','','','','','','Primary','VKGL — Primary'],
 ['Costa Cannabis','CHECK - accounting@adchem.pro','2325 E Anaheim St, Long Beach CA 90804','Long Beach','','Ana','(562) 555-0199','','','','','AM/PM two runs','Primary','Costa — Primary'],
 ['The Upside Group, Inc.','D - Deliver; no holds','804 Heinz Ave, Berkeley CA 94710','Berkeley','','','','','','','','','Primary','Upside — Primary'],
 ['The Upside Group, Inc.','D - Deliver; no holds','6201 Shellmound St, Emeryville CA 94608','Emeryville','','Receiving','(510) 555-0144','','8–3','','','Plant','Shellmound plant','Upside — Shellmound']];

// ---- REST filters: eq neq gte lte in ilike is, plus or=(a.eq.x,b.eq.y); select= (embeds ignored), order=, limit= ----
function cmpOp(x,op,val){
  if(op==='eq') return String(x)===String(val);
  if(op==='neq') return String(x)!==String(val);
  if(op==='gte') return String(x)>=val;
  if(op==='lte') return String(x)<=val;
  if(op==='in') return val.replace(/^\(|\)$/g,'').split(',').includes(String(x));
  if(op==='ilike'){ const re=new RegExp('^'+String(val).replace(/[.+^${}()|[\]\\]/g,'\\$&').replace(/\*/g,'.*').replace(/%/g,'.*')+'$','i'); return re.test(x==null?'':String(x)); }
  if(op==='is'){ if(val==='null') return x==null; if(val==='true') return x===true; if(val==='false') return x===false; return false; }
  return true; }
function parseOr(v){ return v.replace(/^\(|\)$/g,'').split(',').map(p=>{ const m=p.match(/^([^.]+)\.([a-z]+)\.(.*)$/); return m?[m[1],m[2],m[3]]:null; }).filter(Boolean); }
function parseFilters(q){ const f=[]; for(const [k,v] of q){ if(['select','order','limit','offset','on_conflict'].includes(k)) continue; if(k==='or'){ f.push(['__or',null,parseOr(v)]); continue; } const m=v.match(/^(eq|neq|gte|lte|in|ilike|is)\.(.*)$/); if(m) f.push([k,m[1],m[2]]); } return f; }
function match(row,f){ return f.every(([k,op,val])=>{ if(k==='__or') return val.some(([k2,op2,v2])=>cmpOp(row[k2],op2,v2)); return cmpOp(row[k],op,val); }); }
function orderRows(rows,spec){ if(!spec) return rows; const keys=spec.split(',').map(s=>{ const p=s.split('.'); return {k:p[0],desc:p[1]==='desc'}; }); return rows.slice().sort((a,b)=>{ for(const {k,desc} of keys){ const x=a[k], y=b[k]; if(x===y) continue; if(x==null) return desc?-1:1; if(y==null) return desc?1:-1; const c=x<y?-1:1; return desc?-c:c; } return 0; }); }

// ---- computed view: dispatch_customer_status (the 15 must-have fields; license/PSA are Stage 2) ----
function customerStatus(T){ return T.dispatch_customers.map(c=>{
  const has=v=>v!=null&&String(v).trim()!=='';
  const sites=T.dispatch_sites.filter(s=>s.company===c.company&&s.customer_id===c.id&&has(s.addr));
  const cts=T.dispatch_contacts.filter(x=>x.company===c.company&&x.customer_id===c.id);
  const checks=[has(c.name),has(c.legal_name),has(c.account_status),has(c.primary_hub),has(c.billing_street),has(c.billing_city),has(c.billing_state),has(c.billing_zip),
    sites.length>0, cts.some(x=>x.type==='receiving'&&has(x.phone)), cts.some(x=>x.type==='billing'&&has(x.email)),
    false /* license on file */, false /* license expiry */, false /* PSA signed */, has(c.last_verified)];
  return { id:c.id, company:c.company, customer_id:c.customer_id, profile_complete:checks.filter(Boolean).length, license_status:'missing', psa_status:'missing', license_expires:null, license_number:null, entity_status:null };
}); }

function uuid(){ return require('crypto').randomUUID(); }
function nextCustomerId(T,company){ const s=T.dispatch_company_settings.find(x=>x.company===company); if(!s) return null; const n=s.data.nextCustomerNumber||1; s.data.nextCustomerNumber=n+1; return 'ADC-'+String(n).padStart(4,'0'); }

function fakeRpc(name,b,T){
  if(name==='dispatch_next_bol'){ const co=b.p_company||'adchem'; const s=T.dispatch_company_settings.find(x=>x.company===co).data; const o=T.dispatch_orders.find(x=>x.id===b.p_order_id&&x.company===co); if(o&&o.bol_no) return {code:200,body:o.bol_no}; if(!s.nextBol) return {code:200,body:null}; const n=s.nextBol; s.nextBol=n+1; if(o) o.bol_no=n; return {code:200,body:n}; }
  if(name==='dispatch_grant'){ T.dispatch_invites.push({email:b.p_email,name:b.p_name,role:b.p_role,hub:b.p_hub,company:b.p_company,invited_at:new Date().toISOString()}); return {code:200,body:'invited'}; }
  if(name==='dispatch_add_company'){ T.companies.push({id:b.p_id,name:b.p_name,short_name:b.p_short,active:true,data:{}}); T.dispatch_members.push({user_id:'u1',company:b.p_id,role:'admin',hub:'',active:true}); T.dispatch_company_settings.push({company:b.p_id,data:{}}); return {code:200,body:null}; }
  if(name==='dispatch_revoke'){ const u=T.dispatch_users.find(x=>x.email===b.p_email); if(u) T.dispatch_members.forEach(m=>{if(m.user_id===u.user_id&&m.company===b.p_company)m.active=false;}); return {code:200,body:null}; }
  if(name==='dispatch_set_permissions'||name==='dispatch_set_super_admin'){ const u=T.dispatch_users.find(x=>x.user_id===b.p_user||x.email===b.p_user); const m=T.dispatch_members.find(x=>x.company===b.p_company&&(x.user_id===b.p_user||(u&&x.user_id===u.user_id))); if(!m) return {code:404,body:{message:'no member'}};
    if(name==='dispatch_set_permissions') m.permissions=b.p_perms; else m.is_super_admin=!!b.p_on; return {code:200,body:null}; }
  return {code:404,body:{message:'no fn '+name}}; }

function makeFake(seed){
  const T=seedTables(); if(seed) Object.keys(seed).forEach(k=>{ T[k]=seed[k]; });
  const calls=[]; const EVENTS={}; let CAL=null, gmailFail=null, server=null;
  server=http.createServer(async (req,res)=>{
    const u=new URL(req.url,'http://x'); let body=''; for await (const c of req) body+=c;
    const send=(code,obj,hdr={})=>{res.writeHead(code,{'content-type':'application/json',...hdr});res.end(JSON.stringify(obj));};
    if(u.pathname.startsWith('/auth/v1/token')){ const b=JSON.parse(body); if(b.password==='bad') return send(400,{error:'invalid',error_description:'Invalid login credentials',msg:'Invalid login credentials'}); return send(200,{access_token:'tok',token_type:'bearer',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,refresh_token:'r',user:{id:'u1',email:b.email,aud:'authenticated',role:'authenticated'}}); }
    if(u.pathname==='/auth/v1/user') return send(200,{id:'u1',email:'jamie@adchem.pro',aud:'authenticated',role:'authenticated'});
    if(u.pathname==='/auth/v1/logout') return send(204,{});
    if(u.pathname.startsWith('/rest/v1/rpc/')){ const r=fakeRpc(u.pathname.split('/').pop(),JSON.parse(body||'{}'),T); return send(r.code,r.body); }
    if(u.pathname.startsWith('/rest/v1/')){ const t=u.pathname.split('/')[3]; const f=parseFilters(u.searchParams);
      if(t==='dispatch_customer_status'){ if(req.method!=='GET') return send(405,{message:'view is read-only'}); let out=orderRows(customerStatus(T).filter(r=>match(r,f)),u.searchParams.get('order')); const lim=parseInt(u.searchParams.get('limit'),10); if(lim>0) out=out.slice(0,lim); if(req.headers.accept&&req.headers.accept.includes('vnd.pgrst.object')) return out.length?send(200,out[0]):send(406,{message:'none'}); return send(200,out); }
      if(!T[t]) T[t]=[]; const rows=T[t];
      if(req.method==='GET'){ let out=orderRows(rows.filter(r=>match(r,f)),u.searchParams.get('order')); const lim=parseInt(u.searchParams.get('limit'),10); if(lim>0) out=out.slice(0,lim); if(req.headers.accept&&req.headers.accept.includes('vnd.pgrst.object')) return out.length?send(200,out[0]):send(406,{message:'none'}); return send(200,out); }
      if(req.method==='POST'){ const arr=[].concat(JSON.parse(body)); const keys=(u.searchParams.get('on_conflict')||'id').split(',');
        arr.forEach(r=>{ if(t==='dispatch_customers'){ if(!r.id) r.id=uuid(); if(!r.customer_id) r.customer_id=nextCustomerId(T,r.company); }
          const i=rows.findIndex(x=>keys.every(k=>r[k]!=null&&String(x[k])===String(r[k]))); if(i>=0) rows[i]={...rows[i],...r}; else rows.push(r); }); return send(201,arr); }
      if(req.method==='PATCH'){ const d=JSON.parse(body); rows.filter(r=>match(r,f)).forEach(r=>Object.assign(r,d)); return send(204,{}); }
      if(req.method==='DELETE'){ for(let i=rows.length-1;i>=0;i--) if(match(rows[i],f)) rows.splice(i,1); return send(204,{}); }
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
    if(u.pathname==='/api/pod'){ const b=JSON.parse(body); calls.push(['pod',b]); if(gmailFail) return send(502,{error:{code:gmailFail,message:'Gmail: boom'}}); const o=T.dispatch_orders.find(x=>x.id===b.orderId); if(!o||!b.photoPath.startsWith('adchem/'+o.hub+'/pod/'+o.id+'/')) return send(400,{error:{code:'bad_path',message:'path '+b.photoPath}}); o.status='Delivered'; o.data.pod={collected:b.collected,issue:b.issue,note:b.note}; return send(200,{ok:true,sentAt:new Date().toISOString(),to:'orders@adchem.pro',cc:b.cc,msgId:'m1',status:'Delivered'}); }
    if(u.pathname==='/api/deposit'){ const b=JSON.parse(body); calls.push(['deposit',b]); if(!b.photoPath.startsWith('adchem/'+b.hub+'/deposits/')) return send(400,{error:{code:'bad_path',message:'path '+b.photoPath}}); return send(200,{ok:true,sentAt:new Date().toISOString(),to:'accounting@adchem.pro',msgId:'d1'}); }
    if(u.pathname==='/api/orderlog'){ const b=JSON.parse(body); calls.push(['orderlog',b]); return send(200,b.rebuild?{ok:true,rebuilt:T.dispatch_orders.length}:{ok:true,updated:0,appended:(b.orderIds||[]).length}); }
    if(u.pathname==='/api/health') return send(200,{googleConfigured:false});
    // static
    const p=path.join(ROOT,u.pathname==='/'?'index.html':u.pathname); if(!fs.existsSync(p)) return send(404,{});
    res.writeHead(200,{'content-type':{'.html':'text/html','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json'}[path.extname(p)]||'application/octet-stream'}); fs.createReadStream(p).pipe(res);
  });
  const fake={ server, T, calls,
    async start(){ CAL=await import(path.join(__dirname,'..','functions','_lib','calendars.js')); await new Promise(r=>server.listen(0,r)); const base='http://127.0.0.1:'+server.address().port; FAKES.set(base,fake); return base; },
    stop(){ return new Promise(r=>server.close(()=>r())); },
    setGmailFail(code){ gmailFail=code; } };
  return fake; }

const FAKES=new Map();
// A page wired to the fake: config.js points Supabase at it, fonts aborted, page errors in page.errs.
// opts.members replaces dispatch_members in the fake before the page loads (e.g. to sign in as a driver).
async function newPage(browser,base,opts){ opts=opts||{};
  if(opts.members&&FAKES.get(base)) FAKES.get(base).T.dispatch_members=opts.members;
  const page=await browser.newPage({viewport:opts.viewport||{width:1100,height:1500}}); page.errs=[];
  page.on('pageerror',e=>page.errs.push(String(e)));
  page.on('console',m=>{ if(m.type()==='error'&&!/fonts|ERR_FAILED/.test(m.text())) page.errs.push(m.text()); });
  await page.route('**/fonts.*/**',r=>r.abort());
  await page.route('**/config.js',r=>r.fulfill({contentType:'application/javascript',body:`window.ADCHEM_CONFIG={supabaseUrl:"${base}",supabaseAnonKey:"anon",ordersTo:"orders@adchem.pro"};`}));
  return page; }

module.exports={ makeFake, newPage, fakeRpc, SITES };
