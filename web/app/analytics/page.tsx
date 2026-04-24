"use client"

import { useState } from "react"
import { useSkydiversData } from "@/hooks/use-skydivers-data"
import { RiskGauge } from "@/components/analytics/risk-gauge"
import { GroupVitalsChart, VitalsChart } from "@/components/dashboard/vitals-chart"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Separator } from "@/components/ui/separator"
import { MOCK_JUMP_HISTORY, MOCK_OXYGEN_TREND, MOCK_SESSION_STATS } from "@/lib/mock-data"
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  RadarChart, PolarGrid, PolarAngleAxis, Radar, LineChart, Line, Legend
} from "recharts"
import {
  Brain, TrendingDown, AlertTriangle, Activity,
  Heart, Droplets, Shield, Zap, Target, Eye,
  RefreshCw, Loader2,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useAIAnalysis } from "@/hooks/use-ai-analysis"

type GeminiComparisonResponse = {
  provider: "gemini" | "fallback"
  model: string
  summary: string
  confidence: number
  recommendation: string
  findings: Array<{
    label: string
    severity: "critical" | "warning" | "info"
    detail: string
    confidence: number
  }>
  alignment: string[]
  fallbackReason?: "missing_api_key" | "upstream_http_error" | "missing_text_part" | "json_parse_error" | "network_error"
  upstreamStatus?: number
}

function formatFallbackReason(reason?: GeminiComparisonResponse["fallbackReason"], status?: number) {
  if (!reason) return null
  if (reason === "missing_api_key") return "Fallback reason: GEMINI_API_KEY is not configured on the server."
  if (reason === "upstream_http_error") return `Fallback reason: Gemini API returned HTTP ${status ?? "error"}.`
  if (reason === "missing_text_part") return "Fallback reason: Gemini response had no text payload."
  if (reason === "json_parse_error") return "Fallback reason: Gemini response could not be parsed as JSON."
  if (reason === "network_error") return "Fallback reason: Network or runtime error while calling Gemini."
  return "Fallback reason: unknown"
}

function sectionSeverityClass(severity: "critical" | "warning" | "info") {
  return severity === "critical"
    ? "border-red-500/30 bg-red-500/5"
    : severity === "warning"
      ? "border-amber-500/30 bg-amber-500/5"
      : "border-emerald-500/30 bg-emerald-500/5"
}

function sectionTextClass(severity: "critical" | "warning" | "info") {
  return severity === "critical"
    ? "text-red-700 dark:text-red-400"
    : severity === "warning"
      ? "text-amber-700 dark:text-amber-400"
      : "text-emerald-700 dark:text-emerald-400"
}

function SectionHeader({ icon: Icon, title, subtitle }: { icon: React.ElementType; title: string; subtitle?: string }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
        <Icon className="w-4 h-4 text-primary" />
      </div>
      <div>
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </div>
    </div>
  )
}

const sessionTrendData = MOCK_JUMP_HISTORY

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-popover border border-border rounded-lg p-3 text-xs shadow-xl">
      <p className="text-muted-foreground mb-1 font-mono">{label}</p>
      {payload.map(p => (
        <div key={p.name} className="flex gap-2 items-center">
          <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span className="text-muted-foreground">{p.name}:</span>
          <span className="font-mono font-semibold" style={{ color: p.color }}>{p.value}</span>
        </div>
      ))}
    </div>
  )
}

