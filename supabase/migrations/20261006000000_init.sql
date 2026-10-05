-- Ore to Empire — Phase 4 schema
-- Run with `supabase db push` (or paste into the SQL editor).
--
-- Principles
--  * Clients can READ their own rows but never write gems or purchases directly.
--  * Gems change only through SECURITY DEFINER functions:
--      spend_gems         (client, checks price + balance server-side)
--      claim_daily_gems   (client, max 25 gems per day, each mission once)
--      credit_purchase    (service role only — called by the Omise webhook)
--  * Saves are stamped with the SERVER clock, which is what offline progress uses
--    for signed-in players.

-- ---------------------------------------------------------------- tables

create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  gems integer not null default 0 check (gems >= 0),
  boost_until timestamptz,
  starter_bought boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.saves (
  user_id uuid primary key references auth.users on delete cascade,
  data jsonb not null,
  version integer not null,
  game_time double precision not null default 0,
  saved_at timestamptz not null default now()
);

create table if not exists public.gem_ledger (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users on delete cascade,
  delta integer not null,
  reason text not null,   -- 'spend:<item>' | 'daily' | 'purchase'
  ref text,               -- idempotency key (day:mission, purchase id)
  created_at timestamptz not null default now()
);
create unique index if not exists gem_ledger_idem on public.gem_ledger (user_id, reason, ref) where ref is not null;
create index if not exists gem_ledger_user on public.gem_ledger (user_id, created_at desc);

create table if not exists public.purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  pack text not null,
  gems integer not null,
  boost_hours integer not null default 0,
  amount_satang integer not null,
  charge_id text unique,
  status text not null default 'pending' check (status in ('pending', 'paid', 'failed', 'expired')),
  qr_uri text,
  authorize_uri text,
  failure text,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
create index if not exists purchases_user on public.purchases (user_id, created_at desc);

-- ---------------------------------------------------------------- profile per user

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------- row level security

alter table public.profiles enable row level security;
alter table public.saves enable row level security;
alter table public.gem_ledger enable row level security;
alter table public.purchases enable row level security;

drop policy if exists "read own profile" on public.profiles;
create policy "read own profile" on public.profiles for select using (auth.uid() = id);
drop policy if exists "read own save" on public.saves;
create policy "read own save" on public.saves for select using (auth.uid() = user_id);
drop policy if exists "read own ledger" on public.gem_ledger;
create policy "read own ledger" on public.gem_ledger for select using (auth.uid() = user_id);
drop policy if exists "read own purchases" on public.purchases;
create policy "read own purchases" on public.purchases for select using (auth.uid() = user_id);
-- no insert/update/delete policies: all writes go through the functions below

-- ---------------------------------------------------------------- saves

create or replace function public.save_game(p_data jsonb)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare v_at timestamptz := now();
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  if octet_length(p_data::text) > 3000000 then raise exception 'save_too_large'; end if;
  insert into public.saves (user_id, data, version, game_time, saved_at)
  values (auth.uid(), p_data, coalesce((p_data->>'version')::int, 0), coalesce((p_data->>'time')::double precision, 0), v_at)
  on conflict (user_id) do update
    set data = excluded.data, version = excluded.version, game_time = excluded.game_time, saved_at = excluded.saved_at;
  return v_at;
end $$;

create or replace function public.load_game()
returns table (data jsonb, saved_at timestamptz, server_now timestamptz)
language sql security definer set search_path = public stable as $$
  select s.data, s.saved_at, now() from public.saves s where s.user_id = auth.uid()
  union all
  select null::jsonb, null::timestamptz, now() where not exists (select 1 from public.saves where user_id = auth.uid())
$$;

create or replace function public.server_now()
returns timestamptz language sql stable as $$ select now() $$;

-- ---------------------------------------------------------------- gems

