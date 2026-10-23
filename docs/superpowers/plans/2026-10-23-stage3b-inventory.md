# Stage 3B — Inventory, Alerts and the Import Leftovers — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Each hub shows what it has on hand: bulk product in pounds, dry-ice and solvent containers, supplies, and full/empty gas containers from the register; receipts, production, adjustments and counts are recorded on an Inventory tab; deliveries draw counted containers down by themselves; reorder minimums raise a flag on the tab and a daily email; and the one-time import now also brings in the Licensing & Entity and Account Terms (PSA dates) tabs.

**Architecture:** `dispatch_stock_movements` (created in 007) is the ledger; on-hand is a view summing it per hub × product × container × item, unioned with full gas containers counted from `dispatch_assets`. A database trigger on `dispatch_orders` writes one `delivered` movement per non-gas order line when an order enters a delivered status (idempotent by order and line), and a reversing row if it leaves. `functions/api/stock.js` records movements as the caller; the daily expiry run also mails stock-below-minimum lines to `stockAlertRecipients`. One new front-end file `public/inventory.js` carries the Inventory tab; the import planner gains two tab readers that produce `cannabis_license` and `psa` documents.

**Tech Stack:** As Stage 3A (plain ES5 SPA, Supabase RLS, Cloudflare Pages Functions, Playwright + `node:test`, the in-memory fake).

**Spec:** `docs/superpowers/specs/2026-10-22-assets-and-inventory-design.md` §1 (3B scope), §2 (hub fills, dry ice), §3.5–3.7, §4, §5.3, §6 (3B lines), §7, §8, §9; and `docs/superpowers/specs/2026-10-20-customers-documents-assets-design.md` §3.3 (`extra` keys) and §8 (Licensing & Entity → `cannabis_license`; Account Terms → `psa` dates only; money columns never read).

## Global Constraints

- Migration `008_inventory.sql` is idempotent without `drop` (guarded `DO` blocks, `create or replace`, `if not exists`), verified as `begin; <008>; <008>; <supabase/tests/008_policies.sql>; rollback;` through the Supabase MCP (project `ibcokjhjubltvoevpiik`), applied only on the user's word. The MCP hangs on `drop`; never send one.
- Stock keys: `(company, hub, product, container, item)`. Bulk pounds: `container=''`, `item=''`, `unit='lb'`, `product` = the order form's product name (`Carbon Dioxide`, `Nitrogen`). Counted containers: `product` and `container` exactly as the order form's strings (`Dry Ice - Pellet` / `Bin`, `Acetone` / `55gal Drum`), `item=''`, `unit='count'`. Supplies: `product=''`, `container=''`, `item` = the supply name (`Regulator`, `Pallet`, `Strap`), `unit='count'`. Gas containers appear in on-hand as `unit='count'`, `product` = type product, `container` = type `size_label`, counted from `dispatch_assets` where `fill_state='full' and location_kind='hub' and condition='in_service'`; they never have movements of their own.
- Reasons: `received` (+, optional vendor), `produced` (+ containers and − bulk pounds in one entry), `delivered` (−, written only by the orders trigger), `filled` (−, written only by the 007 asset trigger), `adjusted` (±, note required), `counted` (the delta that makes on-hand equal the physical count), `consumed` (−, supplies used). Client inserts go through `/api/stock` only; `dstock_insert` still forbids `filled` and now also `delivered`.
- Delivered statuses: an order entering `Delivered` or `POD Received` from any other status writes the movements; leaving both for any other status writes reversing rows (`reason='adjusted'`, `note='undelivered <order id>'`). Idempotent through a partial unique index on `(order_id, product, container) where reason='delivered'`. Gas lines (`category='Gases'`) are never counted here (the register does that).
- Settings keys written only through RPCs: `stockAlertRecipients text[]` through `dispatch_set_stock_alerts(p_company, p_recipients)` (super admin); the 006 warnings guard's protected-key list gains it; `DB.saveSettings` strips it like the others.
- Permissions: `view_assets` reads on-hand, movements and minimums; `manage_assets` records movements and edits minimums. Super admins have both. Drivers see nothing of Inventory.
- The daily email: the existing cron run (`/api/expiry`, `send:true`) also builds one stock email per company whose `stockAlertRecipients` is non-empty and that has at least one row below minimum; subject `<Company> — stock below minimum: <N> item(s)`; never to orders@; skipped when nothing is below.
- Import: `HEADERS.licensing = ["Customer","Licensee Legal Name","License #","License Type","Status","Issued","Expires","County / Premises","Owners on the License","Entity Status (SOS)","Source","Checked","Notes"]`; `Balance (auto)` is never read. `HEADERS.terms = ["Customer","Quote Sent","Quote Accepted","PSA Sent for Signature","PSA Signed (Customer)","Countersigned (AdChem)","Effective Date"]`; every other Account Terms column (Terms, Credit Limit, Payment Method, Card Fee, pricing, fees, deposits, credit) is never read. A row whose Customer matches no planned or existing customer is a `problem` line, not skipped silently. Dates parse as the Directory's do (serials and `M/D/YYYY`); unparseable dates leave the field empty and add a problem line.
- Front-end: ES5 script files, no build; new screens in `public/inventory.js` loaded after `assets.js`; `app.js` edits limited to tab navigation, `applyAccess`, `loadCompanyData`, `DB.saveSettings` strip list, and the Setup → Warnings card (one recipients field); `import.js` edits limited to the two new review-line kinds. Phone-first (`scrollWidth === 390`). Every interpolated value through `esc()`; failures as `banner(...)`.
- Tests assert with `node:assert`; `npm test` exits 0 with pristine output; SQL policy tests in `supabase/tests/008_policies.sql`.

