import React, { useMemo, useRef, useState, useEffect } from 'react'
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import { MotiView } from 'moti'
import Svg, { Circle, Line } from 'react-native-svg'
import { useBle } from '../../lib/BleContext'
import { useConnectivity } from '../../hooks/useConnectivity'
import { useTheme } from '../../lib/ThemeContext'
import { usePhoneLocation } from '../../hooks/usePhoneLocation'
import { ConnectionBadge } from '../../components/ConnectionBadge'
import { MetricCard } from '../../components/MetricCard'
import { SparkLine } from '../../components/SparkLine'
import { Progress } from '~/components/ui/progress'
import { AppColors, Typography, Spacing, Radius } from '../../lib/theme'
import { formatDuration } from '../../lib/timeUtils'
import type { FastPacket } from '../../lib/bleProtocol'
import type { VitalPoint, SkydiverStatus } from '../../lib/types'

const MAX_HIST = 40

function pushPoint(arr: VitalPoint[], value: number): VitalPoint[] {
  return [...arr.slice(-(MAX_HIST - 1)), { time: Date.now(), value }]
}

function deriveStatus(
  vSpeed: number,
  altitude: number | null,
  stationary: number,
): SkydiverStatus {
  if (stationary === 1) {
    return altitude !== null && altitude > 200 ? 'standby' : 'landed'
  }
  if (vSpeed < -15) return 'freefall'
  if (vSpeed < -2) return 'canopy_open'
  if (altitude !== null && altitude < 30) return 'landed'
  return 'standby'
}

const STATUS_CFG: Record<SkydiverStatus, { label: string; color: string; pulse: boolean }> = {
  freefall:    { label: 'FREEFALL',    color: '#38BDF8', pulse: true },
  canopy_open: { label: 'CANOPY OPEN', color: '#22C55E', pulse: true },
  landed:      { label: 'LANDED',      color: '#64748B', pulse: false },
  standby:     { label: 'STANDBY',     color: '#64748B', pulse: false },
  alert:       { label: 'ALERT',       color: '#EF4444', pulse: true },
}

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v))
}

const motionStyles = StyleSheet.create({
  telemetryCardOuter: {
    flex: 1,
  },
  telemetryCard: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: Spacing.md,
    overflow: 'hidden',
    gap: Spacing.sm,
  },
  telemetryTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  telemetryCopy: {
    flex: 1,
    gap: 4,
  },
  telemetryTitle: {
    fontSize: Typography.xs,
    textTransform: 'uppercase',
    letterSpacing: 1.1,
    color: '#64748B',
    fontWeight: Typography.semibold,
  },
  telemetryValue: {
    fontSize: Typography.xl,
    lineHeight: Typography.xl * 1.05,
    fontWeight: Typography.bold,
    fontFamily: Typography.mono,
    fontVariant: ['tabular-nums'],
  },
  telemetrySubtitle: {
    fontSize: Typography.sm,
    lineHeight: Typography.sm * 1.35,
    color: '#475569',
  },
  telemetryRingWrap: {
    width: 84,
    height: 84,
    alignItems: 'center',
    justifyContent: 'center',
  },
  telemetryRingLabelWrap: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  telemetryRingLabel: {
    fontSize: 9,
    fontWeight: Typography.bold,
    letterSpacing: 1.1,
  },
  telemetryChipRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  telemetryChip: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: Radius.md,
    paddingVertical: 8,
    paddingHorizontal: 10,
    gap: 2,
  },
  telemetryChipLabel: {
    fontSize: 9,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    color: '#64748B',
    fontWeight: Typography.semibold,
  },
  telemetryChipValue: {
    fontSize: Typography.sm,
    fontFamily: Typography.mono,
    fontWeight: Typography.semibold,
    color: '#0F172A',
  },
  telemetryBarBlock: {
    gap: 6,
  },
  telemetryBarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  telemetryBarLabel: {
    fontSize: Typography.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.9,
    color: '#64748B',
    fontWeight: Typography.semibold,
  },
  telemetryBarValue: {
    fontSize: Typography.xs,
    fontFamily: Typography.mono,
    fontWeight: Typography.bold,
  },
  telemetryBars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 3,
    height: 22,
  },
  telemetryBar: {
    flex: 1,
    borderRadius: Radius.full,
  },
})

