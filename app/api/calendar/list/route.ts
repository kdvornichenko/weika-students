import { NextRequest, NextResponse } from 'next/server'

import { adminAuth } from '@/lib/firebaseAdmin'
import { calendarClientFor } from '@/lib/google'

export async function GET(req: NextRequest) {
	const idToken = req.headers.get('authorization')?.split('Bearer ')[1]
	if (!idToken) return NextResponse.json({ error: 'No ID token' }, { status: 401 })
	const { uid } = await adminAuth.verifyIdToken(idToken)

	const cal = await calendarClientFor(uid)
	const { data } = await cal.calendarList.list()
	const calendars = (data.items ?? []).map((c) => ({ id: c.id, summary: c.summary, primary: c.primary }))
	return NextResponse.json({ calendars })
}