-- Prices mirror src/config/meta.ts (GEM_ITEMS). The server's table wins.
create or replace function public.spend_gems(p_item text)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_price integer;
  v_left integer;
  v_owned integer;
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  v_price := case p_item
    when 'skip_1h' then 20
    when 'boost_4h' then 50
    when 'offline_plus4' then 300
    else null end;
  if v_price is null then raise exception 'unknown_item'; end if;

  if p_item = 'offline_plus4' then
    select count(*) into v_owned from public.gem_ledger where user_id = auth.uid() and reason = 'spend:offline_plus4';
    if v_owned >= 4 then raise exception 'max_level'; end if;
  end if;

  update public.profiles set gems = gems - v_price
   where id = auth.uid() and gems >= v_price
   returning gems into v_left;
  if v_left is null then raise exception 'not_enough_gems'; end if;

  insert into public.gem_ledger (user_id, delta, reason) values (auth.uid(), -v_price, 'spend:' || p_item);
  if p_item = 'boost_4h' then
    update public.profiles set boost_until = greatest(coalesce(boost_until, now()), now()) + interval '4 hours' where id = auth.uid();
  end if;
  return v_left;
end $$;

-- 5 gems per mission, 10 for the all-three bonus, at most 25 per day.
-- p_day is the player's local date; accepted within ±1 day of the server date (time zones).
create or replace function public.claim_daily_gems(p_day date, p_key text)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_amount integer := case when p_key = '__bonus' then 10 else 5 end;
  v_today integer;
  v_left integer;
  v_rows integer;
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  if p_day < current_date - 1 or p_day > current_date + 1 then raise exception 'bad_day'; end if;
  if length(p_key) > 64 then raise exception 'bad_key'; end if;

  select coalesce(sum(delta), 0) into v_today from public.gem_ledger
   where user_id = auth.uid() and reason = 'daily' and ref like p_day::text || ':%';
  if v_today + v_amount > 25 then raise exception 'daily_cap'; end if;

  insert into public.gem_ledger (user_id, delta, reason, ref)
  values (auth.uid(), v_amount, 'daily', p_day::text || ':' || p_key)
  on conflict do nothing;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then raise exception 'already_claimed'; end if;

  update public.profiles set gems = gems + v_amount where id = auth.uid() returning gems into v_left;
  return v_left;
end $$;

-- Called ONLY by the omise-webhook edge function (service role) after it has
-- re-fetched the charge from Omise and confirmed it is paid. Idempotent.
create or replace function public.credit_purchase(p_purchase uuid, p_charge text)
returns boolean language plpgsql security definer set search_path = public as $$
declare p public.purchases;
begin
  select * into p from public.purchases where id = p_purchase for update;
  if not found then raise exception 'unknown_purchase'; end if;
  if p.status = 'paid' then return false; end if;
  if p.charge_id is distinct from p_charge then raise exception 'charge_mismatch'; end if;

  update public.purchases set status = 'paid', paid_at = now() where id = p.id;
  insert into public.gem_ledger (user_id, delta, reason, ref) values (p.user_id, p.gems, 'purchase', p.id::text)
    on conflict do nothing;
  update public.profiles
     set gems = gems + p.gems,
         starter_bought = starter_bought or p.pack = 'starter',
         boost_until = case when p.boost_hours > 0
                            then greatest(coalesce(boost_until, now()), now()) + make_interval(hours => p.boost_hours)
                            else boost_until end
   where id = p.user_id;
  return true;
end $$;

-- ---------------------------------------------------------------- grants

revoke all on function public.credit_purchase(uuid, text) from public, anon, authenticated;
grant execute on function public.credit_purchase(uuid, text) to service_role;

revoke all on function public.save_game(jsonb) from public, anon;
revoke all on function public.load_game() from public, anon;
revoke all on function public.spend_gems(text) from public, anon;
revoke all on function public.claim_daily_gems(date, text) from public, anon;
grant execute on function public.save_game(jsonb) to authenticated;
grant execute on function public.load_game() to authenticated;
grant execute on function public.spend_gems(text) to authenticated;
grant execute on function public.claim_daily_gems(date, text) to authenticated;
grant execute on function public.server_now() to anon, authenticated;