function RingGauge({
  value,
  size,
  stroke,
  color,
  track,
}: {
  value: number
  size: number
  stroke: number
  color: string
  track: string
}) {
  const radius = (size - stroke) / 2
  const circumference = Math.PI * radius * 2
  const dashOffset = circumference * (1 - clamp(value, 0, 100) / 100)

  return (
    <Svg width={size} height={size}>
      <Circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        stroke={track}
        strokeWidth={stroke}
        fill="none"
      />
      <Circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        stroke={color}
        strokeWidth={stroke}
        fill="none"
        strokeDasharray={circumference}
        strokeDashoffset={dashOffset}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </Svg>
  )
}

function MotionCube({
  roll,
  pitch,
  yaw,
  colors,
}: {
  roll: number
  pitch: number
  yaw: number
  colors: AppColors
}) {
  const width = 250
  const height = 170
  const cx = width / 2
  const cy = height / 2
  const size = 40
  const distance = 180

  const rx = clamp(pitch, -80, 80) * Math.PI / 180
  const ry = clamp(yaw, -180, 180) * Math.PI / 180
  const rz = clamp(roll, -180, 180) * Math.PI / 180

  const vertices = [
    [-size, -size, -size],
    [size, -size, -size],
    [size, size, -size],
    [-size, size, -size],
    [-size, -size, size],
    [size, -size, size],
    [size, size, size],
    [-size, size, size],
  ] as const

  const edges: Array<[number, number]> = [
    [0, 1], [1, 2], [2, 3], [3, 0],
    [4, 5], [5, 6], [6, 7], [7, 4],
    [0, 4], [1, 5], [2, 6], [3, 7],
  ]

  function rotate([x, y, z]: readonly number[]) {
    const cyv = Math.cos(ry)
    const syv = Math.sin(ry)
    const cxv = Math.cos(rx)
    const sxv = Math.sin(rx)
    const czv = Math.cos(rz)
    const szv = Math.sin(rz)

    const y1 = y * cxv - z * sxv
    const z1 = y * sxv + z * cxv

    const x2 = x * cyv + z1 * syv
    const z2 = -x * syv + z1 * cyv

    const x3 = x2 * czv - y1 * szv
    const y3 = x2 * szv + y1 * czv

    return { x: x3, y: y3, z: z2 }
  }

  const projected = vertices.map(v => {
    const p = rotate(v)
    const scale = distance / (distance - p.z)
    return {
      x: cx + p.x * scale,
      y: cy + p.y * scale,
      z: p.z,
    }
  })

  return (
    <View style={{ alignItems: 'center' }}>
      <Svg width={width} height={height}>
        {edges.map(([a, b], i) => {
          const p1 = projected[a]
          const p2 = projected[b]
          const avgDepth = (p1.z + p2.z) / 2
          const strokeOpacity = avgDepth > 0 ? 0.9 : 0.45
          const stroke = avgDepth > 0 ? colors.primary : colors.textMuted
          return (
            <Line
              key={`${a}-${b}-${i}`}
              x1={p1.x}
              y1={p1.y}
              x2={p2.x}
              y2={p2.y}
              stroke={stroke}
              strokeOpacity={strokeOpacity}
              strokeWidth={avgDepth > 0 ? 2.2 : 1.4}
            />
          )
        })}

        <Circle cx={cx} cy={cy} r={2.5} fill={colors.warning} />
      </Svg>

      <View style={{ flexDirection: 'row', gap: Spacing.md, marginTop: Spacing.xs }}>
        <Text style={{ color: colors.textMuted, fontSize: Typography.xs, fontFamily: Typography.mono }}>
          Roll {roll.toFixed(1)}°
        </Text>
        <Text style={{ color: colors.textMuted, fontSize: Typography.xs, fontFamily: Typography.mono }}>
          Pitch {pitch.toFixed(1)}°
        </Text>
        <Text style={{ color: colors.textMuted, fontSize: Typography.xs, fontFamily: Typography.mono }}>
          Yaw {yaw.toFixed(1)}°
        </Text>
      </View>
    </View>
  )
}

