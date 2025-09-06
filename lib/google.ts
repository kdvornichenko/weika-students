import { google, calendar_v3 } from 'googleapis'

import { adminDb } from '@/lib/firebaseAdmin'

type IntegrationDoc = {
	refresh_token: string
	provider?: { email?: string; id?: string }
}

// Кастомный тип ошибки с кодом
class CalendarAccountMismatchError extends Error {
	code: 'CALENDAR_ACCOUNT_MISMATCH'
	constructor(providerEmail: string, expectedEmail: string) {
		super(`CALENDAR_ACCOUNT_MISMATCH: token owner ${providerEmail} != auth ${expectedEmail}`)
		this.code = 'CALENDAR_ACCOUNT_MISMATCH'
	}
}

export async function calendarClientFor(uid: string, expectedEmail?: string): Promise<calendar_v3.Calendar> {
	const snap = await adminDb.doc(`users/${uid}/integrations/googleCalendar`).get()
	if (!snap.exists) throw new Error('Google Calendar not connected')

	const data = snap.data() as IntegrationDoc
	const refresh_token = data?.refresh_token
	if (!refresh_token) throw new Error('Missing refresh_token')

	// если верифицированный email из Firebase не совпадает с владельцем токена — блокируем
	const providerEmail = (data?.provider?.email ?? '').toLowerCase()
	const expect = (expectedEmail ?? '').toLowerCase()
	if (expectedEmail && providerEmail && providerEmail !== expect) {
		throw new CalendarAccountMismatchError(providerEmail, expect)
	}

	const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI } = process.env
	const oauth2 = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI)
	oauth2.setCredentials({ refresh_token })

	return google.calendar({ version: 'v3', auth: oauth2 }) as calendar_v3.Calendar
}
