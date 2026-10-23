# AdChem Ops — Assets and Inventory (Stage 3)

Supersedes §3.4 and §11 of `2026-10-20-customers-documents-assets-design.md`. Everything else in that spec stands.

## 1. Purpose

AdChem delivers gases in serialized containers (cylinders, dewars, pigs, soon bulk-fed tanks) that cycle between its hubs, its customers and the vendors that fill or rent them. Nobody can say today where a given cylinder is, how many full 50 lb CO2 cylinders are at a hub, or what a customer has been holding for six months. Dry ice and solvents go out in counted containers; regulators, pallets and straps are supplies. This stage gives Ops one asset register with a full movement history, a driver flow that keeps it honest from the stop with one photo per container, and a counted-stock ledger with reorder alerts.

Built as two plans on this one spec:

- **3A — Asset register:** vendors, container types, serialized assets, events, driver scan at the stop, Vision serial reading, Assets screens and hub actions, counts by state and place.
- **3B — Inventory:** bulk pounds, counted containers (dry ice, solvents), supplies, receipts, production, adjustments, counts, reorder points and alerts, the Inventory screen; plus the Licensing & Entity and Account Terms (PSA dates) import slices deferred from Stage 1.

Out of scope for both: any price, rental charge, deposit or cylinder fee (AR keeps those); customer self-service; a truck as a location (see §3.3, left open for a loading team); hydro-test scheduling beyond storing the due date.

## 2. Decisions

| Question | Decision |
|---|---|
| Where can an asset be | One of three place kinds: a **hub**, a **customer site**, or a **vendor**. Owner is a separate fact and never changes through a movement. |
| Vendors | A small list managed in Ops under Setup (name, roles fill / rent / supply, contact). Never free-typed, never mixed into the customer list. |
| What is serialized | Every gas container AdChem delivers (cylinder, dewar, pig, tank). Dry ice bins/totes/buckets, solvent pails/drums/totes and supplies are counted. |
| Gas stock | Derived from the register: full containers of a type at a hub. No second number to reconcile. |
| Customer-owned cylinder filled as a one-off | An asset with `owner = customer`, added on the spot by a driver or coordinator. |
| Hub fills | AdChem fills CO2 today and nitrogen once the bulk tank arrives. A hub fill is an event: container empty → full, bulk ledger down by the nominal fill weight. Dry ice production draws bulk CO2 down the same way. |
| Dry ice | Mostly made, sometimes bought: a production entry and a vendor receipt both add bins at the hub. |
| Loading | Drivers take what they need. The delivery scan is the record (hub → site); collecting is site → hub. An optional Load scan exists for drivers who want a truck list. A `truck` place kind can be added later without restructuring. |
| Reading serials | Google Cloud Vision text detection on the existing service account; the driver always confirms; nothing is written on Vision alone. Rules tuned on real photos (indented serials, stickers, bin/tote cards). |
| Photos | Stored in the existing private `dispatch-docs` bucket under `company/asset/`; served by 5-minute signed URLs the browser mints with the Supabase client; the storage select policy (`view_assets`, or the uploader) is the permission check. Unlike documents, photo views are not logged. |

## 3. Data model

All tables carry `company text not null references companies(id)`, `created_at`, `updated_at`, `created_by`, `updated_by`, RLS by company through the existing helpers, and the `dispatch_audit` trigger. Migration `007_assets.sql` (3A) creates every table below including the two 3B tables, so 3B is screens and functions only; `008_inventory.sql` is reserved for what 3B learns it needs.

### 3.1 `dispatch_vendors`
- `id uuid`, `name text` (unique per company, case-insensitive), `roles text[]` subset of `{fill, rent, supply}`, `contact_name`, `phone`, `email`, `addr`, `notes`, `active boolean default true`.

### 3.2 `dispatch_container_types`
The catalog of serialized container kinds. Seeded from the order form's gas containers so day one is not empty.
- `id uuid`, `kind text` in `(cylinder, dewar, pig, tank)`, `size_label text` (exactly the order form's container string, e.g. `50lb Cylinder`, `260L Dewar`, `400lb Pig`), `product text` (the order form's product name, e.g. `Carbon Dioxide`), `fill_lb numeric` nominal product weight when full, `active boolean`.
- Unique `(company, product, size_label)`.

