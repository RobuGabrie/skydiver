// UUIDs from ble_manager.cpp
export const BLE_SERVICE_UUID    = '12345678-1234-1234-1234-123456789abc'
export const BLE_FAST_CHAR_UUID  = '12345678-1234-1234-1234-123456789001'
export const BLE_SLOW_CHAR_UUID  = '12345678-1234-1234-1234-123456789002'
export const BLE_CMD_CHAR_UUID   = '12345678-1234-1234-1234-123456789003'
export const BLE_DEVICE_NAME_PREFIX = 'skywatch'

export type BleCommand = 'START' | 'STOP' | 'RESET'

// ------------------------------------------------------------------
// Packet types — decoded values are already in human-readable units
// ------------------------------------------------------------------

export interface FastPacket {
  uptimeMs:   number   // ms
  rollDeg:    number   // degrees
  pitchDeg:   number   // degrees
  yawDeg:     number   // degrees
  gyroX:      number   // dps
  gyroY:      number   // dps
  gyroZ:      number   // dps
  accelX:     number   // g
  accelY:     number   // g
  accelZ:     number   // g
  quat0:      number
  quat1:      number
  quat2:      number
  quat3:      number
  stationary: number   // 0 | 1
  stillCount: number
  seq:        number
}

export interface SlowPacket {
  uptimeMs:     number   // ms
  rtcYear:      number
  rtcMonth:     number
  rtcDay:       number
  rtcHour:      number
  rtcMinute:    number
  rtcSecond:    number
  tempC:        number   // °C
  voltageV:     number   // V
  currentMA:    number   // mA
  battPct:      number   // 0–100
  cpuPct:       number   // 0–100
  bpm:          number   // beats/min
  spo2:         number   // 0–100
  stressPct:    number   // 0–100
  flags:        number
  seq:          number
  // Decoded from flags
  canopyMotion: number   // 0 | 1 — firmware-derived canopy estimate (bit 5)
}

// Bits in SlowPacket.flags (from buildSlowFlags in ble_manager.cpp)
export const FLAG_THERM_VALID    = 0x01
export const FLAG_GYRO_ACTIVE    = 0x02
export const FLAG_CURRENT_MOD   = 0x04
export const FLAG_CPU_MOD        = 0x08
export const FLAG_STATIONARY     = 0x10
export const FLAG_CANOPY_MOTION  = 0x20  // low gyro + not stationary (was: BLE connected — redundant)
export const FLAG_PULSE_MOD      = 0x40
export const FLAG_PULSE_VALID    = 0x80

// ------------------------------------------------------------------
// Binary layout — assumes __attribute__((packed)) on the ESP structs.
// If your sizes differ from FAST=33, SLOW=29 (check serial output),
// adjust these offsets to match your actual ble_manager.h definition.
// ------------------------------------------------------------------

export const FAST_PACKET_SIZE = 33
export const SLOW_PACKET_SIZE = 29

export function parseFastPacket(bytes: Uint8Array): FastPacket | null {
  if (bytes.length < FAST_PACKET_SIZE) return null
  const dv = new DataView(bytes.buffer, bytes.byteOffset)
  const LE = true
  return {
    uptimeMs:   dv.getUint32(0,  LE),
    rollDeg:    dv.getInt16 (4,  LE) / 100,
    pitchDeg:   dv.getInt16 (6,  LE) / 100,
    yawDeg:     dv.getInt16 (8,  LE) / 100,
    gyroX:      dv.getInt16 (10, LE) / 10,
    gyroY:      dv.getInt16 (12, LE) / 10,
    gyroZ:      dv.getInt16 (14, LE) / 10,
    accelX:     dv.getInt16 (16, LE) / 1000,
    accelY:     dv.getInt16 (18, LE) / 1000,
    accelZ:     dv.getInt16 (20, LE) / 1000,
    quat0:      dv.getInt16 (22, LE) / 10000,
    quat1:      dv.getInt16 (24, LE) / 10000,
    quat2:      dv.getInt16 (26, LE) / 10000,
    quat3:      dv.getInt16 (28, LE) / 10000,
    stationary: dv.getUint8 (30),
    stillCount: dv.getUint8 (31),
    seq:        dv.getUint8 (32),
  }
}

export function parseSlowPacket(bytes: Uint8Array): SlowPacket | null {
  if (bytes.length < SLOW_PACKET_SIZE) return null
  const dv = new DataView(bytes.buffer, bytes.byteOffset)
  const LE = true
  return {
    uptimeMs:   dv.getUint32(0,  LE),
    rtcYear:    dv.getUint16(4,  LE),
    rtcMonth:   dv.getUint8 (6),
    rtcDay:     dv.getUint8 (7),
    rtcHour:    dv.getUint8 (8),
    rtcMinute:  dv.getUint8 (9),
    rtcSecond:  dv.getUint8 (10),
    tempC:      dv.getInt16 (11, LE) / 100,
    voltageV:   dv.getUint16(13, LE) / 100,
    currentMA:  dv.getInt16 (15, LE),
    battPct:    dv.getUint16(17, LE) / 10,
    cpuPct:     dv.getUint16(19, LE) / 10,
    bpm:        dv.getUint16(21, LE) / 10,
    spo2:       dv.getUint16(23, LE) / 10,
    stressPct:  dv.getUint16(25, LE) / 10,
    flags:        dv.getUint8 (27),
    seq:          dv.getUint8 (28),
    canopyMotion: (dv.getUint8(27) >> 5) & 1,
  }
}

export function decodeNotification(b64: string): Uint8Array {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

export function encodeCommand(cmd: BleCommand): string {
  return btoa(cmd)
}
