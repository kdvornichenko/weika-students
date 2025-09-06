// lib/calendar-client.ts
import { auth } from '@/lib/firebase'

// -------------------- utils для списка --------------------

export async function listStudentEvents(studentId: string, params?: { calendarId?: string; days?: number }) {
	const t = await auth.currentUser?.getIdToken()
	const url = new URL('/api/calendar/student-events', window.location.origin)
	url.searchParams.set('studentId', studentId)
	if (params?.calendarId) url.searchParams.set('calendarId', params.calendarId)
	if (params?.days) url.searchParams.set('days', String(params.days))
	const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${t}` } })
	if (!res.ok) throw new Error(await res.text())
	return res.json() as Promise<{
		items: { id: string; recurringEventId?: string; summary?: string; start?: string; end?: string }[]
	}>
}

export async function listStudentEventsRange(
	studentId: string,
	params: { calendarId?: string; fromISO: string; toISO: string }
) {
	const t = await auth.currentUser?.getIdToken()
	const url = new URL('/api/calendar/student-events', window.location.origin)
	url.searchParams.set('studentId', studentId)
	url.searchParams.set('from', params.fromISO)
	url.searchParams.set('to', params.toISO)
	if (params.calendarId) url.searchParams.set('calendarId', params.calendarId)
	const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${t}` } })
	if (!res.ok) throw new Error(await res.text())
	return res.json() as Promise<{
		items: { id: string; recurringEventId?: string; summary?: string; start?: string; end?: string }[]
	}>
}

// -------------------- правки: жёсткая идемпотентность upsert --------------------

function minuteKeyFromISO(iso: string) {
	return new Date(iso).toISOString().slice(0, 16) // YYYY-MM-DDTHH:MM
}

const upsertInFlight = new Map<string, Promise<{ ok: true; eventId: string }>>()
const recentlyCompleted = new Map<string, { ok: true; eventId: string }>()

function makeUpsertKey(args: { calendarId?: string; studentId: string; startISO: string }) {
	const cal = (args.calendarId || 'primary').trim()
	const mk = minuteKeyFromISO(args.startISO)
	return `${cal}|${args.studentId}|${mk}`
}

export async function updateInstance(payload: {
	calendarId?: string
	eventId: string
	startISO: string
	durationMins: number
	timeZone?: string
	/** При передаче — событие станет серией (RRULE и т.п.). */
	recurrence?: string[]
}) {
	const t = await auth.currentUser?.getIdToken()
	const res = await fetch('/api/calendar/update-instance', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
		body: JSON.stringify(payload),
	})
	if (!res.ok) throw new Error(await res.text())
	return res.json()
}

export async function deleteOneOccurrence(recurringEventId: string, instanceStartISO: string, calendarId = 'primary') {
	const t = await auth.currentUser?.getIdToken()
	const res = await fetch('/api/calendar/delete-instance', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
		body: JSON.stringify({ recurringEventId, instanceStartISO, calendarId }),
	})
	if (!res.ok) throw new Error(await res.text())
	return res.json()
}

function formatRRuleUntilOneYearFrom(startISO: string): string {
	const start = new Date(startISO)
	const until = new Date(start.getTime())
	until.setUTCFullYear(until.getUTCFullYear() + 1)
	const pad = (n: number) => String(n).padStart(2, '0')
	const YYYY = until.getUTCFullYear()
	const MM = pad(until.getUTCMonth() + 1)
	const DD = pad(until.getUTCDate())
	const hh = pad(until.getUTCHours())
	const mm = pad(until.getUTCMinutes())
	const ss = pad(until.getUTCSeconds())
	return `${YYYY}${MM}${DD}T${hh}${mm}${ss}Z`
}

