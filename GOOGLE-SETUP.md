# Google setup for AdChem Ops

The server needs one Google identity that can read the AR Command Center, write the delivery calendars, save BOLs to the BOL folder, write the *Dispatch Orders Out* sheet, and send mail **as orders@adchem.pro**. That identity is a **service account** in AdChem's Google Workspace, allowed to act as one dedicated Workspace user. Do this once.

**Do not turn `orders@adchem.pro` into a user.** `orders@` and `accounting@` are groups and stay groups: that is what lets the signed-BOL and deposit-slip emails survive anyone being away. A service account cannot act as a group, so the app acts as a dedicated user that sits inside the orders@ group.

## A. The dedicated user — `ops-system@adchem.pro` (Workspace admin, 10 minutes)

1. **Admin console → Users → Add new user:** `ops-system@adchem.pro`. A normal user license; a strong password nobody needs to remember (the app never signs in with it).
2. **Groups → orders@adchem.pro → Members → Add:** `ops-system@adchem.pro`. Everything shared with orders@ is now open to it.
3. **Gmail for ops-system@ → Settings → Accounts → Send mail as → Add another email address:** `orders@adchem.pro`, *treat as an alias* ticked. Gmail sends a verification code to orders@; it arrives in the group, so any member can read it. Enter the code. Until this is verified, mail would go out from ops-system@ instead of orders@ — the app's health check tells you which.
4. If `accounting@adchem.pro` is also a group, nothing more is needed: the app only *sends to* it.

## B. Google Cloud project and service account (10 minutes)

1. <https://console.cloud.google.com> signed in as the Workspace admin → create a project **AdChem Ops** (organization: adchem.pro).
2. **APIs & Services → Enable APIs:** **Google Sheets API**, **Google Calendar API**, **Google Drive API**, **Gmail API**.
3. **IAM & Admin → Service accounts → Create service account:** name `ops-server`. No roles. Create.
4. Open it → **Keys → Add key → Create new key → JSON**. The file downloads. Its whole contents are the `GOOGLE_SA_JSON` secret. Keep the file somewhere safe; never commit it.
5. On the service account's **Details** page copy the **Unique ID** (a long number) — needed in C.

## C. Domain-wide delegation (5 minutes)

1. Admin console → **Security → Access and data control → API controls → Manage Domain Wide Delegation → Add new**.
2. **Client ID:** the Unique ID from B5.
3. **OAuth scopes**, one line, comma-separated:

```
https://www.googleapis.com/auth/spreadsheets,https://www.googleapis.com/auth/calendar.events,https://www.googleapis.com/auth/drive.file,https://www.googleapis.com/auth/gmail.send,https://www.googleapis.com/auth/gmail.settings.basic
```

4. Authorize.

The documents feature adds no Google scope. Five scopes, and what each one is for: **spreadsheets** — read FEED_ORDERS and write *Dispatch Orders Out* (writes reach only sheets shared to it as editor; the AR Command Center is shared as viewer, so the app cannot write to it); **calendar.events** — the delivery calendars (create, update, and move an event when an order changes hub); **drive.file** — create BOL files in the folder; **gmail.send** — the BOL and deposit-slip emails; **gmail.settings.basic** — lets the health check confirm that orders@ is a verified send-as address, so a mis-sent From never goes unnoticed. It cannot read anyone's inbox or touch other users.

## D. Share these with `orders@adchem.pro`

The dedicated user reaches them through its group membership, so share with the group, not the user.

1. **AR Command Center** → Share → `orders@adchem.pro` → **Viewer**.
2. **Delivery calendars** — each one the app writes to: *Deliveries — East Bay*, *Deliveries — SoCal*, *Deliveries — Denver*, and the default calendar if you keep one. For each: Google Calendar → the calendar's **Settings and sharing** → Share with specific people → `orders@adchem.pro` → **Make changes to events**. On the same page, under **Integrate calendar**, copy the **Calendar ID** — you paste it on the app's **Setup → Delivery calendars** at first run (README, First run step 5). A calendar shared to a group does not always appear in the server's calendar list, which is why the ID is the reliable route.
3. **BOL folder** (or its shared drive) → `orders@adchem.pro` → **Editor** (Content manager on a shared drive).
4. **AdChem Dispatch Orders Out** sheet → `orders@adchem.pro` → **Editor**. This is the one the return flow writes to.
5. **The import spreadsheet** (the one with the *Customer Directory*, *Customers* and *Delivery Notes* tabs) → `orders@adchem.pro` → **Viewer**. The import only reads it.
6. **AdChem Customers Out** sheet → `orders@adchem.pro` → **Editor**. The app writes each customer's rows here.

## E. Tell the server (Cloudflare Pages → the project → Settings → Variables and Secrets)

| Name | Value |
|---|---|
| `GOOGLE_SA_JSON` | the JSON key file, whole — type **Secret** |
| `GOOGLE_IMPERSONATE` | `ops-system@adchem.pro` |
| `GMAIL_FROM` | `orders@adchem.pro` — **required**; without it mail goes out as ops-system@ |
| `ORDERS_TO` | `orders@adchem.pro` |
| `ACCOUNTING_TO` | `accounting@adchem.pro` |
| `SUPABASE_URL` | `https://ibcokjhjubltvoevpiik.supabase.co` |
| `SUPABASE_ANON_KEY` | `sb_publishable_Km15YV0FG8eCl_bRCp2fHw_WbF1ucrF` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → **Project Settings → API Keys** → the secret *service_role* key (on newer projects it is under the **Legacy API keys** tab) — type **Secret**. Used only by the daily expiry email (it reads every company); never sent to the browser |
| `EXPIRY_SECRET` | any long random string (e.g. 40+ characters from a password manager) — type **Secret**. The daily job sends it; without it the job is refused |
| `APP_URL` | optional — the app's address (e.g. `https://ops.adchem.pro`), linked at the foot of the expiry email; without it the email has no *Open AdChem Ops* link |

Redeploy. Open the app as an admin → **Setup → Google connection → Check again**. Eleven lines. The first ten — token, AR Command Center, calendars, Drive, Gmail, Orders Out, Customers Out, Import sheet, Documents bucket, Expiry email — should each read *ok* (the Sheets ones once their links are set on Setup). The Gmail line should say *can send as orders@adchem.pro*; the calendars line names each hub's calendar once they are set on **Setup → Delivery calendars**, and says which one the server can see but not write to. If one doesn't, the message says which share, scope or setting is missing. The last two check Supabase: *Documents bucket* (the private `dispatch-docs` bucket) and *Expiry email* (reads *ok — daily 06:00 Pacific* once the daily job is scheduled — see the README, *Expiry email*). The eleventh, *Last expiry email*, is information only: when the expiry email last went out for the company, or *never*.

## A second company

Each company in the app has its own sheet IDs, calendar, Drive folder and sending addresses on Setup. A second company on the same Workspace reuses this service account and user: give `ops-system@` a verified send-as for the second company's orders address, enter that address on the company's record, and share its sheets, calendar and folder with it. A second company on a different Workspace needs its own service account — not set up here.

## What this does *not* do

- Nobody at AdChem gets a new way into the AR Command Center: people sign in to the app with their own account, and only the server (as ops-system@, through orders@) reads the sheet.
- Drivers' phones never hold a Google credential. They sign in to the app; the server sends the email.
- Nothing is published to the web. The FEED tabs published in September can be unpublished — the app does not use the published link.
