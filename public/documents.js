/* AdChem Ops — Documents: licenses, certificates, agreements and their files, for customers, the company and people.
   The customer page's Documents tab and the Documents hub. Loaded after app.js and customers.js; uses their globals
   (state, $, esc, banner, supa, sbErr, API, ymd, safeSeg, shrinkPhoto, newUuid, custSaved, custStill, custEmpty, whoName,
   refreshComplete, openCustomer, setCustTab, setTab). Every query is scoped by state.company.
   Reading records and files needs view_documents, writing needs manage_documents (super admins have both); the database and
   /api/docs enforce the same rules and the screens follow canViewDocs() / canManageDocs(). Without view_documents an editor
   still sees the derived license and PSA status (dispatch_customer_status), never the records.
   Files: bucket dispatch-docs, <company>/document/<subject_type>/<subject_id>/<document_id>/<file_name>; opened through a
   5-minute signed URL from /api/docs, never stored in the page. */

state.docs={}; state.hubDocs=[]; state.docEdit=null;   // docs: rows per "subject_type:subject_id"; docEdit: the record the form is editing

const DOC_TYPES=[["cannabis_license","Cannabis license"],["resale_certificate","Resale certificate"],["psa","PSA"],["chp_hazmat_license","CHP HazMat license"],
  ["dot_registration","DOT registration"],["insurance_certificate","Insurance certificate"],["cdl","CDL"],["medical_card","Medical card"],["other","Other"]];
const DOC_LABEL={}; DOC_TYPES.forEach(function(t){ DOC_LABEL[t[0]]=t[1]; });
const DOC_FIELDS=[["df_title","title"],["df_number","number"],["df_status","status"],["df_issued","issued"],["df_expires","expires"],["df_checked","checked_on"],["df_source","source"],["df_notes","notes"]];
const DOC_DATES={issued:true,expires:true,checked_on:true};
// type-specific fields, kept in extra
const LIC_EXTRA=[["df_licensee","licensee_legal_name"],["df_license_type","license_type"],["df_county","county_premises"],["df_owners","owners"],["df_entity","entity_status_sos"]];
const PSA_EXTRA=[["df_quote_sent","quote_sent"],["df_quote_accepted","quote_accepted"],["df_sent_sig","sent_for_signature"],["df_signed_cust","signed_customer"],["df_countersigned","countersigned"],["df_effective","effective_date"]];
const DOC_EXTRA_KEYS={}; LIC_EXTRA.concat(PSA_EXTRA).forEach(function(f){ DOC_EXTRA_KEYS[f[1]]=true; });
const DOC_MAX=10*1024*1024, DOC_FILE_TYPES=["image/jpeg","image/png","image/webp","application/pdf"];

function canViewDocs(){ var me=state.me||{}; return !!(me.isSuper||(me.perms||{}).view_documents); }
function canManageDocs(){ var me=state.me||{}; return !!(me.isSuper||(me.perms||{}).manage_documents); }
function resetDocs(){ state.docs={}; state.hubDocs=[]; closeDocForm(); }   // on a company switch

