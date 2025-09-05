import { NextRequest, NextResponse } from 'next/server'

import { adminAuth } from '@/lib/firebaseAdmin'
import { calendarClientFor } from '@/lib/google'

/**
 * POST /api/calendar/update-instance
 * body: { calendarId?, eventId, startISO, durationMins, timeZone? }
 * Обновляет конкретный экземпляр события (создаст исключение в серии).
 */
export async function POST(req: NextRequest) {
	const idToken = req.headers.get('authorization')?.split('Bearer ')[1]
	if (!idToken) return NextResponse.json({ error: 'No ID token' }, { status: 401 })
	const { uid } = await adminAuth.verifyIdToken(idToken)

	const { calendarId = 'primary', eventId, startISO, durationMins, timeZone = 'Europe/Stockholm' } = await req.json()

	if (!eventId || !startISO || !durationMins) {
		return NextResponse.json({ error: 'Missing eventId/startISO/durationMins' }, { status: 400 })
	}

	const cal = await calendarClientFor(uid)

	const start = new Date(startISO)
	const end = new Date(start.getTime() + Number(durationMins) * 60000)

	const res = await cal.events.patch({
		calendarId,
		eventId,
		requestBody: {
			start: { dateTime: start.toISOString(), timeZone },
			end: { dateTime: end.toISOString(), timeZone },
		},
	})

	return NextResponse.json({ ok: true, event: { id: res.data.id, start: res.data.start, end: res.data.end } })
}
