import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react'
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
import type { SlowTelemetryEvent } from './types'

export interface ScannedDevice {
  id: string
  name: string
  rssi: number
}

interface BleContextValue {
  bleReady: boolean
  scanning: boolean
  devices: ScannedDevice[]
  connectedId: string | null
  rssi: number
  fastPacket: FastPacket | null
  slowPacket: SlowPacket | null
  startScan: () => void
  stopScan: () => void
  connect: (deviceId: string) => Promise<void>
  disconnect: () => Promise<void>
  sendCommand: (cmd: BleCommand) => Promise<void>
}

const BleContext = createContext<BleContextValue>({
  bleReady: false,
  scanning: false,
  devices: [],
  connectedId: null,
  rssi: 0,
  fastPacket: null,
  slowPacket: null,
  startScan: () => {},
  stopScan: () => {},
  connect: async () => {},
  disconnect: async () => {},
  sendCommand: async () => {},
})

export function BleProvider({ children }: { children: React.ReactNode }) {
  const managerRef = useRef<BleManager | null>(null)
  const deviceRef = useRef<Device | null>(null)
  const notifSubs = useRef<Subscription[]>([])
  const sessionIdRef = useRef('')
  const sequenceRef = useRef(0)

  const [bleReady, setBleReady] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [devices, setDevices] = useState<ScannedDevice[]>([])
  const [connectedId, setConnectedId] = useState<string | null>(null)
  const [rssi, setRssi] = useState(0)
  const [fastPacket, setFastPacket] = useState<FastPacket | null>(null)
  const [slowPacket, setSlowPacket] = useState<SlowPacket | null>(null)

  function createSessionId(deviceId: string) {
    return `session-${deviceId}-${Date.now()}`
  }

  function queueSlowPacket(deviceId: string, packet: SlowPacket) {
    if (!sessionIdRef.current) return

    sequenceRef.current += 1

    const event: SlowTelemetryEvent = {
      eventId: `${sessionIdRef.current}-${sequenceRef.current}`,
      sessionId: sessionIdRef.current,
      deviceId,
      sequence: packet.seq,
      timestamp: Date.now(),
      kind: 'slow',
      data: {
        heartRate: packet.bpm,
        oxygen: packet.spo2,
        stress: packet.stressPct,
        temperature: packet.tempC,
        battery: packet.battPct,
      },
    }

    enqueueTelemetryEvent(event).catch(() => {})
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

    setDevices([])
    setScanning(true)

    manager.startDeviceScan(
      [BLE_SERVICE_UUID],
      { allowDuplicates: false },
      (error, device) => {
        if (error) {
          setScanning(false)
          return
        }
        if (!device) return
        const name = device.localName ?? device.name ?? ''
        if (!name.toLowerCase().startsWith(BLE_DEVICE_NAME_PREFIX)) return

        setDevices(prev => {
          const exists = prev.some(d => d.id === device.id)
          if (exists) return prev
          return [...prev, { id: device.id, name, rssi: device.rssi ?? -99 }]
        })
      },
    )

    // Auto-stop after 10 s
    setTimeout(() => {
      manager.stopDeviceScan()
      setScanning(false)
    }, 10000)
  }, [bleReady, scanning])

  const stopScan = useCallback(() => {
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

    const device = await manager.connectToDevice(deviceId, {
      requestMTU: 247,
    })
    await device.discoverAllServicesAndCharacteristics()
    deviceRef.current = device
    setConnectedId(device.id)

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
        if (pkt) setFastPacket(pkt)
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

        setSlowPacket(pkt)
        queueSlowPacket(device.id, pkt)
      },
    )

    notifSubs.current = [fastSub, slowSub]

    // Detect spontaneous disconnection
    device.onDisconnected(() => {
      notifSubs.current.forEach(s => s.remove())
      notifSubs.current = []
      deviceRef.current = null
      sessionIdRef.current = ''
      sequenceRef.current = 0
      setConnectedId(null)
      setFastPacket(null)
      setSlowPacket(null)
      setRssi(0)
    })
  }, [stopScan])

  // ------------------------------------------------------------------
  // Disconnect
  // ------------------------------------------------------------------
  const disconnect = useCallback(async () => {
    notifSubs.current.forEach(s => s.remove())
    notifSubs.current = []

    if (deviceRef.current) {
      await deviceRef.current.cancelConnection().catch(() => {})
      deviceRef.current = null
    }

    setConnectedId(null)
    setFastPacket(null)
    setSlowPacket(null)
    setRssi(0)
    sessionIdRef.current = ''
    sequenceRef.current = 0
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
        fastPacket,
        slowPacket,
        startScan,
        stopScan,
        connect,
        disconnect,
        sendCommand,
      }}
    >
      {children}
    </BleContext.Provider>
  )
}

export function useBle() {
  return useContext(BleContext)
}