const DDB={
  // filter: {subject_type, subject_id, doc_type, review_status}, any subset; sorted by expiry, no expiry last
  async list(filter){ var q=supa.from("dispatch_documents").select("*").eq("company",state.company); filter=filter||{};
    Object.keys(filter).forEach(function(k){ if(filter[k]!=null&&filter[k]!=="") q=q.eq(k,filter[k]); });
    return sbErr(await q.order("expires",{ascending:true,nullsFirst:false}).order("created_at"))||[]; },
  async forSubject(type,id){ var rows=await DDB.list({subject_type:type,subject_id:String(id)}); state.docs[type+":"+id]=rows; return rows; },
  async get(id){ return sbErr(await supa.from("dispatch_documents").select("*").eq("company",state.company).eq("id",id).maybeSingle()); },
  // d with _new (or no id) is inserted under a client-made id; otherwise only the given fields are updated. Returns the id.
  async save(d){
    var row=Object.assign({},d,{company:state.company,updated_by:state.session.user.id,updated_at:new Date().toISOString()});
    if(d.id&&!d._new){ delete row.id; delete row._new; delete row.created_by; delete row.created_at;
      sbErr(await supa.from("dispatch_documents").update(row).eq("company",state.company).eq("id",d.id)); return d.id; }
    row.id=d.id||newUuid(); delete row._new; sbErr(await supa.from("dispatch_documents").insert(row)); return row.id;
  },
  async remove(id){ sbErr(await supa.from("dispatch_documents").delete().eq("company",state.company).eq("id",id)); },
  // photos are shrunk to a JPEG (as POD photos are); PDFs go as they are. Returns the file fields for the document row.
  async upload(file,subjectType,subjectId,docId,avoidName){
    var img=/^image\//.test(file.type||"");
    if(!img&&file.type!=="application/pdf") throw new Error("Pick a photo (JPEG, PNG or WebP) or a PDF.");
    var blob=img?await shrinkPhoto(file):file, type=blob.type||file.type;
    if(DOC_FILE_TYPES.indexOf(type)<0) throw new Error("That kind of photo can't be stored. Take or save it as a JPEG and try again.");
    if(blob.size>DOC_MAX) throw new Error("The file is over 10 MB.");
    var name=docFileName(file.name,blob!==file?".jpg":null);
    if(avoidName&&name===avoidName) name=name.replace(/(\.[a-z0-9]+)?$/,"-"+Date.now()+"$1");   // a replacement never collides with the old object
    var path=[safeSeg(state.company),"document",safeSeg(subjectType),safeSeg(subjectId),safeSeg(docId),name].join("/");
    var up=await supa.storage.from("dispatch-docs").upload(path,blob,{contentType:type,upsert:false});
    if(up.error) throw new Error(up.error.message||String(up.error));
    return {file_path:path,file_name:name,file_size:blob.size,file_type:type};
  },
  async sign(id){ return await API.post("/api/docs",{action:"sign",id:id}); },
  async review(id,decision,reason,fields){ return await API.post("/api/docs",{action:"review",id:id,decision:decision,reason:reason||null,fields:fields||{}}); },
  async due(){ return sbErr(await supa.from("dispatch_documents_due").select("*").eq("company",state.company).order("expires"))||[]; }
};
// safeSeg's rule for the name, keeping the extension (lower-cased); ext replaces it when the file was converted
function docFileName(n,ext){ var m=String(n||"").match(/^(.*?)(\.[A-Za-z0-9]{1,8})?$/)||["","",""];
  return (safeSeg(m[1]).slice(0,80)||"file")+(ext||(m[2]||"").toLowerCase()); }

/* ---------- status ---------- */
function docDayNo(iso){ var s=String(iso); return Math.floor(Date.UTC(+s.slice(0,4),+s.slice(5,7)-1,+s.slice(8,10))/86400000); }
function docDaysLeft(d){ return d.expires?docDayNo(d.expires)-docDayNo(ymd(new Date())):null; }
function docWarnDays(){ var n=Number(state.settings&&state.settings.warnDays); return n>=1?n:30; }
// the view's rule: expired before today, expiring inside the warning window, else valid (a record with no expiry is valid)
function docStatus(d){ var n=docDaysLeft(d); return n==null?"valid":n<0?"expired":n<docWarnDays()?"expiring":"valid"; }
function fmtDay(iso){ if(!iso) return ""; var s=String(iso); return (+s.slice(5,7))+"/"+(+s.slice(8,10))+"/"+s.slice(0,4); }
function docStatusCls(s){ return s==="valid"||s==="signed"?"k-D":s==="expiring"||s==="in_progress"?"warn":"st stop"; }
function docStatusChip(status,expires){ return '<span class="chip '+docStatusCls(status)+'">'+esc(status)+(expires?" "+esc(fmtDay(expires)):"")+"</span>"; }
function psaStage(x){ x=x||{}; var has=function(k){ return x[k]!=null&&String(x[k]).trim()!==""; };
  return has("signed_customer")&&has("countersigned")?"signed":PSA_EXTRA.some(function(f){ return has(f[1]); })?"in_progress":"missing"; }
