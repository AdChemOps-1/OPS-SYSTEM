-- AdChem Ops — 007 policy test. Run inside a transaction that is rolled back:  begin; <007> <007 again> <this file> rollback;
-- Creates throw-away users (super admin sa, manager mg with view_assets + manage_assets, coordinator cn with no switches, coordinator
-- vd with view_documents + manage_documents only, driver dr hub EB with an order today at site S, a super admin nm and a driver nd of
-- a second company `north`), then acts as each one (role
-- authenticated + request.jwt.claims, which auth.uid() reads) and raises on any wrong answer. Ends with raise exception 'VERIFY-OK …'
-- carrying the key counts, so the whole batch aborts and nothing persists even if the caller forgets to roll back.
do $t$
declare
  sa uuid := gen_random_uuid(); mg uuid := gen_random_uuid(); cn uuid := gen_random_uuid();
  dr uuid := gen_random_uuid(); nm uuid := gen_random_uuid(); nd uuid := gen_random_uuid(); vd uuid := gen_random_uuid();
  la date := (now() at time zone 'America/Los_Angeles')::date;
  a_w uuid := gen_random_uuid(); a_late uuid := gen_random_uuid(); a_v uuid := gen_random_uuid(); e_ss uuid := gen_random_uuid(); e_sv uuid := gen_random_uuid();
  cust uuid; vend uuid; t50 uuid; tdw uuid; tn uuid;
  a_hub uuid := gen_random_uuid(); a_s uuid := gen_random_uuid(); a_o uuid := gen_random_uuid(); a_n uuid := gen_random_uuid();
  a_f uuid := gen_random_uuid(); a_d uuid := gen_random_uuid(); a_dr uuid := gen_random_uuid(); a_ab uuid; a_c uuid := gen_random_uuid();
  e_late uuid := gen_random_uuid(); e_after uuid := gen_random_uuid(); seen_at timestamptz; seen_by uuid;
  e_del uuid := gen_random_uuid(); e_f uuid := gen_random_uuid(); e_d uuid := gen_random_uuid();
  n int; n_types int; n_dr int; n_stock int; n_counts int; n_events int; ok boolean; a record; lg record; st record; photo text;
