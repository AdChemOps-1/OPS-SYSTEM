# Stage 1 — Customer Master, Permissions, Customers Out and Import — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ops becomes the place customers, delivery sites and contacts are entered, with per-person permissions, an audit trail that records what changed, a `Customers Out` sheet for the AR Command Center, and a reviewed one-time import from the spreadsheet.

**Architecture:** New `dispatch_*` tables in the existing Supabase project with row-level security by company, role and per-member permission; a generic audit trigger records before/after values. New front-end screens live in their own files (`public/customers.js`, `public/import.js`) and hook into `app.js` only through tab navigation and the order form's customer lookup. Two new Pages Functions mirror the Orders Out writer and the FEED_ORDERS reader.

**Tech Stack:** Plain HTML/JS (no build), Supabase (Postgres + RLS + Auth, `supabase-js` from `public/vendor/supabase.js`), Cloudflare Pages Functions (ES modules, `fetch`-based Google Sheets API), Playwright headless UI tests driven by `node`, `node:test` for server units.

**Spec:** `docs/superpowers/specs/2026-10-20-customers-documents-assets-design.md` — sections 3.1, 3.2, 3.6, 3.8, 4, 5.1, 5.3, 5.4 (site notes, receiving contact, Add note), 5.5 (customer picker), 5.7 (Customers Out, Import), 8, 9, 12, 13, 14. Documents (3.3, 5.2, 7), assets (3.4, 11), intake (3.5, 10) and the expiry email are later stages.

## Global Constraints

- Every new table carries `company text not null references public.companies(id)`; every policy is company-scoped through the existing helpers `dispatch_role_in(c)`, `dispatch_hub_in(c)`, `dispatch_is_admin_in(c)`, `dispatch_can_edit_in(c)` (bodies live in the database; signatures in `supabase/migrations/002_companies.sql`).
- Migrations are a record of what is applied, numbered `005_…` onward, idempotent (`if not exists`, `create or replace`, `drop policy if exists` before `create policy`).
- No table or sheet column holds a balance, invoice, term, credit limit, price, rental charge or collection note.
- Company settings are keys in `dispatch_company_settings.data` (jsonb), the codebase convention, not new columns: `nextCustomerNumber`, `customersOutSheetId`, `importSheetId`.
- Customer IDs are `ADC-####` (four or more digits), unique per company, never reassigned; imported IDs are kept verbatim.
- Front-end code is ES5-style script files like `app.js` (no modules, no build), loaded by `index.html` after `app.js`; `app.js` changes are limited to: `setTab` list, `wire` tab hooks, `applyAccess`, `loadCompanyData`, `DB.sites`, `onCustomerInput`/`applySite`, `renderToday` stop block, `renderUsers`.
- Phone-first: no horizontal scroll at 390px (`document.documentElement.scrollWidth === 390` in the driver test).
- The UI tests assert with `node:assert` (not console.log only), and the suite exits non-zero on any failure or page error other than the deliberate Gmail 502.
- Drivers never receive a customer row, a billing/AP/owner contact, or another person's activity — enforced in SQL, verified by a test that queries as a driver.

## Review Focus

1. **A customer name typed on an order that matches two Ops customers** (e.g. "VKGL Manufacturing LLC" and "VKGL Manufacturing - LA"): the order must link to the one whose site was picked, never the first by alphabet. Test in Task 7.
2. **Two coordinators create a customer at the same moment**: both must get distinct ADC numbers (the counter update is a single `update … returning`). Test in Task 2 (SQL) and the fake in Task 1 mirrors the atomic bump.
3. **An import row whose Customer ID collides with an existing Ops customer that was edited in the app**: the app-edited fields must survive. Test in Task 9.
4. **Customers Out when the sheet has rows for customers that no longer exist** (deleted or merged): rebuild must clear them; incremental write must not duplicate a row. Test in Task 8.
5. **A driver who is a member of two companies with different hubs**: Today shows only the active company's hub sites and notes. Test in Task 6.

---

### Task 1: Shared test fake and assertion-based harness

**Files:**
- Create: `test/_fake.cjs`
- Modify: `test/ui.test.cjs:1-60`
- Create: `test/run.cjs`
- Modify: `package.json`

**Interfaces:**
- Produces: `makeFake(seed)` in `test/_fake.cjs` → `{ server, T, calls, start(): Promise<base>, stop(), setGmailFail(code|null) }` where `T` is the in-memory table map (same shape as the current `T` in `ui.test.cjs`, plus the tables added in Task 2: `dispatch_customers`, `dispatch_contacts`, `dispatch_site_hub_notes`, `dispatch_customer_activity`, `dispatch_customer_status` (a computed view, see Task 1 step 3)); `fakeRpc(name, body, T)` handles `dispatch_next_bol`, `dispatch_grant`, `dispatch_add_company`, `dispatch_revoke`, `dispatch_set_permissions`, `dispatch_set_super_admin`; REST filters additionally support `ilike`, `is`, `or` with `customer_id.eq.x,customer.eq.y` form, `select=` with embedded resource names ignored, `order=` and `limit=`.
- Produces: `newPage(browser, base, {viewport, members})` in `test/_fake.cjs` → a Playwright page with `config.js` routed to the fake, fonts aborted, page errors collected in `page.errs`.
- Produces: `test/run.cjs` runs every `test/*.test.cjs` in sequence and every `test/unit/*.test.mjs` through `node --test`, exits 1 on any failure.

- [ ] **Step 1: Extract the fake backend from `ui.test.cjs` into `test/_fake.cjs`** with the signatures above. `require('playwright')` resolves from the global install here; replace the absolute `/home/claude/.npm-global/...` path with `require('playwright')`.

- [ ] **Step 2: Add an RPC dispatcher and the new tables to the fake.** `dispatch_customers` rows get `customer_id` assigned on insert when missing, from `dispatch_company_settings[company].data.nextCustomerNumber` (bumped atomically, formatted `ADC-` + 4-digit zero-padded). `dispatch_customer_status` is served on GET by computing per customer `{company, customer_id, profile_complete}` from the fake tables using the 15-field rule in Task 2 step 6 (license/psa statuses are `'missing'` until Stage 2).

