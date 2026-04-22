"use client"

import { useEffect, useState } from "react"
import { Alert } from "@/lib/types"
import { cn } from "@/lib/utils"
import { AlertTriangle, Info, XCircle, CheckCircle2, X } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { formatDistance } from "date-fns"

const SEVERITY_CONFIG = {
  critical: {
    icon: XCircle,
    color: "text-red-600 dark:text-red-400",
    bg: "bg-red-500/10 border-red-500/30",
    badge: "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/40",
  },
  warning: {
    icon: AlertTriangle,
    color: "text-amber-600 dark:text-amber-400",
    bg: "bg-amber-500/10 border-amber-500/30",
    badge: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/40",
  },
  info: {
    icon: Info,
    color: "text-blue-600 dark:text-blue-400",
    bg: "bg-blue-500/10 border-blue-500/30",
    badge: "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/40",
  },
}

export function AlertFeed({
  alerts,
  onAcknowledge,
  onAcknowledgeAll,
  maxItems = 8,
}: {
  alerts: Alert[]
  onAcknowledge: (id: string) => void
  onAcknowledgeAll: () => void
  maxItems?: number
}) {
  const [now, setNow] = useState<number | null>(null)
  const visible = alerts.slice(0, maxItems)
  const unread = alerts.filter(a => !a.acknowledged).length

  useEffect(() => {
    const syncNow = () => setNow(Date.now())
    const timeout = setTimeout(syncNow, 0)
    const interval = setInterval(syncNow, 60_000)
    return () => {
      clearTimeout(timeout)
      clearInterval(interval)
    }
  }, [])

  return (
    <div className="flex flex-col gap-2">
      {unread > 0 && (
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm text-muted-foreground">{unread} unacknowledged</span>
          <Button variant="ghost" size="sm" className="h-7 text-sm px-2 cursor-pointer" onClick={onAcknowledgeAll}>
            Acknowledge all
          </Button>
        </div>
      )}

      {visible.length === 0 && (
        <div className="flex flex-col items-center justify-center py-8 text-muted-foreground gap-2">
          <CheckCircle2 className="w-8 h-8 text-emerald-500/50" />
          <p className="text-sm">No active alerts</p>
        </div>
      )}

      {visible.map(alert => {
        const cfg = SEVERITY_CONFIG[alert.severity]
        const Icon = cfg.icon
        return (
          <div
            key={alert.id}
            className={cn(
              "flex gap-3 p-3 rounded-lg border transition-opacity duration-200",
              cfg.bg,
              alert.acknowledged && "opacity-40"
            )}
          >
            <Icon className={cn("w-4 h-4 mt-0.5 shrink-0", cfg.color)} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className="font-semibold text-foreground text-sm">{alert.skydiverName}</span>
                <Badge variant="outline" className={cn("text-xs h-5 px-1.5 font-mono", cfg.badge)}>
                  {alert.severity.toUpperCase()}
                </Badge>
              </div>
              <p className="text-sm text-foreground/80 leading-snug">{alert.message}</p>
              {alert.value !== undefined && (
                <p className="text-xs font-mono text-muted-foreground mt-1">
                  Value: <span className={cfg.color}>{alert.value}</span>
                  {alert.threshold && <> · Threshold: {alert.threshold}</>}
                </p>
              )}
              <p className="text-xs text-muted-foreground mt-1" suppressHydrationWarning>
                {now === null ? "just now" : formatDistance(alert.timestamp, now, { addSuffix: true })}
              </p>
            </div>
            {!alert.acknowledged && (
              <button
                onClick={() => onAcknowledge(alert.id)}
                aria-label="Acknowledge alert"
                className="shrink-0 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}
