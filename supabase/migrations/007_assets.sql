-- AdChem Ops — 007 assets, as written 10/23/26 (Stage 3A of the assets and inventory spec, 2026-10-22-assets-and-inventory-design.md §3.1–3.5 §3.8 §4).
-- A serialized asset register: vendors, container types (seeded from the order form's gas containers), one row per container in
-- dispatch_assets kept current only by append-only dispatch_asset_events, and dispatch_stock_movements (a hub fill draws bulk pounds
-- down; 3B reads it). Two new permissions in dispatch_members.permissions: view_assets (read the register, history, stock) and
-- manage_assets (add/edit, correct, every event type, vendors and types); super admins have both. A driver sees the containers at
-- their hub, at the sites of today's stops in their hub and the ones they handled today, and records delivered / collected /
-- sighted / loaded / created at those places. Coordinators without a switch see counts only (dispatch_asset_counts_for).
-- Photos live in the private dispatch-docs bucket under {company}/asset/. Re-runnable as is (guarded blocks, if not exists, create or replace).
-- Tested by supabase/tests/007_policies.sql (run inside begin … rollback, the file applied twice first).

-- ---------- vendors ----------
create table if not exists public.dispatch_vendors (
  id uuid primary key default gen_random_uuid(),
  company text not null references public.companies(id),
  name text not null,
  roles text[] not null default '{}'::text[] check (roles <@ array['fill','rent','supply']::text[]),
  contact_name text not null default '', phone text not null default '', email text not null default '', addr text not null default '',
  notes text not null default '', active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(), updated_by uuid);
create unique index if not exists dispatch_vendors_name_uq on public.dispatch_vendors (company, lower(name));

-- ---------- container types ----------
create table if not exists public.dispatch_container_types (
  id uuid primary key default gen_random_uuid(),
  company text not null references public.companies(id),
  kind text not null check (kind in ('cylinder','dewar','pig','tank')),
  size_label text not null,                                  -- exactly the order form's container string, e.g. 50lb Cylinder
  product text not null,                                     -- the order form's product name, e.g. Carbon Dioxide
  fill_lb numeric,                                           -- nominal product weight when full; null = unknown (a fill writes no stock row)
  active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(), updated_by uuid,
  unique (company, product, size_label));

-- ---------- assets: the latest picture of each container, moved only by events ----------
create table if not exists public.dispatch_assets (
  id uuid primary key default gen_random_uuid(),
  company text not null references public.companies(id),
  serial text not null,                                      -- uppercased, spaces and hyphens removed by dispatch_assets_normalize
  tag text not null default '',                              -- sticker / card id
  container_type_id uuid references public.dispatch_container_types(id),
  owner_kind text not null default 'adchem' check (owner_kind in ('adchem','vendor','customer')),   -- adchem = the company that owns the row
  owner_id text not null default '',                         -- vendor id / customer id as text; '' for adchem
  fill_state text not null default 'unknown' check (fill_state in ('full','empty','unknown')),
  condition text not null default 'in_service' check (condition in ('in_service','out_of_service','lost','retired')),
  location_kind text not null,
  location_id text not null,                                 -- hub code / site_key / vendor id as text
  last_seen_at timestamptz, last_seen_by uuid, hydro_due date, acquired_on date, notes text not null default '',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(), updated_by uuid,
  -- a truck can join later with one alter table pair (remove this constraint, add the wider one)
  constraint dispatch_assets_location_kind_chk check (location_kind in ('hub','site','vendor')));
-- the normalize trigger stores serial upper/trimmed, so a plain index is unique per company whatever the typed case
create unique index if not exists dispatch_assets_serial_uq on public.dispatch_assets (company, serial);
create index if not exists dispatch_assets_location_idx on public.dispatch_assets (company, location_kind, location_id);
create index if not exists dispatch_assets_type_idx on public.dispatch_assets (container_type_id);

-- ---------- asset events (append-only) ----------
create table if not exists public.dispatch_asset_events (
  id uuid primary key default gen_random_uuid(),             -- the phone's event id: a retried batch is the primary key's violation
  company text not null references public.companies(id),
  asset_id uuid not null references public.dispatch_assets(id),
  event_type text not null check (event_type in ('created','delivered','collected','to_vendor','from_vendor','filled','moved','loaded','sighted','corrected')),
  from_kind text, from_id text, to_kind text, to_id text,
  fill_after text check (fill_after in ('full','empty','unknown')),
  occurred_at timestamptz not null default now(),            -- the phone's time, kept within 30 days and not after now (guard)
  recorded_by uuid,
  order_id text, bol_number int, site_key text,
  photo_path text, gps jsonb, ocr jsonb,
  note text not null default '',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(), updated_by uuid,
  constraint dispatch_asset_events_from_kind_chk check (from_kind in ('hub','site','vendor')),
  constraint dispatch_asset_events_to_kind_chk check (to_kind in ('hub','site','vendor')));
create index if not exists dispatch_asset_events_asset_idx on public.dispatch_asset_events (asset_id, occurred_at desc);
create index if not exists dispatch_asset_events_recorder_idx on public.dispatch_asset_events (company, recorded_by, created_at desc);

-- ---------- stock movements (append-only; 3A writes fills, 3B reads and adds the rest) ----------
create table if not exists public.dispatch_stock_movements (
  id uuid primary key default gen_random_uuid(),
  company text not null references public.companies(id),
  hub text not null,
  product text not null,
  container text not null default '',                        -- '' for bulk pounds and supplies
  item text not null default '',                             -- '' except supplies, e.g. Regulator
  qty numeric not null,                                      -- signed
  unit text not null check (unit in ('count','lb')),
  reason text not null check (reason in ('received','produced','delivered','filled','adjusted','counted','consumed')),
  vendor_id uuid references public.dispatch_vendors(id), order_id text,
  asset_event_id uuid references public.dispatch_asset_events(id),
  note text not null default '',
  occurred_at timestamptz not null default now(), recorded_by uuid default auth.uid(),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(), updated_by uuid);
create index if not exists dispatch_stock_movements_onhand_idx on public.dispatch_stock_movements (company, hub, product, container, item);
create index if not exists dispatch_stock_movements_event_idx on public.dispatch_stock_movements (asset_event_id);
-- one draw-down per fill event (a retried event can never write a second row)
create unique index if not exists dispatch_stock_movements_event_uq on public.dispatch_stock_movements (asset_event_id) where asset_event_id is not null;

-- ---------- stock settings (3B reads and writes; minimums and alerts per hub × product/container/item) ----------
create table if not exists public.dispatch_stock_settings (
  id uuid primary key default gen_random_uuid(),
  company text not null references public.companies(id),
  hub text not null,
  product text not null default '', container text not null default '', item text not null default '',
  min_qty numeric not null default 0,
  unit text not null default 'count' check (unit in ('count','lb')),
  alert boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(), updated_by uuid,
  unique (company, hub, product, container, item));

-- ---------- helpers (security definer; called only from the guard functions below) ----------
-- A place of a kind exists in the company: a hub code, a site_key, a vendor id.
create or replace function public.dispatch_asset_place_ok(c text, k text, i text) returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(case k
    when 'hub'    then exists (select 1 from public.dispatch_hubs h where h.company = c and h.code = i)
    when 'site'   then exists (select 1 from public.dispatch_sites s where s.company = c and s.site_key = i)
    when 'vendor' then exists (select 1 from public.dispatch_vendors v where v.company = c and v.id::text = i)
    else false end, false) $$;
-- The caller's own stop places: their hub, or the site of an order in their hub dated within a day of today in Pacific time (the
-- order's site is data.siteKey). The ±1 day window covers late-evening and early-morning stops on either side of the UTC date and
-- offline queues sent the next morning.
create or replace function public.dispatch_driver_stop_ok(c text, k text, i text) returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(case k
    when 'hub'  then i = public.dispatch_hub_in(c)
    when 'site' then exists (select 1 from public.dispatch_orders o where o.company = c and o.hub = public.dispatch_hub_in(c)
                               and o.date between (now() at time zone 'America/Los_Angeles')::date - 1 and (now() at time zone 'America/Los_Angeles')::date + 1
                               and o.data->>'siteKey' = i)
    else false end, false) $$;
-- The driver read rule (dasset_read, devent_read): a driver of the asset's company, and the asset is at their hub, at one of today's
-- stop sites in their hub, or they recorded an event on it today (today = the Pacific date, as in the stop window).
create or replace function public.dispatch_driver_can_see_asset(a_id uuid) returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select public.dispatch_role_in(a.company) = 'driver' and (
      (a.location_kind in ('hub','site') and public.dispatch_driver_stop_ok(a.company, a.location_kind, a.location_id))
      or exists (select 1 from public.dispatch_asset_events e where e.asset_id = a.id and e.recorded_by = auth.uid()
                  and (e.occurred_at at time zone 'America/Los_Angeles')::date >= (now() at time zone 'America/Los_Angeles')::date))
    from public.dispatch_assets a where a.id = a_id), false) $$;