- [ ] **Step 3: Convert `ui.test.cjs` to use `makeFake` and `newPage`, and turn each `console.log(...)` check into an `assert`** (`assert.equal`, `assert.ok`, `assert.deepEqual`) on the same values. Keep the Gmail-failure case: assert the page error list, filtered of the one `502` message, is empty.

- [ ] **Step 4: Write `test/run.cjs`** and add to `package.json`: `"scripts": { "test": "node test/run.cjs" }`.

- [ ] **Step 5: Run the suite**

Run: `npm test`
Expected: `ui.test.cjs: ok` and exit code 0; screenshots and PDFs still written under `test/`.

- [ ] **Step 6: Commit**

```bash
git add test/_fake.cjs test/ui.test.cjs test/run.cjs package.json
git commit -m "test: shared fake backend and assertion-based UI suite"
```

---

### Task 2: Migration 005 — customers, sites, contacts, activity, permissions, audit

**Files:**
- Create: `supabase/migrations/005_customers.sql`
- Create: `supabase/tests/005_policies.sql`

**Interfaces:**
- Produces tables (spec §3.1, §3.2, §3.6, §3.8), with these exact columns:
  - `dispatch_customers(id uuid pk default gen_random_uuid(), company, customer_id text, name, also_known_as, legal_name, account_status text check in ('active','inactive','prospect') default 'active', primary_hub text, parent_customer_id uuid null references dispatch_customers(id), billing_street, billing_city, billing_state, billing_zip, last_verified date, notes, import_source jsonb, created_at, updated_at, created_by uuid, updated_by uuid)`, unique `(company, customer_id)`, index on `(company, lower(name))`.
  - `dispatch_sites` + columns `customer_id uuid null references dispatch_customers(id) on delete set null, receiving_hours text default '', gate_code text default '', parking_unloading text default '', hazmat_restrictions text default '', container_notes text default '', special_instructions text default '', last_verified date, import_source jsonb, updated_by uuid`. (Existing `gate`, `hours`, `instr` stay as the feed's copy; the new columns are Ops-owned.)
  - `dispatch_site_hub_notes(company, site_key, hub, scale_on_route boolean null, route_notes text default '', updated_at, updated_by)`, pk `(company, site_key, hub)`, fk `(company, site_key) → dispatch_sites`.
  - `dispatch_contacts(id uuid pk, company, customer_id uuid not null, site_key text null, type text check in ('receiving','site_manager','ordering','safety','billing','ap','owner','other'), first_name, last_name, phone, email, preferred_method text check in ('phone','email','text') null, notes, active boolean default true, cc_on_statements boolean default false, import_source jsonb, created_at, updated_at, created_by, updated_by)`.
  - `dispatch_customer_activity(id uuid pk, company, customer_id uuid not null, site_key text null, contact_id uuid null, occurred_at timestamptz default now(), method text check in ('call','email','text','in_person','app'), summary text not null, kind text check in ('note','driver_note') default 'note', status text check in ('approved','pending','rejected') default 'approved', logged_by uuid, reviewed_by uuid, reviewed_at timestamptz, rejection_reason text, created_at)`.
  - `dispatch_members` + `is_super_admin boolean default false`, `permissions jsonb default '{}'`.
  - `dispatch_log` + `changes jsonb` (and `table_name text`, `row_id text`).
- Produces functions: `dispatch_is_super_in(c text) returns boolean`; `dispatch_perm_in(c text, p text) returns boolean` (true for super admins, else `coalesce((permissions->>p)::boolean,false)` for an active member of `c`); `dispatch_set_permissions(p_user uuid, p_company text, p_perms jsonb)` (admin or super of that company; cannot target a super admin unless caller is super; logs); `dispatch_set_super_admin(p_user uuid, p_company text, p_on boolean)` (super admins only; logs); trigger function `dispatch_assign_customer_id()` (before insert on `dispatch_customers`, when `customer_id` is null: single `update dispatch_company_settings set data = jsonb_set(data,'{nextCustomerNumber}', …) … returning` → `'ADC-' || lpad(n::text, 4, '0')`); trigger function `dispatch_audit()` (after insert/update/delete on the four new tables and `dispatch_sites`: inserts `dispatch_log(company, who=auth.uid(), what='change', table_name, row_id, changes)` where `changes` is `{field: {from, to}}` for every differing top-level key of `to_jsonb(OLD)`/`to_jsonb(NEW)`, excluding `updated_at`/`updated_by`).
- Produces view `dispatch_customer_status(company, customer_id, id, profile_complete int, license_status text, license_expires date, license_number text, psa_status text, entity_status text)` with license/psa columns constant `'missing'`/null in this stage (Stage 2 replaces the view).

- [ ] **Step 1: Write the policy test file `supabase/tests/005_policies.sql`** as a DO block that creates three test users via `auth.users` inserts (super admin, coordinator without permissions, driver hub EB) and a second company `north`, then for each: `set local role authenticated; set local request.jwt.claims = '{"sub":"<uuid>","role":"authenticated"}'` and asserts with `raise exception` on failure:
  - driver: `select count(*) from dispatch_customers` = 0; `select count(*) from dispatch_sites where hub='LA'` = 0 and `where hub='EB'` ≥ 1; `select count(*) from dispatch_contacts where type in ('billing','ap','owner')` = 0 and `where type='receiving' and site_key in (EB sites)` ≥ 1; inserting a `dispatch_customer_activity` row with `kind='driver_note'` succeeds and `status` is forced `'pending'` even if `'approved'` was supplied (via a before-insert trigger `dispatch_driver_note_guard()`); the driver can select that row and not another user's.
  - coordinator without `manage_customers`: select customers ok; insert into `dispatch_customers` raises; update raises.
  - coordinator with `manage_customers`: insert ok; `customer_id` is `ADC-0101` when `nextCustomerNumber` was 101; a second insert is `ADC-0102`.
  - super admin: `dispatch_set_super_admin` works; a plain admin calling it raises `not allowed`.
  - two companies: a member of `north` only sees zero `adchem` rows in every new table.
  - audit: after `update dispatch_customers set billing_zip='94801'`, the newest `dispatch_log` row has `changes->'billing_zip'->>'to' = '94801'` and `what='change'`.

- [ ] **Step 2: Run the policy test against a Supabase development branch to see it fail** (tables missing). Use the Supabase MCP (`create_branch` on project `adchem-hours`, then `execute_sql` with the file contents); if branching is not available on the plan, run against the live project inside a transaction that ends with `rollback`.
Expected: error `relation "public.dispatch_customers" does not exist`.

- [ ] **Step 3: Write `supabase/migrations/005_customers.sql`** with everything in Interfaces, plus policies:
  - `dispatch_customers`: select `dispatch_can_edit_in(company)`; insert/update/delete `dispatch_perm_in(company,'manage_customers')`.
  - `dispatch_sites`: keep `dsi_read` and `dsi_write` as they are (`dispatch_can_edit_in`), because `/api/feed` upserts sites as the calling coordinator and must keep working for every coordinator. Add `dsi_driver_read` for select: `dispatch_role_in(company)='driver' and (dispatch_hub_in(company)='' or hub = dispatch_hub_in(company))`. The `manage_customers` permission gates site edits in the app (Task 5), not in SQL, for this table only.
  - `dispatch_site_hub_notes`: same as sites.
  - `dispatch_contacts`: select `dispatch_can_edit_in(company) or (driver of that hub and type in ('receiving','site_manager') and site_key in that hub's sites)`; writes `manage_customers`.
  - `dispatch_customer_activity`: select `dispatch_can_edit_in(company) or logged_by = auth.uid()`; insert `dispatch_role_in(company) is not null` with the driver-note guard trigger; update (review) `dispatch_perm_in(company,'approve_driver_notes')`.
  - `dispatch_members`: super admins may update `is_super_admin`; admins may update `permissions` (via the RPCs only — direct update policy unchanged).
  - `dispatch_customer_status`: `security_invoker = true`.
  - Grant/revoke execute on the new functions as in 001.
  - Seed: `jsonb_set(data,'{nextCustomerNumber}','1')` on `adchem` settings when absent; mark the existing admin account `is_super_admin = true`.

- [ ] **Step 4: Apply the migration to the branch and re-run the policy test**
Expected: the DO block completes with `NOTICE: 005 policies ok`.

- [ ] **Step 5: Run the Supabase security advisor on the branch** (MCP `get_advisors`, type `security`) and record the result in a comment at the end of the migration.
Expected: no new "function callable by anon" or "RLS disabled" findings for `dispatch_*`.

- [ ] **Step 6: Update the fake** (`test/_fake.cjs`): `dispatch_customer_status.profile_complete` counts these 15: name, legal_name, account_status, primary_hub, billing_street, billing_city, billing_state, billing_zip, ≥1 site with addr, ≥1 contact type `receiving` with phone, ≥1 contact type `billing` with email, license on file (always false this stage), license expiry (false), PSA signed (false), last_verified. Run `npm test`.
Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/005_customers.sql supabase/tests/005_policies.sql test/_fake.cjs
git commit -m "db: customers, contacts, site notes, activity, permissions, audit (005)"
```

---

### Task 3: Server permissions in `requireUser`

**Files:**
- Modify: `functions/_lib/auth.js:206-227`
- Create: `test/unit/auth.test.mjs`

**Interfaces:**
- Consumes: `dispatch_members.is_super_admin`, `permissions` (Task 2).
- Produces: `requireUser(request, env, roles, company, perm?)` — `me` gains `isSuper: boolean`, `perms: object`; when `perm` is given, throws `fail("You don't have the " + label + " permission.", 403, "forbidden")` unless `me.isSuper || me.perms[perm] === true`. Export `hasPerm(me, perm): boolean`. Labels: `{manage_customers:"manage customers", run_imports:"run imports", approve_driver_notes:"approve driver notes", manage_people:"manage people"}`.

- [ ] **Step 1: Write `test/unit/auth.test.mjs`** with `node:test`, stubbing `globalThis.fetch` to answer `/auth/v1/user` and `/rest/v1/dispatch_members` (select now includes `is_super_admin,permissions`) and `/rest/v1/dispatch_users`:
  - `requireUser` with `perm:'run_imports'` for a coordinator with `permissions:{}` rejects with status 403 and code `forbidden`.
  - same with `permissions:{run_imports:true}` resolves and `me.perms.run_imports === true`.
  - `is_super_admin:true` with empty permissions resolves for any `perm`.
  - `hasPerm({isSuper:false, perms:{a:true}}, 'a')` is true; `'b'` false.

- [ ] **Step 2: Run to verify it fails**
Run: `node --test test/unit/auth.test.mjs`
Expected: FAIL — `requireUser` ignores the fifth argument, and `me.perms` is undefined.

- [ ] **Step 3: Implement** in `auth.js`: widen the members select, add `isSuper`/`perms` to `me`, add the `perm` check and `hasPerm`.

- [ ] **Step 4: Run to verify it passes**
Run: `node --test test/unit/auth.test.mjs`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add functions/_lib/auth.js test/unit/auth.test.mjs
git commit -m "server: per-member permissions and super admin in requireUser"
```

---

### Task 4: Customers screen — list, new customer, profile

**Files:**
- Create: `public/customers.js`
- Modify: `public/index.html:48-56` (tab), `public/index.html:390` (new `<section id="panel-customers" hidden>` before People), `public/index.html:487-489` (script tag)
- Modify: `public/app.js:781-793` (`setTab`), `public/app.js:1443-1444` (`wire`), `public/app.js:2108-2120` (`applyAccess`), `public/app.js:2194-2206` (`loadCompanyData`)
- Modify: `public/styles.css` (append)
- Create: `test/customers.test.cjs`

**Interfaces:**
- Consumes: `state`, `$`, `esc`, `banner`, `supa`, `sbErr`, `hubBy`, `coName` from `app.js`; `state.me.isSuper`, `state.me.perms` (set in `applyAccess` from `dispatch_members` — extend `DB.me()` select to `company,role,hub,active,is_super_admin,permissions` and `pickCompany` to copy `isSuper`, `perms` onto `state.me`).
- Produces (globals, ES5):
  - `const CDB = { customers(), customer(id), saveCustomer(c), sitesFor(customerId), saveSite(s), hubNotesFor(siteKey), saveHubNote(n), contactsFor(customerId), saveContact(c), activityFor(customerId), addActivity(a), reviewNote(id, status, reason), historyFor(customerId), statusFor(customerId) }` — each returns plain objects with the SQL column names.
  - `renderCustomers()` (list), `openCustomer(id)` (page with tabs `profile|sites|contacts|activity|history`), `closeCustomer()`, `canManageCustomers()` → `state.me.isSuper || !!(state.me.perms||{}).manage_customers`.
  - Element ids: tab `tab-customers`, panel `panel-customers`, list `custList`, search `custSearch`, filters `custHub`, `custStatus`, `custIncomplete`, button `btnNewCustomer`, page `custPage`, page tabs `ctab-profile` …, profile inputs `cName, cAka, cLegal, cStatus, cHub, cParent, cBillStreet, cBillCity, cBillState, cBillZip, cVerified, cNotes`, save `btnSaveCustomer`, badge `custComplete`.
  - `state.customers` (array), `state.customer` (open one or null).
- `setTab` gains `"customers"`; `applyAccess` shows `tab-customers` when `state.canEdit`; `loadCompanyData` calls `CDB.customers()` into `state.customers` when `state.canEdit`.

- [ ] **Step 1: Write `test/customers.test.cjs`** (uses `makeFake`, `newPage`; sign in as the admin seeded in the fake with `is_super_admin:true`):
  - `#tab-customers` visible after sign-in; click it; `#custList` renders 0 rows and the text `No customers yet`.
  - click `#btnNewCustomer`, fill `cName`="Type 7 Manufacturing", `cLegal`="Type 7 Manufacturing, Inc.", `cHub`="EB", billing fields, click `#btnSaveCustomer`; assert `T.dispatch_customers[0].customer_id === 'ADC-0001'` (fake seeds `nextCustomerNumber:1`), `#custComplete` text matches `/\d+ of 15/`, and the list shows the row with `ADC-0001`.
  - edit `cBillZip` to `94607`, save; assert the fake's `dispatch_log` has an entry with `changes.billing_zip.to === '94607'` (the fake's REST layer must emit audit rows on PATCH/POST to the five audited tables — add that to `_fake.cjs` in this task).
  - search `custSearch`="type" shows 1 row; "zzz" shows 0 and the text `No customers match`.
  - a coordinator member with `permissions:{}`: `#btnNewCustomer` is disabled and `#btnSaveCustomer` is disabled; with `permissions:{manage_customers:true}` both enabled.
  - `document.documentElement.scrollWidth === 390` on a 390-wide page with the customer page open.

