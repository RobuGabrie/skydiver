"use client"

import { Skydiver } from "@/lib/types"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import {
  Heart, Droplets, Thermometer, Battery,
  Anchor, AlertTriangle, Wifi, Bluetooth, WifiOff,
  Activity
} from "lucide-react"

const STATUS_CONFIG = {
  freefall:    { label: "Freefall",    color: "text-blue-600 dark:text-blue-400",    bg: "bg-blue-500/10",    dot: "bg-blue-500" },
  canopy_open: { label: "Canopy Open", color: "text-emerald-700 dark:text-emerald-400", bg: "bg-emerald-500/10", dot: "bg-emerald-500" },
  landed:      { label: "Landed",      color: "text-slate-600 dark:text-slate-400",  bg: "bg-slate-500/10",   dot: "bg-slate-500" },
  standby:     { label: "Standby",     color: "text-slate-600 dark:text-slate-400",  bg: "bg-slate-500/10",   dot: "bg-slate-500" },
  alert:       { label: "ALERT",       color: "text-red-600 dark:text-red-400",      bg: "bg-red-500/10",     dot: "bg-red-500"   },
}

const CONN_ICON = { wifi: Wifi, ble: Bluetooth, offline: WifiOff }

function isDetectedVital(value: number, kind: "heart" | "oxygen" | "stress" | "temp") {
  if (!Number.isFinite(value)) return false
  return value !== 0
}

function MetricPill({ icon: Icon, value, unit, color, warning, detected = true }: {
  icon: React.ElementType; value: number | string; unit: string; color: string; warning?: boolean; detected?: boolean
}) {
  return (
    <div className={cn("flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-muted/50", warning && "bg-red-500/10")}>
      <Icon className={cn("w-3.5 h-3.5 shrink-0", warning ? "text-red-500 dark:text-red-400" : color)} />
      <span className={cn("text-sm font-mono font-medium", warning ? "text-red-600 dark:text-red-400" : detected ? "text-foreground" : "text-muted-foreground")}>
        {detected ? (
          <>
            {value}<span className="text-muted-foreground text-xs ml-0.5">{unit}</span>
          </>
        ) : (
          "Non detected"
        )}
      </span>
    </div>
  )
}

