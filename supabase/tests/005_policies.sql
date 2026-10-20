-- AdChem Ops — 005 policy test. Run inside a transaction that is rolled back:  begin; <this file> rollback;
-- Creates throw-away users (super admin, plain admin, coordinator, driver hub EB, a member of a second company `north`),
-- then acts as each one (role authenticated + request.jwt.claims, which auth.uid() reads) and raises on any wrong answer.
-- Ends with NOTICE '005 policies ok'. Nothing persists: the caller rolls back.
do $t$
declare
  su uuid := gen_random_uuid(); adm uuid := gen_random_uuid(); co uuid := gen_random_uuid();
  dr uuid := gen_random_uuid(); nm uuid := gen_random_uuid();
  cust uuid; act_other uuid; act_mine uuid; n int; s text; s2 text; ok boolean; lg record;
begin
  -- ---- setup (as the database owner; RLS does not apply) ----
  insert into public.companies (id, name, short_name) values ('north', 'North Test Co', 'North') on conflict (id) do nothing;
  -- the shared sign-up trigger (handle_new_user) refuses an address without an invite, so invite each test user first
  insert into public.dispatch_invites (email, name, role, hub, company) values
    ('t005-super@example.test','T Super','admin','','adchem'), ('t005-admin@example.test','T Admin','admin','','adchem'),
    ('t005-coord@example.test','T Coord','coordinator','','adchem'), ('t005-driver@example.test','T Driver','driver','EB','adchem'),
    ('t005-north@example.test','T North','admin','','north')
    on conflict (email) do update set role = excluded.role, hub = excluded.hub, company = excluded.company, accepted_at = null, revoked_at = null;
  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data, created_at, updated_at)
  select u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', e, '{}'::jsonb, '{}'::jsonb, now(), now()
    from (values (su,'t005-super@example.test'), (adm,'t005-admin@example.test'), (co,'t005-coord@example.test'),
                 (dr,'t005-driver@example.test'), (nm,'t005-north@example.test')) v(u, e);
  insert into public.dispatch_users (user_id, email, name, role, hub, active) values
    (su,'t005-super@example.test','T Super','admin','',true), (adm,'t005-admin@example.test','T Admin','admin','',true),
    (co,'t005-coord@example.test','T Coord','coordinator','',true), (dr,'t005-driver@example.test','T Driver','driver','EB',true),
    (nm,'t005-north@example.test','T North','admin','',true)
    on conflict (user_id) do update set role = excluded.role, hub = excluded.hub, active = true;
  insert into public.dispatch_members (user_id, company, role, hub, active) values
    (su,'adchem','admin','',true), (adm,'adchem','admin','',true), (co,'adchem','coordinator','',true),
    (dr,'adchem','driver','EB',true), (nm,'north','admin','',true)
    on conflict (user_id, company) do update set role = excluded.role, hub = excluded.hub, active = true;

  insert into public.dispatch_customers (company, customer_id, name, legal_name, primary_hub, billing_street, billing_city, billing_state)
    values ('adchem', 'T005-A', 'T005 Test Customer', 'T005 Test Customer LLC', 'EB', '1 Test St', 'Richmond', 'CA') returning id into cust;
  insert into public.dispatch_sites (company, site_key, customer, addr, hub, customer_id) values
    ('adchem', 'T005-EB', 'T005 Test Customer', '1 Test St, Richmond', 'EB', cust),
    ('adchem', 'T005-LA', 'T005 Test Customer', '2 Test Ave, Los Angeles', 'LA', cust);
  insert into public.dispatch_site_hub_notes (company, site_key, hub, scale_on_route, route_notes) values
    ('adchem', 'T005-EB', 'EB', true, 'scale on I-80'), ('adchem', 'T005-LA', 'LA', false, 'LA only');
  insert into public.dispatch_contacts (company, customer_id, site_key, type, first_name, phone, email) values
    ('adchem', cust, 'T005-EB', 'receiving', 'Rita', '510-555-0101', ''),
    ('adchem', cust, 'T005-LA', 'site_manager', 'Sam', '213-555-0102', ''),
    ('adchem', cust, null, 'billing', 'Bill', '', 'ap@example.test'),
    ('adchem', cust, null, 'ap', 'Ann', '', 'ann@example.test'),
    ('adchem', cust, 'T005-EB', 'owner', 'Otto', '510-555-0103', '');
  insert into public.dispatch_customer_activity (company, customer_id, method, summary, logged_by)
    values ('adchem', cust, 'call', 'coordinator called', co) returning id into act_other;
  -- ---- audit ignores synced_at: a feed re-sync that changes nothing else writes no log row; a real feed change still logs ----
  select count(*) into n from public.dispatch_log;
  update public.dispatch_sites set synced_at = now() + interval '1 hour' where company = 'adchem' and site_key = 'T005-EB';
  if (select count(*) from public.dispatch_log) <> n then raise exception 'synced_at-only site update wrote a dispatch_log row'; end if;
  update public.dispatch_sites set synced_at = now() + interval '2 hours', hours = '7-3' where company = 'adchem' and site_key = 'T005-EB';
  select * into lg from public.dispatch_log order by id desc limit 1;
  if (select count(*) from public.dispatch_log) <> n + 1 or lg.table_name <> 'dispatch_sites' or lg.row_id <> 'T005-EB'
     or lg.changes->'hours'->>'to' is distinct from '7-3' or lg.changes ? 'synced_at' then
    raise exception 'feed column change not logged correctly: %', lg.changes; end if;
  update public.dispatch_members set is_super_admin = true where user_id = su and company = 'adchem';
  update public.dispatch_company_settings set data = jsonb_set(data, '{nextCustomerNumber}', '101') where company = 'adchem';

  -- ---- driver (hub EB) ----
  perform set_config('request.jwt.claims', json_build_object('sub', dr, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.dispatch_customers;  if n <> 0 then raise exception 'driver sees % customers', n; end if;
  select count(*) into n from public.dispatch_customer_status;  if n <> 0 then raise exception 'driver sees % customer status rows', n; end if;
  select count(*) into n from public.dispatch_sites where hub = 'LA';  if n <> 0 then raise exception 'driver sees % LA sites', n; end if;
  select count(*) into n from public.dispatch_sites where hub = 'EB';  if n < 1 then raise exception 'driver sees no EB sites'; end if;
  select count(*) into n from public.dispatch_site_hub_notes;  if n <> 1 then raise exception 'driver sees % hub notes (want 1, EB)', n; end if;
  select count(*) into n from public.dispatch_contacts where type in ('billing','ap','owner');
  if n <> 0 then raise exception 'driver sees % billing/ap/owner contacts', n; end if;
  select count(*) into n from public.dispatch_contacts where type = 'receiving' and site_key in (select site_key from public.dispatch_sites where hub = 'EB');
  if n < 1 then raise exception 'driver does not see the EB receiving contact'; end if;
  select count(*) into n from public.dispatch_contacts;  if n <> 1 then raise exception 'driver sees % contacts (want 1)', n; end if;
  insert into public.dispatch_customer_activity (company, customer_id, site_key, method, summary, kind, status)
    values ('adchem', cust, 'T005-EB', 'app', 'gate code changed', 'driver_note', 'approved') returning id, status into act_mine, s;
  if s <> 'pending' then raise exception 'driver note status is % (want pending)', s; end if;
  select count(*) into n from public.dispatch_customer_activity where id = act_mine;  if n <> 1 then raise exception 'driver cannot read own note'; end if;
  select count(*) into n from public.dispatch_customer_activity where id = act_other;  if n <> 0 then raise exception 'driver reads another user''s activity'; end if;
  update public.dispatch_customer_activity set status = 'approved' where id = act_mine;
  get diagnostics n = row_count;  if n <> 0 then raise exception 'driver approved own note'; end if;
  reset role;

  -- ---- coordinator without manage_customers ----
  perform set_config('request.jwt.claims', json_build_object('sub', co, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.dispatch_customers;  if n < 1 then raise exception 'coordinator cannot read customers'; end if;
  select profile_complete into n from public.dispatch_customer_status where id = cust;
  if n is distinct from 10 then raise exception 'profile_complete is % (want 10)', n; end if;
  ok := false;
  begin insert into public.dispatch_customers (company, name) values ('adchem', 'should fail');
  exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'coordinator without manage_customers inserted a customer'; end if;
  ok := false;
  begin update public.dispatch_customers set notes = 'should fail' where id = cust;
  exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'coordinator without manage_customers updated a customer'; end if;
  ok := false;
  begin perform public.dispatch_set_permissions(co, 'adchem', '{"manage_customers":true}');
  exception when others then ok := sqlerrm = 'not allowed'; end;
  if not ok then raise exception 'coordinator granted itself permissions'; end if;
  reset role;

  -- ---- plain admin: cannot make super admins, cannot change a super admin's permissions ----
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := false;
  begin perform public.dispatch_set_super_admin(co, 'adchem', true);
  exception when others then ok := sqlerrm = 'not allowed'; end;
  if not ok then raise exception 'plain admin called dispatch_set_super_admin'; end if;
  ok := false;
  begin perform public.dispatch_set_permissions(su, 'adchem', '{}');
  exception when others then ok := sqlerrm = 'not allowed'; end;
  if not ok then raise exception 'plain admin changed a super admin''s permissions'; end if;
  reset role;

  -- ---- super admin: grants permissions and super admin ----
  perform set_config('request.jwt.claims', json_build_object('sub', su, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.dispatch_set_permissions(co, 'adchem', '{"manage_customers":true}');
  perform public.dispatch_set_super_admin(adm, 'adchem', true);
  reset role;
  if not (select is_super_admin from public.dispatch_members where user_id = adm and company = 'adchem') then raise exception 'super admin not set'; end if;
  if not (select (permissions->>'manage_customers')::boolean from public.dispatch_members where user_id = co and company = 'adchem') then raise exception 'permissions not set'; end if;
  select count(*) into n from public.dispatch_log where who = su and what in ('permissions','super_admin');
  if n <> 2 then raise exception 'permission RPCs logged % rows (want 2)', n; end if;

  -- ---- coordinator with manage_customers: inserts get ADC-0101, ADC-0102; update is audited ----
  perform set_config('request.jwt.claims', json_build_object('sub', co, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into public.dispatch_customers (company, name) values ('adchem', 'T005 New One') returning customer_id into s;
  insert into public.dispatch_customers (company, name) values ('adchem', 'T005 New Two') returning customer_id into s2;
  if s <> 'ADC-0101' or s2 <> 'ADC-0102' then raise exception 'customer ids % / % (want ADC-0101 / ADC-0102)', s, s2; end if;
  update public.dispatch_customers set billing_zip = '94801', updated_at = now(), updated_by = co where id = cust;
  get diagnostics n = row_count;  if n <> 1 then raise exception 'coordinator with manage_customers could not update'; end if;
  reset role;
  if (select (data->>'nextCustomerNumber')::int from public.dispatch_company_settings where company = 'adchem') <> 103 then raise exception 'nextCustomerNumber not bumped to 103'; end if;
  select * into lg from public.dispatch_log order by id desc limit 1;
  if lg.what <> 'change' or lg.table_name <> 'dispatch_customers' or lg.row_id <> cust::text or lg.who is distinct from co
     or lg.changes->'billing_zip'->>'to' is distinct from '94801' or lg.changes->'billing_zip'->>'from' is distinct from ''
     or lg.changes ? 'updated_at' or lg.changes ? 'updated_by' then
    raise exception 'audit row wrong: % % % %', lg.what, lg.table_name, lg.who, lg.changes; end if;

  -- ---- customer numbers past 9999 are not truncated ----
  update public.dispatch_company_settings set data = jsonb_set(data, '{nextCustomerNumber}', '10000') where company = 'adchem';
  insert into public.dispatch_customers (company, name) values ('adchem', 'T005 Ten Thousand') returning customer_id into s;
  if s is distinct from 'ADC-10000' then raise exception 'customer id % (want ADC-10000)', s; end if;

  -- ---- a member of `north` only sees nothing of adchem ----
  perform set_config('request.jwt.claims', json_build_object('sub', nm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select (select count(*) from public.dispatch_customers where company = 'adchem') + (select count(*) from public.dispatch_contacts where company = 'adchem')
       + (select count(*) from public.dispatch_customer_activity where company = 'adchem') + (select count(*) from public.dispatch_site_hub_notes where company = 'adchem')
       + (select count(*) from public.dispatch_sites where company = 'adchem') + (select count(*) from public.dispatch_customer_status where company = 'adchem')
    into n;
  if n <> 0 then raise exception 'north member sees % adchem rows', n; end if;
  if public.dispatch_perm_in('adchem', 'manage_customers') or public.dispatch_is_super_in('adchem') then raise exception 'north member has adchem permissions'; end if;
  reset role;

  -- ---- a deactivated member no longer reads the activity they logged ----
  update public.dispatch_members set active = false where user_id = dr and company = 'adchem';
  perform set_config('request.jwt.claims', json_build_object('sub', dr, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.dispatch_customer_activity;  if n <> 0 then raise exception 'deactivated driver reads % activity rows', n; end if;
  reset role;

  raise notice '005 policies ok';
end $t$;
