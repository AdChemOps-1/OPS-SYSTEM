/* AdChem Ops — Customers screen: list, new customer, customer page (tabs profile|sites|contacts|activity|history).
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
  async saveSite(s){ sbErr(await supa.from("dispatch_sites").upsert(Object.assign({},s,{company:state.company,updated_by:state.session.user.id,updated_at:new Date().toISOString()}),{onConflict:"company,site_key"})); },
  // an edit to an existing site: only the changed fields (an upsert would have to carry every NOT NULL column of a feed row)
  async updateSite(siteKey,fields){ sbErr(await supa.from("dispatch_sites").update(Object.assign({},fields,{updated_by:state.session.user.id,updated_at:new Date().toISOString()})).eq("company",state.company).eq("site_key",siteKey)); },
  // one site key, or an array of them (Today reads every stop's site in one query)
  async hubNotesFor(siteKey){ var q=supa.from("dispatch_site_hub_notes").select("*").eq("company",state.company);
    return sbErr(await (Array.isArray(siteKey)?q.in("site_key",siteKey):q.eq("site_key",siteKey)).order("hub")); },
  async saveHubNote(n){ sbErr(await supa.from("dispatch_site_hub_notes").upsert(Object.assign({},n,{company:state.company,updated_by:state.session.user.id,updated_at:new Date().toISOString()}),{onConflict:"company,site_key,hub"})); },
  // the people to call at a site: receiving and site manager only (never billing, AP or owner), active; one key or an array
  async contactsForSite(siteKey){ var q=supa.from("dispatch_contacts").select("id,site_key,type,first_name,last_name,phone").eq("company",state.company)
      .in("type",["receiving","site_manager"]).eq("active",true);
    return sbErr(await (Array.isArray(siteKey)?q.in("site_key",siteKey):q.eq("site_key",siteKey)).order("type").order("last_name")); },
  // the signed-in person's own driver notes at these sites, newest first
  async myDriverNotes(siteKeys){ return sbErr(await supa.from("dispatch_customer_activity").select("id,site_key,summary,status,rejection_reason,occurred_at").eq("company",state.company)
      .eq("kind","driver_note").eq("logged_by",state.session.user.id).in("site_key",siteKeys).order("occurred_at",{ascending:false})); },
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
  CUST_TABS.forEach(function(k){ $("ctab-"+k).setAttribute("aria-selected",k===t?"true":"false"); $("cpane-"+k).hidden=(k!==t); });
  if(t!=="profile") loadCustPane(t); }
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
  state.openSite=null; $("siteNew").hidden=true; $("siteNew").innerHTML=""; $("contactForm").hidden=true; state.cfEdit=null;
  setCustTab("profile"); custHeader();
  if(state.customer.id&&!state.customer._new){ try{ var s=await CDB.statusFor(state.customer.id); if(s){ state.custStatus[s.id]=s; custHeader(); } }catch(e){} }
  window.scrollTo(0,0);
}
function closeCustomer(){
  state.customer=null; if(!$("custPage")) return;
  $("custPage").hidden=true; $("custToolbar").hidden=false; $("custList").closest(".card").hidden=false;
  if(state.tab==="customers") drawCustomers();
}
// Customers Out (spec §9): rewrite this customer's rows after any customer/site/contact save. Best effort — a failure shows a
// banner and never blocks or undoes the save; Rebuild on Setup is the backstop.
function afterCustomerSave(id){
  if(!id||!state.canEdit||!state.settings||!state.settings.customersOutSheetId) return Promise.resolve();
  return API.post("/api/customers-out",{customerIds:[id]}).catch(function(e){ banner("warn","Customers Out not updated","<div>"+esc(e.message)+" The change is saved; press <b>Rebuild Customers Out</b> on Setup when the sheet is reachable.</div>",{autoclose:12000,key:"co"}); });
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
    state.customer=Object.assign({},saved); afterCustomerSave(saved.id);
    await renderCustomers(); custHeader();
    banner("good","Saved "+esc(saved.customer_id),"<div><b>"+esc(saved.name)+"</b>"+(dup?" — note: "+esc(dup.customer_id)+" has the same name.":"")+"</div>",{autoclose:5000});
  }catch(e){ banner("bad","Customer not saved","<div>"+esc(e.message)+"</div>"); }
  btn.textContent="Save customer"; btn.disabled=!canManageCustomers();
}

/* ---------- panes: sites, contacts, activity, history (each reloads when its tab is opened) ---------- */
const SITE_FIELDS=[["site_label","Label"],["addr","Street address"],["city","City"],["hub","Hub"],["receiving_hours","Receiving hours"],["gate_code","Gate code"],
  ["parking_unloading","Parking / unloading"],["hazmat_restrictions","Hazmat restrictions"],["container_notes","Container notes"],["special_instructions","Special instructions"],["last_verified","Last verified"]];
