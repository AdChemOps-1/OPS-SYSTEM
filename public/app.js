
/* ============================================================
   Reference data
   ============================================================ */
const PRODUCTS = [
  ["Dry Ice","Dry Ice - Pellet","Bin|Tote (525 lb)|5gal Bucket"],
  ["Dry Ice","Dry Ice - Rice","Bin|Tote (525 lb)|5gal Bucket"],
  ["Gases","Carbon Dioxide","20lb Cylinder|50lb Cylinder|1lb|5lb|10lb|15lb|100lb|230L Dewar|260L Dewar|Bulk Dewar"],
  ["Gases","Nitrogen","200cu ft Cylinder|300cu ft Cylinder|260L Dewar"],
  ["Gases","Butane","120lb Cylinder|500lb Pig|100#|400#"],
  ["Gases","Propane","100lb Cylinder|400lb Pig"],
  ["Gases","Isobutane","116lb Cylinder|480lb Pig"],
  ["Gases","Blended (Dual Blend)","114lb Cylinder|450lb Pig"],
  ["Gases","Blended (Tri Blend)","100lb Cylinder|Pig (400–475 lb)"],
  ["Solvents","Acetone","5gal Pail|55gal Drum|270gal Tote"],
  ["Solvents","CDA-12A","5gal Pail|55gal Drum|270gal Tote"],
  ["Solvents","D-Limonene","5gal|55gal"],
  ["Solvents","Dichloromethane (DCM)","55gal Drum"],
  ["Solvents","Ethanol (200 Proof)","55gal Drum|270gal Tote"],
  ["Solvents","Ethanol (Denatured)","5gal Pail|55gal Drum|270gal Tote"],
  ["Solvents","Heptanes","55gal Drum|270gal Tote"],
  ["Solvents","Hexane","55gal Drum|270gal Tote"],
  ["Solvents","Isopropanol Full","55gal Drum|270gal Tote"],
  ["Solvents","Methanol","5gal Pail|55gal Drum|270gal Tote"],
  ["Solvents","Pentane","55gal Drum"],
  ["Solvents","Toluene","55gal Drum"],
  ["Media — AdChem","Celite 545","Bag"],["Media — AdChem","DE","Bag"],
  ["Media — AdChem","ZeoRY","55gal Drum"],["Media — AdChem","ZeoRZ","55gal Drum"],
  ["Utility Fluid","Ethylene Glycol 99%","5gal|55gal"],["Utility Fluid","Propylene Glycol","5gal|55gal"],
  ["Food-Grade Oil","MCT Oil","5gal|55gal"],["Food-Grade Oil","Vacuum Pump Oil","5gal|55gal"],
  ["Food-Grade Oil","Vegetable Glycerin Oil","5gal|55gal"],
  ["Heat Transfer Fluid","Duratherm G","5gal|55gal"],["Heat Transfer Fluid","Duratherm G - LV","5gal|55gal"],
  ["Heat Transfer Fluid","Duratherm S","5gal|55gal"],["Heat Transfer Fluid","Dynalene HC-50","5gal"],
  ["Heat Transfer Fluid","Marlotherm SH","5gal|55gal"],["Heat Transfer Fluid","Paratherm NF","5gal|55gal"],
  ["Heat Transfer Fluid","ProTherm 315","5gal"],
  ["Media — Carbon Chemistry","3A Molecular Sieve Beads","500g|2kg|9kg|18kg|55gal (139.5kg)"],
  ["Media — Carbon Chemistry","4A Molecular Sieve Beads","500g|2kg|9kg|18kg|55gal (139.5kg)"],
  ["Media — Carbon Chemistry","10A Molecular Sieve Beads","500g|2kg|9kg|18kg|55gal (139.5kg)"],
  ["Media — Carbon Chemistry","Activated Alumina","400g|1.5kg|7kg|14kg|100kg|810kg"],
  ["Media — Carbon Chemistry","Alumicel A","700g|3kg|12kg|20kg"],
  ["Media — Carbon Chemistry","Alumicel B","700g|3kg|12kg|20kg"],
  ["Media — Carbon Chemistry","Alumicel N","700g|3kg|12kg|20kg"],
  ["Media — Carbon Chemistry","MagSil-PR","300g|1kg|5kg|20kg"],
  ["Media — Carbon Chemistry","Pure-Flo B80","400g|2kg|9kg|14kg|110kg|900kg"],
  ["Media — Carbon Chemistry","Silica 60A","300g|1.5kg|6kg|12kg|90kg|500kg"],
  ["Media — Carbon Chemistry","T-5","500g|2kg|9kg|18kg|130kg|750kg"],
  ["Media — Carbon Chemistry","T-12","500g|2kg|8kg|16kg|110kg"],
  ["Media — Carbon Chemistry","T-41","400g|1.5kg|8kg|14kg|100kg"],
  ["Media — Carbon Chemistry","XActive Carbon","300g|1kg|5kg|10kg|60kg"],
  ["Media — Carbon Chemistry","ZeoClear L","500g|2kg|9kg|16kg|110kg|800kg"],
  ["Media — Carbon Chemistry","ZeoClear L Fine","500g|2kg|10kg|20kg|130kg"],
  ["Media — Carbon Chemistry","ZeoClear Y","500g|2kg|9kg|18kg|120kg|900kg"],
  ["Media — ChemTek","3A Molecular Sieve Beads","10kg|20kg|150kg Bucket/Drum"],
  ["Media — ChemTek","4A Molecular Sieve Beads","10kg|20kg|150kg Bucket/Drum"],
  ["Media — ChemTek","10A Molecular Sieve Beads","10kg|20kg|150kg Bucket/Drum"],
  ["Media — ChemTek","Alumina 150","1kg|2kg|5kg|10kg Bucket|100kg Drum"],
  ["Media — ChemTek","B80","5kg|10kg Bucket|100kg Drum"],["Media — ChemTek","B81","5kg|10kg Bucket|100kg Drum"],
  ["Media — ChemTek","ChloroSorb Acidic","1kg|2kg|5kg|10kg Bucket|100kg Drum"],
  ["Media — ChemTek","ChloroSorb Natural","1kg|2kg|5kg|10kg Bucket|100kg Drum"],
  ["Media — ChemTek","ChloroSorb Neutral","1kg|2kg|5kg|10kg Bucket|100kg Drum"],
  ["Media — ChemTek","D-Wax","1kg|2kg|5kg|10kg Bucket"],
  ["Media — ChemTek","G1","15kg|200kg Bucket/Drum"],["Media — ChemTek","G3","10kg|150kg Bucket/Drum"],
  ["Media — ChemTek","Granular Activated Alumina","5kg|10kg Bucket|100kg Drum"],
  ["Media — ChemTek","Perform 6000","5kg|10kg Bucket|100kg Drum"],
  ["Media — ChemTek","QuickSand (DE)","5kg|10kg Bucket"],
  ["Media — ChemTek","Silica 60","1kg|2kg|5kg|10kg Bucket|80kg Drum"],
  ["Media — ChemTek","Supreme 55","5kg|10kg Bucket|100kg Drum"],
  ["Media — ChemTek","UltraClear","1kg|2kg|5kg|10kg Bucket|100kg Drum"],
  ["Media — ChemTek","UltraClear S","1kg|2kg|5kg|10kg Bucket|100kg Drum"],
  ["Media — ChemTek","W1 Acid Activated Refinement Clay","1kg|2kg|5kg|10kg Bucket"],
  ["Media — ChemTek","W2 Heat Activated Natural Bleaching Clay","1kg|2kg|5kg|10kg Bucket"],
  ["Media — ChemTek","W3 Acid Activated Bleaching Clay","1kg|2kg|5kg|10kg Bucket"],
  ["Media — ChemTek","W4 Media","1kg|2kg|5kg|10kg Bucket"],["Media — ChemTek","W5 Media","1kg|2kg|5kg|10kg Bucket"],
  ["Media — Media Bros","Activated Alumina","1kg|10kg|100kg"],["Media — Media Bros","B80","1.5kg|25kg"],
  ["Media — Media Bros","CR2","19kg"],["Media — Media Bros","CR41","1.5kg|10kg|100kg"],
  ["Media — Media Bros","CRAC","1kg|10kg|100kg"],["Media — Media Bros","CRX","1.5kg|10kg|100kg"],
  ["Media — Media Bros","CRX-M","1.5kg|10kg|100kg"],["Media — Media Bros","CRY","1.5kg|10kg|100kg"],
  ["Media — Media Bros","CRY+","1.5kg|10kg|100kg"],["Media — Media Bros","CRY-M","1.5kg|10kg|100kg"],
  ["Media — Media Bros","G-CRAC","1kg|10kg|100kg"],["Media — Media Bros","K-CRAC","10kg|100kg"],
  ["Media — Media Bros","MB-5","1kg|10kg|20kg|140kg"],["Media — Media Bros","Perform 5000","1.5kg|10kg|25kg"],
  ["Media — Media Bros","Perform 6000","1.5kg|10kg|25kg"],["Media — Media Bros","Silica Gel 60A","1kg|10kg|25kg"]
].map(function(r){return {cat:r[0],name:r[1],sizes:r[2].split("|")};});

/* Payment codes — the text is what the AR Command Center writes into the cell,
   and it must match the formula exactly. The app reads the code from the sheet
   and prints this canonical text for it. */
const CODES = {
  D:{text:"D - Deliver; no holds",cls:"k-D",
     act:"Deliver. Nothing is due. Never ask for money — if the customer offers payment, take it: count it in front of them, tick <b>Payment on Account</b>, both initial."},
  COD:{text:"COD - Collect before unloading",cls:"k-COD",
     act:"<b>Collect before unloading.</b> Count it in front of the customer, write what was received, both initial. Short of what is due means the amount is in dispute — do not unload."},
  R:{text:"R - Payment required, do not unload",cls:"k-R",
     act:"<b>Do not unload</b> until the office confirms payment has cleared. Nothing is collected at the dock on an R."},
  H:{text:"H - Hold, do not deliver",cls:"k-H",act:"<b>DO NOT DELIVER.</b>"},
  CHECK:{text:"CHECK - accounting@adchem.pro",cls:"k-CHECK",act:"Should never reach a route. <b>Stop and call.</b>"}
};
const CODE_ORDER=["D","COD","R","H","CHECK"];
function parseCode(raw){
  var s=String(raw||"").trim(); if(!s) return null;
  var k=s.split(" - ")[0].trim().toUpperCase();
  return CODES[k]?k:null;
}
const DEPOSITS=[{item:"LP239 tank",amt:225},{item:"Dry ice bin",amt:650},{item:"Other",amt:0}];

const WINDOWS = ["7:00a – 11:00a","8:00a – 12:00p","9:00a – 1:00p","11:00a – 3:00p","12:00p – 4:00p","1:00p – 5:00p","All day"];
const WINDOW_HOURS = {"7:00a – 11:00a":[7,11],"8:00a – 12:00p":[8,12],"9:00a – 1:00p":[9,13],"11:00a – 3:00p":[11,15],"12:00p – 4:00p":[12,16],"1:00p – 5:00p":[13,17],"All day":[7,17]};
const STATUSES = ["Intake","Awaiting accounting","Confirmed","Scheduled","BOL Created","Out for Delivery","Delivered","POD Received","Invoiced","Paid","On Hold","Cancelled"];
const DEFAULT_SHEET = "1AGdkstR4Au2lQQubl1xXXojPE2lQVxzlhqT3wqER1HA";
const EMERGENCY = "(800) 633-8253 — PERS";
const DEFAULT_HUBS = [
  {code:"EB",name:"East Bay — Richmond",street:"525 De Carlo Ave",city:"Richmond",state:"CA",zip:"94801",phone:"(510) 725-7841",emerg:EMERGENCY,settled:true},
  {code:"LA",name:"Southern California — Los Angeles",street:"",city:"",state:"CA",zip:"",phone:"(510) 725-7841",emerg:EMERGENCY,settled:false},
  {code:"CO",name:"Colorado — Denver",street:"",city:"",state:"CO",zip:"",phone:"(510) 725-7841",emerg:EMERGENCY,settled:false}
];

/* Default gross weight per unit, from the 10/1/26 SmartBOL samples.
   Not yet confirmed — shown as "default — confirm" wherever used. */
function defaultUnitLb(product,container){
  var c=String(container||"").toLowerCase(), p=String(product||"");
  if(p==="Butane" && c.indexOf("cylinder")>=0) return 190;
  if(p==="Nitrogen" && c.indexOf("cylinder")>=0) return 150;
  if(p.indexOf("Dry Ice")===0 && c==="bin") return 50;
  return 0;
}

/* Hazmat — from AdChem Product Hazmat Reference v1.1 only. Nothing inferred. */
const HAZMAT = {
  "Butane":{s:"verified",un:"UN1011",psn:"Butane",cls:"2.1"},
  "Isobutane":{s:"verified",un:"UN1969",psn:"Isobutane",cls:"2.1"},
  "Propane":{s:"verified",un:"UN1978",psn:"Propane",cls:"2.1"},
  "Carbon Dioxide":{s:"verified",un:"UN1013",psn:"Carbon dioxide",cls:"2.2",alt:{match:"dewar",un:"UN2187",psn:"Carbon dioxide, refrigerated liquid",cls:"2.2"}},
  "Nitrogen":{s:"verified",un:"UN1066",psn:"Nitrogen, compressed",cls:"2.2",alt:{match:"dewar",un:"UN1977",psn:"Nitrogen, refrigerated liquid",cls:"2.2"}},
  "Ethanol (200 Proof)":{s:"verified",un:"UN1170",psn:"Ethanol",cls:"3"},
  "Heptanes":{s:"verified",un:"UN1206",psn:"Heptanes",cls:"3"},
  "Hexane":{s:"verified",un:"UN1208",psn:"Hexanes",cls:"3"},
  "Isopropanol Full":{s:"verified",un:"UN1219",psn:"Isopropanol",cls:"3"},
  "Pentane":{s:"verified",un:"UN1265",psn:"Pentanes",cls:"3"},
  "Blended (Dual Blend)":{s:"suspect",note:"On file as UN3161. The reference says this is almost certainly UN1965, “Hydrocarbon gas mixture, liquefied, n.o.s.”, Class 2.1, with constituent names on the paper. Unresolved."},
  "Blended (Tri Blend)":{s:"suspect",note:"On file as UN3161. The reference says this is almost certainly UN1965, “Hydrocarbon gas mixture, liquefied, n.o.s.”, Class 2.1, with constituent names on the paper. Unresolved."},
  "Ethanol (Denatured)":{s:"suspect",note:"On file as UN1987. A methanol-denatured product is UN1986, Class 3 with a 6.1 subsidiary, which carries a different label. Unresolved."},
  "Acetone":{s:"blocked"},"Methanol":{s:"blocked"},"Toluene":{s:"blocked"},
  "Dichloromethane (DCM)":{s:"blocked"},"D-Limonene":{s:"blocked"},"CDA-12A":{s:"blocked"},
  "Dry Ice - Pellet":{s:"exempt"},"Dry Ice - Rice":{s:"exempt"}
};
function hazFor(product,container){
  var e = HAZMAT[product];
  if(!e) return {s:"unlisted"};
  if(e.alt && String(container||"").toLowerCase().indexOf(e.alt.match)>=0)
    return {s:"verified",un:e.alt.un,psn:e.alt.psn,cls:e.alt.cls};
  return e;
}
/* Classes 2.1, 2.2 and 3 are Table 2 materials at 49 CFR 172.504: placards are
   required once the aggregate gross weight of all Table 2 hazmat on the VEHICLE
   reaches 1,001 lb (172.504(c)), and any one category at 2,205 lb (1,000 kg) or
   more needs its own placard even where DANGEROUS is used (172.504(b)). */
const PLACARD_BY_CLASS = {"2.1":"FLAMMABLE GAS","2.2":"NON-FLAMMABLE GAS","3":"FLAMMABLE"};
function lineLb(l){return Math.max(0,Number(l.qty||0))*Math.max(0,Number(l.unitLb||0));}
function loadSummary(lines){
  var s={total:0,byClass:{},noWeight:false,blocked:false,suspect:false,unlisted:false,regulated:false,exemptOnly:true,anyLine:false};
  (lines||[]).forEach(function(l){
    if(!l||!l.product) return;
    s.anyLine=true;
    var h=hazFor(l.product,l.container), lb=lineLb(l);
    if(h.s!=="exempt") s.exemptOnly=false;
    if(h.s==="blocked") s.blocked=true;
    if(h.s==="suspect"){s.suspect=true;s.regulated=true;}
    if(h.s==="unlisted") s.unlisted=true;
    if(h.s==="verified"){
      s.regulated=true;
      if(PLACARD_BY_CLASS[h.cls]){
        if(!lb) s.noWeight=true;
        s.total+=lb; s.byClass[h.cls]=(s.byClass[h.cls]||0)+lb;
      }
    }
  });
  if(!s.anyLine) s.exemptOnly=false;
  return s;
}
function placardVerdict(s,scope){
  /* scope: "order" or "vehicle" */
  if(s.blocked) return {req:true,name:"DO NOT LOAD",text:"A line on this load has no verified hazmat data. Do not load it."};
  if(s.exemptOnly) return {req:false,name:"NONE",text:"Dry ice only — not regulated by highway. Do not placard (49 CFR 172.502)."};
  var cls=Object.keys(s.byClass).filter(function(k){return s.byClass[k]>0;});
  var own=cls.filter(function(k){return s.byClass[k]>=2205;});
  var parts=cls.map(function(k){return PLACARD_BY_CLASS[k]+" "+fmtLb(s.byClass[k]);});
  var caveat=(s.noWeight?" A hazmat line has no weight, so this total is short.":"")+(s.suspect?" An unresolved line is not counted.":"");
  if(s.total>=1001){
    var nm=cls.map(function(k){return PLACARD_BY_CLASS[k];}).join(" + ");
    return {req:true,name:"PLACARDS REQUIRED",
      text:(scope==="vehicle"?"This truck":"This order alone")+" carries "+fmtLb(s.total)+" of Table 2 material ("+parts.join(", ")+"). Placard "+nm+
        (cls.length>1?" — or DANGEROUS for the mixed load":"")+
        (own.length?", except "+own.map(function(k){return PLACARD_BY_CLASS[k];}).join(" and ")+" at 2,205 lb or more, which must have its own placard (172.504(b))":"")+
        ". A CDL with H endorsement is required."+caveat};
  }
  if(s.total>0) return {req:false,name:"NOT BY THIS "+(scope==="vehicle"?"TRUCK":"ORDER ALONE"),
    text:fmtLb(s.total)+" of Table 2 material ("+parts.join(", ")+"). Placards are required at 1,001 lb aggregate on the vehicle — "+(scope==="vehicle"?"this truck is under it.":"the truck's total for the day decides (Today list).")+caveat};
  return {req:false,name:"NONE ON THIS ORDER",text:"No Table 2 hazmat weight on this order."+caveat};
}
function fmtLb(n){return Math.round(n).toLocaleString("en-US")+" lb";}
function money(n){return "$"+Number(n||0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g,",");}
function coName(){return (state.co&&state.co.name)||"AdChem, LLC";}
function coShort(){return (state.co&&(state.co.short_name||state.co.name))||"AdChem";}
function coMail(k,fallback){var d=(state.co&&state.co.data)||{}; return d[k]||fallback;}

/* ============================================================
   State
   ============================================================ */
const state = {tab:"new",orders:[],hubs:[],settings:{},calendars:[],session:null,me:null,role:"",company:"",co:null,companies:[],memberships:[],canEdit:false,isOwner:false,busy:false,bolOrder:null,editing:null,lastLoad:null,users:[],invites:[],
  feed:{rows:[],byCust:{},loadedAt:null,error:null,loading:false},
  form:{lines:[],feedAddr:"",feedUnconfirmed:false,suppress:false}};
const $ = function(id){return document.getElementById(id);};
const esc = function(s){return String(s==null?"":s).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];});};
function pad(n){return n<10?"0"+n:""+n;}
function ymd(d){return d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate());}
function lsGet(k,d){try{var v=localStorage.getItem(k);return v?JSON.parse(v):d;}catch(e){return d;}}
function lsSet(k,v){try{localStorage.setItem(k,JSON.stringify(v));}catch(e){}}


/* ============================================================
   Banners
   ============================================================ */
var bnSeq=0;
function banner(kind,title,body,opts){
  opts=opts||{};
  var el=document.createElement("div");
  el.className="banner "+kind; el.id="bn"+(++bnSeq);
  el.innerHTML="<div><b>"+esc(title)+"</b>"+(body||"")+"</div>"+(opts.sticky?"":'<button class="x" aria-label="Dismiss">&times;</button>');
  if(opts.key){ var old=document.querySelector('[data-bkey="'+opts.key+'"]'); if(old) old.remove(); el.setAttribute("data-bkey",opts.key); }
  $("banners").prepend(el);
  var x=el.querySelector(".x"); if(x) x.onclick=function(){el.remove();};
  if(opts.autoclose) setTimeout(function(){if(el.isConnected) el.remove();},opts.autoclose);
  return el;
}

/* ============================================================
   Customer feed — dispatch_sites, refreshed from the AR Command Center by the server
   ============================================================ */
function sheetIdFrom(raw){
  var s=String(raw||"").trim(); if(!s) return "";
  var m=s.match(/\/d\/([A-Za-z0-9_-]+)/); if(m) return m[1];
  return /^[A-Za-z0-9_-]{20,}$/.test(s)?s:"";
}
function feedRowsFor(name){
  var k=String(name||"").trim().toLowerCase(), rows=(state.feed.byCust[k]||[]).slice();
  /* Ops-created sites (no payment code) follow the feed rows for the same customer name */
  (state.feed.rows||[]).forEach(function(r){
    if(r.code==null && String(r.customer||"").toLowerCase()===k && !rows.some(function(x){return x.siteKey===r.siteKey;})) rows.push(r);
  });
  return rows.length?rows:null;
}
/* The Ops customer a site belongs to: by its customer id, else by an unambiguous name match. */
function customerForSite(row){
  if(!row) return null;
  var list=state.customers||[], hit=null;
  if(row.customerId) hit=list.find(function(c){return c.id===row.customerId;});
  if(hit) return hit;
  var nm=String(row.customer||"").trim().toLowerCase();
  var m=list.filter(function(c){return String(c.name||"").trim().toLowerCase()===nm;});
  return m.length===1?m[0]:null;
}
function feedReady(){return !!(state.feed.loadedAt && !state.feed.error);}
function indexSites(rows){
  var by={}; rows.forEach(function(r){ (by[r.customer.toLowerCase()]=by[r.customer.toLowerCase()]||[]).push(r); });
  state.feed.rows=rows; state.feed.byCust=by;
  state.feed.loadedAt=rows.length?new Date(Math.max.apply(null,rows.map(function(r){return new Date(r.syncedAt).getTime()||0;}))):null;
  state.feed.error=rows.length?null:{code:"empty",message:"No customer sites loaded yet — press Refresh the feed on Setup."};
  fillAccounts();
}
async function loadSitesFromDb(){
  try{ indexSites(await DB.sites()); }
  catch(e){ state.feed.error={code:"db",message:"Couldn't load the customer sites: "+e.message}; }
  renderFeedState(); refreshCode();
}
async function loadFeed(force){
  var f=state.feed;
  if(!state.canEdit) return;
  f.loading=true; renderFeedState();
  try{
    var res=await API.post("/api/feed",{});
    await loadSitesFromDb();
    banner("good","Customer feed refreshed","<div>"+res.sites+" delivery sites for "+res.customers+" customers read from the AR Command Center"+(res.unconfirmed?" · "+res.unconfirmed+" still showing the billing address":"")+".</div>",{autoclose:9000,key:"feed"});
  }catch(err){ f.error={code:err.code||"server",message:err.message||String(err)}; }
  f.loading=false;
  renderFeedState(); updateCounts(); onCustomerInput(true); scheduleLive();
}
function renderFeedState(){
  var host=$("feedState"); if(!host) return;
  var f=state.feed, id=sheetIdFrom(state.settings.sheetId)||DEFAULT_SHEET;
  $("sSheet").value=state.settings.sheetId||DEFAULT_SHEET;
  if(f.loading){ host.innerHTML='<div class="banner info" style="margin:0"><div><b>Reading FEED_ORDERS…</b></div></div>'; return; }
  if(!state.canEdit){ host.innerHTML='<div class="banner info" style="margin:0"><div><b>Read by the people who take orders</b></div></div>'; return; }
  if(f.error){ host.innerHTML='<div class="banner bad" style="margin:0"><div><b>The customer feed isn\'t loaded</b><div>'+esc(f.error.message)+' Until it is, the code has to be read off the sheet and picked by hand on each order.</div></div></div>'; return; }
  var n={}; f.rows.forEach(function(r){var k=r.code||"?";n[k]=(n[k]||0)+1;});
  var unc=f.rows.filter(function(r){return r.unconfirmed;}).length;
  host.innerHTML='<div class="banner good" style="margin:0"><div><b>'+f.rows.length+' delivery sites · '+Object.keys(f.byCust).length+' customers</b>'+
    '<div>'+CODE_ORDER.concat(["?"]).filter(function(k){return n[k];}).map(function(k){return (k==="?"?"unrecognized":k)+" "+n[k];}).join(" · ")+
    (unc?' · '+unc+' site'+(unc===1?'':'s')+' still showing the billing address':'')+'</div>'+
    '<div class="mono" style="font-size:11px;word-break:break-all">'+esc(id)+' · last read '+(f.loadedAt?f.loadedAt.toLocaleString([], {month:"numeric",day:"numeric",hour:"numeric",minute:"2-digit"}):"never")+'</div></div></div>';
}

/* ============================================================
   Customer / site / address
   ============================================================ */
