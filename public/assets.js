/* AdChem Ops — Assets: the container register (Stage 3A). Part 1: the permission helpers, the data layer (ADB), the Assets tab shell,
   and Setup → Vendors and Container types. Loaded after app.js, customers.js and documents.js; uses their globals
   (state, $, esc, banner, supa, sbErr, API, newUuid, PRODUCTS). Every query is scoped by state.company.
   Reading needs view_assets, writing needs manage_assets (super admins have both); the database and /api/assets enforce the same
   rules and the screens follow canViewAssets() / canManageAssets(). Part 2: the register (detail, history, manage actions), counts
   and the hub action sheet. Also uses hubBy, coShort, fmtWhen, whoName and shrinkPhoto. Part 3: the driver's Cylinders sheet on Today, its
   offline queue (app.js's podIdb store "a"), Load and My truck; also uses ymd, podIdb, updatePodQueueNote, renderToday and capError. */

state.vendors=[]; state.ctypes=[]; state.vendorEdit=null; state.typeEdit=null;   // vendorEdit / typeEdit: the row a form is editing ({} = new)
// aRows: the register; aSites: site_key -> name for sites the feed hasn't loaded; aDetail: the open asset's id; aShell: the company
// the register's shell was built for; act: the open hub action sheet {kind, items:[{serial, id, photoPath?, ocr?}], results, sending, scan}
state.aRows=[]; state.aSites={}; state.aDetail=null; state.aShell=null; state.act=null;

const VENDOR_ROLES=["fill","rent","supply"];
const TYPE_KINDS=["cylinder","dewar","pig","tank"];

function canViewAssets(){ var me=state.me||{}; return !!(me.isSuper||(me.perms||{}).view_assets); }
function canManageAssets(){ var me=state.me||{}; return !!(me.isSuper||(me.perms||{}).manage_assets); }
function resetAssets(){   // on a company switch
  state.vendors=[]; state.ctypes=[]; closeVendorForm(); closeTypeForm();
  state.aRows=[]; state.aSites={}; state.aDetail=null; state.aShell=null;
  state.act=null; var sh=$("actSheet"); if(sh&&!sh.hidden){ sh.hidden=true; document.body.style.overflow=""; } }
// the server's normSerial: upper case, trimmed, spaces and hyphens removed
function normSerial(s){ return String(s==null?"":s).trim().toUpperCase().replace(/[\s-]+/g,""); }

const ADB={
  async vendors(){ return sbErr(await supa.from("dispatch_vendors").select("*").eq("company",state.company).order("name"))||[]; },
  // v with no id is inserted under a client-made id; with an id the row is upserted. roles is a text[].
  async saveVendor(v){ return await ADB._save("dispatch_vendors",v); },
  async types(){ return sbErr(await supa.from("dispatch_container_types").select("*").eq("company",state.company).order("product").order("size_label"))||[]; },
  async saveType(t){ return await ADB._save("dispatch_container_types",t); },
  async _save(table,r){
    var row=Object.assign({},r,{company:state.company,updated_by:state.session.user.id,updated_at:new Date().toISOString()});
    if(!row.id) row.id=newUuid();
    sbErr(await supa.from(table).upsert(row,{onConflict:"id"})); return row.id;
  },
  // filter: {hub, owner_kind, fill_state, condition, container_type_id, location_kind, ...}, any subset of equality filters
  async assets(filter){ var q=supa.from("dispatch_assets").select("*").eq("company",state.company); filter=filter||{};
    Object.keys(filter).forEach(function(k){ if(filter[k]!=null&&filter[k]!=="") q=q.eq(k,filter[k]); });
    return sbErr(await q.order("serial"))||[]; },
  async asset(id){ return sbErr(await supa.from("dispatch_assets").select("*").eq("company",state.company).eq("id",id).maybeSingle()); },
  async events(assetId){ return sbErr(await supa.from("dispatch_asset_events").select("*").eq("company",state.company).eq("asset_id",assetId).order("occurred_at",{ascending:false}))||[]; },
  async counts(){ return await API.post("/api/assets",{action:"counts"}); },
  async correct(id,fields){ return sbErr(await supa.rpc("dispatch_asset_correct",{p_id:id,p_fields:fields})); },
  async sendEvents(events){ return await API.post("/api/assets",{action:"events",events:events}); },
  async read(eventId,kind,photoPath){ return await API.post("/api/assets",{action:"read",eventId:eventId,kind:kind,photoPath:photoPath}); },
  // /api/docs signs a document row's file by id and has no path form, and asset photos have no document row, so the photo
  // (<company>/asset/<event id>.jpg, readable by the company's members) is signed straight from storage for 5 minutes
  async sign(path){ var r=await supa.storage.from("dispatch-docs").createSignedUrl(path,300); if(r.error) throw new Error(r.error.message||String(r.error)); return {url:r.data.signedUrl}; }
};

/* ---------- the Assets tab: the register (list → detail with history and manage actions), counts, hub actions ----------
   Places are {kind: hub|site|vendor, id}: a hub by its code, a site by its site_key, a vendor by its id. Serials typed or read
   are normalised with normSerial before they are matched or sent. The register is loaded whole and filtered here. */
const A_FILL_CHIP={full:"k-D",empty:"warn",unknown:"hint"};
const A_COND_CHIP={out_of_service:"k-R",lost:"k-R",retired:"k-none"};
const A_CONDS=["in_service","out_of_service","lost","retired"];
function aWords(s){ return String(s==null?"":s).replace(/_/g," "); }
function aTypeOf(id){ return (state.ctypes||[]).find(function(t){ return t.id===id; })||null; }
function aTypeLabel(id,long){ var t=aTypeOf(id); if(!t) return id?"type not found":"no type"; return t.size_label+(long?" · "+t.product:""); }
function aVendorName(id){ var v=(state.vendors||[]).find(function(x){ return x.id===id; }); return v?v.name:"vendor "+id; }
function aSiteName(key){
  var r=(state.feed.rows||[]).find(function(x){ return x.siteKey===key; });
  if(r) return r.customer+(r.siteLabel?" — "+r.siteLabel:"");
  return state.aSites[key]||key;
}
function aPlaceName(kind,id,long){
  if(!kind) return "";
  if(kind==="hub"){ var h=hubBy(id); return long&&h?id+" · "+h.name:String(id); }
  if(kind==="site") return aSiteName(id);
  if(kind==="vendor") return aVendorName(id);
  return kind+" "+id;
}
function aOwnerName(kind,id){
  if(kind==="vendor") return aVendorName(id);
  if(kind==="customer"){ var c=(state.customers||[]).find(function(x){ return String(x.id)===String(id); }); return c?c.name:"customer "+id; }
  return coShort();
}
// sites the feed hasn't loaded are named from dispatch_sites once; one that isn't found keeps its site_key
async function aLoadSites(rows){
  var have=state.feed.rows||[], keys=[];
  rows.forEach(function(a){ if(a.location_kind==="site"&&!(a.location_id in state.aSites)&&keys.indexOf(a.location_id)<0&&!have.some(function(x){ return x.siteKey===a.location_id; })) keys.push(a.location_id); });
  if(!keys.length) return;
  var co=state.company;
  try{ var got=sbErr(await supa.from("dispatch_sites").select("site_key,customer,site_label").eq("company",co).in("site_key",keys))||[];
    if(co!==state.company) return;   // switched company while loading
    keys.forEach(function(k){ state.aSites[k]=k; });
    got.forEach(function(s){ state.aSites[s.site_key]=s.customer+(s.site_label?" — "+s.site_label:""); }); }
  catch(e){ /* names fall back to the site_key */ }
}
function aOpts(list,chosen){ return list.map(function(o){ return '<option value="'+esc(o[0])+'"'+(o[0]===chosen?" selected":"")+">"+esc(o[1])+"</option>"; }).join(""); }
function aHubOpts(chosen,blank){ return aOpts((blank?[["",blank]]:[]).concat(state.hubs.map(function(h){ return [h.code,h.code+" — "+h.name]; })),chosen); }
function aTypeOpts(chosen,blank){ return aOpts([["",blank]].concat((state.ctypes||[]).filter(function(t){ return t.active||t.id===chosen; }).map(function(t){ return [t.id,t.size_label+" · "+t.product]; })),chosen); }
function aOwnerOpts(chosen){
  var list=[["adchem:",coShort()]];
  (state.vendors||[]).forEach(function(v){ if(v.active||"vendor:"+v.id===chosen) list.push(["vendor:"+v.id,v.name+" (vendor)"]); });
  (state.customers||[]).forEach(function(c){ if(c.id) list.push(["customer:"+c.id,(c.name||c.id)+" (customer)"]); });
  if(chosen&&!list.some(function(o){ return o[0]===chosen; })){ var p=chosen.split(":"); list.push([chosen,aOwnerName(p[0],p.slice(1).join(":"))]); }
  return aOpts(list,chosen);
}
function aOwnerSplit(v){ var i=String(v).indexOf(":"); return {owner_kind:v.slice(0,i),owner_id:v.slice(i+1)}; }

// the register's shell is built once per company; data is reloaded each time the tab opens
function aShell(){
  if(state.aShell===state.company&&$("aList")) return;
  state.aShell=state.company; state.aDetail=null;
  $("aRegister").innerHTML='<div class="card sec"><div class="pad" id="aTools"><h2 class="sec-h">Register</h2><div class="toolbar" style="margin-bottom:0">'+
    '<input id="aq" type="search" placeholder="Serial or tag" aria-label="Search serial or tag" autocomplete="off" spellcheck="false">'+
    '<select id="aHub" aria-label="Hub"></select>'+
    '<select id="aPlace" aria-label="Where">'+aOpts([["","Anywhere"],["hub","At a hub"],["site","At a customer"],["vendor","At a vendor"]],"")+"</select>"+
    '<select id="aOwner" aria-label="Owner">'+aOpts([["","Any owner"],["adchem",coShort()],["vendor","A vendor"],["customer","A customer"]],"")+"</select>"+
    '<select id="aFill" aria-label="Fill">'+aOpts([["","Any fill"],["full","full"],["empty","empty"],["unknown","unknown"]],"")+"</select>"+
    '<select id="aCond" aria-label="Condition">'+aOpts([["","Any condition"]].concat(A_CONDS.map(function(c){ return [c,aWords(c)]; })),"")+"</select>"+
    '<select id="aType" aria-label="Container type"></select></div></div>'+
    '<div id="aList"></div><div id="aDetail" class="pad" hidden></div></div>';
  var t=null;
  $("aq").oninput=function(){ clearTimeout(t); t=setTimeout(aDrawList,150); };
  ["aHub","aPlace","aOwner","aFill","aCond","aType"].forEach(function(k){ $(k).onchange=aDrawList; });
  var list=$("aList");
  list.onclick=function(ev){ var r=ev.target.closest("[data-id]"); if(r) aOpenDetail(r.getAttribute("data-id")); };
  list.onkeydown=function(ev){ if(ev.key!=="Enter"&&ev.key!==" ") return; var r=ev.target.closest("[data-id]"); if(r){ ev.preventDefault(); aOpenDetail(r.getAttribute("data-id")); } };
  var det=$("aDetail");
  det.onclick=function(ev){
    var b=ev.target.closest("button"); if(!b) return;
    var p=b.getAttribute("data-photo");
    if(p) aOpenPhoto(p,b);
    else if(b.id==="aBack") aCloseDetail();
    else if(b.id==="aOwnerSave") aSaveOwner();
    else if(b.id==="aEditSave") aSaveEdit();
    else if(b.id==="aLost") aSetCondition("lost");
    else if(b.id==="aRetired") aSetCondition("retired");
    else if(b.id==="aInService") aSetCondition("in_service");
  };
}
function aFillFilters(){
  var h=$("aHub").value, ty=$("aType").value;
  $("aHub").innerHTML=aOpts([["","All hubs"]].concat(state.hubs.map(function(x){ return [x.code,x.code]; })),h);
  $("aType").innerHTML=aOpts([["","All types"]].concat((state.ctypes||[]).map(function(x){ return [x.id,x.size_label+" · "+x.product]; })),ty);
}