## Review Focus

1. **An order marked Delivered twice, or Delivered then back to Scheduled then Delivered again**: on-hand changes exactly once each way, never twice. Tested in Task 2 (trigger + unique index) and Task 4 (UI count after status flips).
2. **A physical count entered for a key with no prior movements** (first count of a yard): the delta equals the count and on-hand reads the count. Tested in Task 3 and Task 4.
3. **Produce with a bulk draw when bulk is already below zero** (receipts never entered): the entry still records and on-hand shows a negative bulk figure flagged, never silently clamped. Tested in Task 3 (server) and Task 4 (flag).
4. **A minimum set in pounds for a product tracked in counts** (or vice versa): the minimum form refuses the mismatch with a message. Tested in Task 4.
5. **An Account Terms row with a date typed as "pending" or "n/a"**: the PSA document is still created with the other dates, the field stays empty, and the review screen shows a problem line naming the cell. Tested in Task 5.

---

### Task 1: Fake and harness for inventory

**Files:**
- Modify: `test/_fake.cjs`
- Create: `test/inventory.test.cjs` (skeleton: app opens as super admin; `#tab-inventory` absent or hidden until Task 4)

**Interfaces:**
- Produces in the fake: `dispatch_stock_settings` rows; a computed on-hand (`onhandOf(T, company)` → rows `{hub, product, container, item, unit, qty, min_qty|null, below:boolean}` summing `dispatch_stock_movements` plus full in-service gas assets at hubs by type `(product, size_label)`); RPC `dispatch_set_stock_alerts(p_company, p_recipients)` (super admin only; writes `stockAlertRecipients`); the orders status rule (on PUT/PATCH/upsert of `dispatch_orders` whose status enters `Delivered`/`POD Received` from another status, push one `delivered` movement per non-Gases line `{hub:o.hub, product, container, qty:-qty, unit:'count', order_id}` unless one exists for `(order_id, product, container)`; on leaving, push reversing `adjusted` rows); API `POST /api/stock` with `{action:'move', company, entry}` → applies Task 3's rules and returns `{ok:true, ids:[…]}` (403 without `manage_assets`); `{action:'onhand', company}` → `{rows}` from `onhandOf`; `{action:'below', company}` → the `below` rows. `POST /api/expiry` additionally records `['stock_alert', {company, to, count}]` in `calls` when recipients exist and rows are below.
- Import: `fakeImport` reads the `Licensing & Entity` and `Account Terms` tabs from the fixture workbook `IMP` (extend the fixture with one row each) and produces `license` / `psa` items; `commit` writes `dispatch_documents` rows as Task 5 specifies.
- Seed for `adchem`: minimums `{hub:'EB', product:'Carbon Dioxide', container:'', item:'', min_qty:500, unit:'lb'}` and `{hub:'EB', product:'', container:'', item:'Regulator', min_qty:4, unit:'count'}`; movements: `+800 lb Carbon Dioxide` received at EB, `+10 Regulator` received at EB, `+6 Dry Ice - Pellet/Bin` produced at EB.

