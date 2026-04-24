-- Fix parachute detection: use GPS-derived vertical_speed_ms + IMU gyro + accel magnitude.
--
-- Previously vertical_speed_ms was always NULL (never computed by mobile app),
-- so parachute_open always evaluated to false. Now uses four signals:
--   1. vertical_speed_ms:  -9 to -1.5 m/s    GPS-derived (canopy; freefall < -15)
--   2. altitude_m:         10 to 1500 m       GPS (above ground, below deployment alt)
--   3. stationary:         false              ESP32 ZUPT (stationary = landed)
--   4. gyro magnitude:     < 30 dps           ESP32 MPU9250 (canopy swing vs freefall tumble)
--   5. accel magnitude:    0.75 – 1.25 g      ESP32 MPU9250 (canopy ≈ 1g; freefall varies 0.3–2g+)
--      (accel check is skipped when the column is null — fast packet not yet received)

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
    when te.stationary = true and coalesce(te.altitude_m, 0) < 30  then 'landed'
    when te.stationary = true                                        then 'standby'
    when te.vertical_speed_ms < -15                                  then 'freefall'
    when te.vertical_speed_ms between -9 and -1.5
         and sqrt(
           power(coalesce(te.gyro_x_dps, 0), 2) +
           power(coalesce(te.gyro_y_dps, 0), 2) +
           power(coalesce(te.gyro_z_dps, 0), 2)
         ) < 30
         and (
           te.accel_x_g is null
           or sqrt(
             power(te.accel_x_g, 2) +
             power(coalesce(te.accel_y_g, 0), 2) +
             power(coalesce(te.accel_z_g, 0), 2)
           ) between 0.75 and 1.25
         )                                                            then 'canopy_open'
    when coalesce(te.altitude_m, 0) < 30                             then 'landed'
    else 'standby'
  end as status,
  (
    te.vertical_speed_ms is not null
    and te.vertical_speed_ms between -9 and -1.5
    and coalesce(te.altitude_m, 0) between 10 and 1500
    and coalesce(te.stationary, false) = false
    and sqrt(
      power(coalesce(te.gyro_x_dps, 0), 2) +
      power(coalesce(te.gyro_y_dps, 0), 2) +
      power(coalesce(te.gyro_z_dps, 0), 2)
    ) < 30
    and (
      te.accel_x_g is null
      or sqrt(
        power(te.accel_x_g, 2) +
        power(coalesce(te.accel_y_g, 0), 2) +
        power(coalesce(te.accel_z_g, 0), 2)
      ) between 0.75 and 1.25
    )
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
