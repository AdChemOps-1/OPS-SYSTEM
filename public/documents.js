/* AdChem Ops — Documents: licenses, certificates, agreements and their files, for customers, the company and people.
   The customer page's Documents tab, the Documents hub with its queue of driver captures to review, and each member's documents
   on People. Loaded after app.js and customers.js; uses their globals
   (state, $, esc, banner, supa, sbErr, API, DB, ymd, safeSeg, shrinkPhoto, newUuid, custSaved, custStill, custEmpty, whoName,
   fmtWhen, refreshComplete, openCustomer, setCustTab, setTab); app.js's renderUsers calls personDocsHtml and parkDocForm. Every query is scoped by state.company.
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
// [form id, extra key, label, input type]; the review form uses the same fields with rv_ ids
const LIC_EXTRA=[["df_licensee","licensee_legal_name","Licensee legal name"],["df_license_type","license_type","License type"],["df_county","county_premises","County of premises"],
  ["df_owners","owners","Owners"],["df_entity","entity_status_sos","Entity status (Secretary of State)"]];
const PSA_EXTRA=[["df_quote_sent","quote_sent","Quote sent","date"],["df_quote_accepted","quote_accepted","Quote accepted","date"],["df_sent_sig","sent_for_signature","Sent for signature","date"],
  ["df_signed_cust","signed_customer","Signed by customer","date"],["df_countersigned","countersigned","Countersigned","date"],["df_effective","effective_date","Effective date","date"]];
const DOC_EXTRA_KEYS={}; LIC_EXTRA.concat(PSA_EXTRA).forEach(function(f){ DOC_EXTRA_KEYS[f[1]]=true; });
const DOC_MAX=10*1024*1024, DOC_FILE_TYPES=["image/jpeg","image/png","image/webp","application/pdf"];

function canViewDocs(){ var me=state.me||{}; return !!(me.isSuper||(me.perms||{}).view_documents); }
function canManageDocs(){ var me=state.me||{}; return !!(me.isSuper||(me.perms||{}).manage_documents); }
function resetDocs(){ state.docs={}; state.hubDocs=[]; state.docUsersTried=false; state.capturedDocs={}; closeDocForm(); }   // on a company switch
function defaultDocType(subjectType){ return subjectType==="company"?"chp_hazmat_license":subjectType==="person"?"cdl":"cannabis_license"; }

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

// one record in a subject's list (customer page, a person on People)
function docRowHtml(d,editAttr){
  return '<div class="doc-row'+(d.review_status==="rejected"?" off":"")+'" data-doc="'+esc(d.id)+'"><div class="doc-name"><b>'+esc(docLabel(d))+"</b>"+
    (d.number?' <span class="mono">'+esc(d.number)+"</span>":"")+(d.notes?'<div class="hint">'+esc(d.notes)+"</div>":"")+"</div>"+
    '<div class="doc-meta">'+docMetaHtml(d)+"</div>"+docButtonsHtml(d,editAttr)+"</div>";
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
  $("docList").innerHTML=rows.map(function(d){ return docRowHtml(d,"data-edit-doc"); }).join("")
    ||custEmpty("No documents yet",canManageDocs()?"Press Add document to record a license, certificate or PSA, with or without a file.":"Someone with the Manage documents permission can add them.");
}

/* ---------- the form (one, moved between the customer page and the hub) ---------- */
function docTypeFields(){ var t=$("df_type").value; $("dfLicense").hidden=t!=="cannabis_license"; $("dfPsa").hidden=t!=="psa"; }
function openDocForm(subjectType,subjectId,d,where){
  if(!canViewDocs()) return;
  d=d||{}; var f=$("docForm"), ro=!canManageDocs();
  if(!d.id&&ro) return;
  state.docEdit={subject_type:subjectType,subject_id:String(subjectId),id:d.id||null,where:where,file_name:d.file_path?d.file_name:null};
  var ph=where==="person"?$("personDocs-"+subjectId):null;
  if(where==="hub"){ $("dhFormHost").appendChild(f); $("dhFormHost").hidden=false; }
  else if(ph){ ph.insertBefore(f,ph.querySelector(".pdocs-list")); $("dhFormHost").hidden=true; }
  else { state.docEdit.where="customer"; $("cpane-documents").insertBefore(f,$("docList")); $("dhFormHost").hidden=true; }
  $("df_type").value=d.doc_type||defaultDocType(subjectType);
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
// before People redraws its list: the one form must not be inside it when it is replaced
function parkDocForm(){ var f=$("docForm"); if(!f||!f.closest("#userList")) return; closeDocForm(); $("cpane-documents").insertBefore(f,$("docList")); }
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
  await afterDocChange(where,e.subject_type,e.subject_id);
  if(e.subject_type==="customer") afterCustomerSave(e.subject_id);   // Customers Out carries license/PSA/entity status
}
async function afterDocChange(where,subjectType,subjectId){
  try{
    if(where==="customer"&&state.tab==="customers"&&state.customer){ await renderCustDocs(); await refreshComplete(); }
    if(where==="person"&&subjectId) await renderPersonDocs(subjectId);
    if(state.tab==="documents") await renderDocsHub();
  }catch(err){ banner("bad","Couldn't reload the documents","<div>"+esc(err.message)+"</div>"); }
}
async function deleteDoc(){
  var e=state.docEdit; if(!e||!e.id||!canManageDocs()) return;
  if(!confirm("Delete this document record? Its file is kept in storage but no longer listed.")) return;
  try{ await DDB.remove(e.id); var where=e.where; closeDocForm(); banner("good","Document deleted","",{autoclose:4000}); await afterDocChange(where,e.subject_type,e.subject_id); if(e.subject_type==="customer") afterCustomerSave(e.subject_id); }
  catch(err){ banner("bad","Document not deleted","<div>"+esc(err.message)+"</div>"); }
}
// own: a driver opening their own document on My documents (the database lets them read only those)
async function openDocFile(id,btn,own){
  if(!canViewDocs()&&!own) return;
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
  if(!canViewDocs()){ state.hubDocs=[]; drawReview(); $("dhList").innerHTML=custEmpty("No access","Documents need the View documents permission."); return; }
  var co=state.company, me=state.me||{};
  // person rows are named from People's list; an admin or super admin who hasn't opened People loads it once
  if(!(state.users||[]).length&&!state.docUsersTried&&(state.isOwner||me.isSuper)){ state.docUsersTried=true;
    try{ var us=await DB.users(); if(co!==state.company) return; if(!(state.users||[]).length) state.users=us; }catch(err){ /* names fall back to the short id */ } }
  try{ var rows=await DDB.list(); if(co!==state.company) return; state.hubDocs=rows; }
  catch(err){ banner("bad","Couldn't load the documents","<div>"+esc(err.message)+"</div>"); }
  drawReview(); drawDocsHub();
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
  if(d.review_status==="pending_review"){ var it=reviewItem(id); if(it){ it.open=true; it.scrollIntoView({block:"start"}); } return; }
  if(d.subject_type==="customer"){ setTab("customers"); await openCustomer(d.subject_id); if(state.customer&&state.customer.id===d.subject_id) setCustTab("documents"); return; }
  openDocForm(d.subject_type,d.subject_id,d,"hub"); window.scrollTo(0,0);
}