- [ ] **Step 1: Extend `_fake.cjs`** per the Interfaces, mirroring the style of the asset section.
- [ ] **Step 2: Create `test/inventory.test.cjs`** with the skeleton assertion (`run.cjs` picks it up).
- [ ] **Step 3: Run `npm test`** — Expected: exit 0.
- [ ] **Step 4: Commit** — `test: fake backend learns stock on-hand, minimums, delivered draw-down, stock alerts, import slices`

---

### Task 2: Migration 008 and policy tests

**Files:**
- Create: `supabase/migrations/008_inventory.sql`, `supabase/tests/008_policies.sql`

**Interfaces:**
- View `dispatch_stock_onhand` (`security_invoker`): `company, hub, product, container, item, unit, qty` = `sum(qty)` over `dispatch_stock_movements` grouped by the key, `union all` full in-service gas containers at hubs from `dispatch_assets` joined to `dispatch_container_types` (`unit='count'`, `container=size_label`, `item=''`). Function `dispatch_stock_onhand_for(c text)` (security definer) returns the view's rows plus `min_qty numeric` and `below boolean` (`min_qty is not null and qty < min_qty`) by left-joining `dispatch_stock_settings` on the key, for callers with `view_assets` or `dispatch_can_edit_in(c)`; the service role too (grant execute).
- Index `create unique index if not exists dispatch_stock_movements_delivered_uq on public.dispatch_stock_movements (order_id, product, container) where reason = 'delivered'`.
- Trigger function `dispatch_orders_stock_out()` (after update of `status` on `dispatch_orders`, security definer): when `new.status in ('Delivered','POD Received') and old.status not in (…)`, for each element `l` of `new.data->'lines'` with `l->>'category' <> 'Gases'` and `(l->>'qty')::numeric > 0`, insert `(company, hub=new.hub, product=l->>'product', container=l->>'container', item='', qty=-(l->>'qty')::numeric, unit='count', reason='delivered', order_id=new.id, recorded_by=auth.uid(), occurred_at=now())` `on conflict do nothing` (the partial index); when leaving the delivered pair, insert for each existing `delivered` row of the order a reversing `adjusted` row with `qty = -row.qty`, `note = 'undelivered ' || new.id`, `order_id = new.id`. `create or replace trigger dispatch_orders_stock_out after update of status on public.dispatch_orders for each row execute function …`.
- Policy `dstock_insert` altered in place: `with check (public.dispatch_perm_in(company, 'manage_assets') and reason not in ('filled','delivered'))`.
- RPC `dispatch_set_stock_alerts(p_company text, p_recipients text[]) returns void`: super admin or raises; email-shape check as `dispatch_set_warnings`; sets the `dispatch.set_warnings` flag around a `jsonb_set(data, '{stockAlertRecipients}', …)` write; logs `what='warnings'` with `changes.stockAlertRecipients {from,to}`. `dispatch_settings_warnings_guard` replaced with `stockAlertRecipients` added to both protected-key arrays.
- Grants as in 006/007: RPCs and `dispatch_stock_onhand_for` execute to `authenticated` (and `service_role` for the on-hand function), revoked from `anon, public`; trigger function revoked from everyone.
- `-- Applied: pending` closing comment.