const CONTACT_TYPES=[["receiving","Receiving"],["site_manager","Site manager"],["ordering","Ordering"],["safety","Safety"],["billing","Billing"],["ap","Accounts payable"],["owner","Owner"],["other","Other"]];
const ACT_METHODS={call:"Call",email:"Email",text:"Text",in_person:"In person",app:"Driver app"};
const HIST_SKIP={company:true,id:true,created_at:true,created_by:true,customer_id:true};
state.custSites=[]; state.custHubNotes={}; state.custContacts=[]; state.custActs=[]; state.openSite=null; state.cfEdit=null;

function custSaved(){ var c=state.customer; return !!(c&&c.id&&!c._new); }
function custStill(c){ return !!(state.customer&&state.customer.id===c.id); }
function canApproveNotes(){ var me=state.me||{}; return !!(me.isSuper||(me.perms||{}).approve_driver_notes); }
function siteHash(k){ var h=5381; for(var i=0;i<k.length;i++) h=((h*33)^k.charCodeAt(i))>>>0; return h.toString(36); }
function custEmpty(t,b){ return '<div class="empty"><b>'+esc(t)+"</b>"+esc(b)+"</div>"; }
function notSavedYet(){ return custEmpty("Save the customer first","Sites, contacts and activity can be added once the customer has an ID."); }
function whoName(uid){ if(!uid) return "—";
  var u=(state.users||[]).find(function(x){return x.user_id===uid;}); if(u) return u.name||u.email||uid;
  if(state.session&&uid===state.session.user.id) return (state.me&&(state.me.name||state.me.email))||"you";
  return String(uid).slice(0,8); }
function fmtWhen(t){ if(!t) return ""; var d=new Date(t); return isNaN(d)?String(t):d.toLocaleString([], {month:"numeric",day:"numeric",year:"2-digit",hour:"numeric",minute:"2-digit"}); }
function contactName(x){ return [x.first_name,x.last_name].filter(Boolean).join(" ")||"(no name)"; }
function telHref(p){ return "tel:"+String(p||"").replace(/[^0-9+]/g,""); }
async function refreshComplete(){ if(!custSaved()) return;
  try{ var s=await CDB.statusFor(state.customer.id); if(s){ state.custStatus[s.id]=s; custHeader(); } }
  catch(e){ banner("warn","Couldn't refresh profile completeness","<div>"+esc(e.message)+"</div>",{autoclose:6000}); } }
async function loadCustPane(t){
  if(!state.customer) return;
  try{ if(t==="sites") await renderSites(); else if(t==="contacts") await renderContacts(); else if(t==="activity") await renderActivity(); else if(t==="history") await renderHistory(); }
  catch(e){ banner("bad","Couldn't load "+esc(t),"<div>"+esc(e.message)+"</div>"); }
}

