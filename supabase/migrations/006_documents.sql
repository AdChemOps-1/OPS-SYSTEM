-- AdChem Ops — 006 documents, as written 10/20/26 (Stage 2 of the customers/documents/assets spec, §3.3 §3.6 §3.7 §5.1–5.8 §7).
-- Licenses, certificates and agreements for customers, the company and people live in dispatch_documents with an optional file in
-- the private dispatch-docs bucket. Two new permissions: view_documents (read records and files) and manage_documents (create, edit,
-- upload, approve/reject, delete); super admins have both. A person reads their own live documents; a driver can send customer
-- captures from a stop (pending review, write-only). dispatch_customer_status is replaced to derive license and PSA status, which
-- coordinators without view_documents still see. A daily pg_cron job calls the expiry email through pg_net with a Vault secret.
-- Tested by supabase/tests/006_policies.sql (run inside begin … rollback, the file applied twice first).

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ---------- documents ----------
create table if not exists public.dispatch_documents (
  id uuid primary key default gen_random_uuid(),
  company text not null references public.companies(id),
  subject_type text not null check (subject_type in ('customer','company','person')),
  subject_id text not null,                                  -- customer uuid / company id / auth user uuid, as text; checked by dispatch_documents_subject_guard
  doc_type text not null check (doc_type in ('cannabis_license','resale_certificate','psa','chp_hazmat_license','dot_registration','insurance_certificate','cdl','medical_card','other')),
  title text not null default '', number text not null default '', status text not null default '',
  issued date, expires date,
  file_path text, file_name text not null default '', file_size int, file_type text not null default '',
  checked_on date, checked_by uuid, source text not null default '', notes text not null default '',
  review_status text not null default 'live' check (review_status in ('live','pending_review','rejected')),
  captured_by uuid, captured_at timestamptz, captured_order_id text,
  supersedes_id uuid references public.dispatch_documents(id) on delete set null,
  extra jsonb not null default '{}'::jsonb,                  -- per type: PSA dates (quote_sent … effective_date), entity_status_sos, …
  import_source jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(), updated_by uuid);
create index if not exists dispatch_documents_subject_idx on public.dispatch_documents (company, subject_type, subject_id);
create index if not exists dispatch_documents_expires_idx on public.dispatch_documents (company, expires) where review_status = 'live';

-- ---------- helpers (security definer) ----------
-- A document's subject must belong to the document's company. Foreign keys cannot express this (subject_id is polymorphic) and
-- would bypass RLS anyway, so the guard trigger below is the cross-company check.
create or replace function public.dispatch_doc_subject_ok(c text, st text, sid text) returns boolean language sql stable security definer set search_path = public as $$
  select case st
    when 'customer' then exists (select 1 from public.dispatch_customers x where x.company = c and x.id::text = sid)
    when 'company'  then sid = c
    when 'person'   then exists (select 1 from public.dispatch_members m where m.company = c and m.user_id::text = sid and m.active)
    else false end $$;
-- The company's warning window in days (dispatch_company_settings.data.warnDays, default 30).
create or replace function public.dispatch_warn_days(c text) returns int language sql stable security definer set search_path = public as $$
  select coalesce((select case when (data->>'warnDays') ~ '^\d{1,3}$' then (data->>'warnDays')::int end from public.dispatch_company_settings where company = c), 30) $$;
