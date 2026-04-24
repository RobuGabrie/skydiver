export interface DangerEvent {
  label: string
  type: import("@/lib/types").AlertType
  skydiver: string
  confidence: number
  severity: "critical" | "warning" | "info"
  detail: string
}

export interface PhysioFlag {
  label: string
  skydiver: string
  value: string
  threshold: string
  severity: "critical" | "warning" | "info"
  detail: string
  trend: string
}

export interface AIPrediction {
  label: string
  probability: number
  severity: "critical" | "warning" | "info"
  desc: string
  action: string
}

export interface StatisticalAnomalyFinding {
  label: string
  skydiver: string
  metric: "heartRate" | "oxygen" | "stress" | "temperature"
  value: number
  baseline: number
  zScore: number
  severity: "critical" | "warning" | "info"
  detail: string
}

export interface TrendFinding {
  label: string
  skydiver: string
  metric: "heartRate" | "oxygen"
  value: number
  threshold: number
  slopePerMinute: number
  projectedMinutes: number | null
  severity: "critical" | "warning" | "info"
  detail: string
}

export interface ComputedAiVariant<TFinding = StatisticalAnomalyFinding | TrendFinding> {
  title: string
  subtitle: string
  summary: string
  findings: TFinding[]
}