### 3.3 `dispatch_assets`
One row per serialized container; the latest picture, maintained only through events.
- `id uuid`, `serial text not null`, `tag text default ''` (sticker / card id), `container_type_id uuid references dispatch_container_types`
- `owner_kind text` in `(adchem, vendor, customer)`, `owner_id text` (vendor id / customer id / `''` for adchem)
- `fill_state text` in `(full, empty, unknown)`, `condition text` in `(in_service, out_of_service, lost, retired)`
- `location_kind text` in `(hub, site, vendor)` — an open check that `truck` can join later; `location_id text` (hub code / site id / vendor id)
- `last_seen_at timestamptz`, `last_seen_by uuid`, `hydro_due date`, `acquired_on date`, `notes text`
- Unique `(company, upper(serial))`. Guard trigger: `location_id` must exist in the company for its kind; `owner_id` likewise; `serial` non-empty after trim.
- Owner changes only through `dispatch_asset_correct` (manage permission) and are logged with `changes`.

### 3.4 `dispatch_asset_events` (append-only)
- `id uuid`, `asset_id uuid references dispatch_assets`
- `event_type text` in `(created, delivered, collected, to_vendor, from_vendor, filled, moved, loaded, sighted, corrected)`
- `from_kind/from_id`, `to_kind/to_id` (nullable), `fill_after text` (nullable)
- `occurred_at timestamptz` (the phone's time; kept when within 30 days and ≤ now, else now — same rule as captures), `recorded_by uuid`
- `order_id text`, `bol_number int`, `site_key text` (nullable) — *amended 10/23/26: `site_key` (the sites' text key) in place of `site_id uuid`*
- `photo_path text`, `gps jsonb {lat,lng,accuracy}`, `ocr jsonb {raw, candidates, picked}` (nullable) — *amended 10/23/26: `picked` is the serial the driver or manager chose or typed*
- `note text`
- `applied boolean` (default true) — *amended 10/23/26*: set only by the triggers; `false` when the event was older than the asset's last sighting (an offline queue sent late), so it is kept as history and did not move the asset or change its fill (a late hub fill still draws the bulk down). A `corrected` event always applies; one that names no place and no fill (an owner/condition correction through `dispatch_asset_correct`) does not change `last_seen_*`.
- A driver's event must name its `to` (their hub or one of their stop sites); `created` sets the fill it names.
- No update or delete policy for anyone; corrections are new `corrected` events.
- After-insert trigger `dispatch_asset_apply_event` (security definer): sets the asset's `location_*`, `fill_state`, `last_seen_*`; for `filled` at a hub it writes a `stock_movements` row of `-fill_lb` pounds of bulk product at that hub (3A writes it; 3B reads it).

### 3.5 `dispatch_stock_movements` (append-only; read by 3B)
- `id uuid`, `hub text`, `product text`, `container text` (`''` for bulk pounds and supplies), `item text` (`''` except supplies, e.g. `Regulator`), `qty numeric` (signed), `unit text` in `(count, lb)`
- `reason text` in `(received, produced, delivered, filled, adjusted, counted, consumed)`, `vendor_id uuid`, `order_id text`, `asset_event_id uuid`, `note text`, `occurred_at`, `recorded_by`
- On-hand = sum of `qty` per `(hub, product, container, item)`; a `counted` row carries the delta that makes the sum equal the physical count.

### 3.6 `dispatch_stock_settings` (3B)
- `hub`, `product`, `container`, `item`, `min_qty numeric`, `unit`, `alert boolean default true`. Unique on the four keys.

### 3.7 Permissions and settings
`dispatch_members.permissions` gains `view_assets` and `manage_assets` (both default false; super admins always have both; the People screen shows two more switches). `dispatch_company_settings.data` gains `assetSerialRules` jsonb (regex list and preferences the server's serial picker reads; default set in code) and, for 3B, `stockAlertRecipients text[]` written through `dispatch_set_warnings`' sibling `dispatch_set_stock_alerts` (super admin).

### 3.8 Files
Path `company/asset/<event_id>.jpg` (event ids are unique and known before the asset is; nothing is ever moved). Storage insert by any member of role driver under `asset/` of their company and by `manage_assets` holders; select by `view_assets` or the driver who uploaded it (owner = auth.uid()); no update; delete by `manage_assets`.

## 4. Access rules

| Who | Register and counts | Events | Vendors / types / settings |
|---|---|---|---|
| Super admin | All | All | All |
| `view_assets` | Read register, counts, history, vendors | — | Read |
| `manage_assets` | + add/edit assets, corrections, owner change, lost/retired | + filled, to_vendor, from_vendor, moved, loaded, created | Edit vendors and container types |
| Driver | Only assets at the sites of today's stops in their hub, at their hub, or that they handled today; never the register | `delivered`, `collected`, `sighted`, `loaded`, `created` (for an unknown serial) at their own stops | Read vendors (to name a drop) |
| Coordinator without a switch | Counts only (derived view), no serials | — | — |

Policies: `dasset_read` (view_assets, or driver by the rule above through a security-definer `dispatch_driver_can_see_asset(asset_id)`); `dasset_insert` (manage_assets or driver, guard forces driver-created rows to `fill_state = unknown` unless stated, owner adchem or the stop's customer, location = the stop's site or their hub); `dasset_update` (manage_assets only, and never `location_*`/`fill_state` directly — the guard rejects those columns unless the write comes from the event trigger's flag); `devent_insert` (manage_assets for every type; driver for the five driver types, with `to_id`/`from_id` limited to their hub and today's stop sites); `devent_read` mirrors `dasset_read`. Second-company isolation on every table. Counts view `dispatch_asset_counts` is `security_invoker` and groups by container type, fill state, location kind; a coordinator without `view_assets` still gets a row (counts carry no serials) through a definer function like `dispatch_customer_doc_status`.

## 5. Screens

### 5.1 Today (drivers)
A **Cylinders** button on each stop that has gas lines or known assets at the site. The sheet has two lists:
- **Delivering** — one slot per unit on the order's gas lines (`2 × 50lb Cylinder · Carbon Dioxide`), each waiting for a scan.
- **Collecting** — every asset the register has at this site, plus a **Scan another** button.

Scan: camera → photo → `/api/assets/read` → serial candidates → **Is this right?** with the top candidate large, two alternates small, and a type-it field. Confirm fills the slot. Outcomes:
- known serial, at expected place → ticked;
- known serial, elsewhere in the register → accepted, "was at X" note, a `sighted` correction precedes the delivery/collection event;
- unknown serial → **New to us?** mini form: container type (defaulted from the slot's line), owner (AdChem / this customer), fill (full on a delivery, empty on a collection) → `created` then the movement event.
Done writes one event per slot in one batch (`/api/assets/events`), each with order id, BOL, site, photo, GPS, phone time. Offline: the sheet (photos included) queues in the existing IndexedDB alongside POD, deposit and capture queues and sends with original times; a lost reply retries idempotently by event id. **Load** (optional): scan serials at the hub → `loaded` events (location stays hub); the driver's **My truck** list shows today's loaded minus delivered.

### 5.2 Assets (office; tab shown with `view_assets`)
- **Register:** search by serial/tag; filters hub, site, vendor, owner, fill, condition, type; row → detail: fields, current place, event history with photo thumbnails (signed on open), and manage actions (edit, correct place, change owner, lost, retired).
- **Counts:** per container type a grid of full / empty × each hub, at customers, at vendors, lost. Also the Setup health card gets a *Vision* line.
- **Hub actions** (manage_assets): **Fill**, **To vendor**, **From vendor**, **Move**, **Add assets**. Each: pick hub (and vendor where relevant), then scan or type serials into a list, then confirm → one event per serial. Fill records `filled` + the bulk draw-down; From vendor sets full unless unchecked.
- **Vendors** (Setup → Vendors): list, add/edit, each with "currently here" count and list.
- **Customer hub → Cylinders tab:** what is at this customer's sites and since when; the same for a site.

### 5.3 Inventory (3B; tab shown with `view_assets`)
- **On hand** per hub: bulk pounds by product; counted containers by product × container; supplies by item; gas containers full/empty from the register. Below-minimum rows flagged.
- **Receive** (vendor, product/container/item, qty), **Produce** (dry ice: bins made, draws bulk CO2 by `fill_lb` × bins), **Adjust** (signed, with reason), **Count** (enter physical count; the delta is written).
- Delivered counted containers come off automatically when an order is marked delivered (hook on the existing delivery flow: one `delivered` movement per non-gas line, keyed by order id so a re-mark is idempotent).
- **Settings → Stock minimums**: per hub rows; **alerts**: a daily line appended to the existing expiry email run for recipients in `stockAlertRecipients` ("LA: Carbon Dioxide bulk 180 lb, min 500"), and a strip on the Inventory tab.

### 5.4 People
Two switches: *View assets*, *Manage assets*.

## 6. Server

- `functions/api/assets.js` — `POST /read` (multipart or base64 JPEG → upload to `asset/new/<event_id>.jpg` as the caller → Vision → `{candidates:[{text,score}], raw}`); `POST /events` (batch; validates each event against the caller's role, creates unknown assets, inserts events in order, moves `new/` photos under the asset id; idempotent by event id); `GET /counts`.
- *Amended 10/23/26 (as built):* one `POST /api/assets` with `action`. `read` — the phone uploads the photo itself to `<company>/asset/<eventId>.jpg` (the event later carries the same id and path); the server reads it as the caller, sends it to Vision and returns `{candidates, raw[, error]}`; nothing is moved. `events` — `{ok, results}`, one result per event in order, each `applied`, `duplicate`, `rejected` (with `reason`) or `error` (retryable), with an optional `warning` (no fill weight, not at a hub, location correction not recorded, or *recorded late — did not move the container* when the event's `applied` reads back false). The client sends a batch in chunks of 10 events, in order, to stay within the function's subrequest cap. `counts` — the grouped rows of `dispatch_asset_counts_for`.
- `functions/_lib/vision.js` — one call to `images:annotate` with `TEXT_DETECTION` using the existing `gfetch`; returns text blocks with bounding boxes. Health probe: an `images:annotate` on a 1-pixel image → *ok* or the API error (e.g. "Cloud Vision API has not been used in project…").
- `functions/_lib/serials.js` — pure: takes Vision blocks and `assetSerialRules`, returns ranked candidates. Default rules: uppercase alphanumerics 5–20 chars, no spaces; penalise strings that look like dates, weights (`50LB`, `230L`), DOT markings (`DOT-3AA`, `TC-3AAM`), or years; prefer blocks nearer the top of the image for cylinders; prefer the largest block for bins/totes (kind known from the slot). Unit-tested on fixtures; real photos added as they arrive.
- 3B: `functions/api/stock.js` — `POST /move` (received / produced / adjusted / counted), `GET /onhand`; the alert line in `expiry.js`.
- `functions/api/health.js` gains `vision`.

## 7. Error handling

- Vision down or not enabled: `/read` returns `{candidates:[], error}`; the sheet shows "Couldn't read it — type the serial" and still attaches the photo.
- Duplicate serial on create: the server treats it as "known" and continues with the movement.
- A malformed batch (bad id, unknown type) is refused whole, before any insert, naming the first bad event. An event the caller may not record (the guard's "not your stop", a policy refusal) comes back as `rejected` with the reason for that event only; the rest of the batch still applies, and the sheet shows which serials failed. Per-event results keep offline retries idempotent.
- A `filled` event for a container type with no `fill_lb`: the event is written, the stock movement is skipped and the response carries a warning.
- Offline: same contract as captures — nothing is lost, queue note on Today, retries idempotent.

## 8. Testing

- `supabase/tests/007_policies.sql`: driver sees only their stop's and hub's assets; driver cannot update an asset or insert `filled`; second company isolated; serial unique case-insensitively; owner unchanged by any event; event trigger moves the asset and writes the fill draw-down; direct update of `location_*` rejected.
- Unit: `serials.js` against fixtures (indented serial with DOT markings, sticker with a date, bin card); `assets.js` batch validation and idempotency; `vision.js` request shape and error mapping; 3B on-hand sums and the delivered hook.
- App (Playwright with the fake): the Cylinders sheet (delivery, collection, unknown serial, wrong-place, offline queue, lost reply); the register and counts; Fill writes the draw-down; People switches; 3B Inventory actions and the below-minimum flag.
- Live after apply: one real stop scan on a phone; a hub Fill; Vision health green; counts match the yard.

## 9. Rollout

- 3A: migration 007 applied on the user's word; Vision API enabled on the Google Cloud project (user); `GOOGLE_SA_JSON` present. Register starts empty and fills as cylinders are scanned; a hub batch **Add assets** session seeds the yard.
- 3B follows on the same branch pattern. The import slices (Licensing & Entity → cannabis_license documents; Account Terms → PSA dates) ship in 3B's plan as its last task.