-- License and PSA status of one customer, from its live documents. Security definer so a coordinator without view_documents still
-- sees the derived status (never the records); only editors of the company get a row.
-- The license is the live cannabis_license with the latest expiry (a renewal added before the old one expires wins).
create or replace function public.dispatch_customer_doc_status(c text, cust uuid)
returns table (license_on_file boolean, license_status text, license_expires date, license_number text, entity_status text, psa_status text, psa_effective date)
language sql stable security definer set search_path = public as $fn$
  with lic as (select d.expires, d.number, d.extra from public.dispatch_documents d
                where d.company = c and d.subject_type = 'customer' and d.subject_id = cust::text and d.doc_type = 'cannabis_license' and d.review_status = 'live'
                order by d.expires desc nulls last, d.created_at desc limit 1),
       psa as (select coalesce(d.extra, '{}'::jsonb) x from public.dispatch_documents d
                where d.company = c and d.subject_type = 'customer' and d.subject_id = cust::text and d.doc_type = 'psa' and d.review_status = 'live'
                order by d.expires desc nulls last, d.created_at desc limit 1)
  select exists (select 1 from lic),
    case when not exists (select 1 from lic) then 'missing'
         when (select expires from lic) < current_date then 'expired'
         when (select expires from lic) < current_date + public.dispatch_warn_days(c) then 'expiring'
         else 'valid' end,
    (select expires from lic), (select nullif(number, '') from lic), (select nullif(extra->>'entity_status_sos', '') from lic),
    case when not exists (select 1 from psa) then 'missing'
         when (select btrim(coalesce(x->>'signed_customer', '')) <> '' and btrim(coalesce(x->>'countersigned', '')) <> '' from psa) then 'signed'
         when (select exists (select 1 from unnest(array['quote_sent','quote_accepted','sent_for_signature','signed_customer','countersigned','effective_date']) k
                               where btrim(coalesce(x->>k, '')) <> '') from psa) then 'in_progress'
         else 'missing' end,
    (select case when x->>'effective_date' ~ '^\d{4}-\d{2}-\d{2}' then left(x->>'effective_date', 10)::date end from psa)
  where public.dispatch_can_edit_in(c) $fn$;
-- The display name of a document's subject, for dispatch_documents_due. Names only for callers who could see that subject.
create or replace function public.dispatch_doc_subject_name(c text, st text, sid text) returns text language sql stable security definer set search_path = public as $$
  select case st
    when 'customer' then (select x.name from public.dispatch_customers x where x.company = c and x.id::text = sid
                            and (public.dispatch_can_edit_in(c) or public.dispatch_perm_in(c, 'view_documents')))
    when 'company'  then (select co.name from public.companies co where co.id = sid and sid = c and public.dispatch_role_in(c) is not null)
    when 'person'   then (select u.name from public.dispatch_users u where u.user_id::text = sid
                            and (public.dispatch_perm_in(c, 'view_documents') or sid = (select auth.uid())::text)
                            and exists (select 1 from public.dispatch_members m where m.user_id = u.user_id and m.company = c))
    end $$;

-- ---------- triggers ----------
-- dispatch_keep_company (005) replaced: its `tg_table_name = 'dispatch_customers' and new.customer_id …` test is one plpgsql
-- expression, which reads new.customer_id on every table, so any update of a table without that column (dispatch_site_hub_notes
-- since 005, dispatch_documents here) failed with `record "new" has no field "customer_id"`. The column test is now nested.
create or replace function public.dispatch_keep_company() returns trigger language plpgsql security definer set search_path = public as $fn$
begin
  if new.company is distinct from old.company then raise exception 'company cannot change'; end if;
  if tg_table_name = 'dispatch_customers' then
    if new.customer_id is distinct from old.customer_id then raise exception 'customer_id cannot change'; end if;
  end if;
  return new;
end $fn$;
revoke execute on function public.dispatch_keep_company() from anon, authenticated, public;
create or replace function public.dispatch_documents_subject_guard() returns trigger language plpgsql security definer set search_path = public as $fn$
begin
  if not public.dispatch_doc_subject_ok(new.company, new.subject_type, new.subject_id) then raise exception 'document subject not found in this company'; end if;
  return new;
end $fn$;
-- A driver's insert is a capture from a stop: a customer document, under the company's capture/ folder, sent for review, as themselves.
create or replace function public.dispatch_documents_capture_guard() returns trigger language plpgsql security definer set search_path = public as $fn$
begin
  if public.dispatch_role_in(new.company) = 'driver' then
    if new.review_status is distinct from 'pending_review' then raise exception 'a driver capture must be sent for review'; end if;
    if new.subject_type <> 'customer' then raise exception 'a driver capture must be for a customer'; end if;
    if new.file_path is null or new.file_path not like new.company || '/capture/%' then raise exception 'a driver capture must be filed under capture/'; end if;
    new.review_status := 'pending_review'; new.captured_by := auth.uid(); new.captured_at := now();
    new.checked_on := null; new.checked_by := null; new.supersedes_id := null;
  end if;
  return new;
end $fn$;
-- BEFORE triggers fire by name: capture guard, keep company, subject guard.
create or replace trigger dispatch_documents_capture_guard before insert on public.dispatch_documents for each row execute function public.dispatch_documents_capture_guard();
create or replace trigger dispatch_documents_keep_company before update on public.dispatch_documents for each row execute function public.dispatch_keep_company();
create or replace trigger dispatch_documents_subject_guard before insert or update of company, subject_type, subject_id on public.dispatch_documents for each row execute function public.dispatch_documents_subject_guard();
create or replace trigger dispatch_documents_audit after insert or update or delete on public.dispatch_documents for each row execute function public.dispatch_audit();

