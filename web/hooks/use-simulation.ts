"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { Skydiver, Alert, AlertType } from "@/lib/types"
import { MOCK_SKYDIVERS, MOCK_ALERTS } from "@/lib/mock-data"

const ALERT_COOLDOWN_MS = 30_000

interface ThresholdRule {
  type: AlertType
  severity: Alert["severity"]
  check: (s: Skydiver) => boolean
  message: (s: Skydiver) => string
  value: (s: Skydiver) => number
  threshold: number
}

const THRESHOLD_RULES: ThresholdRule[] = [
  {
    type: "uncontrolled_fall",
    severity: "critical",
    check: s => s.status === "freefall" && s.verticalSpeed < -65,
    message: s => `Uncontrolled fall detected — vertical speed ${Math.abs(s.verticalSpeed).toFixed(0)} m/s`,
    value: s => Math.abs(s.verticalSpeed),
    threshold: 65,
  },
  {
    type: "excessive_rotation",
    severity: "critical",
    check: s => s.position === "tumbling",
    message: s => `Excessive body rotation detected — position: ${s.position}, stress ${s.stress}%`,
    value: s => s.stress,
    threshold: 50,
  },
  {
    type: "abnormal_pulse",
    severity: "warning",
    check: s => s.heartRate > 160,
    message: s => `Heart rate above safe threshold — ${s.heartRate} bpm (limit 160)`,
    value: s => s.heartRate,
    threshold: 160,
  },
  {
    type: "high_stress",
    severity: "critical",
    check: s => s.stress > 88,
    message: s => `Stress level critically elevated — ${s.stress}% (limit 88%)`,
    value: s => s.stress,
    threshold: 88,
  },
  {
    type: "high_stress",
    severity: "warning",
    check: s => s.stress > 75 && s.stress <= 88,
    message: s => `Stress level above safe threshold — ${s.stress}%`,
    value: s => s.stress,
    threshold: 75,
  },
  {
    type: "low_oxygen",
    severity: "critical",
    check: s => s.oxygen < 90,
    message: s => `Blood oxygen critically low — ${s.oxygen}% (minimum 90%)`,
    value: s => s.oxygen,
    threshold: 90,
  },
  {
    type: "low_oxygen",
    severity: "warning",
    check: s => s.oxygen >= 90 && s.oxygen < 93,
    message: s => `Blood oxygen below safe level — ${s.oxygen}% (minimum 93%)`,
    value: s => s.oxygen,
    threshold: 93,
  },
  {
    type: "accident_risk",
    severity: "critical",
    check: s => s.riskScore > 70,
    message: s => `Accident risk score critical — ${s.riskScore}/100`,
    value: s => s.riskScore,
    threshold: 70,
  },
]

function clamp(val: number, min: number, max: number) {
  return Math.min(max, Math.max(min, val))
}

function jitter(val: number, range: number) {
  return val + (Math.random() - 0.5) * range * 2
}

export function useSimulation(enabled = true) {
  const [skydivers, setSkydivers] = useState<Skydiver[]>(MOCK_SKYDIVERS)
  const [alerts, setAlerts] = useState<Alert[]>(MOCK_ALERTS)
  const [tick, setTick] = useState(0)
  const alertCooldowns = useRef(new Map<string, number>())
  const alertCounter = useRef(1000)
  const pendingAlerts = useRef<Alert[]>([])

  const acknowledgeAlert = useCallback((alertId: string) => {
    setAlerts(prev => prev.map(a => a.id === alertId ? { ...a, acknowledged: true } : a))
  }, [])

  const acknowledgeAll = useCallback(() => {
    setAlerts(prev => prev.map(a => ({ ...a, acknowledged: true })))
  }, [])

  useEffect(() => {
    if (!enabled) return
    const interval = setInterval(() => {
      setTick(t => t + 1)

      setSkydivers(prev => prev.map(s => {
        if (s.status === "landed" || s.status === "standby") return { ...s, lastUpdate: new Date() }

        const newHr = Math.round(clamp(jitter(s.heartRate, 4), 55, 190))
        const newO2 = Math.round(clamp(jitter(s.oxygen, 1.5), 85, 100))
        const newStress = Math.round(clamp(jitter(s.stress, 5), 0, 100))
        const newTemp = parseFloat(clamp(jitter(s.temperature, 0.15), 35.5, 39.5).toFixed(1))
        const newAlt = s.status === "freefall"
          ? Math.max(0, s.altitude + Math.round(s.verticalSpeed * 2 + jitter(0, 5)))
          : s.status === "canopy_open"
            ? Math.max(0, s.altitude - Math.round(Math.abs(s.verticalSpeed) + jitter(0, 2)))
            : s.altitude

        const newVitalPoint = {
          time: new Date().toISOString(),
          heartRate: newHr,
          oxygen: newO2,
          stress: newStress,
          temperature: newTemp,
        }
        const newAltPoint = {
          time: new Date().toISOString(),
          altitude: newAlt,
          verticalSpeed: s.verticalSpeed,
        }

        const updated: Skydiver = {
          ...s,
          heartRate: newHr,
          oxygen: newO2,
          stress: newStress,
          temperature: newTemp,
          altitude: newAlt,
          lastUpdate: new Date(),
          vitalHistory: [...s.vitalHistory.slice(-49), newVitalPoint],
          altitudeHistory: [...s.altitudeHistory.slice(-49), newAltPoint],
        }

        // Compute riskScore from updated values
        updated.riskScore = Math.min(100,
          (newHr > 160 ? 20 : 0) +
          (newO2 < 93 ? 25 : 0) +
          (newStress > 75 ? 20 : 0) +
          (updated.position === "tumbling" ? 25 : 0) +
          (Math.abs(updated.verticalSpeed) > 65 ? 10 : 0)
        )

        const now = Date.now()
        for (const rule of THRESHOLD_RULES) {
          if (!rule.check(updated)) continue
          const cooldownKey = `${s.id}:${rule.type}:${rule.severity}`
          const last = alertCooldowns.current.get(cooldownKey) ?? 0
          if (now - last < ALERT_COOLDOWN_MS) continue
          alertCooldowns.current.set(cooldownKey, now)
          alertCounter.current += 1
          pendingAlerts.current.push({
            id: `sim-${alertCounter.current}`,
            skydiverId: s.id,
            skydiverName: s.name,
            type: rule.type,
            severity: rule.severity,
            message: rule.message(updated),
            timestamp: new Date(),
            acknowledged: false,
            value: rule.value(updated),
            threshold: rule.threshold,
          })
        }

        return updated
      }))

      if (pendingAlerts.current.length) {
        const toAdd = pendingAlerts.current.splice(0)
        setAlerts(prev => [...toAdd, ...prev].slice(0, 100))
      }
    }, 2000)

    return () => clearInterval(interval)
  }, [enabled])

  const unacknowledgedAlerts = alerts.filter(a => !a.acknowledged)
  const criticalAlerts = unacknowledgedAlerts.filter(a => a.severity === "critical")

  return { skydivers, alerts, unacknowledgedAlerts, criticalAlerts, acknowledgeAlert, acknowledgeAll, tick }
}
