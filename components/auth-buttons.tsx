'use client'

import { signInWithPopup, signOut } from 'firebase/auth'

import { Button } from '@/components/ui/button'
import { auth, googleProvider } from '@/lib/firebase'

export function SignInButton() {
	return <Button onClick={() => signInWithPopup(auth, googleProvider)}>Войти через Google</Button>
}

export function SignOutButton() {
	return (
		<Button variant="outline" onClick={() => signOut(auth)}>
			Выйти
		</Button>
	)
}
