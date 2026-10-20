# AdChem Ops

Order intake, bills of lading, the day's routes, proof of delivery and bank deposit slips — the operations app for AdChem and any company that shares its systems. A standalone web app with its own sign-in; nothing in it depends on any other account or tool.

- **Front end:** `public/` — one page, plain HTML/JS, works on a phone, installable to the home screen.
- **Server:** `functions/api/` — Cloudflare Pages Functions. These hold the Google service account and do everything that touches Google: read the AR Command Center, write each hub's delivery calendar, save BOLs to Drive, send the signed-BOL and deposit-slip emails as orders@adchem.pro, and write the *Dispatch Orders Out* sheet that the AR Command Center reads back.
- **Database and sign-in:** Supabase project **adchem-hours** (the shared AdChem operations database; the same accounts AdChem Time uses). Tables are prefixed `dispatch_`. Access is invite-only and managed inside the app.

## Companies

Every row — customers, orders, BOLs, hubs, settings, photos — belongs to a company. People are members of one or more companies, each with a role, and see only the companies they belong to. Someone in more than one picks the company at the top of the page. Each company has its own BOL sequence, hubs, shipper block, AR sheet, delivery calendars, Drive folder, Orders Out sheet and sending addresses. An admin adds a company on **People → Companies**, switches to it, sets it up on Setup, and adds its people. AdChem is company `adchem`.

## Roles (per company)

| Role | Can |
|---|---|
| **admin** | Everything, plus **People** (add and remove users, add a company), the compatibility table and the server health check |
| **coordinator** | Take and edit orders, issue BOLs, print the Morning Driver Sheet (the paper backup of Today), Setup (feed, Orders Out, Customers Out, delivery calendars, Drive, BOL numbering, hubs) |
| **driver** | See their hub's routes on Today, with each site's notes and receiving contact, add a note on a stop, open BOLs, photograph and send the signed BOL, photograph and send bank deposit slips. One account per person (e.g. `maria@adchem.pro`), with their hub set on People |
| **super admin** | A switch on top of a role, set on People by another super admin (you cannot remove your own). Holds every permission below and is the only one who can change a super admin |

Three permissions are switched per person on **People**: **Manage customers** (create and edit customers, sites and contacts; log activity), **Approve driver notes** (review the notes drivers add from Today) and **Run imports** (read and commit the spreadsheet import on Setup; committing also needs Manage customers). Everyone who can take orders can see Customers; without Manage customers it is read-only. Only true counts as granted: any other value in a person's permissions is no.

Drivers never see billing contacts, balances, terms or prices. The server reads only the 14 FEED_ORDERS columns from the AR Command Center, and the import never reads a money column.

## Customers

The **Customers** tab is the customer master: a list with search, and a profile per customer with its sites (each with an address and per-hub route notes), contacts, activity (calls, emails, visits and driver notes — a driver's note waits for someone with Approve driver notes before it shows) and a history of every change. Orders link to the customer here, and Today shows the site's notes and receiving contact to the driver. Customer numbers come from the `nextCustomerNumber` setting, which only the server moves (a Setup save writes back what the database has); a new number is never at or below the highest `ADC-n` the company already has, and a customer's number never changes once given.

**History** is read from the audit log: coordinators and admins see every change to a customer, its sites, route notes, contacts and activity. Grant, invite, permission and import entries stay admin-only (People → Recent access changes). No one can write a change entry by hand; only the database's own triggers do.

A site that comes from FEED_ORDERS (it shows a feed code) takes its street address, city, hub and label from the feed on every sync, so those four are read-only on its Sites form, marked *from FEED_ORDERS*; its receiving hours, gate code, parking, hazmat, container and special instructions, last verified and route notes are Ops fields and stay editable.

Two Setup cards connect it to the spreadsheets:

- **Customers Out** — the company's *Customers Out* sheet. Each customer's rows are rewritten whenever the customer, a site or a contact is saved (`/api/customers-out`); a row for a site the customer no longer has is blanked, not deleted, so two saves at once never shift each other's rows. **Rebuild Customers Out** rewrites the whole tab and removes the blank rows. A failed write shows a banner; the change is still saved.
- **Import** — reads the existing spreadsheet's *Customer Directory*, *Customers* and *Delivery Notes* tabs (`/api/import`, needs Run imports). It shows a review of what would be created, changed or skipped; nothing is written until you commit. Run it **before creating customers in the app**: a sheet row whose Customer ID already belongs to a customer added in the app under another name and legal name is shown as a problem and not imported. Re-running it keeps anything changed in the app since the last import (including the importer's own edits) and only fills blanks. The *Customers* tab's contact is imported as type *other*. Feed sites that match no customer are listed in the review and left unlinked; linking them comes in a later stage. Licensing & Entity and Account Terms are left for a later stage.

