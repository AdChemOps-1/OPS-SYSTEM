# Stage 3A — Asset Register — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every serialized gas container (cylinder, dewar, pig, tank) has one row in Ops with an owner, a fill state, a current place (hub, customer site or vendor) and a full event history; drivers keep it honest from the stop with one photo per container read by Cloud Vision and confirmed by them; the office sees the register, counts by state and place, and records fills and vendor movements.

**Architecture:** Migration `007_assets.sql` adds vendors, container types, assets, append-only asset events and the (3B-read) stock movements table; an after-insert trigger on events is the only thing that moves an asset. `functions/api/assets.js` reads serials through `functions/_lib/vision.js` + the pure `functions/_lib/serials.js`, and writes event batches after re-checking the caller's role. The front end is one new file `public/assets.js` (Assets tab, hub actions, Setup → Vendors, customer-hub Cylinders tab, the driver's Cylinders sheet on Today) with `app.js` hooks limited to the same places Stage 2 touched.

**Tech Stack:** As Stage 2 (plain ES5 SPA, Supabase RLS, Cloudflare Pages Functions, Playwright + `node:test`, the in-memory fake), plus Google Cloud Vision `images:annotate` through the existing service account.

**Spec:** `docs/superpowers/specs/2026-10-22-assets-and-inventory-design.md` — §2 decisions, §3.1–3.5 and 3.7–3.8 (data, permissions, files), §4 (access), §5.1, 5.2, 5.4 (screens), §6 (server), §7, §8, §9. §3.6 and §5.3 (inventory) are Stage 3B; 3A only creates the `dispatch_stock_movements` table and writes `filled` draw-downs into it.

## Global Constraints

- Every new table carries `company text not null references public.companies(id)`, `created_at`, `updated_at`, `created_by default auth.uid()`, `updated_by`; every policy is company-scoped through `dispatch_role_in / dispatch_hub_in / dispatch_can_edit_in / dispatch_is_super_in / dispatch_perm_in`; every table gets the `dispatch_audit` trigger and the `dispatch_keep_company` trigger on update.
- Migration `007_assets.sql` is idempotent without `drop` (guarded `DO` blocks for policies, `create or replace` for functions, views and triggers, `if not exists` everywhere), verified as `begin; <007>; <007>; <supabase/tests/007_policies.sql>; rollback;` through the Supabase MCP, applied with `apply_migration` only after the user says so. The MCP hangs on `drop`; never send one.
- Place kinds: `location_kind in ('hub','site','vendor')` as a check constraint written so that adding `'truck'` later is one `alter table … drop constraint / add constraint` pair (name the constraint `dispatch_assets_location_kind_chk`). Owner kinds `('adchem','vendor','customer')`. Fill `('full','empty','unknown')`. Condition `('in_service','out_of_service','lost','retired')`. Event types `('created','delivered','collected','to_vendor','from_vendor','filled','moved','loaded','sighted','corrected')`.
- Serials are stored trimmed and uppercased; unique per company on `upper(serial)`. Owner never changes through an event; only `dispatch_asset_correct` (needs `manage_assets`) changes `owner_kind/owner_id`, logged with `changes`.
- Permissions `view_assets`, `manage_assets` in `dispatch_members.permissions` (`MEMBER_PERMS` gains two switches). Super admins have both. Drivers need no switch: they read assets at their hub, at the sites of their hub's stops for today (orders dated today in their hub), or that they recorded an event on today; they insert only `delivered`, `collected`, `sighted`, `loaded`, `created` events whose `to`/`from` is their hub or one of today's stop sites.
- Photos: bucket `dispatch-docs`, paths `company/asset/<asset_id>/<event_id>.jpg` and `company/asset/new/<event_id>.jpg`. Storage insert under `asset/` by any member of role driver and by `manage_assets` holders of that company; select by `view_assets` or `owner = auth.uid()` (the uploader); no update; delete by `manage_assets`. Reads go through `/api/docs` `{action:'sign', path}` 5-minute URLs.
- Vision: the server calls `https://vision.googleapis.com/v1/images:annotate` with `TEXT_DETECTION` as the service account itself (scope `https://www.googleapis.com/auth/cloud-platform`, no impersonation). The browser never talks to Google. The driver confirms every serial; nothing is written on Vision alone.
- `occurred_at` on an event keeps the phone's time when within the last 30 days and not after `now()`, else `now()` (same rule as capture `captured_at`).
- Nothing in Ops holds a price, rental charge, deposit or cylinder fee.
- Front-end: ES5, no build; new screens in `public/assets.js` loaded after `documents.js`; `app.js` edits limited to tab navigation and `applyAccess`, `loadCompanyData`, `MEMBER_PERMS`, `renderToday` (one call), `renderHealth` (one line), `podIdb` version bump plus one queue store, `updatePodQueueNote`. Phone-first (`scrollWidth === 390`). Every interpolated value through `esc()`; failures as `banner(...)`.
- Tests assert with `node:assert`; `npm test` exits 0 with pristine output; SQL policy tests in `supabase/tests/007_policies.sql`.