function TelemetryCard({
  title,
  value,
  subtitle,
  accent,
  colors,
  ringValue,
  ringLabel,
  ringTrack,
  chipA,
  chipB,
  barLabel,
  barValue,
  isCritical = false,
}: {
  title: string
  value: string
  subtitle: string
  accent: string
  colors: AppColors
  ringValue: number
  ringLabel: string
  ringTrack: string
  chipA: { label: string; value: string }
  chipB: { label: string; value: string }
  barLabel: string
  barValue: number
  isCritical?: boolean
}) {
  const barCount = 10
  const activeBars = Math.max(1, Math.round(clamp(barValue, 0, 100) / 10))

  return (
    <View style={motionStyles.telemetryCardOuter}>
      <LinearGradient
        colors={[
          accent + '24',
          isCritical ? accent + '0F' : accent + '12',
          colors.surface,
        ]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[motionStyles.telemetryCard, { borderColor: colors.border, backgroundColor: colors.surfaceRaised }]}
      >
        <View style={motionStyles.telemetryTopRow}>
          <View style={motionStyles.telemetryCopy}>
            <Text style={[motionStyles.telemetryTitle, { color: colors.textMuted }]}>{title}</Text>
            <Text style={[motionStyles.telemetryValue, { color: accent }]}>{value}</Text>
            <Text style={[motionStyles.telemetrySubtitle, { color: colors.textSecondary }]}>{subtitle}</Text>
          </View>

          <View style={motionStyles.telemetryRingWrap}>
            <RingGauge
              value={ringValue}
              size={76}
              stroke={7}
              color={accent}
              track={ringTrack}
            />
            <View style={motionStyles.telemetryRingLabelWrap}>
              <Text style={[motionStyles.telemetryRingLabel, { color: accent }]}>{ringLabel}</Text>
            </View>
          </View>
        </View>

        <View style={motionStyles.telemetryChipRow}>
          <View style={[motionStyles.telemetryChip, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[motionStyles.telemetryChipLabel, { color: colors.textMuted }]}>{chipA.label}</Text>
            <Text style={[motionStyles.telemetryChipValue, { color: colors.textPrimary }]}>{chipA.value}</Text>
          </View>
          <View style={[motionStyles.telemetryChip, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[motionStyles.telemetryChipLabel, { color: colors.textMuted }]}>{chipB.label}</Text>
            <Text style={[motionStyles.telemetryChipValue, { color: colors.textPrimary }]}>{chipB.value}</Text>
          </View>
        </View>

        <View style={motionStyles.telemetryBarBlock}>
          <View style={motionStyles.telemetryBarHeader}>
            <Text style={[motionStyles.telemetryBarLabel, { color: colors.textMuted }]}>{barLabel}</Text>
            <Text style={[motionStyles.telemetryBarValue, { color: accent }]}>{Math.round(barValue)}%</Text>
          </View>
          <View style={motionStyles.telemetryBars}>
            {Array.from({ length: barCount }, (_, index) => {
              const isActive = index < activeBars
              return (
                <View
                  key={index}
                  style={[
                    motionStyles.telemetryBar,
                    {
                      backgroundColor: isActive ? accent : ringTrack,
                      opacity: isActive ? 1 : 0.45,
                      height: 9 + (index % 3) * 3,
                    },
                  ]}
                />
              )
            })}
          </View>
        </View>
      </LinearGradient>
    </View>
  )
}

export default function DashboardScreen() {
  const { colors, isDark } = useTheme()
  const { mode, bleConnected, deviceRssi } = useConnectivity()
  const { slowPacket, fastPacketRef, connectedId, updatePhoneLocation } = useBle()
  const { location } = usePhoneLocation(true)
  const { width: screenWidth } = useWindowDimensions()
  const styles = useMemo(() => makeStyles(colors), [colors])

  const fastPacket = fastPacketRef.current as FastPacket | null

  const hrHist = useRef<VitalPoint[]>([])
  const o2Hist = useRef<VitalPoint[]>([])
  const altHist = useRef<VitalPoint[]>([])
  const [, forceUpdate] = useState(false)

  const sessionStart = useRef(Date.now())
  const prevConnected = useRef<string | null>(null)

  const prevAlt = useRef<number | null>(null)
  const prevAltTime = useRef(Date.now())
  const [vertSpeed, setVertSpeed] = useState(0)

  useEffect(() => {
    if (connectedId && connectedId !== prevConnected.current) {
      sessionStart.current = Date.now()
      hrHist.current = []
      o2Hist.current = []
    }
    prevConnected.current = connectedId
  }, [connectedId])

  useEffect(() => {
    if (!slowPacket) return
    hrHist.current = pushPoint(hrHist.current, slowPacket.bpm)
    o2Hist.current = pushPoint(o2Hist.current, slowPacket.spo2)
    forceUpdate(v => !v)
  }, [slowPacket])

  useEffect(() => {
    if (!location) return

    updatePhoneLocation({
      lat: location.latitude,
      lon: location.longitude,
      altitude: location.altitude,
      accuracy: location.accuracy,
    })

    const alt = location.altitude
    if (alt !== null) {
      const now = Date.now()
      if (prevAlt.current !== null) {
        const dt = (now - prevAltTime.current) / 1000
        if (dt > 0.1) {
          setVertSpeed((alt - prevAlt.current) / dt)
        }
      }
      prevAlt.current = alt
      prevAltTime.current = now
      altHist.current = pushPoint(altHist.current, alt)
      forceUpdate(v => !v)
    }
  }, [location, updatePhoneLocation])

  const isConnected = connectedId !== null
  const altitude = location?.altitude ?? null
  const status = deriveStatus(vertSpeed, altitude, fastPacket?.stationary ?? 1)
  const statusCfg = STATUS_CFG[status]
  const heroGradient = isDark
    ? [statusCfg.color + '25', colors.surfaceRaised, colors.surface] as const
    : [statusCfg.color + '16', '#FFFFFF', colors.surfaceRaised] as const

  const gForce = fastPacket
    ? Math.sqrt(fastPacket.accelX ** 2 + fastPacket.accelY ** 2 + fastPacket.accelZ ** 2)
    : null

  const sparkW = Math.floor((screenWidth - Spacing.md * 2 - Spacing.sm) / 2 - Spacing.md * 2)

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Header ── */}
        <View style={styles.header}>
          <View>
            <Text style={styles.appTitle}>SkyDiver</Text>
            <Text style={styles.subTitle}>
              {isConnected ? 'Device connected' : 'No device connected'}
            </Text>
          </View>
          <ConnectionBadge mode={mode} bleConnected={bleConnected} deviceRssi={deviceRssi} />
        </View>

        {/* ── Hero Altitude Card ── */}
        <View style={[styles.heroCard, { borderColor: statusCfg.color + '35' }]}>
          <LinearGradient
            colors={heroGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.heroGradient}
          />

          <View style={styles.heroTop}>
            <View style={styles.statusPill}>
              <View style={[styles.statusDot, { backgroundColor: statusCfg.color }]} />
              <Text style={[styles.statusLabel, { color: statusCfg.color }]}>
                {statusCfg.label}
              </Text>
            </View>
            <Text style={styles.sessionTimer}>
              {formatDuration(Date.now() - sessionStart.current)}
            </Text>
          </View>

          <View style={styles.altRow}>
            <Text style={[styles.altValue, { color: statusCfg.color }]}>
              {altitude !== null ? Math.round(altitude).toLocaleString() : '—'}
            </Text>
            <Text style={[styles.altUnit, { color: statusCfg.color + '70' }]}>m</Text>
          </View>

          <View style={styles.heroMeta}>
            <View style={styles.metaChip}>
              <Ionicons name="arrow-down" size={10} color={colors.textMuted} />
              <Text style={styles.metaText}>{Math.abs(vertSpeed).toFixed(1)} m/s</Text>
            </View>
            <View style={styles.metaChip}>
              <Ionicons name="location-outline" size={10} color={colors.textMuted} />
              <Text style={styles.metaText}>
                {location
                  ? `${location.latitude.toFixed(4)}°  ${location.longitude.toFixed(4)}°`
                  : 'Acquiring GPS…'
                }
              </Text>
            </View>
          </View>

          {altHist.current.length >= 2 && (
            <View style={styles.sparkWrap}>
              <SparkLine
                data={altHist.current}
                color={statusCfg.color}
                width={screenWidth - Spacing.md * 4}
                height={36}
              />
            </View>
          )}
        </View>

        {/* ── Vitals section ── */}
        <View style={styles.sectionRow}>
          <Text style={styles.sectionTitle}>Vitals</Text>
          {isConnected && (
            <View style={styles.liveChip}>
              <MotiView
                from={{ opacity: 1 }}
                animate={{ opacity: 0.2 }}
                transition={{ type: 'timing', duration: 900, loop: true, repeatReverse: true }}
                style={[styles.liveDot, { backgroundColor: colors.success }]}
              />
              <Text style={[styles.liveText, { color: colors.success }]}>Live</Text>
            </View>
          )}
        </View>

        {isConnected && slowPacket ? (
          <View>
            <View style={styles.metricRow}>
              <MetricCard
                label="Heart Rate"
                value={Math.round(slowPacket.bpm)}
                unit="bpm"
                color={colors.heartRate}
                warning={slowPacket.bpm > 160}
                icon="heart-outline"
              >
                <View style={styles.sparkInCard}>
                  <SparkLine
                    data={hrHist.current}
                    color={slowPacket.bpm > 160 ? colors.danger : colors.heartRate}
                    width={sparkW}
                    height={22}
                  />
                </View>
              </MetricCard>
              <MetricCard
                label="SpO₂"
                value={Math.round(slowPacket.spo2)}
                unit="%"
                color={colors.oxygen}
                warning={slowPacket.spo2 < 93}
                icon="water-outline"
              >
                <View style={styles.sparkInCard}>
                  <SparkLine
                    data={o2Hist.current}
                    color={slowPacket.spo2 < 93 ? colors.danger : colors.oxygen}
                    width={sparkW}
                    height={22}
                  />
                </View>
              </MetricCard>
            </View>

            <View style={styles.metricRow}>
              <MetricCard
                label="Stress Index"
                value={Math.round(slowPacket.stressPct)}
                unit="%"
                color={colors.stress}
                warning={slowPacket.stressPct > 80}
                icon="pulse-outline"
                progress={slowPacket.stressPct}
              />
              <MetricCard
                label="Temperature"
                value={slowPacket.tempC.toFixed(1)}
                unit="°C"
                color={colors.temperature}
                warning={slowPacket.tempC > 37.5}
                icon="thermometer-outline"
              />
            </View>

            {gForce !== null && (
              <View style={styles.metricRow}>
                <MetricCard
                  label="G-Force"
                  value={gForce.toFixed(2)}
                  unit="g"
                  color={gForce > 3 ? colors.warning : colors.primary}
                  warning={gForce > 4}
                  icon="speedometer-outline"
                />
                <MetricCard
                  label="Vert Speed"
                  value={Math.abs(vertSpeed).toFixed(1)}
                  unit="m/s"
                  color={colors.primary}
                  icon="arrow-down-outline"
                />
              </View>
            )}
          </View>
        ) : (
          <View style={styles.emptyCard}>
            <Ionicons name="bluetooth-outline" size={28} color={colors.textMuted} />
            <Text style={styles.emptyTitle}>No device connected</Text>
            <Text style={styles.emptyBody}>
              Connect a SkyWatch wearable to see live vitals
            </Text>
          </View>
        )}

        {/* ── IMU Section ── */}
        {fastPacket && (
          <View>
            <View style={styles.sectionRow}>
              <Text style={styles.sectionTitle}>Motion · IMU</Text>
              {fastPacket.stationary === 1 && (
                <View style={styles.staticPill}>
                  <Text style={styles.staticText}>Stationary</Text>
                </View>
              )}
            </View>

            <View style={styles.imuCard}>
              <MotionCube
                roll={fastPacket.rollDeg}
                pitch={fastPacket.pitchDeg}
                yaw={fastPacket.yawDeg}
                colors={colors}
              />

              <View style={styles.imuDivider} />

              <View style={styles.imuReadoutRow}>
                <View style={styles.imuReadoutCell}>
                  <Text style={styles.imuLabel}>Accel Vector</Text>
                  <Text style={[styles.imuValue, { color: colors.oxygen }]}>
                    {fastPacket.accelX.toFixed(2)} / {fastPacket.accelY.toFixed(2)} / {fastPacket.accelZ.toFixed(2)}
                  </Text>
                </View>
                <View style={styles.imuReadoutCell}>
                  <Text style={styles.imuLabel}>Gyro Vector</Text>
                  <Text style={[styles.imuValue, { color: colors.stress }]}>
                    {fastPacket.gyroX.toFixed(1)} / {fastPacket.gyroY.toFixed(1)} / {fastPacket.gyroZ.toFixed(1)}
                  </Text>
                </View>
              </View>
            </View>
          </View>
        )}

        {/* ── Device ── */}
        {slowPacket && (
          <View>
            <View style={styles.sectionRow}>
              <Text style={styles.sectionTitle}>Device Telemetry</Text>
              <Text style={styles.sectionHint}>Battery and compute load</Text>
            </View>

            <View style={styles.deviceGrid}>
              <TelemetryCard
                title="Battery"
                value={`${Math.round(slowPacket.battPct)}%`}
                subtitle={`${slowPacket.voltageV.toFixed(2)} V · ${slowPacket.currentMA} mA`}
                accent={slowPacket.battPct > 20 ? colors.battery : colors.danger}
                colors={colors}
                ringValue={slowPacket.battPct}
                ringLabel={slowPacket.battPct > 20 ? 'OK' : 'LOW'}
                ringTrack={colors.border}
                chipA={{ label: 'Voltage', value: `${slowPacket.voltageV.toFixed(2)} V` }}
                chipB={{ label: 'Current', value: `${slowPacket.currentMA} mA` }}
                barLabel="Charge"
                barValue={slowPacket.battPct}
                isCritical={slowPacket.battPct <= 20}
              />

              <TelemetryCard
                title="CPU Load"
                value={`${Math.round(slowPacket.cpuPct)}%`}
                subtitle="Realtime compute usage"
                accent={slowPacket.cpuPct < 75 ? colors.primary : colors.warning}
                colors={colors}
                ringValue={slowPacket.cpuPct}
                ringLabel={slowPacket.cpuPct < 75 ? 'STABLE' : 'HOT'}
                ringTrack={colors.border}
                chipA={{label:'Load',value: `${Math.round(slowPacket.cpuPct)}%`}}
                chipB={{label:'Seq', value: '#' + slowPacket.seq}}
                barLabel="Utilization"
                barValue={slowPacket.cpuPct}
                isCritical={slowPacket.cpuPct >= 75}
              />
            </View>
          </View>
        )}

        <View style={{ height: Spacing.xl }} />
      </ScrollView>
    </SafeAreaView>
  )
}

