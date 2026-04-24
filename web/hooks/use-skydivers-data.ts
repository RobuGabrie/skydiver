"use client"

import { useCallback } from "react"
import { useMockMode } from "@/lib/mock-context"
import { useSimulation } from "./use-simulation"
import { useSkydivers } from "./use-skydivers"

export function useSkydiversData() {
  const { isMockMode } = useMockMode()
  const sim = useSimulation(isMockMode)
  const live = useSkydivers()

  const acknowledgeAlert = useCallback((id: string) => {
    // Route to whichever source owns this alert ID
    if (sim.alerts.some(a => a.id === id)) {
      sim.acknowledgeAlert(id)
    } else {
      live.acknowledgeAlert(id)
    }
  }, [sim, live])

  const acknowledgeAll = useCallback(() => {
    sim.acknowledgeAll()
    live.acknowledgeAll()
  }, [sim, live])

  if (!isMockMode) return live

  const skydivers = [...live.skydivers, ...sim.skydivers]
  const alerts = [...live.alerts, ...sim.alerts]
  const unacknowledgedAlerts = alerts.filter(a => !a.acknowledged)
  const criticalAlerts = unacknowledgedAlerts.filter(a => a.severity === "critical")

  return {
    skydivers,
    alerts,
    unacknowledgedAlerts,
    criticalAlerts,
    acknowledgeAlert,
    acknowledgeAll,
    tick: live.tick + sim.tick,
  }
}
