# AdChem Ops — Customers, Documents, Assets and Intake

Design spec, 20 October 2026. Extends AdChem Ops v1.1.2 (the baseline commit in this repository).

## 1. Purpose

AdChem Ops today reads customers from the AR Command Center spreadsheet (14 FEED_ORDERS columns) and holds nothing of its own about a customer beyond a delivery site with an email and phone. Everything else — billing and delivery addresses, contacts, cannabis licenses, entity status, PSAs, site access notes, containers on site — is typed into a large spreadsheet maintained by the owner and Jessica.

This phase makes Ops the place that data is entered and kept, so the spreadsheet becomes a view of the database rather than the place anyone types. It adds:

- a customer, site and contact master, with an operational activity log and driver notes
- documents (licenses, certificates, agreements) for customers, the company and drivers, with files, expiry and warnings
- an asset register for containers in the field, with photographed, time-stamped sightings
- a Customers Out sheet so the AR Command Center keeps working unchanged in function
- a one-time import from the spreadsheet with a review step
- a Google Form intake queue so customer order requests land in Ops for a coordinator

Out of scope for this phase, each written up as its own later spec:

- the inventory module (on-hand stock per hub, fill state, rentals-out days, hydro test dates, reorder points), built on this phase's asset tables
- customer self-service inside Ops (customers never sign in to Ops in this phase)
- any change to the BOL, payment block, Orders Out, calendars or proof-of-delivery flow

## 2. Decisions carried into this design

