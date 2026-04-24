import React, { useMemo } from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useTheme } from '../lib/ThemeContext'
import { AppColors, Typography, Radius, Spacing } from '../lib/theme'
import { ConnectionMode } from '../lib/types'

interface Props {
  mode: ConnectionMode
  bleConnected?: boolean
  deviceRssi?: number
}

const MODE_CONFIG = {
  wifi:    { icon: 'wifi' as const,         colorKey: 'wifi' as const,    label: 'WiFi' },
  ble:     { icon: 'bluetooth' as const,     colorKey: 'ble' as const,     label: 'BLE' },
  offline: { icon: 'cloud-offline' as const, colorKey: 'offline' as const, label: 'Off' },
}

export function ConnectionBadge({ mode, bleConnected = true, deviceRssi }: Props) {
  const { colors } = useTheme()
  const styles = useMemo(() => makeStyles(colors), [colors])
  const cfg = MODE_CONFIG[mode]
  const accentColor = colors[cfg.colorKey]
  const isActive = mode === 'wifi' ? true : (bleConnected && mode !== 'offline')
  const dotColor = isActive ? accentColor : colors.offline
  const signalBars = deviceRssi === undefined
    ? 0
    : deviceRssi > -60
      ? 4
      : deviceRssi > -70
        ? 3
        : deviceRssi > -82
          ? 2
          : 1
  const statusLabel = mode === 'offline' ? 'Disconnected' : isActive ? 'Live' : 'Searching'

  return (
    <View style={[styles.container, { borderColor: accentColor + '35' }]}>
      <View style={[styles.iconWrap, { backgroundColor: accentColor + '15' }]}>
        <Ionicons name={cfg.icon} size={14} color={accentColor} />
      </View>

      <View style={styles.infoCol}>
        <Text style={[styles.modeLabel, { color: accentColor }]}>{cfg.label} Link</Text>
        <View style={styles.subRow}>
          <View style={[styles.dot, { backgroundColor: dotColor }]} />
          <Text style={[styles.status, { color: colors.textSecondary }]}>{statusLabel}</Text>
          {deviceRssi !== undefined && mode === 'ble' && (
            <Text style={[styles.rssi, { color: colors.textMuted }]}>{deviceRssi} dBm</Text>
          )}
        </View>
      </View>

      {mode === 'ble' && (
        <View style={styles.bars}>
          {[1, 2, 3, 4].map(bar => (
            <View
              key={bar}
              style={[
                styles.bar,
                {
                  height: 4 + bar * 3,
                  backgroundColor: bar <= signalBars ? accentColor : colors.border,
                },
              ]}
            />
          ))}
        </View>
      )}
    </View>
  )
}

function makeStyles(colors: AppColors) {
  return StyleSheet.create({
    container: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      paddingHorizontal: 10,
      paddingVertical: 8,
      borderRadius: Radius.md,
      borderWidth: 1,
      backgroundColor: colors.surface,
      minHeight: 46,
    },
    iconWrap: {
      width: 26,
      height: 26,
      borderRadius: Radius.sm,
      alignItems: 'center',
      justifyContent: 'center',
    },
    infoCol: {
      gap: 1,
      minWidth: 92,
    },
    modeLabel: {
      fontSize: Typography.xs,
      fontWeight: Typography.bold,
      letterSpacing: 0.5,
      textTransform: 'uppercase',
    },
    subRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
    },
    dot: {
      width: 6,
      height: 6,
      borderRadius: 3,
    },
    status: {
      fontSize: 10,
      fontWeight: Typography.medium,
    },
    rssi: {
      fontSize: 10,
      fontFamily: 'monospace',
    },
    bars: {
      marginLeft: 'auto',
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: 2,
      height: 18,
    },
    bar: {
      width: 3,
      borderRadius: Radius.full,
    },
  })
}
