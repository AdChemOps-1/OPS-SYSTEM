-- AdChem Ops — 005 customers, as written 10/20/26 (Stage 1 of the customers/documents/assets spec, §3.1 §3.2 §3.6 §3.8).
-- Customers become Ops-owned records: a customer has sites (the feed's dispatch_sites, now linked by customer uuid), per-hub
-- route notes, contacts and an activity log. Members gain a super-admin flag and a permissions map; every change to the new
-- tables and to dispatch_sites is written to dispatch_log as {field: {from, to}}.
-- Tested by supabase/tests/005_policies.sql (run inside begin … rollback).

-- ---------- customers ----------
create table if not exists public.dispatch_customers (
  id uuid primary key default gen_random_uuid(),
  company text not null references public.companies(id),
  customer_id text not null,                                -- ADC-0001…; assigned by dispatch_assign_customer_id() when blank
  name text not null, also_known_as text not null default '', legal_name text not null default '',
  account_status text not null default 'active' check (account_status in ('active','inactive','prospect')),
  primary_hub text not null default '', parent_customer_id uuid,
  billing_street text not null default '', billing_city text not null default '', billing_state text not null default '', billing_zip text not null default '',
  last_verified date, notes text not null default '', import_source jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(), updated_by uuid,
  unique (company, customer_id),
  unique (company, id),                                     -- target of the (company, customer) foreign keys: a row can only point at its own company's customer
  constraint dispatch_customers_parent_fkey foreign key (company, parent_customer_id) references public.dispatch_customers(company, id) on delete set null (parent_customer_id));
create index if not exists dispatch_customers_company_name_idx on public.dispatch_customers (company, lower(name));

-- ---------- sites: Ops-owned columns beside the feed's copy (gate, hours, instr stay as the feed writes them) ----------
alter table public.dispatch_sites add column if not exists customer_id uuid;
alter table public.dispatch_sites add column if not exists receiving_hours text not null default '';
alter table public.dispatch_sites add column if not exists gate_code text not null default '';
alter table public.dispatch_sites add column if not exists parking_unloading text not null default '';
alter table public.dispatch_sites add column if not exists hazmat_restrictions text not null default '';
alter table public.dispatch_sites add column if not exists container_notes text not null default '';
alter table public.dispatch_sites add column if not exists special_instructions text not null default '';
alter table public.dispatch_sites add column if not exists last_verified date;
alter table public.dispatch_sites add column if not exists import_source jsonb;
alter table public.dispatch_sites add column if not exists updated_by uuid;
alter table public.dispatch_sites add column if not exists updated_at timestamptz not null default now();   -- set by app edits and the import; the import compares it with import_source.at
-- guarded so the file can be re-run as is
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'dispatch_sites_customer_fkey' and conrelid = 'public.dispatch_sites'::regclass) then
    alter table public.dispatch_sites add constraint dispatch_sites_customer_fkey
      foreign key (company, customer_id) references public.dispatch_customers(company, id) on delete set null (customer_id);
  end if;
end $$;
create index if not exists dispatch_sites_company_customer_idx on public.dispatch_sites (company, customer_id);

-- ---------- per-hub route notes for a site ----------
create table if not exists public.dispatch_site_hub_notes (
  company text not null, site_key text not null, hub text not null,
  scale_on_route boolean, route_notes text not null default '',
  updated_at timestamptz not null default now(), updated_by uuid,
  primary key (company, site_key, hub),
  foreign key (company, site_key) references public.dispatch_sites(company, site_key) on delete cascade);

-- ---------- contacts ----------
create table if not exists public.dispatch_contacts (
  id uuid primary key default gen_random_uuid(),
  company text not null references public.companies(id),
  customer_id uuid not null, site_key text,                 -- site_key null = the customer as a whole (billing, AP, owner)
  type text not null default 'other' check (type in ('receiving','site_manager','ordering','safety','billing','ap','owner','other')),
  first_name text not null default '', last_name text not null default '', phone text not null default '', email text not null default '',
  preferred_method text check (preferred_method in ('phone','email','text')),
  notes text not null default '', active boolean not null default true, cc_on_statements boolean not null default false, import_source jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(), updated_by uuid,
  foreign key (company, customer_id) references public.dispatch_customers(company, id) on delete cascade,
  foreign key (company, site_key) references public.dispatch_sites(company, site_key) on delete set null (site_key));
