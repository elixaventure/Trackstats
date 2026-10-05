-- Promo codes: a fixed batch of single-use codes per campaign (e.g. 10 for Bacup MX).
-- Each code works once; when a campaign's codes are used up, there are no more.
-- Riders can't list or read unredeemed codes; they can only redeem one through
-- redeem_promo(), which claims it atomically, so two people can't both win the same code.
--
-- The codes themselves are NOT in this repository (it's public). Load them by
-- running the private seed SQL in the Supabase SQL editor.

alter table public.subscriptions add column if not exists source text;

create table public.promo_codes (
  code text primary key check (code ~ '^[A-Z0-9-]{6,40}$'),
  campaign text not null,
  -- What the code gives: months of Pro.
  pro_months int not null check (pro_months between 1 and 120),
  redeemed_by uuid references auth.users (id) on delete set null,
  redeemed_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.promo_codes (campaign, redeemed_by);

alter table public.promo_codes enable row level security;
-- A rider can see the codes they've redeemed, nothing else. No client writes at all.
create policy "promo codes read own" on public.promo_codes for select using (redeemed_by = auth.uid());

create or replace function public.redeem_promo(p_code text)
returns table (pro_until timestamptz, campaign text, pro_months int)
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  wanted text := upper(regexp_replace(coalesce(p_code, ''), '\s', '', 'g'));
  rec public.promo_codes;
  until timestamptz;
begin
  if uid is null then
    raise exception 'Sign in to claim a code.' using errcode = '28000';
  end if;

  -- Claim it: only one caller can flip an unredeemed row.
  update public.promo_codes set redeemed_by = uid, redeemed_at = now()
    where code = wanted and redeemed_by is null
    returning * into rec;

  if not found then
    if exists (select 1 from public.promo_codes c where c.code = wanted and c.redeemed_by = uid) then
      raise exception 'You''ve already claimed this code.' using errcode = 'P0001';
    elsif exists (select 1 from public.promo_codes c where c.code = wanted) then
      raise exception 'This code has already been used.' using errcode = 'P0001';
    else
      raise exception 'That code isn''t valid. Check it and try again.' using errcode = 'P0001';
    end if;
  end if;

  -- One code per rider per campaign (the exception undoes the claim above).
  if exists (select 1 from public.promo_codes c where c.campaign = rec.campaign and c.redeemed_by = uid and c.code <> rec.code) then
    raise exception 'You''ve already claimed a code from this offer.' using errcode = 'P0001';
  end if;

  -- Add the months to any Pro they already have.
  insert into public.subscriptions as s (user_id, plan, status, current_period_end, source, updated_at)
    values (uid, 'pro', 'active', now() + make_interval(months => rec.pro_months), 'promo:' || rec.campaign, now())
  on conflict (user_id) do update set
    plan = 'pro', status = 'active',
    current_period_end = greatest(coalesce(s.current_period_end, now()), now()) + make_interval(months => rec.pro_months),
    source = excluded.source, updated_at = now()
  returning s.current_period_end into until;

  return query select until, rec.campaign, rec.pro_months;
end;
$$;

revoke all on function public.redeem_promo(text) from public, anon;
grant execute on function public.redeem_promo(text) to authenticated;

-- How many codes are left in a campaign, without revealing them (for "3 of 10 left" displays).
create or replace function public.promo_remaining(p_campaign text)
returns int language sql stable security definer set search_path = public as $$
  select count(*)::int from public.promo_codes where campaign = p_campaign and redeemed_by is null;
$$;
grant execute on function public.promo_remaining(text) to anon, authenticated;
