'use client'

import { JSX, useState } from 'react'

import { signInWithPopup, signOut } from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'

import { Button } from '@/components/ui/button'
import { useCalendarConnection, type UserDoc } from '@/hooks/useCalendarConnection'
import { auth, db, googleProvider } from '@/lib/firebase'

export function SignInButton(): JSX.Element {
	const [busy, setBusy] = useState(false)
	const { connectCalendar } = useCalendarConnection()

	return (
		<Button
			onClick={async () => {
				if (busy) return
				setBusy(true)
				try {
					// 1) Логинимся через попап Firebase
					await signInWithPopup(auth, googleProvider)

					// 2) Проверяем, подключён ли календарь
					const u = auth.currentUser
					if (u) {
						const snap = await getDoc(doc(db, 'users', u.uid))
						const data = snap.data() as UserDoc | undefined
						const isConnected = Boolean(data?.calendarConnected) || Boolean(data?.calendar?.id)

						// 3) Если не подключён — сразу открываем попап подключения календаря
						if (!isConnected) {
							await connectCalendar({ popup: true })
						}
					}
				} finally {
					setBusy(false)
				}
			}}
			disabled={busy}
		>
			{busy ? 'Вхожу…' : 'Войти через Google'}
		</Button>
	)
}

export function SignOutButton(): JSX.Element {
	const [busy, setBusy] = useState(false)

	const disconnect = async (): Promise<void> => {
		const t = await auth.currentUser?.getIdToken()
		if (!t) return
		try {
			await fetch('/api/google/disconnect', {
				method: 'POST',
				headers: { Authorization: `Bearer ${t}` },
			})
		} catch {
			// игнорируем — дальше выйдем из Firebase
		}
	}

	return (
		<Button
			variant="outline"
			onClick={async () => {
				if (busy) return
				setBusy(true)
				try {
					await disconnect()
				} finally {
					await signOut(auth)
					setBusy(false)
				}
			}}
			disabled={busy}
		>
			{busy ? 'Выхожу…' : 'Выйти'}
		</Button>
	)
}
