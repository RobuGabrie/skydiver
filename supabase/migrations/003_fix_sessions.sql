-- Close any stale open sessions left over from before this fix
update public.sessions
set ended_at = now()
where ended_at is null;

-- Enforce only one active session per device at the DB level
create unique index if not exists idx_sessions_one_active_per_device
  on public.sessions (device_id)
  where ended_at is null;

-- Update bootstrap function: close stale sessions before opening a new one
create or replace function public.upsert_device_and_session(
  p_device_id  text,
  p_session_id text
) returns void
language plpgsql
security definer
as $$
begin
  insert into public.devices (id, name, last_seen_at)
  values (p_device_id, p_device_id, now())
  on conflict (id) do update set last_seen_at = now();

  -- Close any existing open session for this device before creating a new one
  update public.sessions
  set ended_at = now()
  where device_id = p_device_id
    and ended_at is null
    and id != p_session_id;

  insert into public.sessions (id, device_id, started_at)
  values (p_session_id, p_device_id, now())
  on conflict (id) do nothing;
end;
$$;

-- Allow anon to close sessions (set ended_at) — needed for disconnect signal
create policy "anon_close_session" on public.sessions
  for update to anon
  using (true)
  with check (ended_at is not null);

-- Enable realtime on sessions so web can react to disconnects
alter publication supabase_realtime add table public.sessions;
