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
| **coordinator** | Take and edit orders, issue BOLs, print the Morning Driver Sheet (the paper backup of Today), Setup (feed, Orders Out, delivery calendars, Drive, BOL numbering, hubs) |
| **driver** | See their hub's routes on Today, open BOLs, photograph and send the signed BOL, photograph and send bank deposit slips. One driver account per hub (e.g. `driver-eb@adchem.pro`), signed in on that hub's phones |

Drivers never see billing contacts, balances, terms or prices. The server reads only the 14 FEED_ORDERS columns from the AR Command Center.

## Deploy (first time)

### 1. Put the code on GitHub
Create a repository under the **AdChemOps-1** account (e.g. `Ops`) and upload this folder.

### 2. Cloudflare Pages
1. Cloudflare dashboard → **Workers & Pages → Create → Pages → Connect to Git** → pick the repo.
2. Build settings: Framework **None** · Build command *(blank)* · Build output directory **`public`**. Functions in `functions/` are picked up automatically.
3. **Settings → Variables and Secrets** — the seven in `GOOGLE-SETUP.md` section E (`GOOGLE_SA_JSON` as a Secret). The Google ones can wait until section E is reached; the three Supabase/orders ones are needed for sign-in.
4. Deploy. The site gets a `*.pages.dev` address; add a custom domain later under **Custom domains**.

### 3. Supabase — one setting
Supabase dashboard → project **adchem-hours** → **Authentication → URL Configuration → Redirect URLs**: add the app's address (the `pages.dev` URL and, later, the custom domain). The Site URL can stay as AdChem Time's.

The database objects are already created (`supabase/migrations/` is the record). The existing admin account already holds admin for AdChem.

### 4. Google setup (Workspace admin, about 25 minutes)
See **`GOOGLE-SETUP.md`**. It starts with the dedicated user `ops-system@adchem.pro`.

### 5. First run
1. Open the app, sign in with your existing AdChem account.
2. **Setup → Google connection → Check again** — six lines should read *ok*; the Gmail line should say it can send as orders@adchem.pro. (The calendars line reads *no delivery calendar set* until step 5.)
3. **Setup → Customer feed → Refresh the feed now** — reads FEED_ORDERS.
4. **Setup → Orders Out** — paste the *AdChem Dispatch Orders Out* sheet link, **Save**, then **Rebuild Orders Out**. On the AR Command Center, click **Allow access** on Orders In A8 once.
5. **Setup → Delivery calendars** — for each hub, pick its calendar from the list or paste its Calendar ID (EB → *Deliveries — East Bay*, LA → *Deliveries — SoCal*, CO → *Deliveries — Denver*). A default is optional and covers any hub left on *Same as default*; a hub with neither saves its orders but gets no events, and Setup says so. **Check and confirm** — the server tests that it can write to every one before anything is written.
6. **Setup → Drive folder** — paste the shared BOL folder link, **Save**, **Send a test file**.
7. **Setup → BOL numbering** — on the day SmartBOL stops, enter its last number plus one.
8. **People** — add coordinators and one driver account per hub.

## Hubs

Each hub on **Setup → Hubs** has its shipper address, emergency number, **local time** and **the products it offers**. Local time sets the time zone of that hub's calendar events and delivery windows (Denver is Mountain); the office's Orders Out stays on the company time zone. Products default to *Every product*; switch a hub to *Only the ones ticked* and order entry refuses anything else for that hub, the same way it refuses a DO NOT LOAD product. Media names repeat across vendors, so a product is ticked by category and name.

## How the pieces talk

```
phone / laptop ──(sign-in, orders, BOLs)──► Supabase (dispatch_* tables, dispatch-pods photos)
       │
       └──(/api/feed, /api/calendar, /api/drive, /api/pod, /api/deposit, /api/orderlog, /api/health)──► Cloudflare Function ──► Google
                                                                                       (service account acting as ops-system@, sending as orders@)
```

Every `/api` call carries the caller's sign-in token and the company it is acting in; the function checks the token and the caller's role in that company before doing anything.

## Local testing

`node test/ui.test.cjs` runs the app in a headless browser against a fake Supabase and fake `/api` routes: sign-in, one order per payment code, BOL numbering, the Today load checks, the per-hub delivery calendars and a product-limited Denver hub in Mountain time (including refusing a read-only calendar and moving an event when an order changes hub), the photo-and-send flow, the deposit slip, People, and switching between two companies. It needs Playwright (`npm i -g playwright`).

## Files

```
public/            the app (index.html, app.js, styles.css, config.js, icons, vendor/supabase.js)
functions/api/     feed.js · calendar.js · drive.js · pod.js · deposit.js · orderlog.js · health.js
functions/_lib/    google.js (service-account token) · auth.js (who is calling, in which company) · orderlog.js (the Orders Out writer) · calendars.js (which calendar a hub's events go on)
api/               [route].js — adapter so the same server code could run on Vercel; not used by Cloudflare
supabase/          001_dispatch.sql, 002_companies.sql, 003_photo_scoping.sql, 004_hub_time_and_products.sql — the schema as applied
test/              ui.test.cjs
GOOGLE-SETUP.md    the Workspace / Google Cloud steps
```
