import { google } from 'googleapis'
import { NextRequest, NextResponse } from 'next/server'

import { adminDb } from '@/lib/firebaseAdmin'

export async function GET(req: NextRequest) {
	const url = new URL(req.url)
	const code = url.searchParams.get('code')
	const state = url.searchParams.get('state') // uid:nonce
	const cookieNonce = req.cookies.get('gcal_csrf')?.value

	if (!code || !state || !cookieNonce) {
		return NextResponse.json({ error: 'Bad request' }, { status: 400 })
	}

	const [uid, nonce] = state.split(':')
	if (!uid || nonce !== cookieNonce) {
		return NextResponse.json({ error: 'CSRF/state mismatch' }, { status: 400 })
	}

	const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI } = process.env
	const oauth2 = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI)

	const { tokens } = await oauth2.getToken(code)
	if (!tokens.refresh_token) {
		return NextResponse.json({ error: 'No refresh_token (revoke previous grant and retry)' }, { status: 400 })
	}

	await adminDb.doc(`users/${uid}/integrations/googleCalendar`).set(
		{
			refresh_token: tokens.refresh_token,
			scope: tokens.scope,
			expiry_date: tokens.expiry_date,
		},
		{ merge: true }
	)
	await adminDb.doc(`users/${uid}`).set({ calendarConnected: true }, { merge: true })

	const res = NextResponse.redirect(new URL('/settings?calendar=connected', req.url))
	res.cookies.delete('gcal_csrf')
	return res
}