| Decision | Chosen |
|---|---|
| Source of truth for customer identity and payment | **The AR sheet keeps payment code, terms, balances.** Ops owns everything operational. Ops never writes the AR sheet |
| Where a new customer is born | **In Ops.** Ops assigns the next ADC-#### number. Until accounting sets a payment code on the AR sheet, the customer is CHECK (existing rule) |
| Existing Customer IDs | **Kept on import.** The counter starts above the highest imported ID |
| Document kinds | Customer, company (AdChem's own), and driver documents, all in this phase |
| Missing or expired document at order time | **Warn, never block.** Super admins can switch warnings off per document type while data is still being collected |
| Who sees documents | A new super admin role holds everything; every other permission is a per-person switch. Drivers see only their own documents |
| Driver accounts | **One account per person** (replacing the one-per-hub design). Added on People when live |
| Contacts | All types including billing and AP, with type-based visibility. Drivers see receiving and site contacts only |
| Spreadsheet data | **One-time import** from the Customer Directory and the related tabs, with review before commit |
| Collections (Promise & Contact tab), pricing, terms, credit, balances | **Not imported, not stored.** Stay in the AR sheet |
| Tag reading from photos | **Google Cloud Vision OCR** on the existing Google Cloud project. No AI vendor account. Can be swapped server-side later |
| Inventory management | **A module of Ops**, next spec, built on the asset register designed here |
| Customer ordering | **Google Form → Ops intake queue.** Coordinator reviews, edits, creates the order |

## 3. Data model

All tables in the existing Supabase project, prefixed `dispatch_`, every row carrying `company` (text, FK `companies.id`), `created_at`, `updated_at`, `created_by`, `updated_by`. Migrations continue from `005_`.

### 3.1 Customers

`dispatch_customers`
- `id` uuid PK
- `company`
- `customer_id` text, unique per company. Format `ADC-####`. Assigned by a database function from `dispatch_company_settings.next_customer_number` when the row is created without one (import supplies it)
- `name` (the QuickBooks name — master spelling), `also_known_as`, `legal_name`
- `account_status` enum: `active`, `inactive`, `prospect`
- `primary_hub` text FK `dispatch_hubs`
- `parent_customer_id` uuid FK self, nullable (related or parent account)
- `billing_street`, `billing_city`, `billing_state`, `billing_zip`
- `last_verified` date, `notes` text
- `import_source` jsonb nullable: `{tab, row}`

`dispatch_sites` (existing) gains:
- `customer_id` uuid FK `dispatch_customers`, nullable until linked
- `receiving_hours`, `gate_code`, `parking_unloading`, `hazmat_restrictions`, `container_notes`, `special_instructions` text
- `last_verified` date
- `import_source` jsonb

`dispatch_site_hub_notes`
- `site_id` FK, `hub` FK, PK (site_id, hub)
- `scale_on_route` boolean nullable, `route_notes` text

### 3.2 Contacts and activity

`dispatch_contacts`
- `id`, `company`, `customer_id` FK, `site_id` FK nullable
- `type` enum: `receiving`, `site_manager`, `ordering`, `safety`, `billing`, `ap`, `owner`, `other`
- `first_name`, `last_name`, `phone`, `email`, `preferred_method` enum (`phone`, `email`, `text`), `notes`
- `active` boolean default true
- `cc_on_statements` boolean (billing type only)

`dispatch_customer_activity`
- `id`, `company`, `customer_id`, `site_id` nullable, `contact_id` nullable
- `occurred_at`, `method` enum (`call`, `email`, `text`, `in_person`, `app`), `summary` text
- `logged_by` uuid
- `kind` enum: `note`, `driver_note`
- `status` enum: `approved`, `pending`, `rejected` (notes by ops are `approved` on save; driver notes start `pending`)
- `reviewed_by`, `reviewed_at`, `rejection_reason`

### 3.3 Documents

`dispatch_documents`
- `id`, `company`
- `subject_type` enum: `customer`, `company`, `person`; `subject_id` text (customer uuid, company id, or auth user id)
- `doc_type` enum: `cannabis_license`, `resale_certificate`, `psa`, `chp_hazmat_license`, `dot_registration`, `insurance_certificate`, `cdl`, `medical_card`, `other`
- `title` text (free label for `other`)
- `number`, `status` text (as issued by the authority: Active, Suspended, etc.), `issued` date, `expires` date
- `file_path` text nullable (object path in `dispatch-docs`), `file_name`, `file_size`, `file_type`
- `checked_on` date, `checked_by` uuid, `source` text, `notes` text
- `review_status` enum: `live`, `pending_review`, `rejected` (driver-captured documents start `pending_review`)
- `captured_by` uuid nullable, `captured_at`, `captured_order_id` nullable (driver capture provenance)
- `supersedes_id` uuid nullable (the previous live record this replaced)
- `extra` jsonb: type-specific fields
  - cannabis_license: `licensee_legal_name`, `license_type`, `county_premises`, `owners`, `entity_status_sos`
  - psa: `quote_sent`, `quote_accepted`, `sent_for_signature`, `signed_customer`, `countersigned`, `effective_date`
- `import_source` jsonb

Derived view `dispatch_customer_status` (one row per customer):
- `license_status`: `valid` | `expiring` | `expired` | `missing`, from the live cannabis_license with the latest `expires`; `expiring` = within `warn_days` (setting, default 30)
- `license_expires`, `license_number`
- `psa_status`: `signed` (signed_customer and countersigned set) | `in_progress` (any stage date set) | `missing`
- `entity_status`
- `profile_complete` int 0–15 (see 5.1)

### 3.4 Assets

`dispatch_assets`
- `id`, `company`
- `asset_type` enum: `cylinder`, `pig`, `dewar`, `bin`, `other`
- `tag_number` text, `serial` text (unique per company where not null), `size_product` text
- `owner` enum: `adchem`, `customer`, `vendor`
- `status` enum: `in_service`, `out_of_service`, `lost`, `retired`
- `location_type` enum: `hub`, `site`; `location_id` text
- `last_seen_at`, `last_seen_by`, `notes`

`dispatch_asset_events` (append-only)
- `id`, `company`, `asset_id`
- `event_type` enum: `sighted`, `delivered`, `collected`, `moved`, `created`, `corrected`
- `from_type`/`from_id`, `to_type`/`to_id` nullable
- `occurred_at`, `by` uuid, `order_id` nullable, `bol_number` nullable
- `photo_path` nullable, `gps` jsonb nullable `{lat, lng, accuracy}`
- `ocr` jsonb nullable: raw Vision text, fields extracted, per-field confidence, and what the driver changed

### 3.5 Intake

`dispatch_order_requests`
- `id`, `company`
- `source` enum: `google_form`; `source_key` text unique (form response ID or sheet row key) — a re-read never duplicates
- `received_at`
- `customer_id` FK nullable (matched by the ADC number in the form), `customer_text` (what the form carried)
- `site_id` nullable, `site_text`
- `requested_date`, `requested_window`, `po_number`, `receiving_contact`, `bol_copy_email`, `empties_to_collect`, `notes`
- `lines` jsonb: `[{product_text, product_id nullable, qty}]`
- `status` enum: `new`, `in_review`, `created`, `declined`
- `order_id` nullable (when created), `declined_reason`, `reviewed_by`, `reviewed_at`

### 3.6 Settings, members, companies

`dispatch_members` gains:
- `is_super_admin` boolean default false
- `permissions` jsonb: `{manage_customers, view_documents, manage_documents, approve_driver_notes, run_imports, manage_people, manage_assets}` all boolean, default false

`dispatch_company_settings` gains:
- `next_customer_number` int
- `customers_out_sheet_id` text
- `warn_days` int default 30
- `warnings` jsonb: `{cannabis_license: {order_time: false, note: ""}, psa: {...}, entity_status: {...}}`
- `expiry_email_recipients` text[] (super admin only)
- `import_sheet_id` text
- `intake_form_sheet_id` text, `intake_poll_minutes` int default 5

### 3.7 Files

Bucket `dispatch-docs`, private. Object paths:
- `company/document/<subject_type>/<subject_id>/<document_id>/<file_name>`
- `company/asset/<asset_id>/<event_id>.jpg`
- `company/capture/<order_id>/<document_id>.jpg` (driver license captures, before review)

Storage policies allow upload only by the server (service role) and by a driver into `capture/` and `asset/` under their own company; reads go through the server (short-lived signed URLs, 5 minutes). Browser clients never hold a public file URL.

### 3.8 Audit

`dispatch_log` (existing) entries for customers, sites, contacts, documents, assets, settings and permissions gain `changes` jsonb: `{field: {from, to}}` for the fields touched. File views and downloads log `{action: "file_view", document_id}`.

## 4. Access rules

Enforced by row-level security and storage policies, not by screens. The server re-checks role and permission on every call.

| Who | Customers, sites, contacts, activity | Documents | Assets | Settings |
|---|---|---|---|---|
| **Super admin** | All, in their company | All | All | All, including Warnings, recipients, super admin grant |
| **Admin / coordinator** (base) | Read all customers, sites, contacts; write with `manage_customers`. Read activity; approve driver notes with `approve_driver_notes` | See **derived status only** (chips, expiry) without `view_documents`. Records and files with `view_documents`; create, edit, approve with `manage_documents` | Read all; edit outside Today with `manage_assets` | Existing Setup; Import with `run_imports`; People with `manage_people` |
| **Driver** | Sites in their hub only, with site notes and receiving/site_manager contacts. Never the customer record, billing/AP/owner contacts, or other people's activity. Their own driver notes (any status) | Their own (`subject_type = person`, `subject_id = self`), read only. Can **create** a `pending_review` customer document from a stop (write-only; they can't read it back) | Assets at their hub's sites and their hub; can create sighted/delivered/collected events with photos | None |