/* sites */
// A feed site (code_raw set) gets its address, city, hub and label from FEED_ORDERS on every sync, so those are read-only here
// (an edit would be undone); the Ops fields and route notes stay editable.
const FEED_OWNED={addr:true,city:true,hub:true,site_label:true};
function siteForm(s,notes,isNew){
  var ro=canManageCustomers()?"":" disabled", key=isNew?"":s.site_key, pre=isNew?"s_new":"s_"+siteHash(key), feed=!isNew&&!!s.code_raw, dis=ro;
  var field=function(f){ var k=f[0], v=s[k]==null?"":String(s[k]), id=pre+"_"+k, fo=feed&&FEED_OWNED[k], dis=fo?" disabled data-feed":ro,
    lab='<label class="f'+(k==="special_instructions"?" spanall":"")+'" for="'+esc(id)+'">'+esc(f[1])+(fo?' <span class="hint">from FEED_ORDERS</span>':"");
    if(k==="hub"){ var codes=state.hubs.map(function(h){return h.code;}); if(v&&codes.indexOf(v)<0) codes.push(v);
      return lab+'<select id="'+esc(id)+'" data-k="hub"'+dis+'><option value="">— none —</option>'+codes.map(function(c){return '<option value="'+esc(c)+'"'+(c===v?" selected":"")+">"+esc(c)+"</option>";}).join("")+"</select></label>"; }
    if(k==="special_instructions") return lab+'<textarea id="'+esc(id)+'" data-k="'+k+'"'+dis+">"+esc(v)+"</textarea></label>";
    return lab+'<input id="'+esc(id)+'" data-k="'+k+'" value="'+esc(v)+'" autocomplete="off"'+(k==="last_verified"?' type="date"':"")+dis+"></label>"; };
  var byHub={}; (notes||[]).forEach(function(n){ byHub[n.hub]=n; });
  var hubRows=state.hubs.map(function(h){ var n=byHub[h.code]||{}, sv=n.scale_on_route===true?"yes":n.scale_on_route===false?"no":"";
    var opt=function(v,t){ return '<option value="'+v+'"'+(v===sv?" selected":"")+">"+t+"</option>"; };
    return '<div class="hubnote" data-hubnote="'+esc(h.code)+'"><b class="mono">'+esc(h.code)+"</b>"+
      '<select data-n="scale_on_route" aria-label="Scale on the route from '+esc(h.code)+'"'+dis+">"+opt("","Scale: unknown")+opt("yes","Scale: yes")+opt("no","Scale: no")+"</select>"+
      '<input data-n="route_notes" aria-label="Route notes from '+esc(h.code)+'" placeholder="Route notes from '+esc(h.code)+'" value="'+esc(n.route_notes||"")+'"'+dis+"></div>"; }).join("");
  return '<form id="'+esc(pre)+'" data-site="'+esc(key)+'" autocomplete="off">'+
    (isNew?'<div style="display:flex;flex-wrap:wrap;gap:8px 14px;align-items:center;margin-bottom:10px"><b>New site</b><label class="cust-chk"><input id="sSameAsBilling" type="checkbox"> Same as billing address</label></div>':
      '<div class="hint" style="margin-bottom:8px">'+esc(key)+(s.code_raw?" · feed code "+esc(s.code_raw):"")+"</div>")+
    '<div class="grid three">'+SITE_FIELDS.map(field).join("")+"</div>"+
    '<h3 class="sec-h" style="margin-top:14px">Route notes by hub</h3>'+hubRows+
    '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px"><button class="btn primary" type="button" data-save-site'+dis+">Save site</button>"+
    (isNew?'<button class="btn" type="button" data-cancel-site>Cancel</button>':"")+"</div></form>";
}
async function renderSites(){
  var c=state.customer, ro=!canManageCustomers();
  $("btnAddSite").disabled=ro||!custSaved();
  if(!custSaved()){ $("siteNew").hidden=true; $("siteList").innerHTML=notSavedYet(); return; }
  var sites=await CDB.sitesFor(c.id)||[]; if(!custStill(c)) return;
  var notes=await Promise.all(sites.map(function(s){ return CDB.hubNotesFor(s.site_key); })); if(!custStill(c)) return;
  state.custSites=sites; state.custHubNotes={}; sites.forEach(function(s,i){ state.custHubNotes[s.site_key]=notes[i]||[]; });
  $("siteList").innerHTML=sites.length?sites.map(function(s){
    return '<details class="site-card"'+(state.openSite===s.site_key?" open":"")+"><summary><b>"+esc(s.site_label||s.site_key)+'</b><span class="chip k-none">'+esc(s.hub||"no hub")+"</span>"+
      '<span class="hint">'+esc([s.addr,s.city].filter(Boolean).join(", ")||"no address")+"</span></summary>"+siteForm(s,state.custHubNotes[s.site_key],false)+"</details>"; }).join("")
    :custEmpty("No sites yet",ro?"Someone with the Manage customers permission can add them.":"Press Add site to add the first delivery site.");
}
function openNewSite(){
  if(!canManageCustomers()||!custSaved()) return;
  var h=$("siteNew"); h.innerHTML=siteForm({hub:state.customer.primary_hub||""},[],true); h.hidden=false; $("s_new_site_label").focus();
}
function closeNewSite(){ $("siteNew").hidden=true; $("siteNew").innerHTML=""; }
function readSiteForm(form){
  var f={}; form.querySelectorAll("[data-k]").forEach(function(el){ f[el.getAttribute("data-k")]=el.value.trim(); }); f.last_verified=f.last_verified||null;
  var notes=[]; form.querySelectorAll("[data-hubnote]").forEach(function(r){ var sv=r.querySelector('[data-n="scale_on_route"]').value;
    notes.push({hub:r.getAttribute("data-hubnote"),scale_on_route:sv==="yes"?true:sv==="no"?false:null,route_notes:r.querySelector('[data-n="route_notes"]').value.trim()}); });
  return {fields:f,notes:notes};
}
async function saveSiteForm(form,btn){
  if(!canManageCustomers()||!custSaved()||!form) return;
  var c=state.customer, key=form.getAttribute("data-site"), isNew=!key, v=readSiteForm(form);
  if(isNew){
    if(!v.fields.site_label){ banner("warn","Label the site first","<div>A label such as <b>Primary</b> or <b>Plant 2</b> names the site.</div>",{autoclose:6000}); form.querySelector('[data-k="site_label"]').focus(); return; }
    key=c.customer_id+" — "+v.fields.site_label;   // the import (Task 9) builds the same key; supabase-js quotes in.(…) values with commas
    if(state.custSites.some(function(s){return s.site_key===key;})){ banner("warn","That site already exists","<div>"+esc(key)+" is already one of this customer's sites. Pick another label.</div>",{autoclose:6000}); return; }
  }
  btn.disabled=true; btn.textContent="Saving…";
  try{
    if(isNew) await CDB.saveSite(Object.assign({},v.fields,{site_key:key,customer:c.name,customer_id:c.id,code_raw:"",code:null,synced_at:new Date().toISOString()}));
    else { var was=state.custSites.find(function(s){return s.site_key===key;})||{}, ch={};
      Object.keys(v.fields).forEach(function(k){ if((was[k]==null?"":String(was[k]))!==(v.fields[k]==null?"":String(v.fields[k]))) ch[k]=v.fields[k]; });
      if(Object.keys(ch).length) await CDB.updateSite(key,ch); }
    var old=isNew?[]:(state.custHubNotes[key]||[]);
    for(var i=0;i<v.notes.length;i++){ var n=v.notes[i], o=old.find(function(x){return x.hub===n.hub;});
      var changed=o?(o.scale_on_route!==n.scale_on_route||(o.route_notes||"")!==n.route_notes):(n.scale_on_route!==null||!!n.route_notes);
      if(changed) await CDB.saveHubNote(Object.assign({site_key:key},n)); }
    state.openSite=key; if(isNew) closeNewSite(); afterCustomerSave(c.id);
    banner("good","Site saved","<div>"+esc(key)+"</div>",{autoclose:4000});
    await renderSites(); await refreshComplete();
  }catch(e){ banner("bad","Site not saved","<div>"+esc(e.message)+"</div>"); btn.disabled=false; btn.textContent="Save site"; }
}

