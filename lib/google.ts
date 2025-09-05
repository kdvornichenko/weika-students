import { google, calendar_v3 } from 'googleapis'

import { adminDb } from '@/lib/firebaseAdmin'

export async function calendarClientFor(uid: string): Promise<calendar_v3.Calendar> {
	const snap = await adminDb.doc(`users/${uid}/integrations/googleCalendar`).get()
	if (!snap.exists) throw new Error('Google Calendar not connected')

	const { refresh_token } = snap.data() as { refresh_token: string }
	const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI } = process.env

	const oauth2 = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI)
	oauth2.setCredentials({ refresh_token })

	return google.calendar({ version: 'v3', auth: oauth2 }) as calendar_v3.Calendar
}