## Review Focus

1. **A driver scans a serial the register says is at another customer**: the delivery must still go through, the asset ends at this site, and the history shows the prior place. Tested in Task 4 (server reorders a `sighted` correction ahead of the movement) and Task 7 (sheet shows "was at X").
2. **The same batch sent twice** (lost reply, offline retry): no duplicate assets or events; the second answer equals the first. Tested in Task 4 (idempotent by event id and by serial) and Task 7 (queue retry).
3. **A serial typed with lowercase and spaces** (`ab 1234`) must match an asset stored as `AB1234`. Tested in Task 2 (unique on `upper`) and Task 4 (normalisation before lookup).
4. **Vision returns the DOT marking or the tare weight as its biggest text**: the serial picker must rank `DOT-3AA2015`, `TW 48.2`, `50LB` below an alphanumeric serial. Tested in Task 3 on fixtures.
5. **A hub fill for a container type with no `fill_lb`**: the `filled` event is written, no stock row, and the response carries a warning the screen shows. Tested in Task 2 (trigger) and Task 6 (banner).

---

### Task 1: Fake and harness for assets

**Files:**
- Modify: `test/_fake.cjs`
- Create: `test/assets.test.cjs` (skeleton: opens the app as super admin, asserts `#tab-assets` exists hidden until Task 5 shows it)

**Interfaces:**
- Produces in the fake: tables `dispatch_vendors`, `dispatch_container_types`, `dispatch_assets`, `dispatch_asset_events`, `dispatch_stock_movements` with the columns of Task 2; seed for company `adchem`: three container types (`Carbon Dioxide/50lb Cylinder/fill_lb 50`, `Carbon Dioxide/20lb Cylinder/20`, `Nitrogen/260L Dewar/null`), one vendor `Airgas` (roles `{fill,rent}`), assets `AB1234` (50lb, adchem, full, hub `EB`), `CD5678` (50lb, vendor Airgas, empty, site = the seeded site of customer ADC-0001), `EF9012` (20lb, adchem, full, vendor Airgas); and for the second company one asset `ZZ0001`.
- RLS-like GET filter: super/`view_assets` → company rows; driver → assets whose `location_kind='hub'` and `location_id` = their hub, or `location_kind='site'` and the site belongs to an order dated `todayOf(T)` in their hub, or with an event `recorded_by` them today; others → none. Same filter for events through their asset.
- Storage: `POST /storage/v1/object/dispatch-docs/<company>/asset/...` accepted for drivers and `manage_assets`; sign returns a URL only when the path exists.
- API `POST /api/assets` with `{action:'read', eventId, kind, photoPath}` → `{candidates:[{text:'AB1234',score:0.9},{text:'DOT3AA2015',score:0.2}], raw:'…'}` (fixed), or `{candidates:[],error:'Vision is not enabled'}` when `T.__visionDown`; `{action:'events', company, events:[…]}` → applies Task 4's rules to `T` (creates unknown assets, writes events, moves the asset, writes a `filled` stock row) and returns `{ok:true, results:[{eventId, assetId, serial, status:'applied'|'duplicate'|'rejected', warning}]}`; `{action:'counts', company}` → the grouped counts of Task 4.
- RPC `dispatch_asset_correct(p_id, p_fields)` → updates owner/condition/notes for `manage_assets` holders, appends a `corrected` event; else `{message:'not allowed'}`.
- `T.__today` continues to drive "today".

- [ ] **Step 1: Add tables, seed, filters, storage paths, the API actions and the RPC to `_fake.cjs`**
- [ ] **Step 2: Create `test/assets.test.cjs` with the skeleton assertion** (`run.cjs` picks up every `test/*.test.cjs` by itself)
- [ ] **Step 3: Run the suites**
Run: `npm test`
Expected: exit 0.
- [ ] **Step 4: Commit**
```bash
git add test/_fake.cjs test/assets.test.cjs
git commit -m "test: fake backend learns vendors, container types, assets, events, Vision read"
```

---