async function renderAssets(){
  if(!canViewAssets()) return;
  aShell(); var co=state.company;
  try{ var r=await Promise.all([ADB.assets(),ADB.types(),ADB.vendors()]);
    if(co!==state.company) return;
    state.aRows=r[0]; state.ctypes=r[1]; state.vendors=r[2];
    await aLoadSites(state.aRows); if(co!==state.company) return; }
  catch(e){ banner("bad","Couldn't load the register","<div>"+esc(e.message)+"</div>",{key:"assets"}); }
  aFillFilters(); aDrawList(); aDrawActions();
  if(state.aDetail) aOpenDetail(state.aDetail);
  await aDrawCounts();
}
// after a change: the register, the open detail and the counts are read again
async function aRefresh(){
  var co=state.company;
  try{ var rows=await ADB.assets(); if(co!==state.company) return; state.aRows=rows; await aLoadSites(rows); }
  catch(e){ banner("bad","Couldn't reload the register","<div>"+esc(e.message)+"</div>",{key:"assets"}); }
  if(co!==state.company) return;
  aDrawList(); if(state.aDetail) await aOpenDetail(state.aDetail);
  await aDrawCounts();
}

function aFiltered(){
  var q=normSerial($("aq").value), hub=$("aHub").value, place=$("aPlace").value, own=$("aOwner").value, fill=$("aFill").value, cond=$("aCond").value, ty=$("aType").value;
  return state.aRows.filter(function(a){
    if(hub&&!(a.location_kind==="hub"&&a.location_id===hub)) return false;
    if(place&&a.location_kind!==place) return false;
    if(own&&a.owner_kind!==own) return false;
    if(fill&&a.fill_state!==fill) return false;
    if(cond&&(A_CONDS.indexOf(a.condition)<0?"in_service":a.condition)!==cond) return false;
    if(ty&&a.container_type_id!==ty) return false;
    if(q&&normSerial(a.serial).indexOf(q)<0&&normSerial(a.tag).indexOf(q)<0) return false;
    return true; });
}
function aChips(a){
  return '<span class="chip '+(A_FILL_CHIP[a.fill_state]||"hint")+'">'+esc(a.fill_state)+"</span>"+
    (A_COND_CHIP[a.condition]?' <span class="chip '+A_COND_CHIP[a.condition]+'">'+esc(aWords(a.condition))+"</span>":"");
}
function aDrawList(){
  var host=$("aList"); if(!host) return;
  if(!state.aRows.length){ host.innerHTML='<div class="pad hint">No containers in the register yet.'+(canManageAssets()?" Add them with Add assets below.":"")+"</div>"; return; }
  var list=aFiltered();
  if(!list.length){ host.innerHTML='<div class="pad hint">No containers match. Clear the search or filters to see all '+esc(state.aRows.length)+".</div>"; return; }
  host.innerHTML=list.map(function(a){
    return '<div class="doc-row hub a-row" role="button" tabindex="0" data-id="'+esc(a.id)+'"><div class="doc-name"><b class="mono">'+esc(a.serial)+"</b> "+aChips(a)+
      (a.tag?' <span class="hint">tag '+esc(a.tag)+"</span>":"")+"<div>"+esc(aTypeLabel(a.container_type_id,true))+"</div></div>"+
      '<div class="doc-meta"><span>'+esc(aOwnerName(a.owner_kind,a.owner_id))+'</span><span class="hint">'+esc(aPlaceName(a.location_kind,a.location_id))+"</span>"+
      (a.last_seen_at?'<span class="hint">seen '+esc(fmtWhen(a.last_seen_at))+"</span>":"")+"</div></div>";
  }).join("");
}

/* detail and history */
function aSortEvents(list){
  return list.slice().sort(function(a,b){
    var k=[["occurred_at"],["created_at"],["id"]];
    for(var i=0;i<k.length;i++){ var x=String(a[k[i]]||""), y=String(b[k[i]]||""); if(x!==y) return x<y?1:-1; }
    return 0; });
}
async function aOpenDetail(id){
  state.aDetail=id; var co=state.company, det=$("aDetail");
  $("aList").hidden=true; $("aTools").hidden=true; det.hidden=false;
  if(!det.firstChild) det.innerHTML='<p class="hint">Loading…</p>';
  var a, evs;
  try{ var r=await Promise.all([ADB.asset(id),ADB.events(id)]); a=r[0]; evs=r[1]; }
  catch(e){ if(co!==state.company||state.aDetail!==id) return;
    banner("bad","Couldn't load the container","<div>"+esc(e.message)+"</div>",{key:"assets"}); aCloseDetail(); return; }
  if(co!==state.company||state.aDetail!==id) return;
  if(!a){ banner("warn","That container is not in the register","",{autoclose:6000,key:"assets"}); aCloseDetail(); return; }
  var i=state.aRows.findIndex(function(x){ return x.id===id; }); if(i>=0) state.aRows[i]=a;
  await aLoadSites([a].concat(evs.map(function(e){ return {location_kind:e.from_kind,location_id:e.from_id}; }),evs.map(function(e){ return {location_kind:e.to_kind,location_id:e.to_id}; })));
  if(co!==state.company||state.aDetail!==id) return;
  det.innerHTML=aDetailHtml(a,aSortEvents(evs));
  window.scrollTo(0,0);
}
function aCloseDetail(){
  state.aDetail=null; var det=$("aDetail"); if(!det) return;
  det.hidden=true; det.innerHTML=""; $("aList").hidden=false; $("aTools").hidden=false; aDrawList();
}
function aFact(k,v){ return "<dt>"+esc(k)+"</dt><dd>"+(v===""||v==null?'<span class="hint">—</span>':esc(v))+"</dd>"; }
function aEvHtml(e){
  var from=e.from_kind?aPlaceName(e.from_kind,e.from_id):"", to=e.to_kind?aPlaceName(e.to_kind,e.to_id):"";
  var parts=[esc(fmtWhen(e.occurred_at)),"<b>"+esc(aWords(e.event_type))+"</b>"];
  if(from||to) parts.push(esc(from)+(to?" → "+esc(to):""));
  if(e.fill_after) parts.push(esc(e.fill_after));
  parts.push("by "+esc(whoName(e.recorded_by)));
  return '<div class="a-ev"><div class="a-ev-main">'+parts.join(" · ")+(e.note?'<div class="hint">'+esc(e.note)+"</div>":"")+"</div>"+
    (e.photo_path?'<button class="btn sm" type="button" data-photo="'+esc(e.photo_path)+'">📷 Photo</button>':"")+"</div>";
}
function aDetailHtml(a,evs){
  var mg=canManageAssets(), cond=A_CONDS.indexOf(a.condition)<0?"in_service":a.condition;
  var h='<div class="a-detail-h"><button class="btn sm" type="button" id="aBack">← Register</button><h3 class="mono">'+esc(a.serial)+"</h3>"+aChips(a)+"</div>"+
    '<dl class="a-facts">'+aFact("Type",aTypeLabel(a.container_type_id,true))+aFact("Tag",a.tag)+aFact("Owner",aOwnerName(a.owner_kind,a.owner_id))+
    aFact("Where",aPlaceName(a.location_kind,a.location_id,true))+aFact("Fill",a.fill_state)+aFact("Condition",aWords(a.condition))+
    aFact("Last seen",a.last_seen_at?fmtWhen(a.last_seen_at)+" · "+whoName(a.last_seen_by):"")+aFact("Hydro test due",a.hydro_due)+aFact("Acquired",a.acquired_on)+aFact("Notes",a.notes)+"</dl>"+
    '<h3 class="sec-h">History</h3><div class="a-hist">'+(evs.map(aEvHtml).join("")||'<p class="hint">No events yet.</p>')+"</div>";
  if(!mg) return h;
  return h+'<div class="a-manage"><h3 class="sec-h" style="margin:0">Change owner</h3>'+
    '<div class="a-owner"><label class="f">Owner<select id="aOwnerPick">'+aOwnerOpts(a.owner_kind+":"+(a.owner_kind==="adchem"?"":(a.owner_id||"")))+"</select></label>"+
      '<button class="btn" type="button" id="aOwnerSave">Save owner</button></div>'+
    '<h3 class="sec-h" style="margin:0">Details</h3><div id="aEdit" class="grid two">'+
      '<label class="f">Tag<input id="ae_tag" autocomplete="off" value="'+esc(a.tag||"")+'"></label>'+
      '<label class="f">Type<select id="ae_type">'+aTypeOpts(a.container_type_id||"","No type")+"</select></label>"+
      '<label class="f">Hydro test due<input id="ae_hydro" type="date" value="'+esc(a.hydro_due||"")+'"></label>'+
      '<label class="f">Acquired<input id="ae_acq" type="date" value="'+esc(a.acquired_on||"")+'"></label>'+
      '<label class="f spanall">Notes<textarea id="ae_notes">'+esc(a.notes||"")+"</textarea></label></div>"+
    '<div class="a-btns"><button class="btn primary" type="button" id="aEditSave">Save details</button>'+
      (cond!=="lost"?'<button class="btn danger" type="button" id="aLost">Mark lost</button>':"")+
      (cond!=="retired"?'<button class="btn" type="button" id="aRetired">Retired</button>':"")+
      (cond!=="in_service"?'<button class="btn" type="button" id="aInService">Back in service</button>':"")+"</div></div>";
}
function aCurrent(){ return state.aRows.find(function(x){ return x.id===state.aDetail; })||null; }
async function aCorrect(fields,what){
  var a=aCurrent(); if(!a||!canManageAssets()) return;
  try{ await ADB.correct(a.id,fields); banner("good",what,"<div>"+esc(a.serial)+"</div>",{autoclose:4000,key:"acorrect"}); }
  catch(e){ banner("bad","Not saved","<div>"+esc(e.message)+"</div>",{key:"acorrect"}); return; }
  await aRefresh();
}
function aSaveOwner(){
  var a=aCurrent(); if(!a) return;
  var o=aOwnerSplit($("aOwnerPick").value);
  if(o.owner_kind===a.owner_kind&&(o.owner_kind==="adchem"||o.owner_id===String(a.owner_id||""))){ banner("info","The owner is unchanged","",{autoclose:4000,key:"acorrect"}); return; }
  aCorrect(o,"Owner changed to "+aOwnerName(o.owner_kind,o.owner_id));
}
function aSaveEdit(){
  var a=aCurrent(); if(!a) return;
  var next={tag:$("ae_tag").value.trim(),container_type_id:$("ae_type").value,hydro_due:$("ae_hydro").value,acquired_on:$("ae_acq").value,notes:$("ae_notes").value.trim()};
  var f={};
  Object.keys(next).forEach(function(k){ if(String(next[k])!==String(a[k]==null?"":a[k])) f[k]=next[k]===""&&k!=="tag"&&k!=="notes"?null:next[k]; });
  if(!Object.keys(f).length){ banner("info","Nothing changed","",{autoclose:4000,key:"acorrect"}); return; }
  aCorrect(f,"Details saved");
}
function aSetCondition(c){ aCorrect({condition:c},c==="lost"?"Marked lost":c==="retired"?"Marked retired":"Back in service"); }
// the tab opens inside the click so a popup blocker lets it through, then goes to the signed URL (as openDocFile does)
async function aOpenPhoto(path,btn){
  var w=null; try{ w=window.open("","_blank"); }catch(e){ w=null; }
  if(btn) btn.disabled=true;
  try{ var r=await ADB.sign(path); if(!r||!r.url) throw new Error("No link came back for the photo.");
    if(w) w.location=r.url; else window.open(r.url,"_blank"); }
  catch(err){ if(w) try{ w.close(); }catch(e){} banner("bad","Couldn't open the photo","<div>"+esc(err.message)+"</div>"); }
  if(btn) btn.disabled=false;
}