-- ---------- bucket: private, 10 MB, photos and PDFs ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('dispatch-docs', 'dispatch-docs', false, 10485760, array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- ---------- status views ----------
-- dispatch_customer_status: the 15 must-have fields (spec §5.1), license and PSA now real. Columns keep 005's order; psa_effective is new.
create or replace view public.dispatch_customer_status with (security_invoker = true) as
select c.company, c.customer_id, c.id,
  ( (coalesce(c.name,'') <> '')::int + (coalesce(c.legal_name,'') <> '')::int + (coalesce(c.account_status,'') <> '')::int + (coalesce(c.primary_hub,'') <> '')::int
  + (coalesce(c.billing_street,'') <> '')::int + (coalesce(c.billing_city,'') <> '')::int + (coalesce(c.billing_state,'') <> '')::int + (coalesce(c.billing_zip,'') <> '')::int
  + exists (select 1 from public.dispatch_sites s where s.company = c.company and s.customer_id = c.id and btrim(coalesce(s.addr,'')) <> '')::int
  + exists (select 1 from public.dispatch_contacts x where x.company = c.company and x.customer_id = c.id and x.type = 'receiving' and btrim(coalesce(x.phone,'')) <> '')::int
  + exists (select 1 from public.dispatch_contacts x where x.company = c.company and x.customer_id = c.id and x.type = 'billing' and btrim(coalesce(x.email,'')) <> '')::int
  + coalesce(d.license_on_file, false)::int /* license on file */ + (d.license_expires is not null)::int /* license expiry */
  + (coalesce(d.psa_status, '') = 'signed')::int /* PSA signed */
  + (c.last_verified is not null)::int ) as profile_complete,
  coalesce(d.license_status, 'missing') as license_status, d.license_expires, d.license_number,
  coalesce(d.psa_status, 'missing') as psa_status, d.entity_status, d.psa_effective
from public.dispatch_customers c
left join lateral public.dispatch_customer_doc_status(c.company, c.id) d on true;
revoke all on public.dispatch_customer_status from anon;

-- dispatch_documents_due: live documents expiring within the company's warn window, or already past. Rows follow the table's RLS.
create or replace view public.dispatch_documents_due with (security_invoker = true) as
select d.company, d.id, d.subject_type, d.subject_id, public.dispatch_doc_subject_name(d.company, d.subject_type, d.subject_id) as subject_name,
  d.doc_type, d.title, d.number, d.expires, (d.expires - current_date) as days_left, d.review_status
from public.dispatch_documents d
where d.review_status = 'live' and d.expires is not null and d.expires - current_date <= public.dispatch_warn_days(d.company);
revoke all on public.dispatch_documents_due from anon;

-- ---------- RPCs ----------
-- Order-time warnings and the expiry email settings: super admin only; the three keys are written nowhere else.
create or replace function public.dispatch_set_warnings(p_company text, p_warn_days int, p_warnings jsonb, p_recipients text[]) returns void language plpgsql security definer set search_path = public as $fn$
declare was jsonb; w jsonb := coalesce(p_warnings, '{}'::jsonb); r text[] := coalesce(p_recipients, '{}'::text[]);
begin
  if not public.dispatch_is_super_in(p_company) then raise exception 'not allowed'; end if;
  if p_warn_days is null or p_warn_days not between 1 and 365 then raise exception 'warn days must be 1-365'; end if;
  if jsonb_typeof(w) <> 'object' then raise exception 'warnings must be an object'; end if;
  if exists (select 1 from jsonb_each(w) e where jsonb_typeof(e.value) <> 'object' or jsonb_typeof(e.value->'orderTime') is distinct from 'boolean'
                                              or jsonb_typeof(e.value->'note') is distinct from 'string') then
    raise exception 'each warning needs orderTime true/false and a note'; end if;
  if exists (select 1 from unnest(r) e where e is null or e !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') then raise exception 'recipients must be email addresses'; end if;
  insert into public.dispatch_company_settings (company) values (p_company) on conflict (company) do nothing;
  select data into was from public.dispatch_company_settings where company = p_company for update;
  perform set_config('dispatch.set_warnings', '1', true);    -- lets dispatch_settings_warnings_guard pass this one write
  update public.dispatch_company_settings
     set data = jsonb_set(jsonb_set(jsonb_set(data, '{warnDays}', to_jsonb(p_warn_days)), '{warnings}', w), '{expiryEmailRecipients}', to_jsonb(r)),
         updated_at = now()
   where company = p_company;
  perform set_config('dispatch.set_warnings', '', true);
  insert into public.dispatch_log (company, who, what, detail, table_name, row_id, changes) values (p_company, auth.uid(), 'warnings', '{}'::jsonb,
    'dispatch_company_settings', p_company, jsonb_build_object(
      'warnDays', jsonb_build_object('from', was->'warnDays', 'to', to_jsonb(p_warn_days)),
      'warnings', jsonb_build_object('from', was->'warnings', 'to', w),
      'expiryEmailRecipients', jsonb_build_object('from', was->'expiryEmailRecipients', 'to', to_jsonb(r))));
end $fn$;
-- dcs_write (002) lets any editor write dispatch_company_settings.data. The three warning keys (they decide who receives the expiry
-- email and what order entry shows) change only through dispatch_set_warnings, which sets a transaction-local flag around its write.
-- A whole-object write that carries them back unchanged (DB.saveSettings re-reads them from the server first) passes. An upsert fires
-- BEFORE INSERT too, so an insert is checked only when the company has no settings row yet.
create or replace function public.dispatch_settings_warnings_guard() returns trigger language plpgsql security definer set search_path = public as $fn$
declare k text;
begin
  if coalesce(current_setting('dispatch.set_warnings', true), '') = '1' then return new; end if;
  if tg_op = 'INSERT' then
    if exists (select 1 from public.dispatch_company_settings s where s.company = new.company) then return new; end if;
    if coalesce(new.data, '{}'::jsonb) ?| array['warnDays','warnings','expiryEmailRecipients'] then
      raise exception 'warnings settings change only through dispatch_set_warnings'; end if;
    return new;
  end if;
  foreach k in array array['warnDays','warnings','expiryEmailRecipients'] loop
    if (old.data->k) is distinct from (new.data->k) then raise exception 'warnings settings change only through dispatch_set_warnings'; end if;
  end loop;
  return new;
end $fn$;
create or replace trigger dispatch_company_settings_warnings_guard before insert or update on public.dispatch_company_settings for each row execute function public.dispatch_settings_warnings_guard();

-- Approve a capture (a document awaiting review): the reviewer types the fields; the document goes live. A live document of the
-- same subject and type with the same (non-empty) number is the one this replaces: it is rejected as superseded.
create or replace function public.dispatch_approve_capture(p_id uuid, p_fields jsonb) returns uuid language plpgsql security definer set search_path = public as $fn$
declare d public.dispatch_documents%rowtype; f jsonb := coalesce(p_fields, '{}'::jsonb); old_id uuid;
begin
  select * into d from public.dispatch_documents where id = p_id;
  if not found then raise exception 'document not found'; end if;
  if not public.dispatch_perm_in(d.company, 'manage_documents') then raise exception 'not allowed'; end if;
  if d.review_status <> 'pending_review' then raise exception 'not pending review'; end if;
  if jsonb_typeof(f) <> 'object' then raise exception 'fields must be an object'; end if;
  update public.dispatch_documents set
    doc_type = case when f ? 'doc_type' then f->>'doc_type' else doc_type end,
    number   = case when f ? 'number' then coalesce(f->>'number', '') else number end,
    status   = case when f ? 'status' then coalesce(f->>'status', '') else status end,
    title    = case when f ? 'title' then coalesce(f->>'title', '') else title end,
    notes    = case when f ? 'notes' then coalesce(f->>'notes', '') else notes end,
    issued   = case when f ? 'issued' then nullif(f->>'issued', '')::date else issued end,
    expires  = case when f ? 'expires' then nullif(f->>'expires', '')::date else expires end,
    extra    = case when f ? 'extra' then case when jsonb_typeof(f->'extra') = 'object' then f->'extra' else '{}'::jsonb end else extra end,
    checked_on = current_date, checked_by = auth.uid(), review_status = 'live', updated_at = now(), updated_by = auth.uid()
  where id = p_id returning * into d;
  if coalesce(d.number, '') <> '' then
    select x.id into old_id from public.dispatch_documents x
     where x.company = d.company and x.subject_type = d.subject_type and x.subject_id = d.subject_id and x.doc_type = d.doc_type
       and x.number = d.number and x.review_status = 'live' and x.id <> d.id
     order by x.expires desc nulls last, x.created_at desc limit 1;
    if old_id is not null then
      update public.dispatch_documents set review_status = 'rejected', notes = notes || ' superseded', updated_at = now(), updated_by = auth.uid() where id = old_id;
      update public.dispatch_documents set supersedes_id = old_id where id = d.id;
    end if;
  end if;
  return d.id;
end $fn$;
create or replace function public.dispatch_reject_capture(p_id uuid, p_reason text) returns void language plpgsql security definer set search_path = public as $fn$
declare c text; st text;
begin
  select company, review_status into c, st from public.dispatch_documents where id = p_id;
  if not found then raise exception 'document not found'; end if;
  if not public.dispatch_perm_in(c, 'manage_documents') then raise exception 'not allowed'; end if;
  if st <> 'pending_review' then raise exception 'not pending review'; end if;
  update public.dispatch_documents set review_status = 'rejected', notes = coalesce(p_reason, ''), updated_at = now(), updated_by = auth.uid() where id = p_id;
end $fn$;

-- ---------- expiry email: pg_cron → pg_net → /api/expiry, with the shared secret in Vault ----------
-- The job is global (one per database), so no member may schedule it: only the database owner (SQL editor / MCP) or the service role.
-- Execute is not granted to authenticated or anon. Inside a security definer function current_user is always the owner, so the check
-- reads the caller's role from the `role` setting ('none' for a plain owner session, 'service_role' through the API).
-- Re-running replaces the job and the secret. 14:00 UTC = 06:00 PST / 07:00 PDT.
create or replace function public.dispatch_schedule_expiry(p_url text, p_secret text) returns bigint language plpgsql security definer set search_path = public as $fn$
declare sid uuid; j bigint;
begin
  if not ((session_user = 'postgres' and current_setting('role', true) in ('none','postgres')) or current_setting('role', true) = 'service_role') then
    raise exception 'not allowed'; end if;
  if coalesce(p_url, '') !~ '^https://' then raise exception 'url must be https'; end if;
  if coalesce(p_secret, '') = '' then raise exception 'secret is required'; end if;
  select id into sid from vault.secrets where name = 'dispatch_expiry_secret';
  if sid is null then perform vault.create_secret(p_secret, 'dispatch_expiry_secret');
  else perform vault.update_secret(sid, p_secret); end if;
  for j in select jobid from cron.job where jobname = 'dispatch-expiry-email' loop perform cron.unschedule(j); end loop;
  select cron.schedule('dispatch-expiry-email', '0 14 * * *', format($c$select net.http_post(url := %L, headers := jsonb_build_object('content-type','application/json','x-expiry-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'dispatch_expiry_secret')), body := '{"send":true}'::jsonb)$c$, p_url)) into j;
  return j;
end $fn$;
-- Health (admins): the expiry job as pg_cron has it; no rows when it is not scheduled (or pg_cron is absent).
create or replace function public.dispatch_cron_status() returns table (jobname text, schedule text, active boolean) language plpgsql stable security definer set search_path = public as $fn$
begin
  if not exists (select 1 from public.dispatch_companies() c where public.dispatch_is_admin_in(c) or public.dispatch_is_super_in(c)) then raise exception 'not allowed'; end if;
  begin
    return query execute 'select j.jobname::text, j.schedule::text, j.active from cron.job j where j.jobname = $1' using 'dispatch-expiry-email';
  exception when others then return;
  end;
end $fn$;

-- ---------- execute: RPCs and the view helpers to authenticated; the subject check and trigger functions to no one ----------
grant execute on function public.dispatch_warn_days(text), public.dispatch_customer_doc_status(text,uuid), public.dispatch_doc_subject_name(text,text,text),
  public.dispatch_set_warnings(text,int,jsonb,text[]), public.dispatch_approve_capture(uuid,jsonb), public.dispatch_reject_capture(uuid,text),
  public.dispatch_cron_status() to authenticated;
grant execute on function public.dispatch_schedule_expiry(text,text) to service_role;
revoke execute on function public.dispatch_schedule_expiry(text,text) from authenticated;
revoke execute on function public.dispatch_warn_days(text), public.dispatch_customer_doc_status(text,uuid), public.dispatch_doc_subject_name(text,text,text),
  public.dispatch_set_warnings(text,int,jsonb,text[]), public.dispatch_approve_capture(uuid,jsonb), public.dispatch_reject_capture(uuid,text),
  public.dispatch_schedule_expiry(text,text), public.dispatch_cron_status() from anon, public;
revoke execute on function public.dispatch_doc_subject_ok(text,text,text), public.dispatch_documents_subject_guard(), public.dispatch_documents_capture_guard(),
  public.dispatch_settings_warnings_guard()
  from anon, authenticated, public;

-- ---------- row-level security ----------
alter table public.dispatch_documents enable row level security;
revoke all on public.dispatch_documents from anon;
do $$ begin
  -- Read: view_documents, or your own live person documents (a driver's CDL and medical card). A driver's captures are write-only.
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'dispatch_documents' and policyname = 'ddoc_read') then
    create policy ddoc_read on public.dispatch_documents for select using (public.dispatch_perm_in(company, 'view_documents')
      or (subject_type = 'person' and subject_id = (select auth.uid())::text and review_status = 'live'));
  end if;
  -- Insert: manage_documents, or a driver (dispatch_documents_capture_guard narrows that to a pending customer capture).
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'dispatch_documents' and policyname = 'ddoc_insert') then
    create policy ddoc_insert on public.dispatch_documents for insert with check (public.dispatch_perm_in(company, 'manage_documents') or public.dispatch_role_in(company) = 'driver');
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'dispatch_documents' and policyname = 'ddoc_update') then
    create policy ddoc_update on public.dispatch_documents for update using (public.dispatch_perm_in(company, 'manage_documents')) with check (public.dispatch_perm_in(company, 'manage_documents'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'dispatch_documents' and policyname = 'ddoc_delete') then
    create policy ddoc_delete on public.dispatch_documents for delete using (public.dispatch_perm_in(company, 'manage_documents'));
  end if;
  -- Files: {company}/document/{subject_type}/{subject_id}/{document_id}/{file} and {company}/capture/{order_id}/{document_id}.jpg.
  -- No update policy: a file is never overwritten in place.
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'dispatch docs read') then
    create policy "dispatch docs read" on storage.objects for select using (bucket_id = 'dispatch-docs' and (public.dispatch_perm_in((storage.foldername(name))[1], 'view_documents')
      or ((storage.foldername(name))[2] = 'document' and (storage.foldername(name))[3] = 'person' and (storage.foldername(name))[4] = (select auth.uid())::text)));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'dispatch docs write') then
    create policy "dispatch docs write" on storage.objects for insert with check (bucket_id = 'dispatch-docs' and (
      ((storage.foldername(name))[2] = 'document' and public.dispatch_perm_in((storage.foldername(name))[1], 'manage_documents'))
      or ((storage.foldername(name))[2] = 'capture' and public.dispatch_role_in((storage.foldername(name))[1]) = 'driver')));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'dispatch docs delete') then
    create policy "dispatch docs delete" on storage.objects for delete using (bucket_id = 'dispatch-docs' and public.dispatch_perm_in((storage.foldername(name))[1], 'manage_documents'));
  end if;
end $$;
-- dispatch_log: editors read change rows (a customer's History), but a document's change rows (numbers, expiries, file paths) only
-- with view_documents. dl_editor_read exists since 005, so it is altered in place (re-runnable).
alter policy dl_editor_read on public.dispatch_log using (public.dispatch_can_edit_in(company) and table_name is not null and what = 'change'
  and (table_name <> 'dispatch_documents' or public.dispatch_perm_in(company, 'view_documents')));

-- ---------- seed: warnings default off at go-live (through the guard's flag, cleared after) ----------
do $$ begin   -- one statement, so the flag and the writes share a transaction however the file is run
  perform set_config('dispatch.set_warnings', '1', true);
  update public.dispatch_company_settings set data = jsonb_set(data, '{warnDays}', '30') where company = 'adchem' and not (data ? 'warnDays');
  update public.dispatch_company_settings set data = jsonb_set(data, '{warnings}',
    '{"cannabis_license":{"orderTime":false,"note":""},"psa":{"orderTime":false,"note":""},"entity_status":{"orderTime":false,"note":""}}')
    where company = 'adchem' and not (data ? 'warnings');
  perform set_config('dispatch.set_warnings', '', true);
end $$;