var PSA_TEXT={signed:"PSA signed",in_progress:"PSA in progress",missing:"PSA not signed"};
// the customer's license and PSA chips from its dispatch_customer_status row; ids only on the header's copy
function custDocChipsHtml(st,noIds){
  st=st||{}; var ls=st.license_status||"missing", ps=st.psa_status||"missing", e=st.license_expires;
  var lt=ls==="missing"?"No license on file":ls==="expired"?"License expired "+fmtDay(e):e?"License expires "+fmtDay(e):"License on file, no expiry";
  return '<span class="chip '+docStatusCls(ls)+'"'+(noIds?"":' id="custLicChip"')+">"+esc(lt)+"</span>"+
    '<span class="chip '+docStatusCls(ps)+'"'+(noIds?"":' id="custPsaChip"')+">"+esc(PSA_TEXT[ps]||PSA_TEXT.missing)+"</span>";
}
function docChipFor(d){
  if(d.review_status==="pending_review") return '<span class="chip warn">pending review</span>';
  if(d.review_status==="rejected") return '<span class="chip st stop">rejected</span>';
  if(d.doc_type==="psa"&&!d.expires){ var p=psaStage(d.extra); return '<span class="chip '+docStatusCls(p)+'">'+esc(PSA_TEXT[p])+"</span>"; }
  return docStatusChip(docStatus(d),d.expires);
}
function docLabel(d){ return d.doc_type==="other"&&d.title?d.title:(DOC_LABEL[d.doc_type]||d.doc_type)+(d.title?" · "+d.title:""); }
function docSubjectName(d){
  if(d.subject_type==="customer"){ var c=(state.customers||[]).find(function(x){ return x.id===d.subject_id; }); return c?c.name:"Customer"; }
  if(d.subject_type==="company") return (state.co&&(state.co.short_name||state.co.name))||d.subject_id;
  return whoName(d.subject_id);
}
function docById(id){ var all=state.hubDocs.slice(); Object.keys(state.docs).forEach(function(k){ all=all.concat(state.docs[k]); });
  return all.find(function(d){ return d.id===id; })||null; }
// type, number, status, dates, file and buttons — one record, on the customer page or in the hub
function docMetaHtml(d){
  var bits=[];
  if(d.issued) bits.push("issued "+fmtDay(d.issued)); if(d.expires) bits.push("expires "+fmtDay(d.expires)); if(d.checked_on) bits.push("checked "+fmtDay(d.checked_on));
  return docChipFor(d)+(d.status?' <span class="hint">'+esc(d.status)+"</span>":"")+
    (bits.length?'<span class="hint">'+esc(bits.join(" · "))+"</span>":"")+
    '<span class="hint doc-file">'+(d.file_path?esc(d.file_name||"file"):"no file")+"</span>";
}
function docButtonsHtml(d,editAttr){
  return '<span class="doc-btns">'+(d.file_path?'<button class="btn sm" type="button" data-open="'+esc(d.id)+'">Open file</button>':"")+
    (editAttr&&canManageDocs()?'<button class="btn sm" type="button" '+editAttr+'="'+esc(d.id)+'">Edit</button>':"")+"</span>";
}

/* ---------- customer page: Documents tab ---------- */
async function renderCustDocs(){
  var c=state.customer; if(!c) return;
  var view=canViewDocs(), saved=custSaved();
  $("docChips").innerHTML=saved?custDocChipsHtml(state.custStatus[c.id],true):"";
  $("docPermNote").hidden=view; $("docHead").hidden=!view;
  $("btnAddDoc").hidden=!view; $("btnAddDoc").disabled=!canManageDocs()||!saved;
  var e=state.docEdit; if(e&&(e.where!=="customer"||e.subject_id!==String(c.id))) closeDocForm();
  $("cpane-documents").insertBefore($("docForm"),$("docList"));
  if(!view){ closeDocForm(); $("docList").innerHTML=""; return; }
  if(!saved){ $("docList").innerHTML=custEmpty("Save the customer first","Documents can be added once the customer has an ID."); return; }
  var rows=await DDB.forSubject("customer",c.id); if(!custStill(c)) return;
  $("docList").innerHTML=rows.map(function(d){
    return '<div class="doc-row'+(d.review_status==="rejected"?" off":"")+'" data-doc="'+esc(d.id)+'"><div class="doc-name"><b>'+esc(docLabel(d))+"</b>"+
      (d.number?' <span class="mono">'+esc(d.number)+"</span>":"")+(d.notes?'<div class="hint">'+esc(d.notes)+"</div>":"")+"</div>"+
      '<div class="doc-meta">'+docMetaHtml(d)+"</div>"+docButtonsHtml(d,"data-edit-doc")+"</div>"; }).join("")
    ||custEmpty("No documents yet",canManageDocs()?"Press Add document to record a license, certificate or PSA, with or without a file.":"Someone with the Manage documents permission can add them.");
}