/* contacts */
function fillSelect(id,opts,first){ var el=$(id), cur=el.value; el.innerHTML='<option value="">'+esc(first)+"</option>"+opts.map(function(o){return '<option value="'+esc(o[0])+'">'+esc(o[1])+"</option>";}).join("");
  if(opts.some(function(o){return o[0]===cur;})) el.value=cur; }
async function renderContacts(){
  var c=state.customer, ro=!canManageCustomers();
  $("btnAddContact").disabled=ro||!custSaved();
  if(!custSaved()){ $("contactForm").hidden=true; $("contactList").innerHTML=notSavedYet(); return; }
  var r=await Promise.all([CDB.contactsFor(c.id),CDB.sitesFor(c.id)]); if(!custStill(c)) return;
  state.custContacts=r[0]||[]; state.custSites=r[1]||[];
  fillSelect("cf_site",state.custSites.map(function(s){return [s.site_key,s.site_label||s.site_key];}),"— the customer as a whole —");
  drawContacts();
}
function drawContacts(){
  var ro=!canManageCustomers(), list=state.custContacts, sites={}; state.custSites.forEach(function(s){ sites[s.site_key]=s.site_label||s.site_key; });
  var row=function(x){ var off=x.active===false;
    return '<div class="ct-row" data-contact="'+esc(x.id)+'"'+(off?' style="opacity:.6"':"")+'><div class="ct-name"><b>'+esc(contactName(x))+"</b>"+(off?' <span class="chip st stop">inactive</span>':"")+
      (x.cc_on_statements?' <span class="chip k-none">cc statements</span>':"")+(x.site_key?' <span class="hint">· '+esc(sites[x.site_key]||x.site_key)+"</span>":"")+
      (x.notes?'<div class="hint">'+esc(x.notes)+"</div>":"")+"</div>"+
      (x.phone?'<a href="'+esc(telHref(x.phone))+'">'+esc(x.phone)+"</a>":"")+(x.email?'<a href="mailto:'+esc(x.email)+'">'+esc(x.email)+"</a>":"")+
      (x.preferred_method?'<span class="hint">prefers '+esc(x.preferred_method)+"</span>":"")+
      (ro?"":'<span style="display:flex;gap:6px"><button class="btn sm" type="button" data-edit-contact="'+esc(x.id)+'">Edit</button><button class="btn sm" type="button" data-deact="'+esc(x.id)+'">'+(off?"Reactivate":"Deactivate")+"</button></span>")+"</div>"; };
  var html=CONTACT_TYPES.map(function(t){ var g=list.filter(function(x){return (x.type||"other")===t[0];}); if(!g.length) return "";
    return '<div class="ct-group" data-ctype="'+esc(t[0])+'">'+esc(t[1])+"</div>"+g.map(row).join(""); }).join("");
  $("contactList").innerHTML=html||custEmpty("No contacts yet",ro?"Someone with the Manage customers permission can add them.":"Press Add contact to add receiving, billing and other contacts.");
}
function openContactForm(x){
  if(!canManageCustomers()||!custSaved()) return;
  state.cfEdit=x?x.id:null; x=x||{};
  $("cf_type").value=x.type||"receiving"; $("cf_first").value=x.first_name||""; $("cf_last").value=x.last_name||""; $("cf_phone").value=x.phone||""; $("cf_email").value=x.email||"";
  $("cf_method").value=x.preferred_method||""; $("cf_site").value=x.site_key||""; $("cf_cc").checked=!!x.cc_on_statements; $("cf_notes").value=x.notes||"";
  $("cfSave").textContent=x.id?"Save changes":"Save contact"; $("contactForm").hidden=false; $("cf_first").focus();
}
async function saveContactForm(){
  if(!canManageCustomers()||!custSaved()) return;
  var v=function(id){ return $(id).value.trim(); };
  var row={customer_id:state.customer.id,type:$("cf_type").value,first_name:v("cf_first"),last_name:v("cf_last"),phone:v("cf_phone"),email:v("cf_email"),
    preferred_method:$("cf_method").value||null,site_key:$("cf_site").value||null,cc_on_statements:$("cf_cc").checked,notes:v("cf_notes")};
  if(!row.first_name&&!row.last_name&&!row.phone&&!row.email){ banner("warn","Add a name, phone or email","<div>A contact needs at least one way to identify or reach them.</div>",{autoclose:6000}); $("cf_first").focus(); return; }
  if(state.cfEdit) row.id=state.cfEdit; else row.active=true;
  var btn=$("cfSave"); btn.disabled=true;
  try{ await CDB.saveContact(row); $("contactForm").hidden=true; state.cfEdit=null; afterCustomerSave(row.customer_id);
    banner("good","Contact saved","<div>"+esc(contactName(row))+"</div>",{autoclose:4000});
    await renderContacts(); await refreshComplete(); }
  catch(e){ banner("bad","Contact not saved","<div>"+esc(e.message)+"</div>"); }
  btn.disabled=false;
}
async function toggleContact(id){
  if(!canManageCustomers()) return; var x=state.custContacts.find(function(c){return c.id===id;}); if(!x) return;
  try{ await CDB.saveContact({id:id,active:x.active===false}); afterCustomerSave(x.customer_id); await renderContacts(); await refreshComplete(); }
  catch(e){ banner("bad","Contact not changed","<div>"+esc(e.message)+"</div>"); }
}

