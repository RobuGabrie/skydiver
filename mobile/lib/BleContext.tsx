import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react'
import { PermissionsAndroid, Platform } from 'react-native'
import { BleManager, Device, State, Subscription } from 'react-native-ble-plx'
import {
  BLE_CMD_CHAR_UUID,
  BLE_DEVICE_NAME_PREFIX,
  BLE_FAST_CHAR_UUID,
  BLE_SERVICE_UUID,
  BLE_SLOW_CHAR_UUID,
  BleCommand,
  FastPacket,
  SlowPacket,
  decodeNotification,
  encodeCommand,
  parseFastPacket,
  parseSlowPacket,
} from './bleProtocol'
import { enqueueTelemetryEvent } from './telemetryQueue'
import { sendTelemetryEventNow, startSyncWorker, stopSyncWorker } from './syncWorker'
import type { SlowTelemetryEvent, AlertTelemetryEvent, AlertData } from './types'

const ALERT_COOLDOWN_MS = 30_000

export interface ScannedDevice {
  id: string
  name: string
  rssi: number
}

export interface PhoneLocationData {
  lat: number
  lon: number
  altitude: number | null
  accuracy: number | null
}

interface BleContextValue {
  bleReady: boolean
  scanning: boolean
  devices: ScannedDevice[]
  connectedId: string | null
  rssi: number
  fastPacketRef: React.MutableRefObject<FastPacket | null>
  slowPacket: SlowPacket | null
  startScan: () => void
  stopScan: () => void
  connect: (deviceId: string) => Promise<void>
  disconnect: () => Promise<void>
  sendCommand: (cmd: BleCommand) => Promise<void>
  updatePhoneLocation: (loc: PhoneLocationData) => void
}

const _defaultRef = { current: null } as React.MutableRefObject<FastPacket | null>