Only a super admin can make or remove another super admin. An admin can set `permissions` on any non-super-admin member. Every permission change is logged.

The AR wall holds: no table in this design stores a balance, invoice, term, credit limit, price, rental charge or collection note. The only AR-derived value a coordinator sees is the payment code from FEED_ORDERS, as today.

## 5. Screens

Same single-page app, same look, phone-first, no horizontal scroll. New code in separate files (`public/customers.js`, `public/documents.js`, `public/assets.js`, `public/intake.js`, `public/import.js`) loaded by `index.html`; `app.js` gains only navigation hooks.

### 5.1 Customers
- **List:** search (name, AKA, legal name, ID); columns name, ID, status, hub, license chip, PSA chip, completeness badge, last verified. Filters: hub, status, expiring in 30/60/90, incomplete. **New customer** assigns the ID on save.
- **Customer page**, tabs:
  - *Profile:* names, status, billing address, primary hub, parent account, notes, last verified. The completeness badge lists which of the 15 must-have fields are blank: name, legal name, status, primary hub, billing street/city/state/zip, a delivery site, a receiving contact with phone, a billing contact with email, license on file, license expiry, PSA signed.
  - *Sites:* each site with its notes, gate code, hours, restrictions, container notes, instructions, last verified, and per-hub scale/route notes. Add a site; "same as billing" fills the address.
  - *Contacts:* grouped by type, tap-to-call/mail; add, edit, deactivate.
  - *Documents:* with `view_documents`: records with status, dates, file, checked-on; upload from camera or file picker; approve pending captures with `manage_documents`. Without: status chips only.
  - *Assets:* what's on site now (tag, type, photo, since, last confirmed by whom); tap for movement history.
  - *Activity:* operational log; driver notes awaiting approval with Approve / Reject (reason).
  - *History:* audit trail as before/after lines.

