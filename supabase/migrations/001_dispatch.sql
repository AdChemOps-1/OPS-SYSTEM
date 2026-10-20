-- AdChem Dispatch — schema as applied to the AdChem operations database (Supabase project adchem-hours) on 10/9/26.
-- Record only: these objects already exist. Dispatch objects are prefixed dispatch_ so they sit beside AdChem Time.

create table if not exists public.dispatch_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null, name text not null default '',
  role text not null default 'driver' check (role in ('admin','coordinator','driver')),
  hub text not null default '', active boolean not null default true, created_at timestamptz not null default now());
create table if not exists public.dispatch_invites (
  email text primary key, name text not null default '',
  role text not null default 'driver' check (role in ('admin','coordinator','driver')),
  hub text not null default '', invited_by uuid references auth.users(id),
  invited_at timestamptz not null default now(), accepted_at timestamptz, revoked_at timestamptz);
create table if not exists public.dispatch_hubs (
  code text primary key, name text not null, street text not null default '', city text not null default '',
  state text not null default '', zip text not null default '', phone text not null default '', emerg text not null default '',
  settled boolean not null default false, sort int not null default 0);
create table if not exists public.dispatch_settings (
  id int primary key default 1 check (id = 1), data jsonb not null default '{}'::jsonb, updated_at timestamptz not null default now());
create table if not exists public.dispatch_sites (
  site_key text primary key, customer text not null, code_raw text not null default '', code text,
  addr text not null default '', unconfirmed boolean not null default false, city text not null default '', hub text not null default '',
  contact text not null default '', phone text not null default '', gate text not null default '', hours text not null default '',
  instr text not null default '', site_label text not null default 'Primary', copy_to text not null default '', synced_at timestamptz not null default now());
create index if not exists dispatch_sites_customer_idx on public.dispatch_sites (lower(customer));
create table if not exists public.dispatch_orders (
  id text primary key, bol_no int unique, hub text not null default '', date date not null, status text not null default 'Intake',
  customer text not null default '', data jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create index if not exists dispatch_orders_date_idx on public.dispatch_orders (date, hub);
create table if not exists public.dispatch_pods (
  id uuid primary key default gen_random_uuid(), order_id text not null references public.dispatch_orders(id) on delete cascade,
  photo_path text not null, sent_to text not null default '', sent_cc text not null default '', driver text not null default '',
  msg_id text not null default '', sent_by uuid references auth.users(id), sent_at timestamptz not null default now());
create table if not exists public.dispatch_log (
  id bigserial primary key, at timestamptz not null default now(), who uuid, what text not null, detail jsonb not null default '{}'::jsonb);

-- Role helpers (security definer; executable by authenticated only)
create or replace function public.dispatch_role() returns text language sql stable security definer set search_path = public as $$
  select role from public.dispatch_users where user_id = auth.uid() and active $$;
create or replace function public.dispatch_hub() returns text language sql stable security definer set search_path = public as $$
  select hub from public.dispatch_users where user_id = auth.uid() and active $$;
create or replace function public.dispatch_is_admin() returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.dispatch_role() = 'admin', false) $$;
create or replace function public.dispatch_can_edit() returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.dispatch_role() in ('admin','coordinator'), false) $$;

-- One BOL number per scheduled order, never reused (nextBol lives in dispatch_settings.data)
create or replace function public.dispatch_next_bol(p_order_id text) returns int language plpgsql security definer set search_path = public as $fn$
declare n int; existing int;
begin
  if not public.dispatch_can_edit() then raise exception 'not allowed'; end if;
  select bol_no into existing from public.dispatch_orders where id = p_order_id;
  if existing is not null then return existing; end if;
  update public.dispatch_settings set data = jsonb_set(data, '{nextBol}', to_jsonb(coalesce((data->>'nextBol')::int,0) + 1)), updated_at = now()
    where id = 1 and coalesce((data->>'nextBol')::int,0) > 0 returning coalesce((data->>'nextBol')::int,0) - 1 into n;
  if n is null or n <= 0 then return null; end if;
  update public.dispatch_orders set bol_no = n, updated_at = now() where id = p_order_id;
  return n;
