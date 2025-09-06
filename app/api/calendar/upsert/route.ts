import type { calendar_v3 } from 'googleapis'
import { NextRequest, NextResponse } from 'next/server'

import { adminAuth } from '@/lib/firebaseAdmin'
import { calendarClientFor } from '@/lib/google'

export type UpsertBody = {
	calendarId?: string
	studentId: string
	title: string
	description?: string
	startISO: string
	durationMins: number
	timeZone?: string
	recurrence?: string[] // если есть — создаём/апдейтим именно ЭТУ серию (НЕ трогаем старые серии)
	requestId?: string // идемпотентность на стороне календаря: studentId + requestId
}

// утилиты времени «до минуты» (UTC)
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

		// 3) Calendar client (с проверкой владельца refresh_token)
		const cal = await calendarClientFor(uid, email)

		// 4) Подготовка тела события
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

		// ====== A. ПОВТОРЯЮЩЕЕСЯ СОБЫТИЕ (СЕРИЯ) ======
		// ВАЖНО: Больше НЕ читаем/не пишем students/<id>.calendar.*
		// Это позволяет иметь несколько серий у одного ученика.
		if (isRecurring) {
			// Если есть requestId — пытаемся найти именно ЭТУ серию по studentId+requestId и апдейтить её,
			// иначе всегда создаём НОВУЮ серию.
			if (requestId) {
				const list = await cal.events.list({
					calendarId,
					maxResults: 50,
					privateExtendedProperty: [`studentId=${studentId}`, `requestId=${requestId}`],
					showDeleted: false,
				})
				const found = (list.data.items ?? [])[0]
				if (found?.id) {
					const res = await cal.events.update({
						calendarId,
						eventId: found.id,
						requestBody,
					})
					const eventId = res.data.id ?? found.id
					return NextResponse.json({ ok: true, eventId })
				}
			}

			// Не нашли по requestId — создаём новую серию
			const ins = await cal.events.insert({ calendarId, requestBody })
			const newEventId = ins.data.id ?? undefined
			if (!newEventId) {
				return NextResponse.json({ ok: false, error: 'No event id returned from Google Calendar' }, { status: 500 })
			}
			return NextResponse.json({ ok: true, eventId: newEventId })
		}

		// ====== B. ОДИНОЧНОЕ СОБЫТИЕ ======
		// Если есть requestId — идемпотентность по studentId+requestId (в окне ±12ч от старта)
		if (requestId) {
			const timeMin = new Date(start.getTime() - 12 * 60 * 60 * 1000).toISOString()
			const timeMax = new Date(start.getTime() + 12 * 60 * 60 * 1000).toISOString()
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
				const res = await cal.events.update({
					calendarId,
					eventId: found.id,
					requestBody,
				})
				const eventId = res.data.id ?? found.id
				return NextResponse.json({ ok: true, eventId })
			}
		} else {
			// Без requestId — лёгкий дедуп «та же минута + тот же студент»
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
				return NextResponse.json({ ok: true, eventId })
			}
		}

		// Создаём новое одиночное
		const ins = await cal.events.insert({ calendarId, requestBody })
		const newEventId = ins.data.id ?? undefined
		if (!newEventId) {
			return NextResponse.json({ ok: false, error: 'No event id returned from Google Calendar' }, { status: 500 })
		}
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
