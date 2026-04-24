"use client"

import { useState, useEffect, useCallback, useMemo, useRef } from "react"
import type { Skydiver, Alert, VitalPoint, AltitudePoint, SkydiverStatus } from "@/lib/types"
import type { CurrentSkydiverRow, AlertEventRow } from "@skydiver/shared"
import { supabase } from "@/lib/supabase-client"

const MAX_HISTORY = 50
const OFFLINE_THRESHOLD_MS = 15_000

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value)
}

function isValidHeartRate(value: number | null | undefined): value is number {
  return isFiniteNumber(value) && value !== 0
}

function isValidOxygen(value: number | null | undefined): value is number {
  return isFiniteNumber(value) && value !== 0
}

function isValidStress(value: number | null | undefined): value is number {
  return isFiniteNumber(value) && value !== 0
}

function isValidTemperature(value: number | null | undefined): value is number {
  return isFiniteNumber(value) && value !== 0
}

function isValidVerticalSpeed(value: number | null | undefined): value is number {
  return isFiniteNumber(value) && value !== 0
}

function sanitizeVitals(row: CurrentSkydiverRow): CurrentSkydiverRow {
  return {
    ...row,
    heart_rate_bpm: isValidHeartRate(row.heart_rate_bpm) ? row.heart_rate_bpm : null,
    spo2_pct: isValidOxygen(row.spo2_pct) ? row.spo2_pct : null,
    stress_pct: isValidStress(row.stress_pct) ? row.stress_pct : null,
    temperature_c: isValidTemperature(row.temperature_c) ? row.temperature_c : null,
  }
}

function isAllVitalsUndetected(row: AlertEventRow & { id: number }): boolean {
  return !isValidHeartRate(row.heart_rate_bpm)
    && !isValidOxygen(row.spo2_pct)
    && !isValidStress(row.stress_pct)
    && !isValidTemperature(row.temperature_c)
}

function shouldIgnoreAlertRow(row: AlertEventRow & { id: number }): boolean {
  if (isAllVitalsUndetected(row)) return true

  switch (row.alert_type) {
    case "abnormal_pulse":
      return !isValidHeartRate(row.heart_rate_bpm)
    case "low_oxygen":
      return !isValidOxygen(row.spo2_pct)
    case "high_stress":
      return !isValidStress(row.stress_pct)
    case "high_temp":
      return !isValidTemperature(row.temperature_c)
    case "uncontrolled_fall":
      return !isValidVerticalSpeed(row.vertical_speed_ms)
    default:
      return false
  }
}

function connVia(lastUpdate: string | null | undefined): Skydiver["connectedVia"] {
  if (!lastUpdate) return "offline"
  return Date.now() - new Date(lastUpdate).getTime() > OFFLINE_THRESHOLD_MS ? "offline" : "ble"
}

function computeRiskScore(row: CurrentSkydiverRow): number {
  let score = 0
  if ((row.heart_rate_bpm ?? 0) > 160) score += 20
  if ((row.spo2_pct ?? 100) < 93)      score += 25
  if ((row.stress_pct ?? 0) > 75)       score += 20
  if ((row.battery_pct ?? 100) < 20)    score += 10
  if (row.status === "alert")            score += 25
  return Math.min(100, score)
}

function derivePosition(roll: number | null, pitch: number | null): Skydiver["position"] {
  if (roll == null || pitch == null) return "stable"
  if (Math.abs(roll) > 45 || Math.abs(pitch) > 45) return "tumbling"
  if (pitch < -30) return "headdown"
  if (Math.abs(roll) > 20) return "tracking"
  return "stable"
}

function rowToSkydiver(
  row: CurrentSkydiverRow,
  vitalHistory: VitalPoint[],
  altitudeHistory: AltitudePoint[],
): Skydiver {
  return {
    id:             row.device_id,
    name:           row.name,
    avatar:         row.avatar,
    status:         (row.status as SkydiverStatus) || "standby",
    jumpNumber:     0,
    altitude:       row.altitude_m       ?? 0,
    verticalSpeed:  row.vertical_speed_ms ?? 0,
    heartRate:      row.heart_rate_bpm   ?? Number.NaN,
    oxygen:         row.spo2_pct         ?? Number.NaN,
    stress:         row.stress_pct       ?? Number.NaN,
    temperature:    row.temperature_c    ?? Number.NaN,
    battery:        row.battery_pct      ?? 0,
    parachuteOpen:  row.parachute_open,
    position:       derivePosition(row.roll_deg, row.pitch_deg),
    lastUpdate:     row.last_update ? new Date(row.last_update) : new Date(),
    vitalHistory,
    altitudeHistory,
    riskScore:      computeRiskScore(row),
    connectedVia:   connVia(row.last_update),
  }
}

