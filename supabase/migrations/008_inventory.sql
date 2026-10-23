-- AdChem Ops — 008 inventory, as written 10/23/26 (Stage 3B of the assets and inventory spec, 2026-10-22-assets-and-inventory-design.md).
-- Reads what 007 created: dispatch_stock_movements (append-only, signed) and dispatch_stock_settings (minimums). Adds the on-hand view
-- (movements summed per key, plus full in-service gas containers at hubs counted from the register), dispatch_stock_onhand_for
-- (the same rows with the minimum, a below flag and the minimum's alert switch, for view_assets holders, editors and the cron's service role), the delivered
-- draw-down on dispatch_orders (counted lines leave stock when an order enters Delivered / POD Received and come back when it leaves
-- both), stock alert recipients in dispatch_company_settings.data (super admin, through dispatch_set_stock_alerts only), and the
-- stock insert policy now refusing delivered rows as well as filled ones. Re-runnable as is (create or replace, if not exists,
-- alter policy in place; nothing is dropped). Tested by supabase/tests/008_policies.sql (run inside begin … rollback, this file twice first).

-- ---------- on-hand: one row per (company, hub, product, container, item, unit) ----------
-- Movements are summed as they are (a negative bulk figure stays negative, never clamped). Gas containers have no movements of their
-- own: a full, in-service container at a hub counts 1 under its type's product and size_label. Both sources go through one outer
-- sum ... group by, so a key is one row even when a movement was written under a gas-container key (the server refuses such entries;
-- this keeps a stray one from doubling the row). Rows follow the caller's RLS on movements and assets (security_invoker), so only
-- view_assets holders read anything here; editors use dispatch_stock_onhand_for.
create or replace view public.dispatch_stock_onhand with (security_invoker = true) as
select u.company, u.hub, u.product, u.container, u.item, u.unit, sum(u.qty) as qty
  from (select m.company, m.hub, m.product, m.container, m.item, m.unit, m.qty
          from public.dispatch_stock_movements m
        union all
        select a.company, a.location_id as hub, t.product, t.size_label as container, ''::text as item, 'count'::text as unit, 1::numeric as qty
          from public.dispatch_assets a
          join public.dispatch_container_types t on t.id = a.container_type_id and t.company = a.company
         where a.fill_state = 'full' and a.location_kind = 'hub' and a.condition = 'in_service') u
 group by u.company, u.hub, u.product, u.container, u.item, u.unit;
revoke all on public.dispatch_stock_onhand from anon;

