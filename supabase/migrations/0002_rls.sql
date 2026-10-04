-- Row Level Security. Principles:
--   * A user writes only rows for riders they manage (rider_profiles.owner_user_id).
--   * A rider's data is readable by its owner, by members of a shared group, and
--     by anyone if the rider's profile is public.
--   * Public routes and the public leaderboard are readable by everyone, including anon.
-- Helper functions are SECURITY DEFINER so policies don't recurse through each other.

create or replace function public.owns_rider(rid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from rider_profiles where id = rid and owner_user_id = auth.uid());
$$;

create or replace function public.in_group(gid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from group_members m join rider_profiles r on r.id = m.rider_id
    where m.group_id = gid and r.owner_user_id = auth.uid()
  ) or exists (select 1 from groups where id = gid and created_by_user_id = auth.uid());
$$;

create or replace function public.manages_group(gid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from group_members m join rider_profiles r on r.id = m.rider_id
    where m.group_id = gid and m.role = 'manager' and r.owner_user_id = auth.uid()
  ) or exists (select 1 from groups where id = gid and created_by_user_id = auth.uid());
$$;

create or replace function public.can_view_rider(rid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from rider_profiles where id = rid and (owner_user_id = auth.uid() or visibility = 'public'))
      or exists (
        select 1 from group_members a join group_members b on a.group_id = b.group_id
        join rider_profiles mine on mine.id = b.rider_id
        where a.rider_id = rid and mine.owner_user_id = auth.uid()
      );
$$;

create or replace function public.can_view_session(sid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from sessions where id = sid and public.can_view_rider(rider_id));
$$;

create or replace function public.owns_session(sid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from sessions where id = sid and public.owns_rider(rider_id));
$$;

create or replace function public.can_use_transponder(tid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from transponders t where t.id = tid and (
      (t.owner_rider_id is not null and public.owns_rider(t.owner_rider_id)) or
      (t.owner_group_id is not null and public.in_group(t.owner_group_id))
    )
  );
$$;

alter table public.conditions enable row level security;
alter table public.rider_profiles enable row level security;
alter table public.bikes enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.transponders enable row level security;
alter table public.transponder_assignments enable row level security;
alter table public.routes enable row level security;
alter table public.route_points enable row level security;
alter table public.route_sectors enable row level security;
alter table public.sessions enable row level security;
alter table public.timing_events enable row level security;
alter table public.laps enable row level security;
alter table public.gps_points enable row level security;
alter table public.achievements enable row level security;
alter table public.subscriptions enable row level security;

create policy "conditions readable" on public.conditions for select using (true);

-- Riders
create policy "riders read" on public.rider_profiles for select using (public.can_view_rider(id));
create policy "riders insert own" on public.rider_profiles for insert with check (owner_user_id = auth.uid());
create policy "riders update own" on public.rider_profiles for update using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());
create policy "riders delete own" on public.rider_profiles for delete using (owner_user_id = auth.uid());

-- Bikes
create policy "bikes read" on public.bikes for select using (public.can_view_rider(rider_id));
create policy "bikes write own" on public.bikes for all using (public.owns_rider(rider_id)) with check (public.owns_rider(rider_id));

-- Groups
create policy "groups read members" on public.groups for select using (public.in_group(id));
create policy "groups create" on public.groups for insert with check (created_by_user_id = auth.uid());
create policy "groups manage" on public.groups for update using (public.manages_group(id));
create policy "groups delete creator" on public.groups for delete using (created_by_user_id = auth.uid());

create policy "members read" on public.group_members for select using (public.in_group(group_id));
create policy "members add by manager" on public.group_members for insert with check (public.manages_group(group_id));
create policy "members update by manager" on public.group_members for update using (public.manages_group(group_id));
-- Managers remove anyone; riders can always leave.
create policy "members remove" on public.group_members for delete using (public.manages_group(group_id) or public.owns_rider(rider_id));

