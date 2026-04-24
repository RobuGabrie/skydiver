import type { TelemetryEventRow, AlertEventRow } from '@skydiver/shared'
import type { SlowTelemetryEvent, AlertTelemetryEvent } from './types'

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function hash32(input: string, seed: number): number {
  let h = seed >>> 0
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function toHex32(n: number): string {
  return n.toString(16).padStart(8, '0')
}

function normalizeEventId(eventId: string): string {
  if (UUID_REGEX.test(eventId)) return eventId.toLowerCase()

  // Legacy queue rows used session-based event IDs; map them deterministically to UUID.
  const hex = [
    toHex32(hash32(eventId, 0x811c9dc5)),
    toHex32(hash32(eventId, 0x9e3779b9)),
    toHex32(hash32(eventId, 0x85ebca6b)),
    toHex32(hash32(eventId, 0xc2b2ae35)),
  ].join('')

  const chars = hex.split('')
  chars[12] = '4'
  const variant = parseInt(chars[16], 16)
  chars[16] = ((variant & 0x3) | 0x8).toString(16)
  const normalized = chars.join('')

  return [
    normalized.slice(0, 8),
    normalized.slice(8, 12),
    normalized.slice(12, 16),
    normalized.slice(16, 20),
    normalized.slice(20, 32),
  ].join('-')
}

export function slowEventToRow(e: SlowTelemetryEvent): TelemetryEventRow {
  const d = e.data
  return {
    event_id:         normalizeEventId(e.eventId),
    session_id:       e.sessionId,
    device_id:        e.deviceId,
    sequence:         e.sequence,
    recorded_at:      new Date(e.timestamp).toISOString(),

    heart_rate_bpm:   d.heartRate   ?? null,
    spo2_pct:         d.oxygen      ?? null,
    stress_pct:       d.stress      ?? null,
    temperature_c:    d.temperature ?? null,
    battery_pct:      d.battery     ?? null,

    roll_deg:         d.rollDeg   ?? null,
    pitch_deg:        d.pitchDeg  ?? null,
    yaw_deg:          d.yawDeg    ?? null,
    accel_x_g:        d.accelX    ?? null,
    accel_y_g:        d.accelY    ?? null,
    accel_z_g:        d.accelZ    ?? null,
    gyro_x_dps:       d.gyroX     ?? null,
    gyro_y_dps:       d.gyroY     ?? null,
    gyro_z_dps:       d.gyroZ     ?? null,
    stationary:       typeof d.stationary === 'number' ? d.stationary === 1 : null,

    phone_lat:          d.phoneLat              ?? null,
    phone_lon:          d.phoneLon              ?? null,
    phone_altitude_m:   d.phoneAltitude         ?? null,
    phone_accuracy_m:   d.phoneLocationAccuracy ?? null,
    altitude_m:         d.phoneAltitude         ?? null,
    vertical_speed_ms:  d.verticalSpeed         ?? null,

    schema_version: 1,
  }
}

export function alertEventToRow(e: AlertTelemetryEvent): AlertEventRow {
  const d = e.data
  return {
    event_id:      normalizeEventId(e.eventId),
    session_id:    e.sessionId,
    device_id:     e.deviceId,
    sequence:      e.sequence,
    recorded_at:   new Date(e.timestamp).toISOString(),

    severity:    d.severity === 'danger' ? 'critical' : d.severity,
    alert_type:  d.alertType ?? 'abnormal_behavior',
    message:     d.message,

    heart_rate_bpm:    d.heartRate    ?? null,
    spo2_pct:          d.oxygen       ?? null,
    stress_pct:        d.stress       ?? null,
    temperature_c:     d.temperature  ?? null,
    battery_pct:       d.battery      ?? null,
    altitude_m:        d.altitude     ?? null,
    vertical_speed_ms: d.verticalSpeed ?? null,

    schema_version: 1,
  }
}
