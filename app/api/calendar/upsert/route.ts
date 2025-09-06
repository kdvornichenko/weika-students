// app/api/calendar/upsert/route.ts
import type { FirestoreDataConverter, DocumentData } from 'firebase-admin/firestore'
import { FieldValue as AdminFieldValue } from 'firebase-admin/firestore'
import type { calendar_v3 } from 'googleapis'
import { NextRequest, NextResponse } from 'next/server'

import { adminAuth, adminDb } from '@/lib/firebaseAdmin'
import { calendarClientFor } from '@/lib/google'

export type UpsertBody = {
	calendarId?: string
	studentId: string
	title: string
	description?: string
	startISO: string
	durationMins: number
	timeZone?: string
	recurrence?: string[]
	/** Идемпотентный ключ от клиента (желателен) */
	requestId?: string
}

type StudentCalendarMeta = {
	calendar?: {
		calendarId?: string
		calendarEventId?: string
	}
}

const studentCalendarConverter: FirestoreDataConverter<StudentCalendarMeta> = {
	toFirestore: (data: StudentCalendarMeta): DocumentData => data,
	fromFirestore: (snap) => snap.data() as StudentCalendarMeta,
}

// до минут в UTC
function minuteKeyFromISO(iso: string) {
	return new Date(iso).toISOString().slice(0, 16) // YYYY-MM-DDTHH:MM
}
function toMinute(iso?: string) {
	if (!iso) return ''
	return new Date(iso).toISOString().slice(0, 16)
}

