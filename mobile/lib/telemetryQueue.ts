import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite'
import type { AlertTelemetryEvent, SlowTelemetryEvent, TelemetryEvent, TelemetryQueueItem, TelemetryQueueStatus } from './types'

const TELEMETRY_DB_NAME = 'telemetry_queue.db'

const CREATE_TABLE_SQL = `
	CREATE TABLE IF NOT EXISTS telemetry_queue (
		id TEXT PRIMARY KEY NOT NULL,
		event_id TEXT NOT NULL UNIQUE,
		session_id TEXT NOT NULL,
		device_id TEXT NOT NULL,
		sequence INTEGER NOT NULL,
		timestamp INTEGER NOT NULL,
		kind TEXT NOT NULL CHECK(kind IN ('slow', 'alert')),
		event_json TEXT NOT NULL,
		sync_status TEXT NOT NULL CHECK(sync_status IN ('pending', 'sending', 'sent', 'failed')),
		attempts INTEGER NOT NULL DEFAULT 0,
		created_at INTEGER NOT NULL,
		last_attempt_at INTEGER,
		synced_at INTEGER,
		error_message TEXT
	);

	CREATE INDEX IF NOT EXISTS idx_telemetry_queue_sync_status
		ON telemetry_queue(sync_status);

	CREATE INDEX IF NOT EXISTS idx_telemetry_queue_session_id
		ON telemetry_queue(session_id);

	CREATE INDEX IF NOT EXISTS idx_telemetry_queue_created_at
		ON telemetry_queue(created_at);
`

interface TelemetryQueueRow {
	id: string
	event_id: string
	session_id: string
	device_id: string
	sequence: number
	timestamp: number
	kind: TelemetryEvent['kind']
	event_json: string
	sync_status: TelemetryQueueStatus
	attempts: number
	created_at: number
	last_attempt_at: number | null
	synced_at: number | null
	error_message: string | null
}

let databasePromise: Promise<SQLiteDatabase> | null = null

async function getDatabase() {
	if (!databasePromise) {
		databasePromise = (async () => {
			const database = await openDatabaseAsync(TELEMETRY_DB_NAME)
			await database.execAsync(CREATE_TABLE_SQL)
			return database
		})()
	}

	return databasePromise
}

function serializeEvent(event: TelemetryEvent) {
	return JSON.stringify(event)
}

function deserializeEvent(eventJson: string) {
	return JSON.parse(eventJson) as TelemetryEvent
}

function mapRowToQueueItem(row: TelemetryQueueRow): TelemetryQueueItem {
	return {
		id: row.id,
		event: deserializeEvent(row.event_json),
		syncStatus: row.sync_status,
		attempts: row.attempts,
		createdAt: row.created_at,
		lastAttemptAt: row.last_attempt_at ?? undefined,
		syncedAt: row.synced_at ?? undefined,
		errorMessage: row.error_message ?? undefined,
	}
}

function buildQueueItem(event: TelemetryEvent, syncStatus: TelemetryQueueStatus = 'pending'): TelemetryQueueItem {
	return {
		id: event.eventId,
		event,
		syncStatus,
		attempts: 0,
		createdAt: Date.now(),
	}
}

async function getRowById(id: string) {
	const database = await getDatabase()
	const row = await database.getFirstAsync<TelemetryQueueRow>('SELECT * FROM telemetry_queue WHERE id = ?', [id])
	return row ? mapRowToQueueItem(row) : null
}

export async function enqueueTelemetryEvent(event: SlowTelemetryEvent | AlertTelemetryEvent) {
	const database = await getDatabase()
	const queueItem = buildQueueItem(event)

	await database.runAsync(
		`INSERT OR IGNORE INTO telemetry_queue (
			id,
			event_id,
			session_id,
			device_id,
			sequence,
			timestamp,
			kind,
			event_json,
			sync_status,
			attempts,
			created_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		[
			queueItem.id,
			event.eventId,
			event.sessionId,
			event.deviceId,
			event.sequence,
			event.timestamp,
			event.kind,
			serializeEvent(event),
			queueItem.syncStatus,
			queueItem.attempts,
			queueItem.createdAt,
		],
	)

	return (await getRowById(queueItem.id)) ?? queueItem
}

export async function getPendingTelemetryEvents(limit = 100) {
	const database = await getDatabase()
	const rows = await database.getAllAsync<TelemetryQueueRow>(
		`SELECT *
		 FROM telemetry_queue
		 WHERE sync_status IN ('pending', 'failed')
		 ORDER BY created_at ASC
		 LIMIT ?`,
		[limit],
	)

	return rows.map(mapRowToQueueItem)
}

export async function getTelemetryQueueCount() {
	const database = await getDatabase()
	const row = await database.getFirstAsync<{ count: number }>(
		"SELECT COUNT(*) AS count FROM telemetry_queue WHERE sync_status IN ('pending', 'failed')",
	)

	return row?.count ?? 0
}

async function updateTelemetryQueueStatus(
	ids: string[],
	syncStatus: TelemetryQueueStatus,
	options: { errorMessage?: string | null; syncedAt?: number | null; incrementAttempts?: boolean } = {},
) {
	if (ids.length === 0) return

	const database = await getDatabase()
	const now = Date.now()
	const placeholders = ids.map(() => '?').join(', ')
	const sets = ['sync_status = ?']
	const params: Array<string | number | null> = [syncStatus]

	if (options.incrementAttempts) {
		sets.push('attempts = attempts + 1')
		sets.push('last_attempt_at = ?')
		params.push(now)
	}

	if (options.syncedAt !== undefined) {
		sets.push('synced_at = ?')
		params.push(options.syncedAt)
	}

	if (options.errorMessage !== undefined) {
		sets.push('error_message = ?')
		params.push(options.errorMessage)
	}

	const sql = `UPDATE telemetry_queue SET ${sets.join(', ')} WHERE id IN (${placeholders})`
	await database.runAsync(sql, [...params, ...ids])
}

export async function markTelemetryEventsSending(ids: string[]) {
	await updateTelemetryQueueStatus(ids, 'sending', { incrementAttempts: true, errorMessage: null })
}

export async function markTelemetryEventsSent(ids: string[]) {
	await updateTelemetryQueueStatus(ids, 'sent', {
		syncedAt: Date.now(),
		errorMessage: null,
	})
}

export async function markTelemetryEventsFailed(ids: string[], errorMessage?: string) {
	await updateTelemetryQueueStatus(ids, 'failed', {
		errorMessage: errorMessage ?? 'Sync failed',
	})
}

export async function pruneSentTelemetryEvents(olderThanMs = 7 * 24 * 60 * 60 * 1000) {
	const database = await getDatabase()
	const cutoff = Date.now() - olderThanMs

	await database.runAsync(
		`DELETE FROM telemetry_queue
		 WHERE sync_status = 'sent'
			 AND synced_at IS NOT NULL
			 AND synced_at < ?`,
		[cutoff],
	)
}

export async function clearTelemetryQueue() {
	const database = await getDatabase()
	await database.runAsync('DELETE FROM telemetry_queue')
}
