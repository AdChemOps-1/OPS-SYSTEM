// Shared test fake: an in-memory Supabase (auth + REST + RPC + storage) and the app's /api routes, serving public/.
// Used by test/*.test.cjs. makeFake(seed) -> { server, T, calls, start(), stop(), setGmailFail(code|null) }; newPage(browser, base, opts) -> page;
// permCheck(T, userId, company, roles, perm) is requireUser's role/permission rule, used by the fake /api/import.
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

// ---- REST filters: eq neq gte lte in (quoted values ok) ilike is, plus or=(a.eq.x,b.eq.y); select= (embeds ignored), order=, limit= ----
function cmpOp(x,op,val){
  if(op==='eq') return String(x)===String(val);
  if(op==='neq') return String(x)!==String(val);
  if(op==='gte') return String(x)>=val;
  if(op==='lte') return String(x)<=val;
  if(op==='in') return parseIn(val).includes(String(x));
  if(op==='ilike'){ const re=new RegExp('^'+String(val).replace(/[.+^${}()|[\]\\]/g,'\\$&').replace(/\*/g,'.*').replace(/%/g,'.*')+'$','i'); return re.test(x==null?'':String(x)); }
  if(op==='is'){ if(val==='null') return x==null; if(val==='true') return x===true; if(val==='false') return x===false; return false; }
  return true; }
// in.(a,"b, c",d): PostgREST list; supabase-js double-quotes values containing , ( or )
function parseIn(val){ const s=val.replace(/^\(|\)$/g,''), out=[]; let cur='', q=false;
  for(let i=0;i<s.length;i++){ const ch=s[i];
    if(q&&ch==='\\'&&i+1<s.length){ cur+=s[++i]; continue; }
    if(ch==='"'){ q=!q; continue; }
    if(ch===','&&!q){ out.push(cur); cur=''; continue; }
    cur+=ch; }
  out.push(cur); return out; }
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

// ---- audit: mirrors dispatch_audit() in migration 005 — one dispatch_log row per written row, {field:{from,to}} ----
const AUDITED=['dispatch_customers','dispatch_sites','dispatch_site_hub_notes','dispatch_contacts','dispatch_customer_activity'];
const AUDIT_SKIP=['updated_at','updated_by','synced_at'];
function audit(T,t,before,after){ if(!AUDITED.includes(t)) return; const r=after||before; const ch={};
  new Set(Object.keys(before||{}).concat(Object.keys(after||{}))).forEach(k=>{ if(AUDIT_SKIP.includes(k)) return; const from=before?(before[k]===undefined?null:before[k]):null, to=after?(after[k]===undefined?null:after[k]):null;
    if(JSON.stringify(from)!==JSON.stringify(to)) ch[k]={from,to}; });
  if(before&&after&&!Object.keys(ch).length) return;
  const row_id=t==='dispatch_sites'?r.site_key:t==='dispatch_site_hub_notes'?r.site_key+'/'+r.hub:r.id;
  T.dispatch_log.push({id:T.dispatch_log.length+1,at:new Date().toISOString(),company:r.company,who:'u1',what:'change',detail:{op:!before?'insert':!after?'delete':'update'},table_name:t,row_id:row_id==null?null:String(row_id),changes:ch}); }

function uuid(){ return require('crypto').randomUUID(); }
// mirrors dispatch_assign_customer_id(): the counter, but never at or below the company's highest ADC-n (a stale counter heals)
function nextCustomerId(T,company){ const s=T.dispatch_company_settings.find(x=>x.company===company); if(!s) return null;
  const top=Math.max(0,...T.dispatch_customers.filter(c=>c.company===company).map(c=>{ const m=String(c.customer_id||'').match(/^ADC-(\d{1,9})$/); return m?parseInt(m[1],10):0; }));
  const n=Math.max(s.data.nextCustomerNumber||1,top+1); s.data.nextCustomerNumber=n+1; return 'ADC-'+String(n).padStart(4,'0'); }
// dispatch_log's select policies (001 dl_admin_read, 005 dl_editor_read) for the signed-in fake user u1: admins read every row,
// coordinators the change rows (History), drivers nothing
function logVisible(T,row){ const m=T.dispatch_members.find(x=>x.user_id==='u1'&&x.company===row.company&&x.active); if(!m) return false;
  if(m.role==='admin') return true; if(m.role==='coordinator') return row.table_name!=null&&row.what==='change'; return false; }

