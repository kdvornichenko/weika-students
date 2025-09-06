import { google } from 'googleapis'
import { NextRequest, NextResponse } from 'next/server'

import { adminAuth, adminDb } from '@/lib/firebaseAdmin'

function popupCloseHTML(payload: Record<string, unknown>) {
	const json = JSON.stringify(payload)
	return `<!doctype html><html><head><meta charset="utf-8"><title>Google Calendar</title></head>
<body style="font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;">
<script>
  (function () {
    try { if (window.opener) window.opener.postMessage(${json}, '*'); } catch (e) {}
    try { window.close(); } catch (e) {}
    setTimeout(function(){ /* no text for popup */ }, 50);
  })();
</script>
</body></html>`
}

export async function GET(req: NextRequest) {
	const url = new URL(req.url)
	const code = url.searchParams.get('code')
	const state = url.searchParams.get('state') // uid:nonce:mode
	const cookieNonce = req.cookies.get('gcal_csrf')?.value

	if (!code || !state || !cookieNonce) {
		return NextResponse.json({ error: 'Bad request' }, { status: 400 })
	}

	const [uid, nonce, mode] = state.split(':')
	if (!uid || nonce !== cookieNonce) {
		return NextResponse.json({ error: 'CSRF/state mismatch' }, { status: 400 })
	}

	const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI } = process.env
	const oauth2Client = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI)

	try {
		const { tokens } = await oauth2Client.getToken(code)
		if (!tokens.refresh_token) {
			if (mode === 'p') {
				const html = popupCloseHTML({ type: 'gcal-auth', status: 'error', reason: 'no_refresh_token' })
				return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
			}
			return NextResponse.redirect(new URL('/settings?calendar=no_refresh_token', req.url))
		}
		oauth2Client.setCredentials(tokens)

		// владелец токена
		const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client })
		const me = await oauth2.userinfo.get()
		const providerEmail = me.data.email ?? ''
		const providerId = me.data.id ?? ''

		// сверка с Firebase
		const fbUser = await adminAuth.getUser(uid)
		const firebaseEmail = fbUser.email || ''
		if (firebaseEmail && providerEmail && firebaseEmail.toLowerCase() !== providerEmail.toLowerCase()) {
			if (mode === 'p') {
				const html = popupCloseHTML({ type: 'gcal-auth', status: 'mismatch', email: providerEmail })
				const res = new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
				res.cookies.delete('gcal_csrf')
				return res
			}
			const res = NextResponse.redirect(new URL('/settings?calendar=mismatch', req.url))
			res.cookies.delete('gcal_csrf')
			return res
		}

		// primary календарь
		const calendar = google.calendar({ version: 'v3', auth: oauth2Client })
		const primary = await calendar.calendarList.get({ calendarId: 'primary' })
		const primaryEntry = primary.data
		const primaryId = primaryEntry.id ?? ''
		const primarySummary = primaryEntry.summary ?? ''
		const isPrimary = Boolean(primaryEntry.primary)

		// запись интеграции
		await adminDb.doc(`users/${uid}/integrations/googleCalendar`).set(
			{
				refresh_token: tokens.refresh_token,
				scope: tokens.scope,
				expiry_date: tokens.expiry_date,
				provider: { email: providerEmail, id: providerId },
				calendarDefault: { id: primaryId, summary: primarySummary, primary: isPrimary },
			},
			{ merge: true }
		)
		await adminDb.doc(`users/${uid}`).set(
			{
				calendarConnected: true,
				calendarProvider: { email: providerEmail, id: providerId },
				calendar: { id: primaryId, summary: primarySummary, primary: isPrimary },
			},
			{ merge: true }
		)

		if (mode === 'p') {
			const html = popupCloseHTML({ type: 'gcal-auth', status: 'ok' })
			const res = new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
			res.cookies.delete('gcal_csrf')
			return res
		}

		// для 'b' (новая вкладка) и 'w' (текущая) — просто редиректим
		const res = NextResponse.redirect(new URL('/settings?calendar=connected', req.url))
		res.cookies.delete('gcal_csrf')
		return res
	} catch (err: unknown) {
		const message = err instanceof Error ? err.message : String(err)
		if (mode === 'p') {
			const html = popupCloseHTML({
				type: 'gcal-auth',
				status: 'error',
				reason: 'exception',
				message,
			})
			return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
		}
		return NextResponse.redirect(new URL('/settings?calendar=error', req.url))
	}
}
