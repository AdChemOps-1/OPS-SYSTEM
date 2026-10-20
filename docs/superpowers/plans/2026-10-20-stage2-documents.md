# Stage 2 — Documents, Warnings and the Expiry Email — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Licenses, certificates and agreements for customers, the company and drivers live in Ops with files, expiry dates, a review queue for driver captures, order-time warnings a super admin can switch, and a daily expiry email to chosen recipients.

**Architecture:** One `dispatch_documents` table with `subject_type` (customer / company / person) and a private `dispatch-docs` bucket; RLS and storage policies by the new `view_documents` / `manage_documents` permissions plus "a driver reads their own". The `dispatch_customer_status` view is replaced to derive license and PSA status, which the customer list, order entry, Customers Out and the expiry email all read. The expiry email is a Pages Function called daily by a `pg_cron` job through `pg_net`, with a shared secret held in Supabase Vault; a super admin can also send it on demand.

**Tech Stack:** As Stage 1 (plain JS SPA, Supabase, Cloudflare Pages Functions, Playwright + `node:test`), plus Supabase Storage signed URLs, `pg_cron`, `pg_net`, Supabase Vault.

**Spec:** `docs/superpowers/specs/2026-10-20-customers-documents-assets-design.md` — sections 3.3, 3.6 (`warn_days`, `warnings`, `expiry_email_recipients`, the two document permissions), 3.7 (document paths), 4 (documents column), 5.1 (Documents tab), 5.2, 5.3 (driver documents on People), 5.4 (Photo of license / document, My documents), 5.5 (status strip), 5.7 (Warnings), 5.8, 6 (`docs.js`, `expiry.js`), 7, 9 (License / PSA / Entity columns now populated), 12, 13. Vision/OCR of license photos is Stage 3 (it ships with `vision.js`); in this stage the reviewer types the fields from the photo.

## Global Constraints

- Every new table carries `company text not null references public.companies(id)`; every policy is company-scoped through `dispatch_role_in / dispatch_hub_in / dispatch_can_edit_in / dispatch_is_super_in / dispatch_perm_in`.
- Migration `006_documents.sql` is idempotent without `drop` (guarded `DO` blocks for policies and constraints, `create or replace` for functions and views, `alter policy` for existing policies), verified by running it twice in one `begin … rollback` batch via the Supabase MCP, then applied with `apply_migration` only after the user says so.
- Company settings are keys in `dispatch_company_settings.data`: `warnDays` (int, default 30), `warnings` (`{cannabis_license:{orderTime:false,note:""}, psa:{…}, entity_status:{…}}`), `expiryEmailRecipients` (string[]). These three are written only through the RPC `dispatch_set_warnings`, which requires super admin; `DB.saveSettings` strips them like the counters.
- Permissions: `view_documents` (read records and files), `manage_documents` (create, edit, upload, approve/reject, delete). Super admins have both. A driver reads only documents whose `subject_type='person'` and `subject_id = auth.uid()::text`, and can insert only `pending_review` customer captures from a stop (write-only; they cannot select those rows back). Coordinators without `view_documents` see derived statuses only.
- Files: bucket `dispatch-docs`, private, 10 MB, `image/jpeg,image/png,image/webp,application/pdf`. Paths `company/document/<subject_type>/<subject_id>/<document_id>/<file_name>` and `company/capture/<order_id>/<document_id>.jpg`. Storage select policy mirrors the table policy by path; insert by `manage_documents` under `document/`, by any member of role driver under `capture/` of their company. Reads are served as 5-minute signed URLs minted by `/api/docs` after a permission check; the browser never stores a file URL.
- Nothing in Ops holds a balance, invoice, term, credit limit, price, rental charge or collection note; Account Terms money columns stay out. The PSA record holds dates only.
- Warn, never block: document status never changes a payment code or an order's state. Order-time warnings default **off** at go-live.
- The expiry email goes only to `expiryEmailRecipients`; never to orders@; skipped when the list is empty or nothing is due.
- Front-end: ES5 script files, no build; new screens in `public/documents.js`; `app.js` edits limited to tab navigation, `applyAccess`, `loadCompanyData`, `renderUsers` (two more switches), `renderOrders`/`renderToday` flags, order-entry strip hook, `renderHealth`, `DB.saveSettings` strip list. Phone-first (`scrollWidth === 390`). Every interpolated value through `esc()`; failures surface as `banner(...)`.
- Tests assert with `node:assert`; `npm test` exits 0 with pristine output; SQL policy tests in `supabase/tests/006_policies.sql`.