function fakeRpc(name,b,T){
  if(name==='dispatch_next_bol'){ const co=b.p_company||'adchem'; const s=T.dispatch_company_settings.find(x=>x.company===co).data; const o=T.dispatch_orders.find(x=>x.id===b.p_order_id&&x.company===co); if(o&&o.bol_no) return {code:200,body:o.bol_no}; if(!s.nextBol) return {code:200,body:null}; const n=s.nextBol; s.nextBol=n+1; if(o) o.bol_no=n; return {code:200,body:n}; }
  if(name==='dispatch_grant'){ T.dispatch_invites.push({email:b.p_email,name:b.p_name,role:b.p_role,hub:b.p_hub,company:b.p_company,invited_at:new Date().toISOString()}); return {code:200,body:'invited'}; }
  if(name==='dispatch_add_company'){ T.companies.push({id:b.p_id,name:b.p_name,short_name:b.p_short,active:true,data:{}}); T.dispatch_members.push({user_id:'u1',company:b.p_id,role:'admin',hub:'',active:true}); T.dispatch_company_settings.push({company:b.p_id,data:{}}); return {code:200,body:null}; }
  if(name==='dispatch_revoke'){ const u=T.dispatch_users.find(x=>x.email===b.p_email); if(u) T.dispatch_members.forEach(m=>{if(m.user_id===u.user_id&&m.company===b.p_company)m.active=false;}); return {code:200,body:null}; }
  if(name==='dispatch_set_permissions'||name==='dispatch_set_super_admin'){ const u=T.dispatch_users.find(x=>x.user_id===b.p_user||x.email===b.p_user); const m=T.dispatch_members.find(x=>x.company===b.p_company&&(x.user_id===b.p_user||(u&&x.user_id===u.user_id))); if(!m) return {code:404,body:{message:'no member'}};
    if(name==='dispatch_set_permissions') m.permissions=b.p_perms; else m.is_super_admin=!!b.p_on; return {code:200,body:null}; }
  return {code:404,body:{message:'no fn '+name}}; }

// insert-or-merge on the conflict keys, audited, the way PostgREST's resolution=merge-duplicates does
function upsertRows(T,t,arr,keys){ if(!T[t]) T[t]=[]; const rows=T[t];
  arr.forEach(r=>{ if(t==='dispatch_customers'){ const hit=rows.find(x=>keys.every(k=>r[k]!=null&&String(x[k])===String(r[k]))); if(!r.id&&!hit) r.id=uuid(); if(!r.customer_id) r.customer_id=nextCustomerId(T,r.company); }
    if(t==='dispatch_contacts'){ if(!r.id) r.id=uuid(); if(!r.created_at) r.created_at=new Date().toISOString(); }
    const i=rows.findIndex(x=>keys.every(k=>r[k]!=null&&String(x[k])===String(r[k]))); if(i>=0){ const was={...rows[i]}; rows[i]={...rows[i],...r}; audit(T,t,was,rows[i]); } else { rows.push(r); audit(T,t,null,r); } }); }

// requireUser(request, env, roles, company, perm) from functions/_lib/auth.js, against the fake's tables: null when allowed, else {status, error}
function permCheck(T,userId,company,roles,perm){
  const mem=T.dispatch_members.filter(m=>m.user_id===userId&&m.active);
  if(!mem.length) return {status:403,error:{code:'no_access',message:'This account has no access to AdChem Ops.'}};
  const me=mem.find(m=>m.company===(company||mem[0].company));
  if(!me) return {status:403,error:{code:'no_access',message:'You are not a member of that company.'}};
  if(roles&&!roles.includes(me.role)) return {status:403,error:{code:'forbidden',message:"Your role can't do that."}};
  const perms=me.permissions&&typeof me.permissions==='object'?me.permissions:{};
  if(perm&&!(me.is_super_admin===true||perms[perm]===true)) return {status:403,error:{code:'forbidden',message:"You don't have the "+perm.replace(/_/g,' ')+' permission.'}};
  return null; }