- [ ] **Step 2: Run to verify it fails**
Run: `node test/customers.test.cjs`
Expected: FAIL — `#tab-customers` not found.

- [ ] **Step 3: Add the tab, panel and script tag to `index.html`**, the panel containing: a toolbar card (search, hub select, status select, "Incomplete only" checkbox, New customer button), `#custList` card, and `#custPage` (hidden) with a header (name, ID chip, status chip, completeness badge, Close button), a tab strip (`ctab-*`), and one `<div id="cpane-profile">` … `#cpane-history` per tab. Profile pane holds the inputs above in `.grid` rows and `#btnSaveCustomer`.

- [ ] **Step 4: Implement `public/customers.js`**: `CDB` over `supa.from(...)` scoped by `state.company`; `renderCustomers()` builds rows `name · customer_id · status chip · hub · profile_complete/15 · last_verified`, filtered client-side from `state.customers` + `CDB.statusFor`; `openCustomer(id)` loads the row into the inputs; `saveCustomer` upserts with `updated_by: state.session.user.id`, then re-reads to pick up the trigger-assigned `customer_id`, then `renderCustomers()`. Disabled state of the two buttons follows `canManageCustomers()`. Append the small CSS it needs to `styles.css` (`.cust-row`, `.badge-complete`), reusing `.card`, `.chip`, `.grid`, `.btn`.

