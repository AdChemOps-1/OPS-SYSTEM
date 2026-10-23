/* AdChem Ops — Inventory (Stage 3B): on hand per hub, the entry sheets (Receive, Produce, Adjust, Count, Use supplies) and the
   minimums. Loaded after assets.js; uses its globals (canViewAssets, canManageAssets, ADB, aOpts, aHubOpts) and app.js's
   (state, $, esc, banner, supa, sbErr, API, hubBy, PRODUCTS) and customers.js's newUuid. Every query is scoped by state.company.
   Stock keys are (hub, product, container, item): bulk pounds (a gas product, no container, unit lb), counted containers (a product
   and one of its containers from PRODUCTS, unit count) and supplies (an item only, unit count). Full gas containers come from the
   register (a row whose product and container match a container type, or a Gases product) and are read-only here.
   Reading needs view_assets, recording and minimums need manage_assets (super admins have both); /api/stock and the database's
   policies enforce the same rules. Movements go through /api/stock only: a Count sends the physical count and the server writes the
   delta from its own on-hand. Minimums are rows of dispatch_stock_settings, one per key. */

state.inv=null;          // {company, rows (on hand with min_qty / below), mins, types, vendors} as last loaded
state.invHub="";         // the hub On hand shows
state.invSheet=null;     // the open entry sheet {kind, hub, company, sending}
state.invMinEdit=null;   // the minimum the form is editing (null = adding)

const INV_ACTS={
  received:{title:"Receive",sub:"Stock in from a vendor or a transfer."},
  produced:{title:"Produce",sub:"Containers made at the hub. Draws the bulk product down by the pounds per unit."},
  adjusted:{title:"Adjust",sub:"A correction up or down, with the reason in the note."},
  counted:{title:"Count",sub:"Enter what is physically there. The difference is recorded."},
  consumed:{title:"Use supplies",sub:"Supplies used up, with what they went to in the note."}
};
const INV_ACT_ORDER=["received","produced","adjusted","counted","consumed"];
// [element id, heading, kind, empty text]
const INV_BLOCKS=[["invBulk","Bulk","bulk","No bulk product recorded at this hub."],
  ["invCont","Containers","container","No dry ice or solvent containers recorded at this hub."],
  ["invSup","Supplies","supply","No supplies recorded at this hub."],
  ["invGas","Gas containers","gas","No full gas containers at this hub in the register."]];

function resetInventory(){   // on a company switch
  state.inv=null; state.invHub=""; state.invMinEdit=null;
  state.invSheet=null; var sh=$("invSheet"); if(sh&&!sh.hidden){ sh.hidden=true; document.body.style.overflow=""; } }

const IDB={
  async onhand(){ var r=await API.post("/api/stock",{action:"onhand"}); return (r&&r.rows)||[]; },
  async below(){ var r=await API.post("/api/stock",{action:"below"}); return (r&&r.rows)||[]; },
  async move(entry){ return await API.post("/api/stock",{action:"move",entry:entry}); },
  async mins(){ return sbErr(await supa.from("dispatch_stock_settings").select("*").eq("company",state.company).order("hub"))||[]; },
  // m with no id gets a client-made id; with an id the row is upserted
  async saveMin(m){
    var row=Object.assign({},m,{company:state.company,updated_by:state.session.user.id,updated_at:new Date().toISOString()});
    if(!row.id) row.id=newUuid();
    sbErr(await supa.from("dispatch_stock_settings").upsert(row,{onConflict:"id"})); return row.id; },
  async deleteMin(id){ sbErr(await supa.from("dispatch_stock_settings").delete().eq("company",state.company).eq("id",id)); }
};