/* activity */
async function renderActivity(){
  var c=state.customer, ro=!canManageCustomers()||!custSaved();
  $("actAdd").querySelectorAll("select,textarea,button").forEach(function(el){ el.disabled=ro; });
  $("actHint").textContent=!custSaved()?"Save the customer first.":!canManageCustomers()?"Logging activity needs the Manage customers permission.":"";
  if(!custSaved()){ $("actList").innerHTML=notSavedYet(); return; }
  var r=await Promise.all([CDB.activityFor(c.id),CDB.contactsFor(c.id)]); if(!custStill(c)) return;
  state.custActs=r[0]||[]; state.custContacts=r[1]||[];
  fillSelect("act_contact",state.custContacts.filter(function(x){return x.active!==false;}).map(function(x){return [x.id,contactName(x)];}),"— none —");
  var cts={}; state.custContacts.forEach(function(x){ cts[x.id]=x; });
  var mayReview=canApproveNotes();
  var pend=state.custActs.filter(function(a){return a.status==="pending";}), rest=state.custActs.filter(function(a){return a.status!=="pending";});
  $("actList").innerHTML=pend.concat(rest).map(function(a){ var p=a.status==="pending", drv=a.kind==="driver_note";
    return '<div class="act-row'+(p?" pending":"")+'" data-act="'+esc(a.id)+'"><span class="chip st">'+esc(ACT_METHODS[a.method]||a.method||"note")+"</span>"+
      '<div class="act-sum">'+(drv?'<span class="chip '+(a.status==="rejected"?"st stop":a.status==="approved"?"st done":"warn")+'">driver note · '+esc(a.status)+"</span> ":"")+esc(a.summary)+
      (a.contact_id&&cts[a.contact_id]?' <span class="hint">with '+esc(contactName(cts[a.contact_id]))+"</span>":"")+
      (a.status==="rejected"?'<div class="hint">Reason: '+esc(a.rejection_reason||"none given")+" — "+esc(whoName(a.reviewed_by))+"</div>":"")+"</div>"+
      '<span class="hint">'+esc(whoName(a.logged_by))+" · "+esc(fmtWhen(a.occurred_at))+"</span>"+
      (p&&mayReview?'<span style="display:flex;gap:6px"><button class="btn sm primary" type="button" data-approve="'+esc(a.id)+'">Approve</button><button class="btn sm danger" type="button" data-reject="'+esc(a.id)+'">Reject</button></span>':"")+"</div>"; }).join("")
    ||custEmpty("No activity yet","Calls, emails, visits and drivers' notes show here, newest first.");
}
async function addNote(){
  if(!canManageCustomers()||!custSaved()) return;
  var sum=$("act_summary").value.trim();
  if(!sum){ banner("warn","Say what happened","<div>The activity needs a short summary.</div>",{autoclose:6000}); $("act_summary").focus(); return; }
  try{ await CDB.addActivity({customer_id:state.customer.id,method:$("act_method").value,summary:sum,contact_id:$("act_contact").value||null,kind:"note",status:"approved"});
    $("act_summary").value=""; await renderActivity(); }
  catch(e){ banner("bad","Activity not logged","<div>"+esc(e.message)+"</div>"); }
}
async function reviewDriverNote(id,ok){
  if(!canApproveNotes()) return;
  var reason=null;
  if(!ok){ reason=prompt("Why is this driver's note rejected?"); if(reason===null) return; reason=reason.trim();
    if(!reason){ banner("warn","Give a reason","<div>A rejected note needs a reason so the driver knows why.</div>",{autoclose:6000}); return; } }
  try{ await CDB.reviewNote(id,ok?"approved":"rejected",reason); await renderActivity(); }
  catch(e){ banner("bad","Note not "+(ok?"approved":"rejected"),"<div>"+esc(e.message)+"</div>"); }
}

