import React, { useState, useMemo, useRef, useEffect } from 'react'
import { View, Text, ScrollView, StyleSheet, Pressable } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { MotiView, AnimatePresence } from 'moti'
import { useBle } from '../../lib/BleContext'
import { useTheme } from '../../lib/ThemeContext'
import { SparkLine } from '../../components/SparkLine'
import { Progress } from '~/components/ui/progress'
import { AppColors, Typography, Spacing, Radius, TouchTarget } from '../../lib/theme'
import type { VitalPoint } from '../../lib/types'

const MAX_HIST = 40

function pushPoint(arr: VitalPoint[], value: number): VitalPoint[] {
  return [...arr.slice(-(MAX_HIST - 1)), { time: Date.now(), value }]
}

interface VitalCardProps {
  label: string
  value: number
  unit: string
  color: string
  min: number
  max: number
  warning: boolean
  description: string
  history: VitalPoint[]
  icon: React.ComponentProps<typeof Ionicons>['name']
  colors: AppColors
  index: number
}

function VitalCard({
  label, value, unit, color, min, max, warning, description, history, icon, colors, index,
}: VitalCardProps) {
  const [expanded, setExpanded] = useState(false)
  const styles = useMemo(() => makeStyles(colors), [colors])
  const pct = Math.round(((value - min) / (max - min)) * 100)
  const accentColor = warning ? colors.danger : color

  return (
    <MotiView
      from={{ opacity: 0, translateY: 12 }}
      animate={{ opacity: 1, translateY: 0 }}
      transition={{ type: 'spring', damping: 20, stiffness: 110, delay: index * 60 }}
    >
      <Pressable
        onPress={() => setExpanded(e => !e)}
        style={[
          styles.vitalCard,
          warning
            ? { borderColor: colors.danger + '50', backgroundColor: colors.dangerDim }
            : { borderColor: colors.border },
        ]}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${value} ${unit}`}
      >
        {/* Top row: icon box + value + sparkline */}
        <View style={styles.topRow}>
          <View style={[styles.iconBox, { backgroundColor: accentColor + '18' }]}>
            <Ionicons name={icon} size={15} color={accentColor} />
          </View>

          <View style={styles.centerCol}>
            <Text style={[styles.vitalLabel, { color: warning ? colors.danger : colors.textMuted }]}>
              {label}
            </Text>
            <View style={styles.valueRow}>
              <Text style={[styles.vitalValue, { color: accentColor }]}>{value}</Text>
              <Text style={[styles.vitalUnit, { color: accentColor + '80' }]}>{unit}</Text>
              {warning && (
                <View style={styles.alertBadge}>
                  <Ionicons name="warning" size={9} color={colors.danger} />
                  <Text style={styles.alertText}>Alert</Text>
                </View>
              )}
            </View>
            <Progress
              value={Math.min(100, Math.max(0, pct))}
              className="h-0.5 mt-1"
              indicatorClassName={warning ? 'bg-destructive' : undefined}
            />
          </View>

          <View style={styles.rightCol}>
            {history.length >= 2 && (
              <SparkLine data={history} color={accentColor} width={70} height={30} />
            )}
            <MotiView
              animate={{ rotate: expanded ? '180deg' : '0deg' }}
              transition={{ type: 'spring', damping: 16, stiffness: 200 }}
            >
              <Ionicons name="chevron-down" size={12} color={colors.textMuted} />
            </MotiView>
          </View>
        </View>

        <AnimatePresence>
          {expanded && (
            <MotiView
              key="detail"
              from={{ opacity: 0, translateY: -6 }}
              animate={{ opacity: 1, translateY: 0 }}
              exit={{ opacity: 0, translateY: -6 }}
              transition={{ type: 'timing', duration: 180 }}
              style={styles.expandedSection}
            >
              <Text style={styles.expandedDesc}>{description}</Text>
              <View style={styles.rangeRow}>
                <Text style={styles.rangeText}>Min {min} {unit}</Text>
                <Text style={[styles.rangeText, { color: accentColor }]}>Now {value} {unit}</Text>
                <Text style={styles.rangeText}>Max {max} {unit}</Text>
              </View>
            </MotiView>
          )}
        </AnimatePresence>
      </Pressable>
    </MotiView>
  )
}

export default function VitalsScreen() {
  const { colors } = useTheme()
  const { slowPacket, connectedId } = useBle()
  const styles = useMemo(() => makeStyles(colors), [colors])

  const hrHist = useRef<VitalPoint[]>([])
  const o2Hist = useRef<VitalPoint[]>([])
  const stressHist = useRef<VitalPoint[]>([])
  const tempHist = useRef<VitalPoint[]>([])
  const [, forceUpdate] = useState(false)

  useEffect(() => {
    if (!slowPacket) return
    hrHist.current = pushPoint(hrHist.current, slowPacket.bpm)
    o2Hist.current = pushPoint(o2Hist.current, slowPacket.spo2)
    stressHist.current = pushPoint(stressHist.current, slowPacket.stressPct)
    tempHist.current = pushPoint(tempHist.current, slowPacket.tempC)
    forceUpdate(v => !v)
  }, [slowPacket])

  const isConnected = connectedId !== null

  if (!isConnected || !slowPacket) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.content}>
          <Text style={styles.pageTitle}>Biometrics</Text>
          <Text style={styles.pageSubtitle}>Live physiological monitoring</Text>
          <MotiView
            from={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: 'spring', damping: 16, stiffness: 100, delay: 80 }}
            style={styles.emptyState}
          >
            <Ionicons name="heart-dislike-outline" size={36} color={colors.textMuted} />
            <Text style={styles.emptyTitle}>No device connected</Text>
            <Text style={styles.emptyBody}>
              Connect a SkyWatch wearable on the Connect tab to see real-time biometric data.
            </Text>
          </MotiView>
        </View>
      </SafeAreaView>
    )
  }

  // Summary stats for header row
  const summaryItems = [
    {
      label: 'SpO₂',
      value: `${Math.round(slowPacket.spo2)}%`,
      color: slowPacket.spo2 < 93 ? colors.danger : colors.oxygen,
      warn: slowPacket.spo2 < 93,
    },
    {
      label: 'HR',
      value: `${Math.round(slowPacket.bpm)}`,
      color: slowPacket.bpm > 160 ? colors.danger : colors.heartRate,
      warn: slowPacket.bpm > 160,
    },
    {
      label: 'Stress',
      value: `${Math.round(slowPacket.stressPct)}%`,
      color: slowPacket.stressPct > 80 ? colors.danger : colors.stress,
      warn: slowPacket.stressPct > 80,
    },
    {
      label: 'Battery',
      value: `${Math.round(slowPacket.battPct)}%`,
      color: slowPacket.battPct < 20 ? colors.danger : colors.battery,
      warn: slowPacket.battPct < 20,
    },
  ]

  const vitals: Omit<VitalCardProps, 'colors' | 'index'>[] = [
    {
      label: 'Heart Rate',
      value: Math.round(slowPacket.bpm),
      unit: 'bpm',
      color: colors.heartRate,
      min: 40, max: 200,
      warning: slowPacket.bpm > 160,
      icon: 'heart-outline',
      description: 'Heart beats per minute. Safe range during freefall: 60–160 bpm. Elevated rate may indicate physical stress.',
      history: hrHist.current,
    },
    {
      label: 'Blood Oxygen (SpO₂)',
      value: Math.round(slowPacket.spo2),
      unit: '%',
      color: colors.oxygen,
      min: 85, max: 100,
      warning: slowPacket.spo2 < 93,
      icon: 'water-outline',
      description: 'Oxygen saturation in blood. Below 93% is concerning at altitude — hypoxia can impair decision-making.',
      history: o2Hist.current,
    },
    {
      label: 'Stress Index',
      value: Math.round(slowPacket.stressPct),
      unit: '%',
      color: colors.stress,
      min: 0, max: 100,
      warning: slowPacket.stressPct > 80,
      icon: 'pulse-outline',
      description: 'Derived from HRV and motion. Above 80% indicates possible panic response or loss of control.',
      history: stressHist.current,
    },
    {
      label: 'Body Temperature',
      value: +slowPacket.tempC.toFixed(1),
      unit: '°C',
      color: colors.temperature,
      min: 35, max: 40,
      warning: slowPacket.tempC > 37.5,
      icon: 'thermometer-outline',
      description: 'Skin temperature from wrist sensor. Hypothermia risk at altitude. Normal: 36.1–37.2°C.',
      history: tempHist.current,
    },
  ]

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.pageTitle}>Biometrics</Text>
        <Text style={styles.pageSubtitle}>Live physiological monitoring</Text>

        {/* Summary strip */}
        <MotiView
          from={{ opacity: 0, translateY: 10 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: 'spring', damping: 18, stiffness: 110, delay: 40 }}
          style={styles.summaryCard}
        >
          {summaryItems.map((item, i) => (
            <React.Fragment key={item.label}>
              {i > 0 && <View style={styles.summaryDivider} />}
              <View style={styles.summaryItem}>
                <Text style={styles.summaryLabel}>{item.label}</Text>
                <Text style={[styles.summaryValue, { color: item.color }]}>{item.value}</Text>
                {item.warn && (
                  <Ionicons name="warning" size={9} color={colors.danger} style={{ marginTop: 2 }} />
                )}
              </View>
            </React.Fragment>
          ))}
        </MotiView>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Detail View</Text>
          <Text style={styles.sectionHint}>Tap to expand</Text>
        </View>

        <View style={styles.list}>
          {vitals.map((v, i) => (
            <VitalCard key={v.label} {...v} colors={colors} index={i} />
          ))}
        </View>

        <View style={{ height: Spacing.xl }} />
      </ScrollView>
    </SafeAreaView>
  )
}

function makeStyles(colors: AppColors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.background },
    scroll: { flex: 1 },
    content: { padding: Spacing.md },

    pageTitle: {
      fontSize: Typography.xl,
      fontWeight: Typography.bold,
      color: colors.textPrimary,
      marginBottom: 2,
    },
    pageSubtitle: {
      fontSize: Typography.sm,
      color: colors.textMuted,
      marginBottom: Spacing.lg,
    },

    emptyState: {
      alignItems: 'center',
      paddingTop: Spacing.xxl,
      gap: Spacing.md,
    },
    emptyTitle: {
      fontSize: Typography.md,
      fontWeight: Typography.semibold,
      color: colors.textSecondary,
    },
    emptyBody: {
      fontSize: Typography.sm,
      color: colors.textMuted,
      textAlign: 'center',
      lineHeight: Typography.sm * 1.7,
      maxWidth: 280,
    },

    summaryCard: {
      flexDirection: 'row',
      backgroundColor: colors.surfaceRaised,
      borderRadius: Radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      paddingVertical: Spacing.md,
      paddingHorizontal: Spacing.sm,
      marginBottom: Spacing.lg,
    },
    summaryItem: {
      flex: 1,
      alignItems: 'center',
      gap: 3,
    },
    summaryDivider: {
      width: 1,
      backgroundColor: colors.border,
    },
    summaryLabel: {
      fontSize: Typography.xs,
      color: colors.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
    },
    summaryValue: {
      fontSize: Typography.md,
      fontWeight: Typography.bold,
      fontFamily: Typography.mono,
    },

    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: Spacing.sm,
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

    list: { gap: Spacing.sm },

    vitalCard: {
      backgroundColor: colors.surfaceRaised,
      borderRadius: Radius.md,
      borderWidth: 1,
      padding: Spacing.md,
      minHeight: TouchTarget,
    },
    topRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: Spacing.sm,
    },
    iconBox: {
      width: 32,
      height: 32,
      borderRadius: Radius.sm,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    centerCol: { flex: 1 },
    rightCol: {
      alignItems: 'flex-end',
      justifyContent: 'space-between',
      gap: Spacing.sm,
      flexShrink: 0,
    },

    vitalLabel: {
      fontSize: Typography.xs,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
      fontWeight: Typography.medium,
      marginBottom: 3,
    },
    valueRow: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: 3,
      marginBottom: 4,
    },
    vitalValue: {
      fontSize: Typography.xl,
      fontWeight: Typography.bold,
      fontFamily: Typography.mono,
      fontVariant: ['tabular-nums'],
      lineHeight: Typography.xl * 1.1,
    },
    vitalUnit: {
      fontSize: Typography.sm,
      marginBottom: 3,
      fontWeight: Typography.medium,
    },

    alertBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
      backgroundColor: colors.dangerDim,
      paddingHorizontal: 5,
      paddingVertical: 2,
      borderRadius: Radius.full,
      marginBottom: 3,
      marginLeft: 2,
    },
    alertText: {
      fontSize: 9,
      color: colors.danger,
      fontWeight: Typography.semibold,
    },

    expandedSection: {
      marginTop: Spacing.md,
      paddingTop: Spacing.md,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      gap: Spacing.sm,
    },
    expandedDesc: {
      fontSize: Typography.sm,
      color: colors.textSecondary,
      lineHeight: Typography.sm * 1.6,
    },
    rangeRow: { flexDirection: 'row', justifyContent: 'space-between' },
    rangeText: {
      fontSize: Typography.xs,
      color: colors.textMuted,
      fontFamily: Typography.mono,
    },
  })
}