/* ---------- the form (one, moved between the customer page and the hub) ---------- */
function docTypeFields(){ var t=$("df_type").value; $("dfLicense").hidden=t!=="cannabis_license"; $("dfPsa").hidden=t!=="psa"; }
function openDocForm(subjectType,subjectId,d,where){
  if(!canViewDocs()) return;
  d=d||{}; var f=$("docForm"), ro=!canManageDocs();
  if(!d.id&&ro) return;
  state.docEdit={subject_type:subjectType,subject_id:String(subjectId),id:d.id||null,where:where,file_name:d.file_path?d.file_name:null};
  if(where==="hub"){ $("dhFormHost").appendChild(f); $("dhFormHost").hidden=false; }
  else { $("cpane-documents").insertBefore(f,$("docList")); $("dhFormHost").hidden=true; }
  $("df_type").value=d.doc_type||(subjectType==="company"?"chp_hazmat_license":subjectType==="person"?"cdl":"cannabis_license");
  DOC_FIELDS.forEach(function(x){ var v=d[x[1]]; $(x[0]).value=v==null?"":String(v); });
  var ex=d.extra||{}; LIC_EXTRA.concat(PSA_EXTRA).forEach(function(x){ var v=ex[x[1]]; $(x[0]).value=v==null?"":String(v); });
  $("df_file").value="";
  $("dfFileNow").textContent=d.file_path?"On file: "+(d.file_name||"file")+(ro?"":". Choosing another file replaces it."):"";
  f.querySelectorAll("input,select,textarea").forEach(function(el){ el.disabled=ro; });
  $("dfSave").hidden=ro; $("dfDelete").hidden=ro||!d.id; $("dfSave").disabled=false;
  $("dfSave").textContent=d.id?"Save changes":"Save document"; $("dfCancel").textContent=ro?"Close":"Cancel";
  docTypeFields(); f.hidden=false; if(!ro) $("df_number").focus();
}
function closeDocForm(){ var f=$("docForm"); if(!f) return; f.hidden=true; state.docEdit=null; $("df_file").value=""; $("dhFormHost").hidden=true; }
function readDocForm(old){
  var t=$("df_type").value, row={doc_type:t}, extra={};
  DOC_FIELDS.forEach(function(x){ var v=$(x[0]).value.trim(); row[x[1]]=DOC_DATES[x[1]]?(v||null):v; });
  Object.keys((old&&old.extra)||{}).forEach(function(k){ if(!DOC_EXTRA_KEYS[k]) extra[k]=old.extra[k]; });   // keys this form doesn't edit stay
  (t==="cannabis_license"?LIC_EXTRA:t==="psa"?PSA_EXTRA:[]).forEach(function(x){ var v=$(x[0]).value.trim(); if(v) extra[x[1]]=v; });
  row.extra=extra;
  row.checked_by=row.checked_on?(old&&old.checked_on===row.checked_on&&old.checked_by?old.checked_by:state.session.user.id):null;
  return row;
}
async function saveDocForm(){
  var e=state.docEdit; if(!e||!canManageDocs()) return;
  var old=e.id?docById(e.id):null, file=$("df_file").files[0]||null, row=readDocForm(old);
  if(!row.number&&!row.title&&!row.expires&&!file&&!Object.keys(row.extra).length&&!(old&&old.file_path)){
    banner("warn","Add a number, date or file","<div>A document needs at least its number, an expiry, a type-specific detail or a file.</div>",{autoclose:6000}); $("df_number").focus(); return; }
  if(row.doc_type==="other"&&!row.title){ banner("warn","Give the document a title","<div>An <b>Other</b> document is named by its title.</div>",{autoclose:6000}); $("df_title").focus(); return; }
  Object.assign(row,{subject_type:e.subject_type,subject_id:e.subject_id});
  if(e.id) row.id=e.id; else { row._new=true; row.id=newUuid(); }
  var btn=$("dfSave"), where=e.where; btn.disabled=true; btn.textContent="Saving…";
  var id;
  try{ id=await DDB.save(row); }
  catch(err){ banner("bad","Document not saved","<div>"+esc(err.message)+"</div>"); btn.disabled=false; btn.textContent=e.id?"Save changes":"Save document"; return; }
  var fileOk=true;
  if(file){ try{ var meta=await DDB.upload(file,e.subject_type,e.subject_id,id,e.file_name); await DDB.save(Object.assign({id:id},meta)); }
    catch(err){ fileOk=false; banner("warn","File not uploaded","<div>"+esc(err.message)+" The record is saved"+(old&&old.file_path?" with its earlier file":" without a file")+"; open it and choose the file again.</div>",{key:"docfile"}); } }
  closeDocForm();
  if(fileOk) banner("good","Document saved","<div>"+esc(DOC_LABEL[row.doc_type]||row.doc_type)+(row.number?" "+esc(row.number):"")+"</div>",{autoclose:4000});
  await afterDocChange(where,e.subject_type);
}
async function afterDocChange(where,subjectType){
  try{
    if(where==="customer"&&state.tab==="customers"&&state.customer){ await renderCustDocs(); await refreshComplete(); }
    if(state.tab==="documents") await renderDocsHub();
  }catch(err){ banner("bad","Couldn't reload the documents","<div>"+esc(err.message)+"</div>"); }
}
async function deleteDoc(){
  var e=state.docEdit; if(!e||!e.id||!canManageDocs()) return;
  if(!confirm("Delete this document record? Its file is kept in storage but no longer listed.")) return;
  try{ await DDB.remove(e.id); var where=e.where; closeDocForm(); banner("good","Document deleted","",{autoclose:4000}); await afterDocChange(where); }
  catch(err){ banner("bad","Document not deleted","<div>"+esc(err.message)+"</div>"); }
}
async function openDocFile(id,btn){
  if(!canViewDocs()) return;
  // the tab opens now, inside the click, so a popup blocker lets it through; it is pointed at the signed URL once that comes back
  var w=null; try{ w=window.open("","_blank"); }catch(e){ w=null; }
  if(btn) btn.disabled=true;
  try{ var r=await DDB.sign(id); if(!r||!r.url) throw new Error("No link came back for the file.");
    if(w) w.location=r.url; else window.open(r.url,"_blank"); }
  catch(err){ if(w) try{ w.close(); }catch(e){} banner("bad","Couldn't open the file","<div>"+esc(err.message)+"</div>"); }
  if(btn) btn.disabled=false;
}