create index if not exists dispatch_contacts_customer_idx on public.dispatch_contacts (company, customer_id);

-- ---------- activity (calls, emails, visits; drivers' notes wait for review) ----------
create table if not exists public.dispatch_customer_activity (
  id uuid primary key default gen_random_uuid(),
  company text not null references public.companies(id),
  customer_id uuid not null, site_key text, contact_id uuid references public.dispatch_contacts(id) on delete set null,
  occurred_at timestamptz not null default now(),
  method text check (method in ('call','email','text','in_person','app')),
  summary text not null,
  kind text not null default 'note' check (kind in ('note','driver_note')),
  status text not null default 'approved' check (status in ('approved','pending','rejected')),
  logged_by uuid default auth.uid(), reviewed_by uuid, reviewed_at timestamptz, rejection_reason text,
  created_at timestamptz not null default now(),
  foreign key (company, customer_id) references public.dispatch_customers(company, id) on delete cascade,
  foreign key (company, site_key) references public.dispatch_sites(company, site_key) on delete set null (site_key));
create index if not exists dispatch_customer_activity_customer_idx on public.dispatch_customer_activity (company, customer_id, occurred_at desc);
create index if not exists dispatch_customer_activity_pending_idx on public.dispatch_customer_activity (company, status) where status = 'pending';

-- ---------- members: super admin + permissions; log: field-level changes ----------
alter table public.dispatch_members add column if not exists is_super_admin boolean not null default false;
alter table public.dispatch_members add column if not exists permissions jsonb not null default '{}'::jsonb;   -- {"manage_customers":true, "approve_driver_notes":true, …}
alter table public.dispatch_log add column if not exists changes jsonb;
alter table public.dispatch_log add column if not exists table_name text;
alter table public.dispatch_log add column if not exists row_id text;
create index if not exists dispatch_log_row_idx on public.dispatch_log (table_name, row_id) where table_name is not null;

-- ---------- helpers (security definer; authenticated only) ----------
create or replace function public.dispatch_is_super_in(c text) returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_super_admin from public.dispatch_members where user_id = auth.uid() and company = c and active), false) $$;
-- a super admin has every permission; anyone else has what their permissions map says (absent, or anything but JSON true = no)
create or replace function public.dispatch_perm_in(c text, p text) returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_super_admin or coalesce(permissions->p = 'true'::jsonb, false)
                     from public.dispatch_members where user_id = auth.uid() and company = c and active), false) $$;

-- ---------- RPCs: permissions and super admin (dispatch_members has no update policy; these are the only way in) ----------
create or replace function public.dispatch_set_permissions(p_user uuid, p_company text, p_perms jsonb) returns void language plpgsql security definer set search_path = public as $fn$
declare tgt public.dispatch_members%rowtype;
begin
  if not (public.dispatch_is_admin_in(p_company) or public.dispatch_is_super_in(p_company)) then raise exception 'not allowed'; end if;
  select * into tgt from public.dispatch_members where user_id = p_user and company = p_company;
  if not found then raise exception 'not a member of this company'; end if;
  if tgt.is_super_admin and not public.dispatch_is_super_in(p_company) then raise exception 'not allowed'; end if;   -- admins cannot edit a super admin
  if jsonb_typeof(coalesce(p_perms, '{}'::jsonb)) <> 'object' then raise exception 'permissions must be an object'; end if;
  if exists (select 1 from jsonb_each(coalesce(p_perms, '{}'::jsonb)) e where jsonb_typeof(e.value) <> 'boolean') then raise exception 'permission values must be true or false'; end if;
  update public.dispatch_members set permissions = coalesce(p_perms, '{}'::jsonb) where user_id = p_user and company = p_company;
  insert into public.dispatch_log (company, who, what, detail, table_name, row_id, changes) values (p_company, auth.uid(), 'permissions',
    jsonb_build_object('user', p_user), 'dispatch_members', p_user::text, jsonb_build_object('permissions', jsonb_build_object('from', tgt.permissions, 'to', coalesce(p_perms, '{}'::jsonb))));