### Task 2: Migration 007 and policy tests

**Files:**
- Create: `supabase/migrations/007_assets.sql`
- Create: `supabase/tests/007_policies.sql`

**Interfaces:**
- Tables exactly as spec §3.1–3.5 with the Global Constraints' enums. `dispatch_assets.serial` has a `before insert or update` trigger `dispatch_assets_normalize` that sets `serial = upper(btrim(serial))` and raises `'serial is required'` when empty; unique index `dispatch_assets_serial_uq on (company, serial)`.
- Guard `dispatch_assets_guard` (before insert/update, security definer): `location_id` exists for its kind in the company (`dispatch_hubs.code` / `dispatch_sites.id::text` / `dispatch_vendors.id::text`); `owner_id` likewise for vendor/customer, `''` for adchem; on update by anyone but the event trigger (flag `current_setting('dispatch.apply_event', true) = '1'`) a change to `location_kind`, `location_id`, `fill_state`, `last_seen_at`, `last_seen_by` raises `'location and fill change only through events'`; a change to `owner_kind`/`owner_id` outside `dispatch_asset_correct` (flag `dispatch.asset_correct`) raises `'owner changes only through dispatch_asset_correct'`; a driver (`dispatch_role_in(company)='driver'`) may insert only with `owner_kind in ('adchem','customer')`, `condition='in_service'`, `location_kind in ('hub','site')`.
- `dispatch_asset_events` guard `dispatch_asset_events_guard` (before insert): `occurred_at` rule; `recorded_by := auth.uid()`; a driver may insert only the five driver types, with `to_kind/to_id` and `from_kind/from_id` each either their hub (`dispatch_hub_in(company)`) or a site of an order dated `current_date` in their hub (`dispatch_orders` where `hub = dispatch_hub_in(company) and date = current_date and site_key = s.site_key` — join `dispatch_sites` on `id`), else raises `'not your stop'`.
- `dispatch_asset_apply_event` (after insert, security definer): sets the flag, updates the asset: `delivered` → `location = to (site)`, `fill_state = coalesce(fill_after,'full')`; `collected` → `location = to (hub)`, `fill = coalesce(fill_after,'empty')`; `to_vendor` → vendor, fill unchanged; `from_vendor` → hub, `fill = coalesce(fill_after,'full')`; `filled` → fill `full`, location unchanged, and when the container type has `fill_lb` insert `dispatch_stock_movements (hub = asset.location_id, product = type.product, container = '', item = '', qty = -fill_lb, unit = 'lb', reason = 'filled', asset_event_id)`; `moved` → `location = to`; `loaded`, `sighted`, `created` → `last_seen` only (`sighted` with a `to` also moves); `corrected` → whatever non-null `to`/`fill_after` says. Every type sets `last_seen_at = occurred_at`, `last_seen_by = recorded_by`.
- RPC `dispatch_asset_correct(p_id uuid, p_fields jsonb) returns void`: `manage_assets` or raises; sets the correct flag; updates any of `owner_kind`, `owner_id`, `condition`, `notes`, `tag`, `hydro_due`, `acquired_on`, `container_type_id` present in `p_fields`; inserts a `corrected` event with `note = 'owner/condition corrected'` and logs `changes`.
- View `dispatch_asset_counts` (`security_invoker`): `company, container_type_id, product, size_label, fill_state, location_kind, condition, count(*)`. Function `dispatch_asset_counts_for(c text)` (security definer, returns the same columns for editors of `c` so coordinators without `view_assets` see counts and no serials).
- Function `dispatch_driver_can_see_asset(a_id uuid) returns boolean` (security definer) implementing the driver read rule; policies `dasset_read`, `dasset_insert`, `dasset_update`, `dasset_delete` (manage only), `devent_read`, `devent_insert`, `dvendor_read` (any member), `dvendor_write` (manage), `dctype_read` (any member), `dctype_write` (manage), `dstock_read` (view_assets), `dstock_insert` (manage, plus the trigger as definer); storage policies `"dispatch assets read"`, `"dispatch assets write"`, `"dispatch assets delete"` on `asset/` paths per Global Constraints.
- Seed in a guarded `DO`: container types for `adchem` from the order form's gas containers (`Carbon Dioxide`: 20lb/50lb/100lb Cylinder, 230L/260L Dewar; `Nitrogen`: 200cu ft/300cu ft Cylinder, 260L Dewar; `Butane`: 120lb Cylinder, 500lb Pig; `Propane`: 100lb Cylinder, 400lb Pig; `Isobutane`: 116lb Cylinder, 480lb Pig; `Blended (Dual Blend)`: 114lb Cylinder, 450lb Pig; `Blended (Tri Blend)`: 100lb Cylinder) with `kind` by label (`Cylinder`→cylinder, `Dewar`→dewar, `Pig`→pig) and `fill_lb` = the leading number for `lb` labels, null otherwise; inserted only where `(company, product, size_label)` is absent.
- Grants: RPCs and `dispatch_asset_counts_for` execute to `authenticated`, revoked from `anon, public`; trigger functions and `dispatch_driver_can_see_asset` revoked from everyone but used by policies.

