"use client"

import { useState } from "react"
import { useSkydiversData } from "@/hooks/use-skydivers-data"
import { Alert, AlertSeverity } from "@/lib/types"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"
import { formatDistanceToNow, format } from "date-fns"
import {
  Bell, CheckCircle2, AlertTriangle, XCircle, Info,
  Phone, Radio, Users, Zap, Clock,
} from "lucide-react"

const SEVERITY_CONFIG = {
  critical: {
    icon: XCircle,
    color: "text-red-600 dark:text-red-400",
    bg: "bg-red-500/10 border-red-500/30",
    badge: "text-red-700 dark:text-red-400 border-red-500/40 bg-red-500/10",
    label: "CRITICAL",
  },
  warning: {
    icon: AlertTriangle,
    color: "text-amber-600 dark:text-amber-400",
    bg: "bg-amber-500/10 border-amber-500/30",
    badge: "text-amber-700 dark:text-amber-400 border-amber-500/40 bg-amber-500/10",
    label: "WARNING",
  },
  info: {
    icon: Info,
    color: "text-blue-600 dark:text-blue-400",
    bg: "bg-blue-500/10 border-blue-500/30",
    badge: "text-blue-700 dark:text-blue-400 border-blue-500/40 bg-blue-500/10",
    label: "INFO",
  },
}

const TYPE_LABELS: Record<string, string> = {
  uncontrolled_fall: "Uncontrolled Fall",
  excessive_rotation: "Excessive Rotation",
  no_movement: "No Movement (Unconsciousness)",
  abnormal_pulse: "Abnormal Heart Rate",
  high_stress: "High Stress Level",
  low_oxygen: "Low Blood Oxygen",
  high_temp: "Elevated Temperature",
  low_battery: "Low Battery",
  parachute_open: "Parachute Status",
  position_change: "Position Change",
  accident_risk: "Accident Risk Prediction",
  abnormal_behavior: "Abnormal Air Behavior",
}

function AlertRow({ alert, onAck }: { alert: Alert; onAck: (id: string) => void }) {
  const cfg = SEVERITY_CONFIG[alert.severity]
  const Icon = cfg.icon

  return (
    <div className={cn(
      "flex gap-4 p-4 rounded-xl border transition-all duration-200",
      cfg.bg,
      alert.acknowledged && "opacity-40 grayscale"
    )}>
      <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 bg-background/40">
        <Icon className={cn("w-5 h-5", cfg.color)} />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-1.5">
          <span className="text-base font-semibold text-foreground">{alert.skydiverName}</span>
          <Badge variant="outline" className={cn("text-xs font-mono", cfg.badge)}>
            {cfg.label}
          </Badge>
          <Badge variant="secondary" className="text-xs">
            {TYPE_LABELS[alert.type] || alert.type}
          </Badge>
        </div>
        <p className="text-sm text-foreground/80 mb-1.5">{alert.message}</p>
        {alert.value !== undefined && (
          <p className="text-sm font-mono text-muted-foreground">
            Measured: <span className={cfg.color}>{alert.value}</span>
            {alert.threshold && <> · Safe threshold: {alert.threshold}</>}
          </p>
        )}
        <div className="flex items-center gap-3 mt-2 text-sm text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" />
            {format(alert.timestamp, "HH:mm:ss")} · {formatDistanceToNow(alert.timestamp, { addSuffix: true })}
          </span>
        </div>
      </div>

      <div className="flex flex-col items-end gap-2 shrink-0">
        {!alert.acknowledged ? (
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-sm px-3 cursor-pointer border-border"
            onClick={() => onAck(alert.id)}
          >
            Acknowledge
          </Button>
        ) : (
          <div className="flex items-center gap-1 text-sm text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Acknowledged
          </div>
        )}
      </div>
    </div>
  )
}

