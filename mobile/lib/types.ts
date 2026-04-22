export type ConnectionMode = 'wifi' | 'ble' | 'offline'

export type SkydiverStatus = 'freefall' | 'canopy_open' | 'landed' | 'standby' | 'alert'

export type BodyPosition = 'stable' | 'headdown' | 'tracking' | 'tumbling'

export interface VitalPoint {
  time: number   // timestamp ms
  value: number
}

export interface SkydiverData {
  // Status
  status: SkydiverStatus
  parachuteOpen: boolean
  position: BodyPosition
  lastPositionChange: number  // timestamp ms

  // Altitude & motion
  altitude: number      // meters
  verticalSpeed: number // m/s (negative = falling)

  // Vitals
  heartRate: number     // bpm
  oxygen: number        // %
  stress: number        // 0–100
  temperature: number   // °C
  battery: number       // %

  // History (last 30 points)
  heartRateHistory: VitalPoint[]
  oxygenHistory: VitalPoint[]
  altitudeHistory: VitalPoint[]

  // Metadata
  jumpNumber: number
  sessionStarted: number  // timestamp ms
  lastUpdate: number      // timestamp ms
}

export interface AlertItem {
  id: string
  type: 'danger' | 'warning' | 'info'
  title: string
  body: string
  timestamp: number
  dismissed: boolean
}

export interface DeviceInfo {
  name: string
  id: string
  rssi: number   // signal strength
  batteryLevel: number
  firmwareVersion: string
  connected: boolean
}

export interface TelemetryEnvelope {
  eventId: string
  sessionId: string
  deviceId: string
  sequence: number
  timestamp: number
}

export interface SlowTelemetryData {
  heartRate?: number
  oxygen?: number
  stress?: number
  temperature?: number
  battery?: number
  altitude?: number
  verticalSpeed?: number
  status?: SkydiverStatus
  position?: BodyPosition
}

export interface AlertData {
  message: string
  severity: 'info' | 'warning' | 'danger'
  heartRate?: number
  oxygen?: number
  stress?: number
  temperature?: number
  battery?: number
  altitude?: number
  verticalSpeed?: number
  status?: SkydiverStatus
  position?: BodyPosition
}

export interface SlowTelemetryEvent extends TelemetryEnvelope {
  kind: 'slow'
  data: SlowTelemetryData
}

export interface AlertTelemetryEvent extends TelemetryEnvelope {
  kind: 'alert'
  data: AlertData
}

export type TelemetryEvent = SlowTelemetryEvent | AlertTelemetryEvent

export type TelemetryQueueStatus = 'pending' | 'sending' | 'sent' | 'failed'

export interface TelemetryQueueItem {
id: string
event: TelemetryEvent
  syncStatus: TelemetryQueueStatus
attempts: number
createdAt: number
lastAttemptAt?: number
syncedAt?: number
errorMessage?: string
}