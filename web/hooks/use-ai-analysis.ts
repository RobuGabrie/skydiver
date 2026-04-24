"use client"

import { useMemo } from "react"
import { Skydiver } from "@/lib/types"
import type {
  AIPrediction,
  ComputedAiVariant,
  DangerEvent,
  PhysioFlag,
  StatisticalAnomalyFinding,
  TrendFinding,
} from "@/lib/ai-analysis-types"

function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v))
}

function avg(vals: number[]) {
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0
}

function stdDev(vals: number[]) {
  if (vals.length < 2) return 0
  const mean = avg(vals)
  const variance = avg(vals.map(v => (v - mean) ** 2))
  return Math.sqrt(variance)
}

function regression(points: Array<{ x: number; y: number }>) {
  if (points.length < 2) return null

  const meanX = avg(points.map(point => point.x))
  const meanY = avg(points.map(point => point.y))
  let numerator = 0
  let denominator = 0

  for (const point of points) {
    const deltaX = point.x - meanX
    numerator += deltaX * (point.y - meanY)
    denominator += deltaX * deltaX
  }

  if (denominator === 0) return null

  const slope = numerator / denominator
  return {
    slope,
    intercept: meanY - slope * meanX,
  }
}

function zScore(current: number, baseline: number[]) {
  const deviation = stdDev(baseline)
  if (!baseline.length || deviation === 0) return 0
  return (current - avg(baseline)) / deviation
}

function severityFromZScore(score: number, current: number, threshold: number, direction: "high" | "low") {
  const thresholdBreached = direction === "high" ? current > threshold : current < threshold
  if (thresholdBreached || Math.abs(score) >= 3) return "critical"
  if (Math.abs(score) >= 2) return "warning"
  return "info"
}

function trendSeverity(projectedMinutes: number | null, current: number, threshold: number, direction: "high" | "low") {
  const thresholdBreached = direction === "high" ? current >= threshold : current <= threshold
  if (thresholdBreached || (projectedMinutes !== null && projectedMinutes <= 5)) return "critical"
  if (projectedMinutes !== null && projectedMinutes <= 15) return "warning"
  return "info"
}

function buildStatisticalVariant(skydivers: Skydiver[]): ComputedAiVariant<StatisticalAnomalyFinding> {
  const findings: StatisticalAnomalyFinding[] = []

  for (const skydiver of skydivers) {
    const history = skydiver.vitalHistory.slice(-12)
    const baselineWindow = history.slice(0, Math.max(0, history.length - 1))
    const current = history[history.length - 1]
    if (!current) continue

    const metrics: Array<{
      metric: StatisticalAnomalyFinding["metric"]
      label: string
      value: number
      baseline: number[]
      threshold: number
      direction: "high" | "low"
      format: (baseline: number, score: number) => string
    }> = [
      {
        metric: "heartRate",
        label: "Heart Rate Deviation",
        value: current.heartRate,
        baseline: baselineWindow.map(point => point.heartRate),
        threshold: 160,
        direction: "high",
        format: (baseline, score) => `Heart rate is ${score.toFixed(1)}σ from the rolling baseline (${Math.round(baseline)} bpm).`,
      },
      {
        metric: "oxygen",
        label: "Oxygen Deviation",
        value: current.oxygen,
        baseline: baselineWindow.map(point => point.oxygen),
        threshold: 93,
        direction: "low",
        format: (baseline, score) => `SpO₂ is ${Math.abs(score).toFixed(1)}σ from the rolling baseline (${Math.round(baseline)}%).`,
      },
      {
        metric: "stress",
        label: "Stress Deviation",
        value: current.stress,
        baseline: baselineWindow.map(point => point.stress),
        threshold: 75,
        direction: "high",
        format: (baseline, score) => `Stress sits ${score.toFixed(1)}σ away from the recent baseline (${Math.round(baseline)}%).`,
      },
      {
        metric: "temperature",
        label: "Temperature Deviation",
        value: current.temperature,
        baseline: baselineWindow.map(point => point.temperature),
        threshold: 37.5,
        direction: "high",
        format: (baseline, score) => `Skin temperature is ${score.toFixed(1)}σ from the recent baseline (${baseline.toFixed(1)}°C).`,
      },
    ]

    for (const metric of metrics) {
      const baselineMean = metric.baseline.length ? avg(metric.baseline) : metric.value
      const score = zScore(metric.value, metric.baseline)
      const severity = severityFromZScore(score, metric.value, metric.threshold, metric.direction)

      if (severity === "info" && Math.abs(score) < 1.75) continue

      findings.push({
        label: metric.label,
        skydiver: skydiver.name,
        metric: metric.metric,
        value: metric.value,
        baseline: baselineMean,
        zScore: score,
        severity,
        detail: metric.format(baselineMean, score),
      })
    }
  }

  findings.sort((a, b) => Math.abs(b.zScore) - Math.abs(a.zScore))

  const topFinding = findings[0]
  const summary = topFinding
    ? `${findings.length} personal-baseline anomal${findings.length !== 1 ? "ies" : "y"} detected. ${topFinding.skydiver} shows the strongest deviation.`
    : "No statistically meaningful deviation from personal rolling baselines."

  return {
    title: "Statistical anomaly detection",
    subtitle: "Per-skydiver rolling baseline comparison",
    summary,
    findings,
  }
}