/* ---------- keys, labels, numbers ---------- */
// PRODUCTS rows are {cat, name, sizes} (app.js turns the order form's table into them)
function invGasNames(){ return PRODUCTS.filter(function(p){ return p.cat==="Gases"; }).map(function(p){ return p.name; }); }
function invContNames(){ return PRODUCTS.filter(function(p){ return p.cat!=="Gases"; }).map(function(p){ return p.name; }); }
function invContainersOf(name){ var p=PRODUCTS.find(function(x){ return x.name===name; }); return p?p.sizes.slice():[]; }
function invIsGas(product,container){
  var types=(state.inv&&state.inv.types)||[];
  if(types.some(function(t){ return t.product===product&&t.size_label===container; })) return true;
  var p=PRODUCTS.find(function(x){ return x.name===product; }); return !!(p&&p.cat==="Gases");
}
// bulk | container | supply | gas
function invKindOf(r){
  if(r.item) return "supply";
  if(r.unit==="lb"||!r.container) return "bulk";
  return invIsGas(r.product,r.container)?"gas":"container";
}
function invKey(r){ return (r.product||"")+"|"+(r.container||"")+"|"+(r.item||""); }
function invLabel(r){ return r.item?String(r.item):r.container?r.product+" "+r.container:String(r.product||""); }
function invNum(n){ n=Number(n)||0; return (n<0?"−":"")+Math.abs(n).toLocaleString("en-US",{maximumFractionDigits:2}); }
function invFind(hub,key){ return ((state.inv&&state.inv.rows)||[]).find(function(r){ return r.hub===hub&&invKey(r)===invKey(key)&&r.unit===key.unit; })||null; }
// supply names already known (on hand and minimums), for the item pickers
function invKnownItems(){
  var I=state.inv||{}, out=[];
  (I.rows||[]).concat(I.mins||[]).forEach(function(r){ if(r.item&&out.indexOf(r.item)<0) out.push(r.item); });
  return out.sort();
}
function invItemOpts(){ return invKnownItems().map(function(i){ return '<option value="'+esc(i)+'"></option>'; }).join(""); }
function invHubCodes(){
  var codes=state.hubs.map(function(h){ return h.code; });
  ((state.inv&&state.inv.rows)||[]).forEach(function(r){ if(r.hub&&codes.indexOf(r.hub)<0) codes.push(r.hub); });
  return codes;
}

/* ---------- the tab ---------- */
async function renderInventory(){
  if(!canViewAssets()) return;
  var co=state.company;
  if(!state.invHub) state.invHub=(state.hubs[0]&&state.hubs[0].code)||"";
  var I={company:co,rows:[],mins:[],types:[],vendors:[]};
  try{ var r=await Promise.all([IDB.onhand(),IDB.mins()]); if(co!==state.company) return; I.rows=r[0]; I.mins=r[1]; }
  catch(e){ if(co!==state.company) return; banner("bad","Couldn't load inventory","<div>"+esc(e.message)+"</div>",{key:"inventory"}); }
  // container types (which rows are gas containers) and vendors (Receive) only refine the screen; without them PRODUCTS decides
  try{ var x=await Promise.all([ADB.types(),canManageAssets()?ADB.vendors():Promise.resolve([])]); if(co!==state.company) return; I.types=x[0]; I.vendors=x[1]; }
  catch(e){ /* fall back to PRODUCTS' Gases category, and no vendor list */ }
  if(co!==state.company) return;
  state.inv=I;
  invDrawOnhand(); invDrawActions(); invDrawMins();
}