/* ---------- the review queue: driver captures (photos taken at delivery) waiting to be typed in and approved ----------
   One capture is expanded at a time: its photo comes through a signed URL fetched on expand (never stored) and its form
   (rv_ ids) is built then and dropped when it closes. Approve writes the typed fields through dispatch_approve_capture,
   which also retires a live record of the same type and number for the subject; reject keeps the reason in its notes. */
function reviewItem(id){ var host=$("dhReviewList"); if(!host) return null;
  return Array.prototype.find.call(host.querySelectorAll("[data-review]"),function(x){ return x.getAttribute("data-review")===id; })||null; }
function drawReview(){
  var sec=$("dhReview"), host=$("dhReviewList"); if(!sec||!host) return;
  var rows=canViewDocs()?state.hubDocs.filter(function(d){ return d.review_status==="pending_review"; })
    .sort(function(a,b){ return String(a.created_at||"")<String(b.created_at||"")?-1:1; }):[];
  sec.hidden=!rows.length; $("dhReviewCount").textContent=String(rows.length);
  host.innerHTML=rows.map(function(d){ var ex=d.extra||{};
    return '<details class="rv-item" data-review="'+esc(d.id)+'"><summary><b>'+esc(docSubjectName(d))+'</b> <span class="chip warn">pending review</span> <span>'+esc(docLabel(d))+"</span>"+
      '<span class="hint">'+esc(["taken "+fmtWhen(d.created_at),"by "+whoName(d.created_by)].concat(ex.order_id?["order "+ex.order_id]:[]).join(" · "))+"</span></summary>"+
      '<div class="rv-body"></div></details>'; }).join("");
}
function rvField(id,label,val,type,ph){
  return '<label class="f">'+esc(label)+'<input id="'+id+'"'+(type?' type="'+type+'"':' autocomplete="off"')+' value="'+esc(val==null?"":String(val))+'"'+(ph?' placeholder="'+esc(ph)+'"':"")+"></label>"; }
