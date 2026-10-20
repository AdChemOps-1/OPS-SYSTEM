-- AdChem Ops — 004, as applied to the operations database on 10/17/26. Record only.
-- Each hub carries its local time zone and, optionally, the list of products it offers.
alter table public.dispatch_hubs add column if not exists tz text not null default '';      -- IANA zone; blank = the company time zone
alter table public.dispatch_hubs add column if not exists products jsonb;                    -- null = every product; else ["Category|Product", ...]
update public.dispatch_hubs set tz = 'America/Los_Angeles' where company='adchem' and code in ('EB','LA') and tz = '';
update public.dispatch_hubs set tz = 'America/Denver'      where company='adchem' and code = 'CO' and tz = '';
-- Denver (CO) is left on every product until the list is decided (10/17/26).