export async function upsertLesson(payload: {
	calendarId?: string
	studentId: string
	title: string
	description?: string
	startISO: string
	durationMins: number
	timeZone?: string
	repeatWeekly?: boolean
	/** Можно передать готовый RRULE, иначе соберётся из repeatWeekly */
	recurrence?: string[]
	requestId?: string
}) {
	const key = makeUpsertKey({
		calendarId: payload.calendarId,
		studentId: payload.studentId,
		startISO: payload.startISO,
	})

	const recent = recentlyCompleted.get(key)
	if (recent) return recent

	const inflight = upsertInFlight.get(key)
	if (inflight) return inflight

	const t = await auth.currentUser?.getIdToken()

	let recurrence: string[] | undefined = payload.recurrence
	if (!recurrence && payload.repeatWeekly) {
		const untilStr = formatRRuleUntilOneYearFrom(payload.startISO)
		recurrence = [`RRULE:FREQ=WEEKLY;UNTIL=${untilStr}`]
	}

	const requestId = payload.requestId || `slot:${key}`

	const body = {
		calendarId: payload.calendarId,
		studentId: payload.studentId,
		title: payload.title,
		description: payload.description,
		startISO: payload.startISO,
		durationMins: payload.durationMins,
		timeZone: payload.timeZone ?? 'Europe/Stockholm',
		recurrence,
		requestId,
	}

	const p = (async () => {
		const res = await fetch('/api/calendar/upsert', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
			body: JSON.stringify(body),
		})
		if (!res.ok) throw new Error(await res.text())
		const data = (await res.json()) as { ok: true; eventId: string }
		recentlyCompleted.set(key, data)
		setTimeout(() => {
			recentlyCompleted.delete(key)
		}, 3000)
		return data
	})()

	upsertInFlight.set(key, p)
	try {
		return await p
	} finally {
		setTimeout(() => {
			upsertInFlight.delete(key)
		}, 250)
	}
}

export async function deleteEvent(eventId: string, calendarId = 'primary') {
	const t = await auth.currentUser?.getIdToken()
	const res = await fetch('/api/calendar/delete-event', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
		body: JSON.stringify({ eventId, calendarId }),
	})
	if (!res.ok) throw new Error(await res.text())
	return res.json() as Promise<{ ok: true }>
}

// -------------------- NEW: массовое удаление всех уроков ученика --------------------

function sleep(ms: number) {
	return new Promise((r) => setTimeout(r, ms))
}

async function withRetry<T>(fn: () => Promise<T>, retries = 4, delay = 400): Promise<T> {
	try {
		return await fn()
	} catch (e) {
		const err = e instanceof Error ? e : new Error(String(e))
		const msg = err.message

		if (/not\s*found/i.test(msg) || /404/.test(msg)) {
			return undefined as T
		}
		const isRate = msg.includes('Rate Limit') || msg.includes('429')
		if (retries > 0 && isRate) {
			await sleep(delay)
			return withRetry(fn, retries - 1, Math.min(delay * 2, 4000))
		}
		throw err
	}
}

export async function deleteAllLessonsForStudent(
	studentId: string,
	opts?: { calendarId?: string; from?: Date; to?: Date }
) {
	const calendarId = opts?.calendarId || 'primary'
	const from = opts?.from || new Date(Date.now() - 1000 * 60 * 60 * 24 * 365 * 5)
	const to = opts?.to || new Date(Date.now() + 1000 * 60 * 60 * 24 * 365 * 5)

	const { items } = await listStudentEventsRange(studentId, {
		calendarId,
		fromISO: from.toISOString(),
		toISO: to.toISOString(),
	})

	const masterIds = new Set<string>()
	const singleIds = new Set<string>()
	for (const it of items) {
		if (it.recurringEventId) {
			masterIds.add(it.recurringEventId)
		} else if (it.id) {
			singleIds.add(it.id)
		}
	}

	const masters = Array.from(masterIds)
	await Promise.all(masters.map((id) => withRetry(() => deleteEvent(id, calendarId))))

	const singles = Array.from(singleIds)
	await Promise.all(singles.map((id) => withRetry(() => deleteEvent(id, calendarId))))

	return { deletedSeries: masters.length, deletedSingles: singles.length }
}
