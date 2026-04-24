"use client"

import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts"

const RISK_COLORS = {
  low: "#22c55e",
  medium: "#f59e0b",
  high: "#ef4444",
  critical: "#dc2626",
}

const RISK_LABELS = {
  low: "Low Risk",
  medium: "Medium Risk",
  high: "High Risk",
  critical: "CRITICAL",
}

export function RiskGauge({ score, label }: { score: number; label?: string }) {
  const level = score < 25 ? "low" : score < 55 ? "medium" : score < 80 ? "high" : "critical"
  const color = RISK_COLORS[level]

  const data = [
    { value: score },
    { value: 100 - score },
  ]

  return (
    <div className="flex flex-col items-center">
      <div className="relative w-32 h-16 overflow-hidden">
        <ResponsiveContainer width="100%" height={128}>
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="100%"
              startAngle={180}
              endAngle={0}
              innerRadius={48}
              outerRadius={62}
              paddingAngle={2}
              dataKey="value"
              stroke="none"
            >
              <Cell fill={color} />
              <Cell fill="var(--muted)" />
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute bottom-0 inset-x-0 flex flex-col items-center">
          <span className="text-2xl font-mono font-bold" style={{ color }}>{score}</span>
        </div>
      </div>
      <span className="text-[10px] font-medium mt-1 uppercase tracking-wider" style={{ color }}>
        {RISK_LABELS[level]}
      </span>
      {label && <span className="text-[10px] text-muted-foreground mt-0.5">{label}</span>}
    </div>
  )
}
