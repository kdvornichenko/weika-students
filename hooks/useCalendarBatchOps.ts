'use client'

import { useMemo } from 'react'

import {
	listStudentEvents,
	updateInstance,
	deleteOneOccurrence,
	deleteEvent,
	upsertLesson,
} from '@/lib/calendar-client'
import { EditPayload, Row } from '@/types/student'

import { hasStart } from '../utils/calendar'

export function useCalendarBatchOps(opts: {
	studentId: string
	calendarId?: string
	setRows: React.Dispatch<React.SetStateAction<Row[]>>
}) {
	const { studentId, calendarId = 'primary', setRows } = opts

	// --- retry/throttle utils ---
	const utils = useMemo(() => {
		const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
		async function withRetry<T>(fn: () => Promise<T>, retries = 4, delay = 400): Promise<T> {
			try {
				return await fn()
			} catch (e: unknown) {
				const msg = e instanceof Error ? e.message : String(e)
				const isRate = msg.includes('Rate Limit') || msg.includes('429')
				if (retries > 0 && isRate) {
					await sleep(delay)
					return withRetry(fn, retries - 1, Math.min(delay * 2, 4000))
				}
				throw e
			}
		}
		async function pMap<T>(arr: T[], mapper: (item: T) => Promise<unknown>, concurrency = 3) {
			const q = [...arr]
			const workers = Array.from({ length: Math.min(concurrency, q.length) }, async () => {
				while (q.length) {
					const item = q.shift()!
					await mapper(item)
				}
			})
			await Promise.all(workers)
		}
		return { withRetry, pMap }
	}, [])

	// -------- optimistic UI update --------
	function optimisticUpdateFollowing(payload: EditPayload) {
		const { target, newStart, durationMins, applyToAll } = payload
		if (!target) return

		const newStartISO = newStart.toISOString()
		const newEndISO = new Date(newStart.getTime() + durationMins * 60_000).toISOString()

		setRows((prev) => {
			if (!applyToAll || !target.recurringEventId) {
				const next = prev.map((x) => (x.id === target.id ? { ...x, start: newStartISO, end: newEndISO } : x))
				next.sort((a, b) => (a.start ? +new Date(a.start) : 0) - (b.start ? +new Date(b.start) : 0))
				return next
			}

			const currentStart = target.start ? new Date(target.start) : null
			if (!currentStart) return prev

			const deltaMs = newStart.getTime() - currentStart.getTime()
			const threshold = currentStart.getTime()

			const next = prev.map((x) => {
				if (x.recurringEventId !== target.recurringEventId || !x.start) return x
				const t = new Date(x.start).getTime()
				if (t < threshold) return x
				const occStart = new Date(t + deltaMs)
				const occEnd = new Date(occStart.getTime() + durationMins * 60_000)
				return { ...x, start: occStart.toISOString(), end: occEnd.toISOString() }
			})
			next.sort((a, b) => (a.start ? +new Date(a.start) : 0) - (b.start ? +new Date(b.start) : 0))
			return next
		})
	}
	// -------------------------------------

	async function batchUpdateFollowing(payload: EditPayload) {
		const { target, newStart, durationMins, repeatWeekly } = payload
		if (!target) return

		// --- одиночное событие ---
		if (!target.recurringEventId) {
			if (repeatWeekly) {
				// 1) создаём новый повторяющийся урок
				await utils.withRetry(() =>
					upsertLesson({
						calendarId,
						studentId,
						title: target.summary || 'Урок',
						startISO: newStart.toISOString(),
						durationMins,
						timeZone: 'Europe/Stockholm',
						repeatWeekly: true, // RRULE соберётся на бэке
						requestId: `convert:${target.id}:${newStart.toISOString().slice(0, 16)}`, // чтобы не продублировать
					})
				)

				// 2) удаляем старый одиночный
				await utils.withRetry(() => deleteEvent(target.id, calendarId))
			} else {
				// просто апдейт одиночного
				await updateInstance({
					calendarId,
					eventId: target.id,
					startISO: newStart.toISOString(),
					durationMins,
					timeZone: 'Europe/Stockholm',
				})
			}
			return
		}

		// --- серия ---
		const currentStart = target.start ? new Date(target.start) : null
		if (!currentStart) {
			await updateInstance({
				calendarId,
				eventId: target.id,
				startISO: newStart.toISOString(),
				durationMins,
				timeZone: 'Europe/Stockholm',
			})
			return
		}

		const deltaMs = newStart.getTime() - currentStart.getTime()

		const { items } = await listStudentEvents(studentId, { calendarId, days: 365 })
		const futureSameSeries = items
			.filter(
				(r) =>
					r.recurringEventId === target.recurringEventId &&
					r.start &&
					new Date(r.start).getTime() >= currentStart.getTime()
			)
			.filter(hasStart)

		await utils.pMap(
			futureSameSeries,
			async (occ) => {
				const occStart = new Date(occ.start)
				if (Number.isNaN(occStart.getTime())) return
				const shifted = new Date(occStart.getTime() + deltaMs)
				await utils.withRetry(() =>
					updateInstance({
						calendarId,
						eventId: occ.id,
						startISO: shifted.toISOString(),
						durationMins,
						timeZone: 'Europe/Stockholm',
					})
				)
			},
			3
		)
	}

	async function batchDeleteFollowing(target: Row, applyToAll: boolean) {
		if (!target.recurringEventId) {
			await utils.withRetry(() => deleteEvent(target.id, calendarId))
			return
		}

		const currentStart = target.start ? new Date(target.start) : null
		if (!currentStart) return

		if (!applyToAll) {
			await utils.withRetry(() => deleteOneOccurrence(target.recurringEventId!, currentStart.toISOString(), calendarId))
			return
		}

		const { items } = await listStudentEvents(studentId, { calendarId, days: 365 })
		const futureSameSeries = items
			.filter(
				(r) =>
					r.recurringEventId === target.recurringEventId &&
					r.start &&
					new Date(r.start).getTime() >= currentStart.getTime()
			)
			.filter(hasStart)

		await utils.pMap(
			futureSameSeries,
			async (occ) => {
				await utils.withRetry(() =>
					deleteOneOccurrence(target.recurringEventId!, new Date(occ.start).toISOString(), calendarId)
				)
			},
			2
		)
	}

	function optimisticRemove(target: Row, applyToAll: boolean) {
		setRows((prev) => {
			if (!target.recurringEventId || !applyToAll || !target.start) {
				return prev.filter((x) => x.id !== target.id)
			}
			const startT = new Date(target.start).getTime()
			return prev.filter(
				(x) => !(x.recurringEventId === target.recurringEventId && x.start && new Date(x.start).getTime() >= startT)
			)
		})
	}

	return { batchUpdateFollowing, batchDeleteFollowing, optimisticRemove, optimisticUpdateFollowing }
}