- [ ] **Step 1: Write `supabase/tests/007_policies.sql`** in the style of `006_policies.sql`: sets up a second company, a driver with an order for today at site S, a coordinator without switches, a manager with `manage_assets`; asserts (each with `raise exception` on failure): driver sees the asset at S and at their hub, not the one at another site, not the second company's; driver inserts `delivered` to S (asset moves, fill full) and is refused `filled` and a `delivered` to another site; direct `update … set location_id` by the manager raises; `dispatch_asset_correct` changes the owner and writes a `corrected` event; a `filled` event on a 50lb type writes a `-50 lb` stock row at the hub and on a dewar with null `fill_lb` writes none; inserting serial `' ab1234 '` stores `AB1234` and a second `AB1234` raises unique violation; coordinator without switches gets rows from `dispatch_asset_counts_for('adchem')` and none from `dispatch_assets`; storage: driver inserts under `adchem/asset/new/…`, the second company's driver cannot; the file ends `raise exception 'VERIFY-OK …'` carrying the key counts.
- [ ] **Step 2: Write `007_assets.sql`** per the Interfaces.
- [ ] **Step 3: Verify twice-plus-tests in one rolled-back batch** through the Supabase MCP `execute_sql` (project `ibcokjhjubltvoevpiik`): `begin; <007>; <007>; <tests>; rollback;`
Expected: the batch ends with the `VERIFY-OK` exception text; afterwards `select count(*) from pg_tables where tablename='dispatch_assets'` is 0.
- [ ] **Step 4: Commit**
```bash
git add supabase/migrations/007_assets.sql supabase/tests/007_policies.sql
git commit -m "db: assets, events, vendors, container types, stock movements; policies and tests"
```

---

### Task 3: Vision client and the serial picker

**Files:**
- Modify: `functions/_lib/google.js:30` (`googleToken(env, scopes = SCOPES, sub = env.GOOGLE_IMPERSONATE || "")`; cache key already includes `sub`; `gfetch` unchanged)
- Create: `functions/_lib/vision.js`
- Create: `functions/_lib/serials.js`
- Create: `test/unit/serials.test.mjs`, `test/unit/vision.test.mjs`
- Create: `test/fixtures/vision/*.json` (three hand-written `images:annotate` responses: `cylinder-indented.json` with blocks `DOT-3AA2015`, `TW 48.2`, `AB1234`, `2019`; `cylinder-sticker.json` with `AIRGAS`, `EXP 03/2027`, `KX77821`; `tote-card.json` with one large block `TOTE 0042` and small `525 LB`)

**Interfaces:**
- `vision.js`: `export async function readText(env, imageBytes /* ArrayBuffer|Uint8Array */) → { blocks: [{text, box:{x,y,w,h}}], raw: string }` — POSTs `{requests:[{image:{content:<base64>}, features:[{type:'TEXT_DETECTION'}]}]}` to `https://vision.googleapis.com/v1/images:annotate` with a token from `googleToken(env, ["https://www.googleapis.com/auth/cloud-platform"], "")`; `blocks` are `textAnnotations[1..]` (the first is the whole text, returned as `raw`), box from `boundingPoly.vertices`. Throws `Error` with the API's message on non-2xx (`err.status`). `export async function probe(env) → 'ok' | string` sends a 1×1 PNG and maps `403`/`PERMISSION_DENIED` containing `has not been used` to `'Cloud Vision API is not enabled on the Google Cloud project'`, `billing` to `'billing is not linked to the Google Cloud project'`, else the message.
- `serials.js`: `export function pickSerials(blocks, opts = {}) → [{text, score}]` sorted by score desc, max 5. `opts.kind` in `cylinder|dewar|pig|tank|bin|tote` (default `cylinder`), `opts.rules` optional `{patterns: string[] /* regex sources */, reject: string[]}` merged over `DEFAULT_RULES`. Normalise each block: uppercase, strip spaces and hyphens inside; score 1.0 for `^[A-Z0-9]{5,20}$`, 0 otherwise; multiply by 0.1 when it matches a reject pattern (`^(DOT|TC)`, `^TW`, `^\d{4}$` years 1950–2039, `^\d{1,4}(LB|L|KG|CUFT)$`, `^(EXP|MFG|DUE)`, `^\d{1,2}/\d{2,4}$`); +0.2 when the block's `y` is in the top 40% of the image for cylinders/dewars/pigs/tanks; for bin/tote, score × (block area / largest area). Equal texts merge keeping the best score. `export const DEFAULT_RULES`.
- `functions/api/health.js` gains `out.checks.vision = await probe(env)` inside the Google-configured branch, after `token`.

