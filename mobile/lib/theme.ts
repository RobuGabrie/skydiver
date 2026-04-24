const Accents = {
  primary:     '#6366F1',  // indigo-500 — matches web primary
  success:     '#22C55E',  // emerald-500
  warning:     '#F59E0B',  // amber-500
  danger:      '#EF4444',  // red-500
  heartRate:   '#F43F5E',  // rose-500
  oxygen:      '#06B6D4',  // cyan-500
  stress:      '#A855F7',  // purple-500
  temperature: '#F59E0B',  // amber-500
  battery:     '#22C55E',  // emerald-500
  wifi:        '#0EA5E9',  // sky-500
  ble:         '#6366F1',  // indigo
  offline:     '#475569',  // slate-600
} as const

export const DarkColors = {
  background:    '#0A0A0F',
  surface:       '#111116',
  surfaceRaised: '#18181E',
  border:        '#242430',
  borderMuted:   '#1C1C26',
  textPrimary:   '#F1F5F9',   // slate-100
  textSecondary: '#94A3B8',   // slate-400
  textMuted:     '#64748B',   // slate-500
  primaryDim:    '#1E1B4B',   // indigo-950
  dangerDim:     '#1F0A0A',
  warningDim:    '#1C1200',
  infoDim:       '#0A0E1F',
  ...Accents,
} as const

export const LightColors = {
  background:    '#F8FAFC',
  surface:       '#FFFFFF',
  surfaceRaised: '#F1F5F9',
  border:        '#E2E8F0',
  borderMuted:   '#EEF2F8',
  textPrimary:   '#0F172A',   // slate-900
  textSecondary: '#334155',   // slate-700
  textMuted:     '#64748B',   // slate-500
  primaryDim:    '#EEF2FF',   // indigo-50
  dangerDim:     '#FEF2F2',
  warningDim:    '#FFFBEB',
  infoDim:       '#EEF2FF',
  ...Accents,
} as const

export type AppColors = typeof DarkColors | typeof LightColors

export const Colors = DarkColors

export const Spacing = {
  xs:  4,
  sm:  8,
  md:  16,
  lg:  24,
  xl:  32,
  xxl: 48,
} as const

export const Radius = {
  sm:  6,
  md:  10,
  lg:  14,
  xl:  20,
  full: 9999,
} as const

export const Typography = {
  xs:   11,
  sm:   13,
  base: 15,
  md:   17,
  lg:   20,
  xl:   24,
  xxl:  32,
  hero: 56,

  regular:   '400' as const,
  medium:    '500' as const,
  semibold:  '600' as const,
  bold:      '700' as const,
  mono:      'monospace' as const,
} as const

export const TouchTarget = 44
