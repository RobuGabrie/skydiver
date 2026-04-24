import {
  getPendingTelemetryEvents,
  markTelemetryEventsSending,
  markTelemetryEventsSent,
  markTelemetryEventsFailed,
  pruneSentTelemetryEvents,
} from './telemetryQueue'
import { supabase, supabaseConfigured } from './supabaseClient'
import { ensureDeviceAndSession, closeSession } from './syncSession'
import { slowEventToRow, alertEventToRow } from './telemetryMapper'
import type { SlowTelemetryEvent, AlertTelemetryEvent, TelemetryQueueItem } from './types'
import type { PostgrestError } from '@supabase/supabase-js'

const BATCH_SIZE        = 1
const MAX_ATTEMPTS      = 5

let bootstrapped = false
let activeSessionId: string | null = null
let flushInFlight: Promise<void> | null = null
let flushRequested = false

function summarizePostgrestError(error: PostgrestError | null) {
  if (!error) return null
  return {
    code: error.code,
    message: error.message,
    details: error.details,
    hint: error.hint,
  }
}

export function startSyncWorker(deviceId: string, sessionId: string): void {
  if (!supabaseConfigured) {
    if (__DEV__) console.warn('[SyncWorker] Supabase not configured — skipping')
    return
  }

  if (__DEV__) {
    supabase.auth.getSession().then(({ data, error }) => {
      const mode = data.session ? 'authenticated' : 'anon'
      if (error) {
        console.warn('[SyncWorker] auth mode lookup failed', summarizePostgrestError(error as PostgrestError))
        return
      }
      console.log(`[SyncWorker] auth mode: ${mode}`)
    }).catch(err => {
      console.warn('[SyncWorker] auth mode lookup exception', err)
    })
  }

  bootstrapped = false
  activeSessionId = sessionId

  ensureDeviceAndSession(deviceId, sessionId)
    .then(() => {
      bootstrapped = true
      if (__DEV__) console.log('[SyncWorker] bootstrapped', sessionId)
      flush().catch(err => console.warn('[SyncWorker] initial flush error:', err))
    })
    .catch(err => console.warn('[SyncWorker] bootstrap error:', err))

  pruneSentTelemetryEvents().catch(() => {})
}

export function stopSyncWorker(): void {
  if (activeSessionId) {
    closeSession(activeSessionId).catch(err =>
      console.warn('[SyncWorker] session close error:', err)
    )
    activeSessionId = null
  }
  bootstrapped = false
  flushRequested = false
}

export function requestSyncFlush(): void {
  if (!bootstrapped) return
  flushRequested = true
  if (flushInFlight) return

  void runFlushLoop()
}

async function runFlushLoop(): Promise<void> {
  if (flushInFlight) return flushInFlight

  flushInFlight = (async () => {
    while (flushRequested && bootstrapped) {
      flushRequested = false
      await flush()
    }
  })()
    .catch(err => console.warn('[SyncWorker] flush error:', err))
    .finally(() => {
      flushInFlight = null
      if (flushRequested && bootstrapped) {
        void runFlushLoop()
      }
    })

  return flushInFlight
}

export async function sendTelemetryEventNow(event: SlowTelemetryEvent | AlertTelemetryEvent): Promise<void> {
  if (!supabaseConfigured) return

  try {
    if (event.kind === 'slow') {
      await uploadSlowImmediate(event)
    } else {
      await uploadAlertImmediate(event)
    }
  } catch (error) {
    if (__DEV__) console.warn('[SyncWorker] immediate upload failed', error)
    requestSyncFlush()
  }
}

async function flush(): Promise<void> {
  const eligible = await getPendingTelemetryEvents(BATCH_SIZE, MAX_ATTEMPTS, activeSessionId ?? undefined)
  if (eligible.length === 0) return

  const ids = eligible.map(i => i.id)
  await markTelemetryEventsSending(ids)

  const slowItems  = eligible.filter(i => i.event.kind === 'slow')
  const alertItems = eligible.filter(i => i.event.kind === 'alert')

  await Promise.all([
    slowItems.length  > 0 ? uploadSlow(slowItems)   : Promise.resolve(),
    alertItems.length > 0 ? uploadAlerts(alertItems) : Promise.resolve(),
  ])
}

async function uploadSlow(items: TelemetryQueueItem[]): Promise<void> {
  const rows = items.map(i => slowEventToRow(i.event as SlowTelemetryEvent))
  const { data, error } = await supabase
    .from('telemetry_events')
    .upsert(rows, { onConflict: 'session_id,sequence', ignoreDuplicates: true })
    .select('event_id, session_id, device_id, sequence, recorded_at')

  if (error) {
    if (__DEV__) {
      console.warn('[SyncWorker] telemetry upsert failed', {
        error: summarizePostgrestError(error),
        rowCount: rows.length,
        firstRow: rows[0],
      })
    }
    await markTelemetryEventsFailed(items.map(i => i.id), error.message)
  } else {
    await markTelemetryEventsSent(items.map(i => i.id))
    if (__DEV__) {
      console.log(`[SyncWorker] uploaded ${items.length} telemetry rows`, {
        returned: data?.length ?? 0,
        firstReturned: data?.[0] ?? null,
      })
    }
  }
}

async function uploadAlerts(items: TelemetryQueueItem[]): Promise<void> {
  const rows = items.map(i => alertEventToRow(i.event as AlertTelemetryEvent))
  const { data, error } = await supabase
    .from('alert_events')
    .upsert(rows, { onConflict: 'event_id', ignoreDuplicates: true })
    .select('event_id, session_id, device_id, sequence, recorded_at')

  if (error) {
    if (__DEV__) {
      console.warn('[SyncWorker] alert upsert failed', {
        error: summarizePostgrestError(error),
        rowCount: rows.length,
        firstRow: rows[0],
      })
    }
    await markTelemetryEventsFailed(items.map(i => i.id), error.message)
  } else {
    await markTelemetryEventsSent(items.map(i => i.id))
    if (__DEV__) {
      console.log(`[SyncWorker] uploaded ${items.length} alert rows`, {
        returned: data?.length ?? 0,
        firstReturned: data?.[0] ?? null,
      })
    }
  }
}

async function uploadSlowImmediate(event: SlowTelemetryEvent): Promise<void> {
  const row = slowEventToRow(event)
  const { error } = await supabase
    .from('telemetry_events')
    .upsert([row], { onConflict: 'session_id,sequence', ignoreDuplicates: true })

  if (error) {
    if (__DEV__) {
      console.warn('[SyncWorker] immediate telemetry upload failed', {
        error: summarizePostgrestError(error),
        row,
      })
    }
    throw error
  }

  if (__DEV__) {
    console.log('[SyncWorker] immediate telemetry upload ok', {
      event_id: row.event_id,
      session_id: row.session_id,
      sequence: row.sequence,
    })
  }
}

async function uploadAlertImmediate(event: AlertTelemetryEvent): Promise<void> {
  const row = alertEventToRow(event)
  const { error } = await supabase
    .from('alert_events')
    .upsert([row], { onConflict: 'event_id', ignoreDuplicates: true })

  if (error) {
    if (__DEV__) {
      console.warn('[SyncWorker] immediate alert upload failed', {
        error: summarizePostgrestError(error),
        row,
      })
    }
    throw error
  }

  if (__DEV__) {
    console.log('[SyncWorker] immediate alert upload ok', {
      event_id: row.event_id,
      session_id: row.session_id,
      sequence: row.sequence,
    })
  }
}
