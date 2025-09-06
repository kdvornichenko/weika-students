'use client'

import { useEffect, useRef } from 'react'

import { usePathname, useSearchParams } from 'next/navigation'

import { useCalendarConnection } from '@/hooks/useCalendarConnection'

/**
 * Автозапуск подключения календаря — ТОЛЬКО если enabled=true.
 * Не триггерится на страницах OAuth/колбэка.
 */
export default function AutoConnectCalendar({ enabled = false, mode = 'redirect' as 'redirect' | 'popup' }) {
	const { uid, calendarConnected, connectCalendar } = useCalendarConnection()
	const pathname = usePathname()
	const search = useSearchParams()
	const fired = useRef(false)

	useEffect(() => {
		if (!enabled) return

		const isAuthFlow =
			pathname?.startsWith('/api/google/auth') ||
			pathname?.startsWith('/google/auth/callback') ||
			search?.get('calendar') === 'connected'

		if (!uid) return
		if (calendarConnected === null || calendarConnected) return
		if (isAuthFlow) return
		if (fired.current) return

		fired.current = true
		void connectCalendar()
	}, [enabled, uid, calendarConnected, connectCalendar, pathname, search, mode])

	return null
}
