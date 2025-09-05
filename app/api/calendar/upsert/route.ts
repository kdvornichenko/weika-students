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
}

export async function POST(req: NextRequest) {
	const idToken = req.headers.get('authorization')?.split('Bearer ')[1]
	if (!idToken) return NextResponse.json({ error: 'No ID token' }, { status: 401 })
	const { uid } = await adminAuth.verifyIdToken(idToken)

	const {
		calendarId = 'primary',
		studentId,
		title,
		description,
		startISO,
		durationMins,
		timeZone = 'Europe/Stockholm',
		recurrence,
	} = (await req.json()) as UpsertBody

	const cal = await calendarClientFor(uid)

	const start = new Date(startISO)
	const end = new Date(start.getTime() + Number(durationMins) * 60000)

	const requestBody = {
		summary: title,
		description,
		start: { dateTime: start.toISOString(), timeZone },
		end: { dateTime: end.toISOString(), timeZone },
		recurrence: recurrence && recurrence.length ? recurrence : undefined,
		extendedProperties: { private: { studentId } },
	}

	const sRef = adminDb.doc(`students/${studentId}`)
	const sSnap = await sRef.get()
	const existingId = (sSnap.data() as any)?.calendar?.calendarEventId as string | undefined

	let eventId: string
	if (existingId) {
		const res = await cal.events.update({ calendarId, eventId: existingId, requestBody })
		eventId = res.data.id!
	} else {
		const res = await cal.events.insert({ calendarId, requestBody })
		eventId = res.data.id!
		await sRef.set({ calendar: { calendarId, calendarEventId: eventId } }, { merge: true })
	}

	return NextResponse.json({ ok: true, eventId })
}