- [ ] **Step 5: Hook `app.js`** at the four places in Files; extend `DB.me()` and `pickCompany` as in Interfaces.

- [ ] **Step 6: Run both suites**
Run: `npm test`
Expected: exit 0; `customers.test.cjs: ok`.

- [ ] **Step 7: Commit**

```bash
git add public/customers.js public/index.html public/app.js public/styles.css test/customers.test.cjs test/_fake.cjs
git commit -m "app: customers list and profile with per-member permission"
```

---

### Task 5: Sites, contacts, activity and history tabs on the customer page

**Files:**
- Modify: `public/customers.js`
- Modify: `public/index.html` (`#cpane-sites`, `#cpane-contacts`, `#cpane-activity`, `#cpane-history` contents)
- Modify: `test/customers.test.cjs`

**Interfaces:**
- Consumes: `CDB` (Task 4), `state.hubs`.
- Produces:
  - Sites pane: list of `dispatch_sites` where `customer_id = state.customer.id`, each expandable to an edit form with ids prefixed `s_` + site_key hash (`data-site="<site_key>"` on the form; inputs `data-k="addr|city|hub|receiving_hours|gate_code|parking_unloading|hazmat_restrictions|container_notes|special_instructions|last_verified|site_label"`), a per-hub notes table (`data-hubnote="<hub>"` rows with `scale_on_route` select yes/no/unknown and `route_notes`), Save per site; `#btnAddSite` creates a site with `site_key = customer_id + ' — ' + label`, `code_raw=''`, `code=null`, `synced_at=now`, and a "Same as billing" checkbox `#sSameAsBilling` that fills addr/city from the customer.
  - Contacts pane: grouped by `type` in the order `receiving, site_manager, ordering, safety, billing, ap, owner, other`; rows show name, phone as `tel:` link, email as `mailto:`; `#btnAddContact` opens an inline form `cf_type, cf_first, cf_last, cf_phone, cf_email, cf_method, cf_site, cf_cc, cf_notes`; deactivate toggles `active`.
  - Activity pane: `#actList` newest first with method, summary, who, when; pending driver notes shown first with `data-approve="<id>"` / `data-reject="<id>"` buttons (reject prompts for a reason) visible only when `state.me.isSuper || perms.approve_driver_notes`; `#actAdd` form `act_method, act_summary, act_contact` writes `kind:'note', status:'approved', logged_by`.
  - History pane: `#histList` from `CDB.historyFor(id)` = `dispatch_log` rows where `table_name='dispatch_customers' and row_id=id` or `(table_name in ('dispatch_sites','dispatch_site_hub_notes') and row_id in this customer's site keys)` or `(table_name in ('dispatch_contacts','dispatch_customer_activity') and row_id in this customer's contact/activity ids)`, rendered as `when · who · field: from → to` lines (one line per field in `changes`).

