/* AdChem Ops — Customers screen: list, new customer, profile (tabs profile|sites|contacts|activity|history).
   Loaded after app.js and uses its globals (state, $, esc, banner, supa, sbErr, hubBy). Every query is scoped by state.company.
   Writes need the manage_customers permission (or super admin); the database enforces it and the buttons follow canManageCustomers(). */

state.customers=state.customers||[]; state.customer=null; state.custStatus={}; state.custTab="profile";

const CUST_FIELDS=[["cName","name"],["cAka","also_known_as"],["cLegal","legal_name"],["cStatus","account_status"],["cHub","primary_hub"],["cParent","parent_customer_id"],
  ["cBillStreet","billing_street"],["cBillCity","billing_city"],["cBillState","billing_state"],["cBillZip","billing_zip"],["cVerified","last_verified"],["cNotes","notes"]];
const CUST_NULLABLE={parent_customer_id:true,last_verified:true};
const CUST_TABS=["profile","sites","contacts","activity","history"];
const CUST_MUST=15;

function canManageCustomers(){ var me=state.me||{}; return !!(me.isSuper||(me.perms||{}).manage_customers); }
function newUuid(){ if(window.crypto&&crypto.randomUUID) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g,function(c){var r=Math.random()*16|0; return (c==="x"?r:(r&3|8)).toString(16);}); }

const CDB={
  async customers(){ return sbErr(await supa.from("dispatch_customers").select("*").eq("company",state.company).order("name")); },
  async customer(id){ return sbErr(await supa.from("dispatch_customers").select("*").eq("company",state.company).eq("id",id).maybeSingle()); },
  // c with an id that is already in the table is updated; otherwise inserted (the trigger assigns customer_id). Returns the row as stored.
  async saveCustomer(c){
    var uid=state.session.user.id, row=Object.assign({},c,{company:state.company,updated_by:uid,updated_at:new Date().toISOString()});
    if(c.id&&!c._new){ delete row.id; delete row.customer_id; delete row.created_by; delete row.created_at; delete row._new;
      sbErr(await supa.from("dispatch_customers").update(row).eq("company",state.company).eq("id",c.id)); }
    else { row.id=c.id||newUuid(); row.created_by=uid; delete row._new; if(!row.customer_id) delete row.customer_id;
      sbErr(await supa.from("dispatch_customers").insert(row)); c.id=row.id; }
    return await CDB.customer(c.id);
  },
  async sitesFor(customerId){ return sbErr(await supa.from("dispatch_sites").select("*").eq("company",state.company).eq("customer_id",customerId).order("site_label")); },
  async saveSite(s){ sbErr(await supa.from("dispatch_sites").upsert(Object.assign({},s,{company:state.company,updated_by:state.session.user.id}),{onConflict:"company,site_key"})); },
  async hubNotesFor(siteKey){ return sbErr(await supa.from("dispatch_site_hub_notes").select("*").eq("company",state.company).eq("site_key",siteKey).order("hub")); },
  async saveHubNote(n){ sbErr(await supa.from("dispatch_site_hub_notes").upsert(Object.assign({},n,{company:state.company,updated_by:state.session.user.id,updated_at:new Date().toISOString()}),{onConflict:"company,site_key,hub"})); },
  async contactsFor(customerId){ return sbErr(await supa.from("dispatch_contacts").select("*").eq("company",state.company).eq("customer_id",customerId).order("last_name")); },
  async saveContact(c){
    var uid=state.session.user.id, row=Object.assign({},c,{company:state.company,updated_by:uid,updated_at:new Date().toISOString()});
    if(c.id){ delete row.id; delete row.created_by; delete row.created_at; sbErr(await supa.from("dispatch_contacts").update(row).eq("company",state.company).eq("id",c.id)); return c.id; }
    row.id=newUuid(); row.created_by=uid; sbErr(await supa.from("dispatch_contacts").insert(row)); return row.id;
  },
  async activityFor(customerId){ return sbErr(await supa.from("dispatch_customer_activity").select("*").eq("company",state.company).eq("customer_id",customerId).order("occurred_at",{ascending:false})); },
  async addActivity(a){ var row=Object.assign({id:newUuid(),occurred_at:new Date().toISOString()},a,{company:state.company,logged_by:state.session.user.id});
    sbErr(await supa.from("dispatch_customer_activity").insert(row)); return row.id; },
  async reviewNote(id,status,reason){ sbErr(await supa.from("dispatch_customer_activity").update({status:status,reviewed_by:state.session.user.id,reviewed_at:new Date().toISOString(),rejection_reason:status==="rejected"?(reason||""):null}).eq("company",state.company).eq("id",id)); },
  // dispatch_log rows for the customer itself, its sites and site hub notes, and its contacts and activity; newest first.
  async historyFor(customerId){
    var sites=await CDB.sitesFor(customerId), cts=await CDB.contactsFor(customerId), acts=await CDB.activityFor(customerId);
    var keys=sites.map(function(s){return s.site_key;});
    var q=function(){ return supa.from("dispatch_log").select("*").eq("company",state.company); };
    var reqs=[q().eq("table_name","dispatch_customers").eq("row_id",customerId)];
    if(keys.length){ reqs.push(q().eq("table_name","dispatch_sites").in("row_id",keys));
      reqs.push(q().eq("table_name","dispatch_site_hub_notes").in("row_id",[].concat.apply([],keys.map(function(k){return state.hubs.map(function(h){return k+"/"+h.code;});})))); }
    if(cts.length) reqs.push(q().eq("table_name","dispatch_contacts").in("row_id",cts.map(function(c){return c.id;})));
    if(acts.length) reqs.push(q().eq("table_name","dispatch_customer_activity").in("row_id",acts.map(function(a){return a.id;})));
    var out=[]; (await Promise.all(reqs)).forEach(function(r){ out=out.concat(sbErr(r)||[]); });
    return out.sort(function(a,b){ return String(b.at||"").localeCompare(String(a.at||"")); });
  },
  async statusFor(customerId){ return sbErr(await supa.from("dispatch_customer_status").select("*").eq("company",state.company).eq("id",customerId).maybeSingle()); },
  async statuses(){ return sbErr(await supa.from("dispatch_customer_status").select("id,customer_id,profile_complete").eq("company",state.company)); }
};

