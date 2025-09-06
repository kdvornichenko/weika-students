import type { Metadata } from 'next'

import { SignOutButton } from '@/components/auth/AuthButtons'
import ConnectCalendar from '@/components/calendar/ConnectCalendar'

export const metadata: Metadata = {
	title: 'Настройки — Календарь',
}

export default function Page() {
	return (
		<div className="max-w-2xl">
			<div className="sticky top-0 z-10 mb-6 flex items-center justify-between backdrop-blur supports-[backdrop-filter]:bg-background/60">
				<h1 className="text-2xl font-semibold">Календарь</h1>
				<SignOutButton />
			</div>

			<ConnectCalendar />
		</div>
	)
}