export default function AlertsPage() {
  const { alerts, unacknowledgedAlerts, criticalAlerts, acknowledgeAlert, acknowledgeAll } = useSkydiversData()
  const [filter, setFilter] = useState<"all" | AlertSeverity>("all")

  const filtered = filter === "all" ? alerts : alerts.filter(a => a.severity === filter)
  const critCount = alerts.filter(a => a.severity === "critical").length
  const warnCount = alerts.filter(a => a.severity === "warning").length
  const infoCount = alerts.filter(a => a.severity === "info").length

  return (
    <div className="p-6 min-h-screen">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold">Alerts & Notifications</h1>
          <p className="text-base text-muted-foreground mt-0.5">All safety events and instructor notifications</p>
        </div>
        {unacknowledgedAlerts.length > 0 && (
          <Button variant="outline" size="sm" className="cursor-pointer" onClick={acknowledgeAll}>
            <CheckCircle2 className="w-4 h-4 mr-1.5" />
            Acknowledge All
          </Button>
        )}
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30">
          <div className="flex items-center gap-2 mb-2">
            <XCircle className="w-4 h-4 text-red-600 dark:text-red-400" />
            <span className="text-sm text-red-700 dark:text-red-400 font-semibold uppercase tracking-wider">Critical</span>
          </div>
          <p className="text-4xl font-mono font-bold text-red-600 dark:text-red-400">{critCount}</p>
          <p className="text-sm text-muted-foreground mt-1">{criticalAlerts.length} unacknowledged</p>
        </div>
        <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            <span className="text-sm text-amber-700 dark:text-amber-400 font-semibold uppercase tracking-wider">Warning</span>
          </div>
          <p className="text-4xl font-mono font-bold text-amber-600 dark:text-amber-400">{warnCount}</p>
          <p className="text-sm text-muted-foreground mt-1">monitoring closely</p>
        </div>
        <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/30">
          <div className="flex items-center gap-2 mb-2">
            <Info className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <span className="text-sm text-blue-700 dark:text-blue-400 font-semibold uppercase tracking-wider">Info</span>
          </div>
          <p className="text-4xl font-mono font-bold text-blue-600 dark:text-blue-400">{infoCount}</p>
          <p className="text-sm text-muted-foreground mt-1">informational only</p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Alert list */}
        <div className="xl:col-span-2 space-y-4">
          {/* Filter tabs */}
          <div className="flex gap-2 mb-4">
            {(["all", "critical", "warning", "info"] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-sm font-medium transition-colors cursor-pointer",
                  filter === f
                    ? "bg-primary/15 text-primary border border-primary/30"
                    : "bg-muted/30 text-muted-foreground hover:text-foreground border border-transparent"
                )}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
                <span className="ml-1.5 font-mono text-xs">
                  ({f === "all" ? alerts.length : alerts.filter(a => a.severity === f).length})
                </span>
              </button>
            ))}
          </div>

          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <CheckCircle2 className="w-10 h-10 text-emerald-500/40 mb-3" />
              <p className="text-base">No alerts in this category</p>
            </div>
          ) : (
            <div className="overflow-y-auto max-h-[calc(100vh-22rem)] pr-1 space-y-3">
              {filtered.map(alert => (
                <AlertRow key={alert.id} alert={alert} onAck={acknowledgeAlert} />
              ))}
            </div>
          )}
        </div>

        {/* Right panel */}
        <div className="space-y-4">
          <Card className="bg-card border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-medium flex items-center gap-2">
                <Zap className="w-4 h-4 text-primary" />
                Auto-Alert Configuration
              </CardTitle>
            </CardHeader>
            <CardContent className="pb-4 space-y-3">
              <p className="text-sm text-muted-foreground">
                Automatic alerts are sent to instructors and team when thresholds are exceeded.
              </p>
              <Separator />
              {[
                { label: "Parachute not deployed < 800m", active: true, severity: "critical" },
                { label: "O₂ saturation < 93%",          active: true, severity: "warning"  },
                { label: "Heart rate > 160 bpm",          active: true, severity: "warning"  },
                { label: "Stress level > 75%",            active: true, severity: "critical" },
                { label: "Rotation > 180°/s",             active: true, severity: "critical" },
                { label: "No movement > 10s",             active: true, severity: "critical" },
                { label: "Battery < 20%",                 active: true, severity: "info"     },
                { label: "Vertical speed > 65 m/s",       active: true, severity: "warning"  },
              ].map(rule => (
                <div key={rule.label} className="flex items-center gap-3">
                  <div className={cn(
                    "w-2 h-2 rounded-full shrink-0",
                    rule.severity === "critical" ? "bg-red-500" : rule.severity === "warning" ? "bg-amber-500" : "bg-blue-500"
                  )} />
                  <span className="text-sm text-muted-foreground flex-1">{rule.label}</span>
                  <div className={cn("w-8 h-4 rounded-full", rule.active ? "bg-emerald-500/50" : "bg-muted")} />
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-medium flex items-center gap-2">
                <Radio className="w-4 h-4 text-primary" />
                Notification Targets
              </CardTitle>
            </CardHeader>
            <CardContent className="pb-4 space-y-3">
              {[
                { icon: Users, label: "Jump Instructor", detail: "Instructor Viorel D.", active: true },
                { icon: Phone, label: "Emergency Contact", detail: "+40 721 234 567",    active: true },
                { icon: Radio, label: "Ground Team",       detail: "5 members",          active: true },
              ].map(target => (
                <div key={target.label} className="flex items-center gap-3 p-3 rounded-lg bg-muted/20 border border-border/50">
                  <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <target.icon className="w-4 h-4 text-primary" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-foreground">{target.label}</p>
                    <p className="text-xs text-muted-foreground">{target.detail}</p>
                  </div>
                  <div className={cn("w-2 h-2 rounded-full", target.active ? "bg-emerald-500" : "bg-muted-foreground")} />
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