- [ ] **Step 1: Write `supabase/tests/008_policies.sql`**: a manager with `manage_assets`, a viewer with `view_assets`, a coordinator without switches, the second company; assert: on-hand sums (received 800 − a 50 lb fill = 750 lb at EB; a full 50lb cylinder at EB counts 1 under `50lb Cylinder`); a `delivered` row cannot be inserted by the manager (`insufficient_privilege`); an order with lines `[Dry Ice - Pellet/Bin × 2, Carbon Dioxide/50lb Cylinder × 1]` moved to `Delivered` writes exactly one `-2` Bin row and no gas row; moving it to `POD Received` writes nothing more; moving it back to `Scheduled` writes a `+2 adjusted 'undelivered …'` row; moving it to `Delivered` again writes nothing (conflict); `below` is true for `Regulator` at EB when `min 4` and on-hand 3, false at 4; the coordinator reads 0 rows from `dispatch_stock_onhand` and gets rows from `dispatch_stock_onhand_for('adchem')`; the viewer cannot insert; `dispatch_set_stock_alerts` refused for a non-super and for `['not an email']`; a direct `update dispatch_company_settings … stockAlertRecipients` by an admin raises the guard's message; second company isolated; end with `raise exception 'VERIFY-OK 008: …'`.
- [ ] **Step 2: Write `008_inventory.sql`** per the Interfaces.
- [ ] **Step 3: Verify via the MCP** — `begin; <008>; <008>; <tests>; rollback;` — Expected: the `VERIFY-OK` exception; afterwards `select count(*) from pg_proc where proname='dispatch_orders_stock_out'` is 0.
- [ ] **Step 4: Commit** — `db: stock on-hand view, delivered draw-down trigger, stock alert recipients; policies and tests`

---

### Task 3: `/api/stock` and the stock alert email

**Files:**
- Create: `functions/api/stock.js`, `functions/_lib/stock.js`
- Modify: `functions/_lib/expiry.js` (`sendExpiryEmails` also calls `sendStockAlerts`), `functions/api/expiry.js` (returns `stock:{sent,skipped}` beside the document result)
- Create: `test/unit/stock.test.mjs`; modify `test/unit/expiry.test.mjs`

**Interfaces:**
- `functions/_lib/stock.js`: `export function movementsFor(entry, company, who, now) → rows[]` (pure): `entry = {kind:'received'|'produced'|'adjusted'|'counted'|'consumed', hub, product, container, item, qty, unit, vendorId?, note?, bulkProduct?, lbPerUnit?, onhand?}` → for `received`/`consumed`/`adjusted` one row (sign: received +, consumed −, adjusted as given; `adjusted` and `consumed` require a non-empty `note`); `counted` one row with `qty = entry.qty - entry.onhand` (`onhand` passed by the client from the latest on-hand read; the server re-reads and uses its own figure); `produced` two rows: `+qty` count of `(product, container)` and `-(qty × lbPerUnit)` lb of `bulkProduct` (default `Carbon Dioxide`, `lbPerUnit` default 50) both `reason='produced'`, same `note`. Throws `Error` with a message on a bad shape (`kind`, non-finite `qty`, unit mismatch between `unit` and the key — bulk must be `lb`, containers and supplies `count`).
- `export function buildStockAlerts(companies, belowRowsByCompany, settingsByCompany, today) → [{company, to, subject, text, count}]` (pure): one per company with recipients and rows; lines `"<hub>: <label> <qty> <unit> (min <min>)"` where `label` = `product + (container ? ' ' + container : '')` or `item`.
- `functions/api/stock.js`: `POST /api/stock` `{action, company, …}`: `move` requires `manage_assets` (or super), validates with `movementsFor`, for `counted` reads on-hand first (`rpc dispatch_stock_onhand_for`), inserts the rows as the caller, returns `{ok:true, ids}`; `onhand` requires any editor or `view_assets`, returns `{rows}` from the RPC; `below` returns the rows with `below=true`.
- `sendStockAlerts(env, db, {company, mailFrom, today})` in `expiry.js`: for each company (or the one given), read settings `stockAlertRecipients`, read `dispatch_stock_onhand_for` as the service role (cron) or the caller (Send now), build, send through `sendMail`, log `what='stock_alert'`; skipped reasons `no_recipients` / `nothing_below`.

- [ ] **Step 1: Write `test/unit/stock.test.mjs`**: `movementsFor` cases (received +, consumed − with note, adjusted without note throws, counted delta with server on-hand 7 and count 5 → −2, produced 6 bins → `+6 count` and `−300 lb Carbon Dioxide`, bulk with `unit:'count'` throws); `buildStockAlerts` (two companies, one without recipients skipped, subject count, line format); the endpoint with a fetch stub (`move` 403 without permission; `counted` re-reads on-hand; `onhand` as viewer).
- [ ] **Step 2: Run** — Expected: FAIL (module not found).
- [ ] **Step 3: Implement**; run — PASS. Extend `expiry.test.mjs`'s cron test: a company with `stockAlertRecipients` and a below row gets a second mail; `skipped` carries `nothing_below` for the other.
- [ ] **Step 4: Commit** — `server: /api/stock movements and on-hand; daily stock-below-minimum email`

