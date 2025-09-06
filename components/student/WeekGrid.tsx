'use client'

import { addDays, isSameDay, parseISO, format } from 'date-fns'
import { ru } from 'date-fns/locale'

import { Row } from '@/types/student'

export default function WeekGrid({
	rows,
	start,
	end,
	onEventClick,
}: {
	rows: Row[]
	start: Date
	end: Date
	onEventClick: (r: Row) => void
}) {
	const days: Date[] = []
	let d = new Date(start)
	while (d <= end) {
		days.push(new Date(d))
		d = addDays(d, 1)
	}

	const eventsByDay = days.map((day) => {
		const events = rows
			.map((r) => ({
				...r,
				startDate: r.start ? parseISO(r.start) : null,
				endDate: r.end ? parseISO(r.end) : null,
			}))
			.filter((r) => r.startDate && isSameDay(r.startDate, day))
			.sort((a, b) => a.startDate!.getTime() - b.startDate!.getTime())
		return { day, events }
	})

	return (
		<div className="grid grid-cols-1 gap-3 md:grid-cols-7">
			{eventsByDay.map(({ day, events }) => (
				<div key={day.toISOString()} className="rounded-lg border p-3">
					<div className="mb-2 text-sm font-medium">{format(day, 'EEEE, d MMM', { locale: ru })}</div>
					<div className="space-y-2">
						{events.length === 0 ? (
							<div className="text-sm text-muted-foreground">Нет занятий</div>
						) : (
							events.map((e) => {
								const s = e.start ? new Date(e.start) : null
								const en = e.end ? new Date(e.end) : null
								const label = s && en ? `${format(s, 'HH:mm')} — ${format(en, 'HH:mm')}` : '—'
								return (
									<button
										type="button"
										key={e.id}
										onClick={() => onEventClick(e)}
										className="w-full rounded-md border p-2 text-left hover:bg-accent"
									>
										<div className="text-sm font-medium">{e.summary || 'Урок'}</div>
										<div className="text-xs text-muted-foreground">{label}</div>
										{e.recurringEventId && (
											<div className="mt-1 inline-block rounded bg-secondary px-1.5 py-0.5 text-[10px] text-secondary-foreground">
												Повтор
											</div>
										)}
									</button>
								)
							})
						)}
					</div>
				</div>
			))}
		</div>
	)
}