function invRowHtml(r){
  var k=invKindOf(r), unit=k==="bulk"?"lb":k==="gas"?"full":"count", chips="";
  if(k==="bulk"&&Number(r.qty)<0) chips+=' <span class="chip st stop">negative — enter receipts</span>';
  if(r.below) chips+=' <span class="chip warn">below min '+esc(invNum(r.min_qty))+"</span>";
  return '<div class="inv-row" data-key="'+esc(invKey(r))+'"><span class="inv-label">'+esc(invLabel(r))+'</span> <span class="inv-qty mono">'+esc(invNum(r.qty))+
    '</span> <span class="inv-unit">'+esc(unit)+"</span>"+chips+"</div>";
}
function invDrawOnhand(){
  var host=$("invOnhand"), I=state.inv; if(!host||!I||I.company!==state.company) return;
  var hub=state.invHub, rows=I.rows.filter(function(r){ return r.hub===hub; }), groups={bulk:[],container:[],supply:[],gas:[]};
  rows.forEach(function(r){ groups[invKindOf(r)].push(r); });
  Object.keys(groups).forEach(function(g){ groups[g].sort(function(a,b){ return invLabel(a).localeCompare(invLabel(b)); }); });
  var below=rows.filter(function(r){ return r.below; }).length, text=below+" below minimum at "+hub;
  host.innerHTML='<div class="card pad sec"><h2 class="sec-h">On hand</h2>'+
    '<div class="toolbar" style="margin-bottom:0"><select id="invHub" aria-label="Hub">'+aOpts(invHubCodes().map(function(c){ var h=hubBy(c); return [c,h?c+" — "+h.name:c]; }),hub)+"</select></div>"+
    '<div id="invBelow" style="margin-top:8px">'+(below?'<span class="chip warn">'+esc(text)+"</span>":'<span class="hint">'+esc(text)+"</span>")+"</div>"+
    INV_BLOCKS.map(function(b){ return '<div class="inv-block" id="'+esc(b[0])+'"><h3>'+esc(b[1])+"</h3>"+
      (groups[b[2]].map(invRowHtml).join("")||'<p class="hint" style="margin:0">'+esc(b[3])+"</p>")+"</div>"; }).join("")+
    '<p class="hint" style="margin:10px 0 0">Gas containers are counted from the register (full, in service, at the hub); record them on the Assets tab.</p></div>';
  $("invHub").onchange=function(){ state.invHub=this.value; invDrawOnhand(); };
}
function invDrawActions(){
  var host=$("invActions"); if(!host) return;
  if(!canManageAssets()){ host.innerHTML=""; host.onclick=null; return; }
  host.innerHTML='<div class="card pad sec"><h2 class="sec-h">Record</h2><div class="a-btns">'+
    INV_ACT_ORDER.map(function(k){ return '<button class="btn" type="button" data-inv-act="'+esc(k)+'">'+esc(INV_ACTS[k].title)+"</button>"; }).join("")+
    '</div><p class="hint" style="margin:8px 0 0">At the hub chosen under On hand. Deliveries draw stock down by themselves when an order is marked Delivered.</p></div>';
  host.onclick=function(ev){ var b=ev.target.closest("[data-inv-act]"); if(b) openInvSheet(b.getAttribute("data-inv-act")); };
}