function rvExtraFields(list,ex){ return list.map(function(x){ return rvField(x[0].replace(/^df_/,"rv_"),x[2],ex[x[1]],x[3]); }).join(""); }
function reviewFormHtml(d){
  var ro=!canManageDocs(), ex=d.extra||{}, typed=d.doc_type&&d.doc_type!=="other", type=typed?d.doc_type:defaultDocType(d.subject_type);
  var img=/^image\//.test(d.file_type||"")||/\.(jpe?g|png|webp)$/i.test(d.file_path||"");
  return (d.file_path?(img?'<img class="rv-thumb" alt="Photo of the capture">':"")+
      '<div class="rv-file"><span class="hint rv-thumbnote">'+esc(img?"":"The capture is a "+(d.file_type||"file")+".")+'</span><button class="btn sm" type="button" data-open="'+esc(d.id)+'">Open file</button></div>'
      :'<p class="hint">This capture has no file.</p>')+
    '<div class="grid three"><label class="f">Type<select id="rv_type">'+DOC_TYPES.map(function(t){ return '<option value="'+esc(t[0])+'"'+(t[0]===type?" selected":"")+">"+esc(t[1])+"</option>"; }).join("")+"</select></label>"+
      rvField("rv_title","Title",typed?d.title:"","","label, for Other")+rvField("rv_number","Number",d.number)+"</div>"+
    '<div class="grid three" style="margin-top:11px">'+rvField("rv_status","Status as issued",d.status,"","Active, Suspended…")+rvField("rv_issued","Issued",d.issued,"date")+rvField("rv_expires","Expires",d.expires,"date")+"</div>"+
    '<div id="rvLicense"'+(type==="cannabis_license"?"":" hidden")+'><h3 class="sec-h" style="margin-top:14px">License details</h3><div class="grid three">'+rvExtraFields(LIC_EXTRA,ex)+"</div></div>"+
    '<div id="rvPsa"'+(type==="psa"?"":" hidden")+'><h3 class="sec-h" style="margin-top:14px">PSA stages</h3><div class="grid three">'+rvExtraFields(PSA_EXTRA,ex)+"</div></div>"+
    '<label class="f" style="margin-top:11px">Notes<textarea id="rv_notes">'+esc(d.notes||"")+"</textarea></label>"+
    (ro?'<p class="hint">Someone with the Manage documents permission can approve or reject it.</p>'
      :'<div class="rv-btns"><button class="btn primary" type="button" data-approve="'+esc(d.id)+'">Approve</button><button class="btn danger" type="button" data-reject="'+esc(d.id)+'">Reject</button></div>');
}
function reviewTypeFields(){ var t=$("rv_type"); if(!t) return; $("rvLicense").hidden=t.value!=="cannabis_license"; $("rvPsa").hidden=t.value!=="psa"; }
async function openReview(det){
  var id=det.getAttribute("data-review"), d=docById(id); if(!d) return;
  $("dhReviewList").querySelectorAll("details[open]").forEach(function(o){ if(o!==det){ o.open=false; o.querySelector(".rv-body").innerHTML=""; } });
  var body=det.querySelector(".rv-body"); body.innerHTML=reviewFormHtml(d);
  if(!canManageDocs()) body.querySelectorAll("input,select,textarea").forEach(function(el){ el.disabled=true; });
  var img=body.querySelector("img.rv-thumb"); if(!img) return;
  try{ var r=await DDB.sign(id); if(!r||!r.url) throw new Error("No link came back for the photo.");
    if(det.open&&img.isConnected) img.src=r.url; }
  catch(err){ var n=body.querySelector(".rv-thumbnote"); if(n&&n.isConnected){ n.textContent="Couldn't load the photo: "+err.message; img.remove(); } }
}
function readReviewForm(d){
  var t=$("rv_type").value, v=function(k){ return $(k).value.trim(); }, extra={}, old=d.extra||{};
  Object.keys(old).forEach(function(k){ if(!DOC_EXTRA_KEYS[k]) extra[k]=old[k]; });   // keys the form doesn't edit (the order the photo came from) stay
  (t==="cannabis_license"?LIC_EXTRA:t==="psa"?PSA_EXTRA:[]).forEach(function(x){ var val=v(x[0].replace(/^df_/,"rv_")); if(val) extra[x[1]]=val; });
  return {doc_type:t,title:v("rv_title"),number:v("rv_number"),status:v("rv_status"),issued:v("rv_issued")||null,expires:v("rv_expires")||null,notes:v("rv_notes"),extra:extra};
}
async function reviewCapture(id,decision){
  if(!canManageDocs()) return;
  var d=docById(id); if(!d) return;
  var fields=null, reason=null;
  if(decision==="approve"){ if(!$("rv_type")) return; fields=readReviewForm(d);
    if(fields.doc_type==="other"&&!fields.title){ banner("warn","Give the document a title","<div>An <b>Other</b> document is named by its title.</div>",{autoclose:6000}); $("rv_title").focus(); return; } }
  else { reason=prompt("Why is this capture rejected? The reason is kept on the record.",""); if(reason==null||!reason.trim()) return; reason=reason.trim().slice(0,300); }
  var item=reviewItem(id); if(item) item.querySelectorAll("[data-approve],[data-reject]").forEach(function(b){ b.disabled=true; });
  var reviewed=false;
  try{ await DDB.review(id,decision,reason,fields); reviewed=true;
    banner("good",decision==="approve"?"Capture approved":"Capture rejected","<div>"+esc(decision==="approve"?(DOC_LABEL[fields.doc_type]||fields.doc_type)+(fields.number?" "+fields.number:""):reason)+"</div>",{autoclose:5000}); }
  catch(err){ banner("bad",decision==="approve"?"Capture not approved":"Capture not rejected","<div>"+esc(err.message)+"</div>"); }
  // the hub and the customer's pane are re-read either way: after a 409 the capture is no longer pending
  try{
    if(state.tab==="documents") await renderDocsHub();
    if(d.subject_type==="customer"&&state.customer&&String(state.customer.id)===String(d.subject_id)&&(!state.docEdit||state.docEdit.where==="customer")){ await renderCustDocs(); await refreshComplete(); }
  }catch(err){ banner("bad","Couldn't reload the documents","<div>"+esc(err.message)+"</div>"); }
  if(reviewed&&d.subject_type==="customer") afterCustomerSave(d.subject_id);
}