## Expiry email

Every morning at 06:00 Pacific (07:00 during daylight time; `0 14 * * *` UTC) a `pg_cron` job in Supabase calls `/api/expiry`, which emails each company's expiring and expired documents — customers, the company itself and people, inside the company's warning window — from the company's sending address to the addresses on **Setup → Warnings** (super admins). A company with no recipients, or nothing due, gets no email; the addresses listed are the only ones it goes to. The job authenticates with `EXPIRY_SECRET` and reads every company with `SUPABASE_SERVICE_ROLE_KEY` (both in `GOOGLE-SETUP.md` section E). Schedule it once after deploying, from the Supabase SQL editor (re-running replaces the job and the secret):

```sql
select dispatch_schedule_expiry('<app url>/api/expiry', '<EXPIRY_SECRET>');
```

**Setup → Warnings → Send expiry email now** sends the same email for the current company straight away. **Setup → Google connection** shows *Expiry email: ok — daily 06:00 Pacific* once the job is scheduled. Each email sent is logged (`expiry_email`).

## Deploy (first time)

### 1. Put the code on GitHub
Create a repository under the **AdChemOps-1** account (e.g. `Ops`) and upload this folder.

### 2. Cloudflare Pages
1. Cloudflare dashboard → **Workers & Pages → Create → Pages → Connect to Git** → pick the repo.
2. Build settings: Framework **None** · Build command *(blank)* · Build output directory **`public`**. Functions in `functions/` are picked up automatically.
3. **Settings → Variables and Secrets** — the ones in `GOOGLE-SETUP.md` section E (`GOOGLE_SA_JSON` as a Secret). The Google ones can wait until section E is reached; the three Supabase/orders ones are needed for sign-in.
4. Deploy. The site gets a `*.pages.dev` address; add a custom domain later under **Custom domains**.

### 3. Supabase — one setting
Supabase dashboard → project **adchem-hours** → **Authentication → URL Configuration → Redirect URLs**: add the app's address (the `pages.dev` URL and, later, the custom domain). The Site URL can stay as AdChem Time's.

The database objects through `004` are already created (`supabase/migrations/` is the record). **`005_customers.sql` is to be applied; then re-run the security advisor.** The existing admin account already holds admin for AdChem.

### 4. Google setup (Workspace admin, about 25 minutes)
See **`GOOGLE-SETUP.md`**. It starts with the dedicated user `ops-system@adchem.pro`.

### 5. First run
1. Open the app, sign in with your existing AdChem account.
2. **Setup → Google connection → Check again** — all ten lines should read *ok* (token, AR Command Center, calendars, Drive, Gmail, Orders Out, Customers Out, Import sheet, Documents bucket, Expiry email; Orders Out, Customers Out and Import sheet read *no … set* until step 4 is done, calendars until step 5, Expiry email *not scheduled* until step 9); the Gmail line should say it can send as orders@adchem.pro. (The calendars line reads *no delivery calendar set* until step 5.)
3. **Setup → Customer feed → Refresh the feed now** — reads FEED_ORDERS.
4. **Setup → Orders Out** — paste the *AdChem Dispatch Orders Out* sheet link, **Save**, then **Rebuild Orders Out**. On the AR Command Center, click **Allow access** on Orders In A8 once.
   - **Setup → Customers Out** — paste the *Customers Out* sheet link, **Save**, then **Rebuild Customers Out**.
   - **Setup → Import** — run the import before creating customers in the app. Share the spreadsheet to orders@adchem.pro as **Viewer**, paste its link, **Read the workbook**, review the plan, then **Import the reviewed rows**.