export default function AnalyticsPage() {
  const { skydivers } = useSkydiversData()
  const { dangers, physio, predictions, statistical, trends } = useAIAnalysis(skydivers)
  const [gemini, setGemini] = useState<GeminiComparisonResponse | null>(null)
  const [geminiLoading, setGeminiLoading] = useState(false)
  const [geminiError, setGeminiError] = useState<string | null>(null)
  const [geminiRequestedAt, setGeminiRequestedAt] = useState<Date | null>(null)

  async function loadGemini() {
    if (!skydivers.length) return

    setGeminiLoading(true)
    setGeminiError(null)

    try {
      const response = await fetch("/api/ai/gemini", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skydivers, statistical, trends }),
      })

      if (!response.ok) {
        throw new Error(`Gemini request failed (${response.status})`)
      }

      const data = (await response.json()) as GeminiComparisonResponse
      setGemini(data)
      setGeminiRequestedAt(new Date())
    } catch (error) {
      setGeminiError(error instanceof Error ? error.message : "Unable to load Gemini comparison.")
    } finally {
      setGeminiLoading(false)
    }
  }

  const n = skydivers.length || 1
  const mean = (fn: (s: typeof skydivers[0]) => number) =>
    Math.round(skydivers.reduce((a, s) => a + fn(s), 0) / n)

  const avgRisk = mean(s => s.riskScore)

  const anomalyData = skydivers.map(s => ({
    name: s.name,
    risk: s.riskScore,
    stress: s.stress,
    oxygen: s.oxygen,
  }))

  const radarData = [
    { metric: "Heart Rate",  value: Math.round(mean(s => s.heartRate) / 1.9) },
    { metric: "Oxygen",      value: mean(s => s.oxygen) },
    { metric: "Stress",      value: 100 - mean(s => s.stress) },
    { metric: "Temperature", value: Math.round((37.5 - mean(s => s.temperature)) * 40 + 50) },
    { metric: "Battery",     value: mean(s => s.battery) },
    { metric: "Safety",      value: 100 - avgRisk },
  ]

  return (
    <div className="p-6 min-h-screen">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">AI Analytics</h1>
        <p className="text-base text-muted-foreground mt-0.5">Machine learning analysis, predictions, and statistics</p>
      </div>

      {/* Top overview */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">

        {/* Risk gauges */}
        <Card className="bg-card border-border lg:col-span-1">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Target className="w-4 h-4 text-primary" />
              Session Risk Scores
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-4">
            <div className="grid grid-cols-3 gap-2">
              {skydivers.slice(0, 3).map(s => (
                <RiskGauge key={s.id} score={s.riskScore} label={s.name.split(" ")[0]} />
              ))}
            </div>
            <Separator className="my-3" />
            <div className="grid grid-cols-2 gap-2">
              {skydivers.slice(3).map(s => (
                <RiskGauge key={s.id} score={s.riskScore} label={s.name.split(" ")[0]} />
              ))}
            </div>
            <div className="mt-4 p-3 rounded-lg bg-muted/30 border border-border flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Session Avg Risk</span>
              <span className={cn("text-base font-mono font-bold", avgRisk > 50 ? "text-red-700 dark:text-red-400" : avgRisk > 30 ? "text-amber-700 dark:text-amber-400" : "text-emerald-700 dark:text-emerald-400")}>
                {avgRisk} / 100
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Radar chart - group health */}
        <Card className="bg-card border-border lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Activity className="w-4 h-4 text-primary" />
              Group Health Radar
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-4">
            <ResponsiveContainer width="100%" height={240}>
              <RadarChart data={radarData} margin={{ top: 10, right: 20, bottom: 10, left: 20 }}>
                <PolarGrid stroke="var(--border)" />
                <PolarAngleAxis dataKey="metric" tick={{ fill: "var(--muted-foreground)", fontSize: 11, fontFamily: "Fira Sans" }} />
                <Radar name="Group Avg" dataKey="value" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.15} strokeWidth={2} />
              </RadarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* AI Hazard Detection */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <SectionHeader
              icon={Eye}
              title="Dangerous Situation Detection"
              subtitle="Real-time anomaly classification"
            />
          </CardHeader>
          <CardContent className="pb-4 space-y-3">
            {dangers.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">No active data — connect skydivers to see detections.</p>
            ) : dangers.map(item => (
              <div
                key={item.label + item.skydiver}
                className={cn(
                  "p-3 rounded-lg border text-xs",
                  item.severity === "critical" ? "border-red-500/30 bg-red-500/5" :
                  item.severity === "warning" ? "border-amber-500/30 bg-amber-500/5" :
                  "border-emerald-500/30 bg-emerald-500/5"
                )}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className={cn("font-semibold",
                    item.severity === "critical" ? "text-red-700 dark:text-red-400" :
                    item.severity === "warning" ? "text-amber-700 dark:text-amber-400" : "text-emerald-700 dark:text-emerald-400"
                  )}>
                    {item.label}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Confidence</span>
                    <span className={cn("font-mono font-bold text-xs",
                      item.confidence > 70 ? "text-red-700 dark:text-red-400" : item.confidence > 30 ? "text-amber-700 dark:text-amber-400" : "text-emerald-700 dark:text-emerald-400"
                    )}>
                      {item.confidence}%
                    </span>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground/70 italic mb-1.5">{item.skydiver}</p>
                <p className="text-xs text-muted-foreground">{item.detail}</p>
                {item.confidence > 0 && (
                  <Progress value={item.confidence} className={cn("h-1 mt-2",
                    item.confidence > 70 ? "[&>div]:bg-red-500" : "[&>div]:bg-amber-400"
                  )} />
                )}
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Physiological Analysis */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <SectionHeader
              icon={Heart}
              title="Physiological Analysis"
              subtitle="AI-powered health monitoring"
            />
          </CardHeader>
          <CardContent className="pb-4 space-y-3">
            {physio.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">No active data — connect skydivers to see analysis.</p>
            ) : physio.map(item => (
              <div
                key={item.label + item.skydiver}
                className={cn(
                  "p-3 rounded-lg border text-xs",
                  item.severity === "critical" ? "border-red-500/30 bg-red-500/5" :
                  item.severity === "warning" ? "border-amber-500/30 bg-amber-500/5" :
                  "border-emerald-500/30 bg-emerald-500/5"
                )}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className={cn("font-semibold",
                    item.severity === "critical" ? "text-red-700 dark:text-red-400" :
                    item.severity === "warning" ? "text-amber-700 dark:text-amber-400" : "text-emerald-700 dark:text-emerald-400"
                  )}>
                    {item.label}
                  </span>
                  <Badge variant="outline" className="text-xs h-5 px-2 font-mono">
                    {item.trend}
                  </Badge>
                </div>
                <div className="flex gap-3 text-xs text-muted-foreground mb-1.5">
                  <span>Value: <span className="font-mono text-foreground">{item.value}</span></span>
                  <span>Threshold: <span className="font-mono text-foreground">{item.threshold}</span></span>
                </div>
                <p className="text-xs text-muted-foreground/70 italic mb-0.5">{item.skydiver}</p>
                <p className="text-xs text-muted-foreground">{item.detail}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Predictions + Stats row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">

        {/* AI Predictions */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <SectionHeader icon={Brain} title="AI Predictions" subtitle="Behavioral & risk forecasting" />
          </CardHeader>
          <CardContent className="pb-4 space-y-3">
            {predictions.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">No active predictions — connect skydivers to see forecasts.</p>
            ) : predictions.map(item => (
              <div
                key={item.label}
                className={cn(
                  "p-3 rounded-lg border",
                  item.severity === "critical" ? "border-red-500/30 bg-red-500/5" :
                  item.severity === "warning" ? "border-amber-500/30 bg-amber-500/5" :
                  "border-emerald-500/30 bg-emerald-500/5"
                )}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className={cn("text-xs font-semibold",
                    item.severity === "critical" ? "text-red-700 dark:text-red-400" :
                    item.severity === "warning" ? "text-amber-700 dark:text-amber-400" : "text-emerald-700 dark:text-emerald-400"
                  )}>
                    {item.label}
                  </span>
                  <span className={cn("text-xs font-mono font-bold",
                    item.probability > 60 ? "text-red-700 dark:text-red-400" : item.probability > 35 ? "text-amber-700 dark:text-amber-400" : "text-emerald-700 dark:text-emerald-400"
                  )}>
                    {item.probability}%
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mb-1.5">{item.desc}</p>
                <div className="flex items-center gap-1.5">
                  <Zap className="w-3 h-3 text-primary" />
                  <span className="text-xs text-primary font-medium">{item.action}</span>
                </div>
                <Progress value={item.probability} className={cn("h-1 mt-2",
                  item.probability > 60 ? "[&>div]:bg-red-500" : item.probability > 35 ? "[&>div]:bg-amber-400" : "[&>div]:bg-emerald-400"
                )} />
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Session stats */}
        <Card className="bg-card border-border lg:col-span-2">
          <CardHeader className="pb-3">
            <SectionHeader icon={TrendingDown} title="Session Statistics" subtitle="7-day jump history and trends" />
          </CardHeader>
          <CardContent className="pb-4">
            {/* Summary stats */}
            <div className="grid grid-cols-4 gap-3 mb-4">
              {[
                { label: "Total Jumps", value: MOCK_SESSION_STATS.totalJumps, icon: Droplets, color: "text-blue-700 dark:text-blue-400" },
                { label: "Alerts", value: MOCK_SESSION_STATS.alertsTriggered, icon: AlertTriangle, color: "text-red-700 dark:text-red-400" },
                { label: "Max Alt", value: `${(MOCK_SESSION_STATS.maxAltitude / 1000).toFixed(1)}km`, icon: TrendingDown, color: "text-violet-700 dark:text-violet-400" },
                { label: "Safety", value: `${MOCK_SESSION_STATS.safetyScore}%`, icon: Shield, color: "text-emerald-700 dark:text-emerald-400" },
              ].map(s => (
                <div key={s.label} className="p-2.5 rounded-lg bg-muted/30 border border-border text-center">
                  <s.icon className={cn("w-4 h-4 mx-auto mb-1", s.color)} />
                  <p className={cn("text-base font-mono font-bold", s.color)}>{s.value}</p>
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                </div>
              ))}
            </div>

            {/* Bar chart - weekly */}
            <div className="mb-1">
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-3">Weekly Jumps & Alerts</p>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={sessionTrendData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="date" tick={{ fill: "var(--muted-foreground)", fontSize: 10, fontFamily: "Fira Code" }} tickLine={false} />
                  <YAxis tick={{ fill: "var(--muted-foreground)", fontSize: 10, fontFamily: "Fira Code" }} tickLine={false} axisLine={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="jumps" name="Jumps" fill="#3b82f6" radius={[3, 3, 0, 0]} fillOpacity={0.8} />
                  <Bar dataKey="alerts" name="Alerts" fill="#ef4444" radius={[3, 3, 0, 0]} fillOpacity={0.8} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <Separator className="my-3" />

            {/* O2 trend */}
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-3">Group Oxygen Saturation Trend</p>
              <GroupVitalsChart data={MOCK_OXYGEN_TREND} />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* AI comparison */}
      <Card className="bg-card border-border mb-6 border-primary/20">
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <SectionHeader
              icon={Brain}
              title="Computed vs Gemini AI"
              subtitle="Client-side detection compared with Gemini interpretation"
            />
            <button
              type="button"
              onClick={() => void loadGemini()}
              disabled={geminiLoading}
              className="inline-flex items-center gap-2 self-start rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-muted/60 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {geminiLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Refresh Gemini
            </button>
          </div>
        </CardHeader>
        <CardContent className="pb-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="rounded-xl border border-border bg-muted/20 p-3">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Computed signals</p>
              <p className="mt-1 text-lg font-semibold text-foreground">{statistical.findings.length + trends.findings.length}</p>
              <p className="text-xs text-muted-foreground">Statistical + trend findings</p>
            </div>
            <div className="rounded-xl border border-border bg-muted/20 p-3">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Gemini findings</p>
              <p className="mt-1 text-lg font-semibold text-foreground">{gemini?.findings.length ?? 0}</p>
              <p className="text-xs text-muted-foreground">Server-side interpretation</p>
            </div>
            <div className="rounded-xl border border-border bg-muted/20 p-3">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Provider</p>
              <p className="mt-1 text-lg font-semibold text-foreground">{gemini?.provider === "gemini" ? "Gemini live" : gemini?.provider === "fallback" ? "Local fallback" : "Pending"}</p>
              <p className="text-xs text-muted-foreground">{geminiRequestedAt ? `Requested ${geminiRequestedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "Waiting for first response"}</p>
            </div>
          </div>

          {geminiError && (
            <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-3 text-xs text-red-700 dark:text-red-300">
              {geminiError}
            </div>
          )}

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <div className="rounded-2xl border border-border bg-muted/15 p-4 space-y-4">
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground">Computed AI</p>
                <h3 className="mt-1 text-base font-semibold text-foreground">{statistical.title}</h3>
                <p className="text-sm text-muted-foreground mt-1">{statistical.subtitle}</p>
                <p className="text-sm text-foreground/90 mt-2">{statistical.summary}</p>
              </div>

              <div className="space-y-2">
                {(statistical.findings as Array<{
                  label: string
                  skydiver: string
                  metric: string
                  value: number
                  baseline: number
                  zScore: number
                  severity: "critical" | "warning" | "info"
                  detail: string
                }>).slice(0, 3).map(item => (
                  <div key={`${item.skydiver}-${item.label}`} className={cn("rounded-xl border p-3 text-xs", sectionSeverityClass(item.severity))}>
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className={cn("font-semibold", sectionTextClass(item.severity))}>{item.label}</p>
                        <p className="text-xs text-muted-foreground">{item.skydiver}</p>
                      </div>
                      <Badge variant="outline" className="font-mono text-xs h-5 px-2">
                        z {item.zScore >= 0 ? "+" : ""}{item.zScore.toFixed(1)}
                      </Badge>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">{item.detail}</p>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                      <span className="rounded-full border border-border bg-background/60 px-2 py-1 font-mono">Value {item.value}</span>
                      <span className="rounded-full border border-border bg-background/60 px-2 py-1 font-mono">Baseline {item.baseline.toFixed(1)}</span>
                      <span className="rounded-full border border-border bg-background/60 px-2 py-1 font-mono">Metric {item.metric}</span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="space-y-2">
                <div>
                  <h4 className="text-sm font-semibold text-foreground">{trends.title}</h4>
                  <p className="text-sm text-muted-foreground mt-1">{trends.subtitle}</p>
                  <p className="text-sm text-foreground/90 mt-2">{trends.summary}</p>
                </div>
                {(trends.findings as Array<{
                  label: string
                  skydiver: string
                  metric: string
                  value: number
                  threshold: number
                  slopePerMinute: number
                  projectedMinutes: number | null
                  severity: "critical" | "warning" | "info"
                  detail: string
                }>).slice(0, 3).map(item => (
                  <div key={`${item.skydiver}-${item.label}`} className={cn("rounded-xl border p-3 text-xs", sectionSeverityClass(item.severity))}>
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className={cn("font-semibold", sectionTextClass(item.severity))}>{item.label}</p>
                        <p className="text-xs text-muted-foreground">{item.skydiver}</p>
                      </div>
                      <Badge variant="outline" className="font-mono text-xs h-5 px-2">
                        {item.slopePerMinute >= 0 ? "+" : ""}{item.slopePerMinute.toFixed(1)} / min
                      </Badge>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">{item.detail}</p>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                      <span className="rounded-full border border-border bg-background/60 px-2 py-1 font-mono">Value {item.value}</span>
                      <span className="rounded-full border border-border bg-background/60 px-2 py-1 font-mono">Threshold {item.threshold}</span>
                      <span className="rounded-full border border-border bg-background/60 px-2 py-1 font-mono">ETA {item.projectedMinutes ? `${item.projectedMinutes.toFixed(1)}m` : "n/a"}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-background/70 p-4 space-y-4">
              <div>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">Gemini</p>
                    <h3 className="mt-1 text-base font-semibold text-foreground">Server-side interpretation</h3>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="font-mono text-xs h-5 px-2">
                      {gemini?.provider === "gemini" ? gemini.model : "fallback"}
                    </Badge>
                    <Badge variant="outline" className={cn("font-mono text-xs h-5 px-2", gemini && gemini.confidence > 70 ? "border-emerald-500/30 text-emerald-400" : gemini && gemini.confidence > 50 ? "border-amber-500/30 text-amber-400" : "border-border text-muted-foreground")}>
                    </Badge>
                    <Badge variant="outline" className={cn("font-mono text-xs h-5 px-2", gemini && gemini.confidence > 70 ? "border-emerald-500/30 text-emerald-700 dark:text-emerald-400" : gemini && gemini.confidence > 50 ? "border-amber-500/30 text-amber-700 dark:text-amber-400" : "border-border text-muted-foreground")}>
                      {gemini ? `${gemini.confidence}% confidence` : "pending"}
                    </Badge>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground mt-2">{gemini?.summary ?? "Waiting for Gemini analysis."}</p>
              </div>

              <div className={cn("rounded-xl border p-3 text-xs", gemini ? sectionSeverityClass(gemini.confidence >= 80 ? "critical" : gemini.confidence >= 55 ? "warning" : "info") : "border-border bg-muted/10")}>
                <p className="text-xs uppercase tracking-wider text-muted-foreground">Recommendation</p>
                <p className="mt-1 text-sm text-foreground/90">{gemini?.recommendation ?? "Run Gemini analysis to compare model outputs."}</p>
                {gemini?.provider === "fallback" && (
                  <p className="mt-2 text-xs text-amber-700 dark:text-amber-300/90">
                    {formatFallbackReason(gemini.fallbackReason, gemini.upstreamStatus)}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                {geminiLoading && (
                  <div className="rounded-xl border border-border bg-muted/10 p-3 text-xs text-muted-foreground flex items-center gap-2">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Contacting Gemini for a fresh comparison.
                  </div>
                )}
                {(gemini?.findings ?? []).slice(0, 4).map(item => (
                  <div key={item.label} className={cn("rounded-xl border p-3 text-xs", sectionSeverityClass(item.severity))}>
                    <div className="flex items-center justify-between gap-2">
                      <p className={cn("font-semibold", sectionTextClass(item.severity))}>{item.label}</p>
                      <Badge variant="outline" className="font-mono text-xs h-5 px-2">
                        {item.confidence}%
                      </Badge>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">{item.detail}</p>
                  </div>
                ))}
              </div>

              <div className="rounded-xl border border-border bg-muted/10 p-3">
                <p className="text-xs uppercase tracking-wider text-muted-foreground">Alignment</p>
                <div className="mt-2 space-y-2">
                  {(gemini?.alignment ?? ["Waiting for Gemini output."]).map(line => (
                    <div key={line} className="flex items-start gap-2 text-xs text-muted-foreground">
                      <span className="mt-1 h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                      <span>{line}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Individual comparison */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <SectionHeader icon={Activity} title="Individual Risk Comparison" subtitle="Side-by-side anomaly scores per skydiver" />
        </CardHeader>
        <CardContent className="pb-4">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={anomalyData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
              <XAxis type="number" tick={{ fill: "var(--muted-foreground)", fontSize: 10, fontFamily: "Fira Code" }} domain={[0, 100]} />
              <YAxis type="category" dataKey="name" width={130} tick={{ fill: "var(--muted-foreground)", fontSize: 11, fontFamily: "Fira Sans" }} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="risk" name="Overall Risk" fill="#ef4444" radius={[0, 3, 3, 0]} fillOpacity={0.7} />
              <Bar dataKey="stress" name="Stress" fill="#a78bfa" radius={[0, 3, 3, 0]} fillOpacity={0.6} />
              <Bar dataKey="oxygen" name="O₂ Health" fill="#06b6d4" radius={[0, 3, 3, 0]} fillOpacity={0.6} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  )
}