/* ---------- the Documents hub ---------- */
async function renderDocsHub(){
  $("btnAddCompanyDoc").disabled=!canManageDocs();
  if(state.docEdit&&state.docEdit.where!=="hub") closeDocForm();
  if(!canViewDocs()){ state.hubDocs=[]; $("dhList").innerHTML=custEmpty("No access","Documents need the View documents permission."); return; }
  var co=state.company;
  try{ var rows=await DDB.list(); if(co!==state.company) return; state.hubDocs=rows; }
  catch(err){ banner("bad","Couldn't load the documents","<div>"+esc(err.message)+"</div>"); }
  drawDocsHub();
}
function drawDocsHub(){
  var host=$("dhList"); if(!host) return;
  var q=$("dhSearch").value.trim().toLowerCase(), type=$("dhType").value, subj=$("dhSubject").value, exp=$("dhExpiring").value, pend=$("dhPending").checked;
  var all=state.hubDocs.filter(function(d){ return d.review_status!=="rejected"; });
  $("dhPendingCount").textContent=String(all.filter(function(d){ return d.review_status==="pending_review"; }).length);
  if(!all.length){ host.innerHTML=custEmpty("No documents yet",canManageDocs()?"Add them on a customer's Documents tab, or press Add company document.":"Someone with the Manage documents permission can add them."); return; }
  var list=all.filter(function(d){
    if(type&&d.doc_type!==type) return false;
    if(subj&&d.subject_type!==subj) return false;
    if(pend&&d.review_status!=="pending_review") return false;
    if(exp!=="all"){ var n=docDaysLeft(d); if(n==null||n>Number(exp)) return false; }
    if(q&&[docSubjectName(d),d.number,d.title,DOC_LABEL[d.doc_type],d.status,d.file_name].join(" ").toLowerCase().indexOf(q)<0) return false;
    return true; }).sort(function(a,b){ if(a.expires===b.expires) return 0; if(!a.expires) return 1; if(!b.expires) return -1; return a.expires<b.expires?-1:1; });
  if(!list.length){ host.innerHTML=custEmpty("No documents match","Clear the search or filters to see all "+all.length+"."); return; }
  host.innerHTML=list.map(function(d){
    return '<div class="doc-row hub" role="button" tabindex="0" data-hdoc="'+esc(d.id)+'"><div class="doc-name"><b>'+esc(docSubjectName(d))+"</b> "+
      '<span class="chip k-none">'+esc(d.subject_type==="company"?"AdChem":d.subject_type)+"</span><div>"+esc(docLabel(d))+(d.number?' <span class="mono">'+esc(d.number)+"</span>":"")+"</div></div>"+
      '<div class="doc-meta">'+docMetaHtml(d)+"</div>"+docButtonsHtml(d,null)+"</div>"; }).join("");
}
async function openHubDoc(id){
  var d=state.hubDocs.find(function(x){ return x.id===id; }); if(!d) return;
  if(d.subject_type==="customer"){ setTab("customers"); await openCustomer(d.subject_id); if(state.customer&&state.customer.id===d.subject_id) setCustTab("documents"); return; }
  openDocForm(d.subject_type,d.subject_id,d,"hub"); window.scrollTo(0,0);
}