/* counts: one table per container type, rows by fill, columns by hub, then customers, vendors, lost (any place); retired is left out */
async function aDrawCounts(){
  var host=$("aCounts"), co=state.company; if(!host) return;
  var rows;
  try{ var r=await ADB.counts(); rows=(r&&r.rows)||[]; }
  catch(e){ if(co===state.company) host.innerHTML='<div class="card pad sec"><h2 class="sec-h">Counts</h2><p class="hint">Couldn\'t load the counts: '+esc(e.message)+"</p></div>"; return; }
  if(co!==state.company) return;
  var hubs=state.hubs.map(function(h){ return h.code; });
  rows.forEach(function(x){ if(x.location_kind==="hub"&&x.hub&&hubs.indexOf(x.hub)<0) hubs.push(x.hub); });
  var cols=hubs.map(function(h){ return ["hub:"+h,h]; }).concat([["site","At customers"],["vendor","At vendors"],["lost","Lost"]]);
  var by={}, order=[];
  rows.forEach(function(x){
    if(x.condition==="retired") return;
    var k=x.container_type_id||"";
    if(!by[k]){ by[k]={label:x.size_label?x.size_label+(x.product?" · "+x.product:""):"No type",n:{}}; order.push(k); }
    var col=x.condition==="lost"?"lost":x.location_kind==="hub"?"hub:"+x.hub:x.location_kind;
    var key=x.fill_state+"|"+col; by[k].n[key]=(by[k].n[key]||0)+(Number(x.n)||0);
  });
  var rank=function(k){ var i=(state.ctypes||[]).findIndex(function(t){ return t.id===k; }); return i<0?1e6:i; };
  order.sort(function(a,b){ return rank(a)-rank(b); });
  var html=order.map(function(k){
    var g=by[k];
    return '<div class="a-counts-wrap"><table class="a-counts" data-ct="'+esc(k)+'"><caption>'+esc(g.label)+"</caption><tr><th></th>"+
      cols.map(function(c){ return '<th scope="col">'+esc(c[1])+"</th>"; }).join("")+"</tr>"+
      ["full","empty","unknown"].map(function(f){
        return '<tr><th scope="row">'+esc(f)+"</th>"+cols.map(function(c){ var n=g.n[f+"|"+c[0]]||0;
          return '<td data-fill="'+esc(f)+'" data-col="'+esc(c[0])+'"'+(n?"":' class="z"')+">"+esc(n)+"</td>"; }).join("")+"</tr>"; }).join("")+"</table></div>";
  }).join("");
  host.innerHTML='<div class="card pad sec"><h2 class="sec-h">Counts</h2>'+(html||'<p class="hint">No containers in the register yet.</p>')+
    (html?'<p class="hint">Lost counts every place; retired containers are not counted.</p>':"")+"</div>";
}