end $fn$;
create or replace function public.dispatch_set_super_admin(p_user uuid, p_company text, p_on boolean) returns void language plpgsql security definer set search_path = public as $fn$
declare was boolean;
begin
  if not public.dispatch_is_super_in(p_company) then raise exception 'not allowed'; end if;
  if p_user = auth.uid() and not coalesce(p_on, false) then raise exception 'you cannot remove your own super admin'; end if;   -- keeps at least one
  select is_super_admin into was from public.dispatch_members where user_id = p_user and company = p_company;
  if not found then raise exception 'not a member of this company'; end if;
  update public.dispatch_members set is_super_admin = coalesce(p_on, false) where user_id = p_user and company = p_company;
  insert into public.dispatch_log (company, who, what, detail, table_name, row_id, changes) values (p_company, auth.uid(), 'super_admin',
    jsonb_build_object('user', p_user), 'dispatch_members', p_user::text, jsonb_build_object('is_super_admin', jsonb_build_object('from', was, 'to', coalesce(p_on, false))));
end $fn$;

-- ---------- triggers ----------
-- Customer numbers: one atomic update … returning on the company's settings row, so two concurrent inserts get different numbers
-- (the second waits on the first's row lock). nextCustomerNumber lives in dispatch_company_settings.data. The number is never
-- below one past the highest ADC-n the company already has, so a counter written back stale (an old Setup save) heals itself.
create or replace function public.dispatch_assign_customer_id() returns trigger language plpgsql security definer set search_path = public as $fn$
declare n int;
begin
  if coalesce(new.customer_id, '') <> '' then return new; end if;
  insert into public.dispatch_company_settings (company) values (new.company) on conflict (company) do nothing;
  update public.dispatch_company_settings
     set data = jsonb_set(data, '{nextCustomerNumber}', to_jsonb(greatest(coalesce((data->>'nextCustomerNumber')::int, 1),
           (select coalesce(max(substring(c.customer_id from '^ADC-(\d{1,9})$')::int), 0) + 1 from public.dispatch_customers c where c.company = new.company)) + 1)),
         updated_at = now()
   where company = new.company
   returning (data->>'nextCustomerNumber')::int - 1 into n;
  new.customer_id := 'ADC-' || lpad(n::text, greatest(4, length(n::text)), '0');   -- lpad truncates, so widen past 9999
  return new;
end $fn$;
create or replace trigger dispatch_customers_assign_id before insert on public.dispatch_customers for each row execute function public.dispatch_assign_customer_id();

-- A driver's note always waits for review, whatever status was sent; a driver's entry is always a driver_note, logged as themselves.
create or replace function public.dispatch_driver_note_guard() returns trigger language plpgsql security definer set search_path = public as $fn$
begin
  if auth.uid() is not null then new.logged_by := auth.uid(); end if;
  if public.dispatch_role_in(new.company) = 'driver' then new.kind := 'driver_note'; end if;
  if new.kind = 'driver_note' then new.status := 'pending'; new.reviewed_by := null; new.reviewed_at := null; new.rejection_reason := null;
  else new.status := 'approved'; end if;
  return new;
end $fn$;
create or replace trigger dispatch_customer_activity_guard before insert on public.dispatch_customer_activity for each row execute function public.dispatch_driver_note_guard();

-- A row never moves to another company (update policies check the new row's company, so a move would otherwise need only
-- rights in the destination), and a customer's number never changes once given (Customers Out, the AR Command Center and
-- the Order Log key on it).
create or replace function public.dispatch_keep_company() returns trigger language plpgsql security definer set search_path = public as $fn$
begin
  if new.company is distinct from old.company then raise exception 'company cannot change'; end if;
  if tg_table_name = 'dispatch_customers' and new.customer_id is distinct from old.customer_id then raise exception 'customer_id cannot change'; end if;
  return new;
