import React, { memo } from 'react'
import { View } from 'react-native'
import Svg, { Path } from 'react-native-svg'
import { VitalPoint } from '../lib/types'

interface Props {
  data: VitalPoint[]
  color: string
  width?: number
  height?: number
}

export const SparkLine = memo(function SparkLine({ data, color, width = 120, height = 40 }: Props) {
  if (data.length < 2) return <View style={{ width, height }} />

  const values = data.map(d => d.value)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1

  const padX = 2
  const padY = 3
  const w = width - padX * 2
  const h = height - padY * 2

  const points = values.map((v, i) => ({
    x: padX + (i / (values.length - 1)) * w,
    y: padY + (1 - (v - min) / range) * h,
  }))

  const linePath = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(' ')

  return (
    <Svg width={width} height={height}>
      <Path
        d={linePath}
        stroke={color}
        strokeWidth={1.5}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  )
})
