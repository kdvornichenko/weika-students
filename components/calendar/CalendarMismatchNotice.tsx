'use client'

import { useState } from 'react'

import { signInWithPopup, signOut } from 'firebase/auth'
import { AlertTriangle } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useCalendarConnection } from '@/hooks/useCalendarConnection'
import { auth, googleProvider } from '@/lib/firebase'

import ConnectCalendarButton from './ConnectCalendarButton'

export default function CalendarMismatchNotice() {
	const { mismatch, authEmail, calendarSummary } = useCalendarConnection()
	const [switching, setSwitching] = useState(false)

	if (!mismatch) return null

	const switchAccount = async () => {
		if (switching) return
		setSwitching(true)
		try {
			await signOut(auth)
			await signInWithPopup(auth, googleProvider)
		} finally {
			setSwitching(false)
		}
	}

	return (
		<Card className="mb-4 border-destructive/40 bg-destructive/5 p-4">
			<div className="flex items-start gap-3">
				<AlertTriangle className="mt-0.5 h-5 w-5 text-destructive" />
				<div className="space-y-2">
					<div className="font-medium text-destructive">Неподходящий аккаунт Google</div>
					<div className="text-sm text-muted-foreground">
						Вы авторизованы как <span className="font-medium text-foreground">{authEmail ?? '—'}</span>,<br />а
						подключённый календарь —{' '}
						<span className="font-medium text-foreground">{calendarSummary ? ` (${calendarSummary})` : ''}</span>.
					</div>

					<div className="flex flex-wrap gap-2 pt-1">
						<Button variant="destructive" size="sm" onClick={switchAccount} disabled={switching}>
							{switching ? 'Переключаю…' : 'Сменить аккаунт'}
						</Button>
						<ConnectCalendarButton
							size="sm"
							variant="outline"
							labelConnect="Подключить другой календарь"
							labelReconnect="Подключить другой календарь"
						/>
					</div>
				</div>
			</div>
		</Card>
	)
}