end $fn$;
create or replace trigger dispatch_customers_keep_company before update on public.dispatch_customers for each row execute function public.dispatch_keep_company();
create or replace trigger dispatch_contacts_keep_company before update on public.dispatch_contacts for each row execute function public.dispatch_keep_company();
create or replace trigger dispatch_customer_activity_keep_company before update on public.dispatch_customer_activity for each row execute function public.dispatch_keep_company();
create or replace trigger dispatch_site_hub_notes_keep_company before update on public.dispatch_site_hub_notes for each row execute function public.dispatch_keep_company();

-- Audit: one dispatch_log row per insert/update/delete, changes = {field: {from, to}} for every top-level key that differs
-- (inserts have from null, deletes to null). updated_at/updated_by are noise and left out, and so is synced_at
-- (/api/feed re-upserts every site on each sync); an update that changes nothing else is not logged.
create or replace function public.dispatch_audit() returns trigger language plpgsql security definer set search_path = public as $fn$
declare o jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end; n jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
        r jsonb := coalesce(n, o); ch jsonb;
begin
  select coalesce(jsonb_object_agg(k, jsonb_build_object('from', o->k, 'to', n->k)), '{}'::jsonb) into ch
    from (select jsonb_object_keys(coalesce(o, '{}'::jsonb) || coalesce(n, '{}'::jsonb)) k) keys
   where k not in ('updated_at','updated_by','synced_at') and (o->k) is distinct from (n->k);
  if tg_op = 'UPDATE' and ch = '{}'::jsonb then return null; end if;
  insert into public.dispatch_log (company, who, what, detail, table_name, row_id, changes) values (r->>'company', auth.uid(), 'change',
    jsonb_build_object('op', lower(tg_op)), tg_table_name,
    case tg_table_name when 'dispatch_sites' then r->>'site_key' when 'dispatch_site_hub_notes' then (r->>'site_key') || '/' || (r->>'hub') else r->>'id' end, ch);
  return null;
end $fn$;
create or replace trigger dispatch_customers_audit after insert or update or delete on public.dispatch_customers for each row execute function public.dispatch_audit();
create or replace trigger dispatch_sites_audit after insert or update or delete on public.dispatch_sites for each row execute function public.dispatch_audit();
create or replace trigger dispatch_site_hub_notes_audit after insert or update or delete on public.dispatch_site_hub_notes for each row execute function public.dispatch_audit();
create or replace trigger dispatch_contacts_audit after insert or update or delete on public.dispatch_contacts for each row execute function public.dispatch_audit();
create or replace trigger dispatch_customer_activity_audit after insert or update or delete on public.dispatch_customer_activity for each row execute function public.dispatch_audit();

-- ---------- status view: the 15 must-have fields (spec §5.1). License and PSA are Stage 2, which replaces this view. ----------
create or replace view public.dispatch_customer_status with (security_invoker = true) as
select c.company, c.customer_id, c.id,
  ( (coalesce(c.name,'') <> '')::int + (coalesce(c.legal_name,'') <> '')::int + (coalesce(c.account_status,'') <> '')::int + (coalesce(c.primary_hub,'') <> '')::int
  + (coalesce(c.billing_street,'') <> '')::int + (coalesce(c.billing_city,'') <> '')::int + (coalesce(c.billing_state,'') <> '')::int + (coalesce(c.billing_zip,'') <> '')::int
  + exists (select 1 from public.dispatch_sites s where s.company = c.company and s.customer_id = c.id and btrim(coalesce(s.addr,'')) <> '')::int
  + exists (select 1 from public.dispatch_contacts x where x.company = c.company and x.customer_id = c.id and x.type = 'receiving' and btrim(coalesce(x.phone,'')) <> '')::int
  + exists (select 1 from public.dispatch_contacts x where x.company = c.company and x.customer_id = c.id and x.type = 'billing' and btrim(coalesce(x.email,'')) <> '')::int
  + 0 /* license on file */ + 0 /* license expiry */ + 0 /* PSA signed */
  + (c.last_verified is not null)::int ) as profile_complete,
  'missing'::text as license_status, null::date as license_expires, null::text as license_number,
  'missing'::text as psa_status, null::text as entity_status