/* ---------- People: each member's documents (CDL, medical card), loaded when the disclosure opens ---------- */
function personDocsHtml(uid){
  return '<div class="pdocs-body" id="personDocs-'+esc(uid)+'"><div class="cpane-head"><p class="hint" style="margin:0">CDL, medical card and other documents for this person.</p>'+
    (canManageDocs()?'<button class="btn sm" type="button" data-adddoc-person="'+esc(uid)+'">Add</button>':"")+"</div>"+
    '<div class="pdocs-list"><div class="hint">Loading…</div></div></div>';
}
async function renderPersonDocs(uid){
  if(!canViewDocs()||!$("personDocs-"+uid)) return;
  var co=state.company, rows, list=function(){ var h=$("personDocs-"+uid); return h&&h.querySelector(".pdocs-list"); };
  try{ rows=await DDB.forSubject("person",uid); }
  catch(err){ if(list()) list().innerHTML=custEmpty("Couldn't load the documents",err.message); return; }
  if(co!==state.company||!list()) return;
  list().innerHTML=rows.map(function(d){ return docRowHtml(d,"data-edit-pdoc"); }).join("")
    ||custEmpty("No documents yet",canManageDocs()?"Press Add to record a CDL, medical card or other document.":"Someone with the Manage documents permission can add them.");
}

/* ---------- Today: a driver photographs a customer's license or other document at the stop ----------
   The photo goes to dispatch-docs <company>/capture/<order_id>/<document_id>.jpg first, then the row is inserted as a pending
   customer capture (the database forces review_status, captured_by and captured_at). Upload first, so a failed upload leaves no
   row; a retry after a failed insert reuses the uploaded file. The driver can't read the row back, so this phone remembers the
   captures it sent (state.capturedDocs, per order, this session) to show them on the stop. */
