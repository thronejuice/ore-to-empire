-- Ore to Empire v1.0.0 — player names, device accounts, recovery codes
--
-- Every player picks a unique name before playing. The player-account edge function
-- creates a real Supabase user for them with a long random password that stays on the
-- device, plus a recovery code (shown once) to restore the account on another device.
-- Only a bcrypt hash of the recovery code is stored.

create extension if not exists pgcrypto with schema extensions;

alter table public.profiles add column if not exists username text;
alter table public.profiles add column if not exists recovery_hash text;
alter table public.profiles add column if not exists recovery_fails integer not null default 0;
alter table public.profiles add column if not exists recovery_locked_until timestamptz;

-- names are unique regardless of case ("Somchai" = "somchai")
create unique index if not exists profiles_username_lower on public.profiles (lower(username));

-- external sign-ins linked to an account (LINE today; others later)
create table if not exists public.identity_links (
  provider text not null,
  subject text not null,
  user_id uuid not null references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  primary key (provider, subject)
);
alter table public.identity_links enable row level security;
drop policy if exists "read own links" on public.identity_links;
create policy "read own links" on public.identity_links for select using (auth.uid() = user_id);

-- simple per-IP throttle for creating accounts
create table if not exists public.signup_log (
  id bigint generated always as identity primary key,
  ip text not null,
  at timestamptz not null default now()
);
create index if not exists signup_log_ip_at on public.signup_log (ip, at desc);
alter table public.signup_log enable row level security; -- no policies: service role only

-- ---------------------------------------------------------------- names

create or replace function public.valid_username(p_name text)
returns boolean language sql immutable as $$
  select p_name is not null
     and char_length(p_name) between 3 and 16
     and p_name ~ '^[A-Za-z0-9_ก-๙]+$'
     and lower(p_name) not in ('admin', 'administrator', 'system', 'support', 'moderator', 'staff', 'oretoempire', 'ore_to_empire')
$$;

create or replace function public.username_available(p_name text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.valid_username(p_name)
     and not exists (select 1 from public.profiles where lower(username) = lower(p_name))
$$;

-- for players who signed in some other way (email / Google / LINE) and have no name yet
create or replace function public.set_username(p_name text)
returns text language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  if not public.valid_username(p_name) then raise exception 'bad_name'; end if;
  begin
    update public.profiles set username = p_name where id = auth.uid() and username is null;
  exception when unique_violation then
    raise exception 'name_taken';
  end;
  if not found then raise exception 'name_already_set'; end if;
  return p_name;
end $$;

-- ---------------------------------------------------------------- service-role helpers (edge function)

-- true when this IP may create another account (max 5 per hour)
create or replace function public.note_signup(p_ip text)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_recent integer;
begin
  delete from public.signup_log where at < now() - interval '1 day';
  select count(*) into v_recent from public.signup_log where ip = p_ip and at > now() - interval '1 hour';
  if v_recent >= 5 then return false; end if;
  insert into public.signup_log (ip) values (p_ip);
  return true;
end $$;

create or replace function public.claim_player_name(p_user uuid, p_name text, p_code text)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public.valid_username(p_name) then raise exception 'bad_name'; end if;
  begin
    update public.profiles
       set username = p_name, recovery_hash = crypt(p_code, gen_salt('bf', 8)), recovery_fails = 0, recovery_locked_until = null
     where id = p_user;
  exception when unique_violation then
    raise exception 'name_taken';
  end;
  if not found then raise exception 'no_profile'; end if;
end $$;

create or replace function public.set_recovery_code(p_user uuid, p_code text)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  update public.profiles set recovery_hash = crypt(p_code, gen_salt('bf', 8)), recovery_fails = 0, recovery_locked_until = null
   where id = p_user;
end $$;

-- Checks name + recovery code. Returns the user id, or NULL when the name or code is
-- wrong (same answer for both, so names can't be probed), or raises 'locked'.
-- Failures return instead of raising so the failure counter is kept.
-- 5 wrong codes lock the account's recovery for 15 minutes.
create or replace function public.check_recovery(p_name text, p_code text)
returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare p public.profiles;
begin
  select * into p from public.profiles where lower(username) = lower(p_name) for update;
  if not found or p.recovery_hash is null then
    perform pg_sleep(0.2); -- don't reveal which names exist by timing
    return null;
  end if;
  if p.recovery_locked_until is not null and p.recovery_locked_until > now() then raise exception 'locked'; end if;
  if crypt(upper(p_code), p.recovery_hash) <> p.recovery_hash then
    update public.profiles
       set recovery_fails = recovery_fails + 1,
           recovery_locked_until = case when recovery_fails + 1 >= 5 then now() + interval '15 minutes' else null end
     where id = p.id;
    return null;
  end if;
  update public.profiles set recovery_fails = 0, recovery_locked_until = null where id = p.id;
  return p.id;
end $$;

-- ---------------------------------------------------------------- grants

revoke all on function public.note_signup(text) from public, anon, authenticated;
revoke all on function public.claim_player_name(uuid, text, text) from public, anon, authenticated;
revoke all on function public.set_recovery_code(uuid, text) from public, anon, authenticated;
revoke all on function public.check_recovery(text, text) from public, anon, authenticated;
grant execute on function public.note_signup(text) to service_role;
grant execute on function public.claim_player_name(uuid, text, text) to service_role;
grant execute on function public.set_recovery_code(uuid, text) to service_role;
grant execute on function public.check_recovery(text, text) to service_role;

grant execute on function public.valid_username(text) to anon, authenticated;
grant execute on function public.username_available(text) to anon, authenticated;
revoke all on function public.set_username(text) from public, anon;
grant execute on function public.set_username(text) to authenticated;