begin
  -- ---- setup (as the database owner; RLS does not apply) ----
  insert into public.companies (id, name, short_name) values ('north', 'North Test Co', 'North') on conflict (id) do nothing;
  insert into public.dispatch_hubs (company, code, name) values ('north', 'T7N', 'T007 North Hub') on conflict do nothing;
  insert into public.dispatch_invites (email, name, role, hub, company) values
    ('t007-sa@example.test','T SA','admin','','adchem'), ('t007-mg@example.test','T MG','coordinator','','adchem'),
    ('t007-cn@example.test','T CN','coordinator','','adchem'), ('t007-dr@example.test','T DR','driver','EB','adchem'),
    ('t007-nm@example.test','T NM','admin','','north'), ('t007-nd@example.test','T ND','driver','T7N','north'),
    ('t007-vd@example.test','T VD','coordinator','','adchem')
    on conflict (email) do update set role = excluded.role, hub = excluded.hub, company = excluded.company, accepted_at = null, revoked_at = null;
  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data, created_at, updated_at)
  select u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', e, '{}'::jsonb, '{}'::jsonb, now(), now()
    from (values (sa,'t007-sa@example.test'), (mg,'t007-mg@example.test'), (cn,'t007-cn@example.test'),
                 (dr,'t007-dr@example.test'), (nm,'t007-nm@example.test'), (nd,'t007-nd@example.test'), (vd,'t007-vd@example.test')) v(u, e);
  insert into public.dispatch_users (user_id, email, name, role, hub, active) values
    (sa,'t007-sa@example.test','T SA','admin','',true), (mg,'t007-mg@example.test','T MG','coordinator','',true),
    (cn,'t007-cn@example.test','T CN','coordinator','',true), (dr,'t007-dr@example.test','T DR','driver','EB',true),
    (nm,'t007-nm@example.test','T NM','admin','',true), (nd,'t007-nd@example.test','T ND','driver','T7N',true),
    (vd,'t007-vd@example.test','T VD','coordinator','',true)
    on conflict (user_id) do update set name = excluded.name, role = excluded.role, hub = excluded.hub, active = true;
  insert into public.dispatch_members (user_id, company, role, hub, active) values
    (sa,'adchem','admin','',true), (mg,'adchem','coordinator','',true), (cn,'adchem','coordinator','',true),
    (dr,'adchem','driver','EB',true), (nm,'north','admin','',true), (nd,'north','driver','T7N',true), (vd,'adchem','coordinator','',true)
    on conflict (user_id, company) do update set role = excluded.role, hub = excluded.hub, active = true;
  update public.dispatch_members set is_super_admin = true where (user_id = sa and company = 'adchem') or (user_id = nm and company = 'north');
  update public.dispatch_members set permissions = '{"view_assets":true,"manage_assets":true}' where user_id = mg and company = 'adchem';
  update public.dispatch_members set permissions = '{}' where user_id in (cn, dr) and company = 'adchem';
  update public.dispatch_members set permissions = '{"view_documents":true,"manage_documents":true}' where user_id = vd and company = 'adchem';
  insert into public.dispatch_customers (company, customer_id, name, primary_hub) values ('adchem', 'T007-A', 'T007 Customer', 'EB') returning id into cust;
  insert into public.dispatch_sites (company, site_key, customer, addr, hub, customer_id) values
    ('adchem', 'T007-S', 'T007 Customer', '1 Stop St', 'EB', cust), ('adchem', 'T007-O', 'T007 Other', '2 Other St', 'EB', null),
    ('north', 'T007-NS', 'T007 North', '3 North St', 'T7N', null),
    ('adchem', 'T007-P1', 'T007 Plus One', '4 Next St', 'EB', null), ('adchem', 'T007-M2', 'T007 Minus Two', '5 Past St', 'EB', null);
  -- the driver's stop today: an EB order at site S (the order's site lives in data.siteKey); site O has no order near today.
  -- The stop window is the Pacific date ±1: an order at P1 dated Pacific today + 1 counts, one at M2 dated today - 2 does not.
  insert into public.dispatch_orders (company, id, hub, date, customer, data) values
    ('adchem', 'T007-EB-1', 'EB', la, 'T007 Customer', '{"siteKey":"T007-S"}'),
    ('adchem', 'T007-EB-0', 'EB', la - 5, 'T007 Other', '{"siteKey":"T007-O"}'),
    ('adchem', 'T007-EB-2', 'EB', la + 1, 'T007 Plus One', '{"siteKey":"T007-P1"}'),
    ('adchem', 'T007-EB-3', 'EB', la - 2, 'T007 Minus Two', '{"siteKey":"T007-M2"}');
  -- a stock minimum (3B's table, created by 007)
  insert into public.dispatch_stock_settings (company, hub, product, min_qty, unit) values ('adchem', 'EB', 'Carbon Dioxide', 500, 'lb');

  -- ---- seed: the order form's 17 gas containers for adchem, once each even though 007 ran twice ----
  select count(*) into n_types from public.dispatch_container_types where company = 'adchem' and created_by is null;
  if n_types <> 17 then raise exception 'seeded % container types (want 17)', n_types; end if;
  select id into t50 from public.dispatch_container_types where company = 'adchem' and product = 'Carbon Dioxide' and size_label = '50lb Cylinder';
  select id into tdw from public.dispatch_container_types where company = 'adchem' and product = 'Nitrogen' and size_label = '260L Dewar';
  if (select fill_lb from public.dispatch_container_types where id = t50) is distinct from 50::numeric
     or (select fill_lb from public.dispatch_container_types where id = tdw) is not null
     or (select kind from public.dispatch_container_types where id = tdw) <> 'dewar'
     or (select kind from public.dispatch_container_types where company = 'adchem' and product = 'Butane' and size_label = '500lb Pig') <> 'pig'
     or (select fill_lb from public.dispatch_container_types where company = 'adchem' and product = 'Nitrogen' and size_label = '200cu ft Cylinder') is not null then
    raise exception 'seeded container types have wrong kind or fill_lb'; end if;
  insert into public.dispatch_container_types (company, kind, size_label, product, fill_lb) values ('north', 'cylinder', '50lb Cylinder', 'Carbon Dioxide', 50) returning id into tn;
  -- assets placed by the owner (no role, so no driver rule): at the hub, at S, at O, in north; a 50lb and a dewar at EB for fills
  insert into public.dispatch_assets (id, company, serial, container_type_id, owner_kind, owner_id, fill_state, location_kind, location_id) values
    (a_hub, 'adchem', 'T7HUB01', t50, 'adchem', '', 'full', 'hub', 'EB'),
    (a_s, 'adchem', 'T7STOP01', t50, 'customer', cust::text, 'empty', 'site', 'T007-S'),
    (a_o, 'adchem', 'T7OTHER01', t50, 'adchem', '', 'empty', 'site', 'T007-O'),
    (a_f, 'adchem', 'T7FILL50', t50, 'adchem', '', 'empty', 'hub', 'EB'),
    (a_d, 'adchem', 'T7FILLDW', tdw, 'adchem', '', 'empty', 'hub', 'EB'),
    (a_n, 'north', 'T7NORTH01', tn, 'adchem', '', 'full', 'hub', 'T7N'),
    (a_w, 'adchem', 'T7WRONG01', t50, 'adchem', '', 'full', 'site', 'T007-O'),   -- at another site (not visible to the driver)
    (a_late, 'adchem', 'T7LATE01', t50, 'adchem', '', 'full', 'hub', 'LA');       -- at another hub (not visible to the driver)
  ok := false;
  begin insert into public.dispatch_assets (company, serial, location_kind, location_id) values ('adchem', 'T7BAD', 'hub', 'T7N');
  exception when others then ok := sqlerrm = 'location not found in this company'; end;
  if not ok then raise exception 'an adchem asset was placed at a north hub'; end if;

  -- ---- driver: sees the asset at S and at their hub, not at another site, not north's ----
  perform set_config('request.jwt.claims', json_build_object('sub', dr, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n_dr from public.dispatch_assets;
  if n_dr <> 4 then raise exception 'driver sees % assets (want 4: hub, S, two at EB for fills)', n_dr; end if;
  if (select count(*) from public.dispatch_assets where id in (a_hub, a_s)) <> 2 then raise exception 'driver misses the asset at the hub or at S'; end if;
  if (select count(*) from public.dispatch_assets where id in (a_o, a_n)) <> 0 then raise exception 'driver sees the asset at O or north'; end if;
  if (select count(*) from public.dispatch_asset_counts_for('adchem')) <> 0 then raise exception 'driver gets counts'; end if;
  if (select count(*) from public.dispatch_container_types where company = 'adchem') < 17 then raise exception 'driver cannot read container types'; end if;
  -- delivered hub → S: the asset moves and is full; the owner does not change
  insert into public.dispatch_asset_events (id, company, asset_id, event_type, from_kind, from_id, to_kind, to_id, order_id, site_key, photo_path, occurred_at)
    values (e_del, 'adchem', a_hub, 'delivered', 'hub', 'EB', 'site', 'T007-S', 'T007-EB-1', 'T007-S', 'adchem/asset/' || a_hub || '/' || e_del || '.jpg', now() - interval '2 minutes');
  -- a retry of the same event id is the primary key's violation (the server reads it as a duplicate)
  ok := false;
  begin insert into public.dispatch_asset_events (id, company, asset_id, event_type, from_kind, from_id, to_kind, to_id) values (e_del, 'adchem', a_hub, 'delivered', 'hub', 'EB', 'site', 'T007-S');
  exception when unique_violation then ok := sqlerrm like '%dispatch_asset_events_pkey%'; end;
  if not ok then raise exception 'a duplicate event id was not the primary key violation'; end if;
  -- refused: a filled event, a delivery to a site with no stop today, a collection from it
  ok := false;
  begin insert into public.dispatch_asset_events (company, asset_id, event_type) values ('adchem', a_f, 'filled');
  exception when others then ok := sqlerrm = 'a driver cannot record filled'; end;
  if not ok then raise exception 'driver recorded a fill'; end if;
  ok := false;
  begin insert into public.dispatch_asset_events (company, asset_id, event_type, from_kind, from_id, to_kind, to_id) values ('adchem', a_f, 'delivered', 'hub', 'EB', 'site', 'T007-O');
  exception when others then ok := sqlerrm = 'not your stop'; end;
  if not ok then raise exception 'driver delivered to a site with no stop today'; end if;
  -- from is never checked for a driver: a sighted correction may carry another customer's site (the register's last place)
  insert into public.dispatch_asset_events (company, asset_id, event_type, from_kind, from_id, to_kind, to_id, note) values ('adchem', a_f, 'sighted', 'site', 'T007-O', 'hub', 'EB', 'was at T007-O');
  -- a driver sighted moves an asset the register had at another site to their stop (P1, an order dated Pacific today + 1)
  insert into public.dispatch_asset_events (company, asset_id, event_type, from_kind, from_id, to_kind, to_id, note) values ('adchem', a_w, 'sighted', 'site', 'T007-O', 'site', 'T007-P1', 'was at T007-O');
  -- outside the window (an order dated Pacific today - 2) is not their stop; another hub is not their hub
  ok := false;
  begin insert into public.dispatch_asset_events (company, asset_id, event_type, to_kind, to_id) values ('adchem', a_w, 'sighted', 'site', 'T007-M2');
  exception when others then ok := sqlerrm = 'not your stop'; end;
  if not ok then raise exception 'driver sighted at a site whose order is two days old'; end if;
  -- every driver event names where it goes: a sighted with no to is refused
  ok := false;
  begin insert into public.dispatch_asset_events (company, asset_id, event_type) values ('adchem', a_hub, 'sighted');
  exception when others then ok := sqlerrm = 'not your stop'; end;
  if not ok then raise exception 'driver recorded a sighted with no place'; end if;
  ok := false;
  begin insert into public.dispatch_asset_events (company, asset_id, event_type, from_kind, from_id, to_kind, to_id) values ('adchem', a_f, 'collected', 'site', 'T007-S', 'hub', 'LA');
  exception when others then ok := sqlerrm = 'not your stop'; end;
  if not ok then raise exception 'driver collected to another hub'; end if;
  -- the driver finds an asset the register has at another customer's site by serial (normalised), with no notes or tag
  select count(*) into n from public.dispatch_asset_by_serial('adchem', ' t7other01 ') x where x.id = a_o and x.location_kind = 'site' and x.location_id = 'T007-O';
  if n <> 1 then raise exception 'driver did not find the asset at another site by serial'; end if;
  if (select count(*) from public.dispatch_asset_by_serial('adchem', 'NOSUCH01')) <> 0 then raise exception 'by_serial found a missing serial'; end if;
  if exists (select 1 from pg_proc p where p.proname = 'dispatch_asset_by_serial' and ('notes' = any(p.proargnames) or 'tag' = any(p.proargnames))) then
    raise exception 'dispatch_asset_by_serial returns notes or tag'; end if;
  ok := false;
  begin insert into public.dispatch_asset_events (company, asset_id, event_type, from_kind, from_id, to_kind, to_id) values ('adchem', a_f, 'delivered', 'hub', 'EB', 'hub', 'EB');
  exception when others then ok := sqlerrm = 'delivered goes to a site'; end;
  if not ok then raise exception 'a delivery to a hub was accepted'; end if;
  -- no direct update of an asset
  ok := false;
  begin update public.dispatch_assets set notes = 'x' where id = a_s;
    get diagnostics n = row_count; ok := n = 0;
  exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'driver updated an asset'; end if;
  -- a driver adds an unknown container: in service, owner adchem or the stop's customer, at their hub or today's stop
  insert into public.dispatch_assets (id, company, serial, container_type_id, owner_kind, owner_id, location_kind, location_id)
    values (a_dr, 'adchem', 't7 drv01', t50, 'customer', cust::text, 'site', 'T007-S');
  ok := false;
  begin insert into public.dispatch_assets (company, serial, condition, location_kind, location_id) values ('adchem', 'T7DRV02', 'lost', 'hub', 'EB');
  exception when others then ok := sqlerrm = 'a driver adds only an in-service container owned by AdChem or the stop''s customer, at their hub or stop'; end;
  if not ok then raise exception 'driver added a lost container'; end if;
  ok := false;
  begin insert into public.dispatch_assets (company, serial, location_kind, location_id) values ('adchem', 'T7DRV03', 'site', 'T007-O');
  exception when others then ok := sqlerrm = 'a driver adds only an in-service container owned by AdChem or the stop''s customer, at their hub or stop'; end;
  if not ok then raise exception 'driver added a container at a site with no stop today'; end if;
  reset role;
  select * into a from public.dispatch_assets where id = a_hub;
  if a.location_kind <> 'site' or a.location_id <> 'T007-S' or a.fill_state <> 'full' or a.last_seen_by is distinct from dr
     or a.last_seen_at is distinct from now() - interval '2 minutes' or a.owner_kind <> 'adchem' or a.owner_id <> '' then
    raise exception 'after delivery the asset is % % % seen % by % owned % %', a.location_kind, a.location_id, a.fill_state, a.last_seen_at, a.last_seen_by, a.owner_kind, a.owner_id; end if;
  if (select recorded_by from public.dispatch_asset_events where id = e_del) is distinct from dr then raise exception 'event not recorded as the driver'; end if;
  select * into a from public.dispatch_assets where id = a_dr;
  if a.serial <> 'T7DRV01' or a.condition <> 'in_service' or a.fill_state <> 'unknown' or a.created_by is distinct from dr then
    raise exception 'driver-added asset stored as % % % by %', a.serial, a.condition, a.fill_state, a.created_by; end if;
  select * into a from public.dispatch_assets where id = a_w;
  if a.location_kind <> 'site' or a.location_id <> 'T007-P1' or a.last_seen_by is distinct from dr then
    raise exception 'driver sighted did not move the asset: % % by %', a.location_kind, a.location_id, a.last_seen_by; end if;
  -- an inactive member cannot look up serials
  update public.dispatch_members set active = false where user_id = dr and company = 'adchem';
  perform set_config('request.jwt.claims', json_build_object('sub', dr, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := false;
  begin perform * from public.dispatch_asset_by_serial('adchem', 'T7HUB01');
  exception when others then ok := sqlerrm = 'not allowed'; end;
  reset role;
  if not ok then raise exception 'an inactive member looked up a serial'; end if;
  update public.dispatch_members set active = true where user_id = dr and company = 'adchem';
  -- the owner (no claims) moves the delivered asset to O; the driver still sees it (they recorded an event on it today), with its events
  perform set_config('request.jwt.claims', '', true);
  insert into public.dispatch_asset_events (company, asset_id, event_type, from_kind, from_id, to_kind, to_id) values ('adchem', a_hub, 'moved', 'site', 'T007-S', 'site', 'T007-O');
  perform set_config('request.jwt.claims', json_build_object('sub', dr, 'role', 'authenticated')::text, true);
  set local role authenticated;
  if (select count(*) from public.dispatch_assets where id = a_hub) <> 1 then raise exception 'driver lost sight of an asset they handled today'; end if;
  if (select count(*) from public.dispatch_asset_events where asset_id = a_hub) <> 2 then raise exception 'driver does not see the handled asset''s events'; end if;
  if (select count(*) from public.dispatch_asset_events where asset_id = a_o) <> 0 then raise exception 'driver sees events of an asset at O'; end if;
  reset role;

  -- ---- manager: location/fill/owner only through events and the RPC; corrections; fills and the bulk draw-down ----
  perform set_config('request.jwt.claims', json_build_object('sub', mg, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into public.dispatch_vendors (company, name, roles) values ('adchem', 'T007 Gas Co', array['fill','rent']) returning id into vend;
  ok := false;
  begin insert into public.dispatch_vendors (company, name) values ('adchem', 't007 gas co');
  exception when unique_violation then ok := true; end;
  if not ok then raise exception 'a vendor name repeated (case-insensitive) was accepted'; end if;
  if (select count(*) from public.dispatch_stock_settings where company = 'adchem' and hub = 'EB') <> 1 then raise exception 'manager cannot read stock settings'; end if;
  ok := false;
  begin update public.dispatch_assets set location_id = 'LA' where id = a_f;
  exception when others then ok := sqlerrm = 'location and fill change only through events'; end;
  if not ok then raise exception 'manager moved an asset directly'; end if;
  ok := false;
  begin update public.dispatch_assets set fill_state = 'full' where id = a_f;
  exception when others then ok := sqlerrm = 'location and fill change only through events'; end;
  if not ok then raise exception 'manager filled an asset directly'; end if;
  ok := false;
  begin update public.dispatch_assets set owner_kind = 'vendor', owner_id = vend::text where id = a_s;
  exception when others then ok := sqlerrm = 'owner changes only through dispatch_asset_correct'; end;
  if not ok then raise exception 'manager changed an owner directly'; end if;
  update public.dispatch_assets set notes = 'dented' where id = a_s;
  get diagnostics n = row_count;  if n <> 1 then raise exception 'manager could not edit notes'; end if;
  -- an office correction is not a sighting: last-seen stays, so a driver's earlier offline event that arrives after it still applies
  insert into public.dispatch_asset_events (company, asset_id, event_type, to_kind, to_id, occurred_at) values ('adchem', a_s, 'sighted', 'site', 'T007-S', now() - interval '1 hour');
  select last_seen_at, last_seen_by into seen_at, seen_by from public.dispatch_assets where id = a_s;
  perform public.dispatch_asset_correct(a_s, jsonb_build_object('owner_kind', 'vendor', 'owner_id', vend::text, 'condition', 'out_of_service'));
  select * into a from public.dispatch_assets where id = a_s;
  if a.last_seen_at is distinct from seen_at or a.last_seen_by is distinct from seen_by or seen_at is distinct from now() - interval '1 hour' then
    raise exception 'dispatch_asset_correct moved last seen from % to %', seen_at, a.last_seen_at; end if;
  insert into public.dispatch_asset_events (id, company, asset_id, event_type, to_kind, to_id, occurred_at) values (e_after, 'adchem', a_s, 'sighted', 'site', 'T007-S', now() - interval '30 minutes');
  if (select applied from public.dispatch_asset_events where id = e_after) is distinct from true
     or (select last_seen_at from public.dispatch_assets where id = a_s) is distinct from now() - interval '30 minutes' then
    raise exception 'an event older than a correction but newer than the last sighting did not apply'; end if;
  -- a created event sets the fill it names
  insert into public.dispatch_assets (id, company, serial, container_type_id, location_kind, location_id) values (a_c, 'adchem', 'T7CREATED', t50, 'hub', 'EB');
  insert into public.dispatch_asset_events (company, asset_id, event_type, to_kind, to_id, fill_after) values ('adchem', a_c, 'created', 'hub', 'EB', 'full');
  select * into a from public.dispatch_assets where id = a_c;
  if a.fill_state <> 'full' or a.location_kind <> 'hub' or a.location_id <> 'EB' or a.last_seen_by is distinct from mg then
    raise exception 'a created event with fill full left the asset % at % % seen by %', a.fill_state, a.location_kind, a.location_id, a.last_seen_by; end if;
  ok := false;
  begin perform public.dispatch_asset_correct(a_s, jsonb_build_object('owner_kind', 'vendor', 'owner_id', gen_random_uuid()::text));
  exception when others then ok := sqlerrm = 'owner not found in this company'; end;
  if not ok then raise exception 'an unknown vendor became an owner'; end if;
  -- fills: 50lb at EB writes -50 lb of Carbon Dioxide at EB; the dewar (no fill_lb) writes none; both become full
  insert into public.dispatch_asset_events (id, company, asset_id, event_type) values (e_f, 'adchem', a_f, 'filled'), (e_d, 'adchem', a_d, 'filled');
  -- occurred_at: a phone time in the future becomes now
  insert into public.dispatch_asset_events (company, asset_id, event_type, note, occurred_at) values ('adchem', a_f, 'loaded', 't007-future', now() + interval '1 day');
  -- events are append-only (no update or delete policy; the catalog check below covers delete — the MCP holds any batch that
  -- carries a delete statement for a confirmation, so the test never sends one)
  update public.dispatch_asset_events set note = 'x' where id = e_f;
  get diagnostics n = row_count;  if n <> 0 then raise exception 'manager updated an event'; end if;
  select count(*) into n_stock from public.dispatch_stock_movements where company = 'adchem';
  -- a fill at a site or at a vendor writes no stock row (only a hub fill draws the bulk down)
  insert into public.dispatch_assets (id, company, serial, container_type_id, location_kind, location_id) values (a_v, 'adchem', 'T7ATVEND', t50, 'vendor', vend::text);
  insert into public.dispatch_asset_events (id, company, asset_id, event_type) values (e_ss, 'adchem', a_s, 'filled'), (e_sv, 'adchem', a_v, 'filled');
  if (select count(*) from public.dispatch_stock_movements where asset_event_id in (e_ss, e_sv)) <> 0 then raise exception 'a fill at a site or vendor wrote a stock row'; end if;
  -- clients insert stock movements, but never a fill row (those come only from the event trigger)
  insert into public.dispatch_stock_movements (company, hub, product, qty, unit, reason) values ('adchem', 'EB', 'Carbon Dioxide', 1000, 'lb', 'received');
  ok := false;
  begin insert into public.dispatch_stock_movements (company, hub, product, qty, unit, reason) values ('adchem', 'EB', 'Carbon Dioxide', -50, 'lb', 'filled');
  exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'a client wrote a filled stock row'; end if;
  -- a late event (older than the asset's last sighting) stays as history and does not move the asset
  insert into public.dispatch_asset_events (company, asset_id, event_type, from_kind, from_id, to_kind, to_id, occurred_at) values
    ('adchem', a_late, 'collected', 'site', 'T007-S', 'hub', 'LA', now() - interval '1 hour');
  insert into public.dispatch_asset_events (id, company, asset_id, event_type, from_kind, from_id, to_kind, to_id, occurred_at, note) values
    (e_late, 'adchem', a_late, 'delivered', 'hub', 'LA', 'site', 'T007-S', now() - interval '3 hours', 't007-late');
  -- the late one is marked applied = false (the server reads it back and warns); the one before it applied; a caller cannot set it
  if (select applied from public.dispatch_asset_events where id = e_late) is distinct from false then raise exception 'a late event was not marked applied = false'; end if;
  if (select count(*) from public.dispatch_asset_events where asset_id = a_late and applied) <> 1 then raise exception 'the in-time event on the late asset is not applied'; end if;
  insert into public.dispatch_asset_events (company, asset_id, event_type, to_kind, to_id, applied, note) values ('adchem', a_f, 'sighted', 'hub', 'EB', false, 't007-applied');
  if (select applied from public.dispatch_asset_events where note = 't007-applied') is distinct from true then raise exception 'a caller set applied'; end if;
  select * into a from public.dispatch_assets where id = a_late;
  if a.location_kind <> 'hub' or a.location_id <> 'LA' or a.fill_state <> 'empty' or a.last_seen_at is distinct from now() - interval '1 hour' then
    raise exception 'a late delivery moved the asset: % % % %', a.location_kind, a.location_id, a.fill_state, a.last_seen_at; end if;
  if (select count(*) from public.dispatch_asset_events where asset_id = a_late and note = 't007-late') <> 1 then raise exception 'the late event was not kept'; end if;
  -- serials: uppercased, spaces and hyphens removed (' ab-12 34 ' stores AB1234); unique per company whatever the case. created_by is always the caller; a new row has no last-seen
  insert into public.dispatch_assets (company, serial, container_type_id, location_kind, location_id, created_by, last_seen_at, last_seen_by)
    values ('adchem', ' ab-12 34 ', t50, 'hub', 'EB', sa, now(), sa) returning id into a_ab;
  ok := false;
  begin insert into public.dispatch_assets (company, serial, location_kind, location_id) values ('adchem', 'AB1234', 'hub', 'EB');
  exception when unique_violation then ok := true; end;
  if not ok then raise exception 'a second AB1234 was accepted'; end if;
  ok := false;
  begin insert into public.dispatch_assets (company, serial, location_kind, location_id) values ('adchem', 'ab1234', 'hub', 'LA');
  exception when unique_violation then ok := true; end;
  if not ok then raise exception 'a lowercase ab1234 was accepted'; end if;
  ok := false;
  begin insert into public.dispatch_assets (company, serial, location_kind, location_id) values ('adchem', '   ', 'hub', 'EB');
  exception when others then ok := sqlerrm = 'serial is required'; end;
  if not ok then raise exception 'a blank serial was accepted'; end if;
  ok := false;
  begin insert into public.dispatch_assets (company, serial, container_type_id, location_kind, location_id) values ('adchem', 'T7XTYPE', tn, 'hub', 'EB');
  exception when others then ok := sqlerrm = 'container type not found in this company'; end;
  if not ok then raise exception 'an adchem asset took a north container type'; end if;
  reset role;
  select * into a from public.dispatch_assets where id = a_s;
  if a.owner_kind <> 'vendor' or a.owner_id <> vend::text or a.condition <> 'out_of_service' or a.location_id <> 'T007-S' or a.notes <> 'dented' then
    raise exception 'correct left the asset % % % %', a.owner_kind, a.owner_id, a.condition, a.location_id; end if;
  if (select count(*) from public.dispatch_asset_events where asset_id = a_s and event_type = 'corrected' and note = 'owner/condition corrected' and recorded_by = mg) <> 1 then
    raise exception 'correct did not write one corrected event'; end if;
  select * into lg from public.dispatch_log where table_name = 'dispatch_assets' and row_id = a_s::text and changes ? 'owner_kind' order by id desc limit 1;
  if not found or lg.who is distinct from mg or lg.changes->'owner_kind'->>'from' <> 'customer' or lg.changes->'owner_kind'->>'to' <> 'vendor' then
    raise exception 'owner change not logged with changes'; end if;
  if coalesce(current_setting('dispatch.asset_correct', true), '') <> '' or coalesce(current_setting('dispatch.apply_event', true), '') <> '' then
    raise exception 'a guard flag was left set'; end if;
  if (select fill_state from public.dispatch_assets where id = a_f) <> 'full' or (select fill_state from public.dispatch_assets where id = a_d) <> 'full' then
    raise exception 'filled did not make the containers full'; end if;
  select * into st from public.dispatch_stock_movements where asset_event_id = e_f;
  if not found or st.hub <> 'EB' or st.product <> 'Carbon Dioxide' or st.container <> '' or st.item <> '' or st.qty <> -50 or st.unit <> 'lb' or st.reason <> 'filled' or st.recorded_by is distinct from mg then
    raise exception 'fill draw-down row wrong: % % % % %', st.hub, st.product, st.qty, st.unit, st.reason; end if;
  if (select count(*) from public.dispatch_stock_movements where asset_event_id = e_d) <> 0 then raise exception 'a dewar with no fill_lb wrote a stock row'; end if;
  if n_stock <> 1 then raise exception 'manager reads % stock rows (want 1)', n_stock; end if;
  if (select occurred_at from public.dispatch_asset_events where note = 't007-future') <> now() then raise exception 'a future phone time was kept'; end if;
  select * into a from public.dispatch_assets where id = a_ab;
  if a.serial <> 'AB1234' then raise exception 'serial not normalised: %', a.serial; end if;
  if (select count(*) from public.dispatch_assets where id = a_ab and serial = 'AB1234') <> 1 then raise exception ''' ab-12 34 '' did not store AB1234'; end if;
  if a.created_by is distinct from mg or a.last_seen_at is not null or a.last_seen_by is not null then
    raise exception 'insert kept created_by % / last seen % %', a.created_by, a.last_seen_at, a.last_seen_by; end if;
  ok := false;
  begin update public.dispatch_assets set company = 'north' where id = a_f;
  exception when others then ok := sqlerrm = 'company cannot change'; end;
  if not ok then raise exception 'an asset moved company'; end if;

  -- ---- coordinator without switches: counts, no serials, no events, no change rows; vendors readable, not writable ----
  perform set_config('request.jwt.claims', json_build_object('sub', cn, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n_counts from public.dispatch_asset_counts_for('adchem');
  if n_counts < 1 then raise exception 'coordinator gets no counts'; end if;
  if (select coalesce(sum(x.n), 0) from public.dispatch_asset_counts_for('adchem') x where x.container_type_id = t50 and x.fill_state = 'full' and x.hub = 'EB') < 1 then
    raise exception 'counts miss the full 50lb at EB'; end if;
  if (select count(*) from public.dispatch_asset_counts_for('north')) <> 0 then raise exception 'coordinator gets north counts'; end if;
  if (select count(*) from public.dispatch_stock_settings) <> 0 then raise exception 'coordinator without switches reads stock settings'; end if;
  select (select count(*) from public.dispatch_assets) + (select count(*) from public.dispatch_asset_events) + (select count(*) from public.dispatch_asset_counts)
       + (select count(*) from public.dispatch_stock_movements) + (select count(*) from public.dispatch_log where table_name in ('dispatch_assets','dispatch_asset_events','dispatch_stock_movements','dispatch_stock_settings')) into n;
  if n <> 0 then raise exception 'coordinator without switches reads % asset rows', n; end if;
  if (select count(*) from public.dispatch_vendors where id = vend) <> 1 then raise exception 'coordinator cannot read vendors'; end if;
  ok := false;
  begin insert into public.dispatch_vendors (company, name) values ('adchem', 'T007 Rogue');
  exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'coordinator added a vendor'; end if;
  ok := false;
  begin perform public.dispatch_asset_correct(a_f, '{"notes":"x"}');
  exception when others then ok := sqlerrm = 'not allowed'; end;
  if not ok then raise exception 'coordinator corrected an asset'; end if;
  ok := false;
  begin insert into public.dispatch_asset_events (company, asset_id, event_type) values ('adchem', a_f, 'sighted');
  exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'coordinator recorded an event'; end if;
  reset role;

  -- ---- storage: a driver uploads under adchem/asset/new/ and reads it back; north's driver cannot; cn reads nothing ----
  photo := 'adchem/asset/new/' || gen_random_uuid() || '.jpg';
  perform set_config('request.jwt.claims', json_build_object('sub', dr, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into storage.objects (bucket_id, name, owner_id) values ('dispatch-docs', photo, dr::text);
  if (select count(*) from storage.objects where bucket_id = 'dispatch-docs' and name = photo) <> 1 then raise exception 'driver cannot read own asset photo'; end if;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', nd, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := false;
  begin insert into storage.objects (bucket_id, name, owner_id) values ('dispatch-docs', 'adchem/asset/new/' || gen_random_uuid() || '.jpg', nd::text);
  exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'north driver uploaded under adchem/asset/'; end if;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', cn, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := false;
  begin insert into storage.objects (bucket_id, name, owner_id) values ('dispatch-docs', 'adchem/asset/new/' || gen_random_uuid() || '.jpg', cn::text);
  exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'coordinator without manage_assets uploaded an asset photo'; end if;
  if (select count(*) from storage.objects where bucket_id = 'dispatch-docs' and name like 'adchem/asset/%') <> 0 then raise exception 'coordinator reads asset photos'; end if;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', mg, 'role', 'authenticated')::text, true);
  set local role authenticated;
  if (select count(*) from storage.objects where bucket_id = 'dispatch-docs' and name = photo) <> 1 then raise exception 'view_assets cannot read the asset photo'; end if;
  reset role;
  -- 006's document policies no longer reach asset photos: a view_documents + manage_documents holder reads none
  perform set_config('request.jwt.claims', json_build_object('sub', vd, 'role', 'authenticated')::text, true);
  set local role authenticated;
  if (select count(*) from storage.objects where bucket_id = 'dispatch-docs' and name like 'adchem/asset/%') <> 0 then raise exception 'a view_documents holder reads asset photos'; end if;
  reset role;
  -- delete rules from the catalog (see the note at the event checks): events and stock movements have no update/delete policy;
  -- the three asset policies exist; every other dispatch-docs policy excludes asset/ (read, delete) or admits only document/ and
  -- capture/ (write), so asset photos are deleted only by manage_assets; no asset policy allows update
  if (select count(*) from pg_policies where schemaname = 'public' and tablename in ('dispatch_asset_events','dispatch_stock_movements') and cmd in ('UPDATE','DELETE','ALL')) <> 0 then
    raise exception 'events or stock movements have an update/delete policy'; end if;
  if (select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'dispatch assets delete' and cmd = 'DELETE'
        and qual like '%''asset''%' and qual like '%manage_assets%' and qual not like '%driver%') <> 1 then
    raise exception 'asset photo delete policy is not manage_assets only'; end if;
  if (select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'dispatch assets%') <> 3 then
    raise exception 'the three asset photo policies are not all there'; end if;
  if (select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects'
        and coalesce(qual, '') || coalesce(with_check, '') like '%dispatch-docs%' and policyname not like 'dispatch assets%'
        and coalesce(qual, '') || coalesce(with_check, '') not like '%IS DISTINCT FROM ''asset''%'
        and not (cmd = 'INSERT' and with_check like '%''document''%' and with_check like '%''capture''%' and with_check not like '%''asset''%')) <> 0 then
    raise exception 'a document storage policy still reaches asset photos'; end if;
  if (select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'dispatch assets%' and cmd in ('UPDATE','ALL')) <> 0 then
    raise exception 'an asset photo policy allows update'; end if;

  -- ---- second company: north's driver and super admin see only north; cannot write against adchem ----
  perform set_config('request.jwt.claims', json_build_object('sub', nd, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select (select count(*) from public.dispatch_assets where company = 'adchem') + (select count(*) from public.dispatch_asset_events where company = 'adchem')
       + (select count(*) from public.dispatch_vendors where company = 'adchem') + (select count(*) from public.dispatch_container_types where company = 'adchem')
       + (select count(*) from public.dispatch_stock_movements where company = 'adchem') + (select count(*) from public.dispatch_stock_settings where company = 'adchem')
       + (select count(*) from public.dispatch_asset_counts_for('adchem')) into n;
  if n <> 0 then raise exception 'north driver sees % adchem rows', n; end if;
  if (select count(*) from public.dispatch_assets where id = a_n) <> 1 then raise exception 'north driver misses the asset at their hub'; end if;
  ok := false;
  begin insert into public.dispatch_asset_events (company, asset_id, event_type, to_kind, to_id) values ('adchem', a_hub, 'sighted', 'hub', 'EB');
  exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'north driver recorded an adchem event'; end if;
  ok := false;
  begin perform * from public.dispatch_asset_by_serial('adchem', 'T7OTHER01');
  exception when others then ok := sqlerrm = 'not allowed'; end;
  if not ok then raise exception 'north driver looked up an adchem serial'; end if;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', nm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select (select count(*) from public.dispatch_assets where company = 'adchem') + (select count(*) from public.dispatch_asset_events where company = 'adchem')
       + (select count(*) from public.dispatch_vendors where company = 'adchem') + (select count(*) from public.dispatch_stock_movements where company = 'adchem')
       + (select count(*) from public.dispatch_container_types where company = 'adchem') + (select count(*) from public.dispatch_stock_settings where company = 'adchem')
       + (select count(*) from public.dispatch_log where company = 'adchem' and table_name like 'dispatch_asset%') into n;
  if n <> 0 then raise exception 'north super admin sees % adchem rows', n; end if;
  if (select count(*) from public.dispatch_assets) <> 1 then raise exception 'north super admin does not see exactly its one asset'; end if;
  ok := false;
  begin insert into public.dispatch_asset_events (company, asset_id, event_type) values ('north', a_hub, 'sighted');
  exception when others then ok := sqlerrm = 'asset not found in this company'; end;
  if not ok then raise exception 'north recorded an event on an adchem asset'; end if;
  ok := false;
  begin insert into public.dispatch_assets (company, serial, location_kind, location_id) values ('north', 'T7NX', 'site', 'T007-S');
  exception when others then ok := sqlerrm = 'location not found in this company'; end;
  if not ok then raise exception 'north placed an asset at an adchem site'; end if;
  ok := false;
  begin perform public.dispatch_asset_correct(a_f, '{"notes":"x"}');
  exception when others then ok := sqlerrm = 'not allowed'; end;
  if not ok then raise exception 'north super admin corrected an adchem asset'; end if;
  reset role;
  perform set_config('request.jwt.claims', '', true);

  select count(*) into n_events from public.dispatch_asset_events where company = 'adchem';
  raise exception 'VERIFY-OK 007: types=% driver_sees=% events=% stock_rows=% coordinator_count_rows=%', n_types, n_dr, n_events, n_stock, n_counts;
end $t$;