- [ ] **Step 1: Write `test/unit/serials.test.mjs`**: for each fixture, `pickSerials(blocksFrom(fixture), {kind})[0].text` equals `AB1234`, `KX77821`, `TOTE0042`; `DOT3AA2015` and `TW48.2` score ≤ 0.1; `pickSerials([])` is `[]`; custom `rules.reject` `['^AB']` demotes `AB1234` below `KX77821` when both present.
- [ ] **Step 2: Run them to see them fail** — Run: `node --test test/unit/serials.test.mjs` — Expected: FAIL, module not found.
- [ ] **Step 3: Implement `serials.js`**; run again — Expected: PASS.
- [ ] **Step 4: Write `test/unit/vision.test.mjs`** with a stubbed `globalThis.fetch`: `readText` posts the base64 body with `TEXT_DETECTION` and `authorization: Bearer …` obtained without a `sub` claim (assert the token request's JWT payload has no `sub`); maps the fixture response to `blocks` with boxes; `probe` returns `'ok'` on 200, the "not enabled" sentence on a 403 whose message contains `has not been used`, and the billing sentence on `billing`.
- [ ] **Step 5: Implement `vision.js` and the `googleToken` signature change**; run both unit files — Expected: PASS. Run `node --test test/unit/` — Expected: all pass (existing google-token tests unaffected).
- [ ] **Step 6: Add the health line and extend `test/unit/expiry.test.mjs`'s health test** with `vision: 'ok'` in the stub and the assertion `checks.vision === 'ok'`.
- [ ] **Step 7: Commit**
```bash
git add functions/_lib/google.js functions/_lib/vision.js functions/_lib/serials.js functions/api/health.js test/unit test/fixtures/vision
git commit -m "server: Cloud Vision text read, serial picker, Vision health line"
```

---

### Task 4: `/api/assets` — read, events, counts

**Files:**
- Create: `functions/api/assets.js`
- Create: `test/unit/assets.test.mjs`

**Interfaces:**
- `POST /api/assets` JSON `{action, company, …}`; `requireUser(request, env, null, company)` then per action:
  - `read` `{eventId, kind, photoPath}`: caller must be a driver or hold `manage_assets`; `photoPath` must start with `<company>/asset/`; downloads the object as the caller (`GET /storage/v1/object/authenticated/dispatch-docs/<path>` with the user token), calls `readText`, then `pickSerials(blocks, {kind, rules: settings.assetSerialRules})`; returns `{candidates, raw}`; on a Vision error returns 200 `{candidates:[], raw:'', error: message}` (never 5xx: the sheet falls back to typing).
  - `events` `{events:[{id, serial, type, containerTypeId?, ownerKind?, ownerId?, fillAfter?, from?:{kind,id}, to?:{kind,id}, occurredAt, orderId?, bolNumber?, siteId?, photoPath?, gps?, ocr?, note?}]}`: in order, per event: normalise serial (`upper`, strip spaces); find asset by `(company, serial)` as the caller; if missing and `type` ≠ `created`, require `containerTypeId` and create it first (owner from `ownerKind/ownerId` default adchem, fill `unknown`, location = `from` or `to`), recording a `created` event with the same `occurredAt`; if the asset's current location differs from `from` (when `from` given) insert a `sighted` event `{from: current, to: from, note:'was at <place>'}` before the movement; insert the event; if `photoPath` is under `asset/new/`, move the object to `asset/<assetId>/<eventId>.jpg` (`POST /storage/v1/object/move` as the caller); an event id that already exists → `status:'duplicate'` and continue; a policy rejection (PostgREST 42501 / the guard's messages) → `status:'rejected', reason`, and the batch continues (each event independent; the sheet shows which failed). `filled` on a type with null `fill_lb` → `status:'applied', warning:'no fill weight on this container type'`. Returns `{ok:true, results}`.
  - `counts` → `GET dispatch_asset_counts_for` via RPC, returns `{rows}`.
