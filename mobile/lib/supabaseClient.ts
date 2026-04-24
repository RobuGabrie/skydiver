import { createClient } from '@supabase/supabase-js'
import Constants from 'expo-constants'

const url = (Constants.expoConfig?.extra?.supabaseUrl as string | undefined) ?? ''
const key = (Constants.expoConfig?.extra?.supabaseAnonKey as string | undefined) ?? ''

if (__DEV__ && (!url || !key)) {
  console.warn('[Supabase] Missing credentials in app.json extra — sync disabled')
}

export const supabase = createClient(url, key, {
  auth:     { persistSession: false },
  realtime: { params: { eventsPerSecond: 0 } },
})

export const supabaseConfigured = Boolean(url && key)