end $fn$;

-- Admin: grant by email (existing account → role now; new address → invite) and revoke
create or replace function public.dispatch_grant(p_email text, p_name text, p_role text, p_hub text) returns text language plpgsql security definer set search_path = public as $fn$
declare uid uuid;
begin
  if not public.dispatch_is_admin() then raise exception 'not allowed'; end if;
  if p_role not in ('admin','coordinator','driver') then raise exception 'bad role'; end if;
  select id into uid from auth.users where lower(email) = lower(p_email);
  if uid is not null then
    insert into public.dispatch_users (user_id, email, name, role, hub, active) values (uid, lower(p_email), coalesce(p_name,''), p_role, coalesce(p_hub,''), true)
      on conflict (user_id) do update set role = excluded.role, hub = excluded.hub, active = true,
        name = case when excluded.name <> '' then excluded.name else public.dispatch_users.name end;
    insert into public.dispatch_log (who, what, detail) values (auth.uid(), 'grant', jsonb_build_object('email', lower(p_email), 'role', p_role, 'hub', p_hub));
    return 'granted';
  end if;
  insert into public.dispatch_invites (email, name, role, hub, invited_by) values (lower(p_email), coalesce(p_name,''), p_role, coalesce(p_hub,''), auth.uid())
    on conflict (email) do update set name = excluded.name, role = excluded.role, hub = excluded.hub, invited_by = excluded.invited_by, invited_at = now(), accepted_at = null, revoked_at = null;
  insert into public.dispatch_log (who, what, detail) values (auth.uid(), 'invite', jsonb_build_object('email', lower(p_email), 'role', p_role, 'hub', p_hub));
  return 'invited';
end $fn$;
create or replace function public.dispatch_revoke(p_email text) returns void language plpgsql security definer set search_path = public as $fn$
begin
  if not public.dispatch_is_admin() then raise exception 'not allowed'; end if;
  if lower(p_email) = (select lower(email) from public.dispatch_users where user_id = auth.uid()) then raise exception 'you cannot remove your own access'; end if;
  update public.dispatch_users set active = false where lower(email) = lower(p_email);
  update public.dispatch_invites set revoked_at = now() where lower(email) = lower(p_email);
  insert into public.dispatch_log (who, what, detail) values (auth.uid(), 'revoke', jsonb_build_object('email', lower(p_email)));
end $fn$;
grant execute on function public.dispatch_role(), public.dispatch_hub(), public.dispatch_is_admin(), public.dispatch_can_edit(), public.dispatch_next_bol(text), public.dispatch_grant(text,text,text,text), public.dispatch_revoke(text) to authenticated;
revoke execute on function public.dispatch_role(), public.dispatch_hub(), public.dispatch_is_admin(), public.dispatch_can_edit(), public.dispatch_next_bol(text), public.dispatch_grant(text,text,text,text), public.dispatch_revoke(text) from anon, public;

-- Sign-up trigger shared with AdChem Time (public.handle_new_user on auth.users): now also accepts a Dispatch invite.
-- A Dispatch-only invite creates a dispatch_users row and no Time profile. (Full body in the database.)