function createEventId(): string {
  // RFC4122-ish UUID v4 format for Supabase uuid columns.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

const BleContext = createContext<BleContextValue>({
  bleReady: false,
  scanning: false,
  devices: [],
  connectedId: null,
  rssi: 0,
  fastPacketRef: _defaultRef,
  slowPacket: null,
  startScan: () => {},
  stopScan: () => {},
  connect: async () => {},
  disconnect: async () => {},
  sendCommand: async () => {},
  updatePhoneLocation: () => {},
})

export function BleProvider({ children }: { children: React.ReactNode }) {
  const managerRef = useRef<BleManager | null>(null)
  const deviceRef = useRef<Device | null>(null)
  const notifSubs = useRef<Subscription[]>([])
  const sessionIdRef = useRef('')
  const sequenceRef = useRef(0)
  const scanTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const phoneLocationRef = useRef<PhoneLocationData | null>(null)
  const fastPacketRef = useRef<FastPacket | null>(null)
  const lastSlowSeqRef = useRef<number | null>(null)
  const lastAltRef = useRef<number | null>(null)
  const lastAltTimeRef = useRef<number | null>(null)
  const alertCooldownsRef = useRef(new Map<string, number>())
  const alertSeqRef = useRef(0)

  const [bleReady, setBleReady] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [devices, setDevices] = useState<ScannedDevice[]>([])
  const [connectedId, setConnectedId] = useState<string | null>(null)
  const [rssi, setRssi] = useState(0)
  const [slowPacket, setSlowPacket] = useState<SlowPacket | null>(null)

  function createSessionId(deviceId: string) {
    return `session-${deviceId}-${Date.now()}`
  }

  function emitAlert(
    deviceId: string,
    alertType: string,
    severity: AlertData['severity'],
    message: string,
    data: Omit<AlertData, 'alertType' | 'severity' | 'message'>,
  ) {
    const cooldownKey = `${alertType}:${severity}`
    const now = Date.now()
    const last = alertCooldownsRef.current.get(cooldownKey) ?? 0
    if (now - last < ALERT_COOLDOWN_MS) return
    alertCooldownsRef.current.set(cooldownKey, now)

    alertSeqRef.current += 1
    const alertEvent: AlertTelemetryEvent = {
      eventId: createEventId(),
      sessionId: sessionIdRef.current,
      deviceId,
      sequence: alertSeqRef.current,
      timestamp: now,
      kind: 'alert',
      data: { alertType, severity, message, ...data },
    }
    enqueueTelemetryEvent(alertEvent).catch(() => {})
    void sendTelemetryEventNow(alertEvent)
  }

  function queueSlowPacket(deviceId: string, packet: SlowPacket) {
    if (!sessionIdRef.current) return

    sequenceRef.current += 1
    const sequence = sequenceRef.current

    const nowMs = Date.now()
    const loc = phoneLocationRef.current
    const fast = fastPacketRef.current

    // Derive vertical speed from consecutive GPS altitude readings.
    // SlowPacket arrives at 4 Hz; require ≥0.5 s gap to keep noise low.
    const alt = loc?.altitude ?? null
    let verticalSpeed: number | undefined
    if (
      alt !== null &&
      lastAltRef.current !== null &&
      lastAltTimeRef.current !== null
    ) {
      const dt = (nowMs - lastAltTimeRef.current) / 1000
      if (dt >= 0.5) {
        verticalSpeed = (alt - lastAltRef.current) / dt
        lastAltRef.current = alt
        lastAltTimeRef.current = nowMs
      }
    } else if (alt !== null) {
      lastAltRef.current = alt
      lastAltTimeRef.current = nowMs
    }

    const event: SlowTelemetryEvent = {
      eventId: createEventId(),
      sessionId: sessionIdRef.current,
      deviceId,
      // Use app-level monotonic sequence; packet.seq is 8-bit and wraps.
      sequence,
      timestamp: nowMs,
      kind: 'slow',
      data: {
        heartRate: packet.bpm,
        oxygen: packet.spo2,
        stress: packet.stressPct,
        temperature: packet.tempC,
        battery: packet.battPct,
        ...(verticalSpeed !== undefined && { verticalSpeed }),
        ...(loc && {
          phoneLat: loc.lat,
          phoneLon: loc.lon,
          phoneAltitude: loc.altitude ?? undefined,
          phoneLocationAccuracy: loc.accuracy ?? undefined,
        }),
        ...(fast && {
          rollDeg: fast.rollDeg,
          pitchDeg: fast.pitchDeg,
          yawDeg: fast.yawDeg,
          accelX: fast.accelX,
          accelY: fast.accelY,
          accelZ: fast.accelZ,
          gyroX: fast.gyroX,
          gyroY: fast.gyroY,
          gyroZ: fast.gyroZ,
          stationary: fast.stationary,
        }),
        canopyMotion: packet.canopyMotion,
      },
    }

    enqueueTelemetryEvent(event).catch(() => {})
    void sendTelemetryEventNow(event)

    // --- Threshold alert detection ---
    const bpm    = packet.bpm       ?? 0
    const spo2   = packet.spo2      ?? 100
    const stress = packet.stressPct ?? 0
    const batt   = packet.battPct   ?? 100
    const altM   = loc?.altitude    ?? undefined
    const vs     = verticalSpeed

    const sharedVitals = { heartRate: bpm, oxygen: spo2, stress, altitude: altM, verticalSpeed: vs }

    if (bpm > 160) {
      emitAlert(deviceId, 'abnormal_pulse', 'warning',
        `Heart rate elevated — ${bpm} bpm (threshold: 160)`, sharedVitals)
    }

    if (spo2 < 90) {
      emitAlert(deviceId, 'low_oxygen', 'danger',
        `Blood oxygen critically low — ${spo2.toFixed(0)}% (minimum: 90%)`, sharedVitals)
    } else if (spo2 < 93) {
      emitAlert(deviceId, 'low_oxygen', 'warning',
        `Blood oxygen below safe level — ${spo2.toFixed(0)}% (threshold: 93%)`, sharedVitals)
    }

    if (stress > 88) {
      emitAlert(deviceId, 'high_stress', 'danger',
        `Stress critically elevated — ${stress}% (threshold: 88%)`, sharedVitals)
    } else if (stress > 75) {
      emitAlert(deviceId, 'high_stress', 'warning',
        `Stress above safe threshold — ${stress}%`, sharedVitals)
    }

    if (batt < 20) {
      emitAlert(deviceId, 'low_battery', 'info',
        `Low battery — ${batt}% remaining`, { battery: batt })
    }

    if (vs !== undefined && vs < -65) {
      emitAlert(deviceId, 'uncontrolled_fall', 'danger',
        `Uncontrolled fall — vertical speed ${Math.abs(vs).toFixed(0)} m/s`, sharedVitals)
    }

    const roll  = fast?.rollDeg  ?? 0
    const pitch = fast?.pitchDeg ?? 0
    if (Math.abs(roll) > 45 || Math.abs(pitch) > 45) {
      emitAlert(deviceId, 'excessive_rotation', 'danger',
        `Excessive body rotation — roll ${Math.abs(roll).toFixed(0)}°, pitch ${Math.abs(pitch).toFixed(0)}°`,
        sharedVitals)
    }
  }

  async function ensureScanPermissions() {
    if (Platform.OS !== 'android') return true

    if (Platform.Version >= 31) {
      const results = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
      ])

      return Object.values(results).every(result => result === PermissionsAndroid.RESULTS.GRANTED)
    }

    const result = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
    )

    return result === PermissionsAndroid.RESULTS.GRANTED
  }

  // ------------------------------------------------------------------
  // Initialise the manager once and watch BLE radio state
  // ------------------------------------------------------------------
  useEffect(() => {
    const manager = new BleManager()
    managerRef.current = manager

    const sub = manager.onStateChange(state => {
      setBleReady(state === State.PoweredOn)
    }, true)

    return () => {
      sub.remove()
      manager.destroy()
    }
  }, [])

  // ------------------------------------------------------------------
  // Scan
  // ------------------------------------------------------------------
  const startScan = useCallback(() => {
    const manager = managerRef.current
    if (!manager || !bleReady || scanning) return

    ensureScanPermissions().then(granted => {
      if (!granted) {
        setScanning(false)
        return
      }

      setDevices([])
      setScanning(true)

      manager.startDeviceScan(
        null,
        { allowDuplicates: false },
        (error, device) => {
          if (error) {
            setScanning(false)
            return
          }
          if (!device) return
          const advName = (device.localName ?? device.name ?? '').trim()
          const fallbackName = `Device ${device.id.slice(0, 8)}`
          const name = advName.length > 0 ? advName : fallbackName
          const hasTargetService = device.serviceUUIDs?.some(
            uuid => uuid.toLowerCase() === BLE_SERVICE_UUID.toLowerCase(),
          ) ?? false
          if (!advName.toLowerCase().startsWith(BLE_DEVICE_NAME_PREFIX) && !hasTargetService) return

          setDevices(prev => {
            const idx = prev.findIndex(d => d.id === device.id)

            if (idx === -1) {
              return [...prev, { id: device.id, name, rssi: device.rssi ?? -99 }]
            }

            const existing = prev[idx]
            const nextName = existing.name.startsWith('Device ') && advName ? advName : existing.name
            const nextRssi = device.rssi ?? existing.rssi

            if (existing.name === nextName && existing.rssi === nextRssi) {
              return prev
            }

            const next = [...prev]
            next[idx] = {
              ...existing,
              name: nextName,
              rssi: nextRssi,
            }
            return next
          })
        },
      )

      // Auto-stop after 10 s
      scanTimeoutRef.current = setTimeout(() => {
        manager.stopDeviceScan()
        setScanning(false)
      }, 10000)
    }).catch(() => {
      setScanning(false)
    })
  }, [bleReady, scanning])

  const stopScan = useCallback(() => {
    if (scanTimeoutRef.current) {
      clearTimeout(scanTimeoutRef.current)
      scanTimeoutRef.current = null
    }
    managerRef.current?.stopDeviceScan()
    setScanning(false)
  }, [])

  // ------------------------------------------------------------------
  // Connect / subscribe to characteristics
  // ------------------------------------------------------------------
  const connect = useCallback(async (deviceId: string) => {
    const manager = managerRef.current
    if (!manager) return

    stopScan()
    sessionIdRef.current = createSessionId(deviceId)
    sequenceRef.current = 0
    lastSlowSeqRef.current = null

    const device = await manager.connectToDevice(deviceId, {
      requestMTU: 247,
    })
    await device.discoverAllServicesAndCharacteristics()
    deviceRef.current = device
    setConnectedId(device.id)
    startSyncWorker(device.id, sessionIdRef.current)

    // Keep the initial RSSI
    const rssiVal = await device.readRSSI().catch(() => null)
    setRssi(rssiVal?.rssi ?? device.rssi ?? -99)

    // Subscribe — fast IMU characteristic
    const fastSub = device.monitorCharacteristicForService(
      BLE_SERVICE_UUID,
      BLE_FAST_CHAR_UUID,
      (err, char) => {
        if (err || !char?.value) return
        const bytes = decodeNotification(char.value)
        const pkt = parseFastPacket(bytes)
        if (pkt) {
          fastPacketRef.current = pkt
        }
      },
    )

    // Subscribe — slow sensor characteristic
    const slowSub = device.monitorCharacteristicForService(
      BLE_SERVICE_UUID,
      BLE_SLOW_CHAR_UUID,
      (err, char) => {
        if (err || !char?.value) return
        const bytes = decodeNotification(char.value)
        const pkt = parseSlowPacket(bytes)
        if (!pkt) return

        if (lastSlowSeqRef.current === pkt.seq) return
        lastSlowSeqRef.current = pkt.seq

        setSlowPacket(pkt)
        queueSlowPacket(device.id, pkt)
      },
    )

    notifSubs.current = [fastSub, slowSub]

    // Detect spontaneous disconnection
    device.onDisconnected(() => {
      stopSyncWorker()
      notifSubs.current.forEach(s => s.remove())
      notifSubs.current = []
      deviceRef.current = null
      sessionIdRef.current = ''
      sequenceRef.current = 0
      fastPacketRef.current = null
      lastSlowSeqRef.current = null
      lastAltRef.current = null
      lastAltTimeRef.current = null
      setConnectedId(null)
      setSlowPacket(null)
      setRssi(0)
    })
  }, [stopScan])

  // ------------------------------------------------------------------
  // Disconnect
  // ------------------------------------------------------------------
  const disconnect = useCallback(async () => {
    stopSyncWorker()
    notifSubs.current.forEach(s => s.remove())
    notifSubs.current = []

    if (deviceRef.current) {
      await deviceRef.current.cancelConnection().catch(() => {})
      deviceRef.current = null
    }

    fastPacketRef.current = null
    lastSlowSeqRef.current = null
    lastAltRef.current = null
    lastAltTimeRef.current = null
    setConnectedId(null)
    setSlowPacket(null)
    setRssi(0)
    sessionIdRef.current = ''
    sequenceRef.current = 0
  }, [])

  const updatePhoneLocation = useCallback((loc: PhoneLocationData) => {
    phoneLocationRef.current = loc
  }, [])

  // ------------------------------------------------------------------
  // Send command (START / STOP / RESET)
  // ------------------------------------------------------------------
  const sendCommand = useCallback(async (cmd: BleCommand) => {
    const device = deviceRef.current
    if (!device) return

    await device.writeCharacteristicWithResponseForService(
      BLE_SERVICE_UUID,
      BLE_CMD_CHAR_UUID,
      encodeCommand(cmd),
    )
  }, [])

  return (
    <BleContext.Provider
      value={{
        bleReady,
        scanning,
        devices,
        connectedId,
        rssi,
        fastPacketRef,
        slowPacket,
        startScan,
        stopScan,
        connect,
        disconnect,
        sendCommand,
        updatePhoneLocation,
      }}
    >
      {children}
    </BleContext.Provider>
  )
}

export function useBle() {
  return useContext(BleContext)
}
