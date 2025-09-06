'use client'

import { useState } from 'react'

import { format } from 'date-fns'
import { ru } from 'date-fns/locale'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useCalendarBatchOps } from '@/hooks/useCalendarBatchOps'
import { useLessonsData } from '@/hooks/useLessonsData'
import { useWeekPager } from '@/hooks/useWeekPager'
import { upsertLesson } from '@/lib/calendar-client'
import { EditPayload, Row, ViewMode } from '@/types/student'
import { formatWeekTitle } from '@/utils/calendar'

import AddLessonDialog from './AddLessonDialog'
import EditLessonDialog from './EditLessonDialog'
import WeekGrid from './WeekGrid'

export default function StudentLessonsTable({
	studentId,
	calendarId = 'primary',
}: {
	studentId: string
	calendarId?: string
}) {
	const [view, setView] = useState<ViewMode>('list')
	const [editOpen, setEditOpen] = useState(false)
	const [editRow, setEditRow] = useState<Row | null>(null)

	// Пагинация неделями
	const { setWeekOffset, weekRange } = useWeekPager()

	// Данные текущей недели
	const { rows, setRows, loading, error, reload } = useLessonsData({
		studentId,
		calendarId,
		weekRange,
	})

	// Батч-операции и оптимистическое удаление
	const { batchUpdateFollowing, batchDeleteFollowing, optimisticRemove } = useCalendarBatchOps({
		studentId,
		calendarId,
		setRows,
	})

	const weekTitle = formatWeekTitle(weekRange.start, weekRange.end)

	return (
		<Card className="space-y-4 p-6">
			<div className="flex items-center justify-between gap-2">
				<div>
					<h2 className="text-lg font-semibold">Уроки (Google Calendar)</h2>
					<p className="text-sm text-muted-foreground">{weekTitle}</p>
				</div>

				<div className="flex items-center gap-2">
					{/* переключатель вида */}
					<div className="inline-flex rounded-md border p-0.5">
						<Button size="sm" variant={view === 'list' ? 'default' : 'ghost'} onClick={() => setView('list')}>
							Список
						</Button>
						<Button size="sm" variant={view === 'week' ? 'default' : 'ghost'} onClick={() => setView('week')}>
							Неделя
						</Button>
					</div>

					{/* пагинация неделями */}
					<div className="hidden items-center gap-1 md:flex">
						<Button size="sm" variant="outline" onClick={() => setWeekOffset((w) => w - 1)}>
							← Пред.
						</Button>
						<Button size="sm" variant="secondary" onClick={() => setWeekOffset(0)}>
							Текущая
						</Button>
						<Button size="sm" variant="outline" onClick={() => setWeekOffset((w) => w + 1)}>
							След. →
						</Button>
					</div>

					<Button variant="outline" onClick={reload}>
						Обновить
					</Button>

					<AddLessonDialog
						onAdd={async (payload) => {
							// Добавление НОВОГО урока — создаём событие и перегружаем список
							await upsertLesson({
								calendarId,
								studentId,
								title: payload.title || 'Урок',
								description: payload.description,
								startISO: payload.startISO,
								durationMins: payload.durationMins,
								timeZone: 'Europe/Stockholm',
								repeatWeekly: payload.repeatWeekly,
								requestId: payload.requestId,
							})
							await reload()
						}}
					/>
				</div>
			</div>

			{/* Мобильная пагинация */}
			<div className="flex items-center justify-between gap-2 md:hidden">
				<Button size="sm" variant="outline" onClick={() => setWeekOffset((w) => w - 1)}>
					← Пред.
				</Button>
				<Button size="sm" variant="secondary" onClick={() => setWeekOffset(0)}>
					Текущая неделя
				</Button>
				<Button size="sm" variant="outline" onClick={() => setWeekOffset((w) => w + 1)}>
					След. →
				</Button>
			</div>

			{error && <p className="text-sm text-destructive">{error}</p>}

			{loading ? (
				<p className="text-sm text-muted-foreground">Загрузка…</p>
			) : rows.length === 0 ? (
				<p className="text-sm text-muted-foreground">В этой неделе занятий нет.</p>
			) : view === 'list' ? (
				// Список той же недели
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
										<TableCell>{start ? format(start, 'd MMMM yyyy, EEE', { locale: ru }) : '—'}</TableCell>
										<TableCell>{start ? format(start, 'HH:mm', { locale: ru }) : '—'}</TableCell>
										<TableCell>{mins ? <Badge variant="secondary">{mins} мин</Badge> : '—'}</TableCell>
										<TableCell className="space-x-2 text-right">
											<Button
												size="sm"
												variant="outline"
												onClick={() => {
													setEditRow(r)
													setEditOpen(true)
												}}
											>
												Изменить
											</Button>
										</TableCell>
									</TableRow>
								)
							})}
						</TableBody>
					</Table>
				</div>
			) : (
				// Недельная сетка
				<WeekGrid
					rows={rows}
					start={weekRange.start}
					end={weekRange.end}
					onEventClick={(r) => {
						setEditRow(r)
						setEditOpen(true)
					}}
				/>
			)}

			<EditLessonDialog
				open={editOpen}
				onOpenChange={(o) => setEditOpen(o)}
				row={editRow}
				onSave={async (payload: EditPayload) => {
					if (!payload.target) return
					setEditOpen(false)
					setEditRow(null)

					// Редактирование — всегда через хук:
					//  - одиночный → серия (создаём серию и удаляем старый одиночный)
					//  - серия → апдейт текущего/всех последующих
					await batchUpdateFollowing(payload)
					await reload()
				}}
				onDelete={async (target, applyToAll) => {
					setEditOpen(false)
					setEditRow(null)
					optimisticRemove(target, applyToAll)
					;(async () => {
						try {
							await batchDeleteFollowing(target, applyToAll)
						} finally {
							await reload()
						}
					})()
				}}
			/>
		</Card>
	)
}