/* ---------- list ---------- */
function custStatusCls(s){ return "chip st"+(s==="active"?" done":s==="inactive"?" stop":""); }
function custStatusChip(s){ s=s||"active"; return '<span class="'+custStatusCls(s)+'">'+esc(s)+"</span>"; }
function custComplete(c){ var s=state.custStatus[c.id]; return s?Number(s.profile_complete)||0:0; }
function fillCustomerSelects(){
  var hubOpts=state.hubs.map(function(h){return '<option value="'+esc(h.code)+'">'+esc(h.code)+" — "+esc(h.name)+"</option>";}).join("");
  var fh=$("custHub"), cur=fh.value; fh.innerHTML='<option value="">All hubs</option>'+state.hubs.map(function(h){return '<option value="'+esc(h.code)+'">'+esc(h.code)+"</option>";}).join(""); fh.value=cur;
  var ch=$("cHub"), c2=ch.value; ch.innerHTML='<option value="">— pick a hub —</option>'+hubOpts; ch.value=c2;
}
async function renderCustomers(){
  fillCustomerSelects();
  $("btnNewCustomer").disabled=!canManageCustomers();
  try{ var st=await CDB.statuses(); state.custStatus={}; (st||[]).forEach(function(r){ state.custStatus[r.id]=r; }); }
  catch(e){ banner("warn","Couldn't read profile completeness","<div>"+esc(e.message)+"</div>",{autoclose:6000}); }
  drawCustomers();
}
function drawCustomers(){
  var host=$("custList"); if(!host) return;
  var q=$("custSearch").value.trim().toLowerCase(), hub=$("custHub").value, st=$("custStatus").value, inc=$("custIncomplete").checked;
  if(!state.customers.length){ host.innerHTML='<div class="empty"><b>No customers yet</b>'+(canManageCustomers()?"Press <b>New customer</b> to add the first one.":"Someone with the Manage customers permission can add them.")+"</div>"; return; }
  var list=state.customers.filter(function(c){
    if(hub&&c.primary_hub!==hub) return false;
    if(st&&(c.account_status||"active")!==st) return false;
    if(inc&&custComplete(c)>=CUST_MUST) return false;
    if(q&&[c.name,c.customer_id,c.also_known_as,c.legal_name,c.billing_city].join(" ").toLowerCase().indexOf(q)<0) return false;
    return true; });
  if(!list.length){ host.innerHTML='<div class="empty"><b>No customers match</b>Clear the search or filters to see all '+state.customers.length+".</div>"; return; }
  host.innerHTML=list.map(function(c){ var n=custComplete(c);
    return '<div class="cust-row" role="button" tabindex="0" data-cust="'+esc(c.id)+'">'+
      '<div class="cust-name">'+esc(c.name)+(c.also_known_as?' <span class="hint">'+esc(c.also_known_as)+"</span>":"")+"</div>"+
      '<div class="cust-meta"><span class="mono cust-id">'+esc(c.customer_id||"—")+"</span>"+custStatusChip(c.account_status)+
      '<span class="chip k-none">'+esc(c.primary_hub||"no hub")+'</span><span class="badge-complete'+(n>=CUST_MUST?" full":"")+'" title="Profile completeness">'+n+"/"+CUST_MUST+"</span>"+
      '<span class="hint">'+(c.last_verified?"verified "+esc(c.last_verified):"not verified")+"</span></div></div>"; }).join("");
}

/* ---------- customer page ---------- */
function setCustTab(t){ state.custTab=t;
  CUST_TABS.forEach(function(k){ $("ctab-"+k).setAttribute("aria-selected",k===t?"true":"false"); $("cpane-"+k).hidden=(k!==t); }); }