-- The view's rows of company c with the key's minimum (null when none is set), below = qty under the minimum, and alert = the
-- minimum's "Alert when below" switch (true where a minimum row exists and its alert is null, false where the key has no minimum
-- row: such a row is never below anyway), plus every minimum of c whose key has no on-hand row (qty 0, below when the minimum is
-- above 0, alert from the minimum). The daily stock email mails rows with below and alert both true; the screen flags every below
-- row. Through the owner, for view_assets holders and editors of c (a coordinator without switches sees on-hand, as with
-- dispatch_asset_counts_for), and for the service role (the daily stock email's cron path reads every company).
create or replace function public.dispatch_stock_onhand_for(c text)
returns table (company text, hub text, product text, container text, item text, unit text, qty numeric, min_qty numeric, below boolean, alert boolean)
language sql stable security definer set search_path = public as $fn$
  select v.company, v.hub, v.product, v.container, v.item, v.unit, v.qty, s.min_qty,
         coalesce(s.min_qty is not null and v.qty < s.min_qty, false) as below,
         case when s.id is null then false else coalesce(s.alert, true) end as alert
    from public.dispatch_stock_onhand v
    left join public.dispatch_stock_settings s
      on s.company = v.company and s.hub = v.hub and s.product = v.product and s.container = v.container and s.item = v.item
   where v.company = c
     and (current_setting('role', true) = 'service_role' or public.dispatch_perm_in(c, 'view_assets') or public.dispatch_can_edit_in(c))
  union all
  -- a minimum whose key has no on-hand row (nothing ever received or counted there) reads as qty 0, below while the minimum is above 0
  select s.company, s.hub, s.product, s.container, s.item, s.unit, 0::numeric, s.min_qty, s.min_qty > 0, coalesce(s.alert, true)
    from public.dispatch_stock_settings s
   where s.company = c
     and not exists (select 1 from public.dispatch_stock_onhand v where v.company = s.company and v.hub = s.hub and v.product = s.product
                       and v.container = s.container and v.item = s.item)
     and (current_setting('role', true) = 'service_role' or public.dispatch_perm_in(c, 'view_assets') or public.dispatch_can_edit_in(c)) $fn$;

-- ---------- the delivered draw-down ----------
-- Lookups by order for the net rule below.
create index if not exists dispatch_stock_movements_order_idx on public.dispatch_stock_movements (company, order_id) where order_id is not null;
-- Net rule (controller ruling, replacing a partial unique index): a key (product, container) is drawn for an order while the sum of
-- qty over the order's delivered rows and its 'undelivered <id>' adjusted rows for that key is non-zero. Entering Delivered /
-- POD Received from outside the pair writes a delivered row (the lines' qty for the key, summed, negated) only for keys not drawn;
-- leaving the pair writes a reversing adjusted row only for drawn keys, at the hub it was drawn from. So Delivered twice draws once,
-- Delivered → Scheduled → Delivered draws, reverses, draws again, and a second leave with nothing drawn writes nothing. Gas lines
-- (category Gases) never count here: the register's full containers do. A line with no product or a qty that is not a positive
-- number is skipped (a malformed line never blocks the order's save); an order with no hub draws nothing. Inserts run as the owner (security definer), so RLS and
-- dstock_insert do not apply; recorded_by is the member who changed the status (null under the service role).
create or replace function public.dispatch_orders_stock_out() returns trigger language plpgsql security definer set search_path = public as $fn$
declare pair text[] := array['Delivered','POD Received'];
begin
  if old.status is not distinct from new.status then return null; end if;
  if new.status = any(pair) and not (coalesce(old.status, '') = any(pair)) then
    if coalesce(new.hub, '') = '' then return null; end if;   -- no hub, no stock to draw from: nothing is written
    insert into public.dispatch_stock_movements (company, hub, product, container, item, qty, unit, reason, order_id, recorded_by, created_by, occurred_at)
    select new.company, new.hub, l.product, l.container, '', -l.qty, 'count', 'delivered', new.id, auth.uid(), auth.uid(), now()
      from (select btrim(coalesce(e->>'product', '')) as product, btrim(coalesce(e->>'container', '')) as container, sum(case when coalesce(e->>'qty', '') ~ '^\s*\d+(\.\d+)?\s*$' then (e->>'qty')::numeric end) as qty
              from jsonb_array_elements(case when jsonb_typeof(new.data->'lines') = 'array' then new.data->'lines' else '[]'::jsonb end) e
             where jsonb_typeof(e) = 'object' and coalesce(e->>'category', '') <> 'Gases'
               and btrim(coalesce(e->>'product', '')) <> '' and (case when coalesce(e->>'qty', '') ~ '^\s*\d+(\.\d+)?\s*$' then (e->>'qty')::numeric end) > 0
             group by 1, 2) l
     where coalesce((select sum(m.qty) from public.dispatch_stock_movements m
                      where m.company = new.company and m.order_id = new.id and m.product = l.product and m.container = l.container
                        and (m.reason = 'delivered' or (m.reason = 'adjusted' and m.note = 'undelivered ' || new.id))), 0) = 0;
  elsif old.status = any(pair) and not (new.status = any(pair)) then
    insert into public.dispatch_stock_movements (company, hub, product, container, item, qty, unit, reason, order_id, note, recorded_by, created_by, occurred_at)
    select new.company, d.hub, d.product, d.container, d.item, -d.qty, d.unit, 'adjusted', new.id, 'undelivered ' || new.id, auth.uid(), auth.uid(), now()
      from (select m.hub, m.product, m.container, m.item, m.unit, sum(m.qty) as qty from public.dispatch_stock_movements m
             where m.company = new.company and m.order_id = new.id
               and (m.reason = 'delivered' or (m.reason = 'adjusted' and m.note = 'undelivered ' || new.id))
             group by m.hub, m.product, m.container, m.item, m.unit) d
     where d.qty <> 0;
  end if;
  return null;
end $fn$;
create or replace trigger dispatch_orders_stock_out after update of status on public.dispatch_orders for each row execute function public.dispatch_orders_stock_out();

-- ---------- stock alert recipients ----------
-- Who receives the daily stock-below-minimum email: super admin only, written nowhere else (the warnings guard below protects it).
create or replace function public.dispatch_set_stock_alerts(p_company text, p_recipients text[]) returns void language plpgsql security definer set search_path = public as $fn$
declare was jsonb; r text[] := coalesce(p_recipients, '{}'::text[]);
begin
  if not public.dispatch_is_super_in(p_company) then raise exception 'not allowed'; end if;
  if exists (select 1 from unnest(r) e where e is null or e !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') then raise exception 'recipients must be email addresses'; end if;
  insert into public.dispatch_company_settings (company) values (p_company) on conflict (company) do nothing;
  select data into was from public.dispatch_company_settings where company = p_company for update;
  perform set_config('dispatch.set_warnings', '1', true);    -- lets dispatch_settings_warnings_guard pass this one write
  update public.dispatch_company_settings set data = jsonb_set(data, '{stockAlertRecipients}', to_jsonb(r)), updated_at = now() where company = p_company;
  perform set_config('dispatch.set_warnings', '', true);
  insert into public.dispatch_log (company, who, what, detail, table_name, row_id, changes) values (p_company, auth.uid(), 'warnings', '{}'::jsonb,
    'dispatch_company_settings', p_company, jsonb_build_object(
      'stockAlertRecipients', jsonb_build_object('from', was->'stockAlertRecipients', 'to', to_jsonb(r))));
end $fn$;
-- 006's guard, re-stated with stockAlertRecipients among the protected keys (dispatch_set_warnings writes only its own three keys
-- with jsonb_set, so it carries stockAlertRecipients through unchanged).
create or replace function public.dispatch_settings_warnings_guard() returns trigger language plpgsql security definer set search_path = public as $fn$
declare k text;
begin
  if coalesce(current_setting('dispatch.set_warnings', true), '') = '1' then return new; end if;
  if tg_op = 'INSERT' then
    if exists (select 1 from public.dispatch_company_settings s where s.company = new.company) then return new; end if;
    if coalesce(new.data, '{}'::jsonb) ?| array['warnDays','warnings','expiryEmailRecipients','stockAlertRecipients'] then
      raise exception 'warnings settings change only through dispatch_set_warnings'; end if;
    return new;
  end if;
  foreach k in array array['warnDays','warnings','expiryEmailRecipients','stockAlertRecipients'] loop
    if (old.data->k) is distinct from (new.data->k) then raise exception 'warnings settings change only through dispatch_set_warnings'; end if;
  end loop;
  return new;
end $fn$;

-- ---------- stock insert policy: clients never write a fill, a delivered row or an 'undelivered' reversal (altered in place) ----------
alter policy dstock_insert on public.dispatch_stock_movements
  with check (public.dispatch_perm_in(company, 'manage_assets') and reason not in ('filled','delivered') and note not like 'undelivered %');

-- ---------- execute: RPCs to authenticated (and the on-hand function to the service role); the trigger functions to no one ----------
grant execute on function public.dispatch_stock_onhand_for(text), public.dispatch_set_stock_alerts(text,text[]) to authenticated;
grant execute on function public.dispatch_stock_onhand_for(text) to service_role;
revoke execute on function public.dispatch_stock_onhand_for(text), public.dispatch_set_stock_alerts(text,text[]) from anon, public;
revoke execute on function public.dispatch_orders_stock_out(), public.dispatch_settings_warnings_guard() from anon, authenticated, public;

-- Applied: pending
