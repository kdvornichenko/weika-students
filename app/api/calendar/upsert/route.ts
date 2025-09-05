import type { FirestoreDataConverter, DocumentData } from 'firebase-admin/firestore'
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
}

type StudentCalendarMeta = {
	calendar?: {
		calendarId?: string
		calendarEventId?: string
	}
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

	const requestBody: calendar_v3.Schema$Event = {
		summary: title,
		description,
		start: { dateTime: start.toISOString(), timeZone },
		end: { dateTime: end.toISOString(), timeZone },
		recurrence: recurrence && recurrence.length ? recurrence : undefined,
		extendedProperties: { private: { studentId } },
	}

	const studentCalendarConverter: FirestoreDataConverter<StudentCalendarMeta> = {
		toFirestore: (data: StudentCalendarMeta): DocumentData => data,
		fromFirestore: (snap) => snap.data() as StudentCalendarMeta,
	}

	const sRef = adminDb.doc(`students/${studentId}`).withConverter(studentCalendarConverter)
	const sSnap = await sRef.get()
	const existingId = sSnap.data()?.calendar?.calendarEventId

	let eventId: string | undefined

	if (existingId) {
		const res = await cal.events.update({ calendarId, eventId: existingId, requestBody })
		eventId = res.data.id ?? undefined
	} else {
		const res = await cal.events.insert({ calendarId, requestBody })
		eventId = res.data.id ?? undefined
		if (eventId) {
			await sRef.set({ calendar: { calendarId, calendarEventId: eventId } }, { merge: true })
		}
	}

	if (!eventId) {
		return NextResponse.json({ ok: false, error: 'No event id returned from Google Calendar' }, { status: 500 })
	}

	return NextResponse.json({ ok: true, eventId })
}
