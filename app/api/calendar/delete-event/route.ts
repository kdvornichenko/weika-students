import { NextRequest, NextResponse } from 'next/server'

import { adminAuth } from '@/lib/firebaseAdmin'
import { calendarClientFor } from '@/lib/google'

type DeleteEventBody = {
	eventId: string
	calendarId?: string
}

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

		// 3) Тело запроса
		const body: DeleteEventBody | null = await req.json()
		if (!body?.eventId) {
			return NextResponse.json({ error: 'Bad request: missing eventId' }, { status: 400 })
		}
		const { eventId, calendarId = 'primary' } = body

		// 4) Клиент календаря (жёсткая проверка владельца токена)
		const cal = await calendarClientFor(uid, email)

		// 5) Удаление события
		await cal.events.delete({ calendarId, eventId })

		return NextResponse.json({ ok: true })
	} catch (e: unknown) {
		const message = e instanceof Error ? e.message : String(e)
		const code = (e as { code?: string })?.code

		if (code === 'CALENDAR_ACCOUNT_MISMATCH' || message.startsWith('CALENDAR_ACCOUNT_MISMATCH')) {
			return NextResponse.json({ error: 'Calendar account mismatch' }, { status: 409 })
		}

		return NextResponse.json({ error: message || 'Unknown error' }, { status: 500 })
	}
}
