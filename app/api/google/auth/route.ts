// app/api/google/auth/route.ts
import { google } from 'googleapis'
import { NextRequest, NextResponse } from 'next/server'

import { adminAuth } from '@/lib/firebaseAdmin'

function rnd(n = 32) {
	const a = 'abcdefghijklmnopqrstuvwxyz0123456789'
	return Array.from({ length: n }, () => a[Math.floor(Math.random() * a.length)]).join('')
}

export async function GET(req: NextRequest) {
	// токен из Authorization: Bearer <...> ИЛИ из ?token=...
	const headerTok = req.headers.get('authorization')?.split('Bearer ')[1]
	const queryTok = req.nextUrl.searchParams.get('token') || undefined
	const cookieTok = req.cookies.get('fbid')?.value // опциональный запасной путь
	const idToken = headerTok || queryTok || cookieTok

	if (!idToken) {
		return NextResponse.json({ error: 'No ID token' }, { status: 401 })
	}

	// проверяем и достаём uid
	const decoded = await adminAuth.verifyIdToken(idToken)
	const uid = decoded.uid

	// генерим OAuth URL
	const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI } = process.env
	const oauth2 = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI)

	const nonce = rnd()
	const url = oauth2.generateAuthUrl({
		access_type: 'offline',
		prompt: 'consent',
		scope: ['https://www.googleapis.com/auth/calendar.events', 'https://www.googleapis.com/auth/calendar.readonly'],
		state: `${uid}:${nonce}`,
	})

	// ставим CSRF-cookie и редиректим на Google
	const res = NextResponse.redirect(url)
	res.cookies.set('gcal_csrf', nonce, {
		httpOnly: true,
		secure: true,
		sameSite: 'lax',
		path: '/',
		maxAge: 10 * 60,
	})
	return res
}