function buildTrendVariant(skydivers: Skydiver[]): ComputedAiVariant<TrendFinding> {
  const findings: TrendFinding[] = []

  for (const skydiver of skydivers) {
    const history = skydiver.vitalHistory.slice(-12)
    if (history.length < 3) continue

    const firstTimestamp = new Date(history[0].time).getTime()
    const heartRatePoints = history.map(point => ({
      x: (new Date(point.time).getTime() - firstTimestamp) / 60000,
      y: point.heartRate,
    }))
    const oxygenPoints = history.map(point => ({
      x: (new Date(point.time).getTime() - firstTimestamp) / 60000,
      y: point.oxygen,
    }))

    const hrModel = regression(heartRatePoints)
    if (hrModel && hrModel.slope > 0.2) {
      const current = history[history.length - 1].heartRate
      const projectedMinutes = hrModel.slope === 0 ? null : (160 - current) / hrModel.slope
      const severity = trendSeverity(projectedMinutes, current, 160, "high")

      if (severity !== "info") {
        findings.push({
          label: "Heart Rate Trending Up",
          skydiver: skydiver.name,
          metric: "heartRate",
          value: current,
          threshold: 160,
          slopePerMinute: hrModel.slope,
          projectedMinutes: projectedMinutes !== null && projectedMinutes > 0 ? projectedMinutes : null,
          severity,
          detail: projectedMinutes !== null && projectedMinutes > 0
            ? `Heart rate is rising ${hrModel.slope.toFixed(1)} bpm/min and could reach 160 bpm in about ${projectedMinutes.toFixed(1)} minutes.`
            : `Heart rate is rising ${hrModel.slope.toFixed(1)} bpm/min. Threshold may be reached soon if the pattern continues.`,
        })
      }
    }

    const oxygenModel = regression(oxygenPoints)
    if (oxygenModel && oxygenModel.slope < -0.15) {
      const current = history[history.length - 1].oxygen
      const projectedMinutes = oxygenModel.slope === 0 ? null : (current - 93) / Math.abs(oxygenModel.slope)
      const severity = trendSeverity(projectedMinutes, current, 93, "low")

      if (severity !== "info") {
        findings.push({
          label: "Oxygen Trending Down",
          skydiver: skydiver.name,
          metric: "oxygen",
          value: current,
          threshold: 93,
          slopePerMinute: oxygenModel.slope,
          projectedMinutes: projectedMinutes !== null && projectedMinutes > 0 ? projectedMinutes : null,
          severity,
          detail: projectedMinutes !== null && projectedMinutes > 0
            ? `SpO₂ is dropping ${Math.abs(oxygenModel.slope).toFixed(1)} pp/min and could cross 93% in about ${projectedMinutes.toFixed(1)} minutes.`
            : `SpO₂ is trending downward at ${Math.abs(oxygenModel.slope).toFixed(1)} pp/min. Early warning is warranted.`,
        })
      }
    }
  }

  findings.sort((a, b) => {
    const sevOrder = { critical: 0, warning: 1, info: 2 }
    return sevOrder[a.severity] - sevOrder[b.severity] || (a.projectedMinutes ?? 99) - (b.projectedMinutes ?? 99)
  })

  const topFinding = findings[0]
  const summary = topFinding
    ? `${findings.length} predictive trend${findings.length !== 1 ? "s" : ""} detected. ${topFinding.skydiver} is closest to a threshold breach.`
    : "No strong predictive trend is currently moving toward a critical threshold."

  return {
    title: "Trend detection",
    subtitle: "Linear regression on recent vital history",
    summary,
    findings,
  }
}