- [ ] **Step 1: Extend `test/customers.test.cjs`** (continuing from the saved Type 7 customer):
  - Sites: click `#btnAddSite`, tick `#sSameAsBilling`, set label "Primary", `gate_code`="4321", `receiving_hours`="7–11am", hub note for EB `scale_on_route`=yes, `route_notes`="Scale on 580"; save; assert `T.dispatch_sites` has one row with `customer_id` = the customer's id, `addr` = billing street, `gate_code==='4321'`, and `T.dispatch_site_hub_notes[0]` is `{hub:'EB', scale_on_route:true, route_notes:'Scale on 580'}`.
  - Contacts: add a `receiving` contact "Sam" with phone and a `billing` contact with email; assert two rows in `T.dispatch_contacts` and that the pane shows a `tel:` link and a `mailto:` link; completeness badge rises by 2.
  - Activity: add a note; assert `T.dispatch_customer_activity[0].kind==='note'` and `status==='approved'`; seed a `pending` driver note in `T` and reload the pane; click `data-approve`; assert `status==='approved'` and `reviewed_by==='u1'`.
  - History: assert `#histList` contains a line matching `/billing_zip.*94607/` and one for `gate_code` on the site.

- [ ] **Step 2: Run to verify it fails**
Run: `node test/customers.test.cjs`
Expected: FAIL — `#btnAddSite` not found.

- [ ] **Step 3: Implement the four panes** in `customers.js` and their markup in `index.html`.

- [ ] **Step 4: Run both suites**
Run: `npm test`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add public/customers.js public/index.html test/customers.test.cjs
git commit -m "app: customer sites, contacts, activity and history"
```

---

### Task 6: Today — site notes, receiving contact, driver notes; People — permissions

**Files:**
- Modify: `public/app.js:907-978` (`renderToday`), `public/app.js:2051-2104` (`renderUsers`), `public/index.html` (People panel hint text, permission controls)
- Modify: `public/customers.js` (driver-side helpers)
- Modify: `test/ui.test.cjs` (driver section), `test/customers.test.cjs` (People section)

**Interfaces:**
- Consumes: `dispatch_sites` new columns (drivers can now select their hub's sites — Task 2 policy), `dispatch_contacts` (receiving/site_manager only for drivers), `dispatch_site_hub_notes`, `dispatch_customer_activity` insert (driver notes).
- Produces:
  - `DB.sites()` (app.js) also returns `customerId, receivingHours, gateCode, parkingUnloading, hazmatRestrictions, containerNotes, specialInstructions, lastVerified` and is now loaded for drivers too (`loadSitesFromDb` no longer returns early for drivers; it loads only their hub's rows by policy).
  - `siteNotesHtml(site, hub)` in `customers.js` → the block rendered under each stop in `renderToday`: gate code, receiving hours, unloading, restrictions, container notes, special instructions, and this hub's `route_notes` + scale flag from `CDB.hubNotesFor`; receiving contact as a `tel:` link from `CDB.contactsForSite(siteKey)` (new CDB method, types receiving/site_manager); an **Add note** button `data-note="<site_key>"` opening a one-field prompt that writes `{kind:'driver_note', status:'pending', method:'app', site_key, customer_id, summary, logged_by}`; the driver's own notes for that site listed under it with their status.
  - Order → site mapping in Today: `o.siteKey`, which `draftOrderFromForm` (app.js:514) already stores on every order; when it is blank (older orders), fall back to the site whose `lower(customer)` and `hub` match the order.
  - People: each member row gains, for admins/supers, checkboxes `data-perm="<user_id>:<perm>"` for `manage_customers, approve_driver_notes, run_imports, manage_people` writing through `DB.setPermissions(user_id, perms)` → `rpc('dispatch_set_permissions')`; a **Super admin** checkbox `data-super="<user_id>"` visible only to super admins → `rpc('dispatch_set_super_admin')`; the hint text "Drivers: one account per hub — e.g. driver-eb@adchem.pro — signed in on that hub's phones." becomes "Drivers: one account per person, with their hub."

- [ ] **Step 1: Extend `test/ui.test.cjs` driver section**: seed in `T` a site for Type 7 at hub EB with `gate_code:'4321'`, `receiving_hours:'7–11am'`, a receiving contact with phone, and a hub note for EB; after the driver signs in, assert the first `.stop` contains `4321`, `7–11am`, an `a[href^="tel:"]`, and the route note; click `[data-note]`, enter "Gate moved to the north side", and assert `T.dispatch_customer_activity` has a row `{kind:'driver_note', status:'pending', logged_by:'u1'}` and the stop now shows `pending`. Then switch `T.dispatch_members` to a second company membership with hub LA and reload: assert the EB site's gate code is not on the page (Review Focus 5).

- [ ] **Step 2: Extend `test/customers.test.cjs` People section**: as super admin, tick `data-perm="u2:manage_customers"` for a seeded coordinator `u2`; assert the fake's `dispatch_members` row for u2 has `permissions.manage_customers === true`; tick `data-super="u2"`; assert `is_super_admin === true`; sign in as a plain admin (`is_super_admin:false`) and assert no `[data-super]` elements render.

- [ ] **Step 3: Run to verify both fail**
Run: `npm test`
Expected: FAIL on the Today assertions (no gate code in `.stop`) and People assertions (`[data-perm]` not found).

- [ ] **Step 4: Implement** per Interfaces (app.js `renderToday` calls `siteNotesHtml` when a site is found by `o.siteKey`, else by `lower(customer)` + `hub`; `renderUsers` adds the checkboxes; `DB.setPermissions`, `DB.setSuperAdmin`; fake RPCs already exist from Task 1).

- [ ] **Step 5: Run both suites**
Run: `npm test`
Expected: exit 0; driver page `scrollWidth === 390`.

- [ ] **Step 6: Commit**

```bash
git add public/app.js public/customers.js public/index.html test/ui.test.cjs test/customers.test.cjs test/_fake.cjs
git commit -m "app: site notes and driver notes on Today; permission switches on People"
```

---

### Task 7: Order entry reads Ops customers

**Files:**
- Modify: `public/app.js:288-324` (`fillAccounts`, `currentSiteRow`, `onCustomerInput`, `applySite`), `public/app.js:505-529` (`draftOrderFromForm`)
- Modify: `test/ui.test.cjs`

**Interfaces:**
- Consumes: `state.customers` (Task 4), `DB.sites()` rows with `customerId`.
- Produces: `customerForSite(row)` → the `state.customers` entry whose `id === row.customerId`, else the one whose `lower(name) === lower(row.customer)` when exactly one matches, else `null`; orders carry `data.customerId` (uuid or null) and `data.customerNo` (`ADC-####` or `''`) set in `draftOrderFromForm` from the chosen site row; `fillAccounts` lists the union of feed customer names and `state.customers[].name` (deduplicated, case-insensitive); `feedRowsFor(name)` additionally returns Ops-created sites (rows with `code === null`) for that name, after the feed rows.