/* hub actions: one sheet, a list of serials (typed, or scanned and confirmed), one event per serial */
const ACTS={
  fill:{title:"Fill",sub:"Filled at the hub. Draws the product down by the type's fill weight."},
  to_vendor:{title:"To vendor",sub:"Sent from the hub to a vendor."},
  from_vendor:{title:"From vendor",sub:"Back from a vendor to the hub, full unless ticked empty."},
  move:{title:"Move",sub:"Moved from one hub to another."},
  add:{title:"Add assets",sub:"New containers into the register, at the hub."}
};
function aDrawActions(){
  var host=$("aActions"); if(!host) return;
  if(!canManageAssets()){ host.innerHTML=""; return; }
  host.innerHTML='<div class="card pad sec"><h2 class="sec-h">Hub actions</h2><div class="a-btns">'+
    Object.keys(ACTS).map(function(k){ return '<button class="btn" type="button" data-act="'+esc(k)+'">'+esc(ACTS[k].title)+"</button>"; }).join("")+
    '</div><p class="hint" style="margin:8px 0 0">Type the serials (or scan the tags), then confirm. Each serial is recorded on its own.</p></div>';
  host.onclick=function(ev){ var b=ev.target.closest("[data-act]"); if(b) openAct(b.getAttribute("data-act")); };
}
function openAct(kind){
  if(!canManageAssets()||!ACTS[kind]) return;
  state.act={kind:kind,items:[],results:[],sending:false,scan:null};
  var hub=(state.me&&state.me.hub)||(state.hubs[0]&&state.hubs[0].code)||"";
  $("actTitle").textContent=ACTS[kind].title; $("actSub").textContent=ACTS[kind].sub;
  $("act_hub").innerHTML=aHubOpts(hub);
  $("act_to_hub").innerHTML=aHubOpts("","Choose the hub");
  $("act_vendor").innerHTML=aOpts([["","Choose the vendor"]].concat((state.vendors||[]).filter(function(v){ return v.active; }).map(function(v){ return [v.id,v.name]; })),"");
  $("act_type").innerHTML=aTypeOpts("",kind==="add"?"Choose the type":"None");
  $("act_owner").innerHTML=aOwnerOpts("adchem:");
  $("act_fill").value="unknown"; $("act_empty").checked=false;
  $("act_hubLbl").firstChild.textContent=kind==="move"?"From hub":"Hub";
  $("act_vendorRow").hidden=!(kind==="to_vendor"||kind==="from_vendor");
  $("act_toHubRow").hidden=kind!=="move";
  $("act_ownerRow").hidden=$("act_fillRow").hidden=kind!=="add";
  $("act_emptyRow").hidden=kind!=="from_vendor";
  $("act_typeLbl").textContent=kind==="add"?"Type":"Type, for serials not in the register";
  $("act_serial").value=""; $("actPick").hidden=true; $("actPick").innerHTML="";
  actDraw(); $("actSheet").hidden=false; document.body.style.overflow="hidden";
  setTimeout(function(){ try{ $("act_serial").focus(); }catch(e){} },50);
}
function closeAct(){
  var A=state.act; if(A&&A.sending) return;
  $("actSheet").hidden=true; document.body.style.overflow=""; state.act=null;
  if(state.tab==="assets"&&canViewAssets()) aRefresh();
}
function actAdd(serial,extra){
  var A=state.act, s=normSerial(serial); if(!A||!s) return false;
  if(A.items.some(function(i){ return i.serial===s; })){ banner("warn",s+" is already in the list","",{autoclose:4000,key:"act"}); return false; }
  A.items.push(Object.assign({serial:s,id:newUuid()},extra||{}));
  actDraw(); return true;
}
function actStatusText(r){
  if(r.status==="applied") return "applied"+(r.created?" · new to the register":"")+(r.warning?" — warning: "+r.warning:"");
  if(r.status==="duplicate") return "duplicate — already recorded";
  if(r.status==="rejected") return "rejected: "+(r.reason||"refused");
  return "not sent — try again"+(r.reason?" ("+r.reason+")":"");
}
function actDraw(){
  var A=state.act; if(!A) return;
  $("act_list").innerHTML=A.items.map(function(i){
    return '<span class="act-item" data-serial="'+esc(i.serial)+'"><span class="mono">'+esc(i.serial)+"</span>"+(i.photoPath?' <span title="from a photo">📷</span>':"")+
      '<button class="x" type="button" data-unlist="'+esc(i.serial)+'" aria-label="Remove '+esc(i.serial)+'">×</button></span>'; }).join("");
  $("actResults").innerHTML=A.results.map(function(r){
    return '<div class="'+(r.status==="applied"?(r.warning?"warn":"good"):r.status==="duplicate"?"hint":"bad")+'"><b class="mono">'+esc(r.serial)+"</b> — "+esc(actStatusText(r))+"</div>"; }).join("");
  var c=$("act_confirm"); c.disabled=A.sending||!A.items.length;
  c.textContent=A.sending?"Sending…":A.items.length?"Confirm "+A.items.length+" serial"+(A.items.length===1?"":"s"):"Confirm";
}
function actTypedAdd(){ var inp=$("act_serial"); if(actAdd(inp.value)) inp.value=""; inp.focus(); }
function actBuild(kind,item,ctx,isNew){
  var e={id:item.id,serial:item.serial,occurredAt:new Date().toISOString()};
  if(kind==="fill") e.type="filled";
  else if(kind==="to_vendor"){ e.type="to_vendor"; e.from={kind:"hub",id:ctx.hub}; e.to={kind:"vendor",id:ctx.vendor}; }
  else if(kind==="from_vendor"){ e.type="from_vendor"; e.from={kind:"vendor",id:ctx.vendor}; e.to={kind:"hub",id:ctx.hub}; e.fillAfter=ctx.empty?"empty":"full"; }
  else if(kind==="move"){ e.type="moved"; e.from={kind:"hub",id:ctx.hub}; e.to={kind:"hub",id:ctx.toHub}; }
  else { e.type="created"; e.containerTypeId=ctx.typeId; e.ownerKind=ctx.owner.owner_kind; e.ownerId=ctx.owner.owner_id; e.to={kind:"hub",id:ctx.hub}; e.fillAfter=ctx.fill; }
  // a serial the register doesn't have yet: the server creates it with this type, at the hub (a fill names no place of its own)
  if(isNew&&kind!=="add"){ e.containerTypeId=ctx.typeId; if(kind==="fill") e.to={kind:"hub",id:ctx.hub}; }
  if(item.photoPath){ e.photoPath=item.photoPath; if(item.ocr) e.ocr=item.ocr; }
  return e;
}
async function actConfirm(){
  var A=state.act; if(!A||A.sending||!A.items.length||!canManageAssets()) return;
  var kind=A.kind, ctx={hub:$("act_hub").value,vendor:$("act_vendor").value,toHub:$("act_to_hub").value,typeId:$("act_type").value,
    owner:aOwnerSplit($("act_owner").value||"adchem:"),fill:$("act_fill").value,empty:$("act_empty").checked};
  var stop=function(t,b){ banner("warn",t,b?"<div>"+esc(b)+"</div>":"",{autoclose:7000,key:"act"}); };
  if(!ctx.hub) return stop("Choose the hub");
  if((kind==="to_vendor"||kind==="from_vendor")&&!ctx.vendor) return stop("Choose the vendor");
  if(kind==="move"&&(!ctx.toHub||ctx.toHub===ctx.hub)) return stop("Choose the hub they move to","It must be another hub.");
  if(kind==="add"&&!ctx.typeId) return stop("Choose a type for the new containers");
  A.sending=true; actDraw();
  var co=state.company, known={};
  try{ (await ADB.assets()).forEach(function(a){ known[normSerial(a.serial)]=a; }); }
  catch(e){ A.sending=false; actDraw(); banner("bad","Couldn't check the register","<div>"+esc(e.message)+" Nothing was sent.</div>",{key:"act"}); return; }
  if(state.act!==A||co!==state.company) return;
  var fresh=A.items.filter(function(i){ return !known[i.serial]; }).map(function(i){ return i.serial; });
  if(kind!=="add"&&fresh.length&&!ctx.typeId){ A.sending=false; actDraw(); return stop("Choose a type for the serials not in the register",fresh.join(", ")); }
  var items=A.items.slice(), events=items.map(function(i){ return actBuild(kind,i,ctx,!known[i.serial]); });
  var r;
  try{ r=await ADB.sendEvents(events); }
  catch(e){
    // a whole-batch 4xx (the server's bad_event) is a refusal sending again won't change; a network error or 5xx is retryable
    var refused=e.status>=400&&e.status<500;
    A.sending=false; A.results=items.map(function(i){ return {serial:i.serial,status:refused?"rejected":"error",reason:e.message}; }); actDraw();
    banner("bad",refused?"Not recorded":"Not sent — try again","<div>"+esc(e.message)+"</div>",{key:"act"}); return; }
  if(state.act!==A) return;
  var res=(r&&r.results)||[], keep=[], warns={}, applied=0, failed=0;
  A.results=items.map(function(i,n){ var x=res[n]||{status:"error",reason:"no answer for this serial"};
    var o={serial:i.serial,status:x.status,reason:x.reason,warning:x.warning,created:x.created};
    if(o.status==="applied"){ applied++; if(o.warning) (warns[o.warning]=warns[o.warning]||[]).push(i.serial); }
    // a refused or unsent serial stays in the list with the same event id, so sending it again can never record it twice
    else if(o.status!=="duplicate"){ failed++; keep.push(i); }
    return o; });
  A.items=keep; A.sending=false; actDraw();
  Object.keys(warns).forEach(function(w,n){ var s=warns[w].join(", ");
    if(kind==="fill"&&/no fill weight/.test(w)) banner("warn","Fill recorded — no fill weight on "+s,"<div>No stock was drawn down. Set the fill weight on Setup → Container types.</div>",{key:"actwarn"+n});
    else banner("warn",(kind==="fill"?"Fill recorded — ":"Recorded — ")+w,"<div>"+esc(s)+"</div>",{key:"actwarn"+n}); });
  if(failed) banner("bad",failed+" serial"+(failed===1?"":"s")+" not recorded","<div>They stay in the list. Fix what the result says, or press Confirm again.</div>",{key:"act"});
  else if(applied) banner("good",ACTS[kind].title+" recorded","<div>"+esc(applied+" serial"+(applied===1?"":"s"))+"</div>",{autoclose:4000,key:"act"});
  if(applied) aRefresh();
}
// Scan: the photo goes to <company>/asset/<event id>.jpg first, Vision reads it, the manager picks the serial; the event sent
// later carries the same id and the photo path
async function actScan(ev){
  var f=ev.target.files&&ev.target.files[0]; ev.target.value="";
  var A=state.act; if(!f||!A) return;
  if(!/^image\//.test(f.type||"image/")){ banner("warn","That isn't a photo","<div>Take a picture of the serial on the tag.</div>",{autoclose:6000,key:"actscan"}); return; }
  var pick=$("actPick"); pick.hidden=false; pick.innerHTML='<p class="hint" style="margin:0">Reading the serial…</p>';
  var id=newUuid(), path=state.company+"/asset/"+id+".jpg", t=aTypeOf($("act_type").value);
  try{ var blob=await shrinkPhoto(f);
    var up=await supa.storage.from("dispatch-docs").upload(path,blob,{contentType:"image/jpeg",upsert:false});
    if(up.error) throw new Error(up.error.message||String(up.error)); }
  catch(e){ if(state.act===A){ pick.hidden=true; pick.innerHTML=""; } banner("bad","Photo not uploaded","<div>"+esc(e.message)+" Type the serial instead.</div>",{key:"actscan"}); return; }
  var r;
  try{ r=(await ADB.read(id,t?t.kind:"cylinder",path))||{}; }catch(e){ r={candidates:[],raw:"",error:e.message}; }
  if(state.act!==A) return;
  A.scan={id:id,path:path,raw:String(r.raw||"").slice(0,2000),candidates:(r.candidates||[]).slice(0,3),error:r.error||""};
  actDrawPick();
}
function actDrawPick(){
  var A=state.act, pick=$("actPick"); if(!A||!A.scan){ pick.hidden=true; pick.innerHTML=""; return; }
  var c=A.scan.candidates.filter(function(x){ return normSerial(x.text); });
  pick.innerHTML=(c.length?'<button class="bigbtn primary act-top mono" type="button" data-pick="'+esc(normSerial(c[0].text))+'">'+esc(c[0].text)+"</button>"+
      (c.length>1?'<div class="act-alts"><span class="hint">or</span>'+c.slice(1).map(function(x){ return '<button class="btn sm mono" type="button" data-pick="'+esc(normSerial(x.text))+'">'+esc(x.text)+"</button>"; }).join("")+"</div>":"")
      :'<p class="hint" style="margin:0">'+esc(A.scan.error?"Couldn't read the photo ("+A.scan.error+").":"No serial found in the photo.")+" Type it below.</p>")+
    '<div class="act-entry" style="margin-top:0"><input id="actPickTyped" autocomplete="off" spellcheck="false" placeholder="Or type the serial on the tag" aria-label="Serial on the tag">'+
    '<button class="btn" type="button" data-pick-typed="1">Use</button><button class="btn" type="button" data-pick-cancel="1">Cancel</button></div>';
}
function actPick(text){
  var A=state.act; if(!A||!A.scan) return;
  var s=A.scan, ok=actAdd(text,{id:s.id,photoPath:s.path,ocr:{raw:s.raw,candidates:s.candidates,picked:normSerial(text)}});
  if(ok){ A.scan=null; actDrawPick(); }
}

(function wireActs(){
  if(!$("actSheet")) return;
  $("actClose").onclick=closeAct;
  $("actSheet").addEventListener("keydown",function(e){ if(e.key==="Escape") closeAct(); });
  $("act_serial").onkeydown=function(e){ if(e.key==="Enter"){ e.preventDefault(); actTypedAdd(); } };
  $("act_add").onclick=actTypedAdd;
  $("act_photo").onchange=actScan;
  $("act_scanLbl").onkeydown=function(e){ if(e.key==="Enter"||e.key===" "){ e.preventDefault(); $("act_photo").click(); } };
  $("act_confirm").onclick=actConfirm;
  $("act_list").onclick=function(ev){ var b=ev.target.closest("[data-unlist]"); var A=state.act; if(!b||!A||A.sending) return;
    var s=b.getAttribute("data-unlist"); A.items=A.items.filter(function(i){ return i.serial!==s; }); actDraw(); };
  var pick=$("actPick");
  pick.onclick=function(ev){ var b=ev.target.closest("button"); if(!b) return;
    if(b.getAttribute("data-pick")) actPick(b.getAttribute("data-pick"));
    else if(b.getAttribute("data-pick-typed")) actPick($("actPickTyped").value);
    else if(b.getAttribute("data-pick-cancel")&&state.act){ state.act.scan=null; actDrawPick(); } };
  pick.onkeydown=function(ev){ if(ev.key==="Enter"&&ev.target.id==="actPickTyped"){ ev.preventDefault(); actPick(ev.target.value); } };
})();

/* ---------- Today (drivers): the Cylinders sheet at a stop, Load at the hub, My truck ----------
   A stop's sheet has one Deliver slot per unit of each Gases line on the order (its type matched by product and size) and, under
   Collecting, the containers the register has at the site (state.todayAssets, loaded by todayExtras). A slot is filled by a photo
   of the tag (uploaded to <company>/asset/<event id>.jpg, read by /api/assets, the top candidate confirmed with Yes) or by typing.
   The serial is looked up at the site, then with dispatch_asset_by_serial: a known one ticks the slot ("was at X" when the register
   had it elsewhere: the event's from is the driver's hub or stop, so the server writes the sighted correction); an unknown one opens
   the new-container form. Done sends one batch, each event with the id made on this phone. With no signal, or no answer, the batch
   (with any photo not yet uploaded) is kept in IndexedDB store "a" and sent by Send waiting photos; the same ids make a resend
   harmless. Load is the same sheet with free-form slots (loaded, to the hub); My truck lists today's loaded minus delivered. */
state.cyl=null; state.truckOpen=false;
function cylHub(){ return (state.me&&state.me.hub)||""; }
function cylOrder(id){ return (state.orders||[]).find(function(o){ return o.id===id; })||null; }
function cylSite(k){ return (state.feed.rows||[]).find(function(r){ return r.siteKey===k; })||null; }
function cylGasLines(o){ return ((o&&o.lines)||[]).filter(function(l){ return l.category==="Gases"&&l.product; }); }
// the register's containers at a site, as todayExtras loaded them for this company
function cylSiteAssets(k){ return (state.todayX&&state.todayX.company===state.company&&(state.todayAssets||{})[k])||[]; }
function cylTypeFor(product,container){
  var c=String(container||"").trim().toLowerCase();
  return (state.ctypes||[]).find(function(t){ return t.active!==false&&t.product===product&&String(t.size_label).trim().toLowerCase()===c; })||null;
}
function cylindersButtonHtml(orderId,site){
  if(state.role!=="driver"||!site||!site.siteKey) return "";
  if(!cylGasLines(cylOrder(orderId)).length&&!cylSiteAssets(site.siteKey).length) return "";
  return '<button class="btn sm" type="button" data-cyl="'+esc(orderId)+'" data-cyl-site="'+esc(site.siteKey)+'">Cylinders / Cilindros</button>';
}
// kind: deliver | collect | load. status: open (no serial) · here (at the site, not picked up) · ok · new · done · rejected · queued
function cylItem(kind,extra){
  return Object.assign({kind:kind,product:"",container:"",typeId:null,lineTypeId:null,assetId:null,serial:null,eventId:null,photoPath:null,ocr:null,at:null,
    status:"open",wasAt:"",unchecked:false,isNew:false,newType:null,newOwner:"adchem",newFill:null,reason:"",warning:""},extra||{});
}
function cylBase(mode){
  return {mode:mode,company:state.company,orderId:null,bolNo:null,siteKey:null,customerId:null,customer:"",label:"",slots:[],collecting:[],extra:[],
    active:null,scan:null,newFor:null,blobs:{},uploaded:{},sending:false,looking:false};
}
function openCylinders(orderId,siteKey){
  if(state.role!=="driver") return;
  var o=cylOrder(orderId), site=cylSite(siteKey); if(!o||!site) return;
  var C=cylBase("stop");
  C.orderId=o.id; C.bolNo=o.bolNo; C.siteKey=siteKey; C.customerId=site.customerId||null;
  C.customer=o.customer+(o.siteLabel&&o.siteLabel!=="Primary"?" — "+o.siteLabel:"");
  C.label=(o.bolNo?"BOL "+o.bolNo:o.id)+" · "+o.customer;
  cylGasLines(o).forEach(function(l){ var t=cylTypeFor(l.product,l.container), n=Math.min(Math.max(parseInt(l.qty,10)||0,0),50);
    for(var i=0;i<n;i++) C.slots.push(cylItem("deliver",{product:l.product,container:l.container,typeId:t?t.id:null,lineTypeId:t?t.id:null})); });
  C.collecting=cylSiteAssets(siteKey).map(function(a){ return cylItem("collect",{assetId:a.id,serial:normSerial(a.serial),typeId:a.container_type_id,status:"here"}); });
  state.cyl=C;
  cylShow("Cylinders / Cilindros",C.customer+" · "+(o.bolNo?"BOL "+o.bolNo:"Order "+o.id)+". Scan each cylinder you leave, tick each one you pick up, then Done.");
}
function openLoad(){
  if(state.role!=="driver"||!cylHub()) return;
  var C=cylBase("load"); C.label="Load at "+cylHub()+" · "+ymd(new Date());
  state.cyl=C;
  cylShow("Load the truck / Cargar","At "+cylHub()+". Add each cylinder you put on the truck, then Done.");
}
function cylShow(title,sub){
  var C=state.cyl;
  $("cylTitle").textContent=title; $("cylSub").textContent=sub;
  $("cylSlotsH").textContent=C.mode==="load"?"On the truck / En el camión":"Delivering / Entregando";
  $("cylCollectWrap").hidden=C.mode!=="stop"; $("cylAddSlot").hidden=C.mode!=="load";
  $("cylNew").hidden=true; $("cyl_typed").value=""; cylMsg(""); cylSay("","");
  cylDraw(); $("cylSheet").hidden=false; document.body.style.overflow="hidden";
  if(!(state.ctypes||[]).length) cylLoadTypes(C);
}
// the types usually come with Today's extras; when they haven't yet, read them now and fill the slots' types
async function cylLoadTypes(C){
  try{ var t=await ADB.types(); if(C.company!==state.company) return; state.ctypes=t; }catch(e){ return; }
  if(state.cyl!==C) return;
  C.slots.forEach(function(it){ if(it.kind==="deliver"&&!it.typeId){ var x=cylTypeFor(it.product,it.container); if(x) it.typeId=it.lineTypeId=x.id; } });
  cylDraw();
}
function closeCylinders(){
  var C=state.cyl; if(C&&C.sending) return;
  $("cylSheet").hidden=true; document.body.style.overflow=""; state.cyl=null;
  $("cylPick").hidden=true; $("cylNew").hidden=true;
  if(state.tab==="today") renderToday();
}
function cylSay(kind,html){ var el=$("cylStatus"); if(!html){ el.innerHTML=""; el.className=""; return; }
  el.className="banner "+kind; el.style.margin="10px 0 0"; el.innerHTML="<div>"+html+"</div>"; }
function cylMsg(text){ $("cylPickMsg").textContent=text||""; }
function cylAll(){ var C=state.cyl; if(!C) return [];
  return C.slots.map(function(it,i){ return {ref:"s:"+i,item:it}; }).concat(C.collecting.map(function(it,i){ return {ref:"c:"+i,item:it}; }),C.extra.map(function(it,i){ return {ref:"x:"+i,item:it}; })); }
function cylRef(ref){ var C=state.cyl; if(!C||!ref) return null; var p=String(ref).split(":"), l=p[0]==="s"?C.slots:p[0]==="c"?C.collecting:p[0]==="x"?C.extra:null; return (l&&l[+p[1]])||null; }
function cylWhat(it){
  if(it.kind==="deliver") return (it.container||"Cylinder")+" · "+(it.product||"");
  if(it.typeId) return aTypeLabel(it.typeId,true);
  return it.kind==="load"?"Cylinder for the truck":"Cylinder to pick up";
}
function cylStatusText(it){
  if(it.status==="open") return "not scanned yet";
  if(it.status==="here") return "at the site — tick it if you pick it up";
  if(it.status==="new") return "✓ new to the register · "+aTypeLabel(it.newType,true)+" · "+(it.newOwner==="customer"?"customer's":coShort()+"'s");
  if(it.status==="ok") return "✓"+(it.kind==="collect"&&it.assetId?" picking up":"")+(it.wasAt?" — was at "+it.wasAt:"")+(it.unchecked?" — not checked, no signal":"");
  if(it.status==="done") return "✓ recorded"+(it.warning?" — "+it.warning:"");
  if(it.status==="rejected") return "rejected: "+(it.reason||"refused");
  if(it.status==="queued") return "waiting to send";
  return it.status;
}
function cylRowHtml(it,ref,attr){
  var C=state.cyl, locked=C.sending||it.status==="done"||it.status==="queued", btn="";
  if(!locked){
    if(it.kind==="collect"&&it.assetId&&(it.status==="here"||it.status==="ok"))
      btn='<button class="btn sm'+(it.status==="ok"?" primary":"")+'" type="button" data-collect="'+esc(it.assetId)+'" aria-pressed="'+(it.status==="ok")+'">'+(it.status==="ok"?"✓ Picking up":"Pick up / Recoger")+"</button>";
    else if(it.serial&&it.status!=="open") btn='<button class="btn sm" type="button" data-clear="'+esc(ref)+'">Change</button>';
    else btn='<button class="btn sm primary" type="button" data-open="'+esc(ref)+'">Scan or type</button>';
  }
  var cls=it.status==="done"?"good":it.status==="rejected"?"bad":it.status==="queued"||it.wasAt||it.unchecked?"warn":"hint";
  return '<div class="cyl-row'+(C.active===ref?" on":"")+'" '+attr+'><div class="cyl-what">'+(it.serial?'<span class="cyl-ser mono">'+esc(it.serial)+"</span> ":"")+
    '<span class="hint">'+esc(cylWhat(it))+"</span>"+(it.photoPath?' <span title="from a photo">📷</span>':"")+"</div>"+btn+
    '<div class="cyl-note '+cls+'">'+esc(cylStatusText(it))+"</div></div>";
}
function cylDraw(){
  var C=state.cyl; if(!C) return;
  $("cylSlots").innerHTML=C.slots.map(function(it,i){ return cylRowHtml(it,"s:"+i,'data-slot="'+esc(i)+'"'); }).join("")||
    '<p class="hint">'+(C.mode==="load"?"Press Add a cylinder for each one you put on the truck.":"No gas on this order to deliver.")+"</p>";
  $("cylCollect").innerHTML=C.collecting.map(function(it,i){ return cylRowHtml(it,"c:"+i,'data-coll="'+esc(it.assetId)+'"'); })
    .concat(C.extra.map(function(it,i){ return cylRowHtml(it,"x:"+i,'data-extra="'+esc(i)+'"'); })).join("")||'<p class="hint">The register has nothing at this site.</p>';
  var n=cylAll().filter(function(x){ return x.item.status==="ok"||x.item.status==="new"; }).length, d=$("cylDone");
  d.disabled=C.sending; d.textContent=C.sending?"Sending… / Enviando…":n?"Done — send "+n+" / Listo":"Done / Listo";
  $("cylAddSlot").disabled=$("cylAddCollect").disabled=C.sending;
  cylDrawPick();
}
function cylDrawPick(){
  var C=state.cyl, pick=$("cylPick"), it=C&&cylRef(C.active);
  if(!it||C.newFor||C.sending){ pick.hidden=true; return; }
  pick.hidden=false;
  var n=C.active.split(":"), head=n[0]==="s"?(C.mode==="load"?"Cylinder "+(+n[1]+1)+" for the truck":"Slot "+(+n[1]+1)+" — "+cylWhat(it)):"Another cylinder to pick up";
  $("cylPickHead").textContent=head;
  var s=C.scan&&C.scan.ref===C.active?C.scan:null, h="";
  if(s&&s.busy) h='<p class="hint" style="margin:0">Reading the serial… / Leyendo…</p>';
  else if(s){ var c=s.candidates.filter(function(x){ return normSerial(x.text); });
    h=c.length?'<div class="cyl-top mono">'+esc(c[0].text)+'</div><button class="bigbtn primary" type="button" id="cylYes" data-cpick="'+esc(normSerial(c[0].text))+'">Yes, that is the serial / Sí</button>'+
        (c.length>1?'<div class="act-alts"><span class="hint">or</span>'+c.slice(1).map(function(x){ return '<button class="btn sm mono" type="button" data-cpick="'+esc(normSerial(x.text))+'">'+esc(x.text)+"</button>"; }).join("")+"</div>":"")
      :'<p class="hint" style="margin:0">'+esc(!s.uploaded?(s.error?"The photo didn't upload ("+s.error+").":"No signal to read the photo — it is kept and sent with the cylinders."):s.error?"Couldn't read the photo ("+s.error+").":"No serial found in the photo.")+" Type it below.</p>"; }
  $("cylCands").innerHTML=h;
}
function cylOpen(ref){
  var C=state.cyl; if(!C||C.sending||C.looking||C.newFor) return;
  C.active=ref; C.scan=null; $("cyl_typed").value=""; cylMsg(""); cylDraw();
  setTimeout(function(){ try{ $("cylPick").scrollIntoView({block:"nearest"}); $("cyl_typed").focus(); }catch(e){} },30);
}
function cylAdd(which){
  var C=state.cyl; if(!C||C.sending||C.looking||C.newFor) return;
  if(which==="slot"){ C.slots.push(cylItem("load")); cylOpen("s:"+(C.slots.length-1)); }
  else { C.extra.push(cylItem("collect")); cylOpen("x:"+(C.extra.length-1)); }
}
// an added row left without a serial goes away again
function cylDropEmpty(){
  var C=state.cyl; if(!C) return;
  C.extra=C.extra.filter(function(it){ return it.serial; });
  if(C.mode==="load") C.slots=C.slots.filter(function(it){ return it.serial; });
}
function cylCancel(){ var C=state.cyl; if(!C||C.looking||(C.scan&&C.scan.busy)) return; C.active=null; C.scan=null; cylMsg(""); cylDropEmpty(); cylDraw(); }
function cylClear(it){
  it.serial=null; it.eventId=null; it.photoPath=null; it.ocr=null; it.at=null; it.status="open"; it.wasAt=""; it.unchecked=false;
  it.isNew=false; it.newType=null; it.newOwner="adchem"; it.newFill=null; it.reason=""; it.warning="";
  if(it.kind==="deliver") it.typeId=it.lineTypeId; else if(!it.assetId) it.typeId=null;
}
function cylToggle(assetId){
  var C=state.cyl; if(!C||C.sending) return;
  var it=C.collecting.find(function(x){ return x.assetId===assetId; }); if(!it) return;
  if(it.status==="here"){ it.status="ok"; it.eventId=newUuid(); it.at=new Date().toISOString(); }
  else if(it.status==="ok"){ it.status="here"; it.eventId=null; it.at=null; it.photoPath=null; it.ocr=null; }
  cylDraw();
}
// the photo to its fixed path; an object already there is this event's own, from an upload whose answer was lost
async function cylUpload(path,blob){
  var up; try{ up=await supa.storage.from("dispatch-docs").upload(path,blob,{contentType:"image/jpeg",upsert:false}); }catch(e){ throw capError(e); }
  if(!up.error) return;
  var code=String(up.error.statusCode||up.error.status||"");
  if(code==="409"||/already exists|duplicate/i.test(String(up.error.message||up.error.error||""))) return;
  throw capError(up.error);
}
async function cylScan(ev){
  var f=ev.target.files&&ev.target.files[0]; ev.target.value="";
  var C=state.cyl; if(!f||!C||!C.active||C.sending||C.looking) return;
  if(!/^image\//.test(f.type||"image/")){ cylMsg("That isn't a photo. Take a picture of the serial on the tag."); return; }
  var ref=C.active, it=cylRef(ref), id=newUuid(), path=C.company+"/asset/"+id+".jpg";
  C.scan={ref:ref,id:id,path:path,busy:true,candidates:[],raw:"",error:"",uploaded:false}; cylMsg(""); cylDrawPick();
  var blob=await shrinkPhoto(f), s=C.scan;
  if(state.cyl!==C||!s||s.id!==id) return;
  C.blobs[id]=blob;
  if(navigator.onLine!==false){ try{ await cylUpload(path,blob); C.uploaded[id]=true; s.uploaded=true; }catch(e){ if(!e.net) s.error=e.message; } }
  if(state.cyl!==C||C.scan!==s) return;
  if(s.uploaded){ var t=aTypeOf(it&&it.typeId), r;
    try{ r=(await ADB.read(id,t?t.kind:"cylinder",path))||{}; }catch(e){ r={candidates:[],raw:"",error:e.message}; }
    if(state.cyl!==C||C.scan!==s) return;
    s.raw=String(r.raw||"").slice(0,2000); s.candidates=(r.candidates||[]).slice(0,3); s.error=r.error||""; }
  s.busy=false; cylDrawPick();
  try{ (s.candidates.length?$("cylYes"):$("cyl_typed")).focus(); }catch(e){}
}
// the register's row for a serial: the site's containers first, then dispatch_asset_by_serial (any place in the company)
async function cylLookup(s){
  var C=state.cyl, here=C.siteKey?cylSiteAssets(C.siteKey).find(function(a){ return normSerial(a.serial)===s; }):null;
  if(here) return {asset:here};
  if(navigator.onLine===false) return {failed:true};
  try{ var r=sbErr(await supa.rpc("dispatch_asset_by_serial",{p_company:C.company,p_serial:s})); return {asset:(r&&r[0])||null}; }
  catch(e){ return {failed:true}; }
}
async function cylUse(text){
  var C=state.cyl, ref=C&&C.active, it=cylRef(ref); if(!it||C.sending||C.looking||(C.scan&&C.scan.busy)) return;
  var s=normSerial(text); if(!s){ cylMsg("Type the serial on the tag."); return; }
  if(cylAll().some(function(x){ return x.item!==it&&x.item.serial===s&&!(x.item.kind==="collect"&&x.item.assetId&&x.item.status==="here"); })){
    cylMsg(s+" is already used on this sheet. / Ya está en la lista."); return; }
  // typed under "another to pick up" but it is one the register has here: tick that one instead
  var listed=it.kind==="collect"&&!it.assetId?C.collecting.find(function(x){ return x.serial===s&&x.status==="here"; }):null;
  if(listed){ C.active=null; C.scan=null; cylDropEmpty(); cylToggle(listed.assetId); cylMsg(""); return; }
  C.looking=true; cylMsg("Checking "+s+"… / Revisando…");
  var found=await cylLookup(s);
  C.looking=false;
  if(state.cyl!==C||C.active!==ref) return;
  var sc=C.scan&&C.scan.ref===ref&&!C.scan.busy?C.scan:null;
  cylClear(it); it.serial=s; it.at=new Date().toISOString();
  if(sc){ it.eventId=sc.id; it.photoPath=sc.path; it.ocr={raw:sc.raw,candidates:sc.candidates,picked:s}; } else it.eventId=newUuid();
  cylMsg("");
  if(found.failed){ it.status="ok"; it.unchecked=true; }
  else if(found.asset){ var a=found.asset, exp=it.kind==="collect"?{kind:"site",id:C.siteKey}:{kind:"hub",id:cylHub()};
    it.status="ok"; if(it.kind!=="deliver"&&a.container_type_id) it.typeId=a.container_type_id;
    if(!(a.location_kind===exp.kind&&String(a.location_id)===String(exp.id))) it.wasAt=aPlaceName(a.location_kind,a.location_id)||"somewhere else"; }
  else { it.status="open"; C.newFor=ref; }
  C.active=C.newFor?ref:null; C.scan=null; $("cyl_typed").value="";
  if(C.newFor) cylOpenNew(it); cylDraw();
}
function cylOpenNew(it){
  var C=state.cyl, owners=[["adchem",coShort()]];
  if(C.customerId&&it.kind!=="load") owners.push(["customer",(C.customer||"The customer")+" (customer)"]);
  $("cylNewHead").textContent=it.serial+" is not in the register yet — add it / No está registrado";
  $("cyln_type").innerHTML=aTypeOpts(it.typeId||"","Choose the type");
  $("cyln_owner").innerHTML=aOpts(owners,"adchem");
  $("cyln_fill").value=it.kind==="collect"?"empty":"full";
  $("cylNew").hidden=false; $("cylPick").hidden=true;
  setTimeout(function(){ try{ $("cylNew").scrollIntoView({block:"nearest"}); $("cyln_type").focus(); }catch(e){} },30);
}
function cylNewDone(ok){
  var C=state.cyl, it=C&&cylRef(C.newFor); if(!it) return;
  if(ok){ var t=$("cyln_type").value;
    if(!t){ banner("warn","Choose the type","<div>A new container needs its type.</div>",{autoclose:6000,key:"cyl"}); return; }
    it.isNew=true; it.newType=t; it.typeId=t; it.newOwner=$("cyln_owner").value==="customer"?"customer":"adchem"; it.newFill=$("cyln_fill").value; it.status="new"; }
  else cylClear(it);
  C.newFor=null; C.active=null; $("cylNew").hidden=true; cylDropEmpty(); cylDraw();
}
// GPS when the phone gives it within 3 s; never holds the batch up
function cylGps(){
  return new Promise(function(res){ var done=false, fin=function(v){ if(!done){ done=true; res(v); } };
    try{ if(!navigator.geolocation) return fin(null);
      navigator.geolocation.getCurrentPosition(function(p){ var c=p.coords; fin({lat:c.latitude,lng:c.longitude,accuracy:c.accuracy}); },function(){ fin(null); },{timeout:3000,maximumAge:60000});
      setTimeout(function(){ fin(null); },3500); }
    catch(e){ fin(null); } });
}
function cylEvent(C,it,gps){
  var hub={kind:"hub",id:cylHub()}, site=C.siteKey?{kind:"site",id:C.siteKey}:null, e={id:it.eventId,serial:it.serial,occurredAt:it.at||new Date().toISOString()};
  if(it.kind==="deliver"){ e.type="delivered"; e.from=hub; e.to=site; e.fillAfter="full"; }
  else if(it.kind==="collect"){ e.type="collected"; e.from=site; e.to=hub; e.fillAfter="empty"; }
  else { e.type="loaded"; e.from=hub; e.to=hub; }
  if(it.isNew){ e.containerTypeId=it.newType; e.ownerKind=it.newOwner; if(it.newOwner==="customer") e.ownerId=String(C.customerId); if(it.newFill) e.fillAfter=it.newFill; }
  else if(it.unchecked&&it.typeId) e.containerTypeId=it.typeId;   // not checked (no signal): if the register lacks it, the server adds it with the slot's type
  if(C.mode==="stop"){ e.orderId=C.orderId; e.siteKey=C.siteKey; var bn=Number(C.bolNo); if(C.bolNo!=null&&C.bolNo!==""&&Number.isInteger(bn)&&bn>=0) e.bolNumber=bn; }
  if(it.photoPath){ e.photoPath=it.photoPath; if(it.ocr) e.ocr=it.ocr; }
  if(gps) e.gps=gps;
  return e;
}
// uploads every kept photo of a batch (an object already there counts as uploaded); a photo refused outright is left off its event.
// Throws (err.net) when there is no signal. onDone(id) runs after each one.
async function cylUploadAll(x,onDone){
  var ids=Object.keys(x.blobs||{});
  for(var i=0;i<ids.length;i++){
    var id=ids[i], ev=x.events.find(function(e){ return e.id===id; });
    if(ev&&ev.photoPath){ try{ await cylUpload(ev.photoPath,x.blobs[id]); }catch(e){ if(e.net) throw e; delete ev.photoPath; x.photoLost=(x.photoLost||0)+1; } }
    delete x.blobs[id]; if(onDone) await onDone(id);
  }
}
async function cylDone(){
  var C=state.cyl; if(!C||C.sending||C.looking) return;
  if(C.newFor){ banner("warn","Finish the new container first","<div>Press Add it, or Cancel.</div>",{autoclose:6000,key:"cyl"}); return; }
  var items=cylAll().map(function(x){ return x.item; }).filter(function(it){ return (it.status==="ok"||it.status==="new")&&it.serial&&it.eventId; });
  if(!items.length){ cylSay("warn","Nothing to send yet. Scan or type each cylinder"+(C.mode==="stop"?", or tick what you pick up.":".")); return; }
  C.sending=true; C.active=null; C.scan=null; cylMsg(""); cylDraw(); cylSay("info","Sending… / <i>Enviando…</i>");
  var gps=await cylGps();
  var events=items.map(function(it){ return cylEvent(C,it,gps); }), blobs={};
  items.forEach(function(it){ if(it.photoPath&&!C.uploaded[it.eventId]&&C.blobs[it.eventId]) blobs[it.eventId]=C.blobs[it.eventId]; });
  var batch={id:newUuid(),company:C.company,label:C.label,at:Date.now(),events:events,blobs:blobs};
  if(navigator.onLine===false||C.company!==state.company) return cylKeep(C,items,batch,"offline");
  try{ await cylUploadAll(batch,function(id){ C.uploaded[id]=true; }); }
  catch(e){ return cylKeep(C,items,batch,"network"); }
  var r;
  try{ r=await ADB.sendEvents(batch.events); }
  catch(e){
    if(!(e.status>=400&&e.status<500)) return cylKeep(C,items,batch,"network");
    items.forEach(function(it){ it.status="rejected"; it.reason=e.message; });
    C.sending=false; cylDraw(); cylSay("bad","<b>Not recorded.</b> "+esc(e.message)); return;
  }
  var res=(r&&r.results)||[], left=[], keepItems=[], applied=0, refused=0;
  items.forEach(function(it,n){ var x=res[n]||{status:"error",reason:"no answer for this serial"};
    if(x.status==="applied"||x.status==="duplicate"){ it.status="done"; it.warning=x.warning||""; applied++; }
    else if(x.status==="rejected"){ it.status="rejected"; it.reason=x.reason||"refused"; refused++; }
    else { left.push(batch.events[n]); keepItems.push(it); } });
  if(left.length){ batch.events=left; await cylKeep(C,keepItems,batch,"error"); }
  C.sending=false; cylDraw();
  if(left.length) return;
  if(refused) cylSay("bad","<b>"+esc(refused+" not recorded")+"</b> — the reason is on each one. Change the serial and press Done again, or tell the office."+(applied?" "+esc(applied+" sent."):""));
  else cylSay("good","<b>Sent.</b> "+esc(applied+" cylinder"+(applied===1?"":"s"))+" in the register. / <i>Enviado.</i>"+(batch.photoLost?" "+esc(batch.photoLost+" photo(s) could not be stored."):"")+' <button class="lnk" id="cylDoneLnk" type="button">Close</button>');
  var dn=$("cylDoneLnk"); if(dn) dn.onclick=closeCylinders;
}
// keep the batch on this phone for Send waiting photos (same event ids, so a resend is harmless)
async function cylKeep(C,items,batch,why){
  var saved=await cylQueuePut(batch);
  if(saved) items.forEach(function(it){ it.status="queued"; });
  C.sending=false; if(state.cyl===C) cylDraw();
  updatePodQueueNote();
  cylSay("warn","<b>Not sent yet</b> — "+(why==="offline"?"no signal.":why==="error"?"the server couldn't record "+esc(items.length+" of them")+" just now.":"no answer from the server, so it may or may not have gone.")+
    (saved?" The photos are kept on this phone; press <b>Send waiting photos</b> on the Today list when you have signal.":" Keep this open and press <b>Done</b> again when you have signal.")+
    " / <i>No se envió todavía."+(saved?" Queda guardado en el teléfono.":"")+"</i>");
}
function cylStore(mode,fn){
  return podIdb().then(function(db){
    if(!db||!db.objectStoreNames.contains("a")) return null;
    return new Promise(function(res){ try{ var t=db.transaction("a",mode), out=fn(t.objectStore("a")); t.oncomplete=function(){ res(out&&"result" in out?out.result:true); };
      t.onerror=function(){ res(null); }; t.onabort=function(){ res(null); }; }catch(e){ res(null); } });
  });
}
function cylQueueAll(){ return cylStore("readonly",function(s){ return s.getAll(); }).then(function(r){ return Array.isArray(r)?r:[]; }); }
function cylQueuePut(x){ return cylStore("readwrite",function(s){ s.put(x); }).then(function(r){ return !!r; }); }
function cylQueueRemove(id){ return cylStore("readwrite",function(s){ s.delete(id); }); }
// Send waiting photos (Today): each kept batch, oldest first — its photos, then its events; stops at the first one without signal
async function cylFlush(){
  var q=(await cylQueueAll()).sort(function(a,b){ return (a.at||0)-(b.at||0); }), sent=0;
  for(var i=0;i<q.length;i++){
    var x=q[i]; if(x.company!==state.company) continue;   // sent with its own company, once that company is picked
    try{ await cylUploadAll(x,function(){ return cylQueuePut(x); }); }
    catch(e){ banner("bad","Cylinders not sent","<div>"+esc("Still no signal or no answer. "+e.message+" They stay on this phone; press Send waiting photos again later.")+"</div>",{key:"cylflush"}); break; }
    var r;
    try{ r=await ADB.sendEvents(x.events); }
    catch(e){ var refused=e.status>=400&&e.status<500;
      banner("bad",refused?"Cylinders not recorded":"Cylinders not sent","<div>"+esc((x.label?x.label+": ":"")+e.message+(refused?" They stay on this phone; tell the office.":" They stay on this phone; press Send waiting photos again later."))+"</div>",{key:"cylflush"});
      if(refused) continue; break; }
    var res=(r&&r.results)||[], left=[], rej=[], before=x.events.length;
    x.events.forEach(function(ev,n){ var s=res[n]||{status:"error"}; if(s.status==="rejected") rej.push(ev.serial+": "+(s.reason||"refused")); else if(s.status!=="applied"&&s.status!=="duplicate") left.push(ev); });
    if(left.length){ x.events=left; await cylQueuePut(x); } else await cylQueueRemove(x.id);
    if(rej.length) banner("bad",rej.length+" cylinder"+(rej.length===1?"":"s")+" not recorded","<div>"+esc(rej.join("; "))+"</div>",{key:"cylrej"+i});
    if(left.length<before) sent++;
  }
  await updatePodQueueNote();
  if(sent&&state.tab==="today") renderToday();
}

/* Load / My truck: the card on Today for a driver with a hub */
function renderTruckCard(){
  var card=$("truckCard"); if(!card) return;
  var on=state.role==="driver"&&!!cylHub(); card.hidden=!on;
  if(!on){ state.truckOpen=false; $("truckList").hidden=true; $("truckList").innerHTML=""; }
}
async function drawMyTruck(){
  var host=$("truckList"), co=state.company, uid=state.session&&state.session.user.id; if(!uid) return;
  host.hidden=false; host.innerHTML='<p class="hint" style="margin:0">Loading… / Cargando…</p>';
  var since=new Date(); since.setHours(0,0,0,0);
  var evs, rows=[];
  try{ evs=sbErr(await supa.from("dispatch_asset_events").select("asset_id,event_type,occurred_at,created_at").eq("company",co).eq("recorded_by",uid)
      .in("event_type",["loaded","delivered"]).gte("occurred_at",since.toISOString()).order("occurred_at"))||[];
    var last={}; evs.forEach(function(e){ last[e.asset_id]=e.event_type; });
    var ids=Object.keys(last).filter(function(k){ return last[k]==="loaded"; });
    if(ids.length) rows=sbErr(await supa.from("dispatch_assets").select("id,serial,container_type_id,fill_state").eq("company",co).in("id",ids).order("serial"))||[]; }
  catch(e){ if(co===state.company&&state.truckOpen) host.innerHTML='<p class="hint" style="margin:0">'+esc("Couldn't load your truck: "+e.message)+"</p>"; return; }
  if(co!==state.company||!state.truckOpen) return;
  host.innerHTML=rows.length?'<div class="hint">'+esc(rows.length+" on the truck from today's loads / en el camión")+"</div>"+rows.map(function(a){
      return '<div class="cyl-row"><div class="cyl-what"><span class="cyl-ser mono">'+esc(a.serial)+'</span> <span class="hint">'+esc(aTypeLabel(a.container_type_id,true))+"</span></div>"+
        '<span class="chip '+(A_FILL_CHIP[a.fill_state]||"hint")+'">'+esc(a.fill_state)+"</span></div>"; }).join("")
    :'<p class="hint" style="margin:0">Nothing loaded today that hasn\'t been delivered. / Nada en el camión.</p>';
}

(function wireCyl(){
  if(!$("cylSheet")) return;
  $("todayList").addEventListener("click",function(ev){ var b=ev.target.closest&&ev.target.closest("[data-cyl]"); if(b) openCylinders(b.getAttribute("data-cyl"),b.getAttribute("data-cyl-site")); });
  $("cylClose").onclick=closeCylinders;
  $("cylSheet").addEventListener("keydown",function(e){ if(e.key==="Escape") closeCylinders(); });
  var rows=function(ev){ var b=ev.target.closest("button"); var C=state.cyl; if(!b||!C) return;
    if(b.getAttribute("data-open")) cylOpen(b.getAttribute("data-open"));
    else if(b.getAttribute("data-clear")){ var r=b.getAttribute("data-clear"), it=cylRef(r); if(it&&!C.sending&&!C.looking&&!C.newFor){ cylClear(it); cylOpen(r); } }
    else if(b.getAttribute("data-collect")) cylToggle(b.getAttribute("data-collect")); };
  $("cylSlots").onclick=rows; $("cylCollect").onclick=rows;
  $("cylAddSlot").onclick=function(){ cylAdd("slot"); };
  $("cylAddCollect").onclick=function(){ cylAdd("collect"); };
  $("cyl_photo").onchange=cylScan;
  $("cylScanLbl").onkeydown=function(e){ if(e.key==="Enter"||e.key===" "){ e.preventDefault(); $("cyl_photo").click(); } };
  $("cylCands").onclick=function(ev){ var b=ev.target.closest("[data-cpick]"); if(b) cylUse(b.getAttribute("data-cpick")); };
  $("cyl_use").onclick=function(){ cylUse($("cyl_typed").value); };
  $("cyl_typed").onkeydown=function(e){ if(e.key==="Enter"){ e.preventDefault(); cylUse($("cyl_typed").value); } };
  $("cyl_cancel").onclick=cylCancel;
  $("cyln_ok").onclick=function(){ cylNewDone(true); };
  $("cyln_cancel").onclick=function(){ cylNewDone(false); };
  $("cylDone").onclick=cylDone;
  $("btnLoad").onclick=openLoad;
  $("btnMyTruck").onclick=function(){ state.truckOpen=!state.truckOpen; $("btnMyTruck").setAttribute("aria-expanded",String(state.truckOpen));
    if(state.truckOpen) drawMyTruck(); else { $("truckList").hidden=true; $("truckList").innerHTML=""; } };
})();

/* ---------- Setup → Vendors ---------- */
async function renderVendors(){
  var card=$("vendorsCard"); if(!card) return;
  var view=canViewAssets(); card.hidden=!view; if(!view) return;
  var co=state.company;
  try{
    var v=await ADB.vendors(), t=await ADB.types();
    if(co!==state.company) return;   // switched company while loading
    state.vendors=v; state.ctypes=t;
  }catch(e){ banner("bad","Couldn't load vendors","<div>"+esc(e.message)+"</div>"); return; }
  var mg=canManageAssets();
  $("btnAddVendor").hidden=!mg; $("btnAddType").hidden=!mg;
  if(!mg){ closeVendorForm(); closeTypeForm(); }
  $("vendorList").innerHTML=state.vendors.map(function(x){
    return '<div class="doc-row'+(x.active?"":" off")+'" data-vendor="'+esc(x.id)+'"><div class="doc-name"><b>'+esc(x.name)+"</b> "+
      (x.roles||[]).map(function(r){ return '<span class="chip st">'+esc(r)+"</span>"; }).join(" ")+
      '<div class="hint">'+esc([x.contact_name,x.phone,x.email].filter(Boolean).join(" · "))+"</div>"+(x.notes?'<div class="hint">'+esc(x.notes)+"</div>":"")+"</div>"+
      '<div class="doc-meta"><span class="chip '+(x.active?"k-D":"warn")+'">'+(x.active?"active":"inactive")+"</span></div>"+
      (mg?'<span class="doc-btns"><button class="btn sm" type="button" data-edit-vendor="'+esc(x.id)+'">Edit</button>'+
        '<button class="btn sm" type="button" data-toggle-vendor="'+esc(x.id)+'">'+(x.active?"Deactivate":"Reactivate")+"</button></span>":"")+"</div>";
  }).join("")||'<div class="hint">No vendors yet.</div>';
  $("typeList").innerHTML=state.ctypes.map(function(x){
    return '<div class="doc-row'+(x.active?"":" off")+'" data-type="'+esc(x.id)+'"><div class="doc-name"><b>'+esc(x.size_label)+"</b> "+
      '<span class="chip st">'+esc(x.kind)+'</span><div class="hint">'+esc(x.product)+(x.fill_lb==null?"":" · "+esc(x.fill_lb)+" lb")+"</div></div>"+
      '<div class="doc-meta"><span class="chip '+(x.active?"k-D":"warn")+'">'+(x.active?"active":"inactive")+"</span></div>"+
      (mg?'<span class="doc-btns"><button class="btn sm" type="button" data-edit-type="'+esc(x.id)+'">Edit</button>'+
        '<button class="btn sm" type="button" data-toggle-type="'+esc(x.id)+'">'+(x.active?"Deactivate":"Reactivate")+"</button></span>":"")+"</div>";
  }).join("")||'<div class="hint">No container types yet.</div>';
}

function closeVendorForm(){ state.vendorEdit=null; var f=$("vendorForm"); if(f) f.hidden=true; }
function closeTypeForm(){ state.typeEdit=null; var f=$("typeForm"); if(f) f.hidden=true; }
function openVendorForm(v){
  if(!canManageAssets()) return;
  v=v||{}; state.vendorEdit=v;
  $("vf_name").value=v.name||""; $("vf_contact").value=v.contact_name||""; $("vf_phone").value=v.phone||""; $("vf_email").value=v.email||""; $("vf_notes").value=v.notes||"";
  $("vf_roles").querySelectorAll("input").forEach(function(c){ c.checked=(v.roles||[]).indexOf(c.value)>=0; });
  $("vendorForm").hidden=false; $("vf_name").focus();
}
async function saveVendorForm(){
  if(!canManageAssets()) return;
  var e=state.vendorEdit||{}, name=$("vf_name").value.trim();
  if(!name){ banner("warn","Enter the vendor's name","",{autoclose:6000,key:"vendor"}); return; }
  var dup=state.vendors.some(function(x){ return x.id!==e.id&&String(x.name).trim().toLowerCase()===name.toLowerCase(); });
  if(dup){ banner("warn","A vendor with that name exists","<div>"+esc(name)+" is already in the list. Edit it instead.</div>",{autoclose:8000,key:"vendor"}); return; }
  var roles=[]; $("vf_roles").querySelectorAll("input").forEach(function(c){ if(c.checked) roles.push(c.value); });
  var row=Object.assign({},e,{name:name,roles:roles,contact_name:$("vf_contact").value.trim(),phone:$("vf_phone").value.trim(),email:$("vf_email").value.trim(),notes:$("vf_notes").value.trim()});
  if(!row.id){ row.active=true; row.addr=""; }
  try{ await ADB.saveVendor(row); closeVendorForm(); banner("good","Vendor saved","<div>"+esc(name)+"</div>",{autoclose:4000,key:"vendor"}); }
  catch(err){ banner("bad","Vendor not saved","<div>"+esc(err.message)+"</div>",{key:"vendor"}); return; }
  await renderVendors();
}
async function toggleVendor(id){
  var x=state.vendors.find(function(r){ return r.id===id; }); if(!x||!canManageAssets()) return;
  try{ await ADB.saveVendor(Object.assign({},x,{active:!x.active})); }catch(err){ banner("bad","Vendor not changed","<div>"+esc(err.message)+"</div>",{key:"vendor"}); return; }
  await renderVendors();
}

function fillTypeProducts(chosen){
  var names=PRODUCTS.filter(function(p){ return p.cat==="Gases"; }).map(function(p){ return p.name; });
  if(chosen&&names.indexOf(chosen)<0) names.push(chosen);
  $("tf_product").innerHTML=names.map(function(n){ return '<option value="'+esc(n)+'"'+(n===chosen?" selected":"")+">"+esc(n)+"</option>"; }).join("");
}
function openTypeForm(t){
  if(!canManageAssets()) return;
  t=t||{}; state.typeEdit=t;
  fillTypeProducts(t.product); $("tf_kind").value=t.kind||"cylinder"; $("tf_size").value=t.size_label||""; $("tf_fill").value=t.fill_lb==null?"":t.fill_lb;
  $("typeForm").hidden=false; $("tf_size").focus();
}
async function saveTypeForm(){
  if(!canManageAssets()) return;
  var e=state.typeEdit||{}, size=$("tf_size").value.trim(), product=$("tf_product").value, fill=$("tf_fill").value.trim();
  if(!size){ banner("warn","Enter the size, as on the order form","",{autoclose:6000,key:"ctype"}); return; }
  if(fill!==""&&!(Number(fill)>=0)){ banner("warn","Fill must be a number of pounds, or empty","",{autoclose:6000,key:"ctype"}); return; }
  var dup=state.ctypes.some(function(x){ return x.id!==e.id&&x.product===product&&String(x.size_label).toLowerCase()===size.toLowerCase(); });
  if(dup){ banner("warn","That container type exists","<div>"+esc(product)+" · "+esc(size)+"</div>",{autoclose:8000,key:"ctype"}); return; }
  var row=Object.assign({},e,{kind:$("tf_kind").value,product:product,size_label:size,fill_lb:fill===""?null:Number(fill)});
  if(!row.id) row.active=true;
  try{ await ADB.saveType(row); closeTypeForm(); banner("good","Container type saved","<div>"+esc(size)+"</div>",{autoclose:4000,key:"ctype"}); }
  catch(err){ banner("bad","Container type not saved","<div>"+esc(err.message)+"</div>",{key:"ctype"}); return; }
  await renderVendors();
}
async function toggleType(id){
  var x=state.ctypes.find(function(r){ return r.id===id; }); if(!x||!canManageAssets()) return;
  try{ await ADB.saveType(Object.assign({},x,{active:!x.active})); }catch(err){ banner("bad","Container type not changed","<div>"+esc(err.message)+"</div>",{key:"ctype"}); return; }
  await renderVendors();
}

(function wireVendors(){
  var card=$("vendorsCard"); if(!card) return;
  $("btnAddVendor").onclick=function(){ openVendorForm({}); };
  $("btnSaveVendor").onclick=saveVendorForm; $("btnCancelVendor").onclick=closeVendorForm;
  $("btnAddType").onclick=function(){ openTypeForm({}); };
  $("btnSaveType").onclick=saveTypeForm; $("btnCancelType").onclick=closeTypeForm;
  card.addEventListener("click",function(ev){
    var el=ev.target.closest&&ev.target.closest("button"); if(!el) return;
    var a;
    if((a=el.getAttribute("data-edit-vendor"))) openVendorForm(state.vendors.find(function(r){ return r.id===a; }));
    else if((a=el.getAttribute("data-toggle-vendor"))) toggleVendor(a);
    else if((a=el.getAttribute("data-edit-type"))) openTypeForm(state.ctypes.find(function(r){ return r.id===a; }));
    else if((a=el.getAttribute("data-toggle-type"))) toggleType(a);
  });
})();