/* history */
function histVal(v){ if(v==null||v==="") return "—"; var s=typeof v==="object"?JSON.stringify(v):String(v); return s.length>120?s.slice(0,117)+"…":s; }
async function renderHistory(){
  var c=state.customer;
  if(!custSaved()){ $("histList").innerHTML=custEmpty("No history yet","Changes are recorded once the customer is saved."); return; }
  var r=await Promise.all([CDB.historyFor(c.id),CDB.contactsFor(c.id)]); if(!custStill(c)) return;
  var cts={}; (r[1]||[]).forEach(function(x){ cts[x.id]=x; });
  var ctx=function(l){ var id=l.row_id||"";
    if(l.table_name==="dispatch_sites") return "site "+id+" › ";
    if(l.table_name==="dispatch_site_hub_notes"){ var i=id.lastIndexOf("/"); return "site "+id.slice(0,i)+" › hub "+id.slice(i+1)+" › "; }
    if(l.table_name==="dispatch_contacts") return "contact "+(cts[id]?contactName(cts[id]):id.slice(0,8))+" › ";
    if(l.table_name==="dispatch_customer_activity") return "activity › ";
    return ""; };
  var lines=[];
  (r[0]||[]).forEach(function(l){ var ch=l.changes||{}, ins=l.detail&&l.detail.op==="insert", head=fmtWhen(l.at)+" · "+whoName(l.who)+" · "+ctx(l);
    Object.keys(ch).forEach(function(k){ var d=ch[k]||{};
      if(HIST_SKIP[k]&&!(k==="customer_id"&&l.table_name==="dispatch_customers")) return;   // keys and ids are noise; a customer's own ID is not
      if(ins&&(d.to==null||d.to==="")) return;
      lines.push('<div class="hist-line" data-table="'+esc(l.table_name||"")+'">'+esc(head)+'<span class="mono">'+esc(k)+"</span>: "+esc(histVal(d.from))+" → "+esc(histVal(d.to))+"</div>"); }); });
  $("histList").innerHTML=lines.join("")||custEmpty("No history yet","Changes to this customer, its sites, contacts and activity show here.");
}