function alertRowToAlert(
  row: AlertEventRow & { id: number },
  skydiverName: string,
): Alert {
  const typed = (row.alert_type as Alert["type"]) || "abnormal_behavior"

  const value = (() => {
    if (typed === "abnormal_pulse") return isValidHeartRate(row.heart_rate_bpm) ? row.heart_rate_bpm : undefined
    if (typed === "low_oxygen") return isValidOxygen(row.spo2_pct) ? row.spo2_pct : undefined
    if (typed === "high_stress") return isValidStress(row.stress_pct) ? row.stress_pct : undefined
    if (typed === "high_temp") return isValidTemperature(row.temperature_c) ? row.temperature_c : undefined
    if (typed === "low_battery") return isFiniteNumber(row.battery_pct) ? row.battery_pct : undefined
    if (typed === "uncontrolled_fall") {
      return isValidVerticalSpeed(row.vertical_speed_ms) ? Math.abs(row.vertical_speed_ms) : undefined
    }
    if (typed === "accident_risk") return isFiniteNumber(row.altitude_m) ? row.altitude_m : undefined
    return undefined
  })()

  return {
    id:            String(row.id),
    skydiverId:    row.device_id,
    skydiverName,
    type:          typed,
    severity:      row.severity,
    message:       row.message,
    timestamp:     new Date(row.recorded_at),
    acknowledged:  (row as any).acknowledged ?? false,
    value,
    threshold:     undefined,
  }
}