function makeStyles(colors: AppColors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.background },
    scroll: { flex: 1 },
    content: { paddingHorizontal: Spacing.md, paddingTop: Spacing.sm },

    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: Spacing.md,
    },
    appTitle: {
      fontSize: Typography.lg,
      fontWeight: Typography.bold,
      color: colors.textPrimary,
      letterSpacing: 0.5,
    },
    subTitle: {
      fontSize: Typography.xs,
      color: colors.textMuted,
      marginTop: 2,
    },

    heroCard: {
      borderRadius: Radius.lg,
      borderWidth: 1,
      padding: Spacing.md,
      marginBottom: Spacing.md,
      overflow: 'hidden',
      position: 'relative',
    },
    heroGradient: {
      ...StyleSheet.absoluteFillObject,
    },
    heroTop: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: Spacing.sm,
    },
    statusPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: Radius.full,
      backgroundColor: colors.surface + 'C0',
    },
    statusDot: { width: 6, height: 6, borderRadius: 3 },
    statusLabel: {
      fontSize: Typography.xs,
      fontWeight: Typography.bold,
      letterSpacing: 1.5,
    },
    sessionTimer: {
      fontSize: Typography.xs,
      color: colors.textSecondary,
      fontFamily: Typography.mono,
    },

    altRow: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: 6,
      marginBottom: Spacing.xs,
    },
    altValue: {
      fontSize: 56,
      fontWeight: Typography.bold,
      fontFamily: Typography.mono,
      fontVariant: ['tabular-nums'],
      lineHeight: 60,
    },
    altUnit: {
      fontSize: Typography.lg,
      marginBottom: 8,
      fontFamily: Typography.mono,
    },

    heroMeta: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: Spacing.md,
      marginBottom: Spacing.xs,
    },
    metaChip: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    metaText: {
      fontSize: Typography.xs,
      color: colors.textMuted,
      fontFamily: Typography.mono,
    },

    sparkWrap: { marginTop: Spacing.sm, overflow: 'hidden' },

    sectionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: Spacing.sm,
      marginTop: 2,
    },
    sectionTitle: {
      fontSize: Typography.xs,
      fontWeight: Typography.semibold,
      color: colors.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 1.2,
    },
    sectionHint: {
      fontSize: Typography.xs,
      color: colors.textMuted,
    },
    liveChip: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    liveDot: { width: 6, height: 6, borderRadius: 3 },
    liveText: { fontSize: Typography.xs, fontWeight: Typography.medium },

    metricRow: {
      flexDirection: 'row',
      gap: Spacing.sm,
      marginBottom: Spacing.sm,
    },

    deviceGrid: {
      flexDirection: 'column',
      gap: Spacing.sm,
      marginBottom: Spacing.md,
    },

    sparkInCard: { marginTop: Spacing.sm },

    emptyCard: {
      backgroundColor: colors.surfaceRaised,
      borderRadius: Radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: Spacing.xl,
      alignItems: 'center',
      gap: Spacing.sm,
      marginBottom: Spacing.md,
    },
    emptyTitle: {
      fontSize: Typography.base,
      color: colors.textSecondary,
      fontWeight: Typography.semibold,
    },
    emptyBody: {
      fontSize: Typography.sm,
      color: colors.textMuted,
      textAlign: 'center',
      lineHeight: Typography.sm * 1.6,
    },

    staticPill: {
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: Radius.full,
      backgroundColor: colors.border,
    },
    staticText: { fontSize: Typography.xs, color: colors.textMuted },

    imuCard: {
      backgroundColor: colors.surfaceRaised,
      borderRadius: Radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      padding: Spacing.md,
      marginBottom: Spacing.md,
    },
    imuReadoutRow: {
      flexDirection: 'row',
      gap: Spacing.sm,
    },
    imuReadoutCell: {
      flex: 1,
      paddingHorizontal: Spacing.sm,
      paddingVertical: Spacing.xs,
      borderRadius: Radius.sm,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    imuLabel: { fontSize: Typography.xs, color: colors.textMuted, marginBottom: 3 },
    imuValue: {
      fontSize: Typography.sm,
      fontWeight: Typography.semibold,
      fontFamily: Typography.mono,
      fontVariant: ['tabular-nums'],
    },
    imuDivider: {
      height: 1,
      backgroundColor: colors.border,
      marginVertical: Spacing.sm,
    },

    deviceRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.md },

    battCard: {
      flex: 1,
      backgroundColor: colors.surfaceRaised,
      borderRadius: Radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      padding: Spacing.md,
    },
    gaugeHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      marginBottom: Spacing.sm,
    },
    gaugeWrap: {
      width: 66,
      height: 66,
      alignItems: 'center',
      justifyContent: 'center',
    },
    gaugeValue: {
      position: 'absolute',
      fontSize: Typography.xs,
      fontWeight: Typography.bold,
      fontFamily: Typography.mono,
    },
    gaugeMeta: {
      flex: 1,
      gap: 2,
    },
    gaugeTitle: {
      fontSize: Typography.sm,
      color: colors.textPrimary,
      fontWeight: Typography.semibold,
    },
    gaugeSub: {
      fontSize: Typography.xs,
      color: colors.textMuted,
      fontFamily: Typography.mono,
    },
    deviceMetaRow: {
      flexDirection: 'row',
      gap: Spacing.xs,
    },
    deviceChip: {
      flex: 1,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: Radius.sm,
      paddingVertical: 6,
      paddingHorizontal: 8,
      gap: 2,
    },
    deviceChipLabel: {
      fontSize: Typography.xs,
      textTransform: 'uppercase',
      color: colors.textMuted,
      letterSpacing: 0.6,
    },
    deviceChipValue: {
      fontSize: Typography.sm,
      color: colors.textPrimary,
      fontFamily: Typography.mono,
      fontWeight: Typography.semibold,
    },

    sysCard: {
      flex: 1,
      backgroundColor: colors.surfaceRaised,
      borderRadius: Radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      padding: Spacing.md,
    },
  })
}
