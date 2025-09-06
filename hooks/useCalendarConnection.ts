'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

import { onAuthStateChanged } from 'firebase/auth'
import { doc, onSnapshot, type DocumentData, type FirestoreDataConverter } from 'firebase/firestore'

import { auth, db } from '@/lib/firebase'

type CalendarInfo = { id?: string; summary?: string; primary?: boolean }
type CalendarProvider = { email?: string; id?: string }
export type UserDoc = {
	calendarConnected?: boolean
	calendar?: CalendarInfo
	calendarProvider?: CalendarProvider
}

const userConverter: FirestoreDataConverter<UserDoc> = {
	toFirestore: (data: UserDoc): DocumentData => data as DocumentData,
	fromFirestore: (snap, options): UserDoc => snap.data(options) as UserDoc,
}

// Варианты результата подключения календаря
export type ConnectCalendarResult =
	| { started: false; blocked?: false }
	| { started: false; blocked: true; url: string }
	| { started: true; mode: 'popup'; status?: string }
	| { started: true; mode: 'redirect' }

export function useCalendarConnection(externalUid?: string | null) {
	// --- Auth ready ---
	const [authReady, setAuthReady] = useState(false)
	const [uid, setUid] = useState<string | null>(externalUid ?? null)
	const [authEmail, setAuthEmail] = useState<string | null>(null)

	useEffect(() => {
		if (externalUid !== undefined) {
			setUid(externalUid ?? null)
			setAuthEmail(auth.currentUser?.email ?? null)
			setAuthReady(true)
			return
		}
		return onAuthStateChanged(auth, (u) => {
			setUid(u?.uid ?? null)
			setAuthEmail(u?.email ?? null)
			setAuthReady(true)
		})
	}, [externalUid])

	// --- Profile ready (Firestore) ---
	const [profileReady, setProfileReady] = useState(false)
	const [calendarConnected, setCalendarConnected] = useState<boolean | null>(null)
	const [calendarId, setCalendarId] = useState<string | null>(null)
	const [calendarSummary, setCalendarSummary] = useState<string | null>(null)
	const [calendarProviderEmail, setCalendarProviderEmail] = useState<string | null>(null)

	useEffect(() => {
		setProfileReady(false)
		if (!uid) {
			setCalendarConnected(null)
			setCalendarId(null)
			setCalendarSummary(null)
			setCalendarProviderEmail(null)
			setProfileReady(true)
			return
		}
		const ref = doc(db, 'users', uid).withConverter(userConverter)
		const unsub = onSnapshot(
			ref,
			(snap) => {
				const data = snap.data()
				const c = data?.calendar
				const p = data?.calendarProvider
				setCalendarId(c?.id ?? null)
				setCalendarSummary(c?.summary ?? null)
				setCalendarProviderEmail(p?.email ?? null)
				setCalendarConnected(Boolean(data?.calendarConnected ?? c?.id))
				setProfileReady(true)
			},
			() => {
				setCalendarConnected(false)
				setProfileReady(true)
			}
		)
		return unsub
	}, [uid])

	const mismatch = useMemo(() => {
		if (!calendarConnected) return false
		if (!authEmail || !calendarProviderEmail) return false
		return authEmail.toLowerCase() !== calendarProviderEmail.toLowerCase()
	}, [calendarConnected, authEmail, calendarProviderEmail])

	const connectCalendar = useCallback(async (opts?: { popup?: boolean }): Promise<ConnectCalendarResult> => {
		const user = auth.currentUser
		if (!user || typeof window === 'undefined') return { started: false }

		const token = await user.getIdToken(true)
		const base = new URL('/api/google/auth', window.location.origin)
		base.searchParams.set('token', token)

		if (opts?.popup) {
			const u = new URL(base)
			u.searchParams.set('popup', '1')

			const w = window.open(u.toString(), 'gcal-auth', 'popup=1,width=520,height=640,noopener,noreferrer')
			if (!w) {
				return { started: false, blocked: true, url: base.toString() }
			}

			return await new Promise<ConnectCalendarResult>((resolve) => {
				const handler = (e: MessageEvent) => {
					if (e.origin !== window.location.origin) return
					if (e.data?.type === 'gcal-auth') {
						window.removeEventListener('message', handler)
						try {
							w.close()
						} catch {}
						resolve({ started: true, mode: 'popup', status: e.data?.status })
					}
				}
				window.addEventListener('message', handler)
			})
		}

		window.location.assign(base.toString())
		return { started: true, mode: 'redirect' }
	}, [])

	return {
		authReady,
		profileReady,
		uid,
		authEmail,
		calendarConnected,
		calendarId,
		calendarSummary,
		calendarProviderEmail,
		mismatch,
		connectCalendar,
	}
}
