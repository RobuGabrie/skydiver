import type { AlertSeverityDB, AlertType } from './domain'

/** Mirrors telemetry_events columns 1:1. Used by mobile sync worker for INSERT. */
export interface TelemetryEventRow {
  event_id:         string
  session_id:       string
  device_id:        string
  sequence:         number
  recorded_at:      string  // ISO 8601

  heart_rate_bpm?:  number | null
  spo2_pct?:        number | null
  stress_pct?:      number | null
  temperature_c?:   number | null
  battery_pct?:     number | null

  roll_deg?:        number | null
  pitch_deg?:       number | null
  yaw_deg?:         number | null
  accel_x_g?:       number | null
  accel_y_g?:       number | null
  accel_z_g?:       number | null
  gyro_x_dps?:      number | null
  gyro_y_dps?:      number | null
  gyro_z_dps?:      number | null
  stationary?:      boolean | null

  phone_lat?:         number | null
  phone_lon?:         number | null
  phone_altitude_m?:  number | null
  phone_accuracy_m?:  number | null
  altitude_m?:        number | null
  vertical_speed_ms?: number | null

  schema_version: number
}

/** Mirrors alert_events columns 1:1. Used by mobile sync worker for INSERT. */
export interface AlertEventRow {
  event_id:      string
  session_id:    string
  device_id:     string
  sequence:      number
  recorded_at:   string

  severity:    AlertSeverityDB
  alert_type:  string
  message:     string

  heart_rate_bpm?:    number | null
  spo2_pct?:          number | null
  stress_pct?:        number | null
  temperature_c?:     number | null
  battery_pct?:       number | null
  altitude_m?:        number | null
  vertical_speed_ms?: number | null

  schema_version: number
}

/** What current_skydivers view returns. Web maps this to Skydiver UI type. */
export interface CurrentSkydiverRow {
  device_id:        string
  name:             string
  avatar:           string
  session_id:       string
  heart_rate_bpm:   number | null
  spo2_pct:         number | null
  stress_pct:       number | null
  temperature_c:    number | null
  battery_pct:      number | null
  altitude_m:       number | null
  vertical_speed_ms: number | null
  roll_deg:         number | null
  pitch_deg:        number | null
  yaw_deg:          number | null
  stationary:       boolean | null
  phone_lat:        number | null
  phone_lon:        number | null
  last_update:      string | null
  status:           string
  parachute_open:   boolean
}

export type { AlertSeverityDB, AlertType }
