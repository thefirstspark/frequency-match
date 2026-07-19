-- Whop billing columns for Frequency Pro
alter table public.fm_profiles
  add column if not exists whop_membership_id text,
  add column if not exists whop_user_id text;

comment on column public.fm_profiles.whop_membership_id is 'Whop membership id from webhook';