- Errors: `fail('not allowed', 403)` for a wrong role on `read`; `fail('bad path', 400)`; the batch is validated for shape (ids are UUIDs, `type` in the enum) before any write, else 400 naming the first bad index.

- [ ] **Step 1: Write `test/unit/assets.test.mjs`** with a `fetch` stub that plays Supabase (`/rest/v1/dispatch_assets`, `/rest/v1/dispatch_asset_events`, `/rest/v1/rpc/dispatch_asset_counts_for`, storage object GET/move) and Vision: `read` returns candidates from the fixture and `{candidates:[],error}` when Vision 403s; `events` creates an unknown serial (`created` then `delivered` rows posted, in that order, same `occurredAt`), normalises `' ab 1234 '` to the existing `AB1234`, inserts a `sighted` row before a `delivered` whose `from` differs from the current place, returns `duplicate` on a known event id, `rejected` with the guard's message on a 42501, `warning` on a dewar fill, moves the `new/` photo, and refuses a malformed batch with 400 naming index 1.
- [ ] **Step 2: Run** — `node --test test/unit/assets.test.mjs` — Expected: FAIL, module not found.
- [ ] **Step 3: Implement `functions/api/assets.js`**; run — Expected: PASS.
- [ ] **Step 4: Commit**
```bash
git add functions/api/assets.js test/unit/assets.test.mjs
git commit -m "server: /api/assets read (Vision + picker), event batches, counts"
```

---

### Task 5: People switches, tab wiring, Setup → Vendors and container types

**Files:**
- Modify: `public/index.html` (tab `#tab-assets` hidden after `#tab-documents`; panel `#panel-assets` with sub-tabs `#aRegister`, `#aCounts`, `#aActions`; Setup card `#vendorsCard` after the Warnings card; `<script src="/assets.js">` after `documents.js`)
- Create: `public/assets.js`
- Modify: `public/app.js` — `MEMBER_PERMS` (+ `["view_assets","View assets"],["manage_assets","Manage assets"]`), `applyAccess` (`$("tab-assets").hidden=!canViewAssets()`), `loadCompanyData` (call `resetAssets()`), tab navigation (`assets` → `renderAssets()`), Setup render (call `renderVendors()`)
- Test: `test/assets.test.cjs`

**Interfaces:**
- `assets.js` exposes on `window`: `canViewAssets()`, `canManageAssets()`, `resetAssets()`, `renderAssets()`, `renderVendors()`, and `ADB` = `{ vendors(), saveVendor(v), types(), saveType(t), assets(filter), asset(id), events(assetId), counts(), correct(id, fields), sendEvents(events), read(eventId, kind, photoPath), sign(path) }` wrapping `supa` and `API.post("/api/assets", …)` / `API.post("/api/docs", …)` like `DDB`.
- Setup → Vendors card: list (name, roles chips, contact, active), **Add vendor** form (`#vf_name`, `#vf_roles` three checkboxes, `#vf_contact`, `#vf_phone`, `#vf_email`, `#vf_notes`), edit in place, deactivate; a **Container types** disclosure below with the seeded list and an add/edit form (`#tf_kind`, `#tf_product` select from `PRODUCTS` gases, `#tf_size`, `#tf_fill`). Both visible with `view_assets`, editable with `manage_assets`.

- [ ] **Step 1: Extend `test/assets.test.cjs`**: super admin sees `#tab-assets`; a coordinator without switches does not; People shows the two switches and ticking *View assets* for the coordinator (via the existing `dispatch_set_permissions` fake) shows the tab for them; Setup → Vendors lists `Airgas` with `fill rent`; adding `Linde` with role `fill` appears in the list and in `T.dispatch_vendors`; a duplicate name `airgas` shows the banner "A vendor with that name exists"; container types list the three seeded rows; page `scrollWidth === 390`.
- [ ] **Step 2: Run** — `node test/assets.test.cjs` — Expected: FAIL on `#tab-assets`.
- [ ] **Step 3: Implement** the HTML, `assets.js` part 1 and the `app.js` hooks; run — Expected: PASS. Run `npm test` — Expected: exit 0.
- [ ] **Step 4: Commit**
```bash
git add public/index.html public/assets.js public/app.js test/assets.test.cjs
git commit -m "app: Assets tab wiring, asset permissions, Setup vendors and container types"
```

---

### Task 6: Register, detail and history, counts, hub actions

