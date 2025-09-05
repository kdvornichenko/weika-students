import { getApps, initializeApp, cert, applicationDefault } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'

const app = getApps().length
	? getApps()[0]
	: initializeApp({
			credential: process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON
				? cert(JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON))
				: applicationDefault(),
		})

export const adminAuth = getAuth(app)
export const adminDb = getFirestore(app)