export function useAIAnalysis(skydivers: Skydiver[]) {
  return useMemo(() => {
    const dangers: DangerEvent[] = []
    const physio: PhysioFlag[] = []
    const predictions: AIPrediction[] = []
    const statistical = buildStatisticalVariant(skydivers)
    const trends = buildTrendVariant(skydivers)

    // --- Danger: Uncontrolled Fall ---
    const fallers = skydivers.filter(s => s.status === "freefall" && s.verticalSpeed < -65)
    if (fallers.length) {
      const worst = fallers.reduce((a, b) => a.verticalSpeed < b.verticalSpeed ? a : b)
      const conf = clamp(Math.round((Math.abs(worst.verticalSpeed) - 65) / 35 * 100), 20, 99)
      dangers.push({
        label: "Uncontrolled Fall",
        type: "uncontrolled_fall",
        skydiver: fallers.map(s => s.name).join(", "),
        confidence: conf,
        severity: conf > 70 ? "critical" : "warning",
        detail: `Vertical speed ${Math.abs(worst.verticalSpeed).toFixed(0)} m/s exceeds safe threshold (65 m/s). Possible loss of body control.`,
      })
    }

    // --- Danger: Excessive Rotation ---
    const tumblers = skydivers.filter(s => s.position === "tumbling")
    if (tumblers.length) {
      const conf = clamp(Math.round(tumblers[0].stress * 0.75 + 25), 40, 99)
      dangers.push({
        label: "Excessive Rotation",
        type: "excessive_rotation",
        skydiver: tumblers.map(s => s.name).join(", "),
        confidence: conf,
        severity: "critical",
        detail: `Uncontrolled body rotation detected. Stress index ${tumblers[0].stress}%. Possible flat spin.`,
      })
    }

    // --- Danger: Position Instability (tracking/headdown with high stress) ---
    const unstable = skydivers.filter(
      s => s.position !== "stable" && s.position !== "tumbling" && s.status === "freefall" && s.stress > 55
    )
    if (unstable.length) {
      const conf = clamp(Math.round(unstable[0].stress * 0.4), 10, 55)
      dangers.push({
        label: "Position Instability",
        type: "abnormal_behavior",
        skydiver: unstable.map(s => s.name).join(", "),
        confidence: conf,
        severity: "warning",
        detail: `Body position drift (${unstable[0].position}) with elevated stress. Monitoring stability.`,
      })
    }

    // --- Danger: No Movement / Unconsciousness ---
    const unconscious = skydivers.filter(s => {
      if (s.status !== "freefall") return false
      const hrVals = s.vitalHistory.slice(-5).map(v => v.heartRate)
      const variance = hrVals.length >= 2 ? Math.max(...hrVals) - Math.min(...hrVals) : 99
      return variance < 3 && s.heartRate < 55
    })
    if (unconscious.length) {
      const conf = clamp(Math.round((55 - unconscious[0].heartRate) / 10 * 100), 40, 95)
      dangers.push({
        label: "Lack of Movement",
        type: "no_movement",
        skydiver: unconscious.map(s => s.name).join(", "),
        confidence: conf,
        severity: "critical",
        detail: `No body movement variation detected. Heart rate flat at ${unconscious[0].heartRate} bpm. Possible unconsciousness.`,
      })
    } else {
      dangers.push({
        label: "Lack of Movement",
        type: "no_movement",
        skydiver: "All Skydivers",
        confidence: 0,
        severity: "info",
        detail: "No unconsciousness indicators detected. All skydivers show active movement patterns.",
      })
    }

    // --- Physiological Analysis ---
    let normalCount = 0
    for (const s of skydivers) {
      let hasIssue = false

      if (s.heartRate > 160 || s.heartRate < 45) {
        hasIssue = true
        const hrHistory = s.vitalHistory.slice(-10).map(v => v.heartRate)
        const mean = Math.round(avg(hrHistory))
        const diff = s.heartRate - mean
        physio.push({
          label: "Abnormal Pulse",
          skydiver: s.name,
          value: `${s.heartRate} bpm`,
          threshold: s.heartRate > 160 ? "160 bpm" : "45 bpm",
          severity: s.heartRate > 175 || s.heartRate < 40 ? "critical" : "warning",
          detail: `Heart rate ${s.heartRate > 160 ? "elevated" : "critically low"} for ${s.status.replace("_", " ")} phase.`,
          trend: `${diff >= 0 ? "+" : ""}${diff} vs avg`,
        })
      }

      if (s.stress > 75) {
        hasIssue = true
        const stressHistory = s.vitalHistory.slice(-10).map(v => v.stress)
        const mean = Math.round(avg(stressHistory))
        physio.push({
          label: "Elevated Stress",
          skydiver: s.name,
          value: `${s.stress}%`,
          threshold: "75%",
          severity: s.stress > 88 ? "critical" : "warning",
          detail: s.stress > 88
            ? "Stress index critically elevated. Panic response pattern detected."
            : "Stress above safe threshold. Monitoring closely.",
          trend: `+${s.stress - mean}% vs avg`,
        })
      }

      if (s.oxygen < 93) {
        hasIssue = true
        const o2History = s.vitalHistory.slice(-10).map(v => v.oxygen)
        const baseline = Math.round(avg(o2History))
        physio.push({
          label: "Low SpO₂",
          skydiver: s.name,
          value: `${s.oxygen}%`,
          threshold: "93%",
          severity: s.oxygen < 90 ? "critical" : "warning",
          detail: s.oxygen < 90
            ? "Blood oxygen critically low. Acute hypoxia risk."
            : "Blood oxygen below safe minimum. Altitude hypoxia suspected.",
          trend: `${s.oxygen - baseline}pp vs baseline`,
        })
      }

      if (!hasIssue) normalCount++
    }

    if (normalCount > 0) {
      physio.push({
        label: "Normal Physiology",
        skydiver: `${normalCount} / ${skydivers.length} skydivers`,
        value: "Nominal",
        threshold: "—",
        severity: "info",
        detail: `${normalCount} skydiver${normalCount !== 1 ? "s" : ""} show${normalCount === 1 ? "s" : ""} normal physiological parameters.`,
        trend: "Stable",
      })
    }

    // --- Predictions ---
    for (const s of skydivers) {
      let accidentScore = 0
      if (s.verticalSpeed < -65) accidentScore += 30
      if (s.position === "tumbling") accidentScore += 25
      if (s.stress > 85) accidentScore += 20
      if (s.oxygen < 91) accidentScore += 15
      if (s.heartRate > 170) accidentScore += 10

      if (accidentScore > 35) {
        predictions.push({
          label: `Accident Risk — ${s.name.split(" ")[0]}`,
          probability: clamp(accidentScore + Math.round(s.riskScore * 0.2), 0, 99),
          severity: accidentScore > 55 ? "critical" : "warning",
          desc: "Combined anomaly pattern (rotation, stress, O₂) suggests high injury probability without intervention.",
          action: accidentScore > 55 ? "Alert instructor immediately" : "Monitor closely",
        })
      }

      if (s.status === "freefall" && s.altitude < 1500 && !s.parachuteOpen) {
        const prob = clamp(Math.round((1500 - s.altitude) / 700 * 100), 20, 95)
        predictions.push({
          label: `Late Deployment — ${s.name.split(" ")[0]}`,
          probability: prob,
          severity: prob > 65 ? "critical" : "warning",
          desc: `No parachute detected at ${s.altitude}m. Safe minimum deployment altitude is 800m.`,
          action: prob > 65 ? "Emergency protocol" : "Verbal reminder recommended",
        })
      }

      if (s.position !== "stable" && s.status === "freefall" && s.riskScore > 15) {
        const prob = clamp(Math.round(s.riskScore * 0.55 + s.stress * 0.25), 10, 85)
        if (prob > 22) {
          predictions.push({
            label: `Abnormal Air Behavior — ${s.name.split(" ")[0]}`,
            probability: prob,
            severity: prob > 50 ? "warning" : "info",
            desc: `Non-standard body position (${s.position}) with elevated risk. Possible disorientation.`,
            action: "Visual check from jumpmaster",
          })
        }
      }

      if ((s.status === "canopy_open" || s.status === "landed") && s.riskScore < 25) {
        predictions.push({
          label: `Safe Landing — ${s.name.split(" ")[0]}`,
          probability: clamp(100 - s.riskScore, 80, 99),
          severity: "info",
          desc: `All metrics nominal. ${s.parachuteOpen ? "Parachute deployed." : "Normal approach."} No anomalies detected.`,
          action: "No action required",
        })
      }
    }

    const sevOrder = { critical: 0, warning: 1, info: 2 }
    predictions.sort((a, b) => sevOrder[a.severity] - sevOrder[b.severity] || b.probability - a.probability)

    return { dangers, physio, predictions, statistical, trends }
  }, [skydivers])
}