## Review Focus

1. **A driver uploads a license photo at a stop, then opens the Documents hub URL by hand**: they must get no rows and no signed URL. Tested in Task 2 (SQL) and Task 6 (UI: driver page shows "sent for review" and `CDB.docs.list` returns zero rows as a driver).
2. **Two live cannabis licenses for one customer (a renewal added before the old one expires)**: status comes from the one with the latest `expires`, and approving a capture whose number matches supersedes the old record rather than leaving two live. Tested in Task 2 (view) and Task 5 (approve path).
3. **Warnings off, then on, while a coordinator's tab is open**: the strip must follow the saved setting on the next customer pick without a reload (settings re-read on pick), and the order stamps `warningsShown` only for what was displayed. Tested in Task 7.
4. **A document with no file** (number and dates typed from paper): list, status, Customers Out and the email treat it as a real record; "Open file" is absent, not broken. Tested in Tasks 3 and 8.
5. **Expiry email with recipients in two companies**: each company's list gets only its own documents, and a company with no recipients is skipped. Tested in Task 9.

---

### Task 1: Fake and harness for documents

**Files:**
- Modify: `test/_fake.cjs`
- Modify: `test/customers.test.cjs` (seed shape only)

**Interfaces:**
- Produces in the fake: table `dispatch_documents` (columns per Task 2); the computed view `dispatch_customer_status` gains `license_status` (`valid|expiring|expired|missing` from live `cannabis_license` rows by latest `expires`, `expiring` = within `data.warnDays||30` days of a fixed "today" the fake exposes as `T.__today` ISO date, default `2026-10-20`), `license_expires`, `license_number`, `psa_status` (`signed` when `extra.signed_customer` and `extra.countersigned` set; `in_progress` when any stage date set; else `missing`), `entity_status` (`extra.entity_status_sos` of that license); a second computed view `dispatch_documents_due` (`company, id, subject_type, subject_id, subject_name, doc_type, title, number, expires, days_left, review_status` for live documents with `expires` not null and `days_left <= warnDays`, plus expired, ordered by `expires`).
- Storage routes: `POST /storage/v1/object/dispatch-docs/<path>` records `['upload', path]` and stores the path in `T.__objects`; `POST /storage/v1/object/sign/dispatch-docs/<path>` returns `{signedURL:'/storage/v1/object/sign/dispatch-docs/<path>?token=fake'}` only if the path exists.
- API routes: `POST /api/docs` with `{action:'sign', id}` → `{url}` after the same permission rule as the server (Task 3): super/`view_documents`, or driver on own person doc; `{action:'review', id, decision:'approve'|'reject', reason, fields}` → applies the server's approve/supersede logic to `T` (Task 5 defines it; the fake mirrors it). `POST /api/expiry` with `{send:true}` records `['expiry', body]` and returns `{ok:true, sent:[{company, to, count}]}`. `/api/health` returns `checks.docsBucket:'ok'` and `checks.expiryCron:'ok'`.
- RPC: `dispatch_set_warnings(p_company, p_warn_days, p_warnings, p_recipients)` writes the three keys into settings only when the caller's member row has `is_super_admin`, else 403-style error `{message:'not allowed'}`.
- RLS-like filter for `dispatch_documents` on GET: super/`view_documents` → all of the company; driver → own person docs only; others → none.

- [ ] **Step 1: Add the table, views, storage/API routes, RPC and filter to `_fake.cjs`** as above.
- [ ] **Step 2: Run the existing suites**
Run: `npm test`
Expected: exit 0 (no behavior change yet).
- [ ] **Step 3: Commit**
```bash
git add test/_fake.cjs test/customers.test.cjs
git commit -m "test: fake backend learns documents, signed URLs, status views, warnings RPC"
```

---

### Task 2: Migration 006 — documents, bucket, permissions, status view, warnings RPC

**Files:**
- Create: `supabase/migrations/006_documents.sql`
- Create: `supabase/tests/006_policies.sql`

