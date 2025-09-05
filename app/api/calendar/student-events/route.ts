import { NextRequest, NextResponse } from 'next/server'

import { adminAuth } from '@/lib/firebaseAdmin'
import { calendarClientFor } from '@/lib/google'

/**
 * GET /api/calendar/student-events?studentId=...&calendarId=primary&days=90
 * Возвращает будущие занятия ученика (instances),
 * фильтруя по extendedProperties.private.studentId.
 */
export async function GET(req: NextRequest) {
	const idToken = req.headers.get('authorization')?.split('Bearer ')[1]
	if (!idToken) return NextResponse.json({ error: 'No ID token' }, { status: 401 })
	const { uid } = await adminAuth.verifyIdToken(idToken)

	const url = new URL(req.url)
	const studentId = url.searchParams.get('studentId')
	const calendarId = url.searchParams.get('calendarId') || 'primary'
	const days = Number(url.searchParams.get('days') || 180)

	if (!studentId) {
		return NextResponse.json({ error: 'Missing studentId' }, { status: 400 })
	}

	const cal = await calendarClientFor(uid)

	const now = new Date()
	const timeMin = now.toISOString()
	const timeMax = new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString()

	// singleEvents=true разворачивает повторения в отдельные экземпляры
	const { data } = await cal.events.list({
		calendarId,
		timeMin,
		timeMax,
		singleEvents: true,
		orderBy: 'startTime',
		privateExtendedProperty: [`studentId=${studentId}`],
		maxResults: 2500,
		showDeleted: false,
	})

	// Вернём компактный список
	const items = (data.items || []).map((e) => ({
		id: e.id!,
		recurringEventId: e.recurringEventId,
		summary: e.summary,
		start: e.start?.dateTime || (e.start?.date ? `${e.start.date}T00:00:00.000Z` : undefined),
		end: e.end?.dateTime || (e.end?.date ? `${e.end.date}T00:00:00.000Z` : undefined),
	}))

	return NextResponse.json({ items })
}