**Files:**
- Modify: `public/assets.js`, `public/index.html` (`#panel-assets` content)
- Test: `test/assets.test.cjs`

**Interfaces:**
- Register `#aRegister`: search `#aq` (serial/tag, debounced 150 ms), filters `#aHub`, `#aPlace` (hub/site/vendor), `#aOwner`, `#aFill`, `#aCond`, `#aType`; list rows `.a-row[data-id]` showing serial, type label, fill chip (`full`→`k-D`, `empty`→`warn`, `unknown`→`hint`), owner, place name (hub code / site label via `state.feed.rows` and `state.customersX` / vendor name), last seen; tap → detail `#aDetail`: fields, **History** list `.a-ev` (when · type · from → to · by · note, photo thumbnail button → `ADB.sign` → opens in a pre-opened tab like documents), manage actions (`#aEdit` form for tag/hydro/acquired/notes/type; **Change owner** select + save → `ADB.correct`; **Mark lost** / **Retired** → `ADB.correct({condition})`).
- Counts `#aCounts`: one table per container type: rows `full`/`empty`/`unknown`, columns each hub code, `At customers`, `At vendors`, `Lost`; from `ADB.counts()`.
- Hub actions `#aActions` (manage only): buttons **Fill**, **To vendor**, **From vendor**, **Move**, **Add assets** open `#actSheet`: hub select `#act_hub` (and `#act_vendor` for the vendor ones, `#act_to_hub` for Move, `#act_type` + `#act_owner` for Add), a serial list `#actList` fed by `#act_serial` + Enter or **Scan** (camera input `#act_photo` → upload to `asset/new/<eventId>.jpg` as the manager → `ADB.read` → candidate picker `#actPick` → add); **Confirm** builds one event per serial (`filled` / `to_vendor` / `from_vendor` with `fill_after:'full'` unless `#act_empty` ticked / `moved` / `created`) and calls `ADB.sendEvents`; results shown per serial (`applied`, `duplicate`, `rejected: reason`, `warning`), a banner "Fill recorded — no fill weight on …" when a warning comes back.

- [ ] **Step 1: Extend `test/assets.test.cjs`**: register lists the three seeded assets; typing `cd` filters to `CD5678`; filter place = vendor shows `EF9012`; opening `AB1234` shows history with its `created` event and the **Change owner** control; changing owner to `Airgas` writes a `corrected` event and the row shows `Airgas`; counts table for 50lb shows `full` × `EB` = 1 and `empty` × `At customers` = 1; Fill with serials `AB1234` and a typed new serial `NEW1` (type 50lb) sends two events, the result list shows `applied` twice and `T.dispatch_stock_movements` has two `-50` rows at `EB`; Fill on `EF9012`'s dewar type shows the warning banner; the coordinator with `view_assets` only sees no `#aActions` buttons.
- [ ] **Step 2: Run** — Expected: FAIL on the register list.
- [ ] **Step 3: Implement**; run — Expected: PASS. `npm test` — exit 0.
- [ ] **Step 4: Commit**
```bash
git add public/assets.js public/index.html test/assets.test.cjs
git commit -m "app: asset register, history, counts, hub actions with scan"
```

---

### Task 7: Driver Cylinders sheet on Today, offline queue, Load / My truck

**Files:**
- Modify: `public/assets.js` (sheet), `public/index.html` (`#cylSheet`, `#truckCard` on Today), `public/customers.js:423` (`siteNotesHtml` adds `cylindersButtonHtml(orderId, site)` next to the capture button for drivers), `public/app.js` (`podIdb` version 4 + store `a`; `updatePodQueueNote` counts and flushes `cylQueueAll`/`cylFlush`; Today renders `#truckCard` for drivers)
- Test: `test/assets.test.cjs`

