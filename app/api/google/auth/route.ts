// app/api/google/auth/route.ts
import { google } from 'googleapis'
import { NextRequest, NextResponse } from 'next/server'

import { adminAuth } from '@/lib/firebaseAdmin'

function rnd(n = 32) {
	const a = 'abcdefghijklmnopqrstuvwxyz0123456789'
	return Array.from({ length: n }, () => a[Math.floor(Math.random() * a.length)]).join('')
}

export async function GET(req: NextRequest) {
	// ID токен: Authorization | ?token | cookie
	const headerTok = req.headers.get('authorization')?.split('Bearer ')[1]
	const queryTok = req.nextUrl.searchParams.get('token') || undefined
	const cookieTok = req.cookies.get('fbid')?.value
	const idToken = headerTok || queryTok || cookieTok

	if (!idToken) {
		return NextResponse.json({ error: 'No ID token' }, { status: 401 })
	}

	// Проверяем токен Firebase
	const decoded = await adminAuth.verifyIdToken(idToken)
	const uid = decoded.uid
	const loginHint = decoded.email || undefined

	// Режим: если пришёл ?popup=1 — значит открываем из попапа
	const popup = req.nextUrl.searchParams.get('popup') === '1'
	const mode = popup ? 'p' : 'w'

	// Подготавливаем OAuth2-клиент
	const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI } = process.env
	const oauth2 = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI)

	const nonce = rnd()

	// Генерируем ссылку для подключения Google Calendar
	const url = oauth2.generateAuthUrl({
		access_type: 'offline',
		prompt: 'consent',
		include_granted_scopes: true,
		scope: [
			'https://www.googleapis.com/auth/calendar.events',
			'https://www.googleapis.com/auth/calendar.readonly',
			'openid',
			'email',
			'profile',
		],
		state: `${uid}:${nonce}:${mode}`, // прокидываем 'p' | 'w'
		login_hint: loginHint,
	})

	// Ставим cookie для CSRF и редиректим на Google
	const res = NextResponse.redirect(url)
	res.cookies.set('gcal_csrf', nonce, {
		httpOnly: true,
		secure: true,
		sameSite: 'lax',
		path: '/',
		maxAge: 10 * 60, // 10 минут
	})

	return res
}
