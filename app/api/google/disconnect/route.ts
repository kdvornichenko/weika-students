import { FieldValue } from 'firebase-admin/firestore'
import { google } from 'googleapis'
import { NextRequest, NextResponse } from 'next/server'

import { adminAuth, adminDb } from '@/lib/firebaseAdmin'

export async function POST(req: NextRequest) {
	try {
		// 1) ID token из Authorization: Bearer <...>
		const headerTok = req.headers.get('authorization')?.split('Bearer ')[1]
		if (!headerTok) {
			return NextResponse.json({ error: 'No ID token' }, { status: 401 })
		}

		// 2) Верифицируем и узнаём uid
		const decoded = await adminAuth.verifyIdToken(headerTok)
		const uid = decoded.uid

		// 3) Читаем refresh_token, если есть
		const integRef = adminDb.doc(`users/${uid}/integrations/googleCalendar`)
		const integSnap = await integRef.get()
		const data = integSnap.exists ? (integSnap.data() as { refresh_token?: string }) : undefined
		const refresh_token = data?.refresh_token

		// 4) Пытаемся ревокнуть токен (если есть)
		if (refresh_token) {
			const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI } = process.env
			const oauth2 = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI)
			try {
				await oauth2.revokeToken(refresh_token)
			} catch {
				// гугл может вернуть ошибку, если токен уже отозван — игнорируем
			}
		}

		// 5) Удаляем документ интеграции
		try {
			await integRef.delete()
		} catch {
			// игнорируем, если документа нет
		}

		// 6) Чистим “публичные” поля в users/{uid}
		const userRef = adminDb.doc(`users/${uid}`)
		await userRef.set(
			{
				calendarConnected: false,
				calendar: FieldValue.delete(),
				calendarProvider: FieldValue.delete(),
			},
			{ merge: true }
		)

		return NextResponse.json({ ok: true })
	} catch (e: unknown) {
		const message = e instanceof Error ? e.message : 'Unknown error'
		return NextResponse.json({ error: message }, { status: 500 })
	}
}