export function useSkydivers() {
  const [skydivers, setSkydivers] = useState<Skydiver[]>([])
  const [alerts, setAlerts]       = useState<Alert[]>([])
  const [tick, setTick]           = useState(0)
  const [initialLoaded, setInitialLoaded] = useState(false)

  const historyRef = useRef(
    new Map<string, { vital: VitalPoint[]; altitude: AltitudePoint[] }>()
  )
  const skydiverNamesRef = useRef(new Map<string, string>())

  // Staleness poller — marks a skydiver offline when no telemetry for OFFLINE_THRESHOLD_MS
  useEffect(() => {
    const interval = setInterval(() => {
      setSkydivers(prev => prev.map(s => {
        const stale = Date.now() - s.lastUpdate.getTime() > OFFLINE_THRESHOLD_MS
        if (stale && s.connectedVia !== "offline") return { ...s, connectedVia: "offline" }
        if (!stale && s.connectedVia === "offline") return { ...s, connectedVia: "ble" }
        return s
      }))
    }, 5_000)
    return () => clearInterval(interval)
  }, [])

  // Initial load
  useEffect(() => {
    async function load() {
      const [{ data: sdRows, error: sdErr }, { data: alertRows, error: aErr }] =
        await Promise.all([
          supabase.from("current_skydivers").select("*"),
          supabase
            .from("alert_events")
            .select("*")
            .order("recorded_at", { ascending: false })
            .limit(200),
        ])

      if (sdErr)  console.error("[useSkydivers] fetch error:", sdErr.message)
      if (aErr)   console.error("[useSkydivers] alerts fetch error:", aErr.message)

      if (sdRows) {
        // Deduplicate by device_id — DB unique index prevents this now, but safety net
        const seen = new Map<string, CurrentSkydiverRow>()
        for (const row of sdRows as CurrentSkydiverRow[]) {
          seen.set(row.device_id, row)
        }
        const mapped = Array.from(seen.values()).map(raw => {
          const r = sanitizeVitals(raw)
          const hist = { vital: [] as VitalPoint[], altitude: [] as AltitudePoint[] }
          historyRef.current.set(r.device_id, hist)
          skydiverNamesRef.current.set(r.device_id, r.name)
          return rowToSkydiver(r, hist.vital, hist.altitude)
        })
        setSkydivers(mapped)
      }

      if (alertRows) {
        const names = skydiverNamesRef.current
        setAlerts(
          (alertRows as Array<AlertEventRow & { id: number }>)
            .filter(r => !shouldIgnoreAlertRow(r))
            .map(r => alertRowToAlert(r, names.get(r.device_id) ?? r.device_id))
        )
      }

      setInitialLoaded(true)
    }
    load()
  }, [])

  const activeDeviceIds = useMemo(() => {
    return Array.from(new Set(skydivers.map(s => s.id).filter(Boolean)))
  }, [skydivers])

  const deviceSetKey = useMemo(() => {
    return activeDeviceIds.slice().sort().join(",")
  }, [activeDeviceIds])

  // Realtime subscriptions
  useEffect(() => {
    if (!initialLoaded) return

    const channel = supabase
      .channel(`skydiver-live:${deviceSetKey || "none"}`)
      .on(
        // Session opened → fetch and add skydiver so filtered handlers can rebuild.
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "sessions" },
        payload => {
          const session = payload.new as { device_id: string }
          const deviceId = session.device_id

          if (!deviceId) return

          ;(async () => {
            const { data } = await supabase
              .from("current_skydivers")
              .select("*")
              .eq("device_id", deviceId)
              .single()
            if (!data) return

            const r = data as CurrentSkydiverRow
            const hist = historyRef.current.get(r.device_id) ?? {
              vital: [] as VitalPoint[],
              altitude: [] as AltitudePoint[],
            }
            historyRef.current.set(r.device_id, hist)
            skydiverNamesRef.current.set(r.device_id, r.name)

            setSkydivers(cur =>
              cur.find(s => s.id === r.device_id)
                ? cur
                : [...cur, rowToSkydiver(r, hist.vital, hist.altitude)]
            )
          })().catch(() => {})
        },
      )
      .on(
        // Session closed → remove skydiver from dashboard
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "sessions" },
        payload => {
          const session = payload.new as { device_id: string; ended_at: string | null }
          if (session.ended_at) {
            setSkydivers(prev => prev.filter(s => s.id !== session.device_id))
            historyRef.current.delete(session.device_id)
          }
        },
      )

    // Telemetry: one filtered handler per active device.
    for (const deviceId of activeDeviceIds) {
      channel.on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "telemetry_events",
          filter: `device_id=eq.${deviceId}`,
        },
        payload => {
          const row = payload.new as any
          const deviceIdFromRow = row.device_id as string

          setSkydivers(prev => {
            const existing = prev.find(s => s.id === deviceIdFromRow)

            // New device connected — fetch its profile and add it.
            if (!existing) {
              ;(async () => {
                const { data } = await supabase
                  .from("current_skydivers")
                  .select("*")
                  .eq("device_id", deviceIdFromRow)
                  .single()
                if (!data) return

                const r = data as CurrentSkydiverRow
                const hist = { vital: [] as VitalPoint[], altitude: [] as AltitudePoint[] }

                historyRef.current.set(r.device_id, hist)
                skydiverNamesRef.current.set(r.device_id, r.name)

                setSkydivers(cur =>
                  cur.find(s => s.id === r.device_id)
                    ? cur
                    : [...cur, rowToSkydiver(r, hist.vital, hist.altitude)]
                )
              })().catch(() => {})

              return prev
            }

            const hist = historyRef.current.get(deviceIdFromRow) ?? {
              vital: [],
              altitude: [],
            }

            const now = row.recorded_at as string

            const nextHeartRate = isValidHeartRate(row.heart_rate_bpm) ? row.heart_rate_bpm : Number.NaN
            const nextOxygen = isValidOxygen(row.spo2_pct) ? row.spo2_pct : Number.NaN
            const nextStress = isValidStress(row.stress_pct) ? row.stress_pct : Number.NaN
            const nextTemperature = isValidTemperature(row.temperature_c) ? row.temperature_c : Number.NaN

            const newVital: VitalPoint = {
              time: now,
              heartRate: nextHeartRate,
              oxygen: nextOxygen,
              stress: nextStress,
              temperature: nextTemperature,
            }

            const newAlt: AltitudePoint = {
              time: now,
              altitude: row.altitude_m ?? existing.altitude,
              verticalSpeed: row.vertical_speed_ms ?? existing.verticalSpeed,
            }

            hist.vital = [...hist.vital.slice(-(MAX_HISTORY - 1)), newVital]
            hist.altitude = [...hist.altitude.slice(-(MAX_HISTORY - 1)), newAlt]
            historyRef.current.set(deviceIdFromRow, hist)

            const updatedRow: CurrentSkydiverRow = {
              device_id: deviceIdFromRow,
              name: existing.name,
              avatar: existing.avatar,
              session_id: (existing as any).session_id ?? "",
              heart_rate_bpm: nextHeartRate,
              spo2_pct: nextOxygen,
              stress_pct: nextStress,
              temperature_c: nextTemperature,
              battery_pct: row.battery_pct ?? existing.battery,
              altitude_m: row.altitude_m ?? existing.altitude,
              vertical_speed_ms: row.vertical_speed_ms ?? existing.verticalSpeed,
              roll_deg: row.roll_deg ?? null,
              pitch_deg: row.pitch_deg ?? null,
              yaw_deg: row.yaw_deg ?? null,
              stationary: row.stationary ?? null,
              phone_lat: row.phone_lat ?? null,
              phone_lon: row.phone_lon ?? null,
              last_update: now,
              status: deriveStatus(row, existing.status),
              parachute_open: deriveParachute(row),
            }

            return prev.map(s =>
              s.id === deviceIdFromRow
                ? rowToSkydiver(updatedRow, hist.vital, hist.altitude)
                : s
            )
          })

          setTick(t => t + 1)
        },
      )
    }

    // Alerts: one filtered handler per active device.
    for (const deviceId of activeDeviceIds) {
      channel.on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "alert_events",
          filter: `device_id=eq.${deviceId}`,
        },
        payload => {
          const row = payload.new as AlertEventRow & { id: number }
          if (shouldIgnoreAlertRow(row)) return
          const name = skydiverNamesRef.current.get(row.device_id) ?? row.device_id

          setAlerts(prev => [alertRowToAlert(row, name), ...prev])
          setTick(t => t + 1)
        },
      )
    }

    channel.subscribe(status => {
      if (__DEV_CHECK__ && status === "SUBSCRIBED")
        console.log("[useSkydivers] realtime subscribed")
    })

    return () => { supabase.removeChannel(channel) }
  }, [initialLoaded, deviceSetKey])

  const acknowledgeAlert = useCallback(async (alertId: string) => {
    setAlerts(prev =>
      prev.map(a => (a.id === alertId ? { ...a, acknowledged: true } : a))
    )
    await supabase
      .from("alert_events")
      .update({ acknowledged: true, acknowledged_at: new Date().toISOString() })
      .eq("id", Number(alertId))
  }, [])

  const acknowledgeAll = useCallback(async () => {
    const ids = alerts.filter(a => !a.acknowledged).map(a => Number(a.id))
    setAlerts(prev => prev.map(a => ({ ...a, acknowledged: true })))
    if (ids.length > 0) {
      await supabase
        .from("alert_events")
        .update({ acknowledged: true, acknowledged_at: new Date().toISOString() })
        .in("id", ids)
    }
  }, [alerts])

  const unacknowledgedAlerts = alerts.filter(a => !a.acknowledged)
  const criticalAlerts       = unacknowledgedAlerts.filter(a => a.severity === "critical")

  return {
    skydivers,
    alerts,
    unacknowledgedAlerts,
    criticalAlerts,
    acknowledgeAlert,
    acknowledgeAll,
    tick,
  }
}