function formatLastSeen(date: Date): string {
  const secs = Math.floor((Date.now() - date.getTime()) / 1000)
  if (secs < 60) return `${secs}s ago`
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins}m ago`
  return `${Math.floor(mins / 60)}h ago`
}

export function SkydiverCard({ skydiver }: { skydiver: Skydiver }) {
  const status = STATUS_CONFIG[skydiver.status]
  const ConnIcon = CONN_ICON[skydiver.connectedVia]
  const isAlert = skydiver.status === "alert"
  const isCritical = skydiver.riskScore > 60
  const isOffline = skydiver.connectedVia === "offline"
  const hrDetected = isDetectedVital(skydiver.heartRate, "heart")
  const oxygenDetected = isDetectedVital(skydiver.oxygen, "oxygen")
  const stressDetected = isDetectedVital(skydiver.stress, "stress")
  const tempDetected = isDetectedVital(skydiver.temperature, "temp")

  return (
    <Card className={cn(
      "bg-card border transition-all duration-200 cursor-pointer hover:border-primary/40",
      isAlert && !isOffline ? "border-red-500/50 glow-red" : isOffline ? "border-amber-500/40" : "border-border",
    )}>
      <CardContent className="p-4">
        {/* Offline banner */}
        {isOffline && (
          <div className="flex items-center gap-2 mb-3 px-2.5 py-2 rounded-md bg-amber-500/10 border border-amber-500/30">
            <WifiOff className="w-3.5 h-3.5 text-amber-500 shrink-0" />
            <span className="text-xs font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wide">Signal Lost</span>
            <span className="text-xs text-muted-foreground ml-auto">last seen {formatLastSeen(skydiver.lastUpdate)}</span>
          </div>
        )}

        {/* Header row */}
        <div className={cn("flex items-start justify-between mb-3", isOffline && "opacity-60")}>
          <div className="flex items-center gap-3">
            <Avatar className="w-10 h-10 border border-border">
              <AvatarFallback className="bg-primary/10 text-primary text-sm font-mono font-semibold">
                {skydiver.avatar}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="text-base font-semibold text-foreground">{skydiver.name}</p>
              <p className="text-xs text-muted-foreground font-mono">Jump #{skydiver.jumpNumber}</p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <span className={cn(
              "flex items-center gap-1.5 text-xs font-semibold px-2 py-0.5 rounded-full",
              status.bg, status.color,
              isAlert && "animate-critical"
            )}>
              <span className={cn("w-1.5 h-1.5 rounded-full", status.dot)} />
              {status.label}
            </span>
            <div className="flex items-center gap-1.5">
              <ConnIcon className={cn("w-3.5 h-3.5", isOffline ? "text-amber-500" : "text-muted-foreground")} />
              {isCritical && (
                <Tooltip>
                  <TooltipTrigger>
                    <AlertTriangle className="w-4 h-4 text-amber-500 dark:text-amber-400" />
                  </TooltipTrigger>
                  <TooltipContent>Risk score: {skydiver.riskScore}/100</TooltipContent>
                </Tooltip>
              )}
            </div>
          </div>
        </div>

        {/* Altitude + speed */}
        <div className={cn("flex items-center gap-3 mb-3 p-3 rounded-lg bg-muted/30 border border-border/50", isOffline && "opacity-50")}>
          <div className="flex-1">
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-0.5">Altitude</p>
            <p className="text-2xl font-mono font-bold text-foreground leading-none">
              {skydiver.altitude.toLocaleString()}
              <span className="text-sm text-muted-foreground ml-1">m</span>
            </p>
          </div>
          <div className="w-px h-10 bg-border" />
          <div className="flex-1">
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-0.5">V-Speed</p>
            <p className={cn("text-lg font-mono font-bold leading-none", skydiver.verticalSpeed < -60 ? "text-amber-600 dark:text-amber-400" : "text-foreground")}>
              {skydiver.verticalSpeed}<span className="text-sm text-muted-foreground ml-1">m/s</span>
            </p>
          </div>
          <div className="w-px h-10 bg-border" />
          <div className="flex-1">
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-0.5">Position</p>
            <p className="text-sm font-mono text-foreground capitalize">{skydiver.position}</p>
            {skydiver.parachuteOpen && (
              <Anchor className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 mt-1" />
            )}
          </div>
        </div>

        {/* Vitals grid */}
        <div className={cn("grid grid-cols-2 gap-1.5 mb-3", isOffline && "opacity-50")}>
          <MetricPill icon={Heart}       value={skydiver.heartRate}   unit="bpm" color="text-rose-600 dark:text-rose-400"     warning={hrDetected && skydiver.heartRate > 160} detected={hrDetected} />
          <MetricPill icon={Droplets}    value={skydiver.oxygen}      unit="%"   color="text-cyan-600 dark:text-cyan-400"     warning={oxygenDetected && skydiver.oxygen < 93} detected={oxygenDetected} />
          <MetricPill icon={Activity}    value={skydiver.stress}      unit="%"   color="text-violet-600 dark:text-violet-400" warning={stressDetected && skydiver.stress > 75} detected={stressDetected} />
          <MetricPill icon={Thermometer} value={skydiver.temperature} unit="°C"  color="text-orange-600 dark:text-orange-400" warning={tempDetected && skydiver.temperature > 37.5} detected={tempDetected} />
        </div>

        {/* Battery */}
        <div className="flex items-center gap-2 mb-2">
          <Battery className={cn("w-3.5 h-3.5 shrink-0", skydiver.battery < 20 ? "text-red-500" : "text-muted-foreground")} />
          <Progress value={skydiver.battery} className={cn("h-1.5 flex-1", skydiver.battery < 20 && "[&>div]:bg-red-500")} />
          <span className="text-xs font-mono text-muted-foreground w-8 text-right">{skydiver.battery}%</span>
        </div>

        {/* Risk score */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground uppercase tracking-wider w-6">Risk</span>
          <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-500",
                skydiver.riskScore > 60 ? "bg-red-500" : skydiver.riskScore > 30 ? "bg-amber-500" : "bg-emerald-500"
              )}
              style={{ width: `${skydiver.riskScore}%` }}
            />
          </div>
          <span className={cn(
            "text-xs font-mono font-bold w-6 text-right",
            skydiver.riskScore > 60 ? "text-red-600 dark:text-red-400" : skydiver.riskScore > 30 ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400"
          )}>
            {skydiver.riskScore}
          </span>
        </div>
      </CardContent>
    </Card>
  )
}
