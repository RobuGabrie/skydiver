import { supabase } from './supabaseClient'

function summarizeError(error: unknown) {
  if (!error || typeof error !== 'object') return { message: String(error) }
  const maybe = error as { code?: string; message?: string; details?: string; hint?: string }
  return {
    code: maybe.code,
    message: maybe.message,
    details: maybe.details,
    hint: maybe.hint,
  }
}

export async function ensureDeviceAndSession(
  deviceId: string,
  sessionId: string,
): Promise<void> {
  const { error } = await supabase.rpc('upsert_device_and_session', {
    p_device_id:  deviceId,
    p_session_id: sessionId,
  })
  if (error) {
    if (__DEV__) {
      console.warn('[SyncSession] upsert_device_and_session failed', {
        error: summarizeError(error),
        deviceId,
        sessionId,
      })
    }
    throw new Error(`Session bootstrap failed: ${error.message}`)
  }
}

export async function closeSession(sessionId: string): Promise<void> {
  const { error } = await supabase
    .from('sessions')
    .update({ ended_at: new Date().toISOString() })
    .eq('id', sessionId)
    .is('ended_at', null)
  if (error) {
    if (__DEV__) {
      console.warn('[SyncSession] closeSession failed', {
        error: summarizeError(error),
        sessionId,
      })
    }
    throw new Error(`Session close failed: ${error.message}`)
  }
}