/* ---------- the entry sheet ---------- */
function openInvSheet(kind){
  if(!canManageAssets()||!INV_ACTS[kind]||!state.inv) return;
  var hub=state.invHub;
  if(!hub){ banner("warn","Choose a hub first","",{autoclose:5000,key:"inv"}); return; }
  state.invSheet={kind:kind,hub:hub,company:state.company,sending:false};
  $("invTitle").textContent=INV_ACTS[kind].title; $("invSub").textContent=INV_ACTS[kind].sub+" At "+hub+".";
  var ks=$("inv_kind"), only=kind==="produced"?"container":kind==="consumed"?"supply":"";
  Array.prototype.forEach.call(ks.options,function(o){ o.disabled=!!only&&o.value!==only; });
  ks.value=only||"bulk"; ks.disabled=!!only;
  $("inv_item").value=""; $("inv_qty").value=""; $("inv_note").value="";
  $("inv_items").innerHTML=invItemOpts();
  $("inv_vendorRow").hidden=kind!=="received";
  $("inv_vendor").innerHTML=aOpts([["","No vendor"]].concat((state.inv.vendors||[]).filter(function(v){ return v.active; }).map(function(v){ return [v.id,v.name]; })),"");
  $("inv_lbRow").hidden=$("inv_bulkRow").hidden=kind!=="produced";
  $("inv_lb_per").value="50";
  $("inv_bulk").innerHTML=aOpts(invGasNames().map(function(n){ return [n,n]; }),"Carbon Dioxide");
  $("inv_qtyLbl").textContent=kind==="counted"?"Physical count":kind==="adjusted"?"Change (+ or −)":"Quantity";
  $("inv_noteLbl").textContent=kind==="adjusted"||kind==="consumed"?"Note (required)":"Note";
  invKindChanged(); invConfirmBtn();
  $("invSheet").hidden=false; document.body.style.overflow="hidden";
}
function closeInvSheet(){
  var S=state.invSheet; if(S&&S.sending) return;
  $("invSheet").hidden=true; document.body.style.overflow=""; state.invSheet=null;
}
function invConfirmBtn(){ var S=state.invSheet, c=$("inv_confirm"); c.disabled=!S||S.sending; c.textContent=S&&S.sending?"Recording…":"Confirm"; }
function invKindChanged(){
  var k=$("inv_kind").value;
  $("inv_productRow").hidden=k==="supply"; $("inv_containerRow").hidden=k!=="container"; $("inv_itemRow").hidden=k!=="supply";
  var names=k==="bulk"?invGasNames():invContNames();
  $("inv_product").innerHTML=aOpts(names.map(function(n){ return [n,n]; }),names[0]);
  invProductChanged();
}
function invProductChanged(){
  var c=invContainersOf($("inv_product").value);
  $("inv_container").innerHTML=aOpts(c.map(function(n){ return [n,n]; }),c[0]);
  invShowNow();
}
// the key the sheet's pickers name, shaped as an on-hand row
function invEntryKey(){
  var k=$("inv_kind").value;
  return {product:k==="supply"?"":$("inv_product").value,container:k==="container"?$("inv_container").value:"",item:k==="supply"?$("inv_item").value.trim():"",unit:k==="bulk"?"lb":"count"};
}
function invShowNow(){
  var S=state.invSheet, el=$("inv_now");
  if(!S||S.kind!=="counted"){ el.textContent=""; return; }
  var key=invEntryKey();
  if(!key.product&&!key.item){ el.textContent=""; return; }
  var r=invFind(S.hub,key); el.textContent="On hand now: "+invNum(r?r.qty:0)+(key.unit==="lb"?" lb":"");
}
async function invConfirm(){
  var S=state.invSheet; if(!S||S.sending||!canManageAssets()) return;
  var key=invEntryKey(), raw=$("inv_qty").value.trim(), qty=Number(raw), note=$("inv_note").value.trim();
  var stop=function(t,b){ banner("warn",t,b?"<div>"+esc(b)+"</div>":"",{autoclose:7000,key:"inv"}); };
  if($("inv_kind").value==="supply"&&!key.item) return stop("Not recorded","Name the supply, for example Regulator.");
  if(!raw||!isFinite(qty)) return stop("Not recorded","Enter the quantity as a number.");
  if((S.kind==="adjusted"||S.kind==="consumed")&&!note) return stop("Not recorded","A note is required for "+(S.kind==="adjusted"?"an adjustment":"supplies used")+".");
  var entry={kind:S.kind,hub:S.hub,product:key.product,container:key.container,item:key.item,qty:qty,unit:key.unit};
  if(note) entry.note=note;
  if(S.kind==="received"&&$("inv_vendor").value) entry.vendorId=$("inv_vendor").value;
  if(S.kind==="produced"){
    var lbRaw=$("inv_lb_per").value.trim(), lb=Number(lbRaw);
    if(!lbRaw||!isFinite(lb)||lb<=0) return stop("Not recorded","Pounds of bulk per unit must be above zero.");
    entry.lbPerUnit=lb; entry.bulkProduct=$("inv_bulk").value;
  }
  S.sending=true; invConfirmBtn();
  var r;
  try{ r=await IDB.move(entry); }
  catch(e){ if(state.invSheet===S){ S.sending=false; invConfirmBtn(); } banner("bad","Not recorded","<div>"+esc(e.message)+"</div>",{key:"inv"}); return; }
  if(state.invSheet!==S||S.company!==state.company) return;
  S.sending=false; closeInvSheet();
  var same=r&&r.note==="no change";
  banner("good",same?"Recorded — no change":"Recorded","<div>"+esc(INV_ACTS[S.kind].title+" · "+invLabel(key)+" · "+invNum(qty)+(key.unit==="lb"?" lb":"")+" at "+S.hub)+
    (same?" — the count matches what is on hand.":"")+"</div>",{autoclose:4000,key:"inv"});
  await renderInventory();
}