-- ---------- triggers ----------
create or replace function public.dispatch_assets_normalize() returns trigger language plpgsql security definer set search_path = public as $fn$
begin
  new.serial := regexp_replace(upper(btrim(coalesce(new.serial, ''))), '[\s-]', '', 'g');   -- one rule everywhere: the server's normSerial too
  if new.serial = '' then raise exception 'serial is required'; end if;
  return new;
end $fn$;
-- Places and owners must exist in the row's company. Location, fill and last-seen change only inside dispatch_asset_apply_event
-- (flag dispatch.apply_event); owner only inside dispatch_asset_correct (flag dispatch.asset_correct). Both flags are
-- transaction-local and cleared after the one write. A driver (without manage_assets) adds only an in-service container owned by
-- the company or by the stop's customer, at their hub or one of today's stop sites. created_by is always the caller; a new row has
-- no last-seen until an event gives it one.
create or replace function public.dispatch_assets_guard() returns trigger language plpgsql security definer set search_path = public as $fn$
declare drv boolean := coalesce(public.dispatch_role_in(new.company) = 'driver' and not public.dispatch_perm_in(new.company, 'manage_assets'), false);
begin
  if tg_op = 'UPDATE' then
    if coalesce(current_setting('dispatch.apply_event', true), '') <> '1'
       and (new.location_kind, new.location_id, new.fill_state, new.last_seen_at, new.last_seen_by)
           is distinct from (old.location_kind, old.location_id, old.fill_state, old.last_seen_at, old.last_seen_by) then
      raise exception 'location and fill change only through events'; end if;
    if coalesce(current_setting('dispatch.asset_correct', true), '') <> '1'
       and (new.owner_kind, new.owner_id) is distinct from (old.owner_kind, old.owner_id) then
      raise exception 'owner changes only through dispatch_asset_correct'; end if;
  end if;
  if tg_op = 'INSERT' or (new.location_kind, new.location_id) is distinct from (old.location_kind, old.location_id) then
    if not public.dispatch_asset_place_ok(new.company, new.location_kind, new.location_id) then raise exception 'location not found in this company'; end if;
  end if;
  if tg_op = 'INSERT' or (new.owner_kind, new.owner_id) is distinct from (old.owner_kind, old.owner_id) then
    if not coalesce(case new.owner_kind
        when 'adchem'   then new.owner_id = ''
        when 'vendor'   then exists (select 1 from public.dispatch_vendors v where v.company = new.company and v.id::text = new.owner_id)
        when 'customer' then exists (select 1 from public.dispatch_customers x where x.company = new.company and x.id::text = new.owner_id)
        else false end, false) then
      raise exception 'owner not found in this company'; end if;
  end if;
  if new.container_type_id is not null and (tg_op = 'INSERT' or new.container_type_id is distinct from old.container_type_id) then
    if not exists (select 1 from public.dispatch_container_types t where t.id = new.container_type_id and t.company = new.company) then
      raise exception 'container type not found in this company'; end if;
  end if;
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    if coalesce(current_setting('dispatch.apply_event', true), '') <> '1' then new.last_seen_at := null; new.last_seen_by := null; end if;
  end if;
  if tg_op = 'INSERT' and drv then
    if not (new.condition = 'in_service' and new.location_kind in ('hub','site')
            and public.dispatch_driver_stop_ok(new.company, new.location_kind, new.location_id)
            and (new.owner_kind = 'adchem'
                 or (new.owner_kind = 'customer' and new.location_kind = 'site'
                     and exists (select 1 from public.dispatch_sites s where s.company = new.company and s.site_key = new.location_id and s.customer_id::text = new.owner_id)))) then
      raise exception 'a driver adds only an in-service container owned by AdChem or the stop''s customer, at their hub or stop'; end if;
  end if;
  return new;