from public.dispatch_customers c;
revoke all on public.dispatch_customer_status from anon;

-- ---------- execute: helpers and RPCs to authenticated; trigger functions to no one (triggers fire regardless) ----------
grant execute on function public.dispatch_is_super_in(text), public.dispatch_perm_in(text,text),
  public.dispatch_set_permissions(uuid,text,jsonb), public.dispatch_set_super_admin(uuid,text,boolean) to authenticated;
revoke execute on function public.dispatch_is_super_in(text), public.dispatch_perm_in(text,text),
  public.dispatch_set_permissions(uuid,text,jsonb), public.dispatch_set_super_admin(uuid,text,boolean) from anon, public;
revoke execute on function public.dispatch_assign_customer_id(), public.dispatch_driver_note_guard(), public.dispatch_keep_company(), public.dispatch_audit()
  from anon, authenticated, public;

-- ---------- row-level security ----------
alter table public.dispatch_customers enable row level security;        alter table public.dispatch_site_hub_notes enable row level security;
alter table public.dispatch_contacts enable row level security;         alter table public.dispatch_customer_activity enable row level security;
-- Each create policy is guarded by pg_policies so the file can be re-run as is (nothing is removed first).
do $$ begin
  -- Writes need manage_customers. Update policies see the row as an editor (using) and require the permission on the new row
  -- (with check), so a coordinator without it gets an error rather than a silent zero-row update.
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'dispatch_customers' and policyname = 'dc_read') then
    create policy dc_read on public.dispatch_customers for select using (public.dispatch_can_edit_in(company));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'dispatch_customers' and policyname = 'dc_insert') then
    create policy dc_insert on public.dispatch_customers for insert with check (public.dispatch_perm_in(company, 'manage_customers'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'dispatch_customers' and policyname = 'dc_update') then
    create policy dc_update on public.dispatch_customers for update using (public.dispatch_can_edit_in(company)) with check (public.dispatch_perm_in(company, 'manage_customers'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'dispatch_customers' and policyname = 'dc_delete') then
    create policy dc_delete on public.dispatch_customers for delete using (public.dispatch_perm_in(company, 'manage_customers'));
  end if;
  -- Sites: dsi_read/dsi_write stay as they are (dispatch_can_edit_in), because /api/feed upserts sites as the calling coordinator.
  -- manage_customers gates site edits in the app, not here. Drivers now read their hub's sites (gate codes, receiving hours).
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'dispatch_sites' and policyname = 'dsi_driver_read') then
    create policy dsi_driver_read on public.dispatch_sites for select using (public.dispatch_role_in(company) = 'driver' and (public.dispatch_hub_in(company) = '' or hub = public.dispatch_hub_in(company)));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'dispatch_site_hub_notes' and policyname = 'dshn_read') then
    create policy dshn_read on public.dispatch_site_hub_notes for select using (public.dispatch_can_edit_in(company) or (public.dispatch_role_in(company) = 'driver' and (public.dispatch_hub_in(company) = '' or hub = public.dispatch_hub_in(company))));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'dispatch_site_hub_notes' and policyname = 'dshn_write') then
    create policy dshn_write on public.dispatch_site_hub_notes for all using (public.dispatch_can_edit_in(company)) with check (public.dispatch_can_edit_in(company));
  end if;
  -- Contacts: editors read all; a driver reads only receiving / site-manager contacts at sites of their hub (never billing, AP, owner).
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'dispatch_contacts' and policyname = 'dct_read') then
    create policy dct_read on public.dispatch_contacts for select using (public.dispatch_can_edit_in(company)
      or (public.dispatch_role_in(company) = 'driver' and type in ('receiving','site_manager') and site_key in
          (select s.site_key from public.dispatch_sites s where s.company = dispatch_contacts.company and (public.dispatch_hub_in(s.company) = '' or s.hub = public.dispatch_hub_in(s.company)))));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'dispatch_contacts' and policyname = 'dct_insert') then
    create policy dct_insert on public.dispatch_contacts for insert with check (public.dispatch_perm_in(company, 'manage_customers'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'dispatch_contacts' and policyname = 'dct_update') then
    create policy dct_update on public.dispatch_contacts for update using (public.dispatch_can_edit_in(company)) with check (public.dispatch_perm_in(company, 'manage_customers'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'dispatch_contacts' and policyname = 'dct_delete') then
    create policy dct_delete on public.dispatch_contacts for delete using (public.dispatch_perm_in(company, 'manage_customers'));
  end if;
  -- Activity: editors read all, a current member reads what they logged (a removed member reads nothing); any member logs (drivers' notes forced pending by the guard);
  -- reviewing (update) needs approve_driver_notes. No delete policy: the log is kept.
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'dispatch_customer_activity' and policyname = 'dca_read') then
    create policy dca_read on public.dispatch_customer_activity for select using (public.dispatch_can_edit_in(company) or (public.dispatch_role_in(company) is not null and logged_by = (select auth.uid())));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'dispatch_customer_activity' and policyname = 'dca_insert') then
    create policy dca_insert on public.dispatch_customer_activity for insert with check (public.dispatch_role_in(company) is not null);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'dispatch_customer_activity' and policyname = 'dca_update') then
    create policy dca_update on public.dispatch_customer_activity for update using (public.dispatch_perm_in(company, 'approve_driver_notes')) with check (public.dispatch_perm_in(company, 'approve_driver_notes'));
  end if;
  -- dispatch_log: coordinators (any editor) read the change rows that make up a customer's History; grant, invite, permission and
  -- import rows stay admin-only (dl_admin_read, from 001/002).
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'dispatch_log' and policyname = 'dl_editor_read') then
    create policy dl_editor_read on public.dispatch_log for select using (public.dispatch_can_edit_in(company) and table_name is not null and what = 'change');
  end if;
