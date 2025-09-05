import { NextRequest, NextResponse } from 'next/server'

import { adminAuth } from '@/lib/firebaseAdmin'
import { calendarClientFor } from '@/lib/google'

export type DeleteInstanceBody = {
	calendarId?: string
	recurringEventId: string // id серии
	instanceStartISO: string // начало нужной встречи (ISO)
}

export async function POST(req: NextRequest) {
	const idToken = req.headers.get('authorization')?.split('Bearer ')[1]
	if (!idToken) return NextResponse.json({ error: 'No ID token' }, { status: 401 })
	const { uid } = await adminAuth.verifyIdToken(idToken)

	const { calendarId = 'primary', recurringEventId, instanceStartISO } = (await req.json()) as DeleteInstanceBody

	const cal = await calendarClientFor(uid)

	// Окно поиска: от -5 минут до +24 часа
	const start = new Date(instanceStartISO)
	const timeMin = new Date(start.getTime() - 5 * 60 * 1000).toISOString()
	const timeMax = new Date(start.getTime() + 24 * 60 * 60 * 1000).toISOString()

	const res = await cal.events.instances({
		calendarId,
		eventId: recurringEventId,
		timeMin,
		timeMax,
		maxResults: 50,
		showDeleted: false,
	})

	const items = res.data.items ?? []

	// Сопоставляем по минуте, учитывая dateTime | date
	const target = items.find((e) => {
		const startStr = e.start?.dateTime ?? (e.start?.date ? `${e.start.date}T00:00:00.000Z` : undefined)
		if (!startStr) return false
		const a = new Date(startStr).toISOString().slice(0, 16)
		const b = new Date(instanceStartISO).toISOString().slice(0, 16)
		return a === b
	})

	if (!target?.id) {
		return NextResponse.json({ ok: false, error: 'instance not found' }, { status: 404 })
	}

	await cal.events.delete({ calendarId, eventId: target.id })
	return NextResponse.json({ ok: true })
}
