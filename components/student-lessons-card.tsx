'use client'

import { useCallback, useEffect, useState } from 'react'

import { format } from 'date-fns'
import { ru } from 'date-fns/locale'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { listStudentEvents, updateInstance, deleteOneOccurrence } from '@/lib/calendar-client'

import DateField from './date-field'

/** Минимальная модель события из календаря */
type Row = {
	id: string
	recurringEventId?: string
	start?: string // ISO
	end?: string // ISO
	summary?: string
}

export default function StudentLessonsCard({
	studentId,
	calendarId = 'primary',
}: {
	studentId: string
	calendarId?: string
}) {
	const [rows, setRows] = useState<Row[]>([])
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState<string | null>(null)

	const reload = useCallback(async () => {
		try {
			setLoading(true)
			setError(null)
			const { items } = await listStudentEvents(studentId, { calendarId, days: 365 })
			setRows(items)
		} catch (e) {
			if (e instanceof Error) {
				setError(e.message)
			} else {
				setError('Ошибка загрузки')
			}
		} finally {
			setLoading(false)
		}
	}, [studentId, calendarId])

	useEffect(() => {
		void reload()
	}, [reload])

	return (
		<Card className="space-y-4 p-6">
			<div className="flex items-center justify-between">
				<div>
					<h2 className="text-lg font-semibold">Уроки (Google Calendar)</h2>
					<p className="text-sm text-muted-foreground">Будущие занятия, развёрнутые из повторений</p>
				</div>
				<Button variant="outline" onClick={reload}>
					Обновить
				</Button>
			</div>

			{error && <p className="text-sm text-destructive">{error}</p>}
			{loading ? (
				<p className="text-sm text-muted-foreground">Загрузка…</p>
			) : rows.length === 0 ? (
				<p className="text-sm text-muted-foreground">Пока нет запланированных уроков.</p>
			) : (
				<div className="overflow-x-auto">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Дата</TableHead>
								<TableHead>Время</TableHead>
								<TableHead>Длительность</TableHead>
								<TableHead></TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{rows.map((r) => {
								const start = r.start ? new Date(r.start) : null
								const end = r.end ? new Date(r.end) : null
								const mins = start && end ? Math.round((end.getTime() - start.getTime()) / 60000) : undefined

								return (
									<TableRow key={r.id}>
										<TableCell>{start ? format(start, 'd MMMM yyyy', { locale: ru }) : '—'}</TableCell>
										<TableCell>{start ? format(start, 'HH:mm', { locale: ru }) : '—'}</TableCell>
										<TableCell>{mins ? <Badge variant="secondary">{mins} мин</Badge> : '—'}</TableCell>
										<TableCell className="space-x-2 text-right">
											<EditInstanceDialog
												initialStart={start ?? undefined}
												initialDurationMins={mins ?? 60}
												onSave={async (newStart, duration) => {
													await updateInstance({
														calendarId,
														eventId: r.id,
														startISO: newStart.toISOString(),
														durationMins: duration,
													})
													await reload()
												}}
											/>
											{r.recurringEventId && start && (
												<Button
													variant="destructive"
													size="sm"
													onClick={async () => {
														await deleteOneOccurrence(r.recurringEventId!, start.toISOString(), calendarId)
														await reload()
													}}
												>
													Удалить
												</Button>
											)}
										</TableCell>
									</TableRow>
								)
							})}
						</TableBody>
					</Table>
				</div>
			)}
		</Card>
	)
}

/* Диалог редактирования одного урока */
function EditInstanceDialog({
	initialStart,
	initialDurationMins,
	onSave,
}: {
	initialStart?: Date
	initialDurationMins: number
	onSave: (start: Date, durationMins: number) => Promise<void>
}) {
	const [open, setOpen] = useState(false)
	const [date, setDate] = useState<Date | null>(initialStart ?? null)
	const [time, setTime] = useState(initialStart ? format(initialStart, 'HH:mm') : '')
	const [duration, setDuration] = useState<number>(initialDurationMins)
	const [saving, setSaving] = useState(false)

	function makeStart(): Date | null {
		if (!date) return null
		const [h, m] = (time || '00:00').split(':').map((x) => parseInt(x, 10))
		const d = new Date(date)
		if (!Number.isNaN(h)) d.setHours(h)
		if (!Number.isNaN(m)) d.setMinutes(m)
		d.setSeconds(0, 0)
		return d
	}

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button size="sm" variant="outline">
					Изменить
				</Button>
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Редактировать занятие</DialogTitle>
				</DialogHeader>

				<div className="space-y-3">
					<div className="grid gap-3 md:grid-cols-[1fr_auto]">
						<DateField value={date} onChange={setDate} />
						<Input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="w-[120px]" />
					</div>
					<div className="grid items-center gap-2 md:grid-cols-[1fr_auto]">
						<label className="text-sm text-muted-foreground">Длительность, мин</label>
						<Input
							type="number"
							value={duration}
							onChange={(e) => setDuration(Number(e.target.value || 60))}
							className="w-[120px]"
						/>
					</div>
				</div>

				<DialogFooter>
					<Button
						onClick={async () => {
							const s = makeStart()
							if (!s) return
							setSaving(true)
							await onSave(s, duration)
							setSaving(false)
							setOpen(false)
						}}
						disabled={saving}
					>
						{saving ? 'Сохраняю…' : 'Сохранить'}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