- [ ] **Step 1: Extend `test/ui.test.cjs`**: seed two Ops customers "VKGL Manufacturing LLC" (`ADC-0007`, site key `VKGL — Primary` linked by `customer_id`) and "VKGL Manufacturing - LA" (`ADC-0008`, site `VKGL LA — Plant` linked), both with feed rows; create an order for "VKGL Manufacturing LLC" choosing the `VKGL LA — Plant` site; assert the saved order's `data.customerNo === 'ADC-0008'` (Review Focus 1). Create an order for a customer that exists only in Ops (no feed row): assert it saves with `data.customerNo` set and `effCode === 'CHECK'` (not on FEED_ORDERS → CHECK, existing rule).

- [ ] **Step 2: Run to verify it fails**
Run: `node test/ui.test.cjs`
Expected: FAIL — `data.customerNo` undefined.

- [ ] **Step 3: Implement** per Interfaces.

- [ ] **Step 4: Run both suites**
Run: `npm test`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add public/app.js test/ui.test.cjs test/_fake.cjs
git commit -m "app: orders link to the Ops customer by site"
```

---

### Task 8: Customers Out writer, Setup card, health line

**Files:**
- Create: `functions/_lib/customersout.js`
- Create: `functions/api/customers-out.js`
- Modify: `functions/api/health.js:40-44`
- Modify: `public/index.html` (Setup card after Orders Out), `public/customers.js` (`afterCustomerSave` → `API.post('/api/customers-out',{customerIds:[id]})` best effort), `public/app.js` `wire` (buttons `btnSaveCustomersOut`, `btnRebuildCustomersOut`), `renderSetup` (`renderCustomersOutState`)
- Create: `test/unit/customersout.test.mjs`
- Modify: `test/customers.test.cjs`, `test/_fake.cjs` (`/api/customers-out` route recording calls)

**Interfaces:**
- Consumes: `gfetch` (`_lib/google.js`), `requireUser` with `perm` (Task 3), `sb`, `companyContext`; `ctx.settings.customersOutSheetId`.
- Produces in `customersout.js`: `export const TAB = "Customers Out"`; `export const HEADER` = the 33 columns in spec §9 order; `export function rowsFor(c, sites, contacts, status, tz, now): string[][]` — one row for the customer with its primary site (the site with `site_label==='Primary'`, else the first), plus one row per additional site with the customer columns repeated and the delivery columns from that site; billing/owner/delivery contacts chosen by type (`billing` → Billing Contact/Phone/Email, CC Emails = emails of `billing` contacts with `cc_on_statements`; `owner`; `receiving` → Delivery Contact/Phone, preferring the one whose `site_key` matches the row's site); `Profile Complete` as `"n of 15"`; `License Status`, `PSA Status`, `Entity Status` from `status` (`'missing'` this stage); dates `MM/DD/YYYY`; `Updated At` via a `stampIn(date, tz)` identical to the private one in `orderlog.js` (export it from `orderlog.js` and import it, rather than copying). `export async function writeCustomersOut(env, db, ctx, company, customerIds, rebuild)` keyed on column A (`Customer ID`) + column L (`Delivery Street`) pair: rebuild clears `A2:AG` and writes all; incremental rewrites matching rows in place and appends the rest, and **deletes** sheet rows for a listed customer that no longer has that site (batch `deleteDimension`) so a merged site never lingers. `export async function tryWriteCustomersOut(...)`.
- Produces `functions/api/customers-out.js`: `POST {customerIds:[uuid]} | {rebuild:true}`, roles admin/coordinator, no extra permission (same as orderlog).
- Health: `out.checks.customersOut` = `"ok"` when the tab's `A1` is `Customer ID`, else the message, else `"no Customers Out sheet set on Setup"`.

- [ ] **Step 1: Write `test/unit/customersout.test.mjs`**:
  - `rowsFor` for a customer with two sites and billing/owner/receiving contacts returns 2 rows, `HEADER.length === 33`, every row has 33 cells, row 1 delivery columns are the Primary site's, row 2's are the plant's, `Profile Complete` is `"9 of 15"` for the fixture.
  - `writeCustomersOut` with a stubbed `gfetch` (`globalThis.fetch` mock keyed by URL): rebuild issues a `:clear` then a `PUT` with N rows; incremental with an existing sheet row for the same `(Customer ID, Delivery Street)` issues a `batchUpdate` and no append; incremental where the sheet has an extra row for that customer's old site issues a `deleteDimension` (Review Focus 4).

- [ ] **Step 2: Run to verify it fails**
Run: `node --test test/unit/customersout.test.mjs`
Expected: FAIL — cannot find module `customersout.js`.

- [ ] **Step 3: Implement `customersout.js` and `customers-out.js`**, mirroring `orderlog.js`/`orderlog.js` route structure.

- [ ] **Step 4: Run unit tests**
Run: `node --test test/unit/customersout.test.mjs`
Expected: PASS.

- [ ] **Step 5: Add the Setup card** (`#customersOutState`, input `#sCustomersOut`, buttons) and the health line; in `customers.js` call `tryWriteCustomersOut` via the API after every customer/site/contact save (banner on failure, never blocks). Extend `test/customers.test.cjs`: after a site save, `calls` contains `['customers-out', {customerIds:[id]}]`; Setup → paste link, Save, Rebuild → `calls` contains `['customers-out', {rebuild:true}]` and `T.dispatch_company_settings[0].data.customersOutSheetId` is the ID.

