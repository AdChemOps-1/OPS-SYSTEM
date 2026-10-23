// Shared test fake: an in-memory Supabase (auth + REST + RPC + storage) and the app's /api routes, serving public/.
// Used by test/*.test.cjs. makeFake(seed) -> { server, T, calls, start(), stop(), setGmailFail(code|null) }; newPage(browser, base, opts) -> page;
// permCheck(T, userId, company, roles, perm) is requireUser's role/permission rule, used by the fake /api/import.
const http = require('http'); const fs = require('fs'); const path = require('path');
const ROOT = path.join(__dirname, '..', 'public');
// One virtual clock for the fake server and every page: 2026-10-20 10:00 Pacific at load, then real elapsed time, so tests do not depend on the machine date
const CLOCK_OFFSET = Date.parse('2026-10-20T10:00:00-07:00') - Date.now();
const vNow = () => Date.now() + CLOCK_OFFSET, vDate = () => new Date(vNow());

function seedTables(){ return {
  dispatch_users: [{user_id:'u1',email:'jamie@adchem.pro',name:'Jamie',active:true}],
  dispatch_members: [{user_id:'u1',company:'adchem',role:'admin',hub:'',active:true},{user_id:'u1',company:'north',role:'coordinator',hub:'',active:true}],
  companies: [{id:'adchem',name:'AdChem, LLC',short_name:'AdChem',active:true,data:{}},{id:'north',name:'Northstar Gas Co.',short_name:'Northstar',active:true,data:{ordersTo:'orders@northstar.example'}}],
  dispatch_company_settings: [{company:'adchem',data:{tz:'America/Los_Angeles',sheetId:'1AGd',calendarId:'cal1',calendarConfirmed:true,nextBol:9450,ordersOutSheetId:'1OUT',nextCustomerNumber:1}},{company:'north',data:{tz:'America/Los_Angeles'}}],
  dispatch_hubs: [{company:'adchem',code:'EB',name:'East Bay — Richmond',street:'525 De Carlo Ave',city:'Richmond',state:'CA',zip:'94801',phone:'(510) 725-7841',emerg:'(800) 633-8253 — PERS',settled:true,sort:1},{company:'adchem',code:'LA',name:'Southern California — Los Angeles',street:'',city:'',state:'CA',zip:'',phone:'',emerg:'(800) 633-8253 — PERS',settled:false,sort:2},{company:'adchem',code:'CO',name:'Colorado — Denver',street:'',city:'',state:'CO',zip:'',phone:'',emerg:'(800) 633-8253 — PERS',settled:false,tz:'America/Denver',products:null,sort:3}],
  dispatch_sites: [], dispatch_orders: [], dispatch_pods: [], dispatch_invites: [], dispatch_log: [],
  dispatch_customers: [], dispatch_contacts: [], dispatch_site_hub_notes: [], dispatch_customer_activity: [], dispatch_documents: [], ...seedAssets(), ...seedStock() }; }

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

// ---- Stage 2 documents: "today", warn window, live-document lookups, visibility, and the two computed views ----
const todayOf=T=>T.__today||'2026-10-20';
const dayNum=iso=>Math.floor(Date.UTC(+iso.slice(0,4),+iso.slice(5,7)-1,+iso.slice(8,10))/86400000);
const warnDaysOf=(T,co)=>{ const s=(T.dispatch_company_settings||[]).find(x=>x.company===co); return (s&&s.data&&s.data.warnDays)||30; };
const hasVal=v=>v!=null&&String(v).trim()!=='';
// the RLS-like rule for dispatch_documents (select policy), for the signed-in fake user u1 (or userId)
function docVisible(T,row,userId){ userId=userId||'u1'; const m=T.dispatch_members.find(x=>x.user_id===userId&&x.company===row.company&&x.active); if(!m) return false;
  const perms=m.permissions&&typeof m.permissions==='object'?m.permissions:{};
  if(m.is_super_admin===true||perms.view_documents===true) return true;
  if(m.role==='driver') return row.subject_type==='person'&&row.subject_id===userId&&row.review_status==='live';
  return false; }
// latest-expiring live doc of a type for a subject (rows without an expiry sort last)
function liveDoc(T,co,type,subjType,subjId){ const rows=(T.dispatch_documents||[]).filter(d=>d.company===co&&d.subject_type===subjType&&String(d.subject_id)===String(subjId)&&d.doc_type===type&&d.review_status==='live');
  return rows.sort((a,b)=>(b.expires||'')<(a.expires||'')?-1:(b.expires||'')>(a.expires||'')?1:0)[0]||null; }
function docsDue(T){ const today=todayOf(T);
  return (T.dispatch_documents||[]).filter(d=>d.review_status==='live'&&d.expires!=null&&dayNum(d.expires)-dayNum(today)<=warnDaysOf(T,d.company)).map(d=>{
    let nm=null; if(d.subject_type==='customer'){ const c=T.dispatch_customers.find(x=>x.company===d.company&&String(x.id)===String(d.subject_id)); nm=c?c.name:null; }
    else if(d.subject_type==='company'){ const c=T.companies.find(x=>x.id===d.subject_id); nm=c?c.name:null; }
    else { const u=T.dispatch_users.find(x=>x.user_id===d.subject_id); nm=u?u.name:null; }
    return { company:d.company, id:d.id, subject_type:d.subject_type, subject_id:d.subject_id, subject_name:nm, doc_type:d.doc_type, title:d.title, number:d.number, expires:d.expires, days_left:dayNum(d.expires)-dayNum(today), review_status:d.review_status }; })
    .sort((a,b)=>a.expires<b.expires?-1:a.expires>b.expires?1:0); }

// ---- computed view: dispatch_customer_status (the 15 must-have fields; license/PSA come from live dispatch_documents) ----
function customerStatus(T){ return T.dispatch_customers.map(c=>{
  const has=v=>v!=null&&String(v).trim()!=='';
  const sites=T.dispatch_sites.filter(s=>s.company===c.company&&s.customer_id===c.id&&has(s.addr));
  const cts=T.dispatch_contacts.filter(x=>x.company===c.company&&x.customer_id===c.id);
  const lic=liveDoc(T,c.company,'cannabis_license','customer',c.id), psa=liveDoc(T,c.company,'psa','customer',c.id), today=todayOf(T), warn=warnDaysOf(T,c.company);
  const licStatus=!lic?'missing':(lic.expires&&dayNum(lic.expires)<dayNum(today))?'expired':(lic.expires&&dayNum(lic.expires)<dayNum(today)+warn)?'expiring':'valid';
  const psaX=(psa&&psa.extra)||{}, psaStatus=!psa?'missing':(hasVal(psaX.signed_customer)&&hasVal(psaX.countersigned))?'signed':['quote_sent','quote_accepted','sent_for_signature','signed_customer','countersigned','effective_date'].some(k=>hasVal(psaX[k]))?'in_progress':'missing';
  const checks=[has(c.name),has(c.legal_name),has(c.account_status),has(c.primary_hub),has(c.billing_street),has(c.billing_city),has(c.billing_state),has(c.billing_zip),
    sites.length>0, cts.some(x=>x.type==='receiving'&&has(x.phone)), cts.some(x=>x.type==='billing'&&has(x.email)),
    !!lic /* license on file */, !!lic&&has(lic.expires) /* license expiry */, psaStatus==='signed' /* PSA signed */, has(c.last_verified)];
  return { id:c.id, company:c.company, customer_id:c.customer_id, profile_complete:checks.filter(Boolean).length, license_status:licStatus, psa_status:psaStatus, psa_effective:psaX.effective_date||null, license_expires:lic?(lic.expires||null):null, license_number:lic?(lic.number||null):null, entity_status:lic&&lic.extra&&lic.extra.entity_status_sos||null };
}); }