function fillAccounts(){
  var seen={}, names=[];
  Object.keys(state.feed.byCust).map(function(k){return state.feed.byCust[k][0].customer;}).concat((state.customers||[]).map(function(c){return c.name;})).forEach(function(n){
    var k=String(n||"").trim().toLowerCase(); if(!k||seen[k]) return; seen[k]=1; names.push(n);
  });
  names.sort(function(a,b){return a.localeCompare(b);});
  $("customerList").innerHTML=names.map(function(n){return '<option value="'+esc(n)+'"></option>';}).join("");
}
function currentSiteRow(){
  var rows=feedRowsFor($("fCustomer").value); if(!rows) return null;
  if(rows.length===1) return rows[0];
  var k=$("fSite").value; return rows.find(function(r){return r.siteKey===k;})||null;
}
function composeNotes(r){
  return [r.gate?"Gate / access: "+r.gate:"",r.hours?"Receiving hours: "+r.hours:"",r.instr||""].filter(Boolean).join(" · ");
}
/* Called when the customer changes. keepFields=true re-evaluates without overwriting typed values. */
function onCustomerInput(keepFields){
  var rows=feedRowsFor($("fCustomer").value);
  var sw=$("siteWrap");
  if(rows && rows.length>1){
    var cur=$("fSite").value;
    $("fSite").innerHTML='<option value="">— choose the site —</option>'+rows.map(function(r){
      return '<option value="'+esc(r.siteKey)+'">'+esc(r.siteLabel)+" — "+esc(r.addr||"no address")+"</option>";}).join("");
    if(cur && rows.some(function(r){return r.siteKey===cur;})) $("fSite").value=cur;
    sw.hidden=false;
  } else { sw.hidden=true; $("fSite").innerHTML=""; }
  if(!keepFields && !state.form.suppress) applySite();
  else { var r=currentSiteRow(); state.form.feedAddr=r?r.addr:""; state.form.feedUnconfirmed=r?r.unconfirmed:false; }
  refreshAddr(); refreshCode();
}
function applySite(){
  var r=currentSiteRow();
  state.form.feedAddr=r?r.addr:""; state.form.feedUnconfirmed=r?r.unconfirmed:false;
  if(!r) return;
  $("fShipTo").value=r.addr; $("fContact").value=r.contact; $("fContactPhone").value=r.phone;
  if(!$("fCopyTo").value) $("fCopyTo").value=r.copyTo||r.phone||"";
  $("fNotes").value=composeNotes(r);
  $("fAddrConfirm").checked=false;
  var hc=String(r.hub||"").trim().toUpperCase(); if(hc && hubBy(hc)) $("fHub").value=hc;
}
function addrStatus(){
  var typed=$("fShipTo").value.trim(), fa=state.form.feedAddr;
  if(!typed) return {k:"missing"};
  if(fa && typed!==fa) return {k:"edited"};
  if(!fa) return {k:"typed"};
  if(state.form.feedUnconfirmed) return $("fAddrConfirm").checked?{k:"confirmedNow"}:{k:"unconfirmed"};
  return {k:"sheet"};
}
function refreshAddr(){
  var s=addrStatus(), host=$("addrStat");
  if(s.k==="missing" && !$("fCustomer").value.trim()){ host.innerHTML=""; $("addrConfirmWrap").hidden=true; return; }
  var map={
    missing:'<span class="chip warn">No delivery address</span>',
    sheet:'<span class="chip k-D">From the sheet</span><span class="hint">Delivery site on the AR Command Center.</span>',
    unconfirmed:'<span class="chip warn">UNCONFIRMED</span><span class="hint">The sheet only has the billing address for this site. Confirm it with the customer, or type the real delivery address, before the BOL issues.</span>',
    confirmedNow:'<span class="chip k-D">Confirmed for this order</span><span class="hint">The sheet still shows the billing address — the office updates the Customer Directory.</span>',
    edited:'<span class="chip k-DEP">Changed for this order</span><span class="hint">Flagged for the office to decide whether the sheet changes.</span>',
    typed:'<span class="chip k-DEP">Typed by hand</span><span class="hint">Not from the sheet.</span>'
  };
  host.innerHTML=map[s.k]||"";
  $("addrConfirmWrap").hidden=!(state.form.feedUnconfirmed && (s.k==="unconfirmed"||s.k==="confirmedNow"));
}

/* ============================================================
   Payment code — read from the sheet, never typed
   ============================================================ */
function currentCode(){
  var name=$("fCustomer").value.trim();
  if(!name) return {code:null,src:"none",why:"Pick a customer."};
  if(feedReady()){
    var rows=feedRowsFor(name);
    if(!rows) return {code:"CHECK",src:"notfound",why:"<b>"+esc(name)+"</b> isn't on FEED_ORDERS. A new customer is set up by the office first, so this order goes to accounting@adchem.pro as CHECK."};
    var r=currentSiteRow()||rows[0];
    if(!r.code) return {code:"CHECK",src:"unrecognized",raw:r.codeRaw,why:"The sheet shows <b>“"+esc(r.codeRaw||"blank")+"”</b>, which isn't one of the five codes. Treated as CHECK until the sheet is fixed."};
    return {code:r.code,src:"sheet",raw:r.codeRaw,why:"Read from the AR Command Center"+(state.feed.loadedAt?" at "+state.feed.loadedAt.toLocaleTimeString([], {hour:"numeric",minute:"2-digit"}):"")+"."+
      (r.codeRaw && r.codeRaw!==CODES[r.code].text?' The sheet still says <span class="mono">'+esc(r.codeRaw)+"</span>.":"")};
  }
  var m=$("fManualCode").value;
  if(!m) return {code:null,src:"manual",why:"The sheet couldn't be read. Pick the code it shows for this customer."};
  return {code:m,src:"manual",why:"Entered by hand from the sheet — the feed couldn't be read."};
}
function effectiveCode(code,clear){
  if(code==="CHECK" && clear && clear.by && clear.code) return clear.code;
  return code;
}
function refreshCode(){
  var c=currentCode();
  $("manualCodeWrap").hidden=feedReady()||!$("fCustomer").value.trim()||!state.canEdit;
  var clear={by:$("fClearBy").value,code:$("fClearCode").value};
  var eff=effectiveCode(c.code,clear);
  $("checkWrap").hidden=(c.code!=="CHECK");
  var card=$("codeCard");
  card.className="codecard"+(eff?" "+CODES[eff].cls:"");
  $("codeText").textContent=c.code?CODES[c.code].text:"—";
  $("codeWhy").innerHTML=c.why+(c.code==="CHECK"&&eff!=="CHECK"?'<br><b>Cleared by '+esc(clear.by)+' as '+esc(CODES[eff].text)+'.</b>':"");
  $("codWrap").hidden=(eff!=="COD");
}

/* ============================================================
   Product lines
   ============================================================ */
function blankLine(){
  var p=PRODUCTS[0];
  return {category:p.cat,product:p.name,container:p.sizes[0],qty:1,unitLb:defaultUnitLb(p.name,p.sizes[0]),unitDef:!!defaultUnitLb(p.name,p.sizes[0]),note:""};
}
function cats(){var c=[];PRODUCTS.forEach(function(p){if(c.indexOf(p.cat)<0)c.push(p.cat);});return c;}
function opt(v,sel,label){return '<option value="'+esc(v)+'"'+(v===sel?" selected":"")+">"+esc(label==null?v:label)+"</option>";}
function renderLines(){
  var L=state.form.lines; if(!L.length) L.push(blankLine());
  $("lineEditor").innerHTML=L.map(function(l,i){
    var prods=PRODUCTS.filter(function(p){return p.cat===l.category;});
    var pr=prods.find(function(p){return p.name===l.product;})||prods[0];
    var h=hazFor(l.product,l.container);
    var hz=h.s==="verified"?h.un+" · Class "+h.cls:h.s==="exempt"?"not regulated by highway":h.s==="blocked"?"DO NOT LOAD — no verified data":h.s==="suspect"?"description unresolved":"not in the hazmat reference";
    return '<div class="lrow" data-line="'+i+'">'+
      '<label class="f">Category<select data-k="category">'+cats().map(function(c){return opt(c,l.category);}).join("")+'</select></label>'+
      '<label class="f">Product<select data-k="product">'+prods.map(function(p){return opt(p.name,l.product);}).join("")+'</select></label>'+
      '<label class="f">Container / size<select data-k="container">'+(pr?pr.sizes:["—"]).map(function(s){return opt(s,l.container);}).join("")+'</select></label>'+
      '<label class="f">Qty<input data-k="qty" type="number" min="1" step="1" class="mono" value="'+esc(l.qty)+'"></label>'+
      '<label class="f">Lb per unit<input data-k="unitLb" type="number" min="0" step="1" class="mono'+(l.unitLb?"":" miss")+'" value="'+esc(l.unitLb||"")+'" placeholder="gross"></label>'+
      '<button type="button" class="btn sm rm" data-rm="'+i+'"'+(L.length<2?" disabled":"")+' aria-label="Remove line">Remove</button>'+
      '<div class="lnote">'+(l.product&&!hubAllows($("fHub").value,l.category,l.product)?'<div class="lb" style="color:var(--bad);font-weight:700">Not offered from '+esc(hubLabel($("fHub").value))+'</div>':"")+'<div class="lb'+(l.unitDef?" def":"")+'" data-lb="'+i+'">'+esc(lineInfo(l,hz))+'</div>'+
      '<input data-k="note" value="'+esc(l.note||"")+'" placeholder="Line note — e.g. collect 6 empties" style="margin-top:5px;min-height:34px;font-size:13px;padding:5px 8px"></div>'+
    "</div>";
  }).join("");
  $("lineEditor").querySelectorAll("[data-line]").forEach(function(row){
    var i=Number(row.getAttribute("data-line"));
    row.querySelectorAll("[data-k]").forEach(function(el){
      var k=el.getAttribute("data-k");
      var on=function(){
        var l=state.form.lines[i];
        if(k==="category"){var p=PRODUCTS.find(function(x){return x.cat===el.value;}); l.category=el.value; l.product=p.name; l.container=p.sizes[0]; setDefLb(l); renderLines();}
        else if(k==="product"){var p2=PRODUCTS.find(function(x){return x.cat===l.category&&x.name===el.value;}); l.product=el.value; l.container=p2?p2.sizes[0]:"—"; setDefLb(l); renderLines();}
        else if(k==="container"){l.container=el.value; setDefLb(l); renderLines();}
        else if(k==="qty"){l.qty=Math.max(0,parseInt(el.value,10)||0); updLine(i);}
        else if(k==="unitLb"){l.unitLb=Math.max(0,Number(el.value)||0); l.unitDef=false; el.classList.toggle("miss",!l.unitLb); updLine(i);}
        else if(k==="note"){l.note=el.value;}
        scheduleLive();
      };
      if(el.tagName==="SELECT") el.onchange=on; else el.oninput=on;
    });
  });
  $("lineEditor").querySelectorAll("[data-rm]").forEach(function(b){
    b.onclick=function(){state.form.lines.splice(Number(b.getAttribute("data-rm")),1);renderLines();scheduleLive();};
  });
  updTotals();
}
function setDefLb(l){var d=defaultUnitLb(l.product,l.container); if(d){l.unitLb=d;l.unitDef=true;} else if(l.unitDef||!l.unitLb){l.unitLb=0;l.unitDef=false;}}
function lineInfo(l,hz){
  var lb=lineLb(l);
  return hz+" · "+(lb?fmtLb(lb)+" gross":"weight needed")+(l.unitDef?" · default "+l.unitLb+" lb per unit from the SmartBOL samples — confirm":"");
}
function updLine(i){
  var l=state.form.lines[i], el=document.querySelector('[data-lb="'+i+'"]'); if(!el) return;
  var h=hazFor(l.product,l.container);
  var hz=h.s==="verified"?h.un+" · Class "+h.cls:h.s==="exempt"?"not regulated by highway":h.s==="blocked"?"DO NOT LOAD — no verified data":h.s==="suspect"?"description unresolved":"not in the hazmat reference";
  el.textContent=lineInfo(l,hz); el.className="lb"+(l.unitDef?" def":"");
  updTotals();
}
function updTotals(){
  var L=state.form.lines, pcs=0, lb=0;
  L.forEach(function(l){pcs+=Number(l.qty||0);lb+=lineLb(l);});
  var v=placardVerdict(loadSummary(L),"order");
  $("lineTotals").innerHTML="<b>"+pcs+"</b> piece"+(pcs===1?"":"s")+" · <b>"+fmtLb(lb)+"</b> · Placards: <b>"+esc(v.name)+"</b>";
}

/* ============================================================
   Order ID and BOL number
   ============================================================ */
function idStamp(dateStr){var p=dateStr.split("-");return p[0].slice(2)+p[1]+p[2];}
function nextOrderId(hub,dateStr){
  var prefix=hub+"-"+idStamp(dateStr)+"-", n=0;
  state.orders.forEach(function(o){
    if(o.id && o.id.indexOf(prefix)===0){var s=parseInt(o.id.slice(prefix.length),10); if(!isNaN(s)&&s>n) n=s;}
  });
  return prefix+pad(n+1);
}
function effectiveId(){
  var ov=$("fIdOverride").value.trim();
  if(ov) return ov;
  return nextOrderId($("fHub").value,$("fDate").value||ymd(new Date()));
}
function maxBolUsed(){var m=0;state.orders.forEach(function(o){if(o.bolNo&&o.bolNo>m)m=o.bolNo;});return m;}
function nextBolPreview(){
  var n=Number(state.settings.nextBol)||0; if(!n) return 0;
  return Math.max(n,maxBolUsed()+1);
}
function refreshId(){
  var id=effectiveId();
  $("oidPreview").textContent=id;
  var ed=state.editing?state.orders.find(function(o){return o.id===state.editing;}):null;
  var nb=nextBolPreview();
  $("bolPreview").textContent=ed&&ed.bolNo?String(ed.bolNo):(nb?nb+" (when scheduled)":"not set");
  var dupe=state.orders.some(function(o){return o.id===id && o.id!==state.editing;});
  $("idExplain").innerHTML = dupe
    ? '<span style="color:var(--red);font-weight:700">This Order ID is already used.</span> Change the override or clear it.'
    : "The Order ID is the office reference and prints on the BOL. The <b>BOL number</b> continues SmartBOL's numeric sequence and is taken when the order is scheduled — not for holds or orders waiting on accounting."+
      (nb?"":' <b style="color:var(--amber)">No starting BOL number yet — set it on Setup at cutover.</b>');
}
/* Take the next BOL number. Re-reads the shared setting first so two people
   scheduling at once are unlikely to collide; a collision is caught by the
   max-used check. */
async function assignBolNo(o){
  if(o.bolNo) return true;
  if(!nextBolPreview()) return false;
  try{ var n=await DB.assignBol(o.id); if(n){ o.bolNo=n; state.settings.nextBol=Math.max(Number(state.settings.nextBol)||0, n+1); return true; } }
  catch(e){ banner("bad","BOL number not assigned","<div>"+esc(e.message||String(e))+"</div>"); }
  return false;
}

/* ============================================================
   Draft order from the form
   ============================================================ */
function hubBy(code){return state.hubs.find(function(h){return h.code===code;})||null;}
/* A hub's local time zone (blank = the company's), and the products it offers (null = every product). */
function hubTz(code){ var h=hubBy(code); return (h&&h.tz)||state.settings.tz||"America/Los_Angeles"; }
function hubLimited(code){ var h=hubBy(code); return !!(h&&Array.isArray(h.products)); }
function prodKey(cat,name){ return cat+"|"+name; }   // names repeat across media vendors, so the category is part of the key
function hubAllows(code,cat,product){ var h=hubBy(code); return !(h&&Array.isArray(h.products))||h.products.indexOf(prodKey(cat,product))>=0; }
function hubLabel(code){ var h=hubBy(code); return h?(h.name||code)+" ("+code+")":code||"this hub"; }
function draftOrderFromForm(){
  var c=currentCode(), r=currentSiteRow(), a=addrStatus();
  var cur=state.editing?state.orders.find(function(o){return o.id===state.editing;}):null;
  /* an edit keeps the stored link when no site is chosen and the name is unchanged */
  var keepLink=!r && cur && cur.customerId && String(cur.customer||"").trim().toLowerCase()===$("fCustomer").value.trim().toLowerCase();
  var cu=keepLink?null:customerForSite(r||{customer:$("fCustomer").value});
  var clear=($("fClearBy").value&&$("fClearCode").value)?{by:$("fClearBy").value,code:$("fClearCode").value,note:$("fClearNote").value.trim()}:null;
  var eff=effectiveCode(c.code,clear);
  var dep=$("fDep").checked?{item:$("fDepItem").value,amount:Number($("fDepAmt").value||0)}:null;
  var ed=state.editing?state.orders.find(function(o){return o.id===state.editing;}):null;
  return {
    id:effectiveId(), bolNo:ed?ed.bolNo||null:null,
    customer:$("fCustomer").value.trim(),
    siteKey:r?r.siteKey:"", siteLabel:r?r.siteLabel:"",
    customerId:cu?cu.id:(keepLink?cur.customerId:null), customerNo:cu?(cu.customer_id||""):(keepLink?cur.customerNo||"":""),
    shipTo:$("fShipTo").value.trim(), feedAddr:state.form.feedAddr,
    addrState:a.k, addrChanged:(a.k==="edited"||a.k==="typed"||a.k==="confirmedNow"),
    contact:$("fContact").value.trim(), contactPhone:$("fContactPhone").value.trim(), copyTo:$("fCopyTo").value.trim(),
    lines:state.form.lines.map(function(l){return Object.assign({},l);}),
    hub:$("fHub").value, date:$("fDate").value||ymd(new Date()), window:$("fWindow").value, truck:$("fTruck").value.trim(), po:$("fPo").value.trim(),
    notes:$("fNotes").value.trim(),
    code:c.code, codeSrc:c.src, codeRaw:c.raw||"", codeAt:new Date().toISOString(), checkClear:clear, effCode:eff,
    codAmount:eff==="COD"?Number($("fCod").value||0):0,
    deposit:dep,
    tz:hubTz($("fHub").value),
    status:"Intake", eventId:"", draft:true
  };
}
/* Orders saved before v7 carried one product and the retired C/P/D/R/H flags,
   where D meant COD. Map them so nothing old prints a bare D. */