- [ ] **Step 6: Run both suites**
Run: `npm test`
Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add functions/_lib/customersout.js functions/api/customers-out.js functions/api/health.js public/index.html public/customers.js public/app.js test/unit/customersout.test.mjs test/customers.test.cjs test/_fake.cjs
git commit -m "server+app: Customers Out sheet writer, Setup card, health check"
```

---

### Task 9: Import — read, plan, review, commit

**Files:**
- Create: `functions/_lib/importsheet.js`
- Create: `functions/api/import.js`
- Create: `public/import.js`
- Modify: `public/index.html` (Setup card `#importCard`, script tag), `public/app.js` `wire`/`renderSetup` hooks
- Create: `test/unit/importsheet.test.mjs`, `test/fixtures/import-workbook.json`
- Modify: `test/customers.test.cjs`, `test/_fake.cjs` (`/api/import` route driven by the fixture through the real `planImport`)

**Interfaces:**
- Consumes: `gfetch`, `requireUser(..., 'run_imports')`, `sb`, `companyContext`; `ctx.settings.importSheetId`.
- Produces in `importsheet.js` (pure, no I/O):
  - `export const TABS = { directory: "Customer Directory", customers: "Customers", licensing: "Licensing & Entity", delivery: "Delivery Notes", terms: "Account Terms" }`.
  - `export const HEADERS` — for each tab, the header names the planner needs (spec §8; Directory: `Customer (QuickBooks name)`, `Also Known As`, `Legal / Billing Company Name`, `Account Status`, `Primary Hub`, billing `Street/City/State/ZIP`, `Same as billing?`, delivery `Street/City/State/ZIP`, `Delivery same as billing contact?`, `Delivery Contact Name`, `Delivery Phone`, billing `First Name/Last Name/Phone`, `Billing / AP Email`, `CC on Statements (emails)`, `Owner same as billing contact?`, owner `First Name/Last Name/Phone/Email`, `Best Way to Reach`, `Last Verified`, `Notes`, `Customer ID`, `Parent / Related Account`; Delivery Notes: `Customer`, `Serving Hub`, `Receiving Days / Hours`, `Site Contact`, `Site Phone`, `Gate / Access Code`, `Parking & Unloading (dock, liftgate, forklift)`, `Scale on Route? (from East Bay)`, `Route / Scale Notes (East Bay)`, `Scale on Route? (from SoCal)`, `Route / Scale Notes (SoCal)`, `Hazmat / Site Restrictions`, `Cylinder / Container Notes (pigs, dewars, bins, swaps)`, `Special Delivery Instructions`, `Last Verified`; Customers: `Customer`, `Also Known As`, `Legal Name`, `Account Status`, `Street`, `City`, `State`, `ZIP`, `Contact`, `Phone`, `Email`; the Licensing and Terms tabs are read in Stage 2 — this stage records them as `skipped: later stage`).
  - `export function readTab(values, headerRowIndex): {rows: object[], missing: string[]}` — locates headers by exact text on the given row (the Directory's headers are on row 4 because of the group-header rows; detect the header row as the first row containing `Customer ID`), returns objects keyed by header; `missing` lists expected headers not found. Duplicate header names (`Street`, `First Name`…) are disambiguated by their group: the planner takes them positionally within the group blocks `BILLING ADDRESS`, `DELIVERY ADDRESS`, `BILLING CONTACT`, `COMPANY OWNER` found on the row above the headers.
  - `export function planImport(workbook, existing): Plan` where `workbook = {directory: values[][], customers, delivery, licensing, terms}` and `existing = {customers: dispatch_customers rows, sites: dispatch_sites rows}`; `Plan = { items: Item[], problems: string[], missingHeaders: {tab: string[]} }`; `Item = { key, source:{tab,row}, action: 'customer'|'site'|'related'|'contact'|'skip'|'problem', customer_id, name, decision (editable), detail, fields }`. Rules: a Directory row becomes `site` under an existing plan customer when its legal name equals that customer's legal name (case-insensitive, after stripping ` - <city>` and ` LLC/Inc/Inc.` suffixes) and its delivery address differs; else `customer`, with `parent` from `Parent / Related Account` when it names another row; contacts from the three contact blocks honouring the `same as` flags; Delivery Notes rows attach to the customer by exact `Customer` name match and emit site field updates plus hub notes for `EB` and `LA`; Customers-tab rows match by name and fill only blank fields; money columns are never read into `fields`.
  - `export function applyPlan(plan, existing): {customers, sites, siteHubNotes, contacts, nextCustomerNumber}` → the rows to upsert, **without** touching any field of an `existing` row whose `updated_by` is not null and not the import user (Review Focus 3); `nextCustomerNumber = max(numeric part of all customer_ids) + 1`.
- Produces `functions/api/import.js`: `POST {action:'read'}` → reads the five tabs (`A1:AZ2000`), returns `{plan, sheetId}`; `POST {action:'commit', plan}` → `applyPlan`, upserts in batches of 200 within one request (customers first, re-read to map `customer_id → id`, then sites, hub notes, contacts), writes `dispatch_log {what:'import', detail:{counts}}`, sets `nextCustomerNumber`, calls `tryWriteCustomersOut(…, rebuild:true)`, returns `{counts}`.
- Produces `public/import.js`: Setup card `#importCard` with `#sImportSheet`, `#btnImportRead`, review table `#importPlan` (one row per item: source, proposed action as a `<select data-decision="<key>">`, name, ID, detail; problems in red), `#btnImportCommit` (disabled until a plan is read), summary `#importResult`. Visible only with `run_imports`.

- [ ] **Step 1: Write `test/fixtures/import-workbook.json`** — values arrays for the five tabs with: 4 Directory rows (Type 7; VKGL Manufacturing LLC; VKGL Manufacturing - LA with the same legal name and a different delivery address; Costa Cannabis with `Parent / Related Account` = Type 7), billing/delivery/owner blocks, one `Same as billing?` = Yes; 2 Delivery Notes rows (Type 7 with EB scale yes + notes, Costa with gate code); 2 Customers rows (Type 7 duplicate with Terms/Credit Limit filled; a Customers-only row "Bio-Rad"); Licensing and Terms with one row each.

- [ ] **Step 2: Write `test/unit/importsheet.test.mjs`**:
  - `readTab` on the Directory fixture finds the header row at index 3 and reports `missing: []`; with `Customer ID` renamed, `missing` includes it and `planImport` returns `problems` naming the tab.
  - `planImport` yields: Type 7 → `customer` with `customer_id 'ADC-0001'`; VKGL LLC → `customer`; VKGL - LA → `site` under VKGL LLC; Costa → `customer` with `parent` = Type 7's key; Bio-Rad → `customer` (from the Customers tab, no Directory row); contacts: Type 7 has `receiving`, `billing` and `owner` entries, and when `Owner same as billing contact?` = Yes only one contact object carries both roles' fields (type `billing`, plus a flagged `owner_same:true`); Delivery Notes map to `fields.receiving_hours`, `gate_code`, and `hubNotes: [{hub:'EB', scale_on_route:true, route_notes}]`; no item's `fields` has a key matching `/terms|credit|balance|price|fee|deposit/i`; licensing/terms items have `action:'skip'` with `detail: 'later stage'`.
  - `applyPlan` with an `existing` Type 7 whose `billing_zip` was edited (`updated_by:'u9'`) leaves `billing_zip` untouched and still fills `also_known_as` when blank; `nextCustomerNumber === 9` when the highest imported ID is `ADC-0008`.

- [ ] **Step 3: Run to verify it fails**
Run: `node --test test/unit/importsheet.test.mjs`
Expected: FAIL — cannot find module `importsheet.js`.

- [ ] **Step 4: Implement `importsheet.js`**, then `import.js` (API), then `public/import.js` and the Setup card.

- [ ] **Step 5: Run unit tests**
Run: `node --test test/unit/importsheet.test.mjs`
Expected: PASS.

- [ ] **Step 6: Extend `test/customers.test.cjs`**: as super admin, Setup → paste a sheet link, click `#btnImportRead`; assert `#importPlan` has 6 item rows and that the VKGL - LA row's decision select shows `site`; change it to `customer` via the select; click `#btnImportCommit`; assert `T.dispatch_customers.length === 5`, `T.dispatch_sites` has a `customer_id` for every row, `T.dispatch_site_hub_notes.length === 1`, `T.dispatch_company_settings[0].data.nextCustomerNumber === 9`, `calls` includes `['customers-out', {rebuild:true}]`, and `T.dispatch_log` has a `what:'import'` row. Then as a coordinator without `run_imports`, assert `#importCard` is hidden and a direct `POST /api/import` through the fake returns 403 (the fake's `/api/import` applies the same `perm` rule from `requireUser` — implement by exporting the check from `_fake.cjs`).

