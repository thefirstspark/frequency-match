-- Player entitlement: free access without Frequency Pro subscription
alter table public.fm_profiles
  add column if not exists is_player boolean not null default false,
  add column if not exists whop_plan_id text;

comment on column public.fm_profiles.is_player is
  'True when user holds a Players access pass (or manual grant). Access = is_pro OR is_player.';
comment on column public.fm_profiles.whop_plan_id is
  'Last Whop plan id that granted entitlement via webhook';