function normalizeOrder(o){
  if(!o) return o;
  if(!o.lines){
    var q=Number(o.qty||1)||1, w=weightLbLegacy(o.weight);
    o.lines=[{category:o.category||"",product:o.product||"",container:o.container||"",qty:q,unitLb:w?Math.round(w/q):0,unitDef:false,note:o.prodNote||""}];
  }
  if(!o.code){
    var map={C:"D",P:"D",D:"COD",R:"R",H:"H"};
    o.code=map[o.flag]||"CHECK"; o.codeSrc="legacy"; o.effCode=o.code;
    if(o.code==="COD") o.codAmount=Number(o.amount||0);
    if(o.deposit===true) o.deposit={item:"Deposit",amount:0};
    else if(o.deposit===false) o.deposit=null;
  }
  if(!o.effCode) o.effCode=effectiveCode(o.code,o.checkClear);
  return o;
}
function weightLbLegacy(s){
  if(!s) return 0; var t=String(s).toLowerCase().replace(/,/g,""); var m=t.match(/([0-9]*\.?[0-9]+)\s*(kg|lb|lbs|#)?/);
  if(!m) return 0; var n=parseFloat(m[1]); if(isNaN(n)) return 0; return (m[2]==="kg")?n*2.20462:n;
}
function linesText(o){
  return (o.lines||[]).filter(function(l){return l.product;}).map(function(l){
    return l.qty+" × "+l.product+(l.container&&l.container!=="—"?" ("+l.container+")":"");}).join("; ");
}
function cleared(o){return !(o.code==="CHECK" && o.effCode==="CHECK");}
function schedulable(o){return o.effCode && o.effCode!=="H" && o.effCode!=="CHECK";}

/* ============================================================
   BOL
   ============================================================ */
const BOL_CSS=[
".bol{padding:20px 22px 24px;color:#16202b;background:#fff;font-family:'Barlow',Arial,Helvetica,sans-serif;font-size:12.5px;line-height:1.35}",
".bol *{color:inherit;box-sizing:border-box}",
".bol .mono{font-family:'IBM Plex Mono','Courier New',monospace;font-variant-numeric:tabular-nums}",
".bol h1{font-size:19px;margin:0;letter-spacing:.01em}",
".bol .co{font-size:11px;color:#556}",
".bol .rule{height:2px;background:#16202b;margin:9px 0 12px}",
".bol .hdr{display:flex;justify-content:space-between;gap:14px;align-items:flex-start;flex-wrap:wrap}",
".bol .bolno{text-align:right}.bol .bolno .n{font-family:'IBM Plex Mono','Courier New',monospace;font-size:20px;font-weight:600}",
".bol .lbl{font-size:9.5px;letter-spacing:.09em;text-transform:uppercase;color:#667;font-weight:700;margin-bottom:2px}",
".bol .two{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px}",
".bol .three{display:grid;grid-template-columns:1.3fr 1fr 1fr;gap:10px;margin-bottom:10px}",
".bol .box{border:1px solid #b9c2c6;padding:7px 10px;min-height:0}",
".bol table{width:100%;border-collapse:collapse;margin-bottom:10px;font-size:12px;table-layout:fixed;word-break:break-word}",
".bol th{background:#eef1f0;text-align:left;font-size:9.5px;letter-spacing:.07em;text-transform:uppercase;padding:5px 6px;border:1px solid #b9c2c6}",
".bol td{padding:5px 6px;border:1px solid #b9c2c6;vertical-align:top}",
".bol td.r,.bol th.r{text-align:right}.bol td.c,.bol th.c{text-align:center}",
".bol tr.tot td{font-weight:700;background:#f6f7f6}",
".bol .blank{color:#99a3a8}",
".bol .winbox{flex:none;border:2px solid #16202b;padding:7px 10px;text-align:center;min-width:118px;background:#f7f8f7}",
".bol .winbox .wd{font-family:'IBM Plex Mono','Courier New',monospace;font-size:12px;font-weight:600}",
".bol .winbox .wt{font-size:14.5px;font-weight:700;letter-spacing:.01em;margin-top:2px;line-height:1.2}",
".bol .note{border:1px solid #b9c2c6;padding:7px 10px;margin-bottom:10px;font-size:11.5px}",
".bol .haz{border:2px solid #a52a1f;padding:8px 10px;margin-bottom:10px;background:#fdf3f1;font-size:11px;line-height:1.4}",
".bol .haz .hl{font-weight:700;color:#a52a1f;font-size:10.5px;letter-spacing:.06em;text-transform:uppercase;margin-bottom:3px}",
".bol .haz.clear{border-color:#2f7d5f;background:#f0f7f3}.bol .haz.clear .hl{color:#2f7d5f}",
".bol .haz.block{background:#a52a1f;border-color:#a52a1f}.bol .haz.block,.bol .haz.block *{color:#fff}",
".bol .payblk{border:2px solid #16202b;padding:8px 12px 10px;margin-bottom:10px;break-inside:avoid;page-break-inside:avoid;font-family:'IBM Plex Mono','Courier New',monospace;font-size:12px}",
".bol .payblk .pbh{font-weight:700;letter-spacing:.06em;margin-bottom:6px;font-size:11.5px}",
".bol .payblk .pr{display:flex;gap:10px;align-items:baseline;padding:2px 0}",
".bol .payblk .bx{display:inline-block;width:18px;font-size:15px;line-height:1}",
".bol .payblk .pl{flex:1}",
".bol .payblk .pr.due{background:#f3e3c3;margin:2px -12px;padding:5px 12px;font-weight:700;border-top:1px solid #16202b;border-bottom:1px solid #16202b;-webkit-print-color-adjust:exact;print-color-adjust:exact}",
".bol .payblk .pr.due .amt{font-size:15px}",
".bol .payblk .duetxt{font-weight:500;font-size:11px}",
".bol .payblk .amt{min-width:120px;text-align:right;font-weight:600}",
".bol .payblk .ln{display:inline-block;border-bottom:1px solid #16202b;min-width:110px;height:15px;vertical-align:bottom}",
".bol .payblk .ln.s{min-width:80px}",
".bol .payblk .row2{display:flex;gap:18px;flex-wrap:wrap;margin-top:8px}",
".bol .payblk .stmt{font-family:'Barlow',Arial,sans-serif;font-size:11px;margin-top:8px;color:#333}",
".bol .terms{font-size:9.5px;line-height:1.4;color:#445;margin-bottom:8px}",
".bol .cert{font-size:10.5px;line-height:1.4;border:1px solid #b9c2c6;padding:7px 10px;margin-bottom:10px}",
".bol .sig{display:grid;grid-template-columns:1fr 1fr;gap:12px}",
".bol .sigline{border-top:1px solid #16202b;margin-top:24px;padding-top:3px;font-size:9.5px;letter-spacing:.06em;text-transform:uppercase;color:#667;font-weight:700}",
".bol .pod{border:1.5px solid #16202b;padding:7px 10px 9px;margin-top:10px;break-inside:avoid;page-break-inside:avoid}",
".bol .pod .sig{grid-template-columns:1.4fr 1.2fr .7fr .6fr}",
".bol .fin{font-size:9px;color:#667;margin-top:10px;border-top:1px solid #d5dbdd;padding-top:6px}",
".bol .draft{background:#fff4e0;border:1px dashed #a8550a;color:#7a3d07;padding:6px 10px;font-size:11px;font-weight:600;margin-bottom:10px}",
".bol .stamp{border:3px solid #a52a1f;color:#a52a1f;padding:7px 10px;font-weight:700;font-size:13px;letter-spacing:.03em;margin-bottom:10px;text-align:center;text-transform:uppercase}",
"@media(max-width:600px){.bol .two,.bol .three,.bol .sig,.bol .pod .sig{grid-template-columns:1fr}}"
].join("\n");

function descCell(l){
  var h=hazFor(l.product,l.container);
  var comm='<div class="co">'+esc(l.product)+(l.container&&l.container!=="—"?" · "+esc(l.container):"")+(l.note?" · "+esc(l.note):"")+"</div>";
  if(h.s==="verified"){
    var pg=(h.cls==="3")?', PG <span class="blank">____</span>':"";
    return "<b>"+esc(h.un)+", "+esc(h.psn)+", "+esc(h.cls)+"</b>"+pg+comm;
  }
  if(h.s==="suspect") return '<b class="blank">Shipping description unresolved — the office completes it before this moves</b>'+comm+'<div class="co">'+esc(h.note)+"</div>";
  if(h.s==="blocked") return '<b>DO NOT LOAD — no verified hazmat data on file</b>'+comm;
  if(h.s==="exempt") return "<b>"+esc(l.product)+"</b> — not regulated by highway"+'<div class="co">'+esc(l.container||"")+(l.note?" · "+esc(l.note):"")+"</div>";
  return "<b>"+esc(l.product)+"</b>"+'<div class="co">'+esc(l.container||"")+(l.note?" · "+esc(l.note):"")+' · not in the AdChem hazmat reference — check the SDS</div>';
}
function hmMark(l){var h=hazFor(l.product,l.container);return (h.s==="verified"||h.s==="suspect")?"X":(h.s==="unlisted"?'<span class="blank">?</span>':"");}
function payBlock(o){
  var cod=(o.effCode==="COD"), dep=!!o.deposit;
  function box(t){return '<span class="bx">'+(t?"☒":"☐")+"</span>";}
  return '<div class="payblk"><div class="pbh">PAYMENT AT DELIVERY</div>'+
    '<div class="pr'+(cod?" due":"")+'">'+box(cod)+'<span class="pl">COD DUE'+(cod?' <span class="duetxt">— collect before unloading</span>':"")+'</span><span class="amt">'+(cod?"[ "+money(o.codAmount)+" ]":"")+"</span></div>"+
    '<div class="pr'+(dep?" due":"")+'">'+box(dep)+'<span class="pl">DEPOSIT DUE'+(dep&&o.deposit.item?" &nbsp;["+esc(o.deposit.item)+"]":"")+'</span><span class="amt">'+(dep?"[ "+money(o.deposit.amount)+" ]":"")+"</span></div>"+
    '<div class="pr">'+box(false)+'<span class="pl">PAYMENT ON ACCOUNT</span><span class="amt"></span></div>'+
    '<div class="row2"><span>RECEIVED &nbsp; Cash $<span class="ln"></span></span><span>Check $<span class="ln"></span></span><span>Check no. <span class="ln"></span></span></div>'+
    '<div class="row2"><span>TOTAL RECEIVED &nbsp; $<span class="ln"></span></span></div>'+
    '<div class="stmt">The amount above was handed over and counted in the presence of both parties.</div>'+
    '<div class="row2"><span>Driver initials <span class="ln s"></span></span><span>Customer initials <span class="ln s"></span></span></div>'+
  "</div>";
}
function stamps(o){
  var s=[];
  if(o.effCode==="H") s.push("HOLD — DO NOT DELIVER. Not a valid bill of lading.");
  if(o.code==="CHECK" && o.effCode==="CHECK") s.push("Not cleared by accounting@adchem.pro — not a valid bill of lading.");
  if(o.addrState==="unconfirmed"||o.addrState==="missing") s.push("Delivery site unconfirmed — not valid until the address is confirmed.");
  if(loadSummary(o.lines).blocked) s.push("Do not load — a line has no verified hazmat data.");
  if(!o.bolNo && !o.draft && schedulable(o)) s.push("No BOL number — set the starting number on Setup.");
  return s.map(function(t){return '<div class="stamp">'+esc(t)+"</div>";}).join("");
}
function bolHtml(o){
  var hub=hubBy(o.hub), sum=loadSummary(o.lines), pv=placardVerdict(sum,"order");
  var regulated=sum.regulated||sum.unlisted;
  var shipAddr = hub && (hub.street||hub.city)
    ? esc(hub.street)+"<br>"+esc([hub.city,hub.state].filter(Boolean).join(", ")+" "+(hub.zip||""))
    : '<span class="blank">Hub address not set — Setup tab</span>';
  var emerg = hub && hub.emerg ? esc(hub.emerg) : '<span class="blank">NOT ON FILE — required, 49 CFR 172.604</span>';
  var consAddr = o.shipTo ? esc(o.shipTo) : '<span class="blank">No delivery address</span>';
  var pcs=0, lb=0; (o.lines||[]).forEach(function(l){pcs+=Number(l.qty||0);lb+=lineLb(l);});
  var rows=(o.lines||[]).filter(function(l){return l.product;}).map(function(l){
    var w=lineLb(l);
    return "<tr><td class=\"c mono\"><b>"+esc(l.qty)+"</b></td><td>"+esc(pkgType(l.container))+"</td><td class=\"c\"><b>"+hmMark(l)+"</b></td><td>"+descCell(l)+"</td><td class=\"r mono\">"+(w?Math.round(w).toLocaleString("en-US"):'<span class="blank">____</span>')+"</td></tr>";
  }).join("");
  return ''+
  (o.draft?'<div class="draft">PREVIEW — this order has not been created yet. It updates as you type.</div>':'')+
  stamps(o)+
  '<div class="hdr"><div><h1>BILL OF LADING</h1><div class="co">Straight bill of lading — not negotiable</div></div>'+
    '<div class="bolno"><div class="lbl">BOL no.</div><div class="n">'+(o.bolNo?esc(o.bolNo):'<span class="blank">______</span>')+'</div>'+
    '<div class="co" style="margin-top:2px">Order ID <span class="mono">'+esc(o.id)+'</span> · Ship date '+esc(o.date)+'</div></div></div>'+
  '<div class="rule"></div>'+
  '<div class="two">'+
    '<div class="box"><div class="lbl">Shipper (origin)</div><div><b>'+esc(coName())+'</b></div><div>'+shipAddr+'</div>'+
      (hub&&hub.phone?'<div>'+esc(hub.phone)+'</div>':'')+'</div>'+
    '<div class="box" style="display:flex;gap:10px;align-items:flex-start"><div style="flex:1;min-width:0"><div class="lbl">Consignee (destination)</div><div><b>'+esc(o.customer||"—")+'</b>'+(o.siteLabel&&o.siteLabel!=="Primary"?" — "+esc(o.siteLabel):"")+'</div>'+
      '<div>'+consAddr+'</div>'+
      ((o.contact||o.contactPhone)?'<div style="margin-top:4px">Site contact: '+esc([o.contact,o.contactPhone].filter(Boolean).join(" · "))+'</div>':'<div class="blank" style="margin-top:4px">No site contact</div>')+
    '</div>'+
    '<div class="winbox"><div class="lbl">Deliver</div><div class="wd">'+esc(o.date)+'</div><div class="wt">'+esc(o.window)+'</div></div></div>'+
  '</div>'+
  '<div class="three">'+
    '<div class="box"><div class="lbl">Emergency response — 24 hr</div><div><b>'+emerg+'</b></div></div>'+
    '<div class="box"><div class="lbl">Customer P.O. no.</div><div>'+(o.po?esc(o.po):'<span class="blank">—</span>')+'</div></div>'+
    '<div class="box"><div class="lbl">Carrier</div><div>'+esc(coShort())+(o.truck?' · '+esc(o.truck):'')+'</div></div>'+
  '</div>'+
  (o.notes?'<div class="note"><div class="lbl">Special instructions</div>'+esc(o.notes)+'</div>':'')+
  '<table><tr><th class="c" style="width:9%">Pieces</th><th style="width:15%">Package</th><th class="c" style="width:6%">HM</th><th>Description of articles — UN no., proper shipping name, hazard class, packing group</th><th class="r" style="width:13%">Weight (lb)</th></tr>'+
    (rows||'<tr><td>&nbsp;</td><td></td><td></td><td class="blank">No products on the order</td><td></td></tr>')+
    '<tr class="tot"><td class="c mono">'+pcs+'</td><td colspan="3">Grand totals</td><td class="r mono">'+(lb?Math.round(lb).toLocaleString("en-US"):"")+'</td></tr></table>'+
  '<div class="haz'+(pv.name==="DO NOT LOAD"?" block":pv.req?"":" clear")+'"><div class="hl">Placards — '+esc(pv.name)+'</div>'+esc(pv.text)+'</div>'+
  payBlock(o)+
  '<div class="terms">RECEIVED, subject to the classifications and tariffs in effect on the date of issue of this bill of lading, the property described above in apparent good order, except as noted (contents and condition of contents of packages unknown), consigned and destined as indicated above. Note: liability limitation for loss or damage in this shipment may be applicable — see 49 U.S.C. 14706(c)(1)(A) and (B).</div>'+
  (regulated?'<div class="cert"><b>Shipper certification.</b> This is to certify that the above-named materials are properly classified, described, packaged, marked and labeled, and are in proper condition for transportation according to the applicable regulations of the Department of Transportation.</div>':'')+
  '<div class="sig"><div><div class="sigline">Shipper signature / date</div></div><div><div class="sigline">Carrier (driver) signature / date</div></div></div>'+
  '<div class="pod"><div class="lbl">Proof of delivery — received in good order</div><div class="sig">'+
    '<div><div class="sigline">Receiver signature</div></div><div><div class="sigline">Printed name</div></div>'+
    '<div><div class="sigline">Date</div></div><div><div class="sigline">Time</div></div></div></div>'+
  '<div class="fin">Order <span class="mono">'+esc(o.id)+'</span>'+(o.bolNo?' · BOL <span class="mono">'+esc(o.bolNo)+'</span>':'')+
    ' · Hazmat descriptions from AdChem Product Hazmat Reference v1.1 only; unverified entries are left blank on purpose. The customer\'s copy is a photograph of this signed page.</div>';
}
function pkgType(c){
  var s=String(c||"").toLowerCase();
  if(s.indexOf("cylinder")>=0||/^\d+(lb|#)$/.test(s.replace(/\s/g,""))) return "Cylinder";
  if(s.indexOf("pig")>=0) return "Pig";
  if(s.indexOf("dewar")>=0) return "Dewar";
  if(s.indexOf("drum")>=0||s==="55gal") return "Drum";
  if(s.indexOf("tote")>=0) return "Tote";
  if(s.indexOf("pail")>=0||s.indexOf("bucket")>=0||s==="5gal") return "Pail";
  if(s==="bin") return "Bin";
  if(s==="bag") return "Bag";
  return c||"—";
}
function bolChecks(o){
  var hub=hubBy(o.hub), sum=loadSummary(o.lines), out=[];
  var regulated=sum.regulated||sum.unlisted;
  if(o.effCode==="H") out.push({k:"stop",t:"Hold — do not deliver",s:"This order must not reach a route."});
  else if(o.code==="CHECK"&&o.effCode==="CHECK") out.push({k:"stop",t:"Not cleared by accounting",s:"Record who at accounting@adchem.pro cleared it, and the code they gave."});
  else if(o.code==="CHECK") out.push({k:"ok",t:"Cleared by "+o.checkClear.by,s:CODES[o.effCode].text});
  else if(o.effCode) out.push({k:"ok",t:"Payment code",s:CODES[o.effCode].text+(o.codeSrc==="manual"?" — entered by hand":o.codeSrc==="legacy"?" — carried over from v6, check it against the sheet":"")});
  else out.push({k:"no",t:"Payment code",s:"Not read yet"});
  if(o.effCode==="COD") out.push({k:o.codAmount>0?"ok":"stop",t:"COD amount",s:o.codAmount>0?money(o.codAmount):"COD with no amount — enter it"});
  if(o.deposit) out.push({k:o.deposit.amount>0?"ok":"no",t:"Deposit due",s:(o.deposit.item||"Deposit")+" "+money(o.deposit.amount)});
  out.push({k:o.bolNo?"ok":(schedulable(o)?"no":"no"),t:"BOL number",s:o.bolNo?String(o.bolNo):(nextBolPreview()?"Taken when the order is scheduled":"No starting number — Setup")});
  out.push({k:o.customer?"ok":"no",t:"Consignee",s:o.customer||"No customer"});
  var as={sheet:["ok","From the sheet"],confirmedNow:["ok","Confirmed for this order"],edited:["ok","Changed for this order — office to update the sheet"],typed:["ok","Typed by hand"],unconfirmed:["stop","UNCONFIRMED — only the billing address is on file"],missing:["stop","No delivery address"]}[o.addrState||"typed"]||["no",""];
  out.push({k:as[0],t:"Delivery site",s:(o.shipTo?o.shipTo+" — ":"")+as[1]});
  out.push({k:(hub&&(hub.street||hub.city))?"ok":"no",t:"Shipper address",s:(hub&&hub.street)?[hub.street,hub.city].filter(Boolean).join(", "):"Not set — Setup tab"});
  if(regulated) out.push({k:(hub&&hub.emerg)?"ok":"stop",t:"Emergency response number",s:(hub&&hub.emerg)?hub.emerg:"Required on a hazmat paper (49 CFR 172.604)"});
  (o.lines||[]).forEach(function(l,i){
    if(!l.product) return;
    var h=hazFor(l.product,l.container), n="Line "+(i+1)+" — "+l.product;
    if(h.s==="verified") out.push({k:"ok",t:n,s:h.un+" · "+h.psn+" · Class "+h.cls+(h.cls==="3"?" · packing group by hand":"")});
    else if(h.s==="suspect") out.push({k:"stop",t:n,s:"Shipping description unresolved — the office enters it."});
    else if(h.s==="blocked") out.push({k:"stop",t:n,s:"DO NOT LOAD — no verified hazmat data."});
    else if(h.s==="exempt") out.push({k:"ok",t:n,s:"Not regulated by highway. Do not placard."});
    else out.push({k:"no",t:n,s:"Not in the hazmat reference — check the SDS."});
    if(!lineLb(l)) out.push({k:"no",t:n+" weight",s:"Blank — enter the gross weight"});
    else if(l.unitDef) out.push({k:"no",t:n+" weight",s:l.unitLb+" lb per unit is a default from the SmartBOL samples — not yet confirmed"});
  });
  var pv=placardVerdict(sum,"order");
  out.push({k:pv.name==="DO NOT LOAD"?"stop":pv.req?"no":"ok",t:"Placards — "+pv.name,s:pv.req?"CDL with H endorsement required":"Truck total decides — Today list"});
  out.push({k:o.copyTo?"ok":"no",t:"Receiver's copy",s:o.copyTo||"No email or mobile — the customer gets no copy"});
  return out;
}
function checklistHtml(o){
  return bolChecks(o).map(function(c){
    var mark=c.k==="ok"?"✓":c.k==="stop"?"!":"–";
    return '<li class="'+c.k+'"><span class="mk">'+mark+'</span><span class="t"><b>'+esc(c.t)+"</b><span>"+esc(c.s)+"</span></span></li>";
  }).join("");
}
function renderBolTab(){
  var o=state.bolOrder||draftOrderFromForm();
  $("bolBody").innerHTML=bolHtml(o);
  $("bolChecklist").innerHTML=checklistHtml(o);
  var ctx=$("bolCtx");
  $("bolPod").hidden=!(state.bolOrder&&schedulable(state.bolOrder));
  if(state.bolOrder){
    ctx.style.display="";
    ctx.innerHTML="<div><b>"+(o.bolNo?"BOL "+esc(o.bolNo)+" · ":"")+"Order "+esc(o.id)+"</b><div>"+esc(o.customer)+" · "+esc(o.status)+(o.rev>1?" · rev "+o.rev:"")+"</div></div>";
  } else { ctx.style.display="none"; }
}
var liveTimer=null;
function renderLive(){
  if($("liveWrap").hidden) return;
  var o=draftOrderFromForm();
  $("liveBody").innerHTML=bolHtml(o);
  $("liveChecklist").innerHTML=checklistHtml(o);
}
function scheduleLive(){ clearTimeout(liveTimer); liveTimer=setTimeout(function(){refreshAddr();refreshCode();renderLive();},140); }

/* ============================================================
   Tabs and form population
   ============================================================ */
function fillHubSelects(){
  var opts=state.hubs.map(function(h){return '<option value="'+esc(h.code)+'">'+esc(h.name)+" ("+esc(h.code)+")"+(h.settled?"":" — provisional")+"</option>";}).join("");
  var cur=$("fHub").value; $("fHub").innerHTML=opts; if(cur) $("fHub").value=cur;
  $("qHub").innerHTML='<option value="">All hubs</option>'+state.hubs.map(function(h){return '<option value="'+esc(h.code)+'">'+esc(h.code)+"</option>";}).join("");
}
function fillStatic(){
  $("fWindow").innerHTML=WINDOWS.map(function(w,i){return '<option value="'+esc(w)+'"'+(i===1?" selected":"")+">"+esc(w)+"</option>";}).join("");
  $("qStatus").innerHTML='<option value="">All statuses</option>'+STATUSES.map(function(s){return '<option value="'+esc(s)+'">'+esc(s)+"</option>";}).join("");
  $("fManualCode").innerHTML='<option value="">— pick the code on the sheet —</option>'+CODE_ORDER.map(function(k){return '<option value="'+k+'">'+esc(CODES[k].text)+"</option>";}).join("");
  $("fDepItem").innerHTML=DEPOSITS.map(function(d){return '<option value="'+esc(d.item)+'">'+esc(d.item)+(d.amt?" — "+money(d.amt):"")+"</option>";}).join("");
  var t=ymd(new Date()); $("fDate").value=t; $("tDate").value=t;
}
function setTab(t){
  state.tab=t;
  ["new","bol","open","today","setup","customers","documents","mydocs","users"].forEach(function(k){
    $("tab-"+k).setAttribute("aria-selected",k===t?"true":"false");
    $("panel-"+k).hidden=(k!==t);
  });
  lsSet("adchem_tab",t);
  if(t==="open") renderOrders();
  if(t==="today") renderToday();
  if(t==="bol") renderBolTab();
  if(t==="setup") renderSetup();
  if(t==="users") renderUsers();
  if(t==="customers") renderCustomers();
  if(t==="documents") renderDocsHub();
  if(t==="mydocs") renderMyDocs();
}
function codeChip(o){
  var k=o.effCode||o.code;
  var label=!k?"—":(o.code==="CHECK"&&k!=="CHECK")?k+" (cleared)":k;
  return '<span class="chip '+(k?CODES[k].cls:"k-none")+'" title="'+esc(k?CODES[k].text:"")+'">'+esc(label)+"</span>"+(o.deposit?' <span class="chip k-DEP">+DEP</span>':"");
}

/* ============================================================
   Orders
   ============================================================ */
function renderOrders(){
  var q=($("qSearch").value||"").toLowerCase().trim(),st=$("qStatus").value,hub=$("qHub").value;
  var rows=state.orders.filter(function(o){
    if(st&&o.status!==st) return false;
    if(hub&&o.hub!==hub) return false;
    if(!q) return true;
    return (o.id+" "+(o.bolNo||"")+" "+o.customer+" "+linesText(o)+" "+(o.shipTo||"")).toLowerCase().indexOf(q)>=0;
  });
  var host=$("orderList");
  if(!rows.length){
    host.innerHTML='<div class="empty"><b>'+(state.orders.length?"No orders match those filters":"No orders yet")+"</b>"+(state.orders.length?"Clear the search or pick another status.":"Take one on the New order tab.")+"</div>";
    return;
  }
  host.innerHTML=rows.map(function(o){
    var cal=!schedulable(o)?'':o.eventId?'<span class="hint" style="color:var(--accent)">On calendar</span>':'<button class="btn sm" data-retry="'+esc(o.id)+'">Add to calendar</button>';
    var flags=[];
    if(o.code==="CHECK"&&o.effCode==="CHECK") flags.push('<span class="chip warn">Waiting on accounting</span>');
    if(o.addrChanged) flags.push('<span class="chip k-DEP" title="Office: decide whether the Customer Directory changes">Site changed — update the sheet</span>');
    if(o.addrState==="unconfirmed") flags.push('<span class="chip warn">Site unconfirmed</span>');
    if(o.codeSrc==="legacy") flags.push('<span class="chip warn" title="Created under the retired codes">old order — check the code</span>');
    orderFlags(o).filter(function(f){return f.k==="stop";}).forEach(function(f){ flags.push('<span class="chip k-H" title="'+esc(f.s)+'">'+esc(f.t)+'</span>'); });
    return '<div class="orow"><div class="oid mono">'+(o.bolNo?"BOL "+esc(o.bolNo)+"<br>":"")+'<span style="color:var(--ink-3);font-weight:500">'+esc(o.id)+"</span></div>"+
      '<div class="obody"><div class="ocust">'+esc(o.customer)+(o.shipTo?' <span class="hint">— '+esc(o.shipTo)+"</span>":"")+"</div>"+
      '<div class="oline">'+esc(linesText(o))+"</div>"+
      '<div class="ometa"><span>'+esc(o.hub)+" · "+esc(o.date)+" · "+esc(o.window)+(o.truck?" · "+esc(o.truck):"")+"</span>"+flags.join("")+cal+
        '<button class="btn sm" data-bol="'+esc(o.id)+'">BOL</button>'+
        '<button class="btn sm" data-copy="'+esc(o.id)+'">Copy details</button>'+
        (state.canEdit?'<button class="btn sm" data-edit="'+esc(o.id)+'">'+((o.code==="CHECK"&&o.effCode==="CHECK")?"Record clearance":"Edit")+'</button>':'')+
        (o.rev>1?'<span class="chip warn">rev '+o.rev+'</span>':'')+'</div></div>'+
      '<div class="oside">'+codeChip(o)+
      '<select data-status="'+esc(o.id)+'" style="font-size:12px;padding:3px 22px 3px 7px;min-height:0;background-position:calc(100% - 12px) 12px,calc(100% - 7px) 12px">'+
      STATUSES.map(function(s){return '<option'+(s===o.status?" selected":"")+">"+esc(s)+"</option>";}).join("")+"</select></div></div>";
  }).join("");
  host.querySelectorAll("select[data-status]").forEach(function(sel){
    sel.disabled=!state.canEdit;
    sel.onchange=function(){var o=state.orders.find(function(x){return x.id===sel.getAttribute("data-status");}); if(o){o.status=sel.value;saveOrder(o);updateCounts();}};
  });
  function byId(b,a){return state.orders.find(function(x){return x.id===b.getAttribute(a);});}
  host.querySelectorAll("[data-retry]").forEach(function(b){b.onclick=function(){var o=byId(b,"data-retry"); if(o) pushToCalendar(o,true);};});
  host.querySelectorAll("[data-bol]").forEach(function(b){b.onclick=function(){var o=byId(b,"data-bol"); if(o){state.bolOrder=o;setTab("bol"); if(o.status==="Scheduled"){o.status="BOL Created";saveOrder(o);updateCounts();}}};});
  host.querySelectorAll("[data-copy]").forEach(function(b){b.onclick=function(){var o=byId(b,"data-copy"); if(o) copyDetails(o);};});
  host.querySelectorAll("[data-edit]").forEach(function(b){b.onclick=function(){var o=byId(b,"data-edit"); if(o) startEdit(o);};});
}

/* ============================================================
   Today — the driver's view, and the placard check per truck
   ============================================================ */
/* The Morning Driver Sheet, printed from the app: one page per hub and truck for the chosen day.
   The paper backup to Today — same orders, same codes, same amounts — so the office never keys a second list. */
function driverSheetHtml(day){
  var hubFilter=myHub();
  var orders=state.orders.filter(function(o){return o.date===day&&o.status!=="Cancelled"&&schedulable(o)&&(!hubFilter||o.hub===hubFilter);});
  var groups={}; orders.forEach(function(o){var k=o.hub+"|"+(o.truck||"");(groups[k]=groups[k]||[]).push(o);});
  var keys=Object.keys(groups).sort();
  var pages=keys.map(function(gk){
    var hc=gk.split("|")[0], truck=gk.split("|")[1], hub=hubBy(hc);
    var list=groups[gk].slice().sort(function(a,b){return (WINDOW_HOURS[a.window]||[0])[0]-(WINDOW_HOURS[b.window]||[0])[0];});
    var cod=0, dep=0;
    list.forEach(function(o){ if(o.effCode==="COD") cod+=Number(o.codAmount||0); if(o.deposit) dep+=Number(o.deposit.amount||0); });
    var rows=list.map(function(o,i){
      var due=(o.effCode==="COD"?Number(o.codAmount||0):0)+(o.deposit?Number(o.deposit.amount||0):0);
      return '<tr'+(o.effCode==="COD"?' class="cod"':'')+'><td class="c">'+(i+1)+'</td><td class="mono">'+esc(o.id)+(o.bolNo?"<br>BOL "+esc(o.bolNo):"")+'</td>'+
        '<td><b>'+esc(o.customer)+'</b>'+(o.siteLabel&&o.siteLabel!=="Primary"?" — "+esc(o.siteLabel):"")+'<br><span class="sm">'+esc(o.shipTo||"")+'</span>'+((o.contact||o.contactPhone)?'<br><span class="sm">'+esc([o.contact,o.contactPhone].filter(Boolean).join(" · "))+'</span>':"")+'</td>'+
        '<td>'+esc(linesText(o))+(o.notes?'<br><span class="sm">'+esc(o.notes)+'</span>':"")+'</td>'+
        '<td class="mono code">'+esc(o.effCode?CODES[o.effCode].text:"")+(o.deposit?" +DEP":"")+'</td>'+
        '<td class="r mono">'+(due?money(due):"")+'</td><td class="blank">$</td><td class="blank"></td><td class="blank"></td><td class="c">☐</td></tr>';
    }).join("");
    while(list.length<8){ list.push(null); rows+='<tr><td class="c">'+list.length+'</td><td></td><td></td><td></td><td></td><td class="r"></td><td class="blank">$</td><td class="blank"></td><td class="blank"></td><td class="c">☐</td></tr>'; }
    return '<section class="page">'+
      '<div class="hd"><div><div class="t">MORNING DRIVER SHEET</div><div class="s">'+esc(coShort())+' · '+esc(hub?hub.name:hc)+' · '+esc(day)+(truck?' · '+esc(truck):'')+'</div></div><div class="s r">Printed '+esc(new Date().toLocaleString([],{month:"numeric",day:"numeric",year:"2-digit",hour:"numeric",minute:"2-digit"}))+' from AdChem Ops</div></div>'+
      '<table class="meta"><tr><td>Driver ______________________</td><td>Date '+esc(day)+'</td><td>Hub '+esc(hc)+'</td><td>Vehicle no. ____________</td><td>Trailer no. ____________</td></tr></table>'+
      '<p class="note">Stops are in window order. This sheet is a view of the office\'s order record and cannot disagree with the office; if it disagrees with what is on your truck, do not depart. Every stop carries a spelled-out code — a bare letter, an empty code or CHECK means stop and call. <b>You never ask for money at a stop that is not COD.</b> If a customer pays anyway: count it in front of them, tick Payment on Account on the BOL, both initial.</p>'+
      '<table class="stops"><thead><tr><th>#</th><th>Order ID / BOL</th><th>Customer · site</th><th>Product · qty · container</th><th>Code</th><th>To collect</th><th>Collected</th><th>Time</th><th>Outcome</th><th>Tires</th></tr></thead><tbody>'+rows+'</tbody></table>'+
      '<p class="sm">Outcome: Delivered · Part-delivered · Not delivered · Refused · Customer absent · Disputed. &nbsp; Tires: tick each stop where you parked and examined the tires (49 CFR 397.17). &nbsp; Every signed BOL is photographed and sent from the app at the stop — the photograph is the payment record.</p>'+
      '<div class="two"><table class="tot"><tr><th></th><th>Expected</th><th>Collected</th><th>Difference</th></tr>'+
        '<tr><td>COD</td><td class="r mono">'+money(cod)+'</td><td>$</td><td>$</td></tr><tr><td>Deposits (+DEP)</td><td class="r mono">'+money(dep)+'</td><td>$</td><td>$</td></tr><tr><td>Payments on account</td><td class="r mono">—</td><td>$</td><td>$</td></tr><tr><td><b>Total</b></td><td class="r mono"><b>'+money(cod+dep)+'</b></td><td>$</td><td>$</td></tr></table>'+
        '<table class="log"><tr><th colspan="5">Contact attempts — call, then text: Order ID / Issue / Action / Time. Site matters → Bill. Everything else → Jessica. No answer in 15 min → apply the written default and note it.</th></tr><tr><th>Time</th><th>Order ID</th><th>Called</th><th>Text sent</th><th>Issue / action</th></tr>'+
        '<tr><td></td><td></td><td>☐ Bill ☐ Jess</td><td>☐</td><td></td></tr><tr><td></td><td></td><td>☐ Bill ☐ Jess</td><td>☐</td><td></td></tr><tr><td></td><td></td><td>☐ Bill ☐ Jess</td><td>☐</td><td></td></tr></table></div>'+
      '<table class="close"><tr><td>☐ Every stop has an outcome</td><td>☐ Every BOL signed, photographed and sent</td><td>☐ Money counted against the totals above, bag sealed</td><td>☐ Deposit slip photographed and sent, if a bank run</td></tr></table>'+
      '<table class="meta"><tr><td>Driver signature ______________________ &nbsp; time ______</td><td>Close-out reviewed by ______________________ &nbsp; date ____ / ____ / ______</td></tr></table>'+
      '<div class="ft">Morning Driver Sheet · printed from AdChem Ops · '+esc(day)+' · codes: D - Deliver; no holds · COD - Collect before unloading · R - Payment required, do not unload · H - Hold, do not deliver · CHECK - accounting@adchem.pro</div>'+
    '</section>';
  }).join("");
  if(!keys.length) pages='<section class="page"><div class="hd"><div class="t">MORNING DRIVER SHEET</div></div><p>Nothing scheduled on '+esc(day)+(hubFilter?' for '+esc(hubFilter):'')+'.</p></section>';
  var css='@page{size:letter;margin:0.4in}body{font-family:Barlow,Arial,sans-serif;font-size:10.5px;color:#111;margin:0}.page{page-break-after:always;padding:0 0 6px}.page:last-child{page-break-after:auto}.hd{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid #111;padding-bottom:4px;margin-bottom:6px}.t{font-size:16px;font-weight:800;letter-spacing:.04em}.s{font-size:10px;color:#333}.r{text-align:right}.c{text-align:center}.mono{font-family:"IBM Plex Mono","Courier New",monospace}.sm{font-size:9px;color:#333}table{width:100%;border-collapse:collapse;margin-bottom:6px}.meta td{padding:3px 4px;border:1px solid #999}.note{font-size:9.5px;margin:0 0 6px;line-height:1.35}.stops th,.stops td{border:1px solid #666;padding:3px 4px;vertical-align:top;line-height:1.25}.stops th{background:#e9e9e9;font-size:9px;text-transform:uppercase;letter-spacing:.03em}.stops td.code{white-space:nowrap;font-size:9.5px}.stops td.mono{white-space:nowrap}.stops tr.cod td{background:#f3e3c3;-webkit-print-color-adjust:exact;print-color-adjust:exact}.stops td.blank{min-width:48px}.two{display:flex;gap:8px;align-items:flex-start}.two table{width:50%}.tot th,.tot td,.log th,.log td,.close td{border:1px solid #666;padding:3px 4px;font-size:9.5px;text-align:left}.tot th,.log th{background:#e9e9e9}.log td{height:16px}.close td{height:18px}.ft{font-size:8.5px;color:#444;border-top:1px solid #999;padding-top:3px;margin-top:4px}@media screen{body{background:#777;padding:12px}.page{background:#fff;max-width:8.1in;margin:0 auto 12px;padding:.4in;box-shadow:0 2px 12px rgba(0,0,0,.3)}}';
  return '<!doctype html><html><head><meta charset="utf-8"><title>Morning Driver Sheet — '+esc(day)+'</title><style>'+css+'</style></head><body>'+pages+'<script>setTimeout(function(){try{window.print()}catch(e){}},300)<\/script></body></html>';
}
function printDriverSheet(){
  var day=$("tDate").value||ymd(new Date());
  var html=driverSheetHtml(day);
  var w=window.open("","_blank");
  if(!w){ banner("warn","Pop-up blocked","<div>Allow pop-ups for this site, then press Print driver sheet again.</div>",{autoclose:8000}); return; }
  w.document.open(); w.document.write(html); w.document.close();
}
function myHub(){return lsGet("adchem_myhub","");}
function renderHubPick(){
  var cur=myHub();
  if(state.me&&state.me.role==="driver"&&state.me.hub){ var h=hubBy(state.me.hub); $("hubPick").innerHTML='<span class="chip k-DEP">'+esc(state.me.hub)+(h?" — "+esc(h.name):"")+'</span><span class="hint" style="margin-left:8px">Signed in to hub '+esc(state.me.hub)+'.</span>'; $("tDriver").value=lsGet("adchem_driver",""); return; }
  $("hubPick").innerHTML=state.hubs.map(function(h){
    return '<label class="tg"><input type="radio" name="myhub" value="'+esc(h.code)+'"'+(h.code===cur?" checked":"")+'><span>'+esc(h.code)+" — "+esc(h.name.split(" — ").pop())+"</span></label>";
  }).join("")+'<label class="tg"><input type="radio" name="myhub" value=""'+(cur?"":" checked")+'><span>All hubs</span></label>';
  $("hubPick").querySelectorAll("input").forEach(function(i){ i.onchange=function(){ lsSet("adchem_myhub",i.value); renderToday(); }; });
  $("tDriver").value=lsGet("adchem_driver","");
}
function renderToday(){
  renderHubPick();
  var base=$("tDate").value||ymd(new Date()), hubFilter=myHub();
  var d2=new Date(base+"T12:00:00"); d2.setDate(d2.getDate()+1);
  var days=[base,ymd(d2)], host=$("todayList"), out="", siteKeys=[];
  var siteOf=function(o){ var rows=state.feed.rows||[], k=o.siteKey, c=String(o.customer||"").trim().toLowerCase();
    return (k&&rows.find(function(r){return r.siteKey===k;}))||rows.find(function(r){return String(r.customer||"").trim().toLowerCase()===c&&r.hub===o.hub;})||null; };
  days.forEach(function(day){
    var dayOrders=state.orders.filter(function(o){return o.date===day&&o.status!=="Cancelled"&&(!hubFilter||o.hub===hubFilter);});
    var label=(day===ymd(new Date()))?"Today":(day===days[1]?"Tomorrow":day);
    out+='<div class="daygroup"><div class="dayhead"><h3>'+esc(label)+'</h3><span class="sub mono">'+esc(day)+"</span>"+
      '<span class="sub">'+dayOrders.filter(schedulable).length+" on routes"+(dayOrders.filter(schedulable).length===dayOrders.length?"":" · "+(dayOrders.length-dayOrders.filter(schedulable).length)+" held back")+"</span></div>";
    if(!dayOrders.length){out+='<div class="card"><div class="empty">Nothing scheduled.</div></div></div>';return;}
    var groups={}, held=dayOrders.filter(function(o){return !schedulable(o);});
    dayOrders.filter(schedulable).forEach(function(o){var k=o.hub+"|"+(o.truck||"");(groups[k]=groups[k]||[]).push(o);});
    Object.keys(groups).sort().forEach(function(gk){
      var hc=gk.split("|")[0], truck=gk.split("|")[1], hub=hubBy(hc);
      var list=groups[gk].slice().sort(function(a,b){return (WINDOW_HOURS[a.window]||[0])[0]-(WINDOW_HOURS[b.window]||[0])[0];});
      var onRoute=list;
      var cod=0, dep=0, codList=[];
      onRoute.forEach(function(o){ if(o.effCode==="COD"){cod+=Number(o.codAmount||0);codList.push(o);} if(o.deposit) dep+=Number(o.deposit.amount||0); });
      out+='<div class="card" style="margin-bottom:10px"><div style="padding:9px 13px;border-bottom:1px solid var(--line);font-weight:700;font-size:13px">'+
        esc(hub?hub.name:hc)+' <span class="mono" style="color:var(--ink-3);font-weight:500">'+esc(hc)+"</span>"+
        (truck?' · Truck / driver: '+esc(truck):' · <span style="color:var(--amber)">no truck set</span>')+"</div>"+
        list.map(function(o){
          var k=o.effCode, cls=k==="COD"?" collect":(k==="H"||k==="R"||k==="CHECK"?" hold":"");
          var act=k?CODES[k].act:"No code.";
          if(k==="COD") act="Collect <b>"+money(o.codAmount)+"</b> before unloading. "+act.replace("<b>Collect before unloading.</b> ","");
          if(o.deposit) act+="<br>Deposit due: <b>"+esc(o.deposit.item||"deposit")+" "+money(o.deposit.amount)+"</b> — collect it with any other amount due.";
          var moneyLine=k==="COD"?"COD — collect <b>"+money(o.codAmount)+"</b> before unloading":(o.deposit?"Deposit due with this delivery":"");
          if(o.deposit&&k==="COD") moneyLine+=" · deposit <b>"+esc(o.deposit.item||"deposit")+" "+money(o.deposit.amount)+"</b>";
          else if(o.deposit) moneyLine+=" — <b>"+esc(o.deposit.item||"deposit")+" "+money(o.deposit.amount)+"</b>";
          var due=(k==="COD"?Number(o.codAmount||0):0)+(o.deposit?Number(o.deposit.amount||0):0);
          var fl=orderFlags(o).filter(function(f){return f.k==="stop"||f.k==="warn";});
          var site=siteOf(o); if(site&&siteKeys.indexOf(site.siteKey)<0) siteKeys.push(site.siteKey);
          var where=o.shipTo?esc(o.shipTo)+(o.addrState==="unconfirmed"?' <span class="chip warn">UNCONFIRMED</span>':""):'<span style="color:var(--amber)">No delivery address</span>';
          return '<div class="stop'+cls+'">'+
            '<div class="qr"><div class="qr-win mono">'+esc(o.window)+"</div>"+
              '<div class="qr-main"><div class="qr-who">'+esc(o.customer)+(o.siteLabel&&o.siteLabel!=="Primary"?" — "+esc(o.siteLabel):"")+"</div>"+
              '<div class="qr-where">'+where+"</div>"+
              '<div class="qr-what">'+esc(linesText(o))+"</div></div>"+
              '<div class="qr-code">'+codeChip(o)+'<div class="qr-codetext">'+esc(k?CODES[k].text:"No code")+"</div>"+(due?'<div class="qr-amt mono">'+money(due)+"</div>":"")+"</div></div>"+
            (moneyLine?'<div class="qr-band'+(k==="COD"?" collect":" dep")+'"><span>'+moneyLine+'</span><span class="mono">'+money(due)+"</span></div>":"")+
            (fl.length?'<div class="qr-flags">'+fl.map(function(f){return '<span class="chip '+(f.k==="stop"?"k-H":"warn")+'" title="'+esc(f.s)+'">'+esc(f.t)+"</span>";}).join(" ")+"</div>":"")+
            siteNotesHtml(site,hc,o.id)+
            '<div class="qr-actions"><button class="btn sm" data-bol2="'+esc(o.id)+'">BOL</button>'+podButton(o)+
              '<button class="btn sm ghost" data-more="'+esc(o.id)+'">Details / Detalles</button></div>'+
            '<div class="qr-more" id="more-'+esc(o.id)+'" hidden>'+
              ((o.contact||o.contactPhone)?'<div class="ad"><b>Site contact:</b> '+esc([o.contact,o.contactPhone].filter(Boolean).join(" · "))+"</div>":"")+
              (o.notes?'<div class="ad"><b>Instructions:</b> '+esc(o.notes)+"</div>":"")+
              '<div class="ad">'+act+"</div>"+
              '<div class="ad">Photograph the signed BOL to <b>orders@adchem.pro</b> and to '+(o.copyTo?"<b>"+esc(o.copyTo)+"</b>":'<span style="color:var(--amber)">— no receiver contact on file</span>')+"</div>"+
              '<div class="ad mono">'+(o.bolNo?"BOL "+esc(o.bolNo)+" · ":"")+esc(o.id)+"</div></div>"+
            "</div>";
        }).join("")+
        ((cod||dep)?'<div class="totals collect"><span>Expected at the dock — '+(cod?"COD "+money(cod):"")+(dep?(cod?" · ":"")+"deposits "+money(dep):"")+'</span><span class="mono">'+money(cod+dep)+"</span></div>":"")+
        flagsHtml(truckFlags(onRoute))+(truck?"":'<div class="placard ok">Set the truck on each order so the load check adds up the right vehicle.</div>')+
        (codList.length?'<div class="placard ok"><b>Close-out check:</b> a photographed BOL with an amount on it at orders@adchem.pro for each COD stop — '+codList.map(function(o){return esc(o.bolNo?("BOL "+o.bolNo):o.id)+" "+money(o.codAmount);}).join(" · ")+".</div>":"")+
      "</div>";
    });
    if(held.length) out+='<div class="card" style="margin-bottom:10px"><div class="held"><b>Held back — not on any route ('+held.length+')</b><br>'+
      held.map(function(o){return esc(o.customer)+" · "+esc(o.id)+" · "+(o.effCode==="H"?"H - Hold, do not deliver":"waiting on accounting@adchem.pro");}).join("<br>")+"</div></div>";
    out+="</div>";
  });
  host.innerHTML=out;
  host.querySelectorAll("[data-more]").forEach(function(b){
    b.onclick=function(){var m=$("more-"+b.getAttribute("data-more")); if(m){m.hidden=!m.hidden; b.textContent=m.hidden?"Details / Detalles":"Hide / Ocultar";}};
  });
  host.querySelectorAll("[data-bol2]").forEach(function(b){
    b.onclick=function(){var o=state.orders.find(function(x){return x.id===b.getAttribute("data-bol2");}); if(o){state.bolOrder=o;setTab("bol");}};
  });
  host.querySelectorAll("[data-pod]").forEach(function(b){
    b.onclick=function(){var o=state.orders.find(function(x){return x.id===b.getAttribute("data-pod");}); if(o) openPod(o);};
  });
  host.querySelectorAll("[data-note]").forEach(function(b){ b.onclick=function(){ addDriverNote(b.getAttribute("data-note")); }; });
  host.querySelectorAll("[data-capture]").forEach(function(b){
    b.onclick=function(){ var o=state.orders.find(function(x){return x.id===b.getAttribute("data-capture");}); if(o) openCapture(o,siteOf(o)); }; });
  todayExtras(siteKeys);
  updatePodQueueNote();
}
function updateCounts(){
  $("cntOpen").textContent=state.orders.filter(function(o){return ["Paid","Cancelled","Invoiced"].indexOf(o.status)<0;}).length;
  var t=ymd(new Date());
  $("cntToday").textContent=state.orders.filter(function(o){return o.date===t&&o.status!=="Cancelled";}).length;
  var gaps=0;
  if(!state.settings.calendarConfirmed) gaps++;
  else state.hubs.forEach(function(h){ if(!calFor(h.code).id) gaps++; });
  if(!driveFolderId(state.settings.driveFolder)) gaps++;
  if(!Number(state.settings.nextBol)) gaps++;
  if(state.canEdit && !feedReady()) gaps++;
  state.hubs.forEach(function(h){if(!h.street&&!h.city) gaps++; if(!h.emerg) gaps++;});
  $("cntSetup").textContent=gaps; $("cntSetup").style.display=gaps?"":"none";
}

/* ============================================================
   Setup
   ============================================================ */
function renderOrdersOutState(){ var el=$("ordersOutState"); if(!el) return; $("sOrdersOut").value=state.settings.ordersOutSheetId||""; el.innerHTML=state.settings.ordersOutSheetId?'<div class="banner good" style="margin:0"><div><b>Orders Out is set.</b><div>Every scheduled, numbered and delivered order is written to it as it changes; Rebuild rewrites the whole sheet from the database.</div></div></div>':'<div class="banner warn" style="margin:0"><div><b>No Orders Out sheet yet.</b><div>Paste the link to the company\'s <i>Dispatch Orders Out</i> sheet. Until then nothing is reported back to the AR Command Center.</div></div></div>'; }
function renderCustomersOutState(){ var el=$("customersOutState"); if(!el) return; $("sCustomersOut").value=state.settings.customersOutSheetId||""; el.innerHTML=state.settings.customersOutSheetId?'<div class="banner good" style="margin:0"><div><b>Customers Out is set.</b><div>Each customer\'s rows are rewritten whenever the customer, a site or a contact is saved; Rebuild rewrites the whole tab from the database.</div></div></div>':'<div class="banner warn" style="margin:0"><div><b>No Customers Out sheet yet.</b><div>Paste the link to the company\'s <i>Customers Out</i> sheet. Until then the AR Command Center keeps reading its own directory.</div></div></div>'; }
function renderSetup(){renderShareState();renderFeedState();renderOrdersOutState();renderCustomersOutState();renderImportCard();renderBolNumState();renderCalState();renderDriveState();renderHubEditor();renderSegTable();renderHealth();}
function renderBolNumState(){
  var n=Number(state.settings.nextBol)||0, used=maxBolUsed();
  $("sNextBol").value=n||"";
  $("bolNumState").innerHTML=n
    ? '<div class="banner good" style="margin:0"><div><b>Next BOL number: '+nextBolPreview()+'</b><div>'+(used?"Highest issued by this app: "+used+".":"None issued by this app yet.")+'</div></div></div>'
    : '<div class="banner warn" style="margin:0"><div><b>No starting number</b><div>Orders can be taken, but none gets a BOL number until this is set. Set it on the day SmartBOL stops.</div></div></div>';
}
/* Delivery calendars: a default, and optionally one per hub (settings.hubCalendars[code] = {id,name}). */
function calFor(hub){
  var hc=(state.settings.hubCalendars||{})[hub];
  if(hc&&hc.id) return {id:hc.id,name:hc.name||hc.id,own:true};
  return {id:state.settings.calendarId||"",name:state.settings.calendarName||state.settings.calendarId||"",own:false};
}
function calReady(hub){ return !!state.settings.calendarConfirmed && !!calFor(hub).id; }
function calAnySet(){ return !!state.settings.calendarId || state.hubs.some(function(h){return !!calFor(h.code).id;}); }
function calNameOf(id){ var c=state.calendars.find(function(x){return x.id===id;}); return c?(c.summary||c.id):""; }
function calOptions(chosen,firstLabel,name){
  var known=state.calendars.some(function(c){return c.id===chosen;});
  return '<option value="">'+esc(firstLabel)+'</option>'+
    state.calendars.map(function(c){return '<option value="'+esc(c.id)+'"'+(c.id===chosen?" selected":"")+">"+esc(c.summary||c.id)+"</option>";}).join("")+
    (chosen&&!known?'<option value="'+esc(chosen)+'" selected>'+(name&&name!==chosen?esc(name):"Pasted ID — "+esc(chosen.length>40?chosen.slice(0,37)+"…":chosen))+"</option>":"");
}
function renderCalState(){
  var host=$("calState"); if(!host) return;
  var rows=state.hubs.map(function(h){var c=calFor(h.code); return '<div><b>'+esc(h.code)+'</b> → '+(c.id?esc(c.name)+(c.own?"":' <span class="hint">(default)</span>'):'<span style="color:var(--bad)">no calendar</span>')+"</div>";}).join("");
  var missing=state.hubs.filter(function(h){return !calFor(h.code).id;}).map(function(h){return h.code;});
  if(!calAnySet()) host.innerHTML='<div class="banner warn" style="margin:0"><div><b>No calendar chosen yet</b><div>Pick a default, a calendar for each hub, or both, then <b>Check and confirm</b>. Nothing is written to any calendar until you do.</div></div></div>';
  else if(!state.settings.calendarConfirmed) host.innerHTML='<div class="banner warn" style="margin:0"><div><b>Not confirmed</b><div>'+rows+'<div style="margin-top:4px">Check and confirm before creating events.</div></div></div></div>';
  else host.innerHTML='<div class="banner '+(missing.length?"warn":"good")+'" style="margin:0"><div><b>Writing deliveries to</b><div>'+rows+(missing.length?'<div style="margin-top:4px">'+esc(missing.join(", "))+' has no calendar: its orders save but get no event. Set a default or a calendar for it.</div>':"")+"</div></div></div>";
  renderHubCalRows();
}
function renderHubCalRows(){
  var host=$("hubCalRows"); if(!host) return;
  var hc=state.settings.hubCalendars||{};
  host.innerHTML=state.hubs.map(function(h){
    var cur=(hc[h.code]&&hc[h.code].id)||"";
    return '<label class="f">'+esc(h.code)+" — "+esc(h.name||"")+
      '<select data-hubcal="'+esc(h.code)+'">'+calOptions(cur,"Same as default",hc[h.code]&&hc[h.code].name)+"</select>"+
      '<input data-hubcalid="'+esc(h.code)+'" class="mono" placeholder="or paste a calendar ID" autocomplete="off" spellcheck="false"></label>';
  }).join("");
  host.querySelectorAll("[data-hubcal]").forEach(function(sel){ sel.onchange=function(){ setHubCal(sel.getAttribute("data-hubcal"),sel.value); }; });
  host.querySelectorAll("[data-hubcalid]").forEach(function(inp){ inp.onchange=function(){ var v=inp.value.trim(); if(v) setHubCal(inp.getAttribute("data-hubcalid"),v); }; });
}
function setHubCal(code,id){
  var hc=Object.assign({},state.settings.hubCalendars||{});
  if(id) hc[code]={id:id,name:calNameOf(id)||id}; else delete hc[code];
  state.settings.hubCalendars=hc; state.settings.calendarConfirmed=false;
  saveSettings(); renderCalState(); updateCounts();
}
function setDefaultCal(id){
  state.settings.calendarId=id; state.settings.calendarName=calNameOf(id)||id; state.settings.calendarConfirmed=false;
  var c=state.calendars.find(function(x){return x.id===id;});
  if(c&&c.timeZone){var op=Array.prototype.find.call($("sTz").options,function(o){return o.value===c.timeZone;}); if(op){$("sTz").value=c.timeZone;state.settings.tz=c.timeZone;}}
  saveSettings(); renderCalState(); updateCounts();
}
async function confirmCalendars(){
  var hc=state.settings.hubCalendars||{};
  var ids=[]; if(state.settings.calendarId) ids.push(state.settings.calendarId);
  state.hubs.forEach(function(h){ if(hc[h.code]&&hc[h.code].id&&ids.indexOf(hc[h.code].id)<0) ids.push(hc[h.code].id); });
  if(!ids.length){banner("warn","Pick a calendar first","<div>Set a default calendar or one for each hub.</div>");return;}
  var btn=$("btnConfirmCal"); btn.disabled=true;
  try{
    var r=await API.post("/api/calendar",{action:"check",ids:ids});
    var bad=(r.results||[]).filter(function(x){return !x.ok;});
    if(bad.length){
      banner("bad","Not confirmed — the server can't write to "+(bad.length===1?"this calendar":"these calendars"),"<div>"+bad.map(function(x){return '<div class="mono" style="font-size:11px;word-break:break-all">'+esc(x.id)+"</div><div>"+esc(x.error||("Access is "+(x.accessRole||"none")+"."))+"</div>";}).join("")+'<div style="margin-top:4px">Share each one to orders@ as <b>Make changes to events</b>, then check again.</div></div>');
      return;
    }
    var names={}; (r.results||[]).forEach(function(x){names[x.id]=x.summary||x.id;});
    if(state.settings.calendarId) state.settings.calendarName=names[state.settings.calendarId]||state.settings.calendarName;
    Object.keys(hc).forEach(function(k){ if(hc[k]&&names[hc[k].id]) hc[k].name=names[hc[k].id]; });
    state.settings.hubCalendars=hc; state.settings.calendarConfirmed=true;
    if(state.settings.calendarId) $("sCalendar").innerHTML=calOptions(state.settings.calendarId,"— none (hubs use their own) —",state.settings.calendarName);
    saveSettings(); renderCalState(); updateCounts(); setConn("ok","Calendars set"); clearBanner("calc");
    banner("good","Calendars confirmed","<div>"+state.hubs.map(function(h){var c=calFor(h.code); return esc(h.code)+" → <b>"+esc(c.id?c.name:"no calendar")+"</b>";}).join("<br>")+"</div>",{autoclose:9000});
  }catch(err){ banner("bad","Couldn't check the calendars","<div>"+esc(err.message||"")+"</div>"); }
  finally{ btn.disabled=false; }
}
function driveFolderId(raw){
  var s=String(raw||"").trim(); if(!s) return "";
  var m=s.match(/\/folders\/([A-Za-z0-9_-]+)/)||s.match(/[?&]id=([A-Za-z0-9_-]+)/); if(m) return m[1];
  return /^[A-Za-z0-9_-]{10,}$/.test(s)?s:"";
}
function renderDriveState(){
  var host=$("driveState"), id=driveFolderId(state.settings.driveFolder);
  if(!id) host.innerHTML='<div class="banner warn" style="margin:0"><div><b>No shared folder set</b><div>BOLs save in the app only.</div></div></div>';
  else host.innerHTML='<div class="banner good" style="margin:0"><div><b>Writing BOLs to folder</b><div class="mono" style="font-size:11px;word-break:break-all">'+esc(id)+'</div><div>'+(state.settings.driveAuto==="off"?"Manual — press Save to Drive on a BOL.":"Automatic when an order is scheduled.")+'</div></div></div>';
  $("sDriveFolder").value=state.settings.driveFolder||""; $("sDriveFormat").value=state.settings.driveFormat||"html"; $("sDriveAuto").value=state.settings.driveAuto||"on";
}
function renderHubEditor(){
  $("hubEditor").innerHTML=state.hubs.map(function(h,i){
    var incomplete=(!h.street&&!h.city)||!h.emerg;
    return '<div class="card pad" style="box-shadow:none;margin-bottom:10px;'+(incomplete?"border-color:var(--amber)":"")+'">'+
      '<div style="display:flex;gap:8px;align-items:center;margin-bottom:9px;flex-wrap:wrap"><span class="chip st">'+esc(h.code)+"</span><b>"+esc(h.name)+"</b>"+
        (h.settled?"":'<span class="chip warn">code provisional</span>')+(incomplete?'<span class="chip warn">incomplete</span>':"")+
        '<button class="btn sm danger" data-delhub="'+i+'" style="margin-left:auto">Remove</button></div>'+
      '<div class="grid two"><label class="f">Hub name<input data-h="'+i+'" data-k="name" value="'+esc(h.name)+'"></label>'+
        '<label class="f">Code<input data-h="'+i+'" data-k="code" class="mono" value="'+esc(h.code)+'" maxlength="4"></label>'+
        '<label class="f spanall">Street<input data-h="'+i+'" data-k="street" class="'+(h.street?"":"miss")+'" value="'+esc(h.street)+'" placeholder="Prints as the shipper address on every BOL"></label></div>'+
      '<div class="grid three" style="margin-top:11px"><label class="f">City<input data-h="'+i+'" data-k="city" class="'+(h.city?"":"miss")+'" value="'+esc(h.city)+'"></label>'+
        '<label class="f">State<input data-h="'+i+'" data-k="state" value="'+esc(h.state)+'" maxlength="2"></label>'+
        '<label class="f">ZIP<input data-h="'+i+'" data-k="zip" class="mono" value="'+esc(h.zip)+'"></label>'+
        '<label class="f">Hub phone<input data-h="'+i+'" data-k="phone" value="'+esc(h.phone)+'"></label>'+
        '<label class="f span2">24-hr emergency response number<input data-h="'+i+'" data-k="emerg" class="'+(h.emerg?"":"miss")+'" value="'+esc(h.emerg)+'"></label>'+
        '<label class="f">Local time<select data-h="'+i+'" data-k="tz">'+TZS.map(function(z){return '<option value="'+z[0]+'"'+((h.tz||"")===z[0]?" selected":"")+">"+esc(z[1])+"</option>";}).join("")+'</select></label></div>'+
      hubProductsHtml(h,i)+'</div>';
  }).join("");
  $("hubEditor").querySelectorAll("[data-h]").forEach(function(inp){
    inp.disabled=!state.canEdit;
    inp.oninput=inp.onchange=function(){var i=Number(inp.getAttribute("data-h")),k=inp.getAttribute("data-k"); state.hubs[i][k]=inp.value; if(k==="street"||k==="city"||k==="emerg") inp.classList.toggle("miss",!inp.value);};
  });
  $("hubEditor").querySelectorAll("[data-hlimit]").forEach(function(r){
    r.disabled=!state.canEdit;
    r.onchange=function(){ var i=Number(r.getAttribute("data-hlimit")); state.hubs[i].products=r.value==="some"?(Array.isArray(state.hubs[i].products)?state.hubs[i].products:[]):null; renderHubEditor(); };
  });
  $("hubEditor").querySelectorAll("[data-hp]").forEach(function(cb){
    cb.disabled=!state.canEdit;
    cb.onchange=function(){ var i=Number(cb.getAttribute("data-hp")), h=state.hubs[i], list=Array.isArray(h.products)?h.products.slice():[];
      var n=cb.value, at=list.indexOf(n); if(cb.checked&&at<0) list.push(n); if(!cb.checked&&at>=0) list.splice(at,1); h.products=list;
      var c=$("hubEditor").querySelector('[data-hpcount="'+i+'"]'); if(c) c.textContent=list.length+" of "+PRODUCTS.length+" offered"; };
  });
  $("hubEditor").querySelectorAll("[data-delhub]").forEach(function(b){
    b.disabled=!state.canEdit;
    b.onclick=function(){var i=Number(b.getAttribute("data-delhub")); if(state.hubs.length<=1) return; state.hubs.splice(i,1); saveHubs(); fillHubSelects(); renderHubEditor(); renderCalState(); updateCounts();};
  });
}
const TZS=[["","Company time zone"],["America/Los_Angeles","Pacific"],["America/Denver","Mountain"],["America/Chicago","Central"],["America/New_York","Eastern"]];
function hubProductsHtml(h,i){
  var some=Array.isArray(h.products), list=some?h.products:[];
  var head='<div class="hprod" style="margin-top:11px"><div class="hint" style="font-weight:700;margin-bottom:6px">Products this hub offers</div><div class="opts">'+
    '<label><input type="radio" name="hlim'+i+'" data-hlimit="'+i+'" value="all"'+(some?"":" checked")+'>Every product</label>'+
    '<label><input type="radio" name="hlim'+i+'" data-hlimit="'+i+'" value="some"'+(some?" checked":"")+'>Only the ones ticked</label></div>';
  if(!some) return head+"</div>";
  var body=cats().map(function(c){
    return '<div class="cat">'+esc(c)+'</div><div class="grid-p">'+
      PRODUCTS.filter(function(p){return p.cat===c;}).map(function(p){var k=prodKey(p.cat,p.name); return '<label><input type="checkbox" data-hp="'+i+'" value="'+esc(k)+'"'+(list.indexOf(k)>=0?" checked":"")+'>'+esc(p.name)+"</label>";}).join("")+"</div>";
  }).join("");
  return head+'<div class="hint" data-hpcount="'+i+'" style="margin-top:6px">'+list.length+" of "+PRODUCTS.length+' offered</div>'+body+'<div class="hint" style="margin-top:8px">Order entry refuses any other product for this hub. <b>Save hubs</b> to apply.</div></div>';
}
function renderShareState(){
  var lvl=state.isOwner?"Admin":state.canEdit?"Coordinator":"Driver";
  $("shareState").innerHTML='<div class="banner '+(state.canEdit?"good":"info")+'" style="margin:0"><div><b>You are: '+lvl+'</b><div>'+
    (state.isOwner?"You manage who has access on the People tab.":state.canEdit?"You can take and change orders. An admin manages access.":"You can see your hub's routes and send signed BOLs.")+"</div></div></div>";
}
/* Fill confirmed hub facts into hubs saved before they were known. */
function migrateHubs(){
  var changed=false;
  state.hubs.forEach(function(h){
    var d=DEFAULT_HUBS.find(function(x){return x.code===h.code;});
    if(d && d.street && !h.street && !h.city){h.street=d.street;h.city=d.city;h.state=d.state;h.zip=d.zip;changed=true;}
    if(!h.emerg){h.emerg=EMERGENCY;changed=true;}
  });
  if(changed && state.canEdit) saveHubs();
}

/* ============================================================
   Google Calendar
   ============================================================ */
async function loadCalendars(){
  if(!state.canEdit) return;
  try{
    var res=await API.get("/api/calendar");
    var cals=res.calendars||[];
    state.calendars=cals;
    $("sCalendar").innerHTML=calOptions(state.settings.calendarId||"",cals.length?"— none (hubs use their own) —":"No calendars on the list — paste an ID",state.settings.calendarName);
    if(state.settings.tz) $("sTz").value=state.settings.tz;
    setConn(state.settings.calendarConfirmed?"ok":"warn",state.settings.calendarConfirmed?"Calendars set":"Calendars not confirmed");
    renderCalState();
  }catch(err){
    $("sCalendar").innerHTML='<option value="">Unavailable</option>';
    setConn("bad","Calendar unavailable");
    banner("warn","Google Calendar isn't reachable","<div>"+esc(err.message||"")+" Orders still save — add the event later from the Orders tab. Check Setup → Google connection.</div>",{key:"cal"});
  }
}
function calPayload(o){
  var hrs=WINDOW_HOURS[o.window]||[8,12], hub=hubBy(o.hub), k=o.effCode;
  var title=(o.bolNo?"BOL "+o.bolNo+" · ":"")+o.customer+" · "+linesText(o)+(k==="COD"?"  [COD "+money(o.codAmount)+"]":k==="R"?"  [R]":"")+(o.deposit?" [+DEP]":"");
  var lines=[
    "<b>BOL:</b> "+(o.bolNo?esc(o.bolNo):"not yet numbered")+" · <b>Order ID:</b> "+esc(o.id)+(o.rev>1?" (rev "+o.rev+")":""),
    "<b>Customer:</b> "+esc(o.customer)+(o.siteLabel&&o.siteLabel!=="Primary"?" — "+esc(o.siteLabel):""),
    "<b>Delivery address:</b> "+esc(o.shipTo||"NOT ON FILE")+(o.addrState==="unconfirmed"?" (UNCONFIRMED)":""),
    "<b>Site contact:</b> "+esc([o.contact,o.contactPhone].filter(Boolean).join(" · ")||"none"),
    "<b>Payment code:</b> "+esc(k?CODES[k].text:"none"),
    "<b>COD:</b> "+(k==="COD"?"YES — "+money(o.codAmount):"NO"),
    o.deposit?"<b>Deposit due:</b> "+esc(o.deposit.item||"")+" "+money(o.deposit.amount):"",
    "<b>Products:</b><br>"+(o.lines||[]).filter(function(l){return l.product;}).map(function(l){var h=hazFor(l.product,l.container);
      return "&nbsp;&nbsp;"+esc(l.qty)+" × "+esc(l.container)+" "+esc(l.product)+" — "+(lineLb(l)?fmtLb(lineLb(l)):"weight not entered")+(h.s==="verified"?" — "+esc(h.un):"");}).join("<br>"),
    "<b>Placards:</b> "+esc(placardVerdict(loadSummary(o.lines),"order").name),
    o.copyTo?"<b>Receiver's copy to:</b> "+esc(o.copyTo):"",
    o.truck?"<b>Truck / driver:</b> "+esc(o.truck):"",
    "<b>Hub:</b> "+esc(hub?hub.name:o.hub),
    o.notes?"<b>Special instructions:</b> "+esc(o.notes):""
  ].filter(Boolean);
  return {summary:title,description:lines.join("<br>"),location:o.shipTo||"",
    startTime:o.date+"T"+pad(hrs[0])+":00:00",endTime:o.date+"T"+pad(hrs[1])+":00:00",timeZone:o.tz||state.settings.tz||"America/Los_Angeles"};
}
async function pushToCalendar(o,isRetry){
  function offerCopy(title,body){
    var b=banner("warn",title,"<div>"+body+' <button class="lnk" data-copyfail="1">Copy the details to paste in by hand</button></div>');
    var cb=b.querySelector("[data-copyfail]"); if(cb) cb.onclick=function(){copyDetails(o);};
  }
  if(!schedulable(o)) return false;
  if(!calReady(o.hub)){
    offerCopy("No confirmed calendar for "+(o.hub||"this hub"),'Order <span class="mono">'+esc(o.id)+'</span> is saved, but nothing was written to a calendar. Set and confirm the delivery calendars on the <b>Setup</b> tab.'); return false;
  }
  var p=calPayload(o);
  try{
    var pl=await API.post("/api/calendar",{hub:o.hub||"",summary:p.summary,description:p.description,location:p.location,start:p.startTime,end:p.endTime,timeZone:p.timeZone});
    o.eventId=pl.eventId||"created"; o.eventLink=pl.htmlLink||""; o.eventCal=pl.calendarId||"";
    if(o.status==="Intake"||o.status==="Confirmed"||o.status==="Awaiting accounting") o.status="Scheduled";
    saveOrder(o);
    if(isRetry){renderOrders();updateCounts();}
    return true;
  }catch(err){
    var b=banner("bad","Calendar event not created",'<div>Order <span class="mono">'+esc(o.id)+"</span> is saved. "+esc(err.message||"")+' <button class="lnk" data-copyfail="1">Copy the details to paste in by hand</button></div>');
    var cb=b.querySelector("[data-copyfail]"); if(cb) cb.onclick=function(){copyDetails(o);};
    if(isRetry) renderOrders();
    return false;
  }
}
async function updateCalendarEvent(o){
  if(!o.eventId||!calReady(o.hub)) return false;
  if(o.eventId==="created"){
    var b0=banner("warn","Calendar event can't be updated automatically",'<div>This order\'s event was created before the app kept event IDs, so fix it by hand. <button class="lnk" data-copyfail="1">Copy the new details</button></div>');
    var c0=b0.querySelector("[data-copyfail]"); if(c0) c0.onclick=function(){copyDetails(o);};
    return false;
  }
  var p=calPayload(o);
  if(o.effCode==="H") p.summary="ON HOLD — DO NOT DELIVER · "+p.summary;
  try{
    var pl=await API.post("/api/calendar",{hub:o.hub||"",eventId:o.eventId,eventCal:o.eventCal||"",summary:p.summary,description:p.description,location:p.location,start:p.startTime,end:p.endTime,timeZone:p.timeZone});
    if(pl&&pl.calendarId&&pl.calendarId!==o.eventCal){ o.eventCal=pl.calendarId; if(pl.eventId) o.eventId=pl.eventId; o.eventLink=pl.htmlLink||o.eventLink||""; try{ await saveOrder(o); }catch(e){} }
    return true;
  }catch(err){
    var b=banner("bad","Calendar event not updated",'<div>The order is saved, but the calendar still shows the old details. '+esc(err.message||"")+' <button class="lnk" data-copyfail="1">Copy the new details to fix it by hand</button></div>');
    var cb=b.querySelector("[data-copyfail]"); if(cb) cb.onclick=function(){copyDetails(o);};
    return false;
  }
}

/* ============================================================
   Create / edit
   ============================================================ */
function validate(o){
  if(!o.customer){ $("fCustomer").focus(); return "Enter the customer."; }
  if(!o.code){ return "The payment code hasn't been read. Pick the code from the sheet."; }
  if(!(o.lines||[]).some(function(l){return l.product&&Number(l.qty)>0;})) return "Add at least one product line.";
  for(var i=0;i<(o.lines||[]).length;i++){
    var l=o.lines[i]; if(!l.product) continue;
    if(!hubAllows(o.hub,l.category,l.product)) return "Line "+(i+1)+" — "+l.product+" is not offered from "+hubLabel(o.hub)+". Change the hub or the product; the order is not saved. (Setup → Hubs sets what each hub offers.)";
    if(hazFor(l.product,l.container).s==="blocked") return "Line "+(i+1)+" — "+l.product+" has no verified hazmat data on file (Product Hazmat Reference v1.1 §11.4) and cannot be offered for transport. Remove the line; the order is not saved.";
  }
  if(o.effCode==="COD" && !(o.codAmount>0)){ $("fCod").focus(); return "This is a COD order — enter the amount due."; }
  if(o.deposit && !(o.deposit.amount>0)){ $("fDepAmt").focus(); return "Enter the deposit amount."; }
  if(o.code==="CHECK" && ($("fClearBy").value && !$("fClearCode").value)) return "Pick the code accounting gave, or clear 'Cleared by'.";
  return "";
}
function finalize(o){ delete o.draft; o.addrChanged=!!o.addrChanged; return o; }
/* The Orders In return flow: tell the server to write these orders to the company's Dispatch Orders Out sheet. Best effort. */
function reportOrdersOut(ids){
  if(!state.canEdit||!state.settings.ordersOutSheetId) return Promise.resolve();
  return API.post("/api/orderlog",{orderIds:ids}).then(function(r){ state.lastOrdersOut=new Date(); return r; }).catch(function(e){ banner("warn","Orders Out not updated","<div>"+esc(e.message)+" The order is saved; press <b>Rebuild Orders Out</b> on Setup when the sheet is reachable.</div>",{autoclose:12000,key:"oo"}); });
}
async function afterSave(o,isNew){
  /* Decide the order's state from its effective code. */
  var notes=[];
  if(o.effCode==="H"){
    o.status="On Hold"; saveOrder(o);
    if(o.eventId) await updateCalendarEvent(o);
    banner("bad","Hold — not scheduled",'<div>Order <span class="mono">'+esc(o.id)+"</span> is recorded <b>on hold</b>. No BOL number, no calendar event, and it must not reach a route.</div>");
    return;
  }
  if(o.code==="CHECK" && o.effCode==="CHECK"){
    o.status="Awaiting accounting"; saveOrder(o);
    banner("warn","Waiting on accounting",'<div>Order <span class="mono">'+esc(o.id)+'</span> is saved but <b>not scheduled</b>. Clear it with <b>'+esc(ACCOUNTING_TO)+'</b>, then open it from the Orders tab and record who cleared it and the code they gave.</div>',{sticky:false});
    return;
  }
  if(o.siteKey && o.copyTo && isEmail(o.copyTo)) DB.saveSiteCopyTo(o.siteKey,o.copyTo).catch(function(){});
  var gotBol=await assignBolNo(o);
  if(!gotBol) notes.push("No BOL number — set the starting number on Setup.");
  if(o.status==="Intake"||o.status==="Awaiting accounting"||o.status==="On Hold") o.status="Confirmed";
  saveOrder(o);
  var calOk=false;
  if(o.eventId && o.eventId!=="created") calOk=await updateCalendarEvent(o);
  else if(!o.eventId) calOk=await pushToCalendar(o,false);
  if(calOk) notes.push(isNew?"Calendar event created.":"Calendar event updated.");
  if(state.settings.driveAuto!=="off" && driveFolderId(state.settings.driveFolder)){
    $("btnSubmit").textContent="Saving BOL to Drive…";
    var dOk=await saveBolToDrive(o,{quiet:true}); if(dOk) notes.push("BOL saved to Drive.");
  }
  reportOrdersOut([o.id]);
  var b=banner("good",(isNew?"Order created":"Order updated — rev "+o.rev)+(o.bolNo?" · BOL "+o.bolNo:""),
    '<div><span class="mono">'+esc(o.id)+"</span> — "+esc(o.customer)+", "+esc(linesText(o))+" on "+esc(o.date)+". "+esc(notes.join(" "))+' <button class="lnk" data-bolnow="1">See the BOL</button></div>',{autoclose:20000});
  var bb=b.querySelector("[data-bolnow]"); if(bb) bb.onclick=function(){state.bolOrder=o;setTab("bol");};
}
async function submitOrder(ev){
  ev.preventDefault();
  if(state.busy) return;
  if(!state.canEdit){ banner("warn","View only","<div>Your access is view-only.</div>",{autoclose:6000}); return; }
  if(state.editing){ await saveEdit(); return; }
  var o=draftOrderFromForm(), err=validate(o);
  if(err){ banner("warn","Not saved yet","<div>"+esc(err)+"</div>",{autoclose:9000,key:"val"}); return; }
  if(state.orders.some(function(x){return x.id===o.id;})){ banner("bad","That Order ID is already used","<div>Change the override, or clear it to take the next number.</div>"); return; }
  finalize(o); o.rev=1; o.createdAt=new Date().toISOString(); o.createdBy=state.session?state.session.user.id:"";
  state.busy=true; $("btnSubmit").disabled=true; $("btnSubmit").textContent="Creating…";
  saveOrder(o);
  try{ await afterSave(o,true); }
  finally{ state.busy=false; $("btnSubmit").disabled=false; $("btnSubmit").textContent="Create order"; }
  resetForm(true); updateCounts(); refreshId();
}
function startEdit(o){
  if(!state.canEdit){ banner("warn","View only","<div>Your access to this page is view-only.</div>",{autoclose:7000}); return; }
  normalizeOrder(o);
  state.editing=o.id; state.form.suppress=true;
  $("fCustomer").value=o.customer||"";
  onCustomerInput(true);
  if(o.siteKey && !$("siteWrap").hidden) $("fSite").value=o.siteKey;
  onCustomerInput(true);
  var r=currentSiteRow(); state.form.feedAddr=r?r.addr:(o.feedAddr||""); state.form.feedUnconfirmed=r?r.unconfirmed:(o.addrState==="unconfirmed");
  $("fShipTo").value=o.shipTo||""; $("fContact").value=o.contact||""; $("fContactPhone").value=o.contactPhone||""; $("fCopyTo").value=o.copyTo||"";
  $("fAddrConfirm").checked=(o.addrState==="confirmedNow");
  state.form.lines=(o.lines||[]).map(function(l){return Object.assign({},l);}); renderLines();
  $("fHub").value=o.hub||$("fHub").value; $("fDate").value=o.date||ymd(new Date()); $("fWindow").value=o.window||WINDOWS[1];
  $("fTruck").value=o.truck||""; $("fPo").value=o.po||""; $("fNotes").value=o.notes||"";
  if(o.codeSrc==="manual"||o.codeSrc==="legacy") $("fManualCode").value=o.code||"";
  $("fClearBy").value=(o.checkClear&&o.checkClear.by)||""; $("fClearCode").value=(o.checkClear&&o.checkClear.code)||""; $("fClearNote").value=(o.checkClear&&o.checkClear.note)||"";
  $("fCod").value=o.codAmount||"";
  $("fDep").checked=!!o.deposit; $("depWrap").hidden=!o.deposit;
  if(o.deposit){ $("fDepItem").value=o.deposit.item||DEPOSITS[0].item; $("fDepAmt").value=o.deposit.amount||""; }
  $("fIdOverride").value=o.id; $("fIdOverride").disabled=true; $("btnIdAuto").disabled=true;
  $("editId").textContent=(o.bolNo?"BOL "+o.bolNo+" · ":"")+o.id; $("editBanner").hidden=false;
  $("btnSubmit").textContent="Save changes";
  state.form.suppress=false;
  refreshAddr(); refreshCode(); refreshId(); renderLive();
  var c=currentCode();
  if(c.src==="sheet" && o.code && c.code!==o.code && o.codeSrc!=="legacy")
    banner("info","The sheet's code has changed",'<div>This order was taken as <b>'+esc(CODES[o.code].text)+'</b>; the sheet now says <b>'+esc(CODES[c.code].text)+'</b>. Saving uses the sheet.</div>',{autoclose:15000});
  setTab("new"); window.scrollTo({top:0,behavior:"smooth"});
}
function cancelEdit(){
  state.editing=null;
  $("fIdOverride").disabled=false; $("btnIdAuto").disabled=false; $("fIdOverride").value="";
  $("editBanner").hidden=true; $("btnSubmit").textContent="Create order";
  resetForm(true);
}
async function saveEdit(){
  var old=state.orders.find(function(x){return x.id===state.editing;});
  if(!old){ cancelEdit(); return; }
  var d=draftOrderFromForm(), err=validate(d);
  if(err){ banner("warn","Not saved yet","<div>"+esc(err)+"</div>",{autoclose:9000,key:"val"}); return; }
  finalize(d);
  if(d.checkClear && !(old.checkClear&&old.checkClear.by===d.checkClear.by&&old.checkClear.code===d.checkClear.code)){ d.checkClear.at=new Date().toISOString(); }
  else if(d.checkClear && old.checkClear) d.checkClear.at=old.checkClear.at;
  var o=Object.assign({},old,d,{id:old.id,bolNo:old.bolNo||null,status:old.status,createdAt:old.createdAt,eventId:old.eventId||"",eventLink:old.eventLink||"",
    driveId:old.driveId||"",driveLink:old.driveLink||"",rev:(old.rev||1)+1,updatedAt:new Date().toISOString()});
  state.busy=true; $("btnSubmit").disabled=true; $("btnSubmit").textContent="Saving…";
  saveOrder(o);
  try{ await afterSave(o,false); }
  finally{ state.busy=false; $("btnSubmit").disabled=false; }
  cancelEdit(); updateCounts(); refreshId();
}
function resetForm(keep){
  ["fCustomer","fShipTo","fContact","fContactPhone","fCopyTo","fNotes","fCod","fDepAmt","fTruck","fPo","fClearNote"].forEach(function(k){$(k).value="";});
  if(!state.editing) $("fIdOverride").value="";
  $("fClearBy").value=""; $("fClearCode").value=""; $("fManualCode").value=""; $("fAddrConfirm").checked=false;
  $("fDep").checked=false; $("depWrap").hidden=true;
  state.form.lines=[blankLine()]; state.form.feedAddr=""; state.form.feedUnconfirmed=false;
  if(!keep) $("fDate").value=ymd(new Date());
  onCustomerInput(true); renderLines(); refreshId(); renderLive();
}

/* ============================================================
   Drive, copy details, download
   ============================================================ */
function standaloneDoc(o){
  return "<!doctype html><html><head><meta charset=\"utf-8\"><title>BOL "+esc(o.bolNo||o.id)+"</title><style>body{margin:24px}@media print{body{margin:0}.bol{padding:0}}"+BOL_CSS+"</style></head><body><div class=\"bol\">"+
    bolHtml(Object.assign({},o,{draft:false}))+"</div></body></html>";
}
async function saveBolToDrive(o,opts){
  opts=opts||{};
  var folder=driveFolderId(state.settings.driveFolder);
  if(!folder){ if(!opts.quiet) banner("warn","No Drive folder set","<div>Paste the shared folder link on the <b>Setup</b> tab first.</div>"); return false; }
  try{
    var p=await API.post("/api/drive",{title:"BOL-"+(o.bolNo||o.id)+" "+o.id+(o.rev>1?" rev"+o.rev:"")+" "+o.customer, html:standaloneDoc(o)});
    o.driveId=p.id||"saved"; o.driveLink=p.webViewLink||""; await saveOrder(o);
    if(!opts.quiet) banner("good","BOL saved to Drive",'<div><span class="mono">BOL-'+esc(o.bolNo||o.id)+"</span> is in the shared folder"+(o.driveLink?' — <a href="'+esc(o.driveLink)+'" target="_blank" rel="noopener">open it</a>':"")+".</div>",{autoclose:9000});
    return true;
  }catch(err){
    var b=banner("bad","BOL not saved to Drive",'<div>Order <span class="mono">'+esc(o.id)+'</span> and its BOL are saved in the app. '+esc(err.message||"")+' <button class="lnk" data-driveretry="1">Try again</button></div>');
    var rb=b.querySelector("[data-driveretry]"); if(rb) rb.onclick=function(){saveBolToDrive(o);};
    return false;
  }
}
function detailsText(o){
  var hub=hubBy(o.hub), hrs=WINDOW_HOURS[o.window]||[8,12], k=o.effCode, pv=placardVerdict(loadSummary(o.lines),"order");
  var L=[];
  L.push(o.customer+"  ·  "+(o.bolNo?"BOL "+o.bolNo+"  ·  ":"")+o.id+"  ·  "+o.date+" "+o.window);
  L.push("");
  L.push("CUSTOMER          "+o.customer+(o.siteLabel&&o.siteLabel!=="Primary"?" — "+o.siteLabel:""));
  L.push("DELIVERY ADDRESS  "+(o.shipTo||"NOT ON FILE")+(o.addrState==="unconfirmed"?"  (UNCONFIRMED)":""));
  L.push("DELIVERY CONTACT  "+([o.contact,o.contactPhone].filter(Boolean).join("  ·  ")||"NOT PROVIDED"));
  L.push("COD               "+(k==="COD"?"YES — collect "+money(o.codAmount)+" before unloading":"NO"));
  if(o.deposit) L.push("DEPOSIT DUE       "+(o.deposit.item||"")+" "+money(o.deposit.amount));
  L.push("PAYMENT CODE      "+(k?CODES[k].text:"none"));
  L.push("BOL #             "+(o.bolNo||"not yet numbered")+"   (Order ID "+o.id+")");
  (o.lines||[]).filter(function(l){return l.product;}).forEach(function(l,i){
    var h=hazFor(l.product,l.container);
    L.push("");
    L.push("LINE "+(i+1)+"            "+l.product);
    L.push("  QUANTITY        "+l.qty);
    L.push("  SIZE            "+(l.container&&l.container!=="—"?l.container:"NOT SPECIFIED"));
    L.push("  WEIGHT          "+(lineLb(l)?fmtLb(lineLb(l))+(l.unitDef?" (default unit weight — confirm)":""):"NOT ENTERED"));
    L.push("  UN #            "+(h.s==="verified"?h.un+"  ("+h.psn+", Class "+h.cls+")":h.s==="exempt"?"None by highway — dry ice is not DOT-regulated by highway":h.s==="suspect"?"UNRESOLVED — do not enter a number":h.s==="blocked"?"NONE ON FILE — DO NOT LOAD":"Not in the AdChem hazmat reference — check the SDS"));
  });
  L.push("");
  L.push("PLACARDS          "+pv.name);
  L.push("                  "+pv.text);
  L.push("");
  if(o.copyTo) L.push("Receiver's copy   "+o.copyTo);
  if(o.truck) L.push("Truck / driver    "+o.truck);
  L.push("Hub               "+(hub?hub.name:o.hub)+" ("+o.hub+")");
  L.push("Emergency         "+((hub&&hub.emerg)?hub.emerg:"NOT ON FILE"));
  if(o.notes) L.push("Instructions      "+o.notes);
  L.push("Window "+pad(hrs[0])+":00–"+pad(hrs[1])+":00 "+(o.tz||"America/Los_Angeles")+"  ·  Status "+(o.status||"Intake")+(o.eventId?"  ·  on the calendar":"  ·  NOT on a calendar"));
  return L.join("\n");
}
async function copyDetails(o){
  var txt=detailsText(o), ok=false;
  try{ if(navigator.clipboard&&navigator.clipboard.writeText){ await navigator.clipboard.writeText(txt); ok=true; } }catch(e){}
  if(!ok){ try{ var ta=document.createElement("textarea"); ta.value=txt; ta.setAttribute("readonly",""); ta.style.position="fixed"; ta.style.top="-1000px"; document.body.appendChild(ta); ta.select(); ok=document.execCommand("copy"); document.body.removeChild(ta);}catch(e){} }
  if(ok){ banner("good","Copied","<div>Delivery details for <span class=\"mono\">"+esc(o.bolNo||o.id)+"</span> are on the clipboard.</div>",{autoclose:6000}); return; }
  var b=banner("info","Copy this by hand",'<div>The clipboard is blocked in this view. Select all of the text below and copy it.</div><textarea readonly id="copyFallback" style="margin-top:8px;min-height:240px;font-family:\'IBM Plex Mono\',monospace;font-size:12px"></textarea>',{sticky:true,key:"copy"});
  var t=b.querySelector("#copyFallback"); if(t){ t.value=txt; t.focus(); t.select(); }
}
async function downloadBol(){
  var o=state.bolOrder||draftOrderFromForm();
  var blob=new Blob([standaloneDoc(o)],{type:"text/html"});
  var a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download="BOL-"+(o.bolNo||o.id)+".html"; document.body.appendChild(a); a.click(); setTimeout(function(){URL.revokeObjectURL(a.href);a.remove();},2000);
}

/* ============================================================
   Access, refresh, boot
   ============================================================ */
function clearBanner(k){var el=document.querySelector('[data-bkey="'+k+'"]'); if(el) el.remove();}
function setConn(kind,text){$("connDot").className="dot"+(kind?" "+kind:"");$("connTxt").textContent=text;}
function wire(){
  ["new","bol","open","today","setup","mydocs"].forEach(function(k){ $("tab-"+k).onclick=function(){ if(k==="bol") state.bolOrder=null; setTab(k); }; });
  wireCustomers(); wireImport(); wireDocuments();
  $("fHub").onchange=function(){refreshId();renderLines();scheduleLive();};
  $("fDate").onchange=function(){refreshId();scheduleLive();};
  $("fIdOverride").oninput=function(){refreshId();scheduleLive();};
  $("btnIdAuto").onclick=function(){$("fIdOverride").value="";refreshId();scheduleLive();};
  $("fCustomer").oninput=function(){onCustomerInput(false);scheduleLive();};
  $("fSite").onchange=function(){applySite();refreshAddr();refreshCode();scheduleLive();};
  $("fShipTo").oninput=function(){refreshAddr();scheduleLive();};
  $("fAddrConfirm").onchange=function(){refreshAddr();scheduleLive();};
  ["fManualCode","fClearBy","fClearCode"].forEach(function(k){$(k).onchange=function(){refreshCode();scheduleLive();};});
  $("fDep").onchange=function(){ $("depWrap").hidden=!$("fDep").checked; if($("fDep").checked&&!$("fDepAmt").value){var d=DEPOSITS.find(function(x){return x.item===$("fDepItem").value;}); if(d&&d.amt) $("fDepAmt").value=d.amt;} scheduleLive(); };
  $("fDepItem").onchange=function(){var d=DEPOSITS.find(function(x){return x.item===$("fDepItem").value;}); $("fDepAmt").value=d&&d.amt?d.amt:""; scheduleLive();};
  $("btnAddLine").onclick=function(){state.form.lines.push(blankLine());renderLines();scheduleLive();};
  $("orderForm").addEventListener("input",scheduleLive);
  $("orderForm").addEventListener("change",scheduleLive);
  $("btnLiveToggle").onclick=function(){var w=$("liveWrap"); w.hidden=!w.hidden; $("btnLiveToggle").textContent=w.hidden?"Show":"Hide"; lsSet("adchem_live",!w.hidden); if(!w.hidden) renderLive();};
  $("orderForm").onsubmit=submitOrder;
  $("btnReset").onclick=function(){ if(state.editing) cancelEdit(); else resetForm(false); };
  $("btnCancelEdit").onclick=cancelEdit;
  $("btnRefreshOrders").onclick=function(){reloadFromDb(false);};
  $("btnRefreshToday").onclick=function(){reloadFromDb(false);};
  $("btnDriverSheet").onclick=printDriverSheet;
  $("btnPreview").onclick=function(){state.bolOrder=null;setTab("bol");};
  $("bolBack").onclick=function(){setTab(state.bolOrder?"open":"new");};
  $("bolPrint").onclick=function(){window.print();};
  $("bolDownload").onclick=downloadBol;
  $("bolCopy").onclick=function(){copyDetails(state.bolOrder||draftOrderFromForm());};
  $("btnLiveCopy").onclick=function(){copyDetails(draftOrderFromForm());};
  $("bolDrive").onclick=function(){
    if(!state.bolOrder){ banner("warn","Create the order first","<div>A BOL goes to Drive once the order exists and has its number.</div>",{autoclose:7000}); return; }
    saveBolToDrive(state.bolOrder);
  };
  $("btnSaveSheet").onclick=function(){
    var raw=$("sSheet").value.trim();
    if(raw && !sheetIdFrom(raw)){ banner("bad","That doesn't look like a spreadsheet link","<div>Paste the full link to the AR Command Center, or just its ID.</div>"); return; }
    state.settings.sheetId=sheetIdFrom(raw)||DEFAULT_SHEET; saveSettings().then(function(){loadFeed(true);});
  };
  $("btnRefreshFeed").onclick=function(){loadFeed(true);};
  $("btnSaveOrdersOut").onclick=function(){
    var raw=$("sOrdersOut").value.trim();
    if(raw && !sheetIdFrom(raw)){ banner("bad","That doesn't look like a spreadsheet link","<div>Paste the full link to the Dispatch Orders Out sheet, or just its ID.</div>"); return; }
    state.settings.ordersOutSheetId=sheetIdFrom(raw); saveSettings().then(function(){ banner("good","Orders Out sheet saved","",{autoclose:4000}); renderOrdersOutState(); });
  };
  $("btnRebuildOrdersOut").onclick=async function(){
    if(!confirm("Rewrite every row of the Dispatch Orders Out sheet from this company's orders? Invoice numbers the office typed are kept.")) return;
    $("btnRebuildOrdersOut").disabled=true;
    try{ var r=await API.post("/api/orderlog",{rebuild:true}); banner("good","Orders Out rebuilt","<div>"+r.rebuilt+" orders written.</div>",{autoclose:8000}); }
    catch(e){ banner("bad","Orders Out not rebuilt","<div>"+esc(e.message)+"</div>"); }
    $("btnRebuildOrdersOut").disabled=false;
  };
  $("btnSaveCustomersOut").onclick=function(){
    var raw=$("sCustomersOut").value.trim();
    if(raw && !sheetIdFrom(raw)){ banner("bad","That doesn't look like a spreadsheet link","<div>Paste the full link to the Customers Out sheet, or just its ID.</div>"); return; }
    state.settings.customersOutSheetId=sheetIdFrom(raw); saveSettings().then(function(){ banner("good","Customers Out sheet saved","",{autoclose:4000}); renderCustomersOutState(); });
  };
  $("btnRebuildCustomersOut").onclick=async function(){
    if(!confirm("Rewrite every row of the Customers Out tab from this company's customers, sites and contacts?")) return;
    $("btnRebuildCustomersOut").disabled=true;
    try{ var r=await API.post("/api/customers-out",{rebuild:true}); banner("good","Customers Out rebuilt","<div>"+r.rebuilt+" rows written.</div>",{autoclose:8000}); }
    catch(e){ banner("bad","Customers Out not rebuilt","<div>"+esc(e.message)+"</div>"); }
    $("btnRebuildCustomersOut").disabled=false;
  };
  $("btnSaveBol").onclick=function(){
    var n=parseInt($("sNextBol").value,10);
    if(!n||n<1){ banner("warn","Enter a number","<div>One above SmartBOL's last issued BOL number.</div>",{autoclose:7000}); return; }
    if(n<=maxBolUsed()){ banner("bad","That number is already used","<div>This app has issued up to "+maxBolUsed()+". The next number must be higher.</div>"); return; }
    state.settings.nextBol=n; saveSettings(["nextBol"]); renderBolNumState(); updateCounts(); refreshId(); clearBanner("bolnum");
    banner("good","BOL numbering set","<div>The next scheduled order takes BOL <b>"+n+"</b>. SmartBOL issues nothing from today.</div>",{autoclose:9000});
  };
  $("btnSaveDrive").onclick=function(){
    var raw=$("sDriveFolder").value.trim(), id=driveFolderId(raw);
    if(raw&&!id){ banner("bad","That doesn't look like a folder","<div>Paste the full Drive folder URL, or just the ID from it.</div>"); return; }
    state.settings.driveFolder=raw; state.settings.driveFormat=$("sDriveFormat").value; state.settings.driveAuto=$("sDriveAuto").value;
    saveSettings(); renderDriveState(); updateCounts();
    banner("good","Drive folder saved","<div>"+(id?"New BOLs will be written there.":"Auto-save is off until a folder is set.")+"</div>",{autoclose:6000});
  };
  $("btnTestDrive").onclick=async function(){
    var id=driveFolderId($("sDriveFolder").value);
    if(!id){ banner("warn","Paste a folder first",""); return; }
    state.settings.driveFolder=$("sDriveFolder").value; await saveSettings();
    var probe=normalizeOrder({id:"TEST-"+ymd(new Date()),customer:"AdChem test file",shipTo:"",lines:[{category:"Dry Ice",product:"Dry Ice - Pellet",container:"Bin",qty:1,unitLb:50}],
      hub:state.hubs[0]?state.hubs[0].code:"EB",date:ymd(new Date()),window:WINDOWS[1],notes:"Test file — safe to delete.",code:"D",effCode:"D",addrState:"typed",status:"Intake"});
    try{ var p=await API.post("/api/drive",{title:"BOL-"+probe.id+" AdChem test file",html:standaloneDoc(probe)});
      banner("good","Test file landed","<div>Check the shared folder for <span class=\"mono\">BOL-"+esc(probe.id)+"</span> and delete it.</div>",{autoclose:12000});
    }catch(err){ banner("bad","Test file didn't land","<div>"+esc(err.message||"")+"</div>"); }
  };
  $("qSearch").oninput=renderOrders; $("qStatus").onchange=renderOrders; $("qHub").onchange=renderOrders;
  $("tDate").onchange=renderToday;
  $("tDriver").oninput=function(){lsSet("adchem_driver",$("tDriver").value.trim());};
  $("bolPod").onclick=function(){ if(state.bolOrder) openPod(state.bolOrder); };
  wirePod(); wireDep();
  $("btnSaveHubs").onclick=function(){ saveHubs(); fillHubSelects(); renderHubEditor(); renderCalState(); updateCounts(); refreshId(); banner("good","Hubs saved","<div>The shipper address on new BOLs uses these.</div>",{autoclose:5000}); };
  $("btnAddHub").onclick=function(){ state.hubs.push({code:"NEW",name:"New hub",street:"",city:"",state:"",zip:"",phone:"",emerg:EMERGENCY,settled:false}); saveHubs(); fillHubSelects(); renderHubEditor(); renderCalState(); };
  $("btnReloadCal").onclick=function(){loadCalendars();};
  $("sTz").onchange=function(){state.settings.tz=$("sTz").value;saveSettings();};
  $("sCalendar").onchange=function(){ $("sCalendarId").value=""; setDefaultCal($("sCalendar").value); };
  $("sCalendarId").onchange=function(){ var v=$("sCalendarId").value.trim(); if(v){ setDefaultCal(v); $("sCalendar").innerHTML=calOptions(v,"— none (hubs use their own) —"); } };
  $("btnConfirmCal").onclick=function(){ confirmCalendars(); };
}
/* ============================================================
   Proof of delivery — photograph the signed BOL with the phone's
   camera and send it from inside the app.
   Capture: a file input with capture="environment" opens the camera;
   the phone asks for camera permission the first time.
   Send: Gmail, as the person signed in, with the photo attached —
   to orders@adchem.pro, copy to the receiver. Nothing leaves the
   phone until the driver presses Send.
   ============================================================ */
const pod={order:null,blob:null,url:"",sending:false};

function isEmail(s){return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(s||"").trim());}
function podLocalSent(){return lsGet("adchem_pod_sent",{});}
function podMarkLocal(id,info){var m=podLocalSent(); m[id]=info; lsSet("adchem_pod_sent",m);}
function podStatusFor(o){
  if(o.pod&&o.pod.sentAt) return o.pod;
  var m=podLocalSent(); return m[o.id]||null;
}
function podButton(o){
  if(!schedulable(o)) return "";
  var s=podStatusFor(o);
  if(s) return '<div style="margin-top:5px;font-size:11px;color:var(--accent);font-weight:700">Photo sent '+esc(new Date(s.sentAt).toLocaleTimeString([], {hour:"numeric",minute:"2-digit"}))+'</div><button class="btn sm" data-pod="'+esc(o.id)+'" style="margin-top:4px">Send again</button>';
  return '<button class="btn sm primary" data-pod="'+esc(o.id)+'" style="margin-top:5px">Photo &amp; send BOL</button>';
}

/* --- the sheet --- */
function openPod(o){
  pod.order=o; pod.blob=null; if(pod.url){URL.revokeObjectURL(pod.url);} pod.url="";
  $("podTitle").textContent=(o.bolNo?"BOL "+o.bolNo:"Order "+o.id)+" · "+o.customer;
  $("podPreview").hidden=true; $("podPreview").removeAttribute("src");
  $("podRetakeRow").hidden=true; $("podTakeRow").hidden=false;
  var cc=isEmail(o.copyTo)?o.copyTo:"";
  $("podCc").value=cc;
  $("podCcNote").innerHTML=o.copyTo&&!isEmail(o.copyTo)
    ? 'The receiver\'s contact on the order is <b>'+esc(o.copyTo)+'</b>, a phone number. After sending, use <b>Share another way</b> to text them the photo — or type an email here. / <i>Es un número de teléfono: después de enviar, use «Share another way» para mandarle la foto por mensaje.</i>'
    : (cc?"From the order. Change it if the receiver gives you a different email. / <i>Cámbielo si quien recibe le da otro correo.</i>":"No email on the order. Ask the receiver for one, or leave blank. / <i>Pida un correo a quien recibe, o déjelo en blanco.</i>");
  $("podSend").disabled=true; $("podShare").disabled=true;
  var due=(o.effCode==="COD"?Number(o.codAmount||0):0)+(o.deposit?Number(o.deposit.amount||0):0);
  $("podCollected").value=due?due.toFixed(2):"0"; $("podIssue").value=""; $("podNote").value="";
  $("podDueNote").textContent=due?"Due on this stop: "+money(due)+". Enter what was actually handed over (cash + check) — the same number as the payment block. / Monto recibido.":"Nothing is due on this stop. If the customer paid anyway, enter the amount received. / Si pagaron, anote el monto.";
  podSay("","");
  $("podSheet").hidden=false;
  document.body.style.overflow="hidden";
  setTimeout(function(){ try{$("podTakeLbl").focus();}catch(e){} },50);
}
function closePod(){
  if(pod.sending) return;
  $("podSheet").hidden=true; document.body.style.overflow="";
  if(pod.url){URL.revokeObjectURL(pod.url); pod.url="";}
  pod.order=null; pod.blob=null;
  if(state.tab==="today") renderToday();
}
function podSay(kind,html){
  var el=$("podStatus");
  if(!html){el.innerHTML="";el.className="";return;}
  el.className="banner "+kind; el.style.margin="10px 0 0";
  el.innerHTML="<div>"+html+"</div>";
}

/* Shrink the photo so it sends quickly on a weak signal but stays readable:
   longest side 2000 px, JPEG. Phones apply the camera's rotation when the
   image is drawn, so the page comes out upright. */
function shrinkPhoto(file){
  return new Promise(function(resolve){
    var url=URL.createObjectURL(file), img=new Image();
    img.onload=function(){
      try{
        var max=2000, w=img.naturalWidth, h=img.naturalHeight, k=Math.min(1,max/Math.max(w,h));
        var c=document.createElement("canvas"); c.width=Math.round(w*k); c.height=Math.round(h*k);
        var g=c.getContext("2d"); g.fillStyle="#fff"; g.fillRect(0,0,c.width,c.height); g.drawImage(img,0,0,c.width,c.height);
        c.toBlob(function(b){ URL.revokeObjectURL(url); resolve(b&&b.size<file.size?b:file); },"image/jpeg",0.8);
      }catch(e){ URL.revokeObjectURL(url); resolve(file); }
    };
    img.onerror=function(){ URL.revokeObjectURL(url); resolve(file); };
    img.src=url;
  });
}
async function onPodFile(ev){
  var f=ev.target.files&&ev.target.files[0]; ev.target.value="";
  if(!f) return;
  if(!/^image\//.test(f.type||"image/")){ podSay("warn","That isn't a photo. Take a picture of the signed BOL."); return; }
  podSay("info","Preparing the photo…");
  var b=await shrinkPhoto(f);
  pod.blob=b; if(pod.url) URL.revokeObjectURL(pod.url); pod.url=URL.createObjectURL(b);
  $("podPreview").src=pod.url; $("podPreview").hidden=false;
  $("podTakeRow").hidden=true; $("podRetakeRow").hidden=false;
  $("podSend").disabled=false; $("podShare").disabled=false;
  podSay("info","Check the photo: the whole page, readable, with the payment block, both sets of initials and the receiver's signature. If not, take another. / <i>Revise que se lea toda la hoja.</i>");
}
function blobToB64(b){
  return new Promise(function(resolve,reject){
    var r=new FileReader(); r.onload=function(){ var s=String(r.result||""); resolve(s.slice(s.indexOf(",")+1)); }; r.onerror=reject; r.readAsDataURL(b);
  });
}
function podFileName(o){return "BOL-"+(o.bolNo||o.id)+"-signed.jpg";}
function podMessage(o){
  var k=o.effCode, hub=hubBy(o.hub);
  var subj=(o.bolNo?"BOL "+o.bolNo:"Order "+o.id)+" — signed — "+o.customer+" — "+o.date;
  var body=[
    "Signed bill of lading attached.","",
    "BOL: "+(o.bolNo||"not numbered")+"   Order ID: "+o.id,
    "Customer: "+o.customer+(o.siteLabel&&o.siteLabel!=="Primary"?" — "+o.siteLabel:""),
    "Delivered to: "+(o.shipTo||""),
    "Products: "+linesText(o),
    k==="COD"?"COD due on this delivery: "+money(o.codAmount):"",
    o.deposit?"Deposit due: "+(o.deposit.item||"")+" "+money(o.deposit.amount):"",
    "","Any payment received is recorded in the payment block on the photographed page.",
    "","Driver: "+(lsGet("adchem_driver","")||"not entered")+" · Hub: "+(hub?hub.name:o.hub),
    coShort()+(hub&&hub.phone?" · "+hub.phone:"")
  ].filter(function(x){return x!==null&&x!==undefined;}).join("\n").replace(/\n{3,}/g,"\n\n");
  return {subject:subj,body:body};
}
async function podSend(){
  var o=pod.order; if(!o||!pod.blob||pod.sending) return;
  var cc=$("podCc").value.split(/[,;\s]+/).map(function(s){return s.trim();}).filter(Boolean);
  var bad=cc.filter(function(s){return !isEmail(s);});
  if(bad.length){ podSay("warn","That customer email doesn't look right: <b>"+esc(bad.join(", "))+"</b>. Fix it or clear it."); return; }
  if(navigator.onLine===false){ podQueue(o,cc,"offline"); return; }
  pod.sending=true; $("podSend").disabled=true; $("podSend").textContent="Sending…";
  podSay("info","Sending to <b>"+POD_TO+"</b>"+(cc.length?" and <b>"+esc(cc.join(", "))+"</b>":"")+"… / <i>Enviando…</i>");
  try{
    var path=photoPathFor("pod",o.hub,o.id);
    var up=await supa.storage.from("dispatch-pods").upload(path,pod.blob,{contentType:"image/jpeg",upsert:false});
    if(up.error) throw {code:"upload",message:up.error.message};
    var collected=Math.max(0,Number($("podCollected").value||0)||0), issue=String($("podIssue").value||"").slice(0,200), note=String($("podNote").value||"").slice(0,300);
    var res=await API.post("/api/pod",{orderId:o.id,photoPath:path,cc:cc,driver:lsGet("adchem_driver","")||(state.me&&state.me.name)||"",collected:collected,issue:issue,note:note});
    var info={sentAt:res.sentAt,to:res.to,cc:res.cc,msgId:res.msgId,by:state.session?state.session.user.id:"",driver:lsGet("adchem_driver",""),photoPath:path,collected:collected,issue:issue,note:note};
    podRecord(o,info,res.status);
    pod.sending=false; $("podSend").textContent="Send / Enviar";
    podSay("good","<b>Sent.</b> The signed BOL went to "+POD_TO+(cc.length?" and the customer's copy to "+esc(cc.join(", ")):"")+". / <i>Enviado.</i>"+
      (o.copyTo&&!isEmail(o.copyTo)?' Now text the receiver their copy: <button class="lnk" id="podShareAfter">Share another way</button>':"")+
      ' <button class="lnk" id="podDone">Done</button>');
    var sa=$("podShareAfter"); if(sa) sa.onclick=podShare;
    var dn=$("podDone"); if(dn) dn.onclick=closePod;
  }catch(err){
    pod.sending=false; $("podSend").disabled=false; $("podSend").textContent="Send / Enviar";
    var code=err&&err.code;
    if(code==="google"||code==="bad_email"||code==="no_access"||code==="forbidden"||code==="upload"||code==="config"||code==="no_calendar"){ podSay("bad","<b>Not sent.</b> "+esc(err.message||"")+' You can still use <b>Share another way</b> so the delivery isn\'t held up.'); return; }
    if(code==="unauthenticated"){ podSay("bad","Your sign-in expired. Sign in again, then press Send."); return; }
    podQueue(o,cc,code||"network");
  }
}
function podRecord(o,info,status){
  podMarkLocal(o.id,info);
  var live=state.orders.find(function(x){return x.id===o.id;})||o;
  live.pod=info; if(status) live.status=status;
  podQueueRemove(o.id); updatePodQueueNote();
}

/* --- waiting queue: photos that couldn't be sent stay on this phone --- */
var podDb=null;
function podIdb(){
  if(podDb) return Promise.resolve(podDb);
  return new Promise(function(resolve){
    try{
      var r=indexedDB.open("adchem-pod",2);
      r.onupgradeneeded=function(){ var db=r.result; if(!db.objectStoreNames.contains("q")) db.createObjectStore("q",{keyPath:"orderId"}); if(!db.objectStoreNames.contains("d")) db.createObjectStore("d",{keyPath:"id"}); };
      r.onsuccess=function(){ podDb=r.result; resolve(podDb); };
      r.onerror=function(){ resolve(null); };
    }catch(e){ resolve(null); }
  });
}
async function podQueue(o,cc,why){
  var db=await podIdb(), saved=false;
  if(db){ try{ await new Promise(function(res,rej){ var t=db.transaction("q","readwrite"); t.objectStore("q").put({orderId:o.id,order:o,blob:pod.blob,cc:cc,at:Date.now(),why:why}); t.oncomplete=res; t.onerror=rej; }); saved=true; }catch(e){} }
  updatePodQueueNote();
  podSay("warn","<b>Not sent yet</b> — "+(why==="offline"?"no signal.":"no answer from the server, so it may or may not have gone.")+
    (saved?" The photo is kept on this phone. Press <b>Send waiting photos</b> on the Today list when you have signal — check orders@ first if you're unsure it went.":" Keep the photo: use <b>Share another way</b> now.")+
    " / <i>No se envió todavía. La foto queda guardada en el teléfono.</i>");
}
function podQueueAll(){
  return podIdb().then(function(db){
    if(!db) return [];
    return new Promise(function(res){ try{ var t=db.transaction("q","readonly"), rq=t.objectStore("q").getAll(); rq.onsuccess=function(){res(rq.result||[]);}; rq.onerror=function(){res([]);}; }catch(e){res([]);} });
  });
}
function podQueueRemove(id){
  podIdb().then(function(db){ if(!db) return; try{ db.transaction("q","readwrite").objectStore("q").delete(id); }catch(e){} });
}
async function updatePodQueueNote(){
  var host=$("podQueueNote"); if(!host) return;
  var q=await podQueueAll(), dq=await depQueueAll(), n=q.length+dq.length;
  if(!n){ host.innerHTML=""; host.hidden=true; return; }
  host.hidden=false;
  host.innerHTML='<div class="banner warn" style="margin:0 0 12px"><div><b>'+n+' photo'+(n===1?"":"s")+' waiting to send</b>'+
    q.map(function(x){return esc((x.order.bolNo?"BOL "+x.order.bolNo:x.order.id)+" · "+x.order.customer);}).concat(dq.map(function(x){return "Deposit slip"+(x.d&&x.d.amount?" · "+money(x.d.amount):"")+" · "+new Date(x.at).toLocaleDateString();})).join("<br>")+
    '<div style="margin-top:6px"><button class="btn sm primary" id="podFlush">Send waiting photos</button></div></div></div>';
  $("podFlush").onclick=async function(){ await podFlush(); await depFlush(); };
}
async function podFlush(){
  var q=await podQueueAll();
  for(var i=0;i<q.length;i++){
    var x=q[i]; pod.order=x.order; pod.blob=x.blob;
    $("podCc").value=(x.cc||[]).join(", ");
    $("podTitle").textContent=(x.order.bolNo?"BOL "+x.order.bolNo:"Order "+x.order.id)+" · "+x.order.customer;
    $("podSheet").hidden=false; $("podPreview").src=URL.createObjectURL(x.blob); $("podPreview").hidden=false;
    $("podTakeRow").hidden=true; $("podRetakeRow").hidden=false; $("podSend").disabled=false; $("podShare").disabled=false;
    await podSend();
    if(!$("podStatus").className.match(/good/)) break;
  }
}

/* --- share sheet: text or another app, when email isn't the right route --- */
async function podShare(){
  var o=pod.order; if(!o||!pod.blob) return;
  var file;
  try{ file=new File([pod.blob],podFileName(o),{type:"image/jpeg"}); }catch(e){ file=null; }
  var m=podMessage(o);
  if(file && navigator.canShare && navigator.canShare({files:[file]})){
    try{ await navigator.share({files:[file],title:m.subject,text:m.subject}); podSay("good","Shared. If this was the office copy, it still has to reach <b>"+POD_TO+"</b>."); return; }
    catch(e){ if(e&&e.name==="AbortError") return; }
  }
  try{ var a=document.createElement("a"); a.href=pod.url; a.download=podFileName(o); document.body.appendChild(a); a.click(); a.remove(); podSay("info","Saved to the phone. Send it to <b>"+POD_TO+"</b> from your email app."); return; }catch(e){}
  podSay("warn","Sharing isn't available on this phone from here. Use <b>Send</b>, or take the picture with the phone's camera app and email it to "+POD_TO+".");
}
/* ============================================================
   Bank deposit slips — photographed after a bank run, emailed to
   accounting@adchem.pro by the server. Same camera flow as the BOL.
   ============================================================ */
var dep={blob:null,url:"",sending:false};
function openDep(){
  dep.blob=null; if(dep.url){URL.revokeObjectURL(dep.url);} dep.url="";
  $("depPreview").hidden=true; $("depPreview").removeAttribute("src");
  $("depRetakeRow").hidden=true; $("depTakeRow").hidden=false;
  $("depAmount").value=""; $("depNote").value="";
  $("depSend").disabled=true; depSay("","");
  $("depSheet").hidden=false; document.body.style.overflow="hidden";
  setTimeout(function(){ try{$("depTakeLbl").focus();}catch(e){} },50);
}
function closeDep(){
  if(dep.sending) return;
  $("depSheet").hidden=true; document.body.style.overflow="";
  if(dep.url){URL.revokeObjectURL(dep.url); dep.url="";}
  dep.blob=null;
}
function depSay(kind,html){
  var el=$("depStatus");
  if(!html){el.innerHTML="";el.className="";return;}
  el.className="banner "+kind; el.style.margin="10px 0 0"; el.innerHTML="<div>"+html+"</div>";
}
async function onDepFile(ev){
  var f=ev.target.files&&ev.target.files[0]; ev.target.value="";
  if(!f) return;
  if(!/^image\//.test(f.type||"image/")){ depSay("warn","That isn't a photo. Take a picture of the deposit slip."); return; }
  depSay("info","Preparing the photo…");
  var b=await shrinkPhoto(f);
  dep.blob=b; if(dep.url) URL.revokeObjectURL(dep.url); dep.url=URL.createObjectURL(b);
  $("depPreview").src=dep.url; $("depPreview").hidden=false;
  $("depTakeRow").hidden=true; $("depRetakeRow").hidden=false;
  $("depSend").disabled=false;
  depSay("info","Check that the amount and the bank's stamp or receipt number are readable. / <i>Revise que se lea el monto y el sello del banco.</i>");
}
function depPayload(){
  return {hub:myHub()||(state.me&&state.me.hub)||"",driver:lsGet("adchem_driver","")||(state.me&&state.me.name)||"",amount:Number($("depAmount").value||0)||0,note:String($("depNote").value||"").slice(0,200)};
}
async function depSend(){
  if(!dep.blob||dep.sending) return;
  var d=depPayload();
  if(navigator.onLine===false){ depQueue(d,"offline"); return; }
  dep.sending=true; $("depSend").disabled=true; $("depSend").textContent="Sending…";
  depSay("info","Sending to <b>"+ACCOUNTING_TO+"</b>… / <i>Enviando…</i>");
  try{
    var path=photoPathFor("deposits",d.hub,"");
    var up=await supa.storage.from("dispatch-pods").upload(path,dep.blob,{contentType:"image/jpeg",upsert:false});
    if(up.error) throw {code:"upload",message:up.error.message};
    var res=await API.post("/api/deposit",{photoPath:path,hub:d.hub,driver:d.driver,amount:d.amount,note:d.note});
    dep.sending=false; $("depSend").textContent="Send to accounting / Enviar";
    depQueueRemove(dep.qid); dep.qid=null; updatePodQueueNote();
    depSay("good","<b>Sent.</b> The deposit slip went to "+esc(res.to||ACCOUNTING_TO)+(d.amount?" for "+money(d.amount):"")+". / <i>Enviado.</i> <button class=\"lnk\" id=\"depDone\">Done</button>");
    var dn=$("depDone"); if(dn) dn.onclick=function(){ dep.sending=false; closeDep(); };
  }catch(err){
    dep.sending=false; $("depSend").disabled=false; $("depSend").textContent="Send to accounting / Enviar";
    var code=err&&err.code;
    if(code==="google"||code==="no_access"||code==="forbidden"||code==="upload"||code==="config"){ depSay("bad","<b>Not sent.</b> "+esc(err.message||"")+" Keep the slip and tell the office."); return; }
    if(code==="unauthenticated"){ depSay("bad","Your sign-in expired. Sign in again, then press Send."); return; }
    depQueue(d,code||"network");
  }
}
async function depQueue(d,why){
  var db=await podIdb(), saved=false, id=dep.qid||("dep-"+Date.now());
  if(db&&db.objectStoreNames.contains("d")){ try{ await new Promise(function(res,rej){ var t=db.transaction("d","readwrite"); t.objectStore("d").put({id:id,blob:dep.blob,d:d,at:Date.now(),why:why}); t.oncomplete=res; t.onerror=rej; }); saved=true; dep.qid=id; }catch(e){} }
  updatePodQueueNote();
  depSay("warn","<b>Not sent yet</b> — "+(why==="offline"?"no signal.":"no answer from the server.")+(saved?" The photo is kept on this phone; press <b>Send waiting photos</b> on the Today list when you have signal.":" Keep the slip and send it again later.")+" / <i>No se envió todavía.</i>");
}
function depQueueAll(){
  return podIdb().then(function(db){
    if(!db||!db.objectStoreNames.contains("d")) return [];
    return new Promise(function(res){ try{ var t=db.transaction("d","readonly"), rq=t.objectStore("d").getAll(); rq.onsuccess=function(){res(rq.result||[]);}; rq.onerror=function(){res([]);}; }catch(e){res([]);} });
  });
}
function depQueueRemove(id){
  if(!id) return;
  podIdb().then(function(db){ if(!db||!db.objectStoreNames.contains("d")) return; try{ db.transaction("d","readwrite").objectStore("d").delete(id); }catch(e){} });
}
async function depFlush(){
  var q=await depQueueAll();
  for(var i=0;i<q.length;i++){
    var x=q[i]; dep.blob=x.blob; dep.qid=x.id;
    $("depAmount").value=x.d.amount||""; $("depNote").value=x.d.note||"";
    $("depSheet").hidden=false; $("depPreview").src=URL.createObjectURL(x.blob); $("depPreview").hidden=false;
    $("depTakeRow").hidden=true; $("depRetakeRow").hidden=false; $("depSend").disabled=false;
    await depSend();
    if(!$("depStatus").className.match(/good/)) break;
  }
}
function wireDep(){
  var b=$("btnDeposit"); if(b) b.onclick=openDep;
  $("depFile").onchange=onDepFile; $("depFile2").onchange=onDepFile;
  $("depSend").onclick=depSend; $("depClose").onclick=closeDep;
  $("depSheet").addEventListener("keydown",function(e){ if(e.key==="Escape") closeDep(); });
}

function wirePod(){
  $("podFile").onchange=onPodFile;
  $("podFile2").onchange=onPodFile;
  $("podSend").onclick=podSend;
  $("podShare").onclick=podShare;
  $("podClose").onclick=closePod;
  $("podSheet").addEventListener("keydown",function(e){ if(e.key==="Escape") closePod(); });
  window.addEventListener("online",updatePodQueueNote);
  updatePodQueueNote();
}


/* ============================================================
   Data layer — Supabase (orders, hubs, settings, sites, people)
   and the server routes under /api for Google.
   ============================================================ */
const CFG=window.ADCHEM_CONFIG||{};
const supa=window.supabase.createClient(CFG.supabaseUrl,CFG.supabaseAnonKey,{auth:{persistSession:true,autoRefreshToken:true}});
Object.defineProperty(window,"POD_TO",{get:function(){return coMail("ordersTo",CFG.ordersTo||"orders@adchem.pro");}});
Object.defineProperty(window,"ACCOUNTING_TO",{get:function(){return coMail("accountingTo",CFG.accountingTo||"accounting@adchem.pro");}});

function sbErr(r){ if(r.error) throw new Error(r.error.message||String(r.error)); return r.data; }

const DB={
  async me(){
    var r=await supa.from("dispatch_users").select("user_id,email,name,active").eq("user_id",state.session.user.id).maybeSingle();
    var me=sbErr(r);
    var m=sbErr(await supa.from("dispatch_members").select("company,role,hub,active,is_super_admin,permissions").eq("user_id",state.session.user.id).eq("active",true));
    var cos=sbErr(await supa.from("companies").select("id,name,short_name,active,data").eq("active",true).order("name"));
    return {me:me,memberships:m||[],companies:cos||[]};
  },
  async hubs(){ return sbErr(await supa.from("dispatch_hubs").select("*").eq("company",state.company).order("sort")); },
  async settings(){ var d=sbErr(await supa.from("dispatch_company_settings").select("data").eq("company",state.company).maybeSingle()); return (d&&d.data)||{}; },
  async orders(){
    var since=new Date(); since.setDate(since.getDate()-60);
    var r=await supa.from("dispatch_orders").select("id,bol_no,hub,date,status,customer,data,created_at,updated_at").eq("company",state.company)
      .or("date.gte."+ymd(since)+",status.in.(Intake,Awaiting accounting,Confirmed,Scheduled,BOL Created,Out for Delivery,Delivered,POD Received,On Hold)")
      .order("created_at",{ascending:false}).limit(2000);
    return sbErr(r).map(rowToOrder);
  },
  async sites(){
    var r=await supa.from("dispatch_sites").select("*").eq("company",state.company).order("customer"); var rows=sbErr(r);
    return rows.map(function(s){return {siteKey:s.site_key,customer:s.customer,codeRaw:s.code_raw,code:s.code,addr:s.addr,unconfirmed:s.unconfirmed,city:s.city,hub:s.hub,contact:s.contact,phone:s.phone,gate:s.gate,hours:s.hours,instr:s.instr,siteLabel:s.site_label,copyTo:s.copy_to,syncedAt:s.synced_at,
      customerId:s.customer_id||null,receivingHours:s.receiving_hours||"",gateCode:s.gate_code||"",parkingUnloading:s.parking_unloading||"",hazmatRestrictions:s.hazmat_restrictions||"",
      containerNotes:s.container_notes||"",specialInstructions:s.special_instructions||"",lastVerified:s.last_verified||null};});
  },
  async saveSiteCopyTo(siteKey,copyTo){ if(!siteKey) return; sbErr(await supa.from("dispatch_sites").update({copy_to:copyTo}).eq("site_key",siteKey).eq("company",state.company)); },
  async saveOrder(o){
    var row={id:o.id,company:state.company,bol_no:o.bolNo||null,hub:o.hub||"",date:o.date,status:o.status||"Intake",customer:o.customer||"",data:o,updated_at:new Date().toISOString()};
    if(o.createdBy) row.created_by=o.createdBy;
    sbErr(await supa.from("dispatch_orders").upsert(row,{onConflict:"company,id"}));
  },
  async saveHubs(){ sbErr(await supa.from("dispatch_hubs").upsert(state.hubs.map(function(h,i){return {code:h.code,company:state.company,name:h.name,street:h.street||"",city:h.city||"",state:h.state||"",zip:h.zip||"",phone:h.phone||"",emerg:h.emerg||"",settled:!!h.settled,tz:h.tz||"",products:Array.isArray(h.products)?h.products:null,sort:i};}),{onConflict:"company,code"})); },
  // The server owns the counters (the customer-ID trigger and dispatch_next_bol move them), so a save writes them back as the
  // database has them now, never as this screen loaded them; own lists a counter the caller sets on purpose (Setup's BOL start).
  async saveSettings(own){
    var cur=sbErr(await supa.from("dispatch_company_settings").select("data").eq("company",state.company).maybeSingle()), d=(cur&&cur.data)||{};
    var data=Object.assign({},state.settings);
    SERVER_COUNTERS.forEach(function(k){ if((own||[]).indexOf(k)>=0) return; if(k in d){ data[k]=d[k]; state.settings[k]=d[k]; } else { delete data[k]; delete state.settings[k]; } });
    sbErr(await supa.from("dispatch_company_settings").upsert({company:state.company,data:data,updated_at:new Date().toISOString()},{onConflict:"company"})); },
  async assignBol(id){ return sbErr(await supa.rpc("dispatch_next_bol",{p_order_id:id,p_company:state.company})); },
  async users(){
    var mem=sbErr(await supa.from("dispatch_members").select("user_id,role,hub,active,created_at,is_super_admin,permissions").eq("company",state.company));
    var ids=mem.map(function(m){return m.user_id;}); if(!ids.length) return [];
    var us=sbErr(await supa.from("dispatch_users").select("user_id,email,name").in("user_id",ids));
    var by={}; us.forEach(function(u){by[u.user_id]=u;});
    return mem.map(function(m){var u=by[m.user_id]||{}; return {user_id:m.user_id,email:u.email||"",name:u.name||"",role:m.role,hub:m.hub,active:m.active,created_at:m.created_at,isSuper:!!m.is_super_admin,permissions:m.permissions||{}};}).sort(function(a,b){return a.email.localeCompare(b.email);});
  },
  async setPermissions(userId,perms){ return sbErr(await supa.rpc("dispatch_set_permissions",{p_user:userId,p_company:state.company,p_perms:perms})); },
  async setSuperAdmin(userId,on){ return sbErr(await supa.rpc("dispatch_set_super_admin",{p_user:userId,p_company:state.company,p_on:!!on})); },
  async invites(){ return sbErr(await supa.from("dispatch_invites").select("email,name,role,hub,invited_at,accepted_at,revoked_at").eq("company",state.company).order("invited_at",{ascending:false})); },
  async grant(email,name,role,hub){ return sbErr(await supa.rpc("dispatch_grant",{p_email:email,p_name:name,p_role:role,p_hub:hub,p_company:state.company})); },
  async revoke(email){ return sbErr(await supa.rpc("dispatch_revoke",{p_email:email,p_company:state.company})); },
  async addCompany(id,name,short){ return sbErr(await supa.rpc("dispatch_add_company",{p_id:id,p_name:name,p_short:short})); },
  async log(){ return sbErr(await supa.from("dispatch_log").select("at,what,detail").eq("company",state.company).order("at",{ascending:false}).limit(30)); },
  async logWrite(what,detail){ try{ await supa.from("dispatch_log").insert({who:state.session.user.id,what:what,detail:detail||{},company:state.company}); }catch(e){} }
};
/* Photos: {company}/{hub}/{pod|deposits}/[orderId/]{time}.jpg. Storage lets a driver write only under their own
   company and hub and read back only what they uploaded; coordinators and admins read their own company's. */
function safeSeg(x){ return String(x||"").replace(/[^A-Za-z0-9_-]/g,"_")||"_"; }
function photoPathFor(kind,hub,orderId){ return [safeSeg(state.company),safeSeg(hub),kind].concat(orderId?[safeSeg(orderId)]:[]).join("/")+"/"+Date.now()+".jpg"; }
function rowToOrder(r){ var o=normalizeOrder(Object.assign({},r.data||{})); o.id=r.id; o.bolNo=r.bol_no||o.bolNo||null; o.status=r.status||o.status; o.hub=r.hub||o.hub; o.date=r.date||o.date; o.customer=r.customer||o.customer; o.createdAt=o.createdAt||r.created_at; return o; }

/* Order writes used throughout the UI. */
async function saveOrder(o){
  var i=state.orders.findIndex(function(x){return x.id===o.id;});
  if(i>=0) state.orders[i]=o; else state.orders.unshift(o);
  try{ await DB.saveOrder(o); }
  catch(e){ banner("bad","Order not saved to the shared database","<div>"+esc(e.message)+" — it is only on this screen. Check your connection and try again.</div>",{key:"save"}); throw e; }
}
async function saveHubs(){ try{ await DB.saveHubs(); }catch(e){ banner("bad","Hubs not saved","<div>"+esc(e.message)+"</div>"); } }
// plus the document warning keys: written only through dispatch_set_warnings (super admin), so a save carries the database's values
const SERVER_COUNTERS=["nextCustomerNumber","nextBol","warnDays","warnings","expiryEmailRecipients"];
async function saveSettings(own){ try{ await DB.saveSettings(own); }catch(e){ banner("bad","Settings not saved","<div>"+esc(e.message)+"</div>"); } }

const API={
  async call(method,path,body){
    var tok=state.session&&state.session.access_token;
    var r=await fetch(path,{method:method,headers:Object.assign({authorization:"Bearer "+tok},body?{"content-type":"application/json"}:{}),body:body?JSON.stringify(body):undefined});
    var j=null; try{ j=await r.json(); }catch(e){}
    if(!r.ok){ var err=new Error((j&&j.error&&j.error.message)||("Server error "+r.status)); err.code=(j&&j.error&&j.error.code)||"server"; err.status=r.status; throw err; }
    return j;
  },
  get:function(p){return API.call("GET",p+(p.indexOf("?")<0?"?":"&")+"company="+encodeURIComponent(state.company));},
  post:function(p,b){return API.call("POST",p,Object.assign({company:state.company},b||{}));}
};

/* ============================================================
   Load compatibility — 49 CFR 177.848(d) segregation table
   ============================================================ */
const SEG_CLASSES=["1.1-1.2","1.3","1.4","1.5","1.6","2.1","2.2","2.3A","2.3B","3","4.1","4.2","4.3","5.1","5.2","6.1A","7","8L"];
const SEG_LABELS={"1.1-1.2":"1.1, 1.2","1.3":"1.3","1.4":"1.4","1.5":"1.5","1.6":"1.6","2.1":"2.1 flammable gas","2.2":"2.2 non-flammable gas","2.3A":"2.3 gas Zone A","2.3B":"2.3 gas Zone B","3":"3 flammable liquid","4.1":"4.1","4.2":"4.2","4.3":"4.3","5.1":"5.1","5.2":"5.2","6.1A":"6.1 liquid PG I Zone A","7":"7","8L":"8 liquids"};
/* 49 CFR 177.848(d) segregation table, read from the eCFR on 10/9/26. Each pair lists X (may not be loaded,
   transported or stored together in the same vehicle) or O (only if separated so leakage cannot mix).
   Explosives among themselves (*) and the ammonium nitrate note (A) are outside what AdChem ships and are not encoded.
   The table is symmetric; the lookup checks both directions. */
const SEG_DEFAULT={
  "1.1-1.2":{"2.1":"X","2.2":"X","2.3A":"X","2.3B":"X","3":"X","4.1":"X","4.2":"X","4.3":"X","5.1":"X","5.2":"X","6.1A":"X","7":"X","8L":"X"},
  "1.3":{"2.1":"X","2.3A":"X","2.3B":"X","3":"X","4.2":"X","4.3":"X","5.1":"X","5.2":"X","6.1A":"X","8L":"X"},
  "1.4":{"2.1":"O","2.3A":"O","2.3B":"O","3":"O","4.2":"O","6.1A":"O","8L":"O"},
  "1.5":{"2.1":"X","2.2":"X","2.3A":"X","2.3B":"X","3":"X","4.1":"X","4.2":"X","4.3":"X","5.1":"X","5.2":"X","6.1A":"X","7":"X","8L":"X"},
  "1.6":{},
  "2.1":{"2.3A":"X","2.3B":"O","6.1A":"O","7":"O"},
  "2.2":{},
  "2.3A":{"3":"X","4.1":"X","4.2":"X","4.3":"X","5.1":"X","5.2":"X","8L":"X"},
  "2.3B":{"3":"O","4.1":"O","4.2":"O","4.3":"O","5.1":"O","5.2":"O","8L":"O"},
  "3":{"5.1":"O","6.1A":"X"},
  "4.1":{"6.1A":"X","8L":"O"},
  "4.2":{"6.1A":"X","8L":"X"},
  "4.3":{"6.1A":"X","8L":"O"},
  "5.1":{"6.1A":"X","8L":"O"},
  "5.2":{"6.1A":"X","8L":"O"},
  "6.1A":{"8L":"X"},
  "7":{},
  "8L":{}
};
function segTable(){ return (state.settings.segTable&&typeof state.settings.segTable==="object")?state.settings.segTable:SEG_DEFAULT; }
function segRel(a,b){
  if(a===b) return "";
  var t=segTable();
  var r=(t[a]&&t[a][b])||(t[b]&&t[b][a])||"";
  if(r==="X"||r==="O") return r;
  return "";
}
/* Map a hazmat entry to its segregation column. Class 2 gases: 2.1 or 2.2 (AdChem ships no 2.3).
   Class 3 liquids: "3". A 6.1 subsidiary on a PG II liquid is not Zone A, so it does not move the row. */
function segKeyFor(h){ if(!h||h.s!=="verified") return null; if(h.cls==="2.1"||h.cls==="2.2"||h.cls==="3") return h.cls; return null; }

/* The checks a load must pass, order by order and as a whole truck.
   Returns [{k:"stop"|"warn"|"ok"|"info", t, s}] */
function orderFlags(o){
  var out=[], sum=loadSummary(o.lines||[]);
  (o.lines||[]).forEach(function(l,i){
    if(!l.product) return;
    var h=hazFor(l.product,l.container), n="Line "+(i+1)+" — "+l.product;
    if(h.s==="blocked") out.push({k:"stop",t:n+": DO NOT LOAD",s:"No verified hazmat data on file (Product Hazmat Reference v1.1 §11.4). It cannot be offered for transport."});
    else if(h.s==="suspect") out.push({k:"stop",t:n+": shipping description unresolved",s:"The office must settle the UN number and class before this moves."});
    else if(h.s==="unlisted") out.push({k:"warn",t:n+": not in the hazmat reference",s:"Check the SDS. Absence from the reference is not a finding that it is unregulated."});
    if(h.s==="verified"&&!lineLb(l)) out.push({k:"warn",t:n+": no weight",s:"Placard math is short until the gross weight is entered."});
  });
  if(sum.exemptOnly) out.push({k:"info",t:"Dry ice",s:"Not regulated by highway. Do not placard. Keep the vehicle ventilated — CO₂ builds up in a closed cab or box (49 CFR 173.217)."});
  var pv=placardVerdict(sum,"order");
  if(pv.name==="DO NOT LOAD") out.push({k:"stop",t:"Placards",s:pv.text});
  else if(pv.req) out.push({k:"warn",t:"Placards on this order alone",s:pv.text});
  return out;
}
/* Whole-truck check: segregation between every pair of lines across the orders on the truck, plus thresholds. */
function truckFlags(orders){
  var out=[], items=[];
  orders.forEach(function(o){ (o.lines||[]).forEach(function(l){ if(!l.product) return; var h=hazFor(l.product,l.container); items.push({o:o,l:l,h:h,seg:segKeyFor(h)}); }); });
  var seen={};
  for(var i=0;i<items.length;i++) for(var j=i+1;j<items.length;j++){
    var a=items[i], b=items[j]; if(!a.seg||!b.seg) continue;
    var rel=segRel(a.seg,b.seg); if(!rel) continue;
    var key=[a.seg,b.seg].sort().join("|")+rel; if(seen[key]) continue; seen[key]=1;
    var who=function(x){return x.l.product+" ("+SEG_LABELS[x.seg]+")"+(x.o.bolNo?" · BOL "+x.o.bolNo:" · "+x.o.id);};
    if(rel==="X") out.push({k:"stop",t:"MUST NOT ride together — split onto separate trucks",s:who(a)+" and "+who(b)+". 49 CFR 177.848(d): X — may not be loaded, transported or stored together on the same vehicle."});
    else out.push({k:"warn",t:"Separate on the truck",s:who(a)+" and "+who(b)+". 49 CFR 177.848(d): O — may share a vehicle only if separated so that leakage cannot mix; keep them apart and secured."});
  }
  var allLines=[]; orders.forEach(function(o){allLines=allLines.concat(o.lines||[]);});
  var sum=loadSummary(allLines), pv=placardVerdict(sum,"vehicle");
  if(pv.name==="DO NOT LOAD") out.push({k:"stop",t:"Placards — DO NOT LOAD",s:pv.text});
  else if(pv.req) out.push({k:"warn",t:"Placarded load — "+pv.name,s:pv.text+" In California the vehicle also needs a CHP Hazardous Materials Transportation License (CVC 32000.5) on board, and must keep to permitted routes."});
  else out.push({k:"ok",t:"Placards — "+pv.name,s:pv.text});
  if(Object.keys(sum.byClass).some(function(k){return k==="2.1"||k==="2.2";})) out.push({k:"info",t:"Cylinders",s:"Secured upright or braced so they cannot shift, valves protected (49 CFR 177.840)."});
  return out;
}
function flagsHtml(fl){
  if(!fl.length) return "";
  return '<div style="padding:4px 13px 8px">'+fl.map(function(f){var m=f.k==="stop"?"!":f.k==="warn"?"–":f.k==="ok"?"✓":"i";return '<div class="flagline '+f.k+'"><span class="mk">'+m+'</span><span><b>'+esc(f.t)+"</b> "+esc(f.s)+"</span></div>";}).join("")+"</div>";
}
function renderSegTable(){
  var host=$("segWrap"); if(!host) return;
  var t=segTable(), admin=state.isOwner;
  var h='<table class="segtable"><tr><th></th>'+SEG_CLASSES.map(function(c){return "<th title=\""+esc(SEG_LABELS[c])+"\">"+esc(c)+"</th>";}).join("")+"</tr>";
  SEG_CLASSES.forEach(function(r){
    h+='<tr><th style="text-align:left" title="'+esc(SEG_LABELS[r])+'">'+esc(r)+"</th>";
    SEG_CLASSES.forEach(function(c){
      if(r===c){ h+='<td style="background:var(--line-2)"></td>'; return; }
      var v=segRel(r,c);
      h+='<td class="'+v+'">'+(admin?'<input data-r="'+esc(r)+'" data-c="'+esc(c)+'" value="'+v+'" maxlength="1">':v)+"</td>";
    });
    h+="</tr>";
  });
  host.innerHTML=h+"</table>";
  $("btnSaveSeg").hidden=!admin; $("btnResetSeg").hidden=!admin;
}
function readSegTable(){
  var t={}; SEG_CLASSES.forEach(function(r){t[r]={};});
  $("segWrap").querySelectorAll("input[data-r]").forEach(function(i){
    var v=i.value.trim().toUpperCase(); if(v!=="X"&&v!=="O") return;
    var r=i.getAttribute("data-r"), c=i.getAttribute("data-c");
    t[r][c]=v;
  });
  return t;
}

/* ============================================================
   People (admin)
   ============================================================ */
// manage_people is still accepted by dispatch_set_permissions (and kept when another switch changes) but has no switch: nothing
// checks it yet, so offering it would grant nothing
const MEMBER_PERMS=[["manage_customers","Manage customers"],["approve_driver_notes","Approve driver notes"],["run_imports","Run imports"],
  ["view_documents","View documents"],["manage_documents","Manage documents"]];
async function renderUsers(){
  if(!state.isOwner) return;
  parkDocForm();   // the document form may sit in a member's Documents section, which is about to be redrawn
  var ph=$("peopleHead"); if(ph) ph.textContent="People at "+coName();
  renderCompanies();
  $("uHub").innerHTML='<option value="">All hubs</option>'+state.hubs.map(function(h){return '<option value="'+esc(h.code)+'">'+esc(h.code)+" — "+esc(h.name)+"</option>";}).join("");
  try{
    var users=await DB.users(), inv=await DB.invites();
    state.users=users; state.invites=inv;
    var pend=inv.filter(function(i){return !i.accepted_at&&!i.revoked_at;});
    var meSuper=!!(state.me&&state.me.isSuper), canPerm=state.isOwner||meSuper;
    var permRow=function(u){
      if(!canPerm||!u.active) return "";
      var lock=u.isSuper&&!meSuper;   // only a super admin can change a super admin
      return '<div class="perm-row">'+MEMBER_PERMS.map(function(p){ return '<label class="perm-chk"><input type="checkbox" data-perm="'+esc(u.user_id+":"+p[0])+'"'+(u.permissions[p[0]]?" checked":"")+(lock?" disabled":"")+"> "+esc(p[1])+"</label>"; }).join("")+
        (meSuper?'<label class="perm-chk"><input type="checkbox" data-super="'+esc(u.user_id)+'"'+(u.isSuper?" checked":"")+(u.user_id===state.session.user.id?' disabled title="You can\'t remove your own super admin"':"")+"> Super admin</label>":"")+"</div>";
    };
    var rows=users.map(function(u){
      return '<div class="urow"><div><b>'+esc(u.name||u.email)+'</b><div class="hint">'+esc(u.email)+'</div></div>'+
        '<div><span class="chip st'+(u.role==="admin"?" done":"")+'">'+esc(u.role)+'</span> '+(u.hub?'<span class="chip k-DEP">'+esc(u.hub)+'</span>':'<span class="hint">all hubs</span>')+'</div>'+
        '<div>'+(u.active?'<span class="chip k-D">active</span>':'<span class="chip warn">removed</span>')+'</div><div></div>'+
        '<div style="display:flex;gap:6px;justify-content:flex-end">'+(u.active&&u.user_id!==state.session.user.id?'<button class="btn sm danger" data-revoke="'+esc(u.email)+'">Remove</button>':'')+
        (!u.active?'<button class="btn sm" data-regrant="'+esc(u.email)+'" data-role="'+esc(u.role)+'" data-hub="'+esc(u.hub)+'">Restore</button>':'')+'</div>'+permRow(u)+
        // each member's documents (documents.js), loaded when opened
        (canViewDocs()?'<details class="pdocs" data-pdocs="'+esc(u.user_id)+'"><summary>Documents</summary>'+personDocsHtml(u.user_id)+'</details>':'')+'</div>';
    }).join("");
    var prow=pend.map(function(i){
      return '<div class="urow" style="background:var(--amber-soft)"><div><b>'+esc(i.name||i.email)+'</b><div class="hint">'+esc(i.email)+'</div></div>'+
        '<div><span class="chip st">'+esc(i.role)+'</span> '+(i.hub?'<span class="chip k-DEP">'+esc(i.hub)+'</span>':'')+'</div>'+
        '<div><span class="chip warn">invited — not yet signed up</span></div><div class="hint">'+esc(new Date(i.invited_at).toLocaleDateString())+'</div>'+
        '<div style="display:flex;gap:6px;justify-content:flex-end"><button class="btn sm danger" data-revoke="'+esc(i.email)+'">Cancel</button></div></div>';
    }).join("");
    $("userList").innerHTML=(rows+prow)||'<div class="empty">No one yet.</div>';
    $("userList").querySelectorAll("[data-revoke]").forEach(function(b){ b.onclick=async function(){ if(!confirm("Remove access for "+b.getAttribute("data-revoke")+"? They lose access on their next page load.")) return; try{ await DB.revoke(b.getAttribute("data-revoke")); banner("good","Access removed","",{autoclose:5000}); }catch(e){ banner("bad","Not removed","<div>"+esc(e.message)+"</div>"); } renderUsers(); }; });
    $("userList").querySelectorAll("[data-regrant]").forEach(function(b){ b.onclick=async function(){ try{ await DB.grant(b.getAttribute("data-regrant"),"",b.getAttribute("data-role"),b.getAttribute("data-hub")); }catch(e){ banner("bad","Not restored","<div>"+esc(e.message)+"</div>"); } renderUsers(); }; });
    $("userList").querySelectorAll("[data-perm]").forEach(function(c){ c.onchange=async function(){
      var uid=c.getAttribute("data-perm").split(":")[0], u=users.find(function(x){return x.user_id===uid;})||{permissions:{}};
      var perms=Object.assign({},u.permissions); $("userList").querySelectorAll("[data-perm]").forEach(function(el){ var a=el.getAttribute("data-perm").split(":"); if(a[0]===uid) perms[a[1]]=el.checked; });
      try{ await DB.setPermissions(uid,perms); if(uid===state.session.user.id) state.me.perms=perms; }catch(e){ banner("bad","Permissions not changed","<div>"+esc(e.message)+"</div>"); }
      renderUsers(); }; });
    $("userList").querySelectorAll("[data-super]").forEach(function(c){ c.onchange=async function(){
      try{ await DB.setSuperAdmin(c.getAttribute("data-super"),c.checked); }catch(e){ banner("bad","Super admin not changed","<div>"+esc(e.message)+"</div>"); }
      renderUsers(); }; });
    var log=await DB.log();
    $("userLog").innerHTML=log.map(function(l){return esc(new Date(l.at).toLocaleString([], {month:"numeric",day:"numeric",hour:"numeric",minute:"2-digit"}))+" · "+esc(l.what)+" · "+esc(JSON.stringify(l.detail));}).join("<br>")||"Nothing yet.";
  }catch(e){ $("userList").innerHTML='<div class="empty">'+esc(e.message)+"</div>"; }
}
async function renderCompanies(){
  var host=$("companyList"); if(!host) return;
  host.innerHTML=state.companies.map(function(c){var m=state.memberships.find(function(x){return x.company===c.id;}); return '<div class="urow"><div><b>'+esc(c.name)+'</b><div class="hint mono">'+esc(c.id)+'</div></div><div><span class="chip st">'+esc(m?m.role:"")+'</span></div><div>'+(c.id===state.company?'<span class="chip k-D">showing</span>':'')+'</div><div></div><div></div></div>';}).join("")||'<div class="empty">None.</div>';
}
async function addCompanyFromForm(){
  var id=$("cId").value.trim().toLowerCase(), name=$("cName").value.trim(), short=$("cShort").value.trim();
  if(!/^[a-z0-9-]{2,24}$/.test(id)||!name){ banner("warn","Enter a short ID (letters, digits, dashes) and the company name","",{autoclose:6000}); return; }
  try{ await DB.addCompany(id,name,short||name); banner("good","Company added","<div><b>"+esc(name)+"</b> exists with you as its first admin. Switch to it at the top of the page to set up its hubs, BOL numbering and feed, and add its people.</div>",{autoclose:12000}); $("cId").value="";$("cName").value="";$("cShort").value=""; }
  catch(e){ banner("bad","Not added","<div>"+esc(e.message)+"</div>"); return; }
  var acc=await DB.me(); state.memberships=acc.memberships; state.companies=acc.companies.filter(function(c){return acc.memberships.some(function(m){return m.company===c.id;});}); renderCompanyPick(); renderCompanies();
}
async function grantFromForm(){
  var email=$("uEmail").value.trim().toLowerCase(), name=$("uName").value.trim(), role=$("uRole").value, hub=$("uHub").value;
  if(!isEmail(email)){ $("uEmail").focus(); banner("warn","Enter an email address","",{autoclose:5000}); return; }
  if(role!=="driver") hub="";
  try{
    var r=await DB.grant(email,name,role,hub);
    banner("good",r==="granted"?"Access granted":"Invited",
      r==="granted"?"<div><b>"+esc(email)+"</b> can sign in now as "+esc(role)+(hub?" for "+esc(hub):"")+".</div>"
        :"<div>Tell <b>"+esc(email)+"</b> to open this app and press <b>Create account</b> with that address, then set a password.</div>",{autoclose:12000});
    $("uEmail").value=""; $("uName").value="";
  }catch(e){ banner("bad","Not added","<div>"+esc(e.message)+"</div>"); }
  renderUsers();
}

/* ============================================================
   Access, sign-in, boot
   ============================================================ */
function applyAccess(){
  var chip=$("roleChip");
  state.isOwner=(state.role==="admin"); state.canEdit=(state.role==="admin"||state.role==="coordinator");
  chip.textContent=state.role==="admin"?"Admin":state.role==="coordinator"?"Coordinator":"Driver"+(state.me&&state.me.hub?" · "+state.me.hub:"");
  chip.className="chip st"+(state.isOwner?" done":"");
  $("whoami").textContent=state.me?(state.me.name||state.me.email):"";
  var ro=!state.canEdit;
  ["btnSubmit","btnSaveHubs","btnAddHub","btnConfirmCal","btnSaveDrive","btnTestDrive","btnSaveSheet","btnRefreshFeed","btnSaveBol","btnSaveOrdersOut","btnRebuildOrdersOut","btnSaveCustomersOut","btnRebuildCustomersOut"].forEach(function(k){ var el=$(k); if(el) el.disabled=ro; });
  document.body.classList.toggle("role-driver",state.role==="driver");
  $("tab-users").hidden=!state.isOwner;
  $("healthCard").hidden=!state.isOwner;
  ["tab-new","tab-bol","tab-setup","tab-customers"].forEach(function(k){ $(k).hidden=ro; });
  $("tab-documents").hidden=!canViewDocs(); if(state.tab==="documents"&&!canViewDocs()) state.tab=ro?"today":"new";
  var drv=state.role==="driver"; $("tab-mydocs").hidden=!drv; if(state.tab==="mydocs"&&!drv) state.tab=ro?"today":"new";   // a driver's own CDL and medical card
  if(ro){ $("btnSubmit").textContent="Drivers cannot create orders"; if(state.tab!=="today"&&state.tab!=="open"&&state.tab!=="mydocs") setTab("today"); }
}
function showLogin(msg,kind){
  $("app").hidden=true; $("login").hidden=false;
  $("loginMsg").innerHTML=msg?'<div class="banner '+(kind||"info")+'"><div>'+msg+"</div></div>":"";
}
async function signIn(ev){
  ev.preventDefault();
  var email=$("lEmail").value.trim().toLowerCase(), pass=$("lPass").value;
  $("btnLogin").disabled=true; $("btnLogin").textContent="Signing in…";
  var r=await supa.auth.signInWithPassword({email:email,password:pass});
  $("btnLogin").disabled=false; $("btnLogin").textContent="Sign in";
  if(r.error){ showLogin(esc(r.error.message||"Sign-in failed. Check the email and password."),"bad"); return; }
  await boot();
}
async function signUp(){
  var email=$("lEmail").value.trim().toLowerCase(), pass=$("lPass").value;
  if(!isEmail(email)||pass.length<8){ showLogin("Enter your email and a password of at least 8 characters, then press Create account.","warn"); return; }
  var r=await supa.auth.signUp({email:email,password:pass,options:{emailRedirectTo:location.origin}});
  if(r.error){ showLogin(esc(r.error.message),"bad"); return; }
  if(r.data&&r.data.session){ await boot(); return; }
  showLogin("Account created. Check <b>"+esc(email)+"</b> for a confirmation email, open the link, then sign in here.","good");
}
async function forgot(){
  var email=$("lEmail").value.trim().toLowerCase();
  if(!isEmail(email)){ showLogin("Enter your email first, then press Forgot password.","warn"); return; }
  var r=await supa.auth.resetPasswordForEmail(email,{redirectTo:location.origin});
  showLogin(r.error?esc(r.error.message):"If that address has an account, a reset link is on its way.",r.error?"bad":"good");
}
async function maybeHandleRecovery(){
  if(location.hash.indexOf("type=recovery")<0) return false;
  var np=prompt("Choose a new password (at least 8 characters):");
  if(np&&np.length>=8){ var r=await supa.auth.updateUser({password:np}); if(r.error) alert(r.error.message); else alert("Password updated."); }
  history.replaceState(null,"",location.pathname);
  return true;
}
async function renderHealth(){
  var host=$("healthState"); if(!host||!state.isOwner) return;
  host.innerHTML='<span class="hint">Checking…</span>';
  try{
    var h=await API.get("/api/health");
    if(!h.googleConfigured){ host.innerHTML='<div class="banner warn" style="margin:0"><div><b>Google isn\'t set up on the server yet</b><div>Add the service account (GOOGLE_SA_JSON) and the Workspace user it acts as (GOOGLE_IMPERSONATE) in Cloudflare Pages → Settings → Variables and Secrets, then redeploy. See the README.</div></div></div>'; return; }
    var c=h.checks||{}, ok=function(v){return typeof v==="string"&&(v==="ok"||v.indexOf("ok ")===0||v.indexOf("ok —")===0);};
    host.innerHTML='<div class="banner '+(Object.values(c).every(ok)?"good":"warn")+'" style="margin:0"><div><b>Acting as '+esc(h.impersonate||"(no user set)")+' · mail goes out as '+esc(h.mailFrom)+' · BOLs to '+esc(h.ordersTo)+' · deposit slips to '+esc(h.accountingTo)+'</b>'+
      '<div>Token: '+esc(c.token||"—")+'<br>AR Command Center: '+esc(c.sheet||"—")+'<br>Calendars: '+esc(c.calendar||"—")+'<br>Drive: '+esc(c.drive||"—")+'<br>Gmail: '+esc(c.gmail||"—")+'<br>Orders Out: '+esc(c.ordersOut||"—")+'<br>Customers Out: '+esc(c.customersOut||"—")+'<br>Import sheet: '+esc(c.importSheet||"—")+'</div></div></div>';
  }catch(e){ host.innerHTML='<div class="banner bad" style="margin:0"><div><b>Server check failed</b><div>'+esc(e.message)+'</div></div></div>'; }
}
function wireAuth(){
  $("loginForm").onsubmit=signIn;
  $("btnSignUp").onclick=signUp;
  $("btnForgot").onclick=forgot;
  $("btnSignOut").onclick=async function(){ await supa.auth.signOut(); state.session=null; state.me=null; showLogin(); };
  $("tab-users").onclick=function(){ setTab("users"); };
  $("btnGrant").onclick=grantFromForm;
  var bac=$("btnAddCompany"); if(bac) bac.onclick=addCompanyFromForm;
  $("btnHealth").onclick=renderHealth;
  $("btnSaveSeg").onclick=async function(){ state.settings.segTable=readSegTable(); await saveSettings(); await DB.logWrite("segtable",{changed:true}); renderSegTable(); banner("good","Compatibility table saved","",{autoclose:5000}); };
  $("btnResetSeg").onclick=async function(){ if(!confirm("Reset the table to the regulation as transcribed?")) return; delete state.settings.segTable; await saveSettings(); renderSegTable(); };
  supa.auth.onAuthStateChange(function(ev,session){ if(ev==="SIGNED_OUT"){ state.session=null; showLogin(); } else if(session) state.session=session; });
}
function pickCompany(id,me){
  var m=state.memberships.find(function(x){return x.company===id;})||state.memberships[0];
  state.company=m.company; state.co=state.companies.find(function(c){return c.id===m.company;})||{id:m.company,name:m.company,short_name:m.company,data:{}};
  state.me=Object.assign({},me||state.me,{role:m.role,hub:m.hub,isSuper:!!m.is_super_admin,perms:m.permissions||{}}); state.role=m.role;
  lsSet("adchem_company",state.company);
  renderCompanyPick();
}
function renderCompanyPick(){
  var sel=$("coPick"); if(!sel) return;
  if(state.memberships.length<2){ sel.hidden=true; sel.innerHTML=""; return; }
  sel.hidden=false;
  sel.innerHTML=state.memberships.map(function(m){var c=state.companies.find(function(x){return x.id===m.company;}); return '<option value="'+esc(m.company)+'"'+(m.company===state.company?" selected":"")+'>'+esc(c?(c.short_name||c.name):m.company)+'</option>';}).join("");
  sel.onchange=async function(){ pickCompany(sel.value); lsSet("adchem_myhub",""); await loadCompanyData(); };
}
async function loadCompanyData(){
  state.todayX=emptyTodayX(); todaySeq++;   // Today's site-note cache belongs to the company just left
  setConn("","Loading…");
  try{
    var r=await Promise.all([DB.hubs(),DB.settings(),DB.orders()]);
    state.hubs=r[0].map(function(h){return Object.assign({},h);}); state.settings=r[1]||{}; state.orders=r[2];
  }catch(e){ banner("bad","Couldn't load","<div>"+esc(e.message)+"</div>",{sticky:true}); }
  applyAccess();
  fillHubSelects(); state.form.lines=[blankLine()]; renderLines(); onCustomerInput(true); refreshId(); updateCounts();
  if(state.me.role==="driver"&&state.me.hub) lsSet("adchem_myhub",state.me.hub);
  await loadSitesFromDb();   // drivers too: the policy limits them to their hub's sites, which Today's site notes read
  if(state.canEdit) await loadCalendars();
  closeCustomer(); state.customers=[]; resetDocs();
  if(state.canEdit){ try{ state.customers=await CDB.customers(); }catch(e){ banner("bad","Couldn't load customers","<div>"+esc(e.message)+"</div>"); } }
  fillAccounts();
  setConn("ok","Connected");
  setTab(state.canEdit?(state.tab||"new"):"today"); renderLive();
}
var booted=false;
async function boot(){
  var s=await supa.auth.getSession(); state.session=s.data.session;
  if(!state.session){ showLogin(); return; }
  var acc=null;
  try{ acc=await DB.me(); }catch(e){ showLogin("Couldn't read your access: "+esc(e.message),"bad"); return; }
  var me=acc&&acc.me, mem=(acc&&acc.memberships)||[];
  if(!me||!me.active||!mem.length){ await supa.auth.signOut(); showLogin("<b>"+esc(state.session.user.email)+"</b> has no access to AdChem Ops. Ask an admin to add you on the People tab.","warn"); state.session=null; return; }
  state.memberships=mem; state.companies=(acc.companies||[]).filter(function(c){return mem.some(function(m){return m.company===c.id;});});
  var want=lsGet("adchem_company",""); if(!mem.some(function(m){return m.company===want;})) want=mem[0].company;
  pickCompany(want,me);
  $("login").hidden=true; $("app").hidden=false;
  if(!booted){ booted=true; fillStatic(); wire(); wirePod(); state.form.lines=[blankLine()]; }
  renderCompanyPick();
  var liveOn=lsGet("adchem_live",true); $("liveWrap").hidden=!liveOn; $("btnLiveToggle").textContent=liveOn?"Hide":"Show";
  state.tab=state.canEdit?lsGet("adchem_tab","new"):"today";
  await loadCompanyData();
  if(state.canEdit){ if(!state.settings.calendarConfirmed) banner("warn","Confirm the delivery calendars before taking orders",'<div>Nothing is written to any calendar until they are set and confirmed on the <b>Setup</b> tab.</div>',{sticky:true,key:"calc"}); if(!Number(state.settings.nextBol)) banner("info","BOL numbering isn't set yet",'<div>Orders can be taken, but none gets a BOL number until the starting number is entered on <b>Setup</b> at cutover from SmartBOL.</div>',{key:"bolnum"}); }
  else setConn("ok","Connected");
  state.lastLoad=new Date();
  setInterval(function(){ if(document.hidden||state.busy||state.editing) return; if(state.tab==="open"||state.tab==="today") reloadFromDb(true); },60000);
  $("foot").innerHTML="<b>Payment codes</b> come from the AR Command Center (FEED_ORDERS) and are never typed here: "+CODE_ORDER.map(function(k){return '<span class="mono">'+esc(CODES[k].text)+"</span>";}).join(" · ")+
    ". <span class=\"mono\">+DEP</span> is added per order. A CHECK order is not scheduled until "+esc(ACCOUNTING_TO)+" clears it.<br><br>"+
    "<b>BOL numbers</b> continue SmartBOL's numeric sequence from the cutover number set on Setup; the Order ID (<span class=\"mono\">HUB-YYMMDD-NN</span>) prints on the BOL as a separate reference. The payment block follows the AdChem BOL — Payment Block Specification (current revision).<br><br>"+
    "<b>Hazmat:</b> shipping descriptions come only from AdChem Product Hazmat Reference v1.1. Verified entries print; dual blend, tri blend and denatured ethanol print blank with the open question named; acetone, methanol, toluene, DCM, d-limonene and CDA-12A are marked DO NOT LOAD. Class 2 gases carry no packing group. Placards follow 49 CFR 172.504; what may ride together follows the 177.848(d) segregation table on Setup.";
}
async function reloadFromDb(silent){
  try{
    var r=await Promise.all([DB.orders(),DB.settings()]); state.orders=r[0]; state.settings=r[1]||state.settings; state.lastLoad=new Date();
    updateCounts(); refreshId();
    if(state.tab==="open") renderOrders(); if(state.tab==="today") renderToday(); if(state.tab==="setup") renderSetup();
    var rn=$("refreshNote"); if(rn) rn.textContent="Updated "+state.lastLoad.toLocaleTimeString([], {hour:"numeric",minute:"2-digit"})+" · "+state.orders.length+" orders";
  }catch(e){ if(!silent) banner("warn","Couldn't refresh","<div>"+esc(e.message)+"</div>",{autoclose:6000}); }
}
$("bolcss").textContent=BOL_CSS;
wireAuth();
maybeHandleRecovery().then(boot);