**Interfaces:**
- `cylindersButtonHtml(orderId, site) → string` renders **Cylinders** when the order has a `Gases` line or `ADB.assets({site})` is non-empty (cached in `state.todayAssets[siteKey]` by `todayExtras`).
- `openCylinders(orderId, siteKey)` builds `state.cyl = {orderId, bolNo, siteId, customerId, slots:[{kind:'deliver', product, container, typeId, serial:null, photoPath:null, ocr:null, status}], collecting:[{assetId, serial, status}], extra:[]}` from `o.lines` (one slot per unit of each `Gases` line, `typeId` matched by `(product, container)` in `ADB.types()`) and the site's known assets.
- Scan path per slot: `#cyl_photo` (capture) → JPEG → `eventId = uuid()` → upload `asset/new/<eventId>.jpg` as the driver → `ADB.read(eventId, kind, path)` → `#cylPick` shows the top candidate large, up to two alternates, and `#cyl_typed`; **Yes** fills the slot; the serial is looked up in `state.todayAssets` + `ADB.assets({serial})`: known at this site → tick; known elsewhere → tick with "was at X" (`from` = its current place so the server inserts the `sighted` correction); unknown → `#cylNew` mini form (type select defaulted to the slot's `typeId`, owner `adchem`/`customer`, fill defaulted by slot kind) → marks slot `new`.
- **Done** → `events` batch: each delivered slot `{type:'delivered', from:{kind:'hub', id: state.me.hub}, to:{kind:'site', id: siteId}, fillAfter:'full', orderId, bolNumber, siteId, photoPath, gps, ocr, occurredAt}`; each collected `{type:'collected', from: site, to: hub, fillAfter:'empty', …}`; unknown serials carry `containerTypeId/ownerKind/ownerId` so the server creates them. GPS from `navigator.geolocation.getCurrentPosition` with a 3 s timeout, omitted on failure. Offline (`navigator.onLine===false`) or network failure → `cylQueue` stores `{id: batchId, company, events, blobs:{eventId: blob}}` in store `a`; `cylFlush` re-uploads any blob whose path is not yet in storage (a 409 counts as uploaded) then re-sends the same batch (same event ids → duplicates are harmless); the Today queue note counts batches.
- **Load**: `#truckCard` on Today for drivers: **Load** opens the same sheet in load mode (slots free-form, events `loaded` with `to` = hub); **My truck** lists today's `loaded` minus `delivered` serials from `ADB.events` filtered by `recorded_by = me` and today.

- [ ] **Step 1: Extend `test/assets.test.cjs`** (as the seeded driver with an order today containing `2 × 50lb Cylinder Carbon Dioxide` at the ADC-0001 site): the stop shows **Cylinders**; the sheet has two deliver slots and `CD5678` under Collecting; scanning (upload stub + fixed `read`) fills slot 1 with `AB1234` and shows "was at EB" is absent (it is at the hub = expected); typing `ab 1234` on slot 2 shows "already used"; typing `NEW9` opens the new form with type 50lb preselected; **Done** sends a batch where `T.dispatch_assets` now has `NEW9` at the site, `AB1234` at the site, `CD5678` at hub `EB` and `T.dispatch_asset_events` has `created`+`delivered` for NEW9; offline (`page.context().setOffline(true)`): Done keeps the batch in IndexedDB store `a`, the queue note says `1 waiting`; back online **Send waiting photos** flushes it and the assets move; sending the same batch twice leaves one event per id; driver cannot see `#tab-assets`; `scrollWidth === 390` with the sheet open.
- [ ] **Step 2: Run** — Expected: FAIL on the Cylinders button.
- [ ] **Step 3: Implement**; run — PASS. `npm test` — exit 0.
- [ ] **Step 4: Commit**
```bash
git add public/assets.js public/index.html public/customers.js public/app.js test/assets.test.cjs
git commit -m "app: driver Cylinders sheet with Vision confirm, offline queue, Load and My truck"
```

---

### Task 8: Customer hub Cylinders tab, docs, go-live notes

**Files:**
- Modify: `public/customers.js` (hub tab `#cpane-cylinders` rendered by `renderCustAssets(customerId)` from `assets.js`; the site card shows "N containers here since <date>")
- Modify: `public/assets.js` (`renderCustAssets`)
- Modify: `README.md` (Assets section: what it is, the two switches, the driver flow, hub actions, counts; migration 007 pending; Vision), `GOOGLE-SETUP.md` (B2 adds **Cloud Vision API**; a new note that Vision needs billing linked and no delegation scope; the health card gains a *Vision* line, twelve lines)
- Test: `test/customers.test.cjs` (one assertion: the ADC-0001 hub shows a Cylinders tab listing `CD5678`)

- [ ] **Step 1: Add the test assertion**; run `node test/customers.test.cjs` — Expected: FAIL.
- [ ] **Step 2: Implement the tab and the site line**; run — PASS.
- [ ] **Step 3: Update README.md and GOOGLE-SETUP.md**; reread both for consistency with Stage 2's wording (eleven → twelve lines).
- [ ] **Step 4: `npm test`** — exit 0, pristine.
- [ ] **Step 5: Commit**
```bash
git add public/customers.js public/assets.js README.md GOOGLE-SETUP.md test/customers.test.cjs
git commit -m "app+docs: customer Cylinders tab; README and Google setup for assets and Vision"
```
