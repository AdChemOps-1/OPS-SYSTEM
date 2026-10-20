/* AdChem Ops — Setup: the one-time customer import (spec §8). Read the office's customer workbook, review one row per source
   row (each with a proposed action you can change), then import. Loaded after app.js and customers.js; uses their globals
   (state, $, esc, banner, API, DB, CDB, sheetIdFrom, saveSettings). Shown only with the run_imports permission (or super admin);
   /api/import enforces the same rule. Money columns are never read: terms, credit and balances stay in the AR Command Center. */

state.importPlan=null;   // {company, sheetId, plan} — the plan read for the company it belongs to

function canRunImports(){ var me=state.me||{}; return !!(state.canEdit&&(me.isSuper||(me.perms||{}).run_imports)); }
const IMPORT_LABELS={customer:"Customer",site:"Site of the customer above",related:"Related customer",skip:"Skip"};

function renderImportCard(){
  var card=$("importCard"); if(!card) return;
  card.hidden=!canRunImports(); if(card.hidden) return;
  if(state.importPlan&&state.importPlan.company!==state.company) state.importPlan=null;
  $("sImportSheet").value=state.settings.importSheetId||"";
  $("importState").innerHTML=state.settings.importSheetId?"":'<div class="banner info" style="margin:0"><div><b>No workbook read yet.</b><div>Paste the link to the office\'s customer workbook and read it. Nothing is written until you press <b>Import</b>.</div></div></div>';
  renderImportPlan();
}
function renderImportPlan(){
  var host=$("importPlan"), ip=state.importPlan; $("btnImportCommit").disabled=!ip;
  if(!ip){ host.innerHTML=""; return; }
  var p=ip.plan, items=p.items||[];
  var probs=(p.problems||[]).length?'<div class="banner bad" style="margin:0 0 9px"><div><b>'+p.problems.length+' problem'+(p.problems.length>1?"s":"")+' in the workbook</b><ul style="margin:4px 0 0 18px;padding:0">'+
    p.problems.map(function(x){return "<li>"+esc(x)+"</li>";}).join("")+"</ul></div></div>":"";
  var red="color:var(--red)";
  host.innerHTML=probs+'<div class="hint" style="margin-bottom:6px">'+items.length+' rows from '+esc(ip.sheetId)+'. Change a row\'s action before importing; skipped rows are not written.</div>'+
    '<div style="overflow-x:auto"><table class="imp-table" style="border-collapse:collapse;font-size:12px;width:100%">'+
    '<thead><tr><th style="text-align:left;padding:4px 6px">Source</th><th style="text-align:left;padding:4px 6px">Action</th><th style="text-align:left;padding:4px 6px">Name</th><th style="text-align:left;padding:4px 6px">ID</th><th style="text-align:left;padding:4px 6px">Detail</th></tr></thead><tbody>'+
    items.map(function(it){
      var opts=(it.options&&it.options.length?it.options:[it.decision||"skip"]);
      var bad=it.action==="problem", td='<td style="padding:4px 6px;border-top:1px solid var(--line);vertical-align:top'+(bad?";"+red:"")+'">';
      return '<tr data-item="'+esc(it.key)+'">'+td+esc(it.source.tab)+(it.source.row?" · row "+esc(it.source.row):"")+"</td>"+
        td+'<select data-decision="'+esc(it.key)+'"'+(opts.length<2?" disabled":"")+">"+opts.map(function(o){return '<option value="'+esc(o)+'"'+(o===it.decision?" selected":"")+">"+esc(IMPORT_LABELS[o]||o)+"</option>";}).join("")+"</select></td>"+
        td+"<b>"+esc(it.name)+"</b></td>"+td+'<span class="mono">'+esc(it.action==="site"&&it.decision==="site"?"—":it.customer_id||"—")+"</span></td>"+td+esc(it.detail||"")+"</td></tr>";
    }).join("")+"</tbody></table></div>";
  host.querySelectorAll("[data-decision]").forEach(function(sel){ sel.onchange=function(){
    var it=items.find(function(x){return x.key===sel.getAttribute("data-decision");}); if(it){ it.decision=sel.value; renderImportPlan(); } }; });
}
async function readImport(){
  if(!canRunImports()) return;
  var raw=$("sImportSheet").value.trim(), id=sheetIdFrom(raw);
  if(!id){ banner("bad","That doesn't look like a spreadsheet link","<div>Paste the full link to the customer workbook, or just its ID.</div>"); return; }
  if(id!==state.settings.importSheetId){ state.settings.importSheetId=id; await saveSettings(); }
  var btn=$("btnImportRead"); btn.disabled=true; btn.textContent="Reading…"; $("importResult").innerHTML="";
  try{ var r=await API.post("/api/import",{action:"read"}); state.importPlan={company:state.company,sheetId:r.sheetId,plan:r.plan}; }
  catch(e){ banner("bad","Workbook not read","<div>"+esc(e.message)+"</div>"); }
  btn.disabled=false; btn.textContent="Read the workbook"; renderImportCard();
}
async function commitImport(){
  var ip=state.importPlan; if(!ip||!canRunImports()) return;
  var n=ip.plan.items.filter(function(i){return i.decision!=="skip";}).length;
  if(!confirm("Import "+n+" rows into this company's customers? Fields someone has edited in the app are kept; only their blanks are filled.")) return;
  var btn=$("btnImportCommit"); btn.disabled=true; btn.textContent="Importing…";
  try{
    var r=await API.post("/api/import",{action:"commit",plan:ip.plan}), c=r.counts||{};
    state.importPlan=null;
    $("importResult").innerHTML='<div class="banner good" style="margin:9px 0 0"><div><b>Import done.</b><div>'+esc(c.customers)+" customers, "+esc(c.sites)+" sites, "+esc(c.hubNotes)+" route notes and "+esc(c.contacts)+" new contacts written; "+esc(c.skipped)+" rows skipped. The next new customer is ADC-"+esc(String(r.nextCustomerNumber).padStart(4,"0"))+".</div></div></div>"+
      ((r.problems||[]).length?'<div class="banner warn" style="margin:9px 0 0"><div><b>Not imported</b><ul style="margin:4px 0 0 18px;padding:0">'+r.problems.map(function(x){return "<li>"+esc(x)+"</li>";}).join("")+"</ul></div></div>":"");
    if(r.customersOut&&!r.customersOut.ok&&!r.customersOut.skipped) banner("warn","Customers Out not rebuilt","<div>"+esc(r.customersOut.error||"")+" The import is saved; press <b>Rebuild Customers Out</b> when the sheet is reachable.</div>",{autoclose:12000});
    // the server moved nextCustomerNumber: reload settings so a later Setup save does not write the old number back
    try{ state.settings=(await DB.settings())||state.settings; state.customers=await CDB.customers(); await loadSitesFromDb(); }catch(e){}
  }catch(e){ banner("bad","Import not written","<div>"+esc(e.message)+"</div>"); }
  btn.textContent="Import the reviewed rows"; renderImportCard();
}
function wireImport(){
  var r=$("btnImportRead"), c=$("btnImportCommit"); if(!r||!c) return;
  r.onclick=readImport; c.onclick=commitImport;
}
