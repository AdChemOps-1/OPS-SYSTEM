-- AdChem Ops — 008 policy test. Run inside a transaction that is rolled back:  begin; <008> <008 again> <this file> rollback;
-- Creates throw-away users (super admin sa, manager mg with view_assets + manage_assets, viewer vw with view_assets only,
-- coordinator cn with no switches, driver dr at EB with no switches, a super admin nm of a second company `north`), then acts as each one (role authenticated +
-- request.jwt.claims, which auth.uid() reads) and raises on any wrong answer. Ends with raise exception 'VERIFY-OK …' carrying the
-- key counts, so the whole batch aborts and nothing persists even if the caller forgets to roll back.
do $t$
declare
  sa uuid := gen_random_uuid(); mg uuid := gen_random_uuid(); vw uuid := gen_random_uuid(); cn uuid := gen_random_uuid(); nm uuid := gen_random_uuid();
  dr uuid := gen_random_uuid();
  t50 uuid; a_f uuid := gen_random_uuid(); e_f uuid := gen_random_uuid();
  n int; n_onhand int; n_cn int; n_order int; n_dr int; q numeric; net numeric; ok boolean; r record; v jsonb; lg record;
begin
  -- ---- setup (as the database owner; RLS does not apply) ----
  insert into public.companies (id, name, short_name) values ('north', 'North Test Co', 'North') on conflict (id) do nothing;
  insert into public.dispatch_hubs (company, code, name) values ('north', 'T8N', 'T008 North Hub') on conflict do nothing;
  insert into public.dispatch_invites (email, name, role, hub, company) values
    ('t008-sa@example.test','T SA','admin','','adchem'), ('t008-mg@example.test','T MG','coordinator','','adchem'),
    ('t008-vw@example.test','T VW','coordinator','','adchem'), ('t008-cn@example.test','T CN','coordinator','','adchem'),
    ('t008-dr@example.test','T DR','driver','EB','adchem'), ('t008-nm@example.test','T NM','admin','','north')
    on conflict (email) do update set role = excluded.role, hub = excluded.hub, company = excluded.company, accepted_at = null, revoked_at = null;
  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data, created_at, updated_at)
  select u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', e, '{}'::jsonb, '{}'::jsonb, now(), now()
    from (values (sa,'t008-sa@example.test'), (mg,'t008-mg@example.test'), (vw,'t008-vw@example.test'),
                 (cn,'t008-cn@example.test'), (dr,'t008-dr@example.test'), (nm,'t008-nm@example.test')) v(u, e);
  insert into public.dispatch_users (user_id, email, name, role, hub, active) values
    (sa,'t008-sa@example.test','T SA','admin','',true), (mg,'t008-mg@example.test','T MG','coordinator','',true),
    (vw,'t008-vw@example.test','T VW','coordinator','',true), (cn,'t008-cn@example.test','T CN','coordinator','',true),
    (dr,'t008-dr@example.test','T DR','driver','EB',true), (nm,'t008-nm@example.test','T NM','admin','',true)
    on conflict (user_id) do update set name = excluded.name, role = excluded.role, hub = excluded.hub, active = true;
  insert into public.dispatch_members (user_id, company, role, hub, active) values
    (sa,'adchem','admin','',true), (mg,'adchem','coordinator','',true), (vw,'adchem','coordinator','',true),
    (cn,'adchem','coordinator','',true), (dr,'adchem','driver','EB',true), (nm,'north','admin','',true)
    on conflict (user_id, company) do update set role = excluded.role, hub = excluded.hub, active = true;
  update public.dispatch_members set is_super_admin = true where (user_id = sa and company = 'adchem') or (user_id = nm and company = 'north');
  update public.dispatch_members set permissions = '{"view_assets":true,"manage_assets":true}' where user_id = mg and company = 'adchem';
  update public.dispatch_members set permissions = '{"view_assets":true}' where user_id = vw and company = 'adchem';
  update public.dispatch_members set permissions = '{}' where user_id in (cn, dr) and company = 'adchem';
  select id into t50 from public.dispatch_container_types where company = 'adchem' and product = 'Carbon Dioxide' and size_label = '50lb Cylinder';
  if t50 is null then raise exception 'the 007 seed 50lb Cylinder type is missing'; end if;
  insert into public.dispatch_assets (id, company, serial, container_type_id, owner_kind, owner_id, fill_state, location_kind, location_id) values
    (a_f, 'adchem', 'T8FILL50', t50, 'adchem', '', 'empty', 'hub', 'EB');
  -- an order with a counted line and a gas line, not yet delivered
  insert into public.dispatch_orders (company, id, hub, date, customer, status, data) values
    ('adchem', 'T008-EB-1', 'EB', current_date, 'T008 Customer', 'Scheduled',
     '{"lines":[{"category":"Dry Ice","product":"Dry Ice - Pellet","container":"Bin","qty":2},{"category":"Gases","product":"Carbon Dioxide","container":"50lb Cylinder","qty":1}]}'),
    ('adchem', 'T008-NH-1', '', current_date, 'T008 Customer', 'Scheduled', '{"lines":[{"category":"Dry Ice","product":"Dry Ice - Pellet","container":"Bin","qty":1}]}');
  -- north's own stock (for isolation)
  insert into public.dispatch_stock_movements (company, hub, product, qty, unit, reason) values ('north', 'T8N', 'Carbon Dioxide', 123, 'lb', 'received');

  -- the index the ruling replaced is not created; 008 ran twice without error (the batch got here)
  if exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'dispatch_stock_movements_delivered_uq') then
    raise exception 'the delivered unique index exists (the net rule replaced it)'; end if;

  -- ---- manager: records receipts, a fill, minimums; cannot write a delivered or a filled row ----
  perform set_config('request.jwt.claims', json_build_object('sub', mg, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into public.dispatch_stock_movements (company, hub, product, qty, unit, reason) values ('adchem', 'EB', 'Carbon Dioxide', 800, 'lb', 'received');
  insert into public.dispatch_stock_movements (company, hub, product, container, qty, unit, reason) values ('adchem', 'EB', 'Dry Ice - Pellet', 'Bin', 6, 'count', 'produced');
  insert into public.dispatch_stock_movements (company, hub, product, item, qty, unit, reason) values ('adchem', 'EB', '', 'Regulator', 3, 'count', 'received');
  insert into public.dispatch_stock_settings (company, hub, product, item, min_qty, unit) values ('adchem', 'EB', '', 'Regulator', 4, 'count');
  -- minimums on keys with no movements: Pallet 2 (below at qty 0, alert off), Strap 0 (not below)
  insert into public.dispatch_stock_settings (company, hub, product, item, min_qty, unit, alert) values ('adchem', 'EB', '', 'Pallet', 2, 'count', false), ('adchem', 'EB', '', 'Strap', 0, 'count', true);
  insert into public.dispatch_asset_events (id, company, asset_id, event_type) values (e_f, 'adchem', a_f, 'filled');   -- draws 50 lb at EB
  ok := false;
  begin insert into public.dispatch_stock_movements (company, hub, product, container, qty, unit, reason, order_id) values ('adchem', 'EB', 'Dry Ice - Pellet', 'Bin', -1, 'count', 'delivered', 'T008-EB-1');
  exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'the manager wrote a delivered stock row'; end if;
  ok := false;
  begin insert into public.dispatch_stock_movements (company, hub, product, qty, unit, reason) values ('adchem', 'EB', 'Carbon Dioxide', -50, 'lb', 'filled');
  exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'the manager wrote a filled stock row'; end if;
  ok := false;
  begin insert into public.dispatch_stock_movements (company, hub, product, container, qty, unit, reason, order_id, note) values ('adchem', 'EB', 'Dry Ice - Pellet', 'Bin', 2, 'count', 'adjusted', 'T008-EB-1', 'undelivered T008-EB-1');
  exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'the manager wrote an undelivered reversal row'; end if;
  -- on-hand: 800 received − a 50 lb fill = 750 lb; the now-full 50lb cylinder at EB counts 1; Regulator 3 against a minimum of 4
  select qty into q from public.dispatch_stock_onhand where company = 'adchem' and hub = 'EB' and product = 'Carbon Dioxide' and container = '' and item = '' and unit = 'lb';
  if q is distinct from 750::numeric then raise exception 'bulk Carbon Dioxide at EB on-hand % (want 750)', q; end if;
  select qty into q from public.dispatch_stock_onhand where company = 'adchem' and hub = 'EB' and product = 'Carbon Dioxide' and container = '50lb Cylinder' and item = '' and unit = 'count';
  if q is distinct from 1::numeric then raise exception 'full 50lb Cylinders at EB on-hand % (want 1)', q; end if;
  select * into r from public.dispatch_stock_onhand_for('adchem') x where x.hub = 'EB' and x.item = 'Regulator';
  if not found or r.qty <> 3 or r.min_qty is distinct from 4::numeric or r.below is not true or r.alert is not true then
    raise exception 'Regulator at EB: qty % min % below % alert % (want 3, 4, true, true)', r.qty, r.min_qty, r.below, r.alert; end if;
  insert into public.dispatch_stock_movements (company, hub, product, item, qty, unit, reason) values ('adchem', 'EB', '', 'Regulator', 1, 'count', 'received');
  select * into r from public.dispatch_stock_onhand_for('adchem') x where x.hub = 'EB' and x.item = 'Regulator';
  if not found or r.qty <> 4 or r.below is not false then raise exception 'Regulator at EB: qty % below % (want 4, false)', r.qty, r.below; end if;
  select * into r from public.dispatch_stock_onhand_for('adchem') x where x.hub = 'EB' and x.product = 'Carbon Dioxide' and x.container = '';
  if not found or r.min_qty is not null or r.below is not false or r.alert is not false then
    raise exception 'bulk with no minimum: min % below % alert % (want null, false, false)', r.min_qty, r.below, r.alert; end if;
  select * into r from public.dispatch_stock_onhand_for('adchem') x where x.hub = 'EB' and x.item = 'Pallet';
  if not found or r.qty is distinct from 0::numeric or r.min_qty is distinct from 2::numeric or r.below is not true or r.unit <> 'count' or r.alert is not false then
    raise exception 'Pallet minimum with no movements: qty % min % below % alert % (want 0, 2, true, false)', r.qty, r.min_qty, r.below, r.alert; end if;
  select * into r from public.dispatch_stock_onhand_for('adchem') x where x.hub = 'EB' and x.item = 'Strap';
  if not found or r.qty is distinct from 0::numeric or r.below is not false or r.alert is not true then
    raise exception 'Strap minimum 0 with no movements: qty % below % alert % (want 0, false, true)', r.qty, r.below, r.alert; end if;
  -- the alert switch rides with the minimum: off on the Regulator row (still below), and the full-cylinder row (no minimum) reads false
  update public.dispatch_stock_settings set alert = false where company = 'adchem' and hub = 'EB' and item = 'Regulator';
  select * into r from public.dispatch_stock_onhand_for('adchem') x where x.hub = 'EB' and x.item = 'Regulator';
  if not found or r.alert is not false or r.below is not false then raise exception 'Regulator alert off: alert % below % (want false, false)', r.alert, r.below; end if;
  update public.dispatch_stock_settings set alert = true where company = 'adchem' and hub = 'EB' and item = 'Regulator';
  select * into r from public.dispatch_stock_onhand_for('adchem') x where x.hub = 'EB' and x.product = 'Carbon Dioxide' and x.container = '50lb Cylinder';
  if not found or r.qty <> 1 or r.alert is not false or r.min_qty is not null then raise exception 'full cylinders row: qty % min % alert % (want 1, null, false)', r.qty, r.min_qty, r.alert; end if;
  -- the view is one row per key even with a stray movement under a gas-container key (the server refuses one; a direct insert sums in)
  insert into public.dispatch_stock_movements (company, hub, product, container, qty, unit, reason) values ('adchem', 'EB', 'Carbon Dioxide', '50lb Cylinder', 2, 'count', 'received');
  if (select count(*) from public.dispatch_stock_onhand where company = 'adchem' and hub = 'EB' and product = 'Carbon Dioxide' and container = '50lb Cylinder') <> 1 then
    raise exception 'a gas-container key with a movement and a register count shows as two rows'; end if;
  select qty into q from public.dispatch_stock_onhand where company = 'adchem' and hub = 'EB' and product = 'Carbon Dioxide' and container = '50lb Cylinder';
  if q is distinct from 3::numeric then raise exception 'gas-container key summed to % (want 1 register + 2 movement = 3)', q; end if;
  insert into public.dispatch_stock_movements (company, hub, product, container, qty, unit, reason, note) values ('adchem', 'EB', 'Carbon Dioxide', '50lb Cylinder', -2, 'count', 'adjusted', 't008 undo');
  if (select count(*) from public.dispatch_stock_onhand_for('adchem') x where x.hub = 'EB' and x.item = 'Regulator') <> 1 then
    raise exception 'a minimum with on-hand rows appears twice'; end if;
  select count(*) into n_onhand from public.dispatch_stock_onhand_for('adchem');
  if exists (select 1 from public.dispatch_stock_onhand_for('adchem') x where x.company <> 'adchem') then raise exception 'on-hand for adchem returned another company'; end if;
  if (select count(*) from public.dispatch_stock_onhand where company = 'north') <> 0 then raise exception 'manager sees north on-hand'; end if;
  ok := false;
  begin perform public.dispatch_set_stock_alerts('adchem', array['ops@example.test']);
  exception when others then ok := sqlerrm = 'not allowed'; end;
  if not ok then raise exception 'a non-super manager set the stock alert recipients'; end if;
  reset role;

  -- ---- the delivered draw-down (net rule): the coordinator moves the order through its statuses ----
  perform set_config('request.jwt.claims', json_build_object('sub', cn, 'role', 'authenticated')::text, true);
  set local role authenticated;
  update public.dispatch_orders set status = 'Delivered' where company = 'adchem' and id = 'T008-EB-1';
  update public.dispatch_orders set status = 'Delivered' where company = 'adchem' and id = 'T008-NH-1';
  reset role;
  if exists (select 1 from public.dispatch_stock_movements where order_id = 'T008-NH-1') then raise exception 'an order with no hub wrote a stock row'; end if;
  if (select status from public.dispatch_orders where company = 'adchem' and id = 'T008-NH-1') <> 'Delivered' then raise exception 'the no-hub order did not reach Delivered'; end if;
  if (select count(*) from public.dispatch_stock_movements where order_id = 'T008-EB-1') <> 1
     or (select count(*) from public.dispatch_stock_movements where order_id = 'T008-EB-1' and reason = 'delivered' and product = 'Dry Ice - Pellet'
           and container = 'Bin' and item = '' and qty = -2 and unit = 'count' and hub = 'EB' and recorded_by = cn) <> 1 then
    raise exception 'Delivered did not write exactly one -2 Bin row'; end if;
  if exists (select 1 from public.dispatch_stock_movements where order_id = 'T008-EB-1' and product = 'Carbon Dioxide') then
    raise exception 'a gas line wrote a stock row'; end if;
  set local role authenticated;
  update public.dispatch_orders set status = 'POD Received' where company = 'adchem' and id = 'T008-EB-1';
  reset role;
  if (select count(*) from public.dispatch_stock_movements where order_id = 'T008-EB-1') <> 1 then raise exception 'POD Received wrote another stock row'; end if;
  set local role authenticated;
  update public.dispatch_orders set status = 'Scheduled' where company = 'adchem' and id = 'T008-EB-1';
  reset role;
  if (select count(*) from public.dispatch_stock_movements where order_id = 'T008-EB-1') <> 2
     or (select count(*) from public.dispatch_stock_movements where order_id = 'T008-EB-1' and reason = 'adjusted' and qty = 2
           and note = 'undelivered T008-EB-1' and product = 'Dry Ice - Pellet' and container = 'Bin' and hub = 'EB') <> 1 then
    raise exception 'leaving Delivered did not write one +2 adjusted undelivered row'; end if;
  set local role authenticated;
  update public.dispatch_orders set status = 'Intake' where company = 'adchem' and id = 'T008-EB-1';   -- outside to outside: nothing
  update public.dispatch_orders set status = 'Delivered' where company = 'adchem' and id = 'T008-EB-1';
  reset role;
  if (select count(*) from public.dispatch_stock_movements where order_id = 'T008-EB-1') <> 3
     or (select count(*) from public.dispatch_stock_movements where order_id = 'T008-EB-1' and reason = 'delivered' and qty = -2) <> 2 then
    raise exception 'Delivered again did not write a new -2 row'; end if;
  -- within the pair and a whole-row re-save with the same status: nothing more while drawn
  set local role authenticated;
  update public.dispatch_orders set status = 'POD Received' where company = 'adchem' and id = 'T008-EB-1';
  update public.dispatch_orders set status = 'Delivered' where company = 'adchem' and id = 'T008-EB-1';
  update public.dispatch_orders set status = 'Delivered', data = data where company = 'adchem' and id = 'T008-EB-1';
  reset role;
  select count(*), sum(qty) into n_order, net from public.dispatch_stock_movements where order_id = 'T008-EB-1' and product = 'Dry Ice - Pellet' and container = 'Bin';
  if n_order <> 3 then raise exception 'a repeat Delivered while drawn wrote a row (% rows, want 3)', n_order; end if;
  if net <> -2 then raise exception 'net for the order''s Bin key is % (want -2)', net; end if;
  -- the server's direct writes as the trigger's owner bypass RLS; the coordinator (no manage_assets) cannot write one directly
  perform set_config('request.jwt.claims', json_build_object('sub', cn, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := false;
  begin insert into public.dispatch_stock_movements (company, hub, product, qty, unit, reason) values ('adchem', 'EB', 'Carbon Dioxide', 5, 'lb', 'received');
  exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'the coordinator wrote a stock row'; end if;
  -- ---- coordinator: no rows through the view (RLS), every row through dispatch_stock_onhand_for ----
  if (select count(*) from public.dispatch_stock_onhand) <> 0 then raise exception 'coordinator without switches reads dispatch_stock_onhand'; end if;
  select count(*) into n_cn from public.dispatch_stock_onhand_for('adchem');
  if n_cn <> n_onhand then raise exception 'coordinator gets % on-hand rows (want %, as the manager)', n_cn, n_onhand; end if;
  select qty into q from public.dispatch_stock_onhand_for('adchem') x where x.hub = 'EB' and x.product = 'Dry Ice - Pellet' and x.container = 'Bin';
  if q is distinct from 4::numeric then raise exception 'Bin on-hand at EB % (want 6 produced - 2 delivered = 4)', q; end if;
  if (select count(*) from public.dispatch_stock_onhand_for('north')) <> 0 then raise exception 'coordinator gets north on-hand'; end if;
  reset role;

  -- ---- driver at EB, no switches: nothing through the function, no insert; the view shows only the register's gas counts for assets the driver can read ----
  perform set_config('request.jwt.claims', json_build_object('sub', dr, 'role', 'authenticated')::text, true);
  set local role authenticated;
  if (select count(*) from public.dispatch_stock_onhand_for('adchem')) <> 0 then raise exception 'driver gets rows from dispatch_stock_onhand_for'; end if;
  ok := false;
  begin insert into public.dispatch_stock_movements (company, hub, product, qty, unit, reason) values ('adchem', 'EB', 'Carbon Dioxide', 5, 'lb', 'received');
  exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'the driver wrote a stock row'; end if;
  if (select count(*) from public.dispatch_stock_movements where company = 'adchem') <> 0 then raise exception 'driver reads stock movements'; end if;
  -- the driver reads the full cylinder at their hub (dasset_read's driver rule), so the view carries that one gas count and nothing else
  select count(*) into n_dr from public.dispatch_stock_onhand where company = 'adchem';
  if n_dr = 0 then raise exception 'driver sees no on-hand row through the view (want the register count at EB)'; end if;
  if exists (select 1 from public.dispatch_stock_onhand v where v.company = 'adchem' and (v.hub <> 'EB' or v.item <> '' or v.unit <> 'count'
               or not exists (select 1 from public.dispatch_container_types t where t.company = v.company and t.product = v.product and t.size_label = v.container))) then
    raise exception 'driver sees an on-hand row that is not a register gas count at their hub'; end if;
  select qty into q from public.dispatch_stock_onhand where company = 'adchem' and hub = 'EB' and product = 'Carbon Dioxide' and container = '50lb Cylinder';
  if q is distinct from 1::numeric then raise exception 'driver''s full 50lb Cylinders at EB % (want 1: the register only, never the movements)', q; end if;
  reset role;

  -- ---- viewer: reads on-hand; cannot insert ----
  perform set_config('request.jwt.claims', json_build_object('sub', vw, 'role', 'authenticated')::text, true);
  set local role authenticated;
  if (select count(*) from public.dispatch_stock_onhand where company = 'adchem') = 0 then raise exception 'viewer reads no on-hand'; end if;
  ok := false;
  begin insert into public.dispatch_stock_movements (company, hub, product, qty, unit, reason) values ('adchem', 'EB', 'Carbon Dioxide', 5, 'lb', 'received');
  exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'the viewer wrote a stock row'; end if;
  reset role;

  -- ---- stock alert recipients: super admin only, email-shaped, only through the RPC; logged; kept by dispatch_set_warnings ----
  perform set_config('request.jwt.claims', json_build_object('sub', sa, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := false;
  begin perform public.dispatch_set_stock_alerts('adchem', array['not an email']);
  exception when others then ok := sqlerrm = 'recipients must be email addresses'; end;
  if not ok then raise exception 'stock alert recipients took a non-email'; end if;
  perform public.dispatch_set_stock_alerts('adchem', array['ops@example.test','yard@example.test']);
  if coalesce(current_setting('dispatch.set_warnings', true), '') <> '' then raise exception 'dispatch_set_stock_alerts left its flag set'; end if;
  ok := false;
  begin update public.dispatch_company_settings set data = jsonb_set(data, '{stockAlertRecipients}', '["evil@example.test"]') where company = 'adchem';
  exception when others then ok := sqlerrm = 'warnings settings change only through dispatch_set_warnings'; end;
  if not ok then raise exception 'an admin changed stockAlertRecipients directly'; end if;
  ok := false;
  begin update public.dispatch_company_settings set data = data - 'stockAlertRecipients' where company = 'adchem';
  exception when others then ok := sqlerrm = 'warnings settings change only through dispatch_set_warnings'; end;
  if not ok then raise exception 'an admin removed stockAlertRecipients directly'; end if;
  -- a whole-object save that carries the key back unchanged passes
  update public.dispatch_company_settings set data = data || '{"t008":"saved"}' where company = 'adchem';
  perform public.dispatch_set_warnings('adchem', 30, '{}', array['exp@example.test']);
  reset role;
  select data into v from public.dispatch_company_settings where company = 'adchem';
  if v->'stockAlertRecipients' is distinct from '["ops@example.test","yard@example.test"]'::jsonb then
    raise exception 'stockAlertRecipients is % after dispatch_set_warnings', v->'stockAlertRecipients'; end if;
  if v->>'t008' is distinct from 'saved' then raise exception 'a whole-object settings save was refused'; end if;
  select * into lg from public.dispatch_log where company = 'adchem' and who = sa and what = 'warnings' and changes ? 'stockAlertRecipients' order by id desc limit 1;
  if not found or lg.table_name <> 'dispatch_company_settings' or lg.row_id <> 'adchem'
     or lg.changes->'stockAlertRecipients'->'to' is distinct from '["ops@example.test","yard@example.test"]'::jsonb then
    raise exception 'dispatch_set_stock_alerts was not logged with from/to'; end if;

  -- ---- the cron path: the service role reads every company's on-hand through the function ----
  set local role service_role;
  select count(*) into n from public.dispatch_stock_onhand_for('adchem');
  reset role;
  if n = 0 then raise exception 'service role gets no adchem on-hand'; end if;

  -- ---- second company: north's super admin sees only north, cannot set adchem's recipients ----
  perform set_config('request.jwt.claims', json_build_object('sub', nm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select (select count(*) from public.dispatch_stock_onhand where company = 'adchem') + (select count(*) from public.dispatch_stock_onhand_for('adchem'))
       + (select count(*) from public.dispatch_stock_movements where company = 'adchem') into n;
  if n <> 0 then raise exception 'north super admin sees % adchem stock rows', n; end if;
  select qty into q from public.dispatch_stock_onhand_for('north') x where x.hub = 'T8N' and x.product = 'Carbon Dioxide';
  if q is distinct from 123::numeric then raise exception 'north on-hand % (want 123)', q; end if;
  ok := false;
  begin perform public.dispatch_set_stock_alerts('adchem', array['n@example.test']);
  exception when others then ok := sqlerrm = 'not allowed'; end;
  if not ok then raise exception 'north super admin set adchem stock alert recipients'; end if;
  ok := false;
  begin insert into public.dispatch_stock_movements (company, hub, product, qty, unit, reason) values ('adchem', 'EB', 'Carbon Dioxide', 5, 'lb', 'received');
  exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'north super admin wrote an adchem stock row'; end if;
  reset role;
  perform set_config('request.jwt.claims', '', true);

  -- the trigger function is executable by no client role
  if has_function_privilege('authenticated', 'public.dispatch_orders_stock_out()', 'execute') or has_function_privilege('anon', 'public.dispatch_stock_onhand_for(text)', 'execute')
     or has_function_privilege('anon', 'public.dispatch_set_stock_alerts(text,text[])', 'execute') then
    raise exception 'an 008 function is executable by anon, or the trigger function by authenticated'; end if;

  raise exception 'VERIFY-OK 008: onhand_rows=% coordinator_rows=% driver_view_rows=% order_rows=% order_net=%', n_onhand, n_cn, n_dr, n_order, net;
end $t$;
