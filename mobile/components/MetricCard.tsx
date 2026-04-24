import React, { useMemo, useRef, useEffect, useState, memo } from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useTheme } from '../lib/ThemeContext'
import { AppColors, Typography, Spacing, Radius } from '../lib/theme'
import { Progress } from '~/components/ui/progress'

interface Props {
  label: string
  value: string | number
  unit?: string
  color?: string
  warning?: boolean
  large?: boolean
  progress?: number
  icon?: React.ComponentProps<typeof Ionicons>['name']
  children?: React.ReactNode
}

export const MetricCard = memo(function MetricCard({ label, value, unit, color, warning, large, progress, icon, children }: Props) {
  const { colors } = useTheme()
  const styles = useMemo(() => makeStyles(colors), [colors])
  const accentColor = warning ? colors.danger : (color ?? colors.primary)

  const prevValue = useRef(value)
  const [pulsing, setPulsing] = useState(false)

  useEffect(() => {
    if (prevValue.current !== value) {
      prevValue.current = value
      setPulsing(true)
      const t = setTimeout(() => setPulsing(false), 300)
      return () => clearTimeout(t)
    }
  }, [value])

  return (
    <View
      style={[
        styles.card,
        warning
          ? { borderColor: colors.danger + '50', backgroundColor: colors.dangerDim }
          : { borderColor: colors.border },
      ]}
    >
      {icon && (
        <View style={[styles.iconBox, { backgroundColor: accentColor + '18' }]}>
          <Ionicons name={icon} size={14} color={accentColor} />
        </View>
      )}

      <Text style={styles.label}>{label}</Text>

      <View style={[styles.valueRow, pulsing && styles.valueRowPulse]}>
        <Text style={[styles.value, large && styles.valueLarge, { color: accentColor }]}>
          {value}
        </Text>
        {unit && (
          <Text style={[styles.unit, { color: accentColor + '80' }]}>{unit}</Text>
        )}
      </View>

      {progress !== undefined && (
        <Progress
          value={Math.min(100, Math.max(0, progress))}
          className="h-0.5 mt-2"
          indicatorClassName={warning ? 'bg-destructive' : undefined}
        />
      )}

      {children}
    </View>
  )
})

function makeStyles(colors: AppColors) {
  return StyleSheet.create({
    card: {
      backgroundColor: colors.surfaceRaised,
      borderRadius: Radius.md,
      borderWidth: 1,
      padding: Spacing.md,
      flex: 1,
      gap: 4,
    },
    iconBox: {
      width: 30,
      height: 30,
      borderRadius: Radius.sm,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 2,
    },
    label: {
      fontSize: Typography.xs,
      color: colors.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
      fontWeight: Typography.medium,
    },
    valueRow: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: 3,
    },
    valueRowPulse: {
      opacity: 0.45,
    },
    value: {
      fontSize: Typography.xl,
      fontWeight: Typography.bold,
      fontFamily: Typography.mono,
      fontVariant: ['tabular-nums'],
      lineHeight: Typography.xl * 1.1,
    },
    valueLarge: {
      fontSize: Typography.hero,
      lineHeight: Typography.hero * 1.05,
    },
    unit: {
      fontSize: Typography.sm,
      fontWeight: Typography.medium,
      fontFamily: Typography.mono,
      marginBottom: 3,
    },
  })
}