**Interfaces:**
- `dispatch_documents(id uuid pk default gen_random_uuid(), company, subject_type text check in ('customer','company','person'), subject_id text not null, doc_type text check in ('cannabis_license','resale_certificate','psa','chp_hazmat_license','dot_registration','insurance_certificate','cdl','medical_card','other'), title text default '', number text default '', status text default '', issued date, expires date, file_path text, file_name text default '', file_size int, file_type text default '', checked_on date, checked_by uuid, source text default '', notes text default '', review_status text check in ('live','pending_review','rejected') default 'live', captured_by uuid, captured_at timestamptz, captured_order_id text, supersedes_id uuid references dispatch_documents(id), extra jsonb default '{}', import_source jsonb, created_at, updated_at, created_by default auth.uid(), updated_by)`; index `(company, subject_type, subject_id)`, index `(company, expires) where review_status='live'`.
- Helper `dispatch_doc_subject_ok(company, subject_type, subject_id) returns boolean`: customer → exists in `dispatch_customers` of that company; company → `subject_id = company`; person → an active member of that company. Enforced by a before-insert/update trigger `dispatch_documents_subject_guard()` raising otherwise (FK checks bypass RLS, so this is the cross-company guard).
- Capture guard `dispatch_documents_capture_guard()` (before insert): when `dispatch_role_in(company)='driver'`: force `review_status='pending_review'`, `captured_by=auth.uid()`, `captured_at=now()`, require `subject_type='customer'`, and require `file_path like company||'/capture/%'`.
- Policies: select `dispatch_perm_in(company,'view_documents') or (subject_type='person' and subject_id=(select auth.uid())::text and review_status='live')`; insert `dispatch_perm_in(company,'manage_documents') or dispatch_role_in(company)='driver'` (the guard tightens the driver case); update/delete `dispatch_perm_in(company,'manage_documents')`. Audit trigger `dispatch_audit()` attached. `dispatch_keep_company` attached.
- Bucket: `insert into storage.buckets … 'dispatch-docs' … 10485760, array['image/jpeg','image/png','image/webp','application/pdf']`; storage policies (guarded creates): select on `bucket_id='dispatch-docs'` when `dispatch_perm_in(folder[1],'view_documents') or (folder[2]='document' and folder[3]='person' and folder[4]=(select auth.uid())::text)`; insert when `(folder[2]='document' and dispatch_perm_in(folder[1],'manage_documents')) or (folder[2]='capture' and dispatch_role_in(folder[1])='driver')`; delete when `dispatch_perm_in(folder[1],'manage_documents')`.
- View `dispatch_customer_status` replaced (`create or replace view … security_invoker`): same `profile_complete` with the three placeholders now real (`license on file` = a live cannabis_license exists; `license expiry` = its `expires` is not null; `PSA signed` = psa_status='signed'), plus `license_status` (`missing` | `expired` when `expires < current_date` | `expiring` when `expires < current_date + warn_days` | `valid`), `license_expires`, `license_number`, `psa_status`, `psa_effective` (`extra->>'effective_date'` of the live psa, as date), `entity_status`, where `warn_days = coalesce((settings.data->>'warnDays')::int, 30)` for the company.
- View `dispatch_documents_due` (security_invoker): live documents with `expires` within `warn_days` or past, with `subject_name` (customer name / company name / `dispatch_users.name`), `days_left`.
- RPC `dispatch_set_warnings(p_company text, p_warn_days int, p_warnings jsonb, p_recipients text[]) returns void`: `dispatch_is_super_in(p_company)` or raise; validates `p_warn_days between 1 and 365`, `p_warnings` object whose values are objects with boolean `orderTime` and text `note`, recipients are emails; writes the three keys with `jsonb_set`; logs `{what:'warnings', table_name:'dispatch_company_settings', row_id:p_company, changes:{…from/to…}}`.
- RPC `dispatch_approve_capture(p_id uuid, p_fields jsonb) returns uuid` (manage_documents): sets the typed fields (`doc_type, number, status, issued, expires, title, extra, notes, checked_on=current_date, checked_by=auth.uid()`), `review_status='live'`; if another live document of the same subject and `doc_type` has the same `number`, sets that one's `review_status='rejected'`, `notes = notes || ' superseded'` and the new row's `supersedes_id` to it; returns the id. `dispatch_reject_capture(p_id, p_reason)` sets `review_status='rejected'`, `notes`.
- Expiry cron: `create extension if not exists pg_cron; create extension if not exists pg_net;` and function `dispatch_schedule_expiry(p_url text, p_secret text)` (postgres/super only) that stores `p_secret` in `vault.secrets` as `dispatch_expiry_secret` and `cron.schedule('dispatch-expiry-email', '0 14 * * *', $$select net.http_post(url := <p_url>, headers := jsonb_build_object('content-type','application/json','x-expiry-secret', (select decrypted_secret from vault.decrypted_secrets where name='dispatch_expiry_secret')), body := '{"send":true}'::jsonb)$$)` (14:00 UTC = 06:00/07:00 Pacific); re-running replaces the job (`cron.unschedule` by name inside the function is allowed — it is not a `drop`).
- Seed: `jsonb_set(data,'{warnDays}','30')` and `warnings` all `orderTime:false` for `adchem` when absent.

