import { Skydiver, Alert, SessionStats, VitalPoint, AltitudePoint } from "./types"

function generateVitalHistory(base: { hr: number; o2: number; stress: number; temp: number }, points = 30): VitalPoint[] {
  const now = Date.now()
  return Array.from({ length: points }, (_, i) => ({
    time: new Date(now - (points - i) * 4000).toISOString(),
    heartRate: base.hr + Math.round((Math.random() - 0.5) * 20),
    oxygen: Math.min(100, Math.max(88, base.o2 + Math.round((Math.random() - 0.5) * 4))),
    stress: Math.min(100, Math.max(0, base.stress + Math.round((Math.random() - 0.5) * 15))),
    temperature: parseFloat((base.temp + (Math.random() - 0.5) * 0.6).toFixed(1)),
  }))
}

function generateAltitudeHistory(currentAlt: number, points = 30): AltitudePoint[] {
  const now = Date.now()
  return Array.from({ length: points }, (_, i) => {
    const progress = i / points
    const alt = currentAlt > 500
      ? Math.round(4200 - progress * (4200 - currentAlt))
      : Math.round(currentAlt * (1 - progress * 0.1))
    return {
      time: new Date(now - (points - i) * 4000).toISOString(),
      altitude: Math.max(0, alt),
      verticalSpeed: alt > 0 ? Math.round(-45 + Math.random() * 10) : 0,
    }
  })
}

// 3 validated mock users covering the full range of app scenarios:
//   Alex Mercer   — active freefall, normal-high vitals (baseline monitoring)
//   Sara Ionescu  — canopy open, calm vitals (post-deployment descent)
//   Mihai Popescu — alert status, critical vitals (stress-test alert system)
export const MOCK_SKYDIVERS: Skydiver[] = [
  {
    id: "1",
    name: "Alex Mercer",
    avatar: "AM",
    status: "freefall",
    jumpNumber: 247,
    altitude: 3200,
    verticalSpeed: -54,
    heartRate: 142,
    oxygen: 96,
    stress: 72,
    temperature: 36.8,
    battery: 87,
    parachuteOpen: false,
    position: "stable",
    lastUpdate: new Date(),
    vitalHistory: generateVitalHistory({ hr: 142, o2: 96, stress: 72, temp: 36.8 }),
    altitudeHistory: generateAltitudeHistory(3200),
    riskScore: 18,
    connectedVia: "wifi",
  },
  {
    id: "2",
    name: "Sara Ionescu",
    avatar: "SI",
    status: "canopy_open",
    jumpNumber: 89,
    altitude: 1200,
    verticalSpeed: -6,
    heartRate: 98,
    oxygen: 98,
    stress: 35,
    temperature: 36.5,
    battery: 62,
    parachuteOpen: true,
    position: "stable",
    lastUpdate: new Date(),
    vitalHistory: generateVitalHistory({ hr: 98, o2: 98, stress: 35, temp: 36.5 }),
    altitudeHistory: generateAltitudeHistory(1200),
    riskScore: 5,
    connectedVia: "wifi",
  },
  {
    id: "3",
    name: "Mihai Popescu",
    avatar: "MP",
    status: "alert",
    jumpNumber: 32,
    altitude: 2800,
    verticalSpeed: -78,
    heartRate: 168,
    oxygen: 91,
    stress: 89,
    temperature: 37.4,
    battery: 45,
    parachuteOpen: false,
    position: "tumbling",
    lastUpdate: new Date(),
    vitalHistory: generateVitalHistory({ hr: 168, o2: 91, stress: 89, temp: 37.4 }),
    altitudeHistory: generateAltitudeHistory(2800),
    riskScore: 74,
    connectedVia: "wifi",
  },
  {
    id: "4",
    name: "Lena Koch",
    avatar: "LK",
    status: "freefall",
    jumpNumber: 115,
    altitude: 3800,
    verticalSpeed: -58,
    heartRate: 134,
    oxygen: 95,
    stress: 61,
    temperature: 36.9,
    battery: 71,
    parachuteOpen: false,
    position: "stable",
    lastUpdate: new Date(Date.now() - 4 * 60 * 1000),
    vitalHistory: generateVitalHistory({ hr: 134, o2: 95, stress: 61, temp: 36.9 }),
    altitudeHistory: generateAltitudeHistory(3800),
    riskScore: 12,
    connectedVia: "offline",
  },
]

export const MOCK_ALERTS: Alert[] = [
  {
    id: "a1",
    skydiverId: "3",
    skydiverName: "Mihai Popescu",
    type: "excessive_rotation",
    severity: "critical",
    message: "Excessive body rotation detected — possible instability",
    timestamp: new Date(Date.now() - 45000),
    acknowledged: false,
    value: 340,
    threshold: 180,
  },
  {
    id: "a2",
    skydiverId: "3",
    skydiverName: "Mihai Popescu",
    type: "high_stress",
    severity: "critical",
    message: "Stress level critically high — physiological anomaly",
    timestamp: new Date(Date.now() - 30000),
    acknowledged: false,
    value: 89,
    threshold: 75,
  },
  {
    id: "a3",
    skydiverId: "3",
    skydiverName: "Mihai Popescu",
    type: "low_oxygen",
    severity: "warning",
    message: "Blood oxygen saturation below safe threshold",
    timestamp: new Date(Date.now() - 60000),
    acknowledged: false,
    value: 91,
    threshold: 93,
  },
  {
    id: "a4",
    skydiverId: "3",
    skydiverName: "Mihai Popescu",
    type: "abnormal_pulse",
    severity: "warning",
    message: "Heart rate above normal range for current jump phase",
    timestamp: new Date(Date.now() - 15000),
    acknowledged: false,
    value: 168,
    threshold: 160,
  },
  {
    id: "a5",
    skydiverId: "1",
    skydiverName: "Alex Mercer",
    type: "parachute_open",
    severity: "info",
    message: "Parachute deployment not yet detected at 3200m",
    timestamp: new Date(Date.now() - 90000),
    acknowledged: true,
    value: 3200,
    threshold: 800,
  },
]

export const MOCK_SESSION_STATS: SessionStats = {
  totalJumps: 3,
  alertsTriggered: 4,
  avgHeartRate: 136,
  avgOxygen: 95,
  avgStress: 65,
  maxAltitude: 4200,
  jumpDuration: 12,
  safetyScore: 62,
}

export const MOCK_JUMP_HISTORY = Array.from({ length: 7 }, (_, i) => ({
  date: new Date(Date.now() - i * 86400000).toLocaleDateString("en-US", { weekday: "short" }),
  jumps: Math.round(Math.random() * 4 + 1),
  alerts: Math.round(Math.random() * 3),
  avgRisk: Math.round(Math.random() * 40 + 10),
})).reverse()

export const MOCK_OXYGEN_TREND = Array.from({ length: 20 }, (_, i) => ({
  time: `${i * 30}s`,
  avgOxygen: 96 + Math.round((Math.random() - 0.5) * 4),
  minOxygen: 91 + Math.round((Math.random() - 0.5) * 3),
}))