### 5.2 Documents hub
All documents in the company across customers, the company itself and people, sorted by expiry, with filters and a **Pending review** count. Company documents (CHP license, DOT, insurance) live here under *AdChem*. Driver documents live on the person's entry under People and here.

### 5.3 People
Permission switches per member, super admin flag (super admins only), a *Documents* section on each driver. Driver accounts are individual.

### 5.4 Today (drivers)
Each stop gains: the site notes block (gate code, hours, unloading, restrictions, container notes, instructions, this hub's route/scale note), receiving contact tap-to-call, **Add note**, **Containers on site** (current list; **Add / update** → camera → Vision read → correct → **Confirm**; **Delivered** / **Collected** per asset, each with a photo), and **Photo of license / document** (→ pending review, driver sees "sent for review"). **My documents** lists the driver's own with expiry.

### 5.5 Order entry
Customer picker searches Ops customers (sites from the chosen customer). Status strip under the name (section 7). Orders record `warnings_shown` jsonb.

### 5.6 Intake
List of order requests by status. A request shows the matched customer and site (or an unmatched flag with a picker), the lines matched to products (unmatched flagged), and all form fields. **Create order** opens the order form pre-filled and links the request; **Decline** records a reason. **Check the form now** triggers a read.

### 5.7 Setup additions
- *Customers Out:* link, Save, Rebuild.
- *Import:* link, Read, Review, Commit (section 8).
- *Warnings* (super admin only): per document type on/off at order time plus a note; `warn_days`; expiry email recipients.
- *Intake:* form response sheet link, poll interval, Check now, field-mapping check by header.
- *Google connection* health check gains lines for Vision, Customers Out, the import sheet and the intake sheet.

### 5.8 Expiry email
Daily, from orders@ (existing Gmail path), to `expiry_email_recipients` only. Lists documents expiring within `warn_days` and already expired, grouped by customer / AdChem / driver, with a link into the app. Skipped when the list is empty.

## 6. Server

New Pages Functions under `functions/api/`, each checking sign-in, company and permission first, as the existing ones do:

- `customers-out.js` — write one customer's rows or rebuild the tab (mirrors `_lib/orderlog.js`; shares its Sheets client).
- `docs.js` — issue a signed read URL for a document or asset photo after checking the caller's permission; accept uploads server-side for ops (drivers upload directly under the storage policy); approve/reject pending captures.
- `vision.js` — accept an image path, call Google Cloud Vision `TEXT_DETECTION` through the service account, return raw text plus extracted fields (`tag_number`, `serial`, `size`, `owner_marking`; for licenses `number`, `license_type`, `expires`, `licensee`) with a confidence per field from simple pattern rules. Never writes.
- `import.js` — read the import sheet's tabs by header, return a review plan; commit a reviewed plan in one transaction.
- `intake.js` — read the form response sheet, upsert `dispatch_order_requests` by `source_key`; scheduled by a Cloudflare Cron Trigger every `intake_poll_minutes` and on demand.
- `expiry.js` — build and send the daily email; Cron Trigger daily at 06:00 company time.
- `health.js` — extended.

New scope on the service account: Cloud Vision API enabled on the existing Google Cloud project (no extra delegation scope; Vision is called with the service account's own credentials). `GOOGLE-SETUP.md` gains the step. No new environment variables.

Cron Triggers are configured in `wrangler.toml` (new file); on Pages this is the scheduled-handler pattern. **Rebuild** buttons remain the backstop if a cron is ever not running.

## 7. Order-time warnings

- Statuses come from `dispatch_customer_status`, so every screen agrees.
- Order entry: when a customer is picked, a strip shows license and PSA status (green / amber / red) with a one-line reason for amber or red. The coordinator can proceed. The order stores `warnings_shown`.
- Orders list and Today flag orders taken under a red status.
- A super admin can turn each document type's order-time warning off on Setup → Warnings, with an optional note shown instead. Default at go-live: **off**. Statuses still show on the customer page and in the expiry email while off. Every change is logged.
- Payment code (H, CHECK) remains the only hard stop. Document status never changes a payment code or an order's state.

## 8. Import

- Setup → Import: paste the spreadsheet link (shared to `ops-system@adchem.pro` as viewer). The server reads by tab name and header: **Customer Directory** (primary), **Customers**, **Licensing & Entity**, **Delivery Notes**, **Account Terms** (PSA columns only). Missing tabs or headers are listed, never silently skipped.
- **Review screen**, one line per source row, with the proposed action: *new customer* / *site under X* / *related account of X* / *contact* / *license* / *PSA* / *skipped: money column* / *problem: …*. The Directory's "one row per customer or ship-to site" is resolved as: same legal name + different delivery address → a site under the existing customer; otherwise a customer, with `parent_customer_id` set from Parent / Related Account. Each decision is editable before commit.
- Addresses: Directory billing block → billing; delivery block → site (honouring "same as billing"). The Customers tab's address is used only where the Directory has none, as billing.
- Contacts: delivery contact → `receiving`; billing contact → `billing` (CC on Statements → extra `billing` contacts with `cc_on_statements`); owner → `owner`. "Same as" flags produce one contact, not copies. Customers-tab Contact/Phone/Email → `other` if not already present.
- Licensing & Entity → one `cannabis_license` document per row with `extra` fields; Balance skipped.
- Delivery Notes → site fields; Scale/Route columns → `dispatch_site_hub_notes` for EB and LA.
- Account Terms → one `psa` document with stage dates; every other column skipped.
- Existing `dispatch_sites` from FEED_ORDERS are matched by Customer ID, then name; unmatched feed sites are listed for manual linking.
- **Commit** runs in one transaction, logs an `import` entry, stamps `import_source` on each row. A re-run updates rows it created and shows a diff, and never overwrites a field edited in the app since (compares `updated_by` against the import user).
- Terms, Credit Limit, Balance, Payment Method, pricing, delivery fee, deposits/rentals, credit status and all Promise & Contact rows are never read into the database.

## 9. Customers Out

- A sheet the server writes, in the same Drive folder as Orders Out, tab `Customers Out`, one row per customer, plus one per additional site. Rebuilt in place; never hand-edited.
- Columns: Customer ID · Customer · Also Known As · Legal Name · Account Status · Primary Hub · Parent Account · Billing Street · City · State · ZIP · Delivery Street · City · State · ZIP · Delivery Contact · Delivery Phone · Billing Contact · Billing Phone · Billing Email · CC Emails · Owner Name · Owner Phone · Owner Email · License Status · License # · License Expires · Entity Status · PSA Status · PSA Effective · Profile Complete · Last Verified · Updated At.
- The AR Command Center's Directory RESOLVED block, FEED_ORDERS and the Order Log are repointed by the office to read this tab via IMPORTRANGE (one-time edit, one Allow access click). Same names and lookups, so formulas and the packet for Drew keep working.
- Written on every customer/site/contact/document save (row rewrite) and by **Rebuild**. A failed write shows a banner and never blocks the save.
- Never carries balances, terms, prices, files, collection notes, driver or company documents, activity or assets.

## 10. Intake (Google Form)

- The office builds the form in Google Forms. Fields: Customer ID (from a pre-filled link per customer; Ops generates the link on the customer page), Delivery site, Requested date, Window, Products and quantities (one line per product from a fixed list copied from the item list; a free-text "other"), Empties to collect, PO number, Receiving contact, Email for BOL copy, Notes.
- The server reads the form's response sheet by header on a schedule and on demand, upserting by response row key.
- Matching: Customer ID → customer; site by name under that customer; product lines by name against the item list. Anything unmatched is flagged on the request, never guessed.
- Coordinator: **Create order** (pre-filled order form, request linked) or **Decline** (reason). Created requests are read-only afterwards.
- Customers never sign in to Ops. The form cannot check credit, stock or promise a date.

## 11. Container capture (Vision)

1. On a stop, **Containers on site → Add / update** opens the camera. The photo uploads directly to `dispatch-docs/asset/…` with time, driver, stop, and GPS when the phone provides it.
2. The server calls Vision `TEXT_DETECTION` and extracts fields by pattern (tag formats are configurable per company in settings once real tags are seen; start with digits/alphanumerics near "TAG", "SN", "SERIAL", size markers like "50 lb").
3. The driver sees photo and fields side by side, low-confidence fields highlighted, corrects, and taps **Confirm**. Nothing is saved to the asset until then.
4. On confirm: match by `tag_number` or `serial` in the company → update location and `last_seen`, or create the asset; write a `sighted` (or `delivered` / `collected`) event with the photo and the OCR record including the driver's corrections.
5. Photos are never overwritten; each visit adds events.

The same pipeline reads a license photo from a stop (section 5.4), extracting number, type, expiry and licensee for the reviewer.

## 12. Error handling

- Google calls (Sheets, Vision, Gmail) follow the existing pattern: failure shows a banner, never blocks the local save; Rebuild / Check now / retry are the repair paths.
- Vision unavailable or unreadable: the driver can type the fields by hand; the event records `ocr: null`.
- Offline on Today: captures and events queue like proof-of-delivery photos do today, and sync with their original timestamps.
- Import: any row with a problem is shown, not dropped; commit is all-or-nothing.
- Intake: a row that cannot be parsed is stored with `status = new` and a `problems` list rather than skipped.
- Permission denied from the database surfaces as a clear message, never a blank screen.

## 13. Testing

- **Database:** migrations `005_customers.sql`, `006_documents.sql`, `007_assets.sql`, `008_intake.sql`, `009_permissions_settings.sql`. SQL tests for each policy: driver cannot read another hub's site or any customer row; coordinator without `view_documents` cannot select a document row or get a signed URL; driver can insert a `pending_review` capture but cannot select it; super admin can everything; second-company isolation holds for every new table. Security advisor re-run after apply.
- **Server:** unit tests with stand-ins for Sheets, Vision, Gmail and Storage: Customers Out row shape and rebuild idempotence; signed URL refused without permission; Vision field extraction on sample texts; import plan from a fixture workbook with every tab, including the site-vs-customer resolution and the money-column skip; intake upsert idempotence; expiry email content and recipient gating.
- **App:** extend `test/ui.test.cjs`: create a customer and see the ID; add site, contacts; upload a document; status chip at order entry; warnings off as super admin → no strip for a coordinator; import a fixture sheet and review it; driver captures a container with a stubbed Vision result and confirms; driver adds a note, coordinator approves; intake request → Create order pre-fills; driver sees their own document only.
- **Against real services at deploy:** Vision on real tag photos, Customers Out write, import of the live spreadsheet (review only, then commit), intake from the live form.

## 14. Rollout

1. Apply migrations; re-run the security advisor.
2. Deploy the app; enable Cloud Vision on the Google project; add Cron Triggers.
3. Share the spreadsheet and the form response sheet to `ops-system@adchem.pro` as viewer; create the Customers Out sheet shared as editor.
4. Import: read, review with the owner and Jessica, commit.
5. First Customers Out rebuild; the office repoints the AR Command Center's RESOLVED block, FEED_ORDERS and Order Log to it; Allow access.
6. People: set super admins, grant permissions, add drivers individually.
7. Warnings stay off until a super admin turns them on. Expiry recipients set.
8. Drivers start capturing containers and license photos on their next routes.

Nothing in this phase changes the BOL, the payment block, Orders Out, calendars or the proof-of-delivery flow.
