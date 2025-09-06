'use client'

import { useMemo } from 'react'

import { BadgeCheck, CalendarX, Loader2 } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { useCalendarConnection } from '@/hooks/useCalendarConnection'
import { cn } from '@/utils/utils'

import CalendarMismatchNotice from './CalendarMismatchNotice'
import ConnectCalendarButton from './ConnectCalendarButton'

export default function ConnectCalendar() {
	const { calendarConnected } = useCalendarConnection()

	const status: 'checking' | 'connected' | 'disconnected' = useMemo(() => {
		if (calendarConnected === null) return 'checking'
		return calendarConnected ? 'connected' : 'disconnected'
	}, [calendarConnected])

	return (
		<div className="flex flex-col gap-3">
			<CalendarMismatchNotice />

			<div className="inline-flex">
				<Badge
					role="status"
					aria-live="polite"
					className={cn(
						'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs',
						status === 'connected' && 'bg-blue-500 text-white dark:bg-blue-600'
					)}
				>
					{status === 'checking' && (
						<span className="inline-flex items-center gap-1.5">
							<Loader2 className="h-3.5 w-3.5 animate-spin" />
							Проверяю календарь…
						</span>
					)}

					{status === 'connected' && (
						<span className="inline-flex items-center gap-1.5">
							<BadgeCheck className="h-3.5 w-3.5" />
							Подключен
						</span>
					)}

					{status === 'disconnected' && (
						<span className="inline-flex items-center gap-1.5">
							<CalendarX className="h-3.5 w-3.5" />
							Календарь не подключен
						</span>
					)}
				</Badge>
			</div>

			<ConnectCalendarButton />
		</div>
	)
}
