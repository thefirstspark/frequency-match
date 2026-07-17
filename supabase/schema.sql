-- Frequency Match freemium schema
-- Run in Supabase SQL Editor (can share a project with other apps; tables are fm_* prefixed)

-- Profiles (1:1 with auth.users)
create table if not exists public.fm_profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  free_matches_used int not null default 0 check (free_matches_used >= 0),
  is_pro boolean not null default false,
  stripe_customer_id text unique,
  stripe_subscription_id text,
  pro_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists fm_profiles_stripe_customer_idx
  on public.fm_profiles (stripe_customer_id);

-- Saved matches (Pro library; free users may still have rows if you allow one-off saves later)
create table if not exists public.fm_matches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.fm_profiles (id) on delete cascade,
  p1_name text not null,
  p1_date date not null,
  p1_place text,
  p2_name text not null,
  p2_date date not null,
  p2_place text,
  relationship_mode text not null default 'general'
    check (relationship_mode in ('general','romance','friendship','family','business')),
  overall_score int not null check (overall_score between 0 and 100),
  scores jsonb not null default '{}'::jsonb,
  profiles jsonb not null default '{}'::jsonb,
  narrative jsonb not null default '{}'::jsonb,
  is_pro_analysis boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists fm_matches_user_created_idx
  on public.fm_matches (user_id, created_at desc);

-- Auto-create profile on signup
create or replace function public.fm_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.fm_profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do update set email = excluded.email, updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_fm on auth.users;
create trigger on_auth_user_created_fm
  after insert on auth.users
  for each row execute function public.fm_handle_new_user();

-- updated_at helper
create or replace function public.fm_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists fm_profiles_updated_at on public.fm_profiles;
create trigger fm_profiles_updated_at
  before update on public.fm_profiles
  for each row execute function public.fm_set_updated_at();

-- Consume one free match (no-op if pro). Returns remaining free matches for non-pro.
create or replace function public.fm_consume_match()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  prof public.fm_profiles%rowtype;
  limit_n int := 3;
  remaining int;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  select * into prof from public.fm_profiles where id = uid for update;
  if not found then
    insert into public.fm_profiles (id) values (uid)
    returning * into prof;
  end if;

  if prof.is_pro then
    return jsonb_build_object(
      'ok', true,
      'is_pro', true,
      'free_matches_used', prof.free_matches_used,
      'remaining', null
    );
  end if;

  if prof.free_matches_used >= limit_n then
    return jsonb_build_object(
      'ok', false,
      'is_pro', false,
      'free_matches_used', prof.free_matches_used,
      'remaining', 0,
      'error', 'free_limit_reached'
    );
  end if;

  update public.fm_profiles
  set free_matches_used = free_matches_used + 1
  where id = uid
  returning * into prof;

  remaining := greatest(limit_n - prof.free_matches_used, 0);

  return jsonb_build_object(
    'ok', true,
    'is_pro', false,
    'free_matches_used', prof.free_matches_used,
    'remaining', remaining
  );
end;
$$;

-- Merge guest local usage after login (take the higher used count)
create or replace function public.fm_merge_guest_usage(guest_used int)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  prof public.fm_profiles%rowtype;
  limit_n int := 3;
  used int;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  used := greatest(coalesce(guest_used, 0), 0);

  insert into public.fm_profiles (id, free_matches_used)
  values (uid, least(used, limit_n))
  on conflict (id) do update
  set free_matches_used = greatest(public.fm_profiles.free_matches_used, least(used, limit_n)),
      updated_at = now()
  returning * into prof;

  return jsonb_build_object(
    'is_pro', prof.is_pro,
    'free_matches_used', prof.free_matches_used,
    'remaining', case when prof.is_pro then null else greatest(limit_n - prof.free_matches_used, 0) end
  );
end;
$$;

alter table public.fm_profiles enable row level security;
alter table public.fm_matches enable row level security;

-- Profiles: users read/update self
drop policy if exists fm_profiles_select_own on public.fm_profiles;
create policy fm_profiles_select_own on public.fm_profiles
  for select using (auth.uid() = id);

drop policy if exists fm_profiles_update_own on public.fm_profiles;
create policy fm_profiles_update_own on public.fm_profiles
  for update using (auth.uid() = id)
  with check (auth.uid() = id);

-- Inserts only via trigger / service role; allow self-insert fallback
drop policy if exists fm_profiles_insert_own on public.fm_profiles;
create policy fm_profiles_insert_own on public.fm_profiles
  for insert with check (auth.uid() = id);

-- Matches: full CRUD own rows
drop policy if exists fm_matches_select_own on public.fm_matches;
create policy fm_matches_select_own on public.fm_matches
  for select using (auth.uid() = user_id);

drop policy if exists fm_matches_insert_own on public.fm_matches;
create policy fm_matches_insert_own on public.fm_matches
  for insert with check (auth.uid() = user_id);

drop policy if exists fm_matches_delete_own on public.fm_matches;
create policy fm_matches_delete_own on public.fm_matches
  for delete using (auth.uid() = user_id);

drop policy if exists fm_matches_update_own on public.fm_matches;
create policy fm_matches_update_own on public.fm_matches
  for update using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant usage on schema public to anon, authenticated;
grant select, update, insert on public.fm_profiles to authenticated;
grant select, insert, update, delete on public.fm_matches to authenticated;
grant execute on function public.fm_consume_match() to authenticated;
grant execute on function public.fm_merge_guest_usage(int) to authenticated;