export async function POST(req: NextRequest) {
	try {
		// 1) Auth
		const idToken = req.headers.get('authorization')?.split('Bearer ')[1]
		if (!idToken) return NextResponse.json({ error: 'No ID token' }, { status: 401 })

		const decoded = await adminAuth.verifyIdToken(idToken)
		const uid = decoded.uid
		const email = decoded.email || undefined

		// 2) Body + validation
		const body = (await req.json()) as UpsertBody | null
		if (!body) return NextResponse.json({ error: 'Bad request: empty body' }, { status: 400 })

		const {
			calendarId: calendarIdRaw = 'primary',
			studentId: studentIdRaw,
			title: titleRaw,
			description,
			startISO: startISORaw,
			durationMins: durationMinsRaw,
			timeZone: tzRaw = 'Europe/Stockholm',
			recurrence: recurrenceRaw,
			requestId: requestIdRaw,
		} = body

		const calendarId = (calendarIdRaw || 'primary').trim()
		const studentId = (studentIdRaw || '').trim()
		const title = (titleRaw || '').trim()
		const startISO = (startISORaw || '').trim()
		const timeZone = (tzRaw || 'Europe/Stockholm').trim()
		const requestId = (requestIdRaw || '').trim() || undefined

		const dur = Number(durationMinsRaw)
		const durationMins = Number.isFinite(dur) ? Math.max(1, Math.round(dur)) : NaN

		if (!studentId || !title || !startISO || !Number.isFinite(durationMins)) {
			return NextResponse.json(
				{ error: 'Missing or invalid fields: studentId/title/startISO/durationMins' },
				{ status: 400 }
			)
		}

		const start = new Date(startISO)
		if (Number.isNaN(start.getTime())) {
			return NextResponse.json({ error: 'Bad request: invalid startISO' }, { status: 400 })
		}
		const end = new Date(start.getTime() + durationMins * 60_000)

		const recurrence =
			Array.isArray(recurrenceRaw) && recurrenceRaw.length
				? recurrenceRaw.filter((s) => typeof s === 'string' && s.trim().length > 0)
				: undefined
		const isRecurring = Boolean(recurrence && recurrence.length > 0)

		// 3) Calendar client
		const cal = await calendarClientFor(uid, email)

		// 4) Если есть requestId — быстрый идемпотентный путь через Firestore
		let reqRef: FirebaseFirestore.DocumentReference<FirebaseFirestore.DocumentData> | undefined = undefined
		if (requestId) {
			reqRef = adminDb.doc(`students/${studentId}/requests/${requestId}`)
			const snap = await reqRef.get()
			if (snap.exists) {
				const d = snap.data() as { status?: string; eventId?: string } | undefined
				if (d?.status === 'done' && d?.eventId) {
					return NextResponse.json({ ok: true, eventId: d.eventId })
				}
			} else {
				await reqRef.create({
					createdAt: AdminFieldValue.serverTimestamp(),
					status: 'pending',
				})
			}
		}

		// 5) Ищем уже созданное событие тем же requestId (если он есть) — для идемпотентности
		if (requestId) {
			const timeMin = new Date(start.getTime() - 12 * 60 * 60 * 1000).toISOString() // -12ч
			const timeMax = new Date(start.getTime() + 12 * 60 * 60 * 1000).toISOString() // +12ч
			const list = await cal.events.list({
				calendarId,
				timeMin,
				timeMax,
				singleEvents: true,
				orderBy: 'startTime',
				maxResults: 50,
				privateExtendedProperty: [`studentId=${studentId}`, `requestId=${requestId}`],
				showDeleted: false,
			})
			const found = (list.data.items ?? [])[0]
			if (found?.id) {
				if (reqRef) await reqRef.set({ status: 'done', eventId: found.id }, { merge: true })
				return NextResponse.json({ ok: true, eventId: found.id })
			}
		}

		// 6) Тело события
		const requestBody: calendar_v3.Schema$Event = {
			summary: title,
			description,
			start: { dateTime: start.toISOString(), timeZone },
			end: { dateTime: end.toISOString(), timeZone },
			recurrence,
			extendedProperties: {
				private: {
					studentId,
					...(requestId ? { requestId } : {}),
				},
			},
		}

		// 7) Если это СЕРИЯ
		if (isRecurring) {
			const sRef = adminDb.doc(`students/${studentId}`).withConverter(studentCalendarConverter)
			const sSnap = await sRef.get()
			const existing = sSnap.exists ? sSnap.data() : undefined
			const existingEventId = existing?.calendar?.calendarEventId
			const existingCalendarId = existing?.calendar?.calendarId

			let effectiveCalendarId = existingCalendarId || calendarId
			let eventId: string | undefined

			if (existingEventId) {
				if (existingCalendarId && calendarId && existingCalendarId !== calendarId) {
					const moved = await cal.events.move({
						calendarId: existingCalendarId,
						eventId: existingEventId,
						destination: calendarId,
					})
					const newId = moved.data.id ?? existingEventId
					eventId = newId
					effectiveCalendarId = calendarId
					await sRef.set({ calendar: { calendarId: effectiveCalendarId, calendarEventId: newId } }, { merge: true })
				}

				const res = await cal.events.update({
					calendarId: effectiveCalendarId,
					eventId: eventId ?? existingEventId,
					requestBody,
				})
				eventId = res.data.id ?? eventId ?? existingEventId
			} else {
				const res = await cal.events.insert({ calendarId, requestBody })
				const newId = res.data.id ?? undefined
				if (!newId) {
					return NextResponse.json({ ok: false, error: 'No event id returned from Google Calendar' }, { status: 500 })
				}
				eventId = newId
				await sRef.set({ calendar: { calendarId, calendarEventId: newId } }, { merge: true })
			}

			if (!eventId) {
				return NextResponse.json({ ok: false, error: 'No event id returned from Google Calendar' }, { status: 500 })
			}

			if (reqRef) await reqRef.set({ status: 'done', eventId }, { merge: true })
			return NextResponse.json({ ok: true, eventId })
		}

		// 8) ИНАЧЕ: одиночный урок
		if (!requestId) {
			const minuteKey = minuteKeyFromISO(startISO)
			const timeMin = new Date(start.getTime() - 60_000).toISOString()
			const timeMax = new Date(start.getTime() + 60_000).toISOString()
			const pre = await cal.events.list({
				calendarId,
				timeMin,
				timeMax,
				singleEvents: true,
				orderBy: 'startTime',
				maxResults: 10,
				privateExtendedProperty: [`studentId=${studentId}`],
				showDeleted: false,
			})
			const sameMinute = (pre.data.items ?? []).find((e) => {
				const sISO = e.start?.dateTime ?? (e.start?.date ? `${e.start.date}T00:00:00.000Z` : undefined)
				return toMinute(sISO) === minuteKey
			})
			if (sameMinute?.id) {
				const res = await cal.events.update({
					calendarId,
					eventId: sameMinute.id,
					requestBody,
				})
				const eventId = res.data.id ?? sameMinute.id
				if (reqRef) await reqRef.set({ status: 'done', eventId }, { merge: true })
				return NextResponse.json({ ok: true, eventId })
			}
		}

		const ins = await cal.events.insert({ calendarId, requestBody })
		const newEventId = ins.data.id ?? undefined
		if (!newEventId) {
			return NextResponse.json({ ok: false, error: 'No event id returned from Google Calendar' }, { status: 500 })
		}

		if (reqRef) await reqRef.set({ status: 'done', eventId: newEventId }, { merge: true })
		return NextResponse.json({ ok: true, eventId: newEventId })
	} catch (e: unknown) {
		const message = e instanceof Error ? e.message : String(e)
		const code = (e as { code?: string })?.code
		if (code === 'CALENDAR_ACCOUNT_MISMATCH' || message.startsWith('CALENDAR_ACCOUNT_MISMATCH')) {
			return NextResponse.json({ error: 'Calendar account mismatch' }, { status: 409 })
		}
		return NextResponse.json({ error: message || 'Unknown error' }, { status: 500 })
	}
}