end $fn$;
-- An event belongs to an asset of its company; each movement type names where it goes; occurred_at is the phone's time when within
-- the last 30 days and not after now, else now; recorded_by is always the caller. A driver (without manage_assets) records only the
-- five driver types, and the place an event goes to (to) is their hub or one of their stop sites. from is never checked for a
-- driver: it records where the register last had the asset (a sighted correction can carry another customer's site).
create or replace function public.dispatch_asset_events_guard() returns trigger language plpgsql security definer set search_path = public as $fn$
declare c text; drv boolean := coalesce(public.dispatch_role_in(new.company) = 'driver' and not public.dispatch_perm_in(new.company, 'manage_assets'), false);
begin
  select a.company into c from public.dispatch_assets a where a.id = new.asset_id;
  if c is distinct from new.company then raise exception 'asset not found in this company'; end if;
  if (new.from_kind is null) <> (new.from_id is null) or (new.to_kind is null) <> (new.to_id is null) then
    raise exception 'from and to each need a kind and an id'; end if;
  if new.event_type = 'delivered' and new.to_kind is distinct from 'site' then raise exception 'delivered goes to a site'; end if;
  if new.event_type in ('collected','from_vendor') and new.to_kind is distinct from 'hub' then raise exception '% goes to a hub', new.event_type; end if;
  if new.event_type = 'to_vendor' and new.to_kind is distinct from 'vendor' then raise exception 'to_vendor goes to a vendor'; end if;
  if new.event_type = 'moved' and new.to_kind is null then raise exception 'moved needs a place to go to'; end if;
  if new.photo_path is not null and new.photo_path not like new.company || '/asset/%' then raise exception 'an asset photo must be filed under asset/'; end if;
  new.occurred_at := case when new.occurred_at >= now() - interval '30 days' then least(new.occurred_at, now()) else now() end;
  new.recorded_by := auth.uid(); new.created_by := auth.uid();
  if drv then
    if new.event_type not in ('delivered','collected','sighted','loaded','created') then raise exception 'a driver cannot record %', new.event_type; end if;
    if new.to_kind is not null and not public.dispatch_driver_stop_ok(new.company, new.to_kind, new.to_id) then
      raise exception 'not your stop'; end if;
  end if;
  return new;
end $fn$;
-- After an event: the asset's place, fill and last-seen follow it (through the apply flag); owner never changes here. A hub fill of
-- a type with a nominal weight draws that many pounds of the product down at the hub; otherwise no stock row (the server warns).
-- An event older than the asset's last sighting (an offline queue sent late) stays as history but does not move the asset or
-- change its fill — the newer event already describes it; a corrected event always applies. A late fill still draws the bulk down.
create or replace function public.dispatch_asset_apply_event() returns trigger language plpgsql security definer set search_path = public as $fn$
declare a public.dispatch_assets%rowtype; lb numeric; prod text; lk text; li text; fs text;
begin
  select * into a from public.dispatch_assets where id = new.asset_id for update;
  lk := a.location_kind; li := a.location_id; fs := a.fill_state;
  case new.event_type
    when 'delivered'   then lk := new.to_kind; li := new.to_id; fs := coalesce(new.fill_after, 'full');
    when 'collected'   then lk := new.to_kind; li := new.to_id; fs := coalesce(new.fill_after, 'empty');
    when 'to_vendor'   then lk := new.to_kind; li := new.to_id;
    when 'from_vendor' then lk := new.to_kind; li := new.to_id; fs := coalesce(new.fill_after, 'full');
    when 'filled' then
      fs := 'full';
      if a.location_kind = 'hub' then
        select t.fill_lb, t.product into lb, prod from public.dispatch_container_types t where t.id = a.container_type_id;
        if lb is not null then
          insert into public.dispatch_stock_movements (company, hub, product, container, item, qty, unit, reason, asset_event_id, occurred_at, recorded_by, created_by)
          values (a.company, a.location_id, prod, '', '', -lb, 'lb', 'filled', new.id, new.occurred_at, new.recorded_by, new.recorded_by);
        end if;
      end if;
    when 'moved' then lk := new.to_kind; li := new.to_id;
    when 'sighted', 'corrected' then
      if new.to_kind is not null then lk := new.to_kind; li := new.to_id; end if;
      if new.event_type = 'corrected' then fs := coalesce(new.fill_after, fs); end if;
    else null;   -- loaded, created: last seen only
  end case;
  if new.event_type <> 'corrected' and new.occurred_at < a.last_seen_at then return null; end if;
  perform set_config('dispatch.apply_event', '1', true);
  update public.dispatch_assets set location_kind = lk, location_id = li, fill_state = fs,
         last_seen_at = new.occurred_at, last_seen_by = new.recorded_by, updated_at = now(), updated_by = new.recorded_by
   where id = a.id;
  perform set_config('dispatch.apply_event', '', true);
  return null;
end $fn$;

-- BEFORE triggers fire by name: guard, keep company, normalize.
create or replace trigger dispatch_vendors_keep_company before update on public.dispatch_vendors for each row execute function public.dispatch_keep_company();
create or replace trigger dispatch_vendors_audit after insert or update or delete on public.dispatch_vendors for each row execute function public.dispatch_audit();
create or replace trigger dispatch_container_types_keep_company before update on public.dispatch_container_types for each row execute function public.dispatch_keep_company();
create or replace trigger dispatch_container_types_audit after insert or update or delete on public.dispatch_container_types for each row execute function public.dispatch_audit();
create or replace trigger dispatch_assets_guard before insert or update on public.dispatch_assets for each row execute function public.dispatch_assets_guard();
create or replace trigger dispatch_assets_keep_company before update on public.dispatch_assets for each row execute function public.dispatch_keep_company();
create or replace trigger dispatch_assets_normalize before insert or update on public.dispatch_assets for each row execute function public.dispatch_assets_normalize();
create or replace trigger dispatch_assets_audit after insert or update or delete on public.dispatch_assets for each row execute function public.dispatch_audit();
create or replace trigger dispatch_asset_events_guard before insert on public.dispatch_asset_events for each row execute function public.dispatch_asset_events_guard();
create or replace trigger dispatch_asset_events_keep_company before update on public.dispatch_asset_events for each row execute function public.dispatch_keep_company();
create or replace trigger dispatch_asset_events_audit after insert or update or delete on public.dispatch_asset_events for each row execute function public.dispatch_audit();
create or replace trigger dispatch_asset_events_apply after insert on public.dispatch_asset_events for each row execute function public.dispatch_asset_apply_event();
create or replace trigger dispatch_stock_movements_keep_company before update on public.dispatch_stock_movements for each row execute function public.dispatch_keep_company();
create or replace trigger dispatch_stock_movements_audit after insert or update or delete on public.dispatch_stock_movements for each row execute function public.dispatch_audit();
create or replace trigger dispatch_stock_settings_keep_company before update on public.dispatch_stock_settings for each row execute function public.dispatch_keep_company();
create or replace trigger dispatch_stock_settings_audit after insert or update or delete on public.dispatch_stock_settings for each row execute function public.dispatch_audit();

-- ---------- RPC: find an asset by serial (any active member), wherever it is ----------
-- A driver scanning a container the register has at another customer cannot read that row (dasset_read), so the server looks it up
-- here: place, fill, owner and type only (no notes, tag or history). The serial is normalised as dispatch_assets_normalize stores it.
create or replace function public.dispatch_asset_by_serial(p_company text, p_serial text)
returns table (id uuid, serial text, container_type_id uuid, fill_state text, location_kind text, location_id text, owner_kind text, owner_id text)
language plpgsql stable security definer set search_path = public as $fn$
begin
  if public.dispatch_role_in(p_company) is null then raise exception 'not allowed'; end if;
  return query select a.id, a.serial, a.container_type_id, a.fill_state, a.location_kind, a.location_id, a.owner_kind, a.owner_id
    from public.dispatch_assets a where a.company = p_company and a.serial = regexp_replace(upper(btrim(coalesce(p_serial, ''))), '[\s-]', '', 'g');
end $fn$;

-- ---------- RPC: owner, condition and detail corrections (manage_assets), logged as a corrected event and by dispatch_audit ----------
-- The update's dispatch_log 'change' row (dispatch_audit) carries the from/to of every changed field. Setting owner_kind to adchem
-- without an owner_id clears it.
create or replace function public.dispatch_asset_correct(p_id uuid, p_fields jsonb) returns void language plpgsql security definer set search_path = public as $fn$
declare a public.dispatch_assets%rowtype; f jsonb := coalesce(p_fields, '{}'::jsonb);
begin
  select * into a from public.dispatch_assets where id = p_id;
  if not found then raise exception 'not allowed'; end if;       -- no existence oracle for other companies' ids
  if not public.dispatch_perm_in(a.company, 'manage_assets') then raise exception 'not allowed'; end if;
  if jsonb_typeof(f) <> 'object' then raise exception 'fields must be an object'; end if;
  perform set_config('dispatch.asset_correct', '1', true);
  update public.dispatch_assets set
    owner_kind = case when f ? 'owner_kind' then f->>'owner_kind' else owner_kind end,
    owner_id   = case when f ? 'owner_id' then coalesce(f->>'owner_id', '') when f->>'owner_kind' = 'adchem' then '' else owner_id end,
    condition  = case when f ? 'condition' then f->>'condition' else condition end,
    notes      = case when f ? 'notes' then coalesce(f->>'notes', '') else notes end,
    tag        = case when f ? 'tag' then coalesce(f->>'tag', '') else tag end,
    hydro_due  = case when f ? 'hydro_due' then nullif(f->>'hydro_due', '')::date else hydro_due end,
    acquired_on = case when f ? 'acquired_on' then nullif(f->>'acquired_on', '')::date else acquired_on end,
    container_type_id = case when f ? 'container_type_id' then nullif(f->>'container_type_id', '')::uuid else container_type_id end,
    updated_at = now(), updated_by = auth.uid()
  where id = p_id;
  perform set_config('dispatch.asset_correct', '', true);
  insert into public.dispatch_asset_events (company, asset_id, event_type, note) values (a.company, p_id, 'corrected', 'owner/condition corrected');
end $fn$;

-- ---------- counts: grouped, no serials ----------
-- hub is location_id when the asset is at a hub (the Counts grid's columns), else null.
create or replace view public.dispatch_asset_counts with (security_invoker = true) as
select a.company, a.container_type_id, t.product, t.size_label, a.fill_state, a.location_kind, a.condition,
  case when a.location_kind = 'hub' then a.location_id end as hub, count(*)::int as n
from public.dispatch_assets a
left join public.dispatch_container_types t on t.id = a.container_type_id and t.company = a.company
group by a.company, a.container_type_id, t.product, t.size_label, a.fill_state, a.location_kind, a.condition, case when a.location_kind = 'hub' then a.location_id end;
revoke all on public.dispatch_asset_counts from anon;
-- The same rows for editors (and view_assets holders) of c, through the owner, so coordinators without view_assets see counts.
create or replace function public.dispatch_asset_counts_for(c text)
returns table (company text, container_type_id uuid, product text, size_label text, fill_state text, location_kind text, condition text, hub text, n int)
language sql stable security definer set search_path = public as $fn$
  select v.company, v.container_type_id, v.product, v.size_label, v.fill_state, v.location_kind, v.condition, v.hub, v.n
    from public.dispatch_asset_counts v
   where v.company = c and (public.dispatch_can_edit_in(c) or public.dispatch_perm_in(c, 'view_assets')) $fn$;

-- ---------- execute: RPCs to authenticated; helpers and trigger functions to no one ----------
-- dispatch_driver_can_see_asset is called by dasset_read / devent_read, and a policy expression runs with the caller's privileges
-- (not the table owner's), so authenticated needs execute on it — revoked, every driver read fails with "permission denied for
-- function" (seen in the rolled-back run). It answers only "may I, the caller, see this asset id", like dispatch_perm_in.
grant execute on function public.dispatch_asset_correct(uuid,jsonb), public.dispatch_asset_counts_for(text), public.dispatch_driver_can_see_asset(uuid),
  public.dispatch_asset_by_serial(text,text) to authenticated;
revoke execute on function public.dispatch_asset_correct(uuid,jsonb), public.dispatch_asset_counts_for(text), public.dispatch_driver_can_see_asset(uuid),
  public.dispatch_asset_by_serial(text,text) from anon, public;
revoke execute on function public.dispatch_asset_place_ok(text,text,text), public.dispatch_driver_stop_ok(text,text,text),
  public.dispatch_assets_normalize(), public.dispatch_assets_guard(),
  public.dispatch_asset_events_guard(), public.dispatch_asset_apply_event()
  from anon, authenticated, public;

-- ---------- row-level security ----------
alter table public.dispatch_vendors enable row level security;          revoke all on public.dispatch_vendors from anon;
alter table public.dispatch_container_types enable row level security;  revoke all on public.dispatch_container_types from anon;
alter table public.dispatch_assets enable row level security;           revoke all on public.dispatch_assets from anon;
alter table public.dispatch_asset_events enable row level security;     revoke all on public.dispatch_asset_events from anon;
alter table public.dispatch_stock_movements enable row level security;  revoke all on public.dispatch_stock_movements from anon;
alter table public.dispatch_stock_settings enable row level security;   revoke all on public.dispatch_stock_settings from anon;
do $$ begin
  -- Register: view_assets, or a driver by the rule in dispatch_driver_can_see_asset. Insert: manage_assets or a driver (the guard
  -- narrows a driver's row). Update and delete: manage_assets (the guard keeps place, fill and owner out of a direct update).
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'dispatch_assets' and policyname = 'dasset_read') then
    create policy dasset_read on public.dispatch_assets for select using (public.dispatch_perm_in(company, 'view_assets')
      or (public.dispatch_role_in(company) = 'driver' and public.dispatch_driver_can_see_asset(id)));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'dispatch_assets' and policyname = 'dasset_insert') then
    create policy dasset_insert on public.dispatch_assets for insert with check (public.dispatch_perm_in(company, 'manage_assets') or public.dispatch_role_in(company) = 'driver');
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'dispatch_assets' and policyname = 'dasset_update') then
    create policy dasset_update on public.dispatch_assets for update using (public.dispatch_perm_in(company, 'manage_assets')) with check (public.dispatch_perm_in(company, 'manage_assets'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'dispatch_assets' and policyname = 'dasset_delete') then
    create policy dasset_delete on public.dispatch_assets for delete using (public.dispatch_perm_in(company, 'manage_assets'));
  end if;
  -- Events: read mirrors the register; insert by manage_assets (every type) or a driver (the guard: five types, own stops).
  -- No update or delete policy: corrections are new corrected events.
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'dispatch_asset_events' and policyname = 'devent_read') then
    create policy devent_read on public.dispatch_asset_events for select using (public.dispatch_perm_in(company, 'view_assets')
      or (public.dispatch_role_in(company) = 'driver' and public.dispatch_driver_can_see_asset(asset_id)));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'dispatch_asset_events' and policyname = 'devent_insert') then
    create policy devent_insert on public.dispatch_asset_events for insert with check (public.dispatch_perm_in(company, 'manage_assets') or public.dispatch_role_in(company) = 'driver');
  end if;
  -- Vendors and container types: any member reads (a driver names where a container went); manage_assets writes.
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'dispatch_vendors' and policyname = 'dvendor_read') then
    create policy dvendor_read on public.dispatch_vendors for select using (public.dispatch_role_in(company) is not null);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'dispatch_vendors' and policyname = 'dvendor_write') then
    create policy dvendor_write on public.dispatch_vendors for all using (public.dispatch_perm_in(company, 'manage_assets')) with check (public.dispatch_perm_in(company, 'manage_assets'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'dispatch_container_types' and policyname = 'dctype_read') then
    create policy dctype_read on public.dispatch_container_types for select using (public.dispatch_role_in(company) is not null);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'dispatch_container_types' and policyname = 'dctype_write') then
    create policy dctype_write on public.dispatch_container_types for all using (public.dispatch_perm_in(company, 'manage_assets')) with check (public.dispatch_perm_in(company, 'manage_assets'));
  end if;
  -- Stock movements: view_assets reads; manage_assets inserts anything but a fill. Fill rows come only from dispatch_asset_apply_event,
  -- a security definer owned by the tables' owner, and RLS does not apply to the table owner (no FORCE), as in 006. Append-only.
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'dispatch_stock_movements' and policyname = 'dstock_read') then
    create policy dstock_read on public.dispatch_stock_movements for select using (public.dispatch_perm_in(company, 'view_assets'));
  end if;
  -- Stock settings (minimums, alerts): view_assets reads; manage_assets writes.
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'dispatch_stock_settings' and policyname = 'dstockset_read') then
    create policy dstockset_read on public.dispatch_stock_settings for select using (public.dispatch_perm_in(company, 'view_assets'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'dispatch_stock_settings' and policyname = 'dstockset_write') then
    create policy dstockset_write on public.dispatch_stock_settings for all using (public.dispatch_perm_in(company, 'manage_assets')) with check (public.dispatch_perm_in(company, 'manage_assets'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'dispatch_stock_movements' and policyname = 'dstock_insert') then
    create policy dstock_insert on public.dispatch_stock_movements for insert with check (public.dispatch_perm_in(company, 'manage_assets') and reason <> 'filled');
  end if;
  -- Files: {company}/asset/<event_id>.jpg (never moved). Insert by a driver or manage_assets of
  -- that company; read by view_assets or the member who uploaded it; delete by manage_assets; no update.
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'dispatch assets read') then
    create policy "dispatch assets read" on storage.objects for select using (bucket_id = 'dispatch-docs' and (storage.foldername(name))[2] = 'asset'
      and (public.dispatch_perm_in((storage.foldername(name))[1], 'view_assets')
           or (owner_id = (select auth.uid())::text and public.dispatch_role_in((storage.foldername(name))[1]) is not null)));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'dispatch assets write') then
    create policy "dispatch assets write" on storage.objects for insert with check (bucket_id = 'dispatch-docs' and (storage.foldername(name))[2] = 'asset'
      and (public.dispatch_role_in((storage.foldername(name))[1]) = 'driver' or public.dispatch_perm_in((storage.foldername(name))[1], 'manage_assets')));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'dispatch assets delete') then
    create policy "dispatch assets delete" on storage.objects for delete using (bucket_id = 'dispatch-docs' and (storage.foldername(name))[2] = 'asset'
      and public.dispatch_perm_in((storage.foldername(name))[1], 'manage_assets'));
  end if;
