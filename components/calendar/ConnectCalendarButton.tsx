'use client'

import { useState } from 'react'

import { Button } from '@/components/ui/button'
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
	DialogFooter,
} from '@/components/ui/dialog'
import { useCalendarConnection, type ConnectCalendarResult } from '@/hooks/useCalendarConnection'
import { cn } from '@/utils/utils'

type Props = {
	className?: string
	size?: React.ComponentProps<typeof Button>['size']
	variant?: React.ComponentProps<typeof Button>['variant']
	labelConnect?: string
	labelReconnect?: string
}

export default function ConnectCalendarButton({
	className,
	size = 'sm',
	variant,
	labelConnect = 'Подключить календарь',
	labelReconnect = 'Переподключить',
}: Props) {
	const { uid, calendarConnected, connectCalendar } = useCalendarConnection()
	const [busy, setBusy] = useState(false)
	const [blocked, setBlocked] = useState<{ open: boolean; url?: string }>({ open: false })

	const onClick = async () => {
		if (!uid || busy) return
		setBusy(true)
		try {
			const res: ConnectCalendarResult = await connectCalendar({ popup: true })
			if (res.started === false && res.blocked && res.url) {
				setBlocked({ open: true, url: res.url })
			}
		} finally {
			setBusy(false)
		}
	}

	const v = variant ?? (calendarConnected ? 'outline' : 'default')
	const label = calendarConnected ? (busy ? 'Переподключаю…' : labelReconnect) : busy ? 'Подключаю…' : labelConnect

	return (
		<>
			<Button
				size={size}
				variant={v}
				className={cn(className)}
				onClick={onClick}
				disabled={!uid || busy}
				aria-busy={busy}
			>
				{label}
			</Button>

			<Dialog open={blocked.open} onOpenChange={(open) => setBlocked((b) => ({ ...b, open }))}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Не удалось открыть окно</DialogTitle>
						<DialogDescription>
							Похоже, браузер блокирует всплывающее окно для подключения Google Календаря. Можно продолжить подключение
							в текущем окне.
						</DialogDescription>
					</DialogHeader>
					<DialogFooter className="gap-2">
						<Button variant="secondary" onClick={() => setBlocked({ open: false, url: undefined })}>
							Закрыть
						</Button>
						<Button
							onClick={() => {
								if (blocked.url) window.location.assign(blocked.url)
							}}
						>
							Продолжить
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	)
}
