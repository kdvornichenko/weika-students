// app/api/calendar/update-instance/route.ts
import { NextRequest, NextResponse } from 'next/server'

import { adminAuth } from '@/lib/firebaseAdmin'
import { calendarClientFor } from '@/lib/google'

export type UpdateInstanceBody = {
	calendarId?: string
	eventId: string
	startISO: string
	durationMins: number
	timeZone?: string
	/** Если передать — событие станет серией (RRULE и т.п.). */
	recurrence?: string[]
}

/**
 * POST /api/calendar/update-instance
 * body: { calendarId?, eventId, startISO, durationMins, timeZone?, recurrence? }
 *
 * Всегда используем events.patch — это частичное обновление и не затирает
 * extendedProperties (в т.ч. studentId). Если передан recurrence — событие
 * становится серией (Google корректно конвертирует одиночное в мастер серии).
 */
export async function POST(req: NextRequest) {
	try {
		// 1) Проверяем ID token
		const idToken = req.headers.get('authorization')?.split('Bearer ')[1]
		if (!idToken) {
			return NextResponse.json({ error: 'No ID token' }, { status: 401 })
		}

		// 2) Декодируем токен
		const decoded = await adminAuth.verifyIdToken(idToken)
		const uid = decoded.uid
		const email = decoded.email || undefined

		// 3) Читаем и валидируем тело
		const raw = (await req.json()) as UpdateInstanceBody | null
		if (!raw) {
			return NextResponse.json({ error: 'Bad request: empty body' }, { status: 400 })
		}

		const calendarId = raw.calendarId || 'primary'
		const eventId = (raw.eventId || '').trim()
		const startISO = (raw.startISO || '').trim()
		const tz = (raw.timeZone || 'Europe/Stockholm').trim()
		const recurrence = Array.isArray(raw.recurrence) ? raw.recurrence : undefined

		const dur = Number(raw.durationMins)
		const durationMins = Number.isFinite(dur) ? Math.max(1, Math.round(dur)) : NaN

		if (!eventId || !startISO || !Number.isFinite(durationMins)) {
			return NextResponse.json({ error: 'Missing or invalid fields: eventId/startISO/durationMins' }, { status: 400 })
		}

		const start = new Date(startISO)
		if (Number.isNaN(start.getTime())) {
			return NextResponse.json({ error: 'Bad request: invalid startISO' }, { status: 400 })
		}
		const end = new Date(start.getTime() + durationMins * 60_000)

		// 4) Клиент календаря с проверкой владельца refresh_token
		const cal = await calendarClientFor(uid, email)

		// 5) Частичное обновление (PATCH). Если есть recurrence — добавляем.
		const res = await cal.events.patch({
			calendarId,
			eventId,
			requestBody: {
				start: { dateTime: start.toISOString(), timeZone: tz },
				end: { dateTime: end.toISOString(), timeZone: tz },
				...(recurrence && recurrence.length > 0 ? { recurrence } : {}),
			},
		})

		return NextResponse.json({
			ok: true,
			event: {
				id: res.data.id,
				start: res.data.start,
				end: res.data.end,
				recurrence: res.data.recurrence,
			},
		})
	} catch (e: unknown) {
		const message = e instanceof Error ? e.message : String(e)
		const code = (e as { code?: string })?.code

		if (code === 'CALENDAR_ACCOUNT_MISMATCH' || message.startsWith('CALENDAR_ACCOUNT_MISMATCH')) {
			return NextResponse.json({ error: 'Calendar account mismatch' }, { status: 409 })
		}

		return NextResponse.json({ error: message || 'Unknown error' }, { status: 500 })
	}
}