// /api/import (functions/api/import.js) with the real planner, reading test/fixtures/import-workbook.json in place of the Google workbook
const WORKBOOK=()=>JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures','import-workbook.json'),'utf8'));
function fakeImport(T,b,IMP,calls){
  const co=b.company||'adchem';
  const denied=permCheck(T,'u1',co,['admin','coordinator'],'run_imports'); if(denied) return {code:denied.status,body:{error:denied.error}};
  const st=T.dispatch_company_settings.find(x=>x.company===co), sheetId=IMP.sheetIdFrom(st&&st.data.importSheetId);
  if(!sheetId) return {code:400,body:{error:{code:'config',message:'No import workbook is set. Paste its link on Setup first.'}}};
  calls.push(['import',{action:b.action,sheetId}]);
  const mine=t=>(T[t]||[]).filter(r=>r.company===co);
  const existing={customers:mine('dispatch_customers'),sites:mine('dispatch_sites'),contacts:mine('dispatch_contacts'),hubNotes:mine('dispatch_site_hub_notes')};
  if(b.action==='read') return {code:200,body:{plan:IMP.planImport(WORKBOOK(),existing),sheetId}};
  if(b.action!=='commit'||!b.plan||!Array.isArray(b.plan.items)) return {code:400,body:{error:{code:'bad_request',message:'Read the workbook and review the plan first.'}}};
  if(permCheck(T,'u1',co,null,'manage_customers')) return {code:403,body:{error:{code:'forbidden',message:'Importing writes customers, so it also needs the manage customers permission.'}}};
  const now=new Date().toISOString(), applied=IMP.applyPlan(b.plan,existing,'u1');
  const src=r=>({...r,import_source:{...(r.import_source||{}),sheetId,at:(r.import_source&&r.import_source.at)||now}});
  upsertRows(T,'dispatch_customers',IMP.bindRows({customers:applied.customers},new Map(),co,now).customers.map(src),['company','customer_id']);
  const next=Math.max(Number(st.data.nextCustomerNumber)||1,applied.nextCustomerNumber); st.data={...st.data,nextCustomerNumber:next};   // right after the customers, as the route does
  const ids=new Map(mine('dispatch_customers').map(c=>[c.customer_id,c.id])), rows=IMP.bindRows(applied,ids,co,now);
  rows.parents.forEach(p=>{ const c=T.dispatch_customers.find(x=>x.company===co&&x.customer_id===p.customer_id); if(c){ const was={...c}; c.parent_customer_id=p.parent_customer_id; audit(T,'dispatch_customers',was,c); } });
  upsertRows(T,'dispatch_sites',rows.sites.map(src),['company','site_key']);
  upsertRows(T,'dispatch_site_hub_notes',rows.siteHubNotes,['company','site_key','hub']);
  upsertRows(T,'dispatch_contacts',rows.contacts.map(src),['id']);
  const counts={customers:rows.customers.length,sites:rows.sites.length,hubNotes:rows.siteHubNotes.length,contacts:rows.contacts.length,skipped:b.plan.items.filter(i=>i&&i.decision==='skip').length};
  T.dispatch_log.push({id:T.dispatch_log.length+1,at:now,company:co,who:'u1',what:'import',detail:{counts,sheetId}});
  calls.push(['customers-out',{rebuild:true}]);
  return {code:200,body:{ok:true,counts,nextCustomerNumber:next,problems:applied.problems,customersOut:st.data.customersOutSheetId?{ok:true,rebuilt:counts.customers}:{ok:false,skipped:'No Customers Out sheet is set on Setup.'}}}; }

function makeFake(seed){
  const T=seedTables(); if(seed) Object.keys(seed).forEach(k=>{ T[k]=seed[k]; });
  const calls=[]; const EVENTS={}; let CAL=null, IMP=null, gmailFail=null, server=null;
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
      if(req.method==='GET'){ let out=orderRows(rows.filter(r=>match(r,f)&&(t!=='dispatch_log'||logVisible(T,r))),u.searchParams.get('order')); const lim=parseInt(u.searchParams.get('limit'),10); if(lim>0) out=out.slice(0,lim); if(req.headers.accept&&req.headers.accept.includes('vnd.pgrst.object')) return out.length?send(200,out[0]):send(406,{message:'none'}); return send(200,out); }
      if(req.method==='POST'){ const arr=[].concat(JSON.parse(body)); upsertRows(T,t,arr,(u.searchParams.get('on_conflict')||'id').split(',')); return send(201,arr); }
      if(req.method==='PATCH'){ const d=JSON.parse(body); rows.filter(r=>match(r,f)).forEach(r=>{ const was={...r}; Object.assign(r,d); audit(T,t,was,r); }); return send(204,{}); }
      if(req.method==='DELETE'){ for(let i=rows.length-1;i>=0;i--) if(match(rows[i],f)){ audit(T,t,rows[i],null); rows.splice(i,1); } return send(204,{}); }
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
    if(u.pathname==='/api/customers-out'){ const {company,...b}=JSON.parse(body||'{}'); if(!company) return send(400,{error:{code:'no_company',message:'company required'}}); calls.push(['customers-out',b]);
      return send(200,b.rebuild?{ok:true,rebuilt:T.dispatch_customers.filter(c=>c.company===company).length}:{ok:true,updated:0,appended:(b.customerIds||[]).length}); }
    if(u.pathname==='/api/import'){ const r=fakeImport(T,JSON.parse(body||'{}'),IMP,calls); return send(r.code,r.body); }
    if(u.pathname==='/api/health') return send(200,{googleConfigured:true,impersonate:'ops-system@adchem.pro',mailFrom:'orders@adchem.pro',ordersTo:'orders@adchem.pro',accountingTo:'accounting@adchem.pro',checks:{token:'ok',customersOut:'ok',importSheet:'ok'}});
    // static
    const p=path.join(ROOT,u.pathname==='/'?'index.html':u.pathname); if(!fs.existsSync(p)) return send(404,{});
    res.writeHead(200,{'content-type':{'.html':'text/html','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json'}[path.extname(p)]||'application/octet-stream'}); fs.createReadStream(p).pipe(res);
  });
  const fake={ server, T, calls,
    async start(){ CAL=await import(path.join(__dirname,'..','functions','_lib','calendars.js'));
      IMP={...await import(path.join(__dirname,'..','functions','_lib','importsheet.js')),sheetIdFrom:(await import(path.join(__dirname,'..','functions','_lib','orderlog.js'))).sheetIdFrom}; await new Promise(r=>server.listen(0,r)); const base='http://127.0.0.1:'+server.address().port; FAKES.set(base,fake); return base; },
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

module.exports={ makeFake, newPage, fakeRpc, permCheck, SITES };