// ---- audit: mirrors dispatch_audit() in migration 005 — one dispatch_log row per written row, {field:{from,to}} ----
const AUDITED=['dispatch_documents','dispatch_customers','dispatch_sites','dispatch_site_hub_notes','dispatch_contacts','dispatch_customer_activity'];
const AUDIT_SKIP=['updated_at','updated_by','synced_at'];
function audit(T,t,before,after){ if(!AUDITED.includes(t)) return; const r=after||before; const ch={};
  new Set(Object.keys(before||{}).concat(Object.keys(after||{}))).forEach(k=>{ if(AUDIT_SKIP.includes(k)) return; const from=before?(before[k]===undefined?null:before[k]):null, to=after?(after[k]===undefined?null:after[k]):null;
    if(JSON.stringify(from)!==JSON.stringify(to)) ch[k]={from,to}; });
  if(before&&after&&!Object.keys(ch).length) return;
  const row_id=t==='dispatch_sites'?r.site_key:t==='dispatch_site_hub_notes'?r.site_key+'/'+r.hub:r.id;
  T.dispatch_log.push({id:T.dispatch_log.length+1,at:vDate().toISOString(),company:r.company,who:'u1',what:'change',detail:{op:!before?'insert':!after?'delete':'update'},table_name:t,row_id:row_id==null?null:String(row_id),changes:ch}); }

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
  if(name==='dispatch_grant'){ T.dispatch_invites.push({email:b.p_email,name:b.p_name,role:b.p_role,hub:b.p_hub,company:b.p_company,invited_at:vDate().toISOString()}); return {code:200,body:'invited'}; }
  if(name==='dispatch_add_company'){ T.companies.push({id:b.p_id,name:b.p_name,short_name:b.p_short,active:true,data:{}}); T.dispatch_members.push({user_id:'u1',company:b.p_id,role:'admin',hub:'',active:true}); T.dispatch_company_settings.push({company:b.p_id,data:{}}); return {code:200,body:null}; }
  if(name==='dispatch_revoke'){ const u=T.dispatch_users.find(x=>x.email===b.p_email); if(u) T.dispatch_members.forEach(m=>{if(m.user_id===u.user_id&&m.company===b.p_company)m.active=false;}); return {code:200,body:null}; }
  if(name==='dispatch_set_permissions'||name==='dispatch_set_super_admin'){ const u=T.dispatch_users.find(x=>x.user_id===b.p_user||x.email===b.p_user); const m=T.dispatch_members.find(x=>x.company===b.p_company&&(x.user_id===b.p_user||(u&&x.user_id===u.user_id))); if(!m) return {code:404,body:{message:'no member'}};
    if(name==='dispatch_set_permissions') m.permissions=b.p_perms; else m.is_super_admin=!!b.p_on; return {code:200,body:null}; }
  if(name==='dispatch_set_warnings'){ const m=T.dispatch_members.find(x=>x.user_id==='u1'&&x.company===b.p_company&&x.active); if(!m||m.is_super_admin!==true) return {code:403,body:{message:'not allowed'}};
    const st=T.dispatch_company_settings.find(x=>x.company===b.p_company); if(!st) return {code:404,body:{message:'no settings'}};
    if(!(b.p_warn_days>=1&&b.p_warn_days<=365)) return {code:400,body:{message:'warn days must be 1-365'}};
    const was=st.data||{}; st.data={...st.data,warnDays:b.p_warn_days,warnings:b.p_warnings,expiryEmailRecipients:b.p_recipients};
    // the log row dispatch_set_warnings writes (migration 006): from/to of the three keys
    T.dispatch_log.push({id:T.dispatch_log.length+1,at:vDate().toISOString(),company:b.p_company,who:'u1',what:'warnings',detail:{},table_name:'dispatch_company_settings',row_id:b.p_company,
      changes:{warnDays:{from:was.warnDays??null,to:b.p_warn_days},warnings:{from:was.warnings??null,to:b.p_warnings},expiryEmailRecipients:{from:was.expiryEmailRecipients??null,to:b.p_recipients}}}); return {code:200,body:null}; }
  // migration 008: super admin only, one key of the company settings (stockAlertRecipients)
  if(name==='dispatch_set_stock_alerts'){ const m=memberOf(T,b.p_company); if(!m||m.is_super_admin!==true) return {code:403,body:{message:'not allowed'}};
    const st=T.dispatch_company_settings.find(x=>x.company===b.p_company); if(!st) return {code:404,body:{message:'no settings'}};
    if(!Array.isArray(b.p_recipients)) return {code:400,body:{message:'recipients must be a list'}};
    const was=st.data||{}; st.data={...st.data,stockAlertRecipients:b.p_recipients};
    T.dispatch_log.push({id:T.dispatch_log.length+1,at:vDate().toISOString(),company:b.p_company,who:'u1',what:'warnings',detail:{},table_name:'dispatch_company_settings',row_id:b.p_company,changes:{stockAlertRecipients:{from:was.stockAlertRecipients??null,to:b.p_recipients}}}); return {code:200,body:null}; }
  if(name==='dispatch_asset_correct'){ const a=(T.dispatch_assets||[]).find(x=>x.id===b.p_id); if(!a||!hasPerm(memberOf(T,a.company),'manage_assets')) return {code:403,body:{message:'not allowed'}};
    const f=b.p_fields||{}, now=vDate().toISOString(); ['owner_kind','owner_id','condition','notes'].forEach(k=>{ if(f[k]!==undefined) a[k]=f[k]; });
    a.updated_at=now; a.updated_by='u1';
    T.dispatch_asset_events.push({id:uuid(),company:a.company,asset_id:a.id,event_type:'corrected',from_kind:null,from_id:null,to_kind:null,to_id:null,fill_after:null,occurred_at:now,recorded_by:'u1',order_id:null,bol_number:null,site_key:null,photo_path:null,gps:null,ocr:null,note:'corrected: '+Object.keys(f).join(', '),applied:true,created_at:now});
    return {code:200,body:a}; }   // as 007: a correction with no place and no fill leaves last-seen alone
  // migration 007: any member of the company, place / fill / owner / type only, the serial normalised as stored
  if(name==='dispatch_asset_by_serial'){ if(!memberOf(T,b.p_company)) return {code:400,body:{code:'P0001',message:'not allowed'}};
    const s=normSerial(b.p_serial); return {code:200,body:(T.dispatch_assets||[]).filter(a=>a.company===b.p_company&&a.serial===s)
      .map(a=>({id:a.id,serial:a.serial,container_type_id:a.container_type_id,fill_state:a.fill_state,location_kind:a.location_kind,location_id:a.location_id,owner_kind:a.owner_kind,owner_id:a.owner_id}))}; }
  return {code:404,body:{message:'no fn '+name}}; }