---

### Task 4: Inventory tab, entry sheets, minimums, alerts card

**Files:**
- Create: `public/inventory.js`
- Modify: `public/index.html` (tab `#tab-inventory` hidden after `#tab-assets`; `#panel-inventory` with `#invOnhand`, `#invActions`, `#invMins`; `#invSheet`; the Warnings card gains `#warnStockTo`), `public/app.js` (tab nav, `applyAccess` `$("tab-inventory").hidden=!canViewAssets()`, `loadCompanyData` → `resetInventory()`, `SERVER_COUNTERS` + `"stockAlertRecipients"`, Warnings card save calls `supa.rpc('dispatch_set_stock_alerts', …)` after `dispatch_set_warnings`)
- Test: `test/inventory.test.cjs`

**Interfaces:**
- `inventory.js` exposes `resetInventory()`, `renderInventory()`, `IDB = { onhand(), below(), move(entry), mins(), saveMin(m), deleteMin(id) }` (`move/onhand/below` through `API.post('/api/stock', …)`; mins through `supa` on `dispatch_stock_settings`).
- **On hand** `#invOnhand`: hub select `#invHub` (default the first hub); four blocks: *Bulk* (lb), *Containers* (dry ice and solvents, count), *Supplies* (count), *Gas containers* (full count by size, from the same rows); each row `.inv-row[data-key]` with label, qty, unit, and when `below` a `warn` chip "below min <min>"; negative bulk shown with a `st stop` chip "negative — enter receipts". A strip `#invBelow` at the top: "N below minimum at <hub>".
- **Actions** `#invActions` (manage only): **Receive**, **Produce**, **Adjust**, **Count**, **Use supplies** open `#invSheet` with: key pickers (`#inv_kind` bulk / container / supply; `#inv_product` from `PRODUCTS`, `#inv_container` from that product's containers, `#inv_item` free text with datalist of known items), `#inv_qty`, `#inv_vendor` (Receive, from `ADB.vendors()`), `#inv_note` (required for Adjust and Use), Produce extras `#inv_lb_per` (default 50) and `#inv_bulk` (default Carbon Dioxide), Count shows the current on-hand beside the input; **Confirm** → `IDB.move(entry)` → banner "Recorded" and re-render; errors → banner with the server message.
- **Minimums** `#invMins` (view: list; manage: add/edit/delete): rows per hub with key, `min_qty`, unit, alert on/off; the form refuses a unit that does not match the key kind ("bulk is tracked in lb" / "containers and supplies are counted").
- Setup → Warnings card: `#warnStockTo` textarea (one email per line), saved with the card through `dispatch_set_stock_alerts`; the card shows "Stock alerts go to N addresses".

- [ ] **Step 1: Extend `test/inventory.test.cjs`** (super admin): Inventory tab shows EB bulk `Carbon Dioxide 750 lb` after the seeded fill, `Dry Ice - Pellet Bin 6`, `Regulator 10`, `50lb Cylinder 1` full; **Receive** 5 Regulators → 15; **Use supplies** 12 Regulators with a note → 3 and the row shows "below min 4" and the strip says `1 below minimum at EB`; **Count** Dry Ice Bin at 4 → on-hand 4 and a `counted −2` movement in `T.dispatch_stock_movements`; **Produce** 10 bins → Bin 14 and bulk `250 lb`; Produce 10 more → bulk `−250 lb` with the negative chip (Review Focus 3); marking the seeded order with a Bin line Delivered (via the Orders status select) → Bin count drops by its qty once, flipping to Scheduled and back changes it once each way (Review Focus 1); a Count on a key with no movements (`Acetone 5gal Pail` at 3) → on-hand 3 (Review Focus 2); minimums: adding `Carbon Dioxide` bulk with unit `count` is refused (Review Focus 4); Warnings card: saving two recipient lines writes `stockAlertRecipients` via the RPC and `DB.saveSettings` does not carry it; a coordinator with `view_assets` sees the tab but no action buttons; a driver sees no tab; `scrollWidth === 390` with the sheet open.
- [ ] **Step 2: Run** — Expected: FAIL on `#tab-inventory`.
- [ ] **Step 3: Implement**; run — PASS. `npm test` — exit 0.
- [ ] **Step 4: Commit** — `app: Inventory tab with on-hand, entry sheets, minimums and stock alert recipients`

---

### Task 5: Import — Licensing & Entity and Account Terms slices

**Files:**
- Modify: `functions/_lib/importsheet.js` (`HEADERS.licensing`, `HEADERS.terms`, `planImport` items, `applyPlan` document rows, `bindRows`), `functions/api/import.js` (commit writes `dispatch_documents`), `public/import.js` (review lines for `license` and `psa`), `test/unit/importsheet.test.mjs`, `test/customers.test.cjs` (one commit assertion), `test/_fake.cjs` fixture rows (if Task 1 did not add them)

**Interfaces:**
- `planImport` items: `{key:'lic:'+row, action:'license', decision:'license'|'skip', customer_id, name, detail:'<License #> · expires <date>', doc:{doc_type:'cannabis_license', number, status, issued, expires, extra:{licensee_legal_name, license_type, county_premises, owners, entity_status_sos}, source, checked_on, notes}}` and `{key:'psa:'+row, action:'psa', decision:'psa'|'skip', customer_id, name, detail:'PSA · <stage>', doc:{doc_type:'psa', extra:{quote_sent, quote_accepted, sent_for_signature, signed_customer, countersigned, effective_date}}}`; a row with no matching customer → `action:'problem'` naming the tab and row; an unparseable date → the field empty and a problem line naming the cell. Matching uses the same name/ID resolution as Delivery Notes.
- `applyPlan` returns, beside customers/sites/contacts, `documents: [{customer_key, doc}]`; `bindRows` turns them into `dispatch_documents` rows (`subject_type='customer'`, `subject_id` = the bound customer id, `review_status='live'`, `import_source:{tab,row,at}`, `source='import'`). A re-run updates the document it created (matched by `import_source.tab/row`) and never one edited in the app since (`updated_by` ≠ the import user), as customers do.
- The commit path writes documents after customers in the same transaction (the existing RPC or sequence `import.js` uses; extend it).
- Review screen (`import.js`): lines read `license · <name> · <number> · expires <date>` / `PSA · <name> · <stage>` with the same skip toggle as other lines; the summary counts "N licenses, M PSAs".

- [ ] **Step 1: Extend `test/unit/importsheet.test.mjs`**: `HEADERS.licensing/terms` equal the Global Constraints lists; the fixture's licensing row becomes a `license` item with `number`, `expires` and `extra.entity_status_sos`; `Balance (auto)` is absent from everything; the terms row becomes a `psa` item with the six dates; a terms row with `Quote Sent = 'pending'` yields the item with `quote_sent:''` and a problem line naming `Account Terms row N, Quote Sent`; a row naming an unknown customer is a `problem`; `bindRows` produces `dispatch_documents` rows with `subject_type='customer'` and `import_source`; a re-run plan marks an app-edited document as kept.
- [ ] **Step 2: Run** — FAIL on `HEADERS.licensing`.
- [ ] **Step 3: Implement**; run — PASS. Add the `customers.test.cjs` assertion: after Import commit, the ADC customer's hub shows the license chip and a PSA document. `npm test` — exit 0.
- [ ] **Step 4: Commit** — `import: Licensing & Entity and Account Terms (PSA dates) slices`

---

### Task 6: Docs and go-live notes

**Files:**
- Modify: `README.md` (Inventory section: on-hand blocks, the five entries, minimums, stock alert recipients, the delivered draw-down rule; 008 to be applied; Import section lists the two new tabs and the never-read columns), `GOOGLE-SETUP.md` (no new Google step; note the stock email rides the same daily job and recipients list on Setup → Warnings)
- Test: none beyond `npm test`

- [ ] **Step 1: Update both files**; reread for consistency with the UI labels in Task 4.
- [ ] **Step 2: `npm test`** — exit 0.
- [ ] **Step 3: Commit** — `docs: inventory, stock alerts, import slices`