-- Row-level security
alter table public.dispatch_users enable row level security;  alter table public.dispatch_invites enable row level security;
alter table public.dispatch_hubs enable row level security;   alter table public.dispatch_settings enable row level security;
alter table public.dispatch_sites enable row level security;  alter table public.dispatch_orders enable row level security;
alter table public.dispatch_pods enable row level security;   alter table public.dispatch_log enable row level security;
create policy du_self_read on public.dispatch_users for select using (user_id = auth.uid() or public.dispatch_is_admin());
create policy du_admin_write on public.dispatch_users for update using (public.dispatch_is_admin()) with check (public.dispatch_is_admin());
create policy di_admin on public.dispatch_invites for all using (public.dispatch_is_admin()) with check (public.dispatch_is_admin());
create policy dh_read on public.dispatch_hubs for select using (public.dispatch_role() is not null);
create policy dh_write on public.dispatch_hubs for all using (public.dispatch_can_edit()) with check (public.dispatch_can_edit());
create policy ds_read on public.dispatch_settings for select using (public.dispatch_role() is not null);
create policy ds_write on public.dispatch_settings for all using (public.dispatch_can_edit()) with check (public.dispatch_can_edit());
create policy dsi_read on public.dispatch_sites for select using (public.dispatch_can_edit());
create policy dsi_write on public.dispatch_sites for all using (public.dispatch_can_edit()) with check (public.dispatch_can_edit());
create policy do_read on public.dispatch_orders for select using (public.dispatch_can_edit() or (public.dispatch_role() = 'driver' and (public.dispatch_hub() = '' or hub = public.dispatch_hub())));
create policy do_insert on public.dispatch_orders for insert with check (public.dispatch_can_edit());
create policy do_update on public.dispatch_orders for update using (public.dispatch_can_edit() or (public.dispatch_role() = 'driver' and (public.dispatch_hub() = '' or hub = public.dispatch_hub())))
  with check (public.dispatch_can_edit() or (public.dispatch_role() = 'driver' and (public.dispatch_hub() = '' or hub = public.dispatch_hub())));
create policy dp_read on public.dispatch_pods for select using (public.dispatch_role() is not null);
create policy dp_write on public.dispatch_pods for insert with check (public.dispatch_role() is not null);
create policy dl_admin_read on public.dispatch_log for select using (public.dispatch_is_admin());
create policy dl_insert on public.dispatch_log for insert with check (public.dispatch_role() is not null);

-- Seed: hubs, settings, existing admin; private photo bucket
insert into public.dispatch_hubs (code, name, street, city, state, zip, phone, emerg, settled, sort) values
  ('EB','East Bay — Richmond','525 De Carlo Ave','Richmond','CA','94801','(510) 725-7841','(800) 633-8253 — PERS', true, 1),
  ('LA','Southern California — Los Angeles','','','CA','','(510) 725-7841','(800) 633-8253 — PERS', false, 2),
  ('CO','Colorado — Denver','','','CO','','(510) 725-7841','(800) 633-8253 — PERS', false, 3) on conflict (code) do nothing;
insert into public.dispatch_settings (id, data) values (1, '{"tz":"America/Los_Angeles","sheetId":"1AGdkstR4Au2lQQubl1xXXojPE2lQVxzlhqT3wqER1HA"}'::jsonb) on conflict (id) do nothing;
insert into public.dispatch_users (user_id, email, name, role, hub, active) select p.user_id, p.email, p.name, 'admin', '', true from public.profiles p where p.is_admin on conflict (user_id) do nothing;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('dispatch-pods','dispatch-pods', false, 8388608, array['image/jpeg','image/png','image/webp']) on conflict (id) do nothing;
create policy "dispatch pods read" on storage.objects for select using (bucket_id = 'dispatch-pods' and public.dispatch_role() is not null);
create policy "dispatch pods write" on storage.objects for insert with check (bucket_id = 'dispatch-pods' and public.dispatch_role() is not null);

-- 10/9/26 — bank deposit slips photographed by drivers and emailed to accounting@adchem.pro
create table if not exists public.dispatch_deposits (
  id bigint generated always as identity primary key,
  hub text not null default '', driver text not null default '', amount numeric(12,2) not null default 0, note text not null default '',
  photo_path text not null, sent_to text not null, msg_id text not null default '', sent_by uuid references auth.users(id), sent_at timestamptz not null default now()
);
alter table public.dispatch_deposits enable row level security;
create policy dd_read on public.dispatch_deposits for select using (public.dispatch_can_edit() or (public.dispatch_role() = 'driver' and (public.dispatch_hub() = '' or hub = public.dispatch_hub())));
create policy dd_insert on public.dispatch_deposits for insert with check (public.dispatch_role() is not null and sent_by = auth.uid());