function custHeader(){
  var c=state.customer||{};
  $("custTitle").textContent=c.name||"New customer";
  $("custIdChip").textContent=c.customer_id||"new";
  var sc=$("custStatusChip"); sc.className=custStatusCls(c.account_status||"active"); sc.textContent=c.account_status||"active";
  var n=c.id&&!c._new?custComplete(c):0; $("custComplete").textContent=n+" of "+CUST_MUST; $("custComplete").classList.toggle("full",n>=CUST_MUST);
}
async function openCustomer(id){
  var c=id?state.customers.find(function(x){return x.id===id;}):null;
  if(id&&!c){ try{ c=await CDB.customer(id); }catch(e){ banner("bad","Couldn't open the customer","<div>"+esc(e.message)+"</div>"); return; } }
  state.customer=c?Object.assign({},c):{_new:true,account_status:"active"};
  fillCustomerSelects();
  $("cParent").innerHTML='<option value="">— none —</option>'+state.customers.filter(function(x){return x.id!==state.customer.id;})
    .map(function(x){return '<option value="'+esc(x.id)+'">'+esc(x.name)+" ("+esc(x.customer_id)+")</option>";}).join("");
  CUST_FIELDS.forEach(function(f){ var v=state.customer[f[1]]; $(f[0]).value=v==null?"":v; });
  if(!$("cStatus").value) $("cStatus").value="active";
  var ro=!canManageCustomers();
  CUST_FIELDS.forEach(function(f){ $(f[0]).disabled=ro; });
  $("btnSaveCustomer").disabled=ro;
  $("custSaveHint").textContent=ro?"You can view this customer. Changing it needs the Manage customers permission.":"";
  $("custToolbar").hidden=true; $("custList").closest(".card").hidden=true; $("custPage").hidden=false;
  setCustTab("profile"); custHeader();
  if(state.customer.id&&!state.customer._new){ try{ var s=await CDB.statusFor(state.customer.id); if(s){ state.custStatus[s.id]=s; custHeader(); } }catch(e){} }
  window.scrollTo(0,0);
}
function closeCustomer(){
  state.customer=null; if(!$("custPage")) return;
  $("custPage").hidden=true; $("custToolbar").hidden=false; $("custList").closest(".card").hidden=false;
  if(state.tab==="customers") drawCustomers();
}
function readCustomerForm(){
  var c={}; CUST_FIELDS.forEach(function(f){ var v=$(f[0]).value; v=typeof v==="string"?v.trim():v; c[f[1]]=(CUST_NULLABLE[f[1]]&&!v)?null:v; });
  c.billing_state=(c.billing_state||"").toUpperCase(); return c;
}
async function saveCustomer(){
  if(!canManageCustomers()||!state.customer) return;
  var f=readCustomerForm();
  if(!f.name){ banner("warn","Name the customer first","<div>A customer needs at least a name.</div>",{autoclose:6000}); $("cName").focus(); return; }
  var dup=state.customers.find(function(x){return x.id!==state.customer.id&&x.name.toLowerCase()===f.name.toLowerCase();});
  var btn=$("btnSaveCustomer"); btn.disabled=true; btn.textContent="Saving…";
  try{
    var c=Object.assign({},f,{id:state.customer.id,_new:!!state.customer._new});
    var saved=await CDB.saveCustomer(c);
    if(!saved) throw new Error("The customer was saved but could not be read back.");
    var i=state.customers.findIndex(function(x){return x.id===saved.id;}); if(i>=0) state.customers[i]=saved; else state.customers.push(saved);
    state.customers.sort(function(a,b){return String(a.name).localeCompare(String(b.name));});
    state.customer=Object.assign({},saved);
    await renderCustomers(); custHeader();
    banner("good","Saved "+esc(saved.customer_id),"<div><b>"+esc(saved.name)+"</b>"+(dup?" — note: "+esc(dup.customer_id)+" has the same name.":"")+"</div>",{autoclose:5000});
  }catch(e){ banner("bad","Customer not saved","<div>"+esc(e.message)+"</div>"); }
  btn.textContent="Save customer"; btn.disabled=!canManageCustomers();
}
function wireCustomers(){
  $("tab-customers").onclick=function(){ setTab("customers"); };
  ["custSearch"].forEach(function(k){ $(k).oninput=drawCustomers; });
  ["custHub","custStatus","custIncomplete"].forEach(function(k){ $(k).onchange=drawCustomers; });
  $("btnNewCustomer").onclick=function(){ if(canManageCustomers()) openCustomer(null); };
  $("btnSaveCustomer").onclick=saveCustomer;
  $("btnCloseCustomer").onclick=closeCustomer;
  CUST_TABS.forEach(function(k){ $("ctab-"+k).onclick=function(){ setCustTab(k); }; });
  var list=$("custList");
  list.onclick=function(ev){ var r=ev.target.closest("[data-cust]"); if(r) openCustomer(r.getAttribute("data-cust")); };
  list.onkeydown=function(ev){ if(ev.key!=="Enter"&&ev.key!==" ") return; var r=ev.target.closest("[data-cust]"); if(r){ ev.preventDefault(); openCustomer(r.getAttribute("data-cust")); } };
}
