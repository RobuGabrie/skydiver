-- Enable RLS on all tables
alter table public.devices           enable row level security;
alter table public.sessions          enable row level security;
alter table public.telemetry_events  enable row level security;
alter table public.alert_events      enable row level security;
alter table public.skydiver_profiles enable row level security;
alter table public.ai_jobs           enable row level security;

-- devices: mobile can upsert (via rpc function), all can select
create policy "anon_select" on public.devices for select to anon using (true);
create policy "anon_insert" on public.devices for insert to anon with check (true);
create policy "anon_update" on public.devices for update to anon using (true) with check (true);

-- sessions: mobile inserts, web selects
create policy "anon_select" on public.sessions for select to anon using (true);
create policy "anon_insert" on public.sessions for insert to anon with check (true);

-- telemetry_events: mobile inserts, web selects — no UPDATE or DELETE (immutable)
create policy "anon_select" on public.telemetry_events for select to anon using (true);
create policy "anon_insert" on public.telemetry_events for insert to anon with check (true);

-- alert_events: mobile inserts, web selects and can acknowledge
create policy "anon_select" on public.alert_events for select to anon using (true);
create policy "anon_insert" on public.alert_events for insert to anon with check (true);
create policy "anon_ack"    on public.alert_events for update to anon
  using (true)
  with check (acknowledged = true);  -- only allow flipping to true, never back

-- skydiver_profiles: read-only for anon (populated via service role / dashboard)
create policy "anon_select" on public.skydiver_profiles for select to anon using (true);

-- ai_jobs: mobile/server can enqueue, all can select
create policy "anon_select" on public.ai_jobs for select to anon using (true);
create policy "anon_insert" on public.ai_jobs for insert to anon with check (true);

-- Enable realtime publications for web subscriptions
alter publication supabase_realtime add table public.telemetry_events;
alter publication supabase_realtime add table public.alert_events;