/* ---------- minimums ---------- */
function invMinKind(m){ return m.item?"supply":m.container?"container":"bulk"; }
function invDrawMins(){
  var host=$("invMins"), I=state.inv; if(!host||!I||I.company!==state.company) return;
  var man=canManageAssets(), codes=invHubCodes();
  I.mins.forEach(function(m){ if(codes.indexOf(m.hub)<0) codes.push(m.hub); });
  var list=codes.map(function(h){
    var ms=I.mins.filter(function(m){ return m.hub===h; }).sort(function(a,b){ return invLabel(a).localeCompare(invLabel(b)); });
    if(!ms.length) return "";
    return '<div class="inv-block"><h3>'+esc(h)+"</h3>"+ms.map(function(m){ var on=m.alert!==false;
      return '<div class="inv-row" data-min="'+esc(m.id)+'"><span class="inv-label">'+esc(invLabel(m))+'</span> <span class="inv-qty mono">'+esc(invNum(m.min_qty))+
        '</span> <span class="inv-unit">'+esc(m.unit)+'</span> <span class="chip '+(on?"k-D":"k-none")+'">'+(on?"alert on":"alert off")+"</span>"+
        (man?' <button class="btn sm" type="button" data-min-edit="'+esc(m.id)+'">Edit</button> <button class="btn sm" type="button" data-min-del="'+esc(m.id)+'">Delete</button>':"")+"</div>"; }).join("")+"</div>";
  }).join("");
  var ed=state.invMinEdit;
  var form=!man?"":'<div class="inv-block" id="minForm"><h3>'+(ed?"Edit the minimum":"Add a minimum")+'</h3><div class="grid two">'+
    '<label class="f">Hub<select id="min_hub"></select></label>'+
    '<label class="f">What<select id="min_kind">'+aOpts([["bulk","Bulk (lb)"],["container","Container (count)"],["supply","Supply (count)"]],"bulk")+"</select></label>"+
    '<label class="f" id="min_productRow">Product<select id="min_product"></select></label>'+
    '<label class="f" id="min_containerRow">Container<select id="min_container"></select></label>'+
    '<label class="f" id="min_itemRow">Item<input id="min_item" list="min_items" autocomplete="off"><datalist id="min_items">'+invItemOpts()+"</datalist></label>"+
    '<label class="f">Minimum<input id="min_qty" type="number" min="0" step="any" inputmode="decimal"></label>'+
    '<label class="f">Unit<select id="min_unit">'+aOpts([["lb","lb"],["count","count"]],"lb")+"</select></label>"+
    '<label class="perm-chk" style="align-self:end"><input type="checkbox" id="min_alert" checked> Alert when below</label></div>'+
    '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:11px"><button class="btn primary" type="button" id="btnSaveMin">Save minimum</button>'+
    (ed?'<button class="btn" type="button" id="btnCancelMin">Cancel</button>':"")+"</div></div>";
  host.innerHTML='<div class="card pad sec inv-mins"><h2 class="sec-h">Minimums</h2>'+(list||'<p class="hint" style="margin:0">No minimums set.</p>')+form+
    '<p class="hint" style="margin:10px 0 0">A row below its minimum is flagged under On hand; with the alert on it goes in the daily stock email (Setup → Warnings).</p></div>';
  host.onclick=function(ev){ var b=ev.target.closest("button"); if(!b) return;
    if(b.getAttribute("data-min-edit")) invEditMin(b.getAttribute("data-min-edit"));
    else if(b.getAttribute("data-min-del")) invDeleteMin(b.getAttribute("data-min-del"));
    else if(b.id==="btnSaveMin") invSaveMin();
    else if(b.id==="btnCancelMin"){ state.invMinEdit=null; invDrawMins(); } };
  if(!man) return;
  $("min_hub").innerHTML=aOpts(codes.map(function(c){ return [c,c]; }),ed?ed.hub:state.invHub);
  $("min_kind").onchange=function(){ invMinKindChanged(true); };
  $("min_product").onchange=invMinProductChanged;
  if(ed){
    $("min_kind").value=invMinKind(ed); invMinKindChanged(false);
    if(ed.product) $("min_product").value=ed.product; invMinProductChanged();
    if(ed.container) $("min_container").value=ed.container;
    $("min_item").value=ed.item||""; $("min_qty").value=String(ed.min_qty); $("min_unit").value=ed.unit; $("min_alert").checked=ed.alert!==false;
    ["min_hub","min_kind","min_product","min_container","min_item"].forEach(function(id){ $(id).disabled=true; });   // the key stays; delete and add to change it
  } else invMinKindChanged(true);
}
function invMinKindChanged(setUnit){
  var k=$("min_kind").value;
  $("min_productRow").hidden=k==="supply"; $("min_containerRow").hidden=k!=="container"; $("min_itemRow").hidden=k!=="supply";
  var names=k==="bulk"?invGasNames():invContNames();
  $("min_product").innerHTML=aOpts(names.map(function(n){ return [n,n]; }),names[0]);
  if(setUnit) $("min_unit").value=k==="bulk"?"lb":"count";
  invMinProductChanged();
}
function invMinProductChanged(){ var c=invContainersOf($("min_product").value); $("min_container").innerHTML=aOpts(c.map(function(n){ return [n,n]; }),c[0]); }
function invEditMin(id){
  if(!canManageAssets()||!state.inv) return;
  var m=state.inv.mins.find(function(x){ return x.id===id; }); if(!m) return;
  state.invMinEdit=m; invDrawMins();
  try{ $("min_qty").focus(); }catch(e){}
}
async function invSaveMin(){
  var I=state.inv; if(!canManageAssets()||!I) return;
  var stop=function(b){ banner("warn","Minimum not saved","<div>"+esc(b)+"</div>",{autoclose:8000,key:"invmin"}); };
  var ed=state.invMinEdit, kind=$("min_kind").value, unit=$("min_unit").value, hub=$("min_hub").value;
  if(!hub) return stop("Choose the hub.");
  var key={product:kind==="supply"?"":$("min_product").value,container:kind==="container"?$("min_container").value:"",item:kind==="supply"?$("min_item").value.trim():""};
  if(kind==="supply"&&!key.item) return stop("Name the supply, for example Pallet.");
  if(kind==="bulk"&&unit!=="lb") return stop("bulk is tracked in lb");
  if(kind!=="bulk"&&unit!=="count") return stop("containers and supplies are counted");
  var raw=$("min_qty").value.trim(), qty=Number(raw);
  if(!raw||!isFinite(qty)||qty<0) return stop("The minimum is a number, zero or more.");
  // one minimum per key: adding a key that already has one changes that one
  var same=I.mins.find(function(m){ return m.hub===hub&&m.product===key.product&&m.container===key.container&&m.item===key.item; });
  var row={hub:hub,product:key.product,container:key.container,item:key.item,min_qty:qty,unit:unit,alert:$("min_alert").checked};
  var id=(ed&&ed.id)||(same&&same.id)||null; if(id) row.id=id;
  var co=state.company, btn=$("btnSaveMin"); btn.disabled=true;
  try{ await IDB.saveMin(row); }
  catch(e){ if(co===state.company&&$("btnSaveMin")) $("btnSaveMin").disabled=false; banner("bad","Minimum not saved","<div>"+esc(e.message)+"</div>",{key:"invmin"}); return; }
  if(co!==state.company) return;
  state.invMinEdit=null;
  banner("good","Minimum saved","<div>"+esc(hub+" · "+invLabel(key)+" · "+invNum(qty)+" "+unit)+"</div>",{autoclose:4000,key:"invmin"});
  await renderInventory();
}
async function invDeleteMin(id){
  var I=state.inv; if(!canManageAssets()||!I) return;
  var m=I.mins.find(function(x){ return x.id===id; }); if(!m) return;
  var co=state.company;
  try{ await IDB.deleteMin(id); }
  catch(e){ banner("bad","Minimum not deleted","<div>"+esc(e.message)+"</div>",{key:"invmin"}); return; }
  if(co!==state.company) return;
  if(state.invMinEdit&&state.invMinEdit.id===id) state.invMinEdit=null;
  banner("good","Minimum deleted","<div>"+esc(m.hub+" · "+invLabel(m))+"</div>",{autoclose:4000,key:"invmin"});
  await renderInventory();
}

(function wireInventory(){
  if(!$("invSheet")) return;
  $("invClose").onclick=closeInvSheet;
  $("invSheet").addEventListener("keydown",function(e){ if(e.key==="Escape") closeInvSheet(); });
  $("inv_kind").onchange=invKindChanged;
  $("inv_product").onchange=invProductChanged;
  $("inv_container").onchange=invShowNow;
  $("inv_item").oninput=invShowNow;
  $("inv_confirm").onclick=invConfirm;
})();
