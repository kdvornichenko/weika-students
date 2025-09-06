'use client'

import { useEffect, useState } from 'react'

import { usePathname, useSearchParams } from 'next/navigation'

import { Button } from '@/components/ui/button'
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
	DialogFooter,
} from '@/components/ui/dialog'
import { useCalendarConnection } from '@/hooks/useCalendarConnection'

export default function AutoPromptConnectCalendar() {
	const { authReady, profileReady, uid, calendarConnected, connectCalendar } = useCalendarConnection()
	const pathname = usePathname()
	const search = useSearchParams()
	const [open, setOpen] = useState(false)

	useEffect(() => {
		// ждём обе готовности
		if (!authReady || !profileReady) return
		if (!uid) return

		// календарь точно не подключён?
		if (calendarConnected !== false) return

		// не дёргаем внутри самого OAuth-флоу
		const isAuthFlow =
			pathname?.startsWith('/api/google/auth') ||
			pathname?.startsWith('/google/auth/callback') ||
			['connected', 'mismatch', 'error', 'no_refresh_token'].includes(search?.get('calendar') ?? '')
		if (isAuthFlow) return

		// показываем 1 раз за сессию на пользователя
		const key = `gcal_prompt_shown_${uid}`
		try {
			if (sessionStorage.getItem(key) === '1') return
			sessionStorage.setItem(key, '1')
		} catch {}

		setOpen(true)
	}, [authReady, profileReady, uid, calendarConnected, pathname, search])

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Хотите сразу подключить календарь?</DialogTitle>
					<DialogDescription>Это позволит создавать и обновлять уроки прямо в Google&nbsp;Календаре.</DialogDescription>
				</DialogHeader>
				<DialogFooter className="gap-2">
					<Button variant="secondary" onClick={() => setOpen(false)}>
						Не сейчас
					</Button>
					<Button
						onClick={() => {
							setOpen(false)
							void connectCalendar()
						}}
					>
						Подключить
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
