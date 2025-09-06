// app/api/calendar/delete-instance/route.ts
import { NextRequest, NextResponse } from 'next/server'

import { adminAuth } from '@/lib/firebaseAdmin'
import { calendarClientFor } from '@/lib/google'

export type DeleteInstanceBody = {
	calendarId?: string
	recurringEventId: string // id серии
	instanceStartISO: string // начало нужной встречи (ISO)
}

/**
 * POST /api/calendar/delete-instance
 * Удаляет конкретное повторяющееся событие (экземпляр серии) по дате начала.
 */
export async function POST(req: NextRequest) {
	try {
		// 1) ID token
		const idToken = req.headers.get('authorization')?.split('Bearer ')[1]
		if (!idToken) {
			return NextResponse.json({ error: 'No ID token' }, { status: 401 })
		}

		// 2) Верификация токена и получение uid/email
		const decoded = await adminAuth.verifyIdToken(idToken)
		const uid = decoded.uid
		const email = decoded.email || undefined

		// 3) Тело запроса
		const body: DeleteInstanceBody | null = await req.json()
		if (!body || !body.recurringEventId || !body.instanceStartISO) {
			return NextResponse.json({ error: 'Bad request: missing fields' }, { status: 400 })
		}
		const { calendarId = 'primary', recurringEventId, instanceStartISO } = body

		// 4) Клиент календаря с проверкой владельца токенов
		const cal = await calendarClientFor(uid, email)

		// 5) Находим конкретный инстанс в окне от -5 минут до +24 часов
		const start = new Date(instanceStartISO)
		if (Number.isNaN(start.getTime())) {
			return NextResponse.json({ error: 'Bad request: invalid instanceStartISO' }, { status: 400 })
		}
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

		// Сопоставляем по минуте
		const target = items.find((e) => {
			const startStr = e.start?.dateTime ?? (e.start?.date ? `${e.start.date}T00:00:00.000Z` : undefined)
			if (!startStr) return false
			const a = new Date(startStr).toISOString().slice(0, 16) // до минут
			const b = new Date(instanceStartISO).toISOString().slice(0, 16)
			return a === b
		})

		if (!target?.id) {
			return NextResponse.json({ ok: false, error: 'instance not found' }, { status: 404 })
		}

		await cal.events.delete({ calendarId, eventId: target.id })
		return NextResponse.json({ ok: true })
	} catch (e: unknown) {
		const message = e instanceof Error ? e.message : String(e)
		const code = (e as { code?: string })?.code

		// Несоответствие аккаунтов
		if (code === 'CALENDAR_ACCOUNT_MISMATCH' || message.startsWith('CALENDAR_ACCOUNT_MISMATCH')) {
			return NextResponse.json({ error: 'Calendar account mismatch' }, { status: 409 })
		}

		return NextResponse.json({ error: message || 'Unknown error' }, { status: 500 })
	}
}