- [ ] **Step 1: Write `supabase/tests/006_policies.sql`** (DO block like 005's; create super admin `sa`, coordinator `co` with `{view_documents:true}`, coordinator `cn` with `{}`, driver `dr` hub EB, member of `north`):
  - `sa` inserts a customer license (expires in 10 days) and a person CDL for `dr`; `co` selects both; `cn` selects zero rows and `dispatch_customer_status` still returns `license_status='expiring'` for `cn`; `dr` selects exactly 1 row (its CDL) and zero customer rows.
  - `dr` inserts a customer capture with `file_path='adchem/capture/EB-261020-01/x.jpg'` → row has `review_status='pending_review'`, `captured_by=dr`; `dr` cannot select it back; `dr` inserting with `review_status='live'` or `subject_type='person'` or a `document/` path raises.
  - `north` member inserting a document with `subject_type='customer'` and an adchem customer uuid raises (subject guard).
  - Two live licenses: approve a capture with the same number → old one `rejected`, new one `supersedes_id` set, view shows the new expiry.
  - `dispatch_set_warnings` as `co` raises; as `sa` writes the keys and logs; invalid email raises.
  - Storage: as `dr`, `insert into storage.objects (bucket_id, name, owner_id) values ('dispatch-docs','adchem/capture/EB-261020-01/y.jpg', dr)` succeeds and `…/document/customer/<id>/z.jpg` raises; as `co`, select on the document object succeeds; as `cn`, zero rows.
  - `dispatch_documents_due` as `co` returns the 10-day license with `days_left=10`.
- [ ] **Step 2: Run it (migration absent) in a begin…rollback batch** — Expected: `relation "public.dispatch_documents" does not exist`.
- [ ] **Step 3: Write `006_documents.sql`** per Interfaces.
- [ ] **Step 4: Run `begin; 006; 006; 006_policies; rollback;`** — Expected: `006 policies ok`.
- [ ] **Step 5: Update the fake's view logic if the SQL's thresholds differ** (expired = `< today`, expiring = `< today + warnDays`); `npm test` exit 0.
- [ ] **Step 6: Commit**
```bash
git add supabase/migrations/006_documents.sql supabase/tests/006_policies.sql test/_fake.cjs
git commit -m "db: documents, dispatch-docs bucket, document permissions, license/PSA status, warnings RPC, expiry cron (006)"
```

---

### Task 3: Server — `/api/docs` and permission labels

**Files:**
- Create: `functions/api/docs.js`
- Modify: `functions/_lib/auth.js` (labels: `view_documents:"view documents"`, `manage_documents:"manage documents"`)
- Create: `test/unit/docs.test.mjs`

**Interfaces:**
- `POST /api/docs {action:'sign', id}`: `requireUser(…, null, company)`; reads the document row as the caller (RLS decides visibility; a 0-row read → 404); if `file_path` is null → 400 `no_file`; otherwise `POST {SUPABASE_URL}/storage/v1/object/sign/dispatch-docs/{file_path}` with the caller's token and `{expiresIn:300}` → returns `{url: SUPABASE_URL + '/storage/v1' + signedURL, expiresIn:300, fileName, fileType}`; logs `{what:'file_view', detail:{documentId:id}, who:user.id, company}` via `db.insert('dispatch_log', …)` with `table_name` and `changes` null (what `dl_insert` allows a client to write).
- `{action:'review', id, decision, reason, fields}`: `requireUser(…, 'manage_documents')`; `approve` → `rpc('dispatch_approve_capture', {p_id, p_fields})`; `reject` → `rpc('dispatch_reject_capture', {p_id, p_reason})`; returns `{ok:true, id}`.
- `sb()` gains `storageSign(bucket, path, expiresIn)`.

- [ ] **Step 1: Write `test/unit/docs.test.mjs`** with a stubbed `fetch`: sign returns a URL containing `/storage/v1/object/sign/dispatch-docs/adchem/document/customer/` and `expiresIn 300`; a document the caller cannot read (empty REST result) → 404; no file → 400 `no_file`; review without `manage_documents` → 403; review approve calls the RPC with `p_fields`.
- [ ] **Step 2: RED** — `node --test test/unit/docs.test.mjs` fails (module missing).
- [ ] **Step 3: Implement.** **Step 4: GREEN.** **Step 5: Commit** `server: /api/docs signed reads and capture review`.

---

### Task 4: Documents on the customer page and the Documents hub

**Files:**
- Create: `public/documents.js`
- Modify: `public/index.html` (customer page: `ctab-documents` + `#cpane-documents`; new `<section id="panel-documents">` + tab `tab-documents`; script tag)
- Modify: `public/app.js` (`setTab` list, `wire` tab hook, `applyAccess` shows `tab-documents` when `canViewDocs()`, `loadCompanyData`, `DB.saveSettings` strip list adds `warnDays, warnings, expiryEmailRecipients`)
- Modify: `public/customers.js` (`CUST_TABS` gains `documents`; `custHeader` shows license/PSA chips from `state.custStatus`)
- Modify: `public/styles.css` (append)
- Create: `test/documents.test.cjs`

**Interfaces:**
- Globals: `canViewDocs()` = `isSuper || perms.view_documents`; `canManageDocs()` = `isSuper || perms.manage_documents`; `DOC_TYPES` = `[['cannabis_license','Cannabis license'],['resale_certificate','Resale certificate'],['psa','PSA'],['chp_hazmat_license','CHP HazMat license'],['dot_registration','DOT registration'],['insurance_certificate','Insurance certificate'],['cdl','CDL'],['medical_card','Medical card'],['other','Other']]`; `docStatusChip(status, expires)` (green `valid`, amber `expiring`, red `expired`/`missing`, with the date).
- `const DDB = { list(filter), forSubject(type, id), get(id), save(d), remove(id), upload(file, subjectType, subjectId, docId) → {file_path,file_name,file_size,file_type} (client-side `supa.storage.from('dispatch-docs').upload`, path per Global Constraints, images shrunk with the existing `shrinkPhoto`), sign(id) → API.post('/api/docs',{action:'sign',id}), review(id, decision, reason, fields), due() }`.
- Customer page `#cpane-documents`: with `canViewDocs()`: list (`#docList`, rows `data-doc="<id>"`: type, number, status chip, issued, expires, file name or "no file", checked on); **Add document** (`#btnAddDoc`) opens form `#docForm` with `df_type, df_title, df_number, df_status, df_issued, df_expires, df_checked, df_source, df_notes, df_file` plus type-specific fields: cannabis_license → `df_licensee, df_license_type, df_county, df_owners, df_entity`; psa → `df_quote_sent, df_quote_accepted, df_sent_sig, df_signed_cust, df_countersigned, df_effective`; **Open file** (`data-open="<id>"`) calls `sign` and `window.open(url)`; without `canViewDocs()`: the two chips and the text "Document details need the View documents permission." Writes gated by `canManageDocs()`.
- Documents hub `#panel-documents`: toolbar (`#dhSearch`, `#dhType`, `#dhSubject` = all/customers/AdChem/people, `#dhExpiring` = 30/60/90/all, `#dhPending` checkbox), count chip `#dhPendingCount`, list `#dhList` sorted by `expires` nulls last; each row opens the subject (customer page, or an inline editor for company/person documents); **Add company document** (`#btnAddCompanyDoc`, subject = company).
- `state.docs` cache per subject; `state.custStatus` rows now carry `license_status, license_expires, psa_status`.

- [ ] **Step 1: Write `test/documents.test.cjs`** (sign in as super admin; create a customer as in customers.test):
  - `#tab-documents` visible; customer page shows tab `ctab-documents`; list empty.
  - Add a cannabis license (number `C11-0000123-LIC`, expires 10 days from `T.__today`, licensee, entity `Active`) with a fake JPEG via `df_file`: `T.dispatch_documents[0]` has `subject_type 'customer'`, `file_path` starting `adchem/document/customer/<id>/`, `calls` has `['upload', path]`; row shows the amber `expiring` chip; `custHeader` chip shows `License expires` with the date; completeness rises by 2 (on file + expiry).
  - Add a PSA with all stage dates → `psa_status 'signed'`, completeness +1 → the header shows `15 of 15` when the Stage 1 fixture customer is complete.
  - **Open file** → `calls` has a `/api/docs` sign call and `window.open` was invoked with a URL containing `object/sign/dispatch-docs` (stub `window.open` via `page.addInitScript`).
  - A document with no file (resale certificate typed from paper): row shows "no file", no `[data-open]` button, status chip still computed (Review Focus 4).
  - Documents hub: lists both; `#dhExpiring`=30 shows the license only; `#dhPendingCount` is 0.
  - Coordinator with `{}`: `#tab-documents` hidden; customer page documents pane shows chips and the permission sentence, no list; `DDB.list` returns 0 rows (fake RLS). Coordinator with `{view_documents:true}`: list visible, **Add document** disabled; with `manage_documents:true` enabled.
  - `scrollWidth === 390` with the hub and the form open.
- [ ] **Step 2: RED** (`#tab-documents` not found). **Step 3: Implement.** **Step 4: `npm test` exit 0.** **Step 5: Commit** `app: documents on the customer page and the Documents hub`.

---

### Task 5: Review queue (approve / reject captures) and People documents

**Files:**
- Modify: `public/documents.js`, `public/index.html` (hub: pending section `#dhPending`; People: per-member `#personDocs-<uid>` section), `public/app.js` (`renderUsers`: switches `view_documents`, `manage_documents` added to `MEMBER_PERMS`; a **Documents** disclosure per member rendering `personDocsHtml(uid)` from `documents.js`)
- Modify: `test/documents.test.cjs`, `test/customers.test.cjs` (People permission loop gains the two switches)

**Interfaces:**
- Pending section: rows `review_status='pending_review'` first in the hub with the photo thumbnail (signed URL fetched on expand), a form prefilled from any typed fields, **Approve** (`data-approve`) → `DDB.review(id,'approve',null,fields)`; **Reject** (`data-reject`) prompts a reason. Approve with a `number` matching an existing live license of the same subject supersedes it (server RPC); the UI re-reads and shows one live record.
- People: each member gets a **Documents** disclosure listing person documents (CDL, medical card) with **Add** for `canManageDocs()`; uses `DDB.forSubject('person', uid)`.

- [ ] **Step 1: Extend tests**: seed a pending capture for the customer (`file_path 'adchem/capture/EB-261020-01/<id>.jpg'`, object registered in `T.__objects`); hub shows `#dhPendingCount` 1; approve with number equal to the existing license's → `T.dispatch_documents` has exactly one live license for that customer, the old one `rejected` with `superseded` in notes, the new one `supersedes_id` set (Review Focus 2); reject path sets `rejected` + reason. People: add a CDL for `u1` (person) → row under `#personDocs-u1`; the two new switches write `view_documents` / `manage_documents` through the RPC.
- [ ] **Step 2: RED.** **Step 3: Implement.** **Step 4: `npm test`.** **Step 5: Commit** `app: capture review queue and people documents`.

---

### Task 6: Today — Photo of license / document; My documents

**Files:**
- Modify: `public/customers.js` (`siteNotesHtml` gains the **Photo of license / document** button `data-capture="<site_key>"` when the stop's site has a `customer_id`), `public/documents.js` (`captureDocument(order)`: camera input → `shrinkPhoto` → upload to `company/capture/<order_id>/<docId>.jpg` → insert `{id:docId, subject_type:'customer', subject_id, doc_type:'other', title:'Driver capture', file_path, file_name, file_type:'image/jpeg', review_status:'pending_review', captured_order_id}` → show "Sent for review / Enviado para revisión"), `public/app.js` (`applyAccess`: drivers get a **My documents** tab `tab-mydocs` → `renderMyDocs()` listing `DDB.forSubject('person', me)` with expiry chips and **Open file**), `public/index.html` (`panel-mydocs`, capture sheet markup)
- Modify: `test/ui.test.cjs` (driver section)

- [ ] **Step 1: Extend the driver test**: seed the Type 7 site with `customer_id`; tap `[data-capture]`, set the file → `T.dispatch_documents` has a `pending_review` row with `file_path` under `adchem/capture/<orderId>/`, `captured_by 'u1'`; the stop shows "Sent for review"; as the driver `DDB.list()` returns zero rows and `GET /api/docs sign` for that id returns 404 (Review Focus 1). Seed a person CDL for `u1` expiring in 20 days → **My documents** shows it with `expiring`; **Open file** signs. `scrollWidth === 390`.
- [ ] **Step 2: RED.** **Step 3: Implement.** **Step 4: `npm test`.** **Step 5: Commit** `app: drivers capture a license at the stop and see their own documents`.

---

### Task 7: Order-time warnings and the Setup → Warnings panel

**Files:**
- Modify: `public/app.js` (`onCustomerInput`/`applySite` → `renderWarnStrip(customer)`; `draftOrderFromForm` stores `warningsShown: [{type, status, text}]`; `codeChip` gains a red flag chip when `o.warningsShown` has a `red` entry; `renderToday` stop header flag; `DB.setWarnings(warnDays, warnings, recipients)` → `rpc('dispatch_set_warnings')`; `renderSetup` → `renderWarnings()`), `public/documents.js` (`renderWarnStrip`, `renderWarnings`, `warnStatusFor(custStatus, settings)` → `[{type:'cannabis_license'|'psa'|'entity_status', level:'green'|'amber'|'red', text}]` honouring `settings.warnings[type].orderTime` and the note), `public/index.html` (`#warnStrip` under `#fCustomer`; Setup card `#warnCard` super-admin only: per type a checkbox `data-warn="<type>"` and note input `data-warnnote="<type>"`, `#sWarnDays`, `#sExpiryTo` textarea one email per line, `#btnSaveWarnings`)
- Modify: `test/ui.test.cjs`, `test/customers.test.cjs`

**Interfaces:** `warnStatusFor`: license → `missing`/`expired` red, `expiring` amber, `valid` green with text `License expires MM/DD/YYYY` / `License EXPIRED MM/DD/YYYY` / `No license on file`; psa → `signed` green, `in_progress` amber `PSA sent, not signed`, `missing` red `PSA not signed`; entity_status → red when the text is anything but `Active`/blank. A type with `orderTime:false` yields no entry (its note shown once in grey if set).

- [ ] **Step 1: Tests**: warnings off (default) → picking a customer with an expired license shows no strip, saved order has `warningsShown: []`; super admin turns `cannabis_license` on via `#warnCard` → `T.dispatch_company_settings[0].data.warnings.cannabis_license.orderTime === true` and a `warnings` log row; in the same page (no reload) pick the customer again → strip shows `License EXPIRED …` in red; saved order's `warningsShown[0].level === 'red'`; Orders list row and the Today stop show the red flag chip (Review Focus 3). A coordinator (not super) sees no `#warnCard` and `DB.setWarnings` → error banner. `#sExpiryTo` with an invalid line → banner, nothing saved; valid lines saved as an array.
- [ ] **Step 2: RED.** **Step 3: Implement.** **Step 4: `npm test`.** **Step 5: Commit** `app: order-time document warnings with a super-admin switch`.

---

### Task 8: Customers Out carries real license / PSA / entity values

**Files:**
- Modify: `functions/_lib/customersout.js` (`rowsFor` reads `license_status, license_number, license_expires, entity_status, psa_status, psa_effective` from the Task 2 view)
- Modify: `test/unit/customersout.test.mjs`

- [ ] **Step 1: Test**: a customer with an expiring license and a signed PSA → row cells `License Status 'expiring'`, `License #`, `License Expires` serial, `Entity Status 'Active'`, `PSA Status 'signed'`, `PSA Effective` serial; a customer with no documents → `'missing'`, blanks (Review Focus 4 for a no-file record: status still from the row).
- [ ] **Step 2: RED.** **Step 3: Implement.** **Step 4: `node --test` + `npm test`.** **Step 5: Commit** `server+db: Customers Out reports license, entity and PSA status`.

---

### Task 9: Expiry email — `/api/expiry`, Send now, cron hook

**Files:**
- Create: `functions/_lib/expiry.js`, `functions/api/expiry.js`
- Modify: `functions/_lib/auth.js` (`sbService(env)`: a client using `SUPABASE_SERVICE_ROLE_KEY` for the cron path only)
- Modify: `functions/api/health.js` (`checks.docsBucket`: bucket exists via `GET storage/v1/bucket/dispatch-docs` as the caller; `checks.expiryCron`: `select jobname from cron.job` via an RPC `dispatch_cron_status()` (security definer, admin) added to 006 → `'ok — daily 06:00 Pacific'` or `'not scheduled'`)
- Modify: `public/app.js` (`renderHealth` two lines), `public/index.html`/`public/documents.js` (**Send expiry email now** button in `#warnCard` → `API.post('/api/expiry',{send:true})`)
- Modify: `GOOGLE-SETUP.md` §E (two new variables: `SUPABASE_SERVICE_ROLE_KEY` (Secret), `EXPIRY_SECRET` (Secret)), `README.md`
- Create: `test/unit/expiry.test.mjs`; modify `test/customers.test.cjs`

**Interfaces:**
- `buildExpiryEmails(companies, dueRows, today)` (pure) → `[{company, to:[…], subject, text}]`: one per company with ≥1 recipient and ≥1 due row; grouped Customers / AdChem / People, each line `name — type — number — expires MM/DD/YYYY (N days | EXPIRED N days ago)`; footer link to the app (`APP_URL` env or `https://ops.adchem.pro` placeholder from settings `appUrl`).
- `POST /api/expiry`: auth either `x-expiry-secret` header equal to `env.EXPIRY_SECRET` (cron; uses `sbService`, iterates every company) or a signed-in super admin (`requireUser` + `me.isSuper`; that company only). Reads `dispatch_documents_due` and settings per company, sends via Gmail as `mailFrom` using the same MIME builder as `pod.js` (text only, no attachment — factor `sendMail(env, {from,to,subject,text})` into `_lib/mail.js` and have `pod.js` keep its own multipart build untouched), returns `{ok:true, sent:[{company,to,count}], skipped:[…]}`; logs `{what:'expiry_email', detail:{count, to}}` per company.

- [ ] **Step 1: Tests**: `buildExpiryEmails` with two companies (adchem recipients 2, north recipients 0) → one email, adchem only, with the three groups and correct day math (Review Focus 5); route: wrong secret → 403; correct secret → Gmail stub called once with `From: orders@adchem.pro` and both recipients; super admin path for one company; a coordinator → 403. UI: **Send expiry email now** → `calls` has `['expiry', {send:true}]` and a banner with the count.
- [ ] **Step 2: RED.** **Step 3: Implement.** **Step 4: `npm test`.** **Step 5: Commit** `server+app: daily expiry email, Send now, health lines, setup docs`.

---

### Task 10: Docs and go-live notes

**Files:** `README.md` (Roles: the two document permissions; Documents section; first-run: enable the bucket's shares? none needed — add "Setup → Warnings: recipients; apply 006; `select dispatch_schedule_expiry('<app url>/api/expiry', '<EXPIRY_SECRET>')` once after deploy"), `GOOGLE-SETUP.md` (no new Google scope), `supabase/migrations/006_documents.sql` closing comment (advisor result after apply).

- [ ] **Step 1**: extend `test/customers.test.cjs` health assertion to include `Documents bucket: ok` and `Expiry email: ok` lines. **Step 2: RED. Step 3: implement docs + health render. Step 4: `npm test`. Step 5: commit** `docs+health: documents, warnings, expiry email`.

---

## Not in this plan
- Vision/OCR for license captures and container tags, assets (Stage 3); intake (Stage 4); import of the Licensing & Entity and Account Terms tabs into `dispatch_documents` (Stage 3 alongside Vision, since the review flow is the same).
