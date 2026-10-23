/* AdChem Ops — Assets: the container register (Stage 3A). Part 1: the permission helpers, the data layer (ADB), the Assets tab shell,
   and Setup → Vendors and Container types. Loaded after app.js, customers.js and documents.js; uses their globals
   (state, $, esc, banner, supa, sbErr, API, newUuid, PRODUCTS). Every query is scoped by state.company.
   Reading needs view_assets, writing needs manage_assets (super admins have both); the database and /api/assets enforce the same
   rules and the screens follow canViewAssets() / canManageAssets(). Tasks 6 and 7 fill the register, counts and actions panes. */

state.vendors=[]; state.ctypes=[]; state.vendorEdit=null; state.typeEdit=null;   // vendorEdit / typeEdit: the row a form is editing ({} = new)

const VENDOR_ROLES=["fill","rent","supply"];
const TYPE_KINDS=["cylinder","dewar","pig","tank"];

function canViewAssets(){ var me=state.me||{}; return !!(me.isSuper||(me.perms||{}).view_assets); }
function canManageAssets(){ var me=state.me||{}; return !!(me.isSuper||(me.perms||{}).manage_assets); }
function resetAssets(){ state.vendors=[]; state.ctypes=[]; closeVendorForm(); closeTypeForm(); }   // on a company switch
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

/* ---------- the Assets tab (Task 6 fills the three panes) ---------- */
function renderAssets(){
  if(!canViewAssets()) return;
  $("aRegister").innerHTML='<div class="card pad sec"><h2 class="sec-h">Register</h2><p class="hint">The container register is coming.</p></div>';
  $("aCounts").innerHTML='<div class="card pad sec"><h2 class="sec-h">Counts</h2><p class="hint">Counts by hub and fill state are coming.</p></div>';
  $("aActions").innerHTML='<div class="card pad sec"><h2 class="sec-h">Actions</h2><p class="hint">Scan, fill and move actions are coming.</p></div>';
}

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