-- Transponders
create policy "tags read" on public.transponders for select using (public.can_use_transponder(id));
create policy "tags create" on public.transponders for insert with check (
  (owner_rider_id is not null and public.owns_rider(owner_rider_id)) or (owner_group_id is not null and public.manages_group(owner_group_id))
);
create policy "tags update" on public.transponders for update using (public.can_use_transponder(id));
create policy "tags delete" on public.transponders for delete using (
  (owner_rider_id is not null and public.owns_rider(owner_rider_id)) or (owner_group_id is not null and public.manages_group(owner_group_id))
);

create policy "assignments read" on public.transponder_assignments for select using (public.can_use_transponder(transponder_id));
-- Assign a tag to a rider you manage, or (as a group manager) to any member of the tag's group.
create policy "assignments write" on public.transponder_assignments for insert with check (
  assigned_by_user_id = auth.uid() and public.can_use_transponder(transponder_id) and (
    public.owns_rider(rider_id) or exists (
      select 1 from transponders t join group_members m on m.group_id = t.owner_group_id
      where t.id = transponder_id and m.rider_id = transponder_assignments.rider_id and public.manages_group(t.owner_group_id)
    )
  )
);
create policy "assignments release" on public.transponder_assignments for update using (public.can_use_transponder(transponder_id));

-- Routes: public ones are readable by anyone (anon included) for discovery and leaderboards.
create policy "routes read" on public.routes for select using (visibility = 'public' or created_by_user_id = auth.uid());
create policy "routes write own" on public.routes for all using (created_by_user_id = auth.uid()) with check (created_by_user_id = auth.uid());

create policy "route points read" on public.route_points for select using (
  exists (select 1 from routes r where r.id = route_id and (r.visibility = 'public' or r.created_by_user_id = auth.uid()))
);
create policy "route points write" on public.route_points for all using (
  exists (select 1 from routes r where r.id = route_id and r.created_by_user_id = auth.uid())
) with check (exists (select 1 from routes r where r.id = route_id and r.created_by_user_id = auth.uid()));

create policy "route sectors read" on public.route_sectors for select using (
  exists (select 1 from routes r where r.id = route_id and (r.visibility = 'public' or r.created_by_user_id = auth.uid()))
);
create policy "route sectors write" on public.route_sectors for all using (
  exists (select 1 from routes r where r.id = route_id and r.created_by_user_id = auth.uid())
) with check (exists (select 1 from routes r where r.id = route_id and r.created_by_user_id = auth.uid()));

-- Sessions and everything recorded in them
create policy "sessions read" on public.sessions for select using (public.can_view_rider(rider_id));
create policy "sessions write own" on public.sessions for all using (public.owns_rider(rider_id)) with check (public.owns_rider(rider_id));

create policy "events read" on public.timing_events for select using (public.can_view_session(session_id));
create policy "events write own" on public.timing_events for all using (public.owns_session(session_id)) with check (public.owns_session(session_id) and public.owns_rider(rider_id));

create policy "laps read" on public.laps for select using (public.can_view_session(session_id));
create policy "laps write own" on public.laps for all using (public.owns_session(session_id)) with check (public.owns_session(session_id) and public.owns_rider(rider_id));

-- GPS traces reveal where someone rides: owner and group members only, never public.
create policy "gps read" on public.gps_points for select using (
  exists (select 1 from sessions s where s.id = session_id and (public.owns_rider(s.rider_id) or exists (
    select 1 from group_members a join group_members b on a.group_id = b.group_id
    join rider_profiles mine on mine.id = b.rider_id where a.rider_id = s.rider_id and mine.owner_user_id = auth.uid()
  )))
);
create policy "gps write own" on public.gps_points for all using (public.owns_session(session_id)) with check (public.owns_session(session_id));

create policy "achievements read" on public.achievements for select using (public.can_view_rider(rider_id));
-- No client write policy: achievements are recorded server-side.

create policy "subscriptions read own" on public.subscriptions for select using (user_id = auth.uid());
-- No client write policy: only the billing webhook (service role) writes subscriptions.

grant select on public.leaderboard_entries to anon, authenticated;