end $$;
-- dispatch_log inserts from the client: a member writes only plain rows as themselves (the import's 'import' row, Setup's
-- 'segtable' row). Change, permission and super-admin rows come only from the security-definer trigger and RPCs above, which
-- RLS does not apply to, so no one can forge an audit row. dl_insert exists since 001, so it is altered in place (re-runnable).
alter policy dl_insert on public.dispatch_log with check (company in (select public.dispatch_companies()) and who = (select auth.uid()) and table_name is null and changes is null);
-- the id is a bigserial: without usage on its sequence no client insert reached the policy at all (/api/import's 'import' row failed)
grant usage on sequence public.dispatch_log_id_seq to authenticated;
-- dispatch_members: unchanged (dm_read only). is_super_admin and permissions change only through the two RPCs above.

-- ---------- seed ----------
update public.dispatch_company_settings set data = jsonb_set(data, '{nextCustomerNumber}', '1') where company = 'adchem' and not (data ? 'nextCustomerNumber');
update public.dispatch_members set is_super_admin = true where company = 'adchem' and role = 'admin' and active;   -- the existing admin account (one row on 10/20/26)

-- Security advisor: development branches are not available on this project, so this file was tested only inside a rolled-back
-- transaction (supabase/tests/005_policies.sql: NOTICE '005 policies ok'), which the advisor cannot see. Re-run get_advisors
-- (type security) after the real apply and record the result here. Expected: no new "RLS disabled" or "function callable by anon"
-- findings for dispatch_* — every new table above enables RLS and every new function revokes execute from anon and public.
-- View: each text test in dispatch_customer_status is wrapped in coalesce(col,'') (10/20/26, Task 9) so profile_complete stays
-- non-null even if a text field arrives null; the customer import also writes blank text as '' rather than null.