function gyroMag(row: any): number {
  const gx = (row.gyro_x_dps as number | null) ?? 0
  const gy = (row.gyro_y_dps as number | null) ?? 0
  const gz = (row.gyro_z_dps as number | null) ?? 0
  return Math.sqrt(gx * gx + gy * gy + gz * gz)
}

function accelMag(row: any): number | null {
  const ax = row.accel_x_g as number | null
  if (ax === null) return null
  const ay = (row.accel_y_g as number | null) ?? 0
  const az = (row.accel_z_g as number | null) ?? 0
  return Math.sqrt(ax * ax + ay * ay + az * az)
}

function isCanopyAccel(row: any): boolean {
  const am = accelMag(row)
  return am === null || (am >= 0.75 && am <= 1.25)
}

function deriveStatus(row: any, fallback: SkydiverStatus): SkydiverStatus {
  const alt = (row.altitude_m        as number | null) ?? 0
  const vs  =  row.vertical_speed_ms as number | null
  const sta = (row.stationary        as boolean | null) ?? false

  if (sta && alt < 30) return "landed"
  if (sta)             return "standby"
  if (vs !== null && vs < -15) return "freefall"
  if (vs !== null && vs >= -9 && vs <= -1.5 && gyroMag(row) < 30 && isCanopyAccel(row)) return "canopy_open"
  if (alt < 30) return "landed"
  return fallback
}

function deriveParachute(row: any): boolean {
  const vs  =  row.vertical_speed_ms as number | null
  const alt = (row.altitude_m        as number | null) ?? 0
  const sta = (row.stationary        as boolean | null) ?? false
  return vs !== null
    && vs >= -9 && vs <= -1.5
    && alt > 10 && alt < 1500
    && !sta
    && gyroMag(row) < 30
    && isCanopyAccel(row)
}

// safe check for __DEV__ — Next.js does not expose it by default
const __DEV_CHECK__ =
  typeof process !== "undefined" && process.env.NODE_ENV === "development"