- [ ] **Step 7: Run both suites**
Run: `npm test`
Expected: exit 0.

- [ ] **Step 8: Commit**

```bash
git add functions/_lib/importsheet.js functions/api/import.js public/import.js public/index.html public/app.js test/unit/importsheet.test.mjs test/fixtures/import-workbook.json test/customers.test.cjs test/_fake.cjs
git commit -m "import: spreadsheet reader, review plan, commit with app-edit protection"
```

---

### Task 10: Docs, health, and the Google setup note

**Files:**
- Modify: `README.md` (Roles table, Deploy first run steps, new "Customers" section), `GOOGLE-SETUP.md` section D (share the import sheet as Viewer and the Customers Out sheet as Editor)
- Modify: `functions/api/health.js` (`out.checks.importSheet`: reads the Directory tab's first cells)
- Modify: `public/app.js` `renderHealth` lines for `customersOut` and `importSheet`

- [ ] **Step 1: Extend `test/customers.test.cjs`**: the fake's `/api/health` returns `checks:{customersOut:'ok', importSheet:'ok'}`; assert the Setup health card lists both lines.

- [ ] **Step 2: Run to verify it fails**
Run: `node test/customers.test.cjs`
Expected: FAIL — health card lacks `Customers Out`.

- [ ] **Step 3: Implement** the health line and the docs: README Roles table gains "super admin" and the per-person permissions; first-run step list gains "Customers Out: paste, Save, Rebuild" and "Import: share the spreadsheet to orders@ as Viewer, read, review, commit"; the driver account sentence becomes one account per person.

- [ ] **Step 4: Run both suites**
Run: `npm test`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add README.md GOOGLE-SETUP.md functions/api/health.js public/app.js test/customers.test.cjs test/_fake.cjs
git commit -m "docs+health: customers, permissions, Customers Out and import"
```

---

## Not in this plan (later stages, each its own plan)

- Stage 2 — Documents: `006_documents.sql`, `dispatch-docs` bucket, `/api/docs`, Documents hub, `view_documents`/`manage_documents` permissions, driver "My documents", the real `dispatch_customer_status` view, order-time warnings and the super-admin Warnings panel, expiry email.
- Stage 3 — Assets and Vision: `007_assets.sql`, `/api/vision`, container capture on Today, Assets tab, hub view.
- Stage 4 — Intake: `008_intake.sql`, `/api/intake`, Intake screen, Cron Trigger.
