-- AdChem Ops — 006 policy test. Run inside a transaction that is rolled back:  begin; <006> <006 again> <this file> rollback;
-- Creates throw-away users (super admin sa, coordinator co with view_documents, coordinator cn with nothing, driver dr hub EB,
-- an admin nm of a second company `north`), then acts as each one (role authenticated + request.jwt.claims, which auth.uid()
-- reads) and raises on any wrong answer. Ends with NOTICE '006 policies ok'. Nothing persists: the caller rolls back.
do $t$
declare
  sa uuid := gen_random_uuid(); co uuid := gen_random_uuid(); cn uuid := gen_random_uuid();
  dr uuid := gen_random_uuid(); nm uuid := gen_random_uuid();
  cust uuid; l1 uuid := gen_random_uuid(); l2 uuid := gen_random_uuid(); l3 uuid := gen_random_uuid(); psa uuid := gen_random_uuid();
  cdl uuid := gen_random_uuid(); cap uuid := gen_random_uuid(); cap2 uuid := gen_random_uuid(); cap3 uuid := gen_random_uuid();
  n int; s text; ok boolean; d record; v record; lg record; dt date; j bigint;
begin
  -- ---- setup (as the database owner; RLS does not apply) ----
  insert into public.companies (id, name, short_name) values ('north', 'North Test Co', 'North') on conflict (id) do nothing;
  insert into public.dispatch_invites (email, name, role, hub, company) values
    ('t006-sa@example.test','T SA','admin','','adchem'), ('t006-co@example.test','T CO','coordinator','','adchem'),
    ('t006-cn@example.test','T CN','coordinator','','adchem'), ('t006-dr@example.test','T DR','driver','EB','adchem'),
    ('t006-nm@example.test','T NM','admin','','north')
    on conflict (email) do update set role = excluded.role, hub = excluded.hub, company = excluded.company, accepted_at = null, revoked_at = null;
  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data, created_at, updated_at)
  select u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', e, '{}'::jsonb, '{}'::jsonb, now(), now()
    from (values (sa,'t006-sa@example.test'), (co,'t006-co@example.test'), (cn,'t006-cn@example.test'),
                 (dr,'t006-dr@example.test'), (nm,'t006-nm@example.test')) v(u, e);
  insert into public.dispatch_users (user_id, email, name, role, hub, active) values
    (sa,'t006-sa@example.test','T SA','admin','',true), (co,'t006-co@example.test','T CO','coordinator','',true),
    (cn,'t006-cn@example.test','T CN','coordinator','',true), (dr,'t006-dr@example.test','T Driver','driver','EB',true),
    (nm,'t006-nm@example.test','T NM','admin','',true)
    on conflict (user_id) do update set name = excluded.name, role = excluded.role, hub = excluded.hub, active = true;
  insert into public.dispatch_members (user_id, company, role, hub, active) values
    (sa,'adchem','admin','',true), (co,'adchem','coordinator','',true), (cn,'adchem','coordinator','',true),
    (dr,'adchem','driver','EB',true), (nm,'north','admin','',true)
    on conflict (user_id, company) do update set role = excluded.role, hub = excluded.hub, active = true;
  update public.dispatch_members set is_super_admin = true where user_id = sa and company = 'adchem';
  update public.dispatch_members set permissions = '{"view_documents":true}' where user_id = co and company = 'adchem';
  update public.dispatch_members set permissions = '{}' where user_id = cn and company = 'adchem';
  update public.dispatch_members set permissions = '{"manage_documents":true,"view_documents":true}' where user_id = nm and company = 'north';
  update public.dispatch_members set is_super_admin = true where user_id = nm and company = 'north';
  perform set_config('dispatch.set_warnings', '1', true);   -- the warnings guard's flag (as dispatch_set_warnings sets it)
  update public.dispatch_company_settings set data = jsonb_set(data, '{warnDays}', '30') where company = 'adchem';
  perform set_config('dispatch.set_warnings', '', true);
  -- 8 of the 15 fields from the customer row itself (no sites, contacts or last_verified)
  insert into public.dispatch_customers (company, customer_id, name, legal_name, primary_hub, billing_street, billing_city, billing_state, billing_zip)
    values ('adchem', 'T006-A', 'T006 Customer', 'T006 Customer LLC', 'EB', '1 Test St', 'Richmond', 'CA', '94801') returning id into cust;

  -- ---- super admin files a license (10 days left), a signed PSA, a driver's CDL and the license's file ----
  perform set_config('request.jwt.claims', json_build_object('sub', sa, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into public.dispatch_documents (id, company, subject_type, subject_id, doc_type, number, expires, file_path, extra) values
    (l1, 'adchem', 'customer', cust::text, 'cannabis_license', 'C10-0001', current_date + 10, 'adchem/document/customer/' || cust || '/' || l1 || '/z.jpg', '{"entity_status_sos":"Active"}'),
    (psa, 'adchem', 'customer', cust::text, 'psa', '', null, null, '{"signed_customer":"2026-09-01","countersigned":"2026-09-02","effective_date":"2026-09-03"}'),
    (cdl, 'adchem', 'person', dr::text, 'cdl', 'D1234567', current_date + 100, 'adchem/document/person/' || dr || '/' || cdl || '/cdl.jpg', '{}');
  insert into storage.objects (bucket_id, name, owner_id) values ('dispatch-docs', 'adchem/document/customer/' || cust || '/' || l1 || '/z.jpg', sa::text);
  reset role;
  select * into lg from public.dispatch_log where table_name = 'dispatch_documents' and row_id = l1::text;
  if not found or lg.who is distinct from sa or lg.changes->'number'->>'to' is distinct from 'C10-0001' then raise exception 'license insert not audited'; end if;

  -- ---- coordinator with view_documents: reads both records and the file; sees the license as due in 10 days ----
  perform set_config('request.jwt.claims', json_build_object('sub', co, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.dispatch_documents where id in (l1, cdl);  if n <> 2 then raise exception 'co sees % of the license and CDL (want 2)', n; end if;
  select count(*) into n from storage.objects where bucket_id = 'dispatch-docs' and name like 'adchem/document/customer/%';
  if n <> 1 then raise exception 'co sees % document files (want 1)', n; end if;
  select * into d from public.dispatch_documents_due where id = l1;
  if not found or d.days_left is distinct from 10 or d.subject_name is distinct from 'T006 Customer' then raise exception 'documents_due for co: % %', d.days_left, d.subject_name; end if;
  select count(*) into n from public.dispatch_documents_due where id = cdl;  if n <> 0 then raise exception 'a CDL 100 days out is listed as due'; end if;
  select count(*) into n from public.dispatch_log where table_name = 'dispatch_documents';  if n < 1 then raise exception 'co cannot read document change rows'; end if;
  ok := false;
  begin insert into public.dispatch_documents (company, subject_type, subject_id, doc_type) values ('adchem', 'company', 'adchem', 'other');
  exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'co without manage_documents inserted a document'; end if;
  reset role;

  -- ---- coordinator without document permissions: no records, no files, no log rows — but the derived status ----
  perform set_config('request.jwt.claims', json_build_object('sub', cn, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.dispatch_documents;  if n <> 0 then raise exception 'cn sees % documents', n; end if;
  select count(*) into n from public.dispatch_documents_due;  if n <> 0 then raise exception 'cn sees % due documents', n; end if;
  select count(*) into n from storage.objects where bucket_id = 'dispatch-docs';  if n <> 0 then raise exception 'cn sees % document files', n; end if;
  select count(*) into n from public.dispatch_log where table_name = 'dispatch_documents';  if n <> 0 then raise exception 'cn reads % document change rows', n; end if;
  select * into v from public.dispatch_customer_status where id = cust;
  if v.license_status is distinct from 'expiring' or v.license_expires is distinct from current_date + 10 or v.license_number is distinct from 'C10-0001'
     or v.entity_status is distinct from 'Active' or v.psa_status is distinct from 'signed' or v.psa_effective is distinct from '2026-09-03'::date
     or v.profile_complete is distinct from 11 then
    raise exception 'customer status for cn: % % % % % % %', v.license_status, v.license_expires, v.license_number, v.entity_status, v.psa_status, v.psa_effective, v.profile_complete; end if;
  ok := false;
  begin perform public.dispatch_approve_capture(l1, '{}');
  exception when others then ok := sqlerrm = 'not allowed'; end;
  if not ok then raise exception 'cn approved a document'; end if;
  reset role;

  -- ---- driver: reads their own live CDL only; captures are write-only, pending, as themselves, under capture/ ----
  perform set_config('request.jwt.claims', json_build_object('sub', dr, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.dispatch_documents;  if n <> 1 then raise exception 'driver sees % documents (want 1, the CDL)', n; end if;
  select count(*) into n from public.dispatch_documents where id = cdl;  if n <> 1 then raise exception 'driver cannot read own CDL'; end if;
  select count(*) into n from public.dispatch_documents where subject_type = 'customer';  if n <> 0 then raise exception 'driver sees % customer documents', n; end if;
  select count(*) into n from public.dispatch_customer_status;  if n <> 0 then raise exception 'driver sees % customer status rows', n; end if;
  insert into public.dispatch_documents (id, company, subject_type, subject_id, doc_type, title, file_path, review_status, captured_order_id, captured_by)
    values (cap, 'adchem', 'customer', cust::text, 'other', 'Driver capture', 'adchem/capture/EB-261020-01/x.jpg', 'pending_review', 'EB-261020-01', sa);
  select count(*) into n from public.dispatch_documents where id = cap;  if n <> 0 then raise exception 'driver reads back own capture'; end if;
  insert into public.dispatch_documents (id, company, subject_type, subject_id, doc_type, file_path, review_status)
    values (cap2, 'adchem', 'customer', cust::text, 'other', 'adchem/capture/EB-261020-01/x2.jpg', 'pending_review'),
           (cap3, 'adchem', 'customer', cust::text, 'other', 'adchem/capture/EB-261020-01/x3.jpg', 'pending_review');
  ok := false;
  begin insert into public.dispatch_documents (company, subject_type, subject_id, doc_type, file_path, review_status)
    values ('adchem', 'customer', cust::text, 'cannabis_license', 'adchem/capture/EB-261020-01/l.jpg', 'live');
  exception when others then ok := sqlerrm = 'a driver capture must be sent for review'; end;
  if not ok then raise exception 'driver inserted a live document'; end if;
  ok := false;
  begin insert into public.dispatch_documents (company, subject_type, subject_id, doc_type, file_path, review_status)
    values ('adchem', 'person', dr::text, 'cdl', 'adchem/capture/EB-261020-01/p.jpg', 'pending_review');
  exception when others then ok := sqlerrm = 'a driver capture must be for a customer'; end;
  if not ok then raise exception 'driver inserted a person document'; end if;
  ok := false;
  begin insert into public.dispatch_documents (company, subject_type, subject_id, doc_type, file_path, review_status)
    values ('adchem', 'customer', cust::text, 'other', 'adchem/document/customer/' || cust || '/x/d.jpg', 'pending_review');
  exception when others then ok := sqlerrm = 'a driver capture must be filed under capture/'; end;
  if not ok then raise exception 'driver inserted a capture under document/'; end if;
  ok := false;
  begin update public.dispatch_documents set number = 'X' where id = cdl;
    get diagnostics n = row_count; ok := n = 0;
  exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'driver edited own CDL'; end if;
  -- files: capture/ yes, document/ no
  insert into storage.objects (bucket_id, name, owner_id) values ('dispatch-docs', 'adchem/capture/EB-261020-01/y.jpg', dr::text);
  ok := false;
  begin insert into storage.objects (bucket_id, name, owner_id) values ('dispatch-docs', 'adchem/document/customer/' || cust || '/x/z.jpg', dr::text);
  exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'driver uploaded under document/'; end if;
  select count(*) into n from storage.objects where bucket_id = 'dispatch-docs';  if n <> 0 then raise exception 'driver reads % document files', n; end if;
  reset role;
  select * into d from public.dispatch_documents where id = cap;
  if d.review_status <> 'pending_review' or d.captured_by is distinct from dr or d.captured_at is null then
    raise exception 'capture stored as % by % at %', d.review_status, d.captured_by, d.captured_at; end if;

  -- ---- a member of north cannot file a document against an adchem customer (subject guard) ----
  perform set_config('request.jwt.claims', json_build_object('sub', nm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := false;
  begin insert into public.dispatch_documents (company, subject_type, subject_id, doc_type) values ('north', 'customer', cust::text, 'cannabis_license');
  exception when others then ok := sqlerrm = 'document subject not found in this company'; end;
  if not ok then raise exception 'north filed a document against an adchem customer'; end if;
  ok := false;
  begin insert into public.dispatch_documents (company, subject_type, subject_id, doc_type) values ('north', 'company', 'adchem', 'other');
  exception when others then ok := sqlerrm = 'document subject not found in this company'; end;
  if not ok then raise exception 'north filed a company document for adchem'; end if;
  select (select count(*) from public.dispatch_documents where company = 'adchem') + (select count(*) from storage.objects where bucket_id = 'dispatch-docs') into n;
  if n <> 0 then raise exception 'north member sees % adchem documents/files', n; end if;
  reset role;
  ok := false;
  begin update public.dispatch_documents set company = 'north' where id = l1;
  exception when others then ok := sqlerrm = 'company cannot change'; end;
  if not ok then raise exception 'a document moved company'; end if;
  -- dispatch_keep_company on a table without customer_id (005's version failed every such update); customer_id still cannot change
  insert into public.dispatch_sites (company, site_key, customer, addr, hub) values ('adchem', 'T006-EB', 'T006 Customer', '1 Test St', 'EB');
  insert into public.dispatch_site_hub_notes (company, site_key, hub, route_notes) values ('adchem', 'T006-EB', 'EB', 'a');
  update public.dispatch_site_hub_notes set route_notes = 'b' where company = 'adchem' and site_key = 'T006-EB';
  get diagnostics n = row_count;  if n <> 1 then raise exception 'hub note update failed'; end if;
  ok := false;
  begin update public.dispatch_customers set customer_id = 'T006-B' where id = cust;
  exception when others then ok := sqlerrm = 'customer_id cannot change'; end;
  if not ok then raise exception 'customer_id changed on update'; end if;

  -- ---- two live licenses: status follows the latest expiry; approving a same-number capture supersedes the old one ----
  perform set_config('request.jwt.claims', json_build_object('sub', sa, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into public.dispatch_documents (id, company, subject_type, subject_id, doc_type, number, expires) values
    (l2, 'adchem', 'customer', cust::text, 'cannabis_license', 'C10-0002', current_date + 5),
    (l3, 'adchem', 'customer', cust::text, 'cannabis_license', '', null);
  select license_expires, license_number into v from public.dispatch_customer_status where id = cust;
  if v.license_expires is distinct from current_date + 10 or v.license_number is distinct from 'C10-0001' then
    raise exception 'two live licenses: status from % % (want the latest expiry)', v.license_number, v.license_expires; end if;
  if public.dispatch_approve_capture(cap, jsonb_build_object('doc_type','cannabis_license','number','C10-0001','expires',(current_date + 400)::text,'issued','2026-10-01')) is distinct from cap then
    raise exception 'approve did not return the id'; end if;
  -- an empty number supersedes nothing (l3 has none either)
  perform public.dispatch_approve_capture(cap2, '{"doc_type":"cannabis_license","number":""}');
  perform public.dispatch_reject_capture(cap3, 'blurry');
  -- only documents awaiting review can be approved or rejected
  ok := false;
  begin perform public.dispatch_approve_capture(l2, '{"number":"C10-0001"}');
  exception when others then ok := sqlerrm = 'not pending review'; end;
  if not ok then raise exception 'approved an already-live document'; end if;
  ok := false;
  begin perform public.dispatch_reject_capture(cap, 'x');
  exception when others then ok := sqlerrm = 'not pending review'; end;
  if not ok then raise exception 'rejected an already-live document'; end if;
  reset role;
  select * into d from public.dispatch_documents where id = l1;
  if d.review_status <> 'rejected' or d.notes not like '% superseded' then raise exception 'old license is % / %', d.review_status, d.notes; end if;
  select * into d from public.dispatch_documents where id = cap;
  if d.review_status <> 'live' or d.supersedes_id is distinct from l1 or d.checked_by is distinct from sa or d.checked_on is distinct from current_date
     or d.expires is distinct from current_date + 400 or d.issued is distinct from '2026-10-01'::date or d.doc_type <> 'cannabis_license' then
    raise exception 'approved capture: % % % % %', d.review_status, d.supersedes_id, d.checked_by, d.expires, d.doc_type; end if;
  if (select review_status from public.dispatch_documents where id = l2) <> 'live' then raise exception 'a different-number license was superseded'; end if;
  if (select review_status from public.dispatch_documents where id = l3) <> 'live' or (select supersedes_id from public.dispatch_documents where id = cap2) is not null then
    raise exception 'an empty number superseded a license'; end if;
  select * into d from public.dispatch_documents where id = cap3;
  if d.review_status <> 'rejected' or d.notes <> 'blurry' then raise exception 'rejected capture: % %', d.review_status, d.notes; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', cn, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select * into v from public.dispatch_customer_status where id = cust;
  if v.license_expires is distinct from current_date + 400 or v.license_status <> 'valid' then raise exception 'after approve the view shows % %', v.license_expires, v.license_status; end if;
  reset role;
  -- thresholds: expired is before today; expiring is before today + warnDays
  update public.dispatch_documents set review_status = 'rejected' where company = 'adchem' and subject_id = cust::text and doc_type = 'cannabis_license' and id <> cap;
  for dt, s in values (current_date - 1, 'expired'), (current_date, 'expiring'), (current_date + 29, 'expiring'), (current_date + 30, 'valid') loop
    update public.dispatch_documents set expires = dt where id = cap;
    perform set_config('request.jwt.claims', json_build_object('sub', cn, 'role', 'authenticated')::text, true);
    set local role authenticated;
    select license_status into v from public.dispatch_customer_status where id = cust;
    reset role;
    if v.license_status is distinct from s then raise exception 'expires % gives % (want %)', dt, v.license_status, s; end if;
  end loop;

  -- ---- warnings: super admin only, validated, logged ----
  perform set_config('request.jwt.claims', json_build_object('sub', co, 'role', 'authenticated')::text, true);
  set local role authenticated;
  -- an editor's direct settings write (DB.saveSettings' whole-object upsert) cannot change the three keys, but may change the rest
  ok := false;
  begin insert into public.dispatch_company_settings (company, data)
    select 'adchem', jsonb_set(data, '{expiryEmailRecipients}', '["evil@example.test"]') from public.dispatch_company_settings where company = 'adchem'
    on conflict (company) do update set data = excluded.data;
  exception when others then ok := sqlerrm = 'warnings settings change only through dispatch_set_warnings'; end;
  if not ok then raise exception 'co changed expiryEmailRecipients directly'; end if;
  ok := false;
  begin update public.dispatch_company_settings set data = data - 'warnDays' where company = 'adchem';
  exception when others then ok := sqlerrm = 'warnings settings change only through dispatch_set_warnings'; end;
  if not ok then raise exception 'co removed warnDays directly'; end if;
  insert into public.dispatch_company_settings (company, data)
    select 'adchem', data || '{"t006":"saved"}' from public.dispatch_company_settings where company = 'adchem'
    on conflict (company) do update set data = excluded.data;
  get diagnostics n = row_count;  if n <> 1 then raise exception 'co whole-object settings save failed'; end if;
  ok := false;
  begin perform public.dispatch_set_warnings('adchem', 30, '{}', '{}');
  exception when others then ok := sqlerrm = 'not allowed'; end;
  if not ok then raise exception 'co set warnings'; end if;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', sa, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.dispatch_set_warnings('adchem', 45, '{"cannabis_license":{"orderTime":true,"note":"call first"},"psa":{"orderTime":false,"note":""}}', array['ops@example.test']);
  ok := false;
  begin perform public.dispatch_set_warnings('adchem', 45, '{}', array['not-an-email']);
  exception when others then ok := sqlerrm = 'recipients must be email addresses'; end;
  if not ok then raise exception 'an invalid recipient was accepted'; end if;
  ok := false;
  begin perform public.dispatch_set_warnings('adchem', 0, '{}', '{}');
  exception when others then ok := sqlerrm = 'warn days must be 1-365'; end;
  if not ok then raise exception 'warn days 0 accepted'; end if;
  ok := false;
  begin perform public.dispatch_set_warnings('adchem', 30, '{"psa":{"orderTime":"yes","note":""}}', '{}');
  exception when others then ok := sqlerrm = 'each warning needs orderTime true/false and a note'; end;
  if not ok then raise exception 'a non-boolean orderTime was accepted'; end if;
  reset role;
  if coalesce(current_setting('dispatch.set_warnings', true), '') <> '' then raise exception 'dispatch_set_warnings left its flag set'; end if;
  select data into v from public.dispatch_company_settings where company = 'adchem';
  if v.data->>'t006' is distinct from 'saved' then raise exception 'co settings save not stored'; end if;
  if (v.data->>'warnDays') <> '45' or (v.data->'warnings'->'cannabis_license'->>'orderTime') <> 'true' or v.data->'expiryEmailRecipients' <> '["ops@example.test"]'::jsonb then
    raise exception 'warnings not written: %', v.data; end if;
  select * into lg from public.dispatch_log where what = 'warnings' and who = sa order by id desc limit 1;
  if not found or lg.table_name <> 'dispatch_company_settings' or lg.row_id <> 'adchem' or lg.changes->'warnDays'->>'from' <> '30' or lg.changes->'warnDays'->>'to' <> '45' then
    raise exception 'warnings log row wrong: %', lg.changes; end if;
  select count(*) into n from public.dispatch_log where what = 'warnings' and who = sa;  if n <> 1 then raise exception 'warnings logged % times (want 1)', n; end if;

  -- ---- expiry cron: the job is global, so no member (not even a super admin) schedules it; the owner does, and re-running replaces it ----
  foreach dr in array array[co, sa, nm] loop   -- dr reused as a loop variable from here on
    perform set_config('request.jwt.claims', json_build_object('sub', dr, 'role', 'authenticated')::text, true);
    set local role authenticated;
    ok := false;
    begin perform public.dispatch_schedule_expiry('https://example.test/api/expiry', 'x');
    exception when insufficient_privilege then ok := true; when others then ok := sqlerrm = 'not allowed'; end;
    reset role;
    if not ok then raise exception 'member % scheduled the expiry email', dr; end if;
  end loop;
  perform set_config('request.jwt.claims', json_build_object('sub', co, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := false;
  begin perform * from public.dispatch_cron_status();
  exception when others then ok := sqlerrm = 'not allowed'; end;
  if not ok then raise exception 'co read the cron status'; end if;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  perform public.dispatch_schedule_expiry('https://example.test/api/expiry', 't006-secret-1');
  j := public.dispatch_schedule_expiry('https://example.test/api/expiry', 't006-secret-2');
  perform set_config('request.jwt.claims', json_build_object('sub', sa, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.dispatch_cron_status() where schedule = '0 14 * * *' and active;
  if n <> 1 then raise exception 'cron status for sa: % rows', n; end if;
  reset role;
  select count(*) into n from cron.job where jobname = 'dispatch-expiry-email' and jobid = j and command like '%net.http_post(url := ''https://example.test/api/expiry''%x-expiry-secret%';
  if n <> 1 or (select count(*) from cron.job where jobname = 'dispatch-expiry-email') <> 1 then raise exception 'expiry job not (re)scheduled once'; end if;
  if (select count(*) from vault.decrypted_secrets where name = 'dispatch_expiry_secret' and decrypted_secret = 't006-secret-2') <> 1
     or (select count(*) from vault.secrets where name = 'dispatch_expiry_secret') <> 1 then raise exception 'expiry secret not replaced'; end if;

  raise notice '006 policies ok';
end $t$;