state.capturedDocs={};
var cap={order:null,site:null,blob:null,url:"",docId:null,uploaded:null,sending:false};
function captureButtonHtml(orderId){
  var n=(state.capturedDocs[orderId]||[]).length;
  return '<button class="btn sm" type="button" data-capture="'+esc(orderId)+'">Photo of license / document</button>'+
    (n?'<span class="sn-cap">Sent for review / Enviado para revisión'+(n>1?" ("+n+")":"")+"</span>":"");
}
function capSay(kind,html){ var el=$("capStatus"); if(!html){ el.innerHTML=""; el.className=""; return; }
  el.className="banner "+kind; el.style.margin="10px 0 0"; el.innerHTML="<div>"+html+"</div>"; }
function capReset(){ if(cap.url) URL.revokeObjectURL(cap.url); cap.url=""; cap.blob=null; cap.docId=null; cap.uploaded=null;
  $("capPreview").hidden=true; $("capPreview").removeAttribute("src"); $("capFile").value="";
  $("capTakeTxt").textContent="📷 Take the photo / Tomar la foto"; $("capSend").disabled=true; $("capSend").textContent="Send for review / Enviar"; }
function openCapture(o,site){
  if(!o||!site||!site.customerId) return;
  cap.order=o; cap.site=site; cap.sending=false; capReset();
  $("capSub").textContent=o.customer+(o.siteLabel&&o.siteLabel!=="Primary"?" — "+o.siteLabel:"")+" · "+(o.bolNo?"BOL "+o.bolNo:"Order "+o.id)+" / Foto de licencia o documento.";
  capSay("",""); $("capSheet").hidden=false; document.body.style.overflow="hidden";
  setTimeout(function(){ try{ $("capTakeLbl").focus(); }catch(e){} },50);
}
function closeCapture(){
  if(cap.sending) return;
  $("capSheet").hidden=true; document.body.style.overflow=""; capReset(); cap.order=null; cap.site=null;
  if(state.tab==="today") renderToday();
}
async function onCapFile(ev){
  var f=ev.target.files&&ev.target.files[0]; ev.target.value="";
  if(!f||cap.sending) return;
  if(!/^image\//.test(f.type||"image/")){ capSay("warn","That isn't a photo. Take a picture of the document. / <i>Tome una foto del documento.</i>"); return; }
  capSay("info","Preparing the photo… / <i>Preparando la foto…</i>");
  var b=await shrinkPhoto(f);
  if(b.type!=="image/jpeg"){ capSay("warn","That photo can't be sent. Take it again with the camera. / <i>Tome la foto otra vez con la cámara.</i>"); return; }
  if(b.size>DOC_MAX){ capSay("warn","The photo is over 10 MB. Take it again. / <i>La foto es muy grande.</i>"); return; }
  capReset(); cap.blob=b; cap.url=URL.createObjectURL(b); cap.docId=newUuid();   // a new photo is a new document
  $("capPreview").src=cap.url; $("capPreview").hidden=false; $("capTakeTxt").textContent="Retake / Otra foto"; $("capSend").disabled=false;
  capSay("info","Check the photo: the whole document, readable, no glare. If not, take another. / <i>Revise que se lea todo el documento.</i>");
}
async function capSend(){
  var o=cap.order, site=cap.site; if(!o||!site||!cap.blob||cap.sending) return;
  if(navigator.onLine===false){ capSay("warn","<b>No signal.</b> Nothing was sent. Keep this open and press <b>Try again</b> when you have signal. / <i>Sin señal. Intente de nuevo.</i>");
    $("capSend").textContent="Try again / Reintentar"; return; }
  var co=state.company, id=cap.docId, path=safeSeg(co)+"/capture/"+safeSeg(o.id)+"/"+id+".jpg";
  cap.sending=true; $("capSend").disabled=true; $("capSend").textContent="Sending… / Enviando…"; capSay("info","Sending… / <i>Enviando…</i>");
  try{
    if(cap.uploaded!==path){
      var up=await supa.storage.from("dispatch-docs").upload(path,cap.blob,{contentType:"image/jpeg",upsert:false});
      if(up.error) throw new Error(up.error.message||String(up.error));
      cap.uploaded=path;
    }
    sbErr(await supa.from("dispatch_documents").insert({id:id,company:co,subject_type:"customer",subject_id:String(site.customerId),doc_type:"other",title:"Driver capture",
      file_path:path,file_name:id+".jpg",file_type:"image/jpeg",file_size:cap.blob.size,review_status:"pending_review",captured_order_id:o.id,
      extra:{order_id:o.id,site_key:site.siteKey}}));
  }catch(err){
    cap.sending=false; $("capSend").disabled=false; $("capSend").textContent="Try again / Reintentar";
    capSay("bad","<b>Not sent.</b> "+esc(err.message||String(err))+" Press <b>Try again</b>. / <i>No se envió. Intente de nuevo.</i>"); return;
  }
  cap.sending=false;
  if(co===state.company) (state.capturedDocs[o.id]=state.capturedDocs[o.id]||[]).push(id);
  if(cap.url) URL.revokeObjectURL(cap.url); cap.url=""; cap.blob=null; cap.docId=null; cap.uploaded=null;
  $("capSend").disabled=true; $("capSend").textContent="Send for review / Enviar"; $("capTakeTxt").textContent="📷 Another photo / Otra foto";
  capSay("good","<b>Sent for review / Enviado para revisión.</b> The office reads it and files it on the customer. "+'<button class="lnk" id="capDone" type="button">Done</button>');
  var dn=$("capDone"); if(dn) dn.onclick=closeCapture;
}

/* ---------- My documents: a driver's own CDL, medical card and other person documents (read-only) ---------- */
async function renderMyDocs(){
  var host=$("myDocsList"); if(!host||!state.session) return;
  var co=state.company, uid=state.session.user.id, rows;
  host.innerHTML='<div class="hint">Loading… / Cargando…</div>';
  try{ rows=await DDB.forSubject("person",uid); }
  catch(err){ if(co===state.company) host.innerHTML=custEmpty("Couldn't load your documents",err.message); return; }
  if(co!==state.company||state.tab!=="mydocs") return;
  host.innerHTML=rows.map(function(d){
    return '<div class="doc-row" data-doc="'+esc(d.id)+'"><div class="doc-name"><b>'+esc(docLabel(d))+"</b>"+(d.number?' <span class="mono">'+esc(d.number)+"</span>":"")+"</div>"+
      '<div class="doc-meta">'+docChipFor(d)+"</div>"+
      '<span class="doc-btns">'+(d.file_path?'<button class="btn sm" type="button" data-open="'+esc(d.id)+'">Open file</button>':"")+"</span></div>"; }).join("")
    ||custEmpty("No documents on file / Sin documentos","The office adds your CDL and medical card here.");
}

/* ---------- order-time warnings: the strip under the customer on New order, and Setup → Warnings (super admin) ----------
   settings.warnings = {<type>:{orderTime:boolean, note:text}}, with warnDays and expiryEmailRecipients beside it; all three are written
   only through dispatch_set_warnings. Every type is off until a super admin switches it on. A warning never blocks an order
   and never touches its payment code; what the person saw is stamped on the order as warningsShown. */
const WARN_TYPES=[["cannabis_license","Cannabis license"],["psa","PSA"],["entity_status","Entity status (SOS)"]];
const WARN_KEYS=["warnDays","warnings","expiryEmailRecipients"];
const WARN_EMAIL=/^[^@\s]+@[^@\s]+\.[^@\s]+$/;   // dispatch_set_warnings' rule for a recipient
const WARN_CLS={red:"st stop",amber:"warn",green:"k-D"};
function warnDay(iso){ if(!iso) return ""; var s=String(iso); return s.slice(5,7)+"/"+s.slice(8,10)+"/"+s.slice(0,4); }   // MM/DD/YYYY
function warnCfg(settings,type){ var w=(settings&&settings.warnings)||{}; return w[type]&&typeof w[type]==="object"?w[type]:{}; }
// [{type, status, level:'green'|'amber'|'red', text[, note]}] for the switched-on types, from a dispatch_customer_status row
function warnStatusFor(st,settings){
  st=st||{}; var out=[];
  function add(type,status,level,text){ var w={type:type,status:status,level:level,text:text}, n=String(warnCfg(settings,type).note||"").trim(); if(n) w.note=n; out.push(w); }
  if(warnCfg(settings,"cannabis_license").orderTime===true){
    var ls=st.license_status||"missing", e=st.license_expires;
    add("cannabis_license",ls,ls==="missing"||ls==="expired"?"red":ls==="expiring"?"amber":"green",
      ls==="missing"?"No license on file":ls==="expired"?"License EXPIRED "+warnDay(e):e?"License expires "+warnDay(e):"License on file, no expiry");
  }
  if(warnCfg(settings,"psa").orderTime===true){
    var ps=st.psa_status||"missing";
    add("psa",ps,ps==="signed"?"green":ps==="in_progress"?"amber":"red",ps==="signed"?"PSA signed":ps==="in_progress"?"PSA sent, not signed":"PSA not signed");
  }
  if(warnCfg(settings,"entity_status").orderTime===true){
    var es=String(st.entity_status||"").trim();   // blank: no SOS check recorded, nothing to warn about
    if(es) add("entity_status",es,/^active$/i.test(es)?"green":"red","Entity status (SOS): "+es);
  }
  return out;
}
// take the server's warning keys into state.settings (they change only through dispatch_set_warnings, maybe on another screen)
function takeWarnSettings(s){ s=s||{}; WARN_KEYS.forEach(function(k){ if(k in s) state.settings[k]=s[k]; else delete state.settings[k]; }); }
var warnSeq=0;
// the strip under #fCustomer for the customer the form resolves to (null clears it); keeps what it showed in state.form.warnings
async function renderWarnStrip(c){
  var host=$("warnStrip"); if(!host) return;
  var seq=++warnSeq, co=state.company;
  if(!c){ state.form.warnings=[]; state.form.warnFor=null; host.innerHTML=""; host.hidden=true; return; }
  try{ takeWarnSettings(await DB.settings()); }catch(e){}   // a super admin may have just switched a type on: no reload needed
  var st=null;   // always fresh: a license added elsewhere since the cache filled must not warn
  try{ st=await CDB.statusFor(c.id); if(st) state.custStatus[st.id]=st; }catch(e){ st=null; }
  if(seq!==warnSeq||co!==state.company) return;   // the customer changed meanwhile
  var anyOn=WARN_TYPES.some(function(t){ return warnCfg(state.settings,t[0]).orderTime===true; });
  // status unknown (the read failed or found nothing): say so in grey, never guess red, stamp nothing
  var list=st?warnStatusFor(st,state.settings):[];
  state.form.warnings=list; state.form.warnFor=c.id;
  var unknown=!st&&anyOn?'<span class="hint warn-note" data-warnunknown>Couldn\'t check documents</span>':"";
  var notes=WARN_TYPES.filter(function(t){ var w=warnCfg(state.settings,t[0]); return w.orderTime!==true&&String(w.note||"").trim(); })
    .map(function(t){ return '<span class="hint warn-note">'+esc(t[1])+": "+esc(String(warnCfg(state.settings,t[0]).note).trim())+"</span>"; });
  host.innerHTML=list.map(function(w){ return '<span class="chip '+WARN_CLS[w.level]+'" data-warnlevel="'+esc(w.level)+'">'+esc(w.text)+"</span>"+
    (w.note?'<span class="hint warn-note">'+esc(w.note)+"</span>":""); }).join("")+unknown+notes.join("");
  host.hidden=!host.innerHTML;
}
// Setup → Warnings: shown to super admins only (the RPC refuses anyone else)
function renderWarnings(){
  var card=$("warnCard"); if(!card) return;
  var sup=!!(state.me&&state.me.isSuper); card.hidden=!sup; if(!sup) return;
  $("warnRows").innerHTML=WARN_TYPES.map(function(t){ var w=warnCfg(state.settings,t[0]);
    return '<div class="warn-row"><label class="perm-chk"><input type="checkbox" data-warn="'+esc(t[0])+'"'+(w.orderTime===true?" checked":"")+"> "+esc(t[1])+"</label>"+
      '<input data-warnnote="'+esc(t[0])+'" value="'+esc(w.note||"")+'" placeholder="Note shown with the warning (optional)" aria-label="'+esc(t[1])+' note"></div>'; }).join("");
  $("sWarnDays").value=docWarnDays();
  var r=state.settings.expiryEmailRecipients; $("sExpiryTo").value=Array.isArray(r)?r.join("\n"):"";
}
async function saveWarnings(){
  var raw=$("sWarnDays").value.trim(), days=Number(raw);
  if(!/^\d+$/.test(raw)||days<1||days>365){ banner("warn","Warnings not saved","<div>The expiring window is a whole number of days, 1 to 365.</div>",{autoclose:9000,key:"warnings"}); return; }
  var to=$("sExpiryTo").value.split(/\r?\n/).map(function(l){ return l.trim(); }).filter(Boolean);
  var bad=to.filter(function(l){ return !WARN_EMAIL.test(l); });
  if(bad.length){ banner("warn","Warnings not saved","<div>Not an email address: <b>"+esc(bad.join(", "))+"</b>. Put one address on each line.</div>",{autoclose:12000,key:"warnings"}); return; }
  var warnings={}, card=$("warnCard");
  WARN_TYPES.forEach(function(t){ var cb=card.querySelector('[data-warn="'+t[0]+'"]'), n=card.querySelector('[data-warnnote="'+t[0]+'"]');
    warnings[t[0]]={orderTime:!!(cb&&cb.checked),note:n?n.value.trim():""}; });
  var btn=$("btnSaveWarnings"); btn.disabled=true;
  try{ await DB.setWarnings(days,warnings,to); }
  catch(e){ btn.disabled=false; banner("bad","Warnings not saved","<div>"+esc(e.message)+"</div>",{key:"warnings"}); return; }
  try{ takeWarnSettings(await DB.settings()); }
  catch(e){ state.settings.warnDays=days; state.settings.warnings=warnings; state.settings.expiryEmailRecipients=to; }
  btn.disabled=false; renderWarnings();
  banner("good","Warnings saved","<div>"+(WARN_TYPES.filter(function(t){ return warnings[t[0]].orderTime; }).map(function(t){ return esc(t[1]); }).join(", ")||"Every warning is off")+
    " · expiring window "+days+" days · "+to.length+" expiry email recipient"+(to.length===1?"":"s")+".</div>",{autoclose:8000,key:"warnings"});
}

function wireDocuments(){
  $("tab-documents").onclick=function(){ setTab("documents"); };
  $("btnSaveWarnings").onclick=saveWarnings;
  $("capFile").onchange=onCapFile; $("capSend").onclick=capSend; $("capClose").onclick=closeCapture;
  $("capSheet").addEventListener("keydown",function(e){ if(e.key==="Escape") closeCapture(); });
  $("myDocsList").onclick=function(ev){ var o=ev.target.closest("[data-open]"); if(o) openDocFile(o.getAttribute("data-open"),o,true); };
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
  var rv=$("dhReviewList");
  rv.addEventListener("toggle",function(ev){ var t=ev.target; if(!t.matches||!t.matches("details[data-review]")) return;
    if(t.open) openReview(t); else { var b=t.querySelector(".rv-body"); if(b) b.innerHTML=""; } },true);
  rv.onclick=function(ev){ var o=ev.target.closest("[data-open]"); if(o){ openDocFile(o.getAttribute("data-open"),o); return; }
    var a=ev.target.closest("[data-approve]"); if(a){ reviewCapture(a.getAttribute("data-approve"),"approve"); return; }
    var j=ev.target.closest("[data-reject]"); if(j) reviewCapture(j.getAttribute("data-reject"),"reject"); };
  rv.onchange=function(ev){ if(ev.target.id==="rv_type") reviewTypeFields(); };
  var ul=$("userList");
  ul.addEventListener("toggle",function(ev){ var t=ev.target; if(t.matches&&t.matches("details[data-pdocs]")&&t.open) renderPersonDocs(t.getAttribute("data-pdocs")); },true);
  ul.addEventListener("click",function(ev){
    var a=ev.target.closest("[data-adddoc-person]"); if(a){ if(canManageDocs()) openDocForm("person",a.getAttribute("data-adddoc-person"),null,"person"); return; }
    var o=ev.target.closest("[data-open]"); if(o){ openDocFile(o.getAttribute("data-open"),o); return; }
    var e=ev.target.closest("[data-edit-pdoc]"), p=e&&e.closest("[data-pdocs]");
    if(p) openDocForm("person",p.getAttribute("data-pdocs"),docById(e.getAttribute("data-edit-pdoc")),"person"); });
}