5. **Setup → Delivery calendars** — for each hub, pick its calendar from the list or paste its Calendar ID (EB → *Deliveries — East Bay*, LA → *Deliveries — SoCal*, CO → *Deliveries — Denver*). A default is optional and covers any hub left on *Same as default*; a hub with neither saves its orders but gets no events, and Setup says so. **Check and confirm** — the server tests that it can write to every one before anything is written.
6. **Setup → Drive folder** — paste the shared BOL folder link, **Save**, **Send a test file**.
7. **Setup → BOL numbering** — on the day SmartBOL stops, enter its last number plus one.
8. **People** — set the super admins, grant each person's permissions, and add each driver individually (one account per person, with their hub).
9. **Expiry email** — on **Setup → Warnings** enter the recipients and **Save warnings**, then schedule the daily job (see *Expiry email* above) and press **Send expiry email now** once to check.

## Hubs

Each hub on **Setup → Hubs** has its shipper address, emergency number, **local time** and **the products it offers**. Local time sets the time zone of that hub's calendar events and delivery windows (Denver is Mountain); the office's Orders Out stays on the company time zone. Products default to *Every product*; switch a hub to *Only the ones ticked* and order entry refuses anything else for that hub, the same way it refuses a DO NOT LOAD product. Media names repeat across vendors, so a product is ticked by category and name.

## How the pieces talk

```
phone / laptop ──(sign-in, orders, BOLs)──► Supabase (dispatch_* tables, dispatch-pods photos)
       │
       └──(/api/feed, /api/calendar, /api/drive, /api/pod, /api/deposit, /api/orderlog, /api/expiry, /api/health)──► Cloudflare Function ──► Google
                                                                                       (service account acting as ops-system@, sending as orders@)
```

Every `/api` call carries the caller's sign-in token and the company it is acting in; the function checks the token and the caller's role in that company before doing anything.

## Local testing

`npm test` runs both UI suites and the unit tests. `node test/ui.test.cjs` runs the app in a headless browser against a fake Supabase and fake `/api` routes: sign-in, one order per payment code, BOL numbering, the Today load checks, the per-hub delivery calendars and a product-limited Denver hub in Mountain time (including refusing a read-only calendar and moving an event when an order changes hub), the photo-and-send flow, the deposit slip, People, and switching between two companies. It needs Playwright (`npm i -g playwright`).

## Files

```
public/            the app (index.html, app.js, customers.js, import.js, styles.css, config.js, icons, vendor/supabase.js)
functions/api/     feed.js · calendar.js · drive.js · pod.js · deposit.js · orderlog.js · customers-out.js · import.js · health.js
functions/_lib/    google.js (service-account token) · auth.js (who is calling, in which company) · orderlog.js (the Orders Out writer) · customersout.js (the Customers Out writer) · importsheet.js (the spreadsheet reader) · calendars.js (which calendar a hub's events go on)
api/               [route].js — adapter so the same server code could run on Vercel; not used by Cloudflare
supabase/          001_dispatch.sql … 004_hub_time_and_products.sql as applied; 005_customers.sql to be applied (safe to run twice); tests/005_policies.sql (run inside begin … rollback)
test/              ui.test.cjs · customers.test.cjs (headless UI suites) · _fake.cjs (the fake Supabase and /api routes they share) · unit/ · fixtures/ · run.cjs (runs everything)
GOOGLE-SETUP.md    the Workspace / Google Cloud steps
```