end $$;
-- dispatch_log: editors read change rows, but an asset's, event's or stock movement's (serials, places) only with view_assets,
-- as documents need view_documents since 006. dl_editor_read exists since 005, so it is altered in place (re-runnable).
alter policy dl_editor_read on public.dispatch_log using (public.dispatch_can_edit_in(company) and table_name is not null and what = 'change'
  and (table_name <> 'dispatch_documents' or public.dispatch_perm_in(company, 'view_documents'))
  and (table_name not in ('dispatch_assets','dispatch_asset_events','dispatch_stock_movements','dispatch_stock_settings') or public.dispatch_perm_in(company, 'view_assets')));
-- 006's document storage policies are permissive and OR with the asset ones, so without this a view_documents holder would read,
-- and a manage_documents holder delete, {company}/asset/ photos. Both are re-stated with asset/ excluded (altered in place, re-runnable).
-- "dispatch docs write" needs no change: it only admits document/ and capture/ paths.
alter policy "dispatch docs read" on storage.objects using (bucket_id = 'dispatch-docs' and (storage.foldername(name))[2] is distinct from 'asset'
  and (public.dispatch_perm_in((storage.foldername(name))[1], 'view_documents')
       or ((storage.foldername(name))[2] = 'document' and (storage.foldername(name))[3] = 'person' and (storage.foldername(name))[4] = (select auth.uid())::text
           and public.dispatch_role_in((storage.foldername(name))[1]) is not null)));
