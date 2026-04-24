create extension if not exists "pgcrypto";

-- -------------------------------------------------------
-- devices: one row per physical BLE wearable
-- -------------------------------------------------------
create table public.devices (
  id           text primary key,
  name         text not null default '',
  last_seen_at timestamptz
);

-- -------------------------------------------------------
-- sessions: one per BLE connect/disconnect lifecycle
-- -------------------------------------------------------
create table public.sessions (
  id         text primary key,
  device_id  text not null references public.devices(id),
  started_at timestamptz not null default now(),
  ended_at   timestamptz
);
create index idx_sessions_device on public.sessions(device_id);

-- -------------------------------------------------------
-- telemetry_events: immutable append log (4 Hz vitals)
-- event_id is the idempotency key from the mobile queue
-- -------------------------------------------------------
create table public.telemetry_events (
  id             bigint generated always as identity primary key,
  event_id       uuid   not null unique,
  session_id     text   not null references public.sessions(id),
  device_id      text   not null references public.devices(id),
  sequence       int    not null,
  recorded_at    timestamptz not null,

  -- vitals
  heart_rate_bpm real,
  spo2_pct       real,
  stress_pct     real,
  temperature_c  real,
  battery_pct    real,

  -- IMU snapshot
  roll_deg  real, pitch_deg real, yaw_deg real,
  accel_x_g real, accel_y_g real, accel_z_g real,
  gyro_x_dps real, gyro_y_dps real, gyro_z_dps real,
  stationary boolean,

  -- phone GPS
  phone_lat        double precision,
  phone_lon        double precision,
  phone_altitude_m real,
  phone_accuracy_m real,

  -- derived fields computed by sync worker before insert
  altitude_m        real,
  vertical_speed_ms real,

  -- AI provenance
  ingested_at    timestamptz not null default now(),
  schema_version smallint    not null default 1,

  unique (session_id, sequence)
);
create index idx_te_session on public.telemetry_events(session_id, recorded_at desc);
create index idx_te_device  on public.telemetry_events(device_id,  recorded_at desc);

-- -------------------------------------------------------
-- alert_events: immutable alert log
-- -------------------------------------------------------
create table public.alert_events (
  id             bigint generated always as identity primary key,
  event_id       uuid   not null unique,
  session_id     text   not null references public.sessions(id),
  device_id      text   not null references public.devices(id),
  sequence       int    not null,
  recorded_at    timestamptz not null,

  severity       text not null check (severity in ('critical','warning','info')),
  alert_type     text not null,
  message        text not null,

  heart_rate_bpm    real,
  spo2_pct          real,
  stress_pct        real,
  temperature_c     real,
  battery_pct       real,
  altitude_m        real,
  vertical_speed_ms real,

  -- web-side lifecycle
  acknowledged    boolean     not null default false,
  acknowledged_at timestamptz,

  ingested_at    timestamptz not null default now(),
  schema_version smallint    not null default 1
);
create index idx_ae_session on public.alert_events(session_id, recorded_at desc);
create index idx_ae_unacked on public.alert_events(acknowledged, recorded_at desc)
  where not acknowledged;

-- -------------------------------------------------------
-- skydiver_profiles: static display names per device
-- Populated manually after BLE device IDs are known
-- -------------------------------------------------------
create table public.skydiver_profiles (
  device_id   text primary key references public.devices(id),
  name        text not null,
  avatar      text not null,
  total_jumps int  not null default 0
);

-- -------------------------------------------------------
-- ai_jobs: async processing queue for future AI pipeline
-- -------------------------------------------------------
create table public.ai_jobs (
  id            bigint generated always as identity primary key,
  job_type      text not null,
  session_id    text references public.sessions(id),
  device_id     text references public.devices(id),
  input_payload jsonb not null,
  status        text not null default 'pending'
                check (status in ('pending','running','done','failed')),
  result        jsonb,
  error         text,
  created_at    timestamptz not null default now(),
  finished_at   timestamptz
);
create index idx_ai_pending on public.ai_jobs(status, created_at)
  where status = 'pending';

-- -------------------------------------------------------
-- current_skydivers view: one row per active session
-- Web reads this for the initial dashboard load
-- -------------------------------------------------------
create or replace view public.current_skydivers as
select
  d.id                                      as device_id,
  coalesce(sp.name, d.name, d.id)          as name,
  coalesce(sp.avatar, substr(d.id, 1, 2))  as avatar,
  s.id                                      as session_id,
  te.heart_rate_bpm,
  te.spo2_pct,
  te.stress_pct,
  te.temperature_c,
  te.battery_pct,
  te.altitude_m,
  te.vertical_speed_ms,
  te.roll_deg,
  te.pitch_deg,
  te.yaw_deg,
  te.stationary,
  te.phone_lat,
  te.phone_lon,
  te.recorded_at as last_update,
  case
    when te.stationary = true and coalesce(te.altitude_m, 0) < 30 then 'landed'
    when te.stationary = true                                        then 'standby'
    when coalesce(te.vertical_speed_ms, 0) < -15                   then 'freefall'
    when coalesce(te.vertical_speed_ms, 0) < -2                    then 'canopy_open'
    when coalesce(te.altitude_m, 0) < 30                           then 'landed'
    else 'standby'
  end as status,
  (
    coalesce(te.vertical_speed_ms, 0) between -8 and -1
    and coalesce(te.altitude_m, 0) < 1500
  ) as parachute_open
from public.devices d
join public.sessions s
  on s.device_id = d.id and s.ended_at is null
left join public.skydiver_profiles sp
  on sp.device_id = d.id
left join lateral (
  select *
  from public.telemetry_events
  where device_id = d.id
  order by recorded_at desc
  limit 1
) te on true;

-- -------------------------------------------------------
-- upsert_device_and_session: idempotent session bootstrap
-- Called once per BLE connect by the mobile sync worker
-- -------------------------------------------------------
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

  insert into public.sessions (id, device_id, started_at)
  values (p_session_id, p_device_id, now())
  on conflict (id) do nothing;
end;
$$;
