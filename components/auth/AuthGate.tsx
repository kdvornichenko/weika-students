'use client'

import { ReactNode, useEffect, useState } from 'react'

import { onAuthStateChanged, User } from 'firebase/auth'

import { auth } from '@/lib/firebase'

import { SignInButton } from './AuthButtons'

export default function AuthGate({ children }: { children: ReactNode }) {
	const [user, setUser] = useState<User | null>(null)
	const [ready, setReady] = useState(false)

	useEffect(
		() =>
			onAuthStateChanged(auth, (u) => {
				setUser(u)
				setReady(true)
			}),
		[]
	)
	if (!ready) return null
	if (!user)
		return (
			<div className="flex h-[60vh] items-center justify-center">
				<SignInButton />
			</div>
		)
	return <>{children}</>
}
