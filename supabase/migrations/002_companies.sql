-- AdChem Ops — 002 companies, as applied to the operations database on 10/10/26. Record only.
-- Every Dispatch row belongs to a company; people are members of companies with a role; row-level security filters by membership.

create table if not exists public.companies (
  id text primary key check (id ~ '^[a-z0-9-]{2,24}$'),
  name text not null, short_name text not null default '', active boolean not null default true,
  data jsonb not null default '{}'::jsonb,              -- ordersTo, accountingTo, mailFrom (per-company addresses)
  created_at timestamptz not null default now());
insert into public.companies (id, name, short_name, data) values ('adchem','AdChem, LLC','AdChem','{"ordersTo":"orders@adchem.pro","accountingTo":"accounting@adchem.pro","mailFrom":"orders@adchem.pro"}') on conflict (id) do nothing;

create table if not exists public.dispatch_members (            -- replaces role/hub on dispatch_users (which stays as the directory)
  user_id uuid not null references auth.users(id) on delete cascade,
  company text not null references public.companies(id),
  role text not null default 'driver' check (role in ('admin','coordinator','driver')),
  hub text not null default '', active boolean not null default true, created_at timestamptz not null default now(),
  primary key (user_id, company));
insert into public.dispatch_members (user_id, company, role, hub, active) select user_id, 'adchem', role, hub, active from public.dispatch_users on conflict do nothing;

create table if not exists public.dispatch_company_settings (   -- replaces dispatch_settings (id=1), which is now unused
  company text primary key references public.companies(id), data jsonb not null default '{}'::jsonb, updated_at timestamptz not null default now());
insert into public.dispatch_company_settings (company, data) select 'adchem', data from public.dispatch_settings where id = 1 on conflict (company) do nothing;

alter table public.dispatch_invites  add column if not exists company text not null default 'adchem' references public.companies(id);
alter table public.dispatch_hubs     add column if not exists company text not null default 'adchem' references public.companies(id);
alter table public.dispatch_sites    add column if not exists company text not null default 'adchem' references public.companies(id);
alter table public.dispatch_orders   add column if not exists company text not null default 'adchem' references public.companies(id);
alter table public.dispatch_pods     add column if not exists company text not null default 'adchem' references public.companies(id);
alter table public.dispatch_deposits add column if not exists company text not null default 'adchem' references public.companies(id);
alter table public.dispatch_log      add column if not exists company text not null default 'adchem';
create index if not exists dispatch_orders_company_date_idx on public.dispatch_orders (company, date, hub);
create index if not exists dispatch_sites_company_idx on public.dispatch_sites (company, lower(customer));

-- keys are per company: sites, hubs, orders (and pods follow their order); BOL numbers unique per company
alter table public.dispatch_sites drop constraint if exists dispatch_sites_pkey;   alter table public.dispatch_sites add primary key (company, site_key);
alter table public.dispatch_hubs  drop constraint if exists dispatch_hubs_pkey;    alter table public.dispatch_hubs  add primary key (company, code);
alter table public.dispatch_pods  drop constraint if exists dispatch_pods_order_id_fkey;
alter table public.dispatch_orders drop constraint if exists dispatch_orders_pkey; alter table public.dispatch_orders add primary key (company, id);
alter table public.dispatch_pods add constraint dispatch_pods_order_fkey foreign key (company, order_id) references public.dispatch_orders(company, id) on delete cascade;
create unique index if not exists dispatch_orders_company_bol_uq on public.dispatch_orders (company, bol_no) where bol_no is not null;
alter table public.dispatch_orders drop constraint if exists dispatch_orders_bol_no_key;

-- AdChem Time: the same company field on its people and groups (no behavior change in Time yet)
alter table public.profiles add column if not exists company text not null default 'adchem';
alter table public.groups   add column if not exists company text not null default 'adchem';

-- helpers (security definer, authenticated only): dispatch_companies(), dispatch_role_in(c), dispatch_hub_in(c), dispatch_is_admin_in(c),
-- dispatch_can_edit_in(c), dispatch_can_see_in(c, hub); the zero-argument versions now mean "a member of any company".
-- RPCs: dispatch_next_bol(order_id, company) — per-company sequence in dispatch_company_settings.data.nextBol;
--       dispatch_grant(email, name, role, hub, company); dispatch_revoke(email, company); dispatch_add_company(id, name, short).
-- Sign-up trigger handle_new_user: a Dispatch invite creates the dispatch_users row and the dispatch_members row for the invite's company.
-- Row-level security: every dispatch_* policy was re-pointed (alter policy) at the company-aware helpers; companies, dispatch_members and
-- dispatch_company_settings have their own policies. Full bodies are in the database.