function wireDocuments(){
  $("tab-documents").onclick=function(){ setTab("documents"); };
  var opts=DOC_TYPES.map(function(t){ return '<option value="'+esc(t[0])+'">'+esc(t[1])+"</option>"; }).join("");
  $("df_type").innerHTML=opts; $("dhType").innerHTML='<option value="">All types</option>'+opts;
  $("df_type").onchange=docTypeFields;
  $("btnAddDoc").onclick=function(){ if(canManageDocs()&&custSaved()) openDocForm("customer",state.customer.id,null,"customer"); };
  $("dfSave").onclick=saveDocForm; $("dfCancel").onclick=closeDocForm; $("dfDelete").onclick=deleteDoc;
  $("docList").onclick=function(ev){ var o=ev.target.closest("[data-open]"); if(o){ openDocFile(o.getAttribute("data-open"),o); return; }
    var e=ev.target.closest("[data-edit-doc]"); if(e&&state.customer) openDocForm("customer",state.customer.id,docById(e.getAttribute("data-edit-doc")),"customer"); };
  $("dhSearch").oninput=drawDocsHub;
  ["dhType","dhSubject","dhExpiring","dhPending"].forEach(function(k){ $(k).onchange=drawDocsHub; });
  $("btnAddCompanyDoc").onclick=function(){ if(canManageDocs()) openDocForm("company",state.company,null,"hub"); };
  var list=$("dhList");
  list.onclick=function(ev){ var o=ev.target.closest("[data-open]"); if(o){ openDocFile(o.getAttribute("data-open"),o); return; }
    var r=ev.target.closest("[data-hdoc]"); if(r) openHubDoc(r.getAttribute("data-hdoc")); };
  list.onkeydown=function(ev){ if(ev.key!=="Enter"&&ev.key!==" ") return; if(ev.target.closest("[data-open]")) return;
    var r=ev.target.closest("[data-hdoc]"); if(r){ ev.preventDefault(); openHubDoc(r.getAttribute("data-hdoc")); } };
}