/* ---------- Today: the site's notes under each stop ----------
   renderToday (app.js) calls siteNotesHtml(site, hub) per stop from state.todayX, then todayExtras(keys) once per render:
   one read each of hub notes, site contacts and the driver's own notes for all the stops' sites, re-rendering only if they changed. */
// keyed by company: a site_key is unique only within one company
function emptyTodayX(){ return {company:state.company,hubNotes:{},contacts:{},mine:{}}; }
state.todayX=emptyTodayX();
var todaySeq=0, todayHold=false;
function groupByKey(rows){ var by={}; (rows||[]).forEach(function(r){ (by[r.site_key]=by[r.site_key]||[]).push(r); }); return by; }
async function todayExtras(keys){
  if(todayHold) return;
  var seq=++todaySeq, co=state.company, X=emptyTodayX();
  if(keys.length){
    try{ var r=await Promise.all([CDB.hubNotesFor(keys),CDB.contactsForSite(keys),CDB.myDriverNotes(keys)]);
      X={company:co,hubNotes:groupByKey(r[0]),contacts:groupByKey(r[1]),mine:groupByKey(r[2])}; }
    catch(e){ if(seq===todaySeq) banner("warn","Couldn't load the site notes","<div>"+esc(e.message)+"</div>",{autoclose:8000,key:"sitenotes"}); X=emptyTodayX(); }   // render none rather than stale ones
  }
  if(seq!==todaySeq||co!==state.company) return;
  var same=JSON.stringify(X)===JSON.stringify(state.todayX); state.todayX=X;
  if(!same&&state.tab==="today"){ todayHold=true; try{ renderToday(); } finally{ todayHold=false; } }
}
function noteStatusChip(n){ var s=n.status||"pending"; return '<span class="chip '+(s==="approved"?"k-D":s==="rejected"?"st stop":"warn")+'">'+esc(s)+"</span>"; }
function siteNotesHtml(site,hub){
  if(!site) return "";
  var X=state.todayX.company===state.company?state.todayX:emptyTodayX(), k=site.siteKey;
  var hn=(X.hubNotes[k]||[]).find(function(n){return n.hub===hub;});
  var lines=[["Gate code",site.gateCode||site.gate],["Receiving hours",site.receivingHours||site.hours],["Parking / unloading",site.parkingUnloading],
    ["Restrictions",site.hazmatRestrictions],["Containers",site.containerNotes],["Special instructions",site.specialInstructions]];
  if(hn&&hn.scale_on_route!=null) lines.push(["Scale",hn.scale_on_route?"Scale on the "+hub+" route":"No scale on the "+hub+" route"]);
  if(hn&&hn.route_notes) lines.push(["Route from "+hub,hn.route_notes]);
  var h=lines.filter(function(l){return l[1];}).map(function(l){ return '<div class="sn-line"><b>'+esc(l[0])+":</b> "+esc(l[1])+"</div>"; }).join("");
  h+=(X.contacts[k]||[]).filter(function(c){return c.phone;}).map(function(c){ return '<div class="sn-line"><b>'+esc(c.type==="site_manager"?"Site manager":"Receiving")+":</b> "+esc(contactName(c))+
    ' <a href="'+esc(telHref(c.phone))+'">'+esc(c.phone)+"</a></div>"; }).join("");
  var mine=X.mine[k]||[];
  if(mine.length) h+='<div class="sn-mine">'+mine.map(function(n){ return '<div class="sn-line">'+esc(n.summary)+" "+noteStatusChip(n)+(n.status==="rejected"&&n.rejection_reason?' <span class="hint">'+esc(n.rejection_reason)+"</span>":"")+"</div>"; }).join("")+"</div>";
  h+=site.customerId?'<div class="sn-act"><button class="btn sm" data-note="'+esc(k)+'">Add note</button><span class="hint">The office checks it before it goes on the site.</span></div>':"";
  return h?'<div class="site-notes">'+h+"</div>":"";
}
async function addDriverNote(siteKey){
  var site=(state.feed.rows||[]).find(function(r){return r.siteKey===siteKey;});
  if(!site||!site.customerId) return;
  var txt=window.prompt("Note for the office about "+site.customer+(site.siteLabel?" — "+site.siteLabel:"")+":","");
  if(txt==null) return; txt=String(txt).trim(); if(!txt) return;
  try{ await CDB.addActivity({kind:"driver_note",status:"pending",method:"app",site_key:siteKey,customer_id:site.customerId,summary:txt,logged_by:state.session.user.id});
    banner("good","Note sent for review","<div>The office sees it on the customer's Activity tab.</div>",{autoclose:5000,key:"drvnote"}); }
  catch(e){ banner("bad","Note not saved","<div>"+esc(e.message)+"</div>"); return; }
  if(state.tab==="today") renderToday();
}