// insert-or-merge on the conflict keys, audited, the way PostgREST's resolution=merge-duplicates does
function upsertRows(T,t,arr,keys){ if(!T[t]) T[t]=[]; const rows=T[t];
  arr.forEach(r=>{ if(t==='dispatch_customers'){ const hit=rows.find(x=>keys.every(k=>r[k]!=null&&String(x[k])===String(r[k]))); if(!r.id&&!hit) r.id=uuid(); if(!r.customer_id) r.customer_id=nextCustomerId(T,r.company); }
    if(t==='dispatch_documents'){ if(!r.id) r.id=uuid(); const now=vDate().toISOString(); const hit=rows.find(x=>x.id===r.id);
      if(!hit) Object.entries({title:'',number:'',status:'',file_name:'',file_type:'',source:'',notes:'',review_status:'live',extra:{},created_at:now,updated_at:now}).forEach(([k,v])=>{ if(r[k]===undefined) r[k]=v; });
      else r.updated_at=now; }
    if(t==='dispatch_contacts'){ if(!r.id) r.id=uuid(); if(!r.created_at) r.created_at=vDate().toISOString(); }
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
  const slices=!!T.__importSlices, names=()=>{ const m=new Map(); [...existing.customers.map(c=>[c.name,c.customer_id])].forEach(([n,id])=>m.set(String(n).trim().toLowerCase(),id)); return m; };
  if(b.action==='read'){ const plan=IMP.planImport(WORKBOOK(),existing);
    if(slices){ const wb=WORKBOOK(), nm=names(); plan.items.filter(i=>i.action==='customer').forEach(i=>{ if(!nm.has(String(i.name).trim().toLowerCase())) nm.set(String(i.name).trim().toLowerCase(),i.customer_id||''); });
      plan.items=plan.items.filter(i=>!/^skip:(licensing|terms)$/.test(i.key)).concat(sliceItems(wb,nm,plan.problems=plan.problems||[])); }
    return {code:200,body:{plan,sheetId}}; }
  if(b.action!=='commit'||!b.plan||!Array.isArray(b.plan.items)) return {code:400,body:{error:{code:'bad_request',message:'Read the workbook and review the plan first.'}}};
  if(permCheck(T,'u1',co,null,'manage_customers')) return {code:403,body:{error:{code:'forbidden',message:'Importing writes customers, so it also needs the manage customers permission.'}}};
  const now=vDate().toISOString(), applied=IMP.applyPlan({...b.plan,items:b.plan.items.filter(i=>!(i&&(i.action==='license'||i.action==='psa')))},existing,'u1');
  const src=r=>({...r,import_source:{...(r.import_source||{}),sheetId,at:(r.import_source&&r.import_source.at)||now}});
  upsertRows(T,'dispatch_customers',IMP.bindRows({customers:applied.customers},new Map(),co,now).customers.map(src),['company','customer_id']);
  const next=Math.max(Number(st.data.nextCustomerNumber)||1,applied.nextCustomerNumber); st.data={...st.data,nextCustomerNumber:next};   // right after the customers, as the route does
  const ids=new Map(mine('dispatch_customers').map(c=>[c.customer_id,c.id])), rows=IMP.bindRows(applied,ids,co,now);
  rows.parents.forEach(p=>{ const c=T.dispatch_customers.find(x=>x.company===co&&x.customer_id===p.customer_id); if(c){ const was={...c}; c.parent_customer_id=p.parent_customer_id; audit(T,'dispatch_customers',was,c); } });
  upsertRows(T,'dispatch_sites',rows.sites.map(src),['company','site_key']);
  upsertRows(T,'dispatch_site_hub_notes',rows.siteHubNotes,['company','site_key','hub']);
  upsertRows(T,'dispatch_contacts',rows.contacts.map(src),['id']);
  // documents after the customers: one live dispatch_documents row per license / PSA item, matched on a re-run by import_source tab and row
  const docItems=b.plan.items.filter(i=>i&&(i.action==='license'||i.action==='psa')&&i.decision===i.action&&i.doc);
  docItems.forEach(i=>{ const c=T.dispatch_customers.find(x=>x.company===co&&String(x.name).trim().toLowerCase()===String(i.name).trim().toLowerCase()); if(!c) return;
    const old=(T.dispatch_documents||[]).find(d=>d.company===co&&d.source==='import'&&d.import_source&&d.import_source.tab===i.source.tab&&d.import_source.row===i.source.row);
    upsertRows(T,'dispatch_documents',[{...(old?{id:old.id}:{}),company:co,subject_type:'customer',subject_id:c.id,title:'',...i.doc,source:'import',review_status:'live',import_source:{tab:i.source.tab,row:i.source.row,at:now}}],['id']); });
  const counts={documents:docItems.length,customers:rows.customers.length,sites:rows.sites.length,hubNotes:rows.siteHubNotes.length,contacts:rows.contacts.length,skipped:b.plan.items.filter(i=>i&&i.decision==='skip').length};
  T.dispatch_log.push({id:T.dispatch_log.length+1,at:now,company:co,who:'u1',what:'import',detail:{counts,sheetId}});
  calls.push(['customers-out',{rebuild:true}]);
  return {code:200,body:{ok:true,counts,nextCustomerNumber:next,problems:applied.problems,customersOut:st.data.customersOutSheetId?{ok:true,rebuilt:counts.customers}:{ok:false,skipped:'No Customers Out sheet is set on Setup.'}}}; }

// a stored object is visible by the rule of its document row; an object with no row falls back to the company's view rule
function docFileVisible(T,p){ if(p.split('/')[1]==='asset') return !!memberOf(T,p.split('/')[0]); const row=(T.dispatch_documents||[]).find(d=>d.file_path===p); return docVisible(T,row||{company:p.split('/')[0],subject_type:null,subject_id:null,review_status:null}); }
// /api/docs (functions/api/docs.js): sign a read URL, or approve/reject a capture
function fakeDocs(T,b,origin){
  const row=(T.dispatch_documents||[]).find(d=>d.id===b.id);
  if(b.action==='sign'){ if(!row||!docVisible(T,row)) return {code:404,body:{error:{code:'not_found',message:'Document not found.'}}};
    if(!row.file_path) return {code:400,body:{error:{code:'no_file',message:'This document has no file.'}}};
    T.dispatch_log.push({id:T.dispatch_log.length+1,at:vDate().toISOString(),company:row.company,who:'u1',what:'file_view',detail:{documentId:row.id},table_name:null,row_id:null,changes:null});
    return {code:200,body:{url:origin+'/storage/v1/object/sign/dispatch-docs/'+row.file_path+'?token=fake',expiresIn:300,fileName:row.file_name,fileType:row.file_type}}; }
  if(b.action==='review'){ if(!row) return {code:404,body:{error:{code:'not_found',message:'Document not found.'}}};
    const denied=permCheck(T,'u1',row.company,null,'manage_documents'); if(denied) return {code:denied.status,body:{error:denied.error}};
    if(b.decision!=='approve'&&b.decision!=='reject') return {code:400,body:{error:{code:'bad_decision',message:'decision must be approve or reject.'}}};
    if(row.review_status!=='pending_review') return {code:409,body:{error:{code:'not_pending',message:'That capture is no longer pending review.'}}};   // the RPCs raise 'not pending review'
    if(b.decision==='reject'){ row.review_status='rejected'; row.notes=b.reason||''; row.updated_at=vDate().toISOString(); return {code:200,body:{ok:true,id:row.id}}; }
    const f=b.fields||{}; ['doc_type','number','status','issued','expires','title','extra','notes'].forEach(k=>{ if(f[k]!==undefined) row[k]=f[k]; });
    row.review_status='live'; row.checked_on=todayOf(T); row.checked_by='u1'; row.updated_at=vDate().toISOString();
    const old=hasVal(row.number)?T.dispatch_documents.find(d=>d!==row&&d.company===row.company&&d.review_status==='live'&&d.subject_type===row.subject_type&&d.subject_id===row.subject_id&&d.doc_type===row.doc_type&&d.number===row.number):null;
    if(old){ old.review_status='rejected'; old.notes=(old.notes||'')+' superseded'; row.supersedes_id=old.id; }
    return {code:200,body:{ok:true,id:row.id}}; }
  return {code:400,body:{error:{code:'bad_request',message:'unknown action'}}}; }

// ---- Stage 3A assets: vendors, container types, serialized assets, the append-only event log, stock movements ----
const SITE_ADC1='ADC-0001 — Primary';   // site_key of customer ADC-0001's first site (the fixture the customer tests use)
function seedAssets(){ const t0='2026-10-01T00:00:00Z';
  const A=(id,co,serial,ct,ok,oid,fill,loc,lid,seen)=>({id,company:co,serial,tag:'',container_type_id:ct,owner_kind:ok,owner_id:oid,fill_state:fill,condition:'in_service',location_kind:loc,location_id:lid,last_seen_at:seen||t0,last_seen_by:'u1',hydro_due:null,acquired_on:null,notes:'',created_at:t0,updated_at:t0,created_by:'u1',updated_by:'u1'});
  return {
    dispatch_vendors:[{id:'vend-airgas',company:'adchem',name:'Airgas',roles:['fill','rent'],contact_name:'',phone:'',email:'',addr:'',notes:'',active:true}],
    dispatch_container_types:[{id:'ct-co2-50',company:'adchem',kind:'cylinder',size_label:'50lb Cylinder',product:'Carbon Dioxide',fill_lb:50,active:true},
      {id:'ct-co2-20',company:'adchem',kind:'cylinder',size_label:'20lb Cylinder',product:'Carbon Dioxide',fill_lb:20,active:true},
      {id:'ct-n2-260',company:'adchem',kind:'dewar',size_label:'260L Dewar',product:'Nitrogen',fill_lb:null,active:true},
      {id:'ct-north-co2-50',company:'north',kind:'cylinder',size_label:'50lb Cylinder',product:'Carbon Dioxide',fill_lb:50,active:true}],
    dispatch_assets:[A('as-ab1234','adchem','AB1234','ct-co2-50','adchem',null,'full','hub','EB'),
      A('as-cd5678','adchem','CD5678','ct-co2-50','vendor','vend-airgas','empty','site',SITE_ADC1),
      A('as-ef9012','adchem','EF9012','ct-co2-20','adchem',null,'full','vendor','vend-airgas'),
      A('as-zz0001','north','ZZ0001','ct-north-co2-50','adchem',null,'full','hub','LA')],
    dispatch_asset_events:[], dispatch_stock_movements:[] }; }
const normSerial=s=>String(s==null?'':s).trim().toUpperCase().replace(/[\s-]+/g,'');
const memberOf=(T,co,userId)=>T.dispatch_members.find(x=>x.user_id===(userId||'u1')&&x.company===co&&x.active)||null;
const hasPerm=(m,perm)=>!!m&&(m.is_super_admin===true||(m.permissions&&typeof m.permissions==='object'&&m.permissions[perm]===true));
const siteOnTodayOrder=(T,co,hub,siteKey)=>T.dispatch_orders.some(o=>o.company===co&&o.hub===hub&&o.date===todayOf(T)&&(o.site_key||(o.data&&o.data.siteKey))===siteKey);
const driverTouched=(T,co,userId,assetId)=>(T.dispatch_asset_events||[]).some(e=>e.company===co&&e.asset_id===assetId&&e.recorded_by===userId&&String(e.occurred_at).slice(0,10)===todayOf(T));
// the RLS-like rule for dispatch_assets (select policy); events and stock movements follow their asset / the same rule
function assetVisible(T,row,userId){ userId=userId||'u1'; const m=memberOf(T,row.company,userId); if(!m) return false;
  if(hasPerm(m,'view_assets')) return true;
  if(m.role==='driver'){ if(row.location_kind==='hub'&&row.location_id===m.hub) return true;
    if(row.location_kind==='site'&&siteOnTodayOrder(T,row.company,m.hub,row.location_id)) return true;
    return driverTouched(T,row.company,userId,row.id); }
  return false; }
function assetEventVisible(T,ev,userId){ const a=(T.dispatch_assets||[]).find(x=>x.id===ev.asset_id&&x.company===ev.company); return !!a&&assetVisible(T,a,userId); }
function stockVisible(T,row,userId){ return hasPerm(memberOf(T,row.company,userId),'view_assets'); }
const assetPathOk=(T,p)=>{ const seg=p.split('/'); if(seg[1]!=='asset') return null; const m=memberOf(T,seg[0]); return !!m&&(m.role==='driver'||hasPerm(m,'manage_assets')); };
const DRIVER_TYPES=['delivered','collected','sighted','loaded','created'];
const sameLoc=(a,k,i)=>a.location_kind===k&&String(a.location_id)===String(i);
// /api/assets: Vision read of a tag photo, the counts roll-up, and the events action (functions/api/assets.js rules)
function fakeAssets(T,b){
  const co=b.company||'adchem'; const m=memberOf(T,co);
  if(b.action==='read'){ if(!m) return {code:403,body:{error:{code:'no_access',message:'You are not a member of that company.'}}};
    if(!['cylinder','dewar','pig','tank','bin','tote'].includes(b.kind)) return {code:400,body:{error:{code:'bad_kind',message:'unknown container kind'}}};
    if(T.__visionDown) return {code:200,body:{candidates:[],raw:'',error:'Vision is not enabled'}};
    return {code:200,body:{candidates:[{text:'AB1234',score:0.9},{text:'DOT3AA2015',score:0.2}],raw:'AB1234 DOT3AA2015'}}; }
  if(b.action==='counts'){ if(!hasPerm(m,'view_assets')) return {code:403,body:{error:{code:'forbidden',message:"You don't have the view assets permission."}}};
    const g={}; (T.dispatch_assets||[]).filter(a=>a.company===co).forEach(a=>{ const ct=T.dispatch_container_types.find(c=>c.company===co&&c.id===a.container_type_id)||{};
      const hub=a.location_kind==='hub'?a.location_id:null;   // as the dispatch_asset_counts view: hub when at a hub, else null
      const k=[a.container_type_id,a.fill_state,a.location_kind,a.condition,hub].join('|'); (g[k]=g[k]||{container_type_id:a.container_type_id,product:ct.product||null,size_label:ct.size_label||null,fill_state:a.fill_state,location_kind:a.location_kind,condition:a.condition,hub,n:0}).n++; });
    return {code:200,body:{rows:Object.values(g)}}; }
  if(b.action==='events'){ if(!m) return {code:403,body:{error:{code:'no_access',message:'You are not a member of that company.'}}};
    const driver=m.role==='driver'&&!hasPerm(m,'manage_assets'); const results=[];
    const myStop=p=>!p||!p.kind||(p.kind==='hub'&&p.id===m.hub)||(p.kind==='site'&&siteOnTodayOrder(T,co,m.hub,p.id));
    const bad=(b.events||[]).findIndex(e=>!e||e.id==null||e.id===''); if(bad>=0) return {code:400,body:{error:{code:'bad_event',message:'event '+bad+' has no id'}}};
    for(const e of (b.events||[])){ const res={eventId:e.id,assetId:null,serial:normSerial(e.serial),status:'applied'};
      const reject=r=>{ res.status='rejected'; res.reason=r; results.push(res); };
      if((T.dispatch_asset_events||[]).some(x=>x.id===e.id)){ const old=T.dispatch_asset_events.find(x=>x.id===e.id); res.status='duplicate'; res.assetId=old.asset_id; results.push(res); continue; }
      if(!driver&&!hasPerm(m,'manage_assets')){ reject('not allowed'); continue; }
      if(driver){ if(!DRIVER_TYPES.includes(e.type)){ reject('not allowed'); continue; }
        if(!e.to||!e.to.kind||!myStop(e.to)||!myStop(e.from)){ reject('not your stop'); continue; } }   // 007: every driver event names its to
      const at=e.occurredAt||vDate().toISOString(); const now=vDate().toISOString();
      const ev=(asset,type,from,to,extra)=>{ const row={id:(extra&&extra.id)||uuid(),company:co,asset_id:asset.id,event_type:type,from_kind:from?from.kind:null,from_id:from?from.id:null,to_kind:to?to.kind:null,to_id:to?to.id:null,fill_after:null,occurred_at:at,recorded_by:'u1',order_id:null,bol_number:null,site_key:null,photo_path:null,gps:null,ocr:null,note:'',applied:true,created_at:now,...extra}; T.dispatch_asset_events.push(row); return row; };
      let a=(T.dispatch_assets||[]).find(x=>x.company===co&&x.serial===res.serial);
      if(a&&e.type==='created'){ reject('serial '+res.serial+' is already in the register'); continue; }   // as functions/api/assets.js
      if(!a){ if(!e.containerTypeId||!T.dispatch_container_types.some(c=>c.id===e.containerTypeId&&c.company===co)){ reject('container type required'); continue; }
        const loc=e.from||e.to||null; const ok=e.ownerKind||'adchem';
        a={id:uuid(),company:co,serial:res.serial,tag:'',container_type_id:e.containerTypeId,owner_kind:ok,owner_id:ok==='adchem'?null:(e.ownerId||null),fill_state:'unknown',condition:'in_service',location_kind:loc?loc.kind:null,location_id:loc?loc.id:null,last_seen_at:at,last_seen_by:'u1',hydro_due:null,acquired_on:null,notes:'',created_at:now,updated_at:now,created_by:'u1',updated_by:'u1'};
        T.dispatch_assets.push(a); if(e.type!=='created') ev(a,'created',null,loc,{}); }
      res.assetId=a.id;
      // 007's apply trigger: an event older than the asset's last sighting (not a correction) stays as history, applied = false,
      // and moves nothing (a late fill still draws the bulk down); the server reads applied back and warns
      const late=e.type!=='corrected'&&!!a.last_seen_at&&Date.parse(at)<Date.parse(a.last_seen_at);
      const keep=late?{kind:a.location_kind,id:a.location_id,fill:a.fill_state,seen:a.last_seen_at}:null;
      if(e.from&&e.from.kind&&!sameLoc(a,e.from.kind,e.from.id)) ev(a,'sighted',{kind:a.location_kind,id:a.location_id},e.from,{note:'was at '+a.location_kind+' '+a.location_id,applied:!late});
      if(e.from&&e.from.kind){ a.location_kind=e.from.kind; a.location_id=e.from.id; }
      const row=ev(a,e.type,e.from,e.to,{applied:!late,id:e.id,fill_after:e.fillAfter||null,order_id:e.orderId||null,bol_number:e.bolNumber||null,site_key:e.siteKey||null,photo_path:e.photoPath||null,gps:e.gps||null,ocr:e.ocr||null,note:e.note||''});
      const to=e.to&&e.to.kind?e.to:null; const mv=()=>{ if(to){ a.location_kind=to.kind; a.location_id=to.id; } };
      if(e.type==='delivered'){ mv(); a.fill_state=e.fillAfter||'full'; }
      else if(e.type==='collected'){ mv(); a.fill_state=e.fillAfter||'empty'; }
      else if(e.type==='to_vendor') mv();
      else if(e.type==='from_vendor'){ mv(); a.fill_state=e.fillAfter||'full'; }
      else if(e.type==='filled'){ a.fill_state='full'; const ct=T.dispatch_container_types.find(c=>c.company===co&&c.id===a.container_type_id);
        if(a.location_kind!=='hub') res.warning='asset is not at a hub';
        else if(ct&&typeof ct.fill_lb==='number') T.dispatch_stock_movements.push({id:uuid(),company:co,hub:a.location_id,product:ct.product,container:'',item:'',qty:-ct.fill_lb,unit:'lb',reason:'filled',vendor_id:null,order_id:null,asset_event_id:row.id,note:'',occurred_at:at,recorded_by:'u1'});
        else res.warning='no fill weight on this container type'; }
      else if(e.type==='moved') mv();
      else if(e.type==='sighted') mv();
      else if(e.type==='corrected'){ mv(); if(e.fillAfter) a.fill_state=e.fillAfter; }
      else if(e.type==='created'){ mv(); if(e.fillAfter) a.fill_state=e.fillAfter; }
      if(late){ a.location_kind=keep.kind; a.location_id=keep.id; a.fill_state=keep.fill; res.warning=(res.warning?res.warning+'; ':'')+'recorded late — did not move the container'; }
      else if(e.type!=='corrected'||e.to||e.fillAfter){ a.last_seen_at=at; a.last_seen_by='u1'; }
      a.updated_at=now; a.updated_by='u1';
      results.push(res); }
    return {code:200,body:{ok:true,results}}; }
  return {code:400,body:{error:{code:'bad_request',message:'unknown action'}}}; }

// ---- Stage 3B inventory: minimums, the computed on-hand, the orders delivered rule, /api/stock ----
function seedStock(){ const at=vDate().toISOString();
  const M=(id,product,container,item,qty,unit,reason)=>({id,company:'adchem',hub:'EB',product,container,item,qty,unit,reason,vendor_id:null,order_id:null,asset_event_id:null,note:'',occurred_at:at,recorded_by:'u1'});
  return { dispatch_stock_settings:[
      {id:'min-co2',company:'adchem',hub:'EB',product:'Carbon Dioxide',container:'',item:'',min_qty:500,unit:'lb'},
      {id:'min-reg',company:'adchem',hub:'EB',product:'',container:'',item:'Regulator',min_qty:4,unit:'count'}],
    dispatch_stock_movements:[M('sm-co2','Carbon Dioxide','','',800,'lb','received'),M('sm-reg','','','Regulator',10,'count','received'),M('sm-bin','Dry Ice - Pellet','Bin','',6,'count','produced')] }; }
const stockKey=r=>[r.hub,r.product,r.container,r.item,r.unit].join('|');
// the dispatch_stock_onhand_for view: movements summed per key, plus full in-service gas containers at hubs by type; minimums joined on (hub, product, container, item)
function onhandOf(T,company){ const g={}, row=(r)=>g[stockKey(r)]=g[stockKey(r)]||{hub:r.hub,product:r.product||'',container:r.container||'',item:r.item||'',unit:r.unit,qty:0,min_qty:null,below:false};
  (T.dispatch_stock_movements||[]).filter(m=>m.company===company).forEach(m=>{ row(m).qty+=Number(m.qty); });
  (T.dispatch_assets||[]).filter(a=>a.company===company&&a.fill_state==='full'&&a.location_kind==='hub'&&a.condition==='in_service').forEach(a=>{
    const ct=T.dispatch_container_types.find(c=>c.company===company&&c.id===a.container_type_id); if(!ct) return;
    row({hub:a.location_id,product:ct.product,container:ct.size_label,item:'',unit:'count'}).qty+=1; });
  (T.dispatch_stock_settings||[]).filter(x=>x.company===company).forEach(x=>{ const r=row({hub:x.hub,product:x.product,container:x.container,item:x.item,unit:x.unit}); r.min_qty=x.min_qty==null?null:Number(x.min_qty); });
  return Object.values(g).map(r=>({...r,below:r.min_qty!=null&&r.qty<r.min_qty}))
    .sort((a,b)=>(a.hub+'|'+a.product+'|'+a.container+'|'+a.item)<(b.hub+'|'+b.product+'|'+b.container+'|'+b.item)?-1:1); }
const DELIVERED=['Delivered','POD Received'], isDelivered=s=>DELIVERED.includes(s);
// the orders trigger of 008: entering the delivered pair draws the non-gas lines down once; leaving it writes reversing rows
function orderStatusHook(T,o,prevStatus){ if(isDelivered(prevStatus)===isDelivered(o.status)) return; const mv=T.dispatch_stock_movements, now=vDate().toISOString();
  const base={company:o.company,item:'',unit:'count',vendor_id:null,order_id:o.id,asset_event_id:null,occurred_at:now,recorded_by:'u1'};
  // net semantics: a (product, container) is "drawn" when the order's delivered + 'undelivered <id>' rows sum to non-zero
  const mine=mv.filter(m=>m.company===o.company&&m.order_id===o.id&&(m.reason==='delivered'||(m.reason==='adjusted'&&m.note==='undelivered '+o.id)));
  const drawn=(p,c)=>mine.filter(m=>m.product===p&&m.container===c).reduce((n,m)=>n+Number(m.qty),0);
  if(isDelivered(o.status)){ ((o.data&&o.data.lines)||[]).forEach(l=>{ const qty=Number(l&&l.qty); if(!l||l.category==='Gases'||!(qty>0)||drawn(l.product,l.container)!==0) return;
      const r={...base,id:uuid(),hub:o.hub,product:l.product,container:l.container,qty:-qty,reason:'delivered',note:''}; mv.push(r); mine.push(r); }); }
  else { const seen=new Set(); mine.slice().forEach(m=>{ const k=m.product+'|'+m.container; if(seen.has(k)) return; seen.add(k); const d=drawn(m.product,m.container);
      if(d!==0) mv.push({...base,id:uuid(),hub:m.hub,product:m.product,container:m.container,qty:-d,reason:'adjusted',note:'undelivered '+o.id}); }); } }
// movementsFor (functions/_lib/stock.js) as the fake's /api/stock applies it; throws Error(message) on a bad entry
function fakeMovementsFor(e,co,onhandQty){ const fail=m=>{ throw new Error(m); };
  if(!e||!['received','produced','adjusted','counted','consumed'].includes(e.kind)) fail('kind must be received, produced, adjusted, counted or consumed');
  const qty=Number(e.qty); if(e.qty===''||e.qty==null||!Number.isFinite(qty)) fail('qty must be a number');
  if(!hasVal(e.hub)) fail('hub required');
  const product=e.product||'', container=e.container||'', item=e.item||'', note=String(e.note||'').trim();
  if(/^undelivered /i.test(note)) fail('a note cannot start with "undelivered " (reserved for order reversals)');
  const bulk=hasVal(product)&&!hasVal(container)&&!hasVal(item), unit=e.unit;
  if(!hasVal(product)&&!hasVal(item)) fail('product or item required');
  if(unit!==(bulk?'lb':'count')) fail('unit must be '+(bulk?'lb':'count')+' for this item');
  const row=(p,c,i,u,q,reason)=>({id:uuid(),company:co,hub:e.hub,product:p,container:c,item:i,qty:q,unit:u,reason,vendor_id:e.vendorId||null,order_id:null,asset_event_id:null,note,occurred_at:vDate().toISOString(),recorded_by:'u1'});
  if(e.kind==='received'){ if(!(qty>0)) fail('qty must be above zero'); return [row(product,container,item,unit,qty,'received')]; }
  if(e.kind==='consumed'){ if(!(qty>0)) fail('qty must be above zero'); if(!hasVal(note)) fail('a note is required'); return [row(product,container,item,unit,-qty,'consumed')]; }
  if(e.kind==='adjusted'){ if(!qty) fail('qty must not be zero'); if(!hasVal(note)) fail('a note is required'); return [row(product,container,item,unit,qty,'adjusted')]; }
  if(e.kind==='counted'){ if(qty<0) fail('a count cannot be negative'); const d=qty-onhandQty; return d===0?[]:[row(product,container,item,unit,d,'counted')]; }
  // produced: + containers, − bulk pounds of the bulk product
  if(!(qty>0)) fail('qty must be above zero'); if(bulk||!hasVal(container)) fail('produced needs a counted container');
  const bp=e.bulkProduct||'Carbon Dioxide', lb=e.lbPerUnit==null?50:Number(e.lbPerUnit); if(!Number.isFinite(lb)||lb<=0) fail('lbPerUnit must be above zero');
  const pr=[row(product,container,item,'count',qty,'produced'),row(bp,'','','lb',-(qty*lb),'produced')]; if(!hasVal(note)) pr.forEach(r=>{ r.note='produced'; }); return pr; }
function fakeStock(T,b){
  const co=b.company||'adchem', m=memberOf(T,co);
  const deny=(c,msg)=>({code:403,body:{error:{code:c,message:msg}}});
  if(b.action==='move'){ const d=permCheck(T,'u1',co,null,'manage_assets'); if(d) return {code:d.status,body:{error:d.error}};
    const e=b.entry||{}, reads=m&&(hasPerm(m,'view_assets')||['admin','coordinator'].includes(m.role));
    // as the server: a count's delta comes from on-hand, so a caller who cannot read it may not count
    if(e.kind==='counted'&&!reads) return deny('forbidden','counting needs View assets');
    let rows; try{ const cur=onhandOf(T,co).find(r=>r.hub===e.hub&&(r.product||'')===(e.product||'')&&(r.container||'')===(e.container||'')&&(r.item||'')===(e.item||'')&&r.unit===e.unit);
      rows=fakeMovementsFor(e,co,cur?cur.qty:0); }catch(err){ return {code:400,body:{error:{code:'bad_entry',message:err.message}}}; }
    if(!rows.length) return {code:200,body:{ok:true,ids:[],note:'no change'}};
    rows.forEach(r=>T.dispatch_stock_movements.push(r)); return {code:200,body:{ok:true,ids:rows.map(r=>r.id)}}; }
  if(b.action==='onhand'||b.action==='below'){ if(!m) return deny('no_access','You are not a member of that company.');
    if(!(hasPerm(m,'view_assets')||['admin','coordinator'].includes(m.role))) return deny('forbidden',"You don't have the view assets permission.");   // view_assets or an editor, as the server
    const rows=onhandOf(T,co); return {code:200,body:{rows:b.action==='below'?rows.filter(r=>r.below):rows}}; }
  return {code:400,body:{error:{code:'bad_request',message:'unknown action'}}}; }

// ---- Stage 3B import slices: the Licensing & Entity and Account Terms tabs as license / psa items (on when T.__importSlices is set) ----
const SERIAL_BASE=Date.UTC(1899,11,30);
function sheetDate(v){ const t=String(v==null?'':v).trim(); if(!t) return {iso:''}; let m=t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if(m){ const d=new Date(Date.UTC(+m[3],+m[1]-1,+m[2])); return d.getUTCMonth()===+m[1]-1?{iso:d.toISOString().slice(0,10)}:{iso:'',bad:true}; }
  if(/^\d{4,6}$/.test(t)) return {iso:new Date(SERIAL_BASE+Number(t)*86400000).toISOString().slice(0,10)};
  return {iso:'',bad:true}; }
function sliceItems(wb,names,problems){ const out=[], lc=v=>String(v||'').trim().toLowerCase();
  const read=(rows,expected,anchor)=>{ if(!Array.isArray(rows)) return []; const hi=rows.findIndex(r=>r.includes(anchor)); if(hi<0) return []; const h=rows[hi];
    return rows.slice(hi+1).map((r,i)=>{ const o={_row:hi+i+2}; expected.forEach(k=>{ const c=h.indexOf(k); o[k]=c<0?'':r[c]==null?'':r[c]; }); return o; }).filter(o=>String(o.Customer).trim()); };
  const LIC=['Customer','Licensee Legal Name','License #','License Type','Status','Issued','Expires','County / Premises','Owners on the License','Entity Status (SOS)','Source','Checked','Notes'];   // Balance (auto) is never read
  const TERMS=['Customer','Quote Sent','Quote Accepted','PSA Sent for Signature','PSA Signed (Customer)','Countersigned (AdChem)','Effective Date'];   // money columns are never read
  const cell=(tab,row,col,v)=>{ const d=sheetDate(v); if(d.bad) problems.push(tab+' row '+row+', '+col+': "'+v+'" is not a date, so it was left empty.'); return d.iso; };
  const base=(tab,pre,r)=>{ const hit=names.has(lc(r.Customer))?(names.get(lc(r.Customer))||'-'):''; if(!hit){ problems.push(tab+' row '+r._row+': customer "'+r.Customer+'" matches no customer.');
      return {bad:{key:'problem:'+pre+r._row,source:{tab,row:r._row},action:'problem',decision:'skip',options:['skip'],customer_id:'',name:r.Customer,detail:tab+' row '+r._row+': customer matches no customer',fields:{},contacts:[],hubNotes:[],merged:[]}}; }
    return {it:{key:pre+r._row,source:{tab,row:r._row},customer_id:hit==='-'?'':hit,name:r.Customer,fields:{},contacts:[],hubNotes:[],merged:[]}}; };
  read(wb.licensing,LIC,'License #').forEach(r=>{ const b=base('Licensing & Entity','lic:',r); if(b.bad) return out.push(b.bad);
    const exp=cell('Licensing & Entity',r._row,'Expires',r.Expires);
    out.push({...b.it,action:'license',decision:'license',options:['license','skip'],detail:r['License #']+' · expires '+exp,
      doc:{doc_type:'cannabis_license',number:String(r['License #']),status:String(r.Status),issued:cell('Licensing & Entity',r._row,'Issued',r.Issued),expires:exp,
        extra:{licensee_legal_name:r['Licensee Legal Name'],license_type:r['License Type'],county_premises:r['County / Premises'],owners:r['Owners on the License'],entity_status_sos:r['Entity Status (SOS)'],source_note:String(r.Source)},
        source:String(r.Source),checked_on:cell('Licensing & Entity',r._row,'Checked',r.Checked),notes:String(r.Notes)}}); });
  read(wb.terms,TERMS,'Quote Sent').forEach(r=>{ const b=base('Account Terms','psa:',r); if(b.bad) return out.push(b.bad);
    const x={quote_sent:cell('Account Terms',r._row,'Quote Sent',r['Quote Sent']),quote_accepted:cell('Account Terms',r._row,'Quote Accepted',r['Quote Accepted']),sent_for_signature:cell('Account Terms',r._row,'PSA Sent for Signature',r['PSA Sent for Signature']),
      signed_customer:cell('Account Terms',r._row,'PSA Signed (Customer)',r['PSA Signed (Customer)']),countersigned:cell('Account Terms',r._row,'Countersigned (AdChem)',r['Countersigned (AdChem)']),effective_date:cell('Account Terms',r._row,'Effective Date',r['Effective Date'])};
    out.push({...b.it,action:'psa',decision:'psa',options:['psa','skip'],detail:'PSA · '+(x.countersigned&&x.signed_customer?'signed':x.sent_for_signature?'sent for signature':x.quote_accepted?'quote accepted':x.quote_sent?'quote sent':'started'),doc:{doc_type:'psa',extra:x}}); });
  return out; }

function makeFake(seed){
  const T=seedTables(); if(seed) Object.keys(seed).forEach(k=>{ T[k]=seed[k]; });
  const calls=[]; const EVENTS={}; let CAL=null, IMP=null, gmailFail=null, server=null;
  server=http.createServer(async (req,res)=>{
    const u=new URL(req.url,'http://x'); let body=''; for await (const c of req) body+=c;
    const send=(code,obj,hdr={})=>{res.writeHead(code,{'content-type':'application/json',...hdr});res.end(JSON.stringify(obj));};
    if(u.pathname.startsWith('/auth/v1/token')){ const b=JSON.parse(body); if(b.password==='bad') return send(400,{error:'invalid',error_description:'Invalid login credentials',msg:'Invalid login credentials'}); return send(200,{access_token:'tok',token_type:'bearer',expires_in:3600,expires_at:Math.floor(vNow()/1000)+3600,refresh_token:'r',user:{id:'u1',email:b.email,aud:'authenticated',role:'authenticated'}}); }
    if(u.pathname==='/auth/v1/user') return send(200,{id:'u1',email:'jamie@adchem.pro',aud:'authenticated',role:'authenticated'});
    if(u.pathname==='/auth/v1/logout') return send(204,{});
    if(u.pathname.startsWith('/rest/v1/rpc/')){ const r=fakeRpc(u.pathname.split('/').pop(),JSON.parse(body||'{}'),T); return send(r.code,r.body); }
    if(u.pathname.startsWith('/rest/v1/')){ const t=u.pathname.split('/')[3]; const f=parseFilters(u.searchParams);
      if(t==='dispatch_customer_status'){ if(req.method!=='GET') return send(405,{message:'view is read-only'}); let out=orderRows(customerStatus(T).filter(r=>match(r,f)),u.searchParams.get('order')); const lim=parseInt(u.searchParams.get('limit'),10); if(lim>0) out=out.slice(0,lim); if(req.headers.accept&&req.headers.accept.includes('vnd.pgrst.object')) return out.length?send(200,out[0]):send(406,{message:'none'}); return send(200,out); }
      if(t==='dispatch_documents_due'){ if(req.method!=='GET') return send(405,{message:'view is read-only'}); let out=orderRows(docsDue(T).filter(r=>docVisible(T,r)&&match(r,f)),u.searchParams.get('order')||'expires'); const lim=parseInt(u.searchParams.get('limit'),10); if(lim>0) out=out.slice(0,lim); if(req.headers.accept&&req.headers.accept.includes('vnd.pgrst.object')) return out.length?send(200,out[0]):send(406,{message:'none'}); return send(200,out); }
      if(!T[t]) T[t]=[]; const rows=T[t];
      if(t==='dispatch_documents'&&req.method!=='GET'){   // insert/update/delete policies + dispatch_documents_capture_guard / subject_guard
        const arr=req.method==='POST'?[].concat(JSON.parse(body)):[]; req.docArr=arr;
        const targets=req.method==='POST'?arr:rows.filter(r=>match(r,f));
        for(const r of targets){ const m=T.dispatch_members.find(x=>x.user_id==='u1'&&x.company===r.company&&x.active); const perms=m&&m.permissions&&typeof m.permissions==='object'?m.permissions:{}; const mgr=!!m&&(m.is_super_admin===true||perms.manage_documents===true);
          if(req.method==='POST'&&m&&m.role==='driver'&&!mgr){
            if(r.subject_type!=='customer'||!String(r.file_path||'').startsWith(r.company+'/capture/')) return send(403,{message:'row-level security / capture guard'});
            // the capture guard: as the driver; the phone's captured_at kept when within the last 30 days, never later than now
            const now=vNow(), at=r.captured_at?Date.parse(r.captured_at):NaN;
            r.review_status='pending_review'; r.captured_by='u1'; r.created_by='u1'; r.captured_at=at>=now-30*86400000?new Date(Math.min(at,now)).toISOString():new Date(now).toISOString(); }
          else if(!mgr) return send(403,{message:'row-level security'});
          if(req.method==='POST'){ const ok=r.subject_type==='customer'?T.dispatch_customers.some(c=>c.company===r.company&&String(c.id)===String(r.subject_id)):r.subject_type==='company'?r.subject_id===r.company:r.subject_type==='person'?T.dispatch_members.some(x=>x.company===r.company&&x.user_id===r.subject_id&&x.active):false;
            if(!ok) return send(400,{message:'subject not in company'}); } }
      }
      if(t==='dispatch_stock_settings'&&req.method!=='GET'){ const arr=req.method==='POST'?[].concat(JSON.parse(body)):rows.filter(r=>match(r,f));   // dss_write: manage_assets
        if(arr.some(r=>!hasPerm(memberOf(T,r.company),'manage_assets'))) return send(403,{message:'row-level security'}); }
      if(t==='dispatch_stock_movements'&&req.method!=='GET'){ const arr=req.method==='POST'?[].concat(JSON.parse(body)):[];   // dstock_insert: filled and delivered are written by triggers only
        if(req.method!=='POST'||arr.some(r=>!hasPerm(memberOf(T,r.company),'manage_assets')||['filled','delivered'].includes(r.reason))) return send(403,{message:'row-level security'}); }
      if(req.method==='GET'){ let out=orderRows(rows.filter(r=>match(r,f)&&(t!=='dispatch_stock_settings'||stockVisible(T,r))&&(t!=='dispatch_log'||logVisible(T,r))&&(t!=='dispatch_documents'||docVisible(T,r))&&(t!=='dispatch_assets'||assetVisible(T,r))&&(t!=='dispatch_asset_events'||assetEventVisible(T,r))&&(t!=='dispatch_stock_movements'||stockVisible(T,r))),u.searchParams.get('order')); const lim=parseInt(u.searchParams.get('limit'),10); if(lim>0) out=out.slice(0,lim); if(req.headers.accept&&req.headers.accept.includes('vnd.pgrst.object')) return out.length?send(200,out[0]):send(406,{message:'none'}); return send(200,out); }
      if(req.method==='POST'){ const arr=req.docArr||[].concat(JSON.parse(body)); const keys=(u.searchParams.get('on_conflict')||'id').split(',');
        // a plain insert (no Prefer resolution) of an existing document id is the primary key's unique violation, as PostgREST answers it
        const dup=r=>rows.some(x=>keys.every(k=>r[k]!=null&&String(x[k])===String(r[k])));
        if(t==='dispatch_documents'&&!/resolution=/.test(req.headers.prefer||'')&&arr.some(dup)) return send(409,{code:'23505',details:null,hint:null,message:'duplicate key value violates unique constraint "dispatch_documents_pkey"'});
        const prev=t==='dispatch_orders'?new Map(rows.filter(x=>arr.some(r=>r.id===x.id&&r.company===x.company)).map(x=>[x.company+'|'+x.id,x.status])):null;
        upsertRows(T,t,arr,keys);
        if(prev) arr.forEach(r=>{ const o=rows.find(x=>x.id===r.id&&x.company===r.company); if(o) orderStatusHook(T,o,prev.get(o.company+'|'+o.id)); });
        return send(201,arr); }
      if(req.method==='PATCH'){ const d=JSON.parse(body); rows.filter(r=>match(r,f)).forEach(r=>{ const was={...r}; Object.assign(r,d); audit(T,t,was,r); if(t==='dispatch_orders') orderStatusHook(T,r,was.status); }); return send(204,{}); }
      if(req.method==='DELETE'){ for(let i=rows.length-1;i>=0;i--) if(match(rows[i],f)){ audit(T,t,rows[i],null); rows.splice(i,1); } return send(204,{}); }
    }
    if(u.pathname.startsWith('/storage/v1/object/sign/dispatch-docs/')){ const p=decodeURIComponent(u.pathname.slice('/storage/v1/object/sign/dispatch-docs/'.length));
      if(!(T.__objects||[]).includes(p)||!docFileVisible(T,p)) return send(404,{error:'not_found',message:'Object not found'});
      return send(200,{signedURL:'/storage/v1/object/sign/dispatch-docs/'+p+'?token=fake'}); }
    if(u.pathname.startsWith('/storage/v1/object/dispatch-docs/')){ const p=decodeURIComponent(u.pathname.slice('/storage/v1/object/dispatch-docs/'.length)); calls.push(['upload',p]); if(assetPathOk(T,p)===false) return send(403,{statusCode:'403',error:'Unauthorized',message:'new row violates row-level security policy'});
      // no upsert: an object already at that path is refused the way Storage does (HTTP 400, statusCode 409 Duplicate)
      if((T.__objects=T.__objects||[]).includes(p)) return send(400,{statusCode:'409',error:'Duplicate',message:'The resource already exists'});
      T.__objects.push(p); return send(200,{Key:'dispatch-docs/'+p}); }
    if(u.pathname.startsWith('/storage/v1/object/dispatch-pods/')){ calls.push(['upload',u.pathname]); return send(200,{Key:u.pathname.replace('/storage/v1/object/','')}); }
    if(u.pathname==='/api/feed'){ const co=JSON.parse(body||'{}').company||'adchem'; T.dispatch_sites=T.dispatch_sites.filter(s=>s.company!==co).concat(SITES.map(r=>({company:co,site_key:r[13],customer:r[0],code_raw:r[1],code:r[1].split(' - ')[0],addr:r[2].replace(/\s*\(billing address[^)]*\)\s*/,'').trim(),unconfirmed:/confirm the delivery/.test(r[2]),city:r[3],hub:r[4],contact:r[5],phone:r[6],gate:r[7],hours:r[8],instr:r[11],site_label:r[12],copy_to:'',synced_at:vDate().toISOString()}))); return send(200,{ok:true,sites:SITES.length,customers:5,unconfirmed:1}); }
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
    if(u.pathname==='/api/pod'){ const b=JSON.parse(body); calls.push(['pod',b]); if(gmailFail) return send(502,{error:{code:gmailFail,message:'Gmail: boom'}}); const o=T.dispatch_orders.find(x=>x.id===b.orderId); if(!o||!b.photoPath.startsWith('adchem/'+o.hub+'/pod/'+o.id+'/')) return send(400,{error:{code:'bad_path',message:'path '+b.photoPath}}); const was=o.status; if(['Intake','Confirmed','Scheduled','BOL Created','Out for Delivery'].includes(was)){ o.status='Delivered'; orderStatusHook(T,o,was); } o.data.pod={collected:b.collected,issue:b.issue,note:b.note}; return send(200,{ok:true,sentAt:vDate().toISOString(),to:'orders@adchem.pro',cc:b.cc,msgId:'m1',status:'Delivered'}); }
    if(u.pathname==='/api/deposit'){ const b=JSON.parse(body); calls.push(['deposit',b]); if(!b.photoPath.startsWith('adchem/'+b.hub+'/deposits/')) return send(400,{error:{code:'bad_path',message:'path '+b.photoPath}}); return send(200,{ok:true,sentAt:vDate().toISOString(),to:'accounting@adchem.pro',msgId:'d1'}); }
    if(u.pathname==='/api/orderlog'){ const b=JSON.parse(body); calls.push(['orderlog',b]); return send(200,b.rebuild?{ok:true,rebuilt:T.dispatch_orders.length}:{ok:true,updated:0,appended:(b.orderIds||[]).length}); }
    if(u.pathname==='/api/customers-out'){ const {company,...b}=JSON.parse(body||'{}'); if(!company) return send(400,{error:{code:'no_company',message:'company required'}}); calls.push(['customers-out',b]);
      return send(200,b.rebuild?{ok:true,rebuilt:T.dispatch_customers.filter(c=>c.company===company).length}:{ok:true,updated:0,appended:(b.customerIds||[]).length}); }
    if(u.pathname==='/api/import'){ const r=fakeImport(T,JSON.parse(body||'{}'),IMP,calls); return send(r.code,r.body); }
    if(u.pathname==='/api/assets'){ const b=JSON.parse(body||'{}'); if(b.action==='events') calls.push(['assets-events',(b.events||[]).map(e=>e&&e.serial)]); const r=fakeAssets(T,b); return send(r.code,r.body); }
    if(u.pathname==='/api/stock'){ const r=fakeStock(T,JSON.parse(body||'{}')); return send(r.code,r.body); }
    if(u.pathname==='/api/docs'){ const r=fakeDocs(T,JSON.parse(body||'{}'),'http://'+req.headers.host); return send(r.code,r.body); }
    if(u.pathname==='/api/expiry'){ const {company,...b}=JSON.parse(body||'{}'); calls.push(['expiry',b]); const sent=[], skipped=[];
      // Send now (the app always sends its company) mails that company only; without one (the cron shape) every company
      if(b.send){ T.companies.filter(c=>!company||c.id===company).forEach(c=>{ const st=T.dispatch_company_settings.find(x=>x.company===c.id), to=(st&&st.data.expiryEmailRecipients)||[], n=docsDue(T).filter(d=>d.company===c.id).length;
        if(to.length&&n) sent.push({company:c.id,to,count:n}); else skipped.push({company:c.id,reason:to.length?'nothing_due':'no_recipients'}); }); }
      // the stock email rides the same job: one per company with recipients and at least one row below its minimum
      const stock={sent:[],skipped:[]};
      if(b.send){ T.companies.filter(c=>!company||c.id===company).forEach(c=>{ const st=T.dispatch_company_settings.find(x=>x.company===c.id), to=(st&&st.data.stockAlertRecipients)||[], n=onhandOf(T,c.id).filter(r=>r.below).length;
        if(to.length&&n){ calls.push(['stock_alert',{company:c.id,to,count:n}]); stock.sent.push({company:c.id,to,count:n}); } else stock.skipped.push({company:c.id,reason:to.length?'nothing_below':'no_recipients'}); }); }
      return send(200,{ok:true,sent,skipped,stock}); }
    if(u.pathname==='/api/health') return send(200,{googleConfigured:!u.searchParams.has('nogoogle'),impersonate:'ops-system@adchem.pro',mailFrom:'orders@adchem.pro',ordersTo:'orders@adchem.pro',accountingTo:'accounting@adchem.pro',checks:{token:'ok',vision:'ok',customersOut:'ok',importSheet:'ok',docsBucket:'ok',expiryCron:'ok'},lastExpiryEmail:null});
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
  // the app's clock is the fake's virtual clock (see CLOCK_OFFSET)
  await page.addInitScript(off=>{ const R=Date;
    class D extends R{ constructor(...a){ super(...(a.length?a:[R.now()+off])); } static now(){ return R.now()+off; } }
    window.Date=D; },CLOCK_OFFSET);
  await page.route('**/fonts.*/**',r=>r.abort());
  await page.route('**/config.js',r=>r.fulfill({contentType:'application/javascript',body:`window.ADCHEM_CONFIG={supabaseUrl:"${base}",supabaseAnonKey:"anon",ordersTo:"orders@adchem.pro"};`}));
  return page; }

module.exports={ makeFake, newPage, fakeRpc, permCheck, SITES };