alter policy "dispatch docs delete" on storage.objects using (bucket_id = 'dispatch-docs' and (storage.foldername(name))[2] is distinct from 'asset'
  and public.dispatch_perm_in((storage.foldername(name))[1], 'manage_documents'));

-- ---------- seed: the order form's gas containers for adchem, only where (company, product, size_label) is absent ----------
do $$ begin
  insert into public.dispatch_container_types (company, kind, size_label, product, fill_lb)
  select 'adchem',
         case when v.label like '%Cylinder' then 'cylinder' when v.label like '%Dewar' then 'dewar' when v.label like '%Pig' then 'pig' end,
         v.label, v.product,
         case when v.label ~ '^\d+(\.\d+)?lb ' then substring(v.label from '^(\d+(?:\.\d+)?)lb ')::numeric end
    from (values ('Carbon Dioxide','20lb Cylinder'), ('Carbon Dioxide','50lb Cylinder'), ('Carbon Dioxide','100lb Cylinder'),
                 ('Carbon Dioxide','230L Dewar'), ('Carbon Dioxide','260L Dewar'),
                 ('Nitrogen','200cu ft Cylinder'), ('Nitrogen','300cu ft Cylinder'), ('Nitrogen','260L Dewar'),
                 ('Butane','120lb Cylinder'), ('Butane','500lb Pig'),
                 ('Propane','100lb Cylinder'), ('Propane','400lb Pig'),
                 ('Isobutane','116lb Cylinder'), ('Isobutane','480lb Pig'),
                 ('Blended (Dual Blend)','114lb Cylinder'), ('Blended (Dual Blend)','450lb Pig'),
                 ('Blended (Tri Blend)','100lb Cylinder')) v(product, label)
   where exists (select 1 from public.companies co where co.id = 'adchem')
     and not exists (select 1 from public.dispatch_container_types t where t.company = 'adchem' and t.product = v.product and t.size_label = v.label);
end $$;

-- Applied: pending — verified 10/23/26 on project adchem-hours as one rolled-back batch through the Supabase MCP (begin; 007; 007;
-- supabase/tests/007_policies.sql; rollback), which ended with "VERIFY-OK 007: types=17 driver_sees=4 events=12 stock_rows=1
-- coordinator_count_rows=9" (fix round 2); nothing persisted. apply_migration only on the user's word.