function wireCustomers(){
  $("tab-customers").onclick=function(){ setTab("customers"); };
  ["custSearch"].forEach(function(k){ $(k).oninput=drawCustomers; });
  ["custHub","custStatus","custIncomplete"].forEach(function(k){ $(k).onchange=drawCustomers; });
  $("btnNewCustomer").onclick=function(){ if(canManageCustomers()) openCustomer(null); };
  $("btnSaveCustomer").onclick=saveCustomer;
  $("btnCloseCustomer").onclick=closeCustomer;
  CUST_TABS.forEach(function(k){ $("ctab-"+k).onclick=function(){ setCustTab(k); }; });
  $("btnAddSite").onclick=openNewSite;
  ["siteNew","siteList"].forEach(function(id){ var h=$(id);
    h.onsubmit=function(ev){ ev.preventDefault(); };
    h.onclick=function(ev){ var b=ev.target.closest("[data-save-site]"); if(b){ saveSiteForm(b.closest("form[data-site]"),b); return; } if(ev.target.closest("[data-cancel-site]")) closeNewSite(); }; });
  $("siteNew").onchange=function(ev){ if(ev.target.id!=="sSameAsBilling"||!ev.target.checked||!state.customer) return;
    $("s_new_addr").value=state.customer.billing_street||""; $("s_new_city").value=state.customer.billing_city||""; };
  $("btnAddContact").onclick=function(){ openContactForm(null); };
  $("cfSave").onclick=saveContactForm;
  $("cfCancel").onclick=function(){ $("contactForm").hidden=true; state.cfEdit=null; };
  $("contactList").onclick=function(ev){ var d=ev.target.closest("[data-deact]"); if(d){ toggleContact(d.getAttribute("data-deact")); return; }
    var e=ev.target.closest("[data-edit-contact]"); if(e) openContactForm(state.custContacts.find(function(x){return x.id===e.getAttribute("data-edit-contact");})); };
  $("actAdd").onsubmit=function(ev){ ev.preventDefault(); addNote(); };
  $("actList").onclick=function(ev){ var a=ev.target.closest("[data-approve]"); if(a){ reviewDriverNote(a.getAttribute("data-approve"),true); return; }
    var r=ev.target.closest("[data-reject]"); if(r) reviewDriverNote(r.getAttribute("data-reject"),false); };
  var list=$("custList");
  list.onclick=function(ev){ var r=ev.target.closest("[data-cust]"); if(r) openCustomer(r.getAttribute("data-cust")); };
  list.onkeydown=function(ev){ if(ev.key!=="Enter"&&ev.key!==" ") return; var r=ev.target.closest("[data-cust]"); if(r){ ev.preventDefault(); openCustomer(r.getAttribute("data-cust")); } };
}
