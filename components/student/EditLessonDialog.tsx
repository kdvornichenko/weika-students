'use client'

import { useEffect, useMemo, useState } from 'react'

import { format, differenceInMinutes } from 'date-fns'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { EditPayload, Row } from '@/types/student'

import DateField from '../DateField'

export default function EditLessonDialog({
	open,
	onOpenChange,
	row,
	onSave,
	onDelete,
}: {
	open: boolean
	onOpenChange: (open: boolean) => void
	row: Row | null
	onSave: (payload: EditPayload) => Promise<void>
	onDelete: (target: Row, applyToAll: boolean) => Promise<void>
}) {
	const initialStart = useMemo(() => (row?.start ? new Date(row.start) : null), [row?.start])
	const initialDuration = useMemo(() => {
		if (!row?.start || !row?.end) return 60
		return Math.max(5, differenceInMinutes(new Date(row.end), new Date(row.start)))
	}, [row?.start, row?.end])

	const [date, setDate] = useState<Date | null>(initialStart ?? null)
	const [time, setTime] = useState(initialStart ? format(initialStart, 'HH:mm') : '')
	const [duration, setDuration] = useState<number>(initialDuration)
	const [applyToAll, setApplyToAll] = useState<boolean>(false)
	const [repeatWeekly, setRepeatWeekly] = useState<boolean>(Boolean(row?.recurringEventId))
	const [saving, setSaving] = useState(false)

	useEffect(() => {
		setDate(initialStart)
		setTime(initialStart ? format(initialStart, 'HH:mm') : '')
		setDuration(initialDuration)
		setApplyToAll(false)
		setRepeatWeekly(Boolean(row?.recurringEventId))
		setSaving(false)
	}, [initialStart, initialDuration, row?.recurringEventId])

	function makeStart(): Date | null {
		if (!date) return null
		const [h, m] = (time || '00:00').split(':').map((x) => parseInt(x, 10))
		const d = new Date(date)
		if (!Number.isNaN(h)) d.setHours(h)
		if (!Number.isNaN(m)) d.setMinutes(m)
		d.setSeconds(0, 0)
		return d
	}

	const isRecurring = Boolean(row?.recurringEventId)

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Редактировать занятие</DialogTitle>
				</DialogHeader>

				{!row ? null : (
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
								min={5}
								step={5}
								onChange={(e) => setDuration(Number(e.target.value || 60))}
								className="w-[120px]"
							/>
						</div>

						<div className="flex items-center gap-2">
							<input
								id="repeatWeeklyEdit"
								type="checkbox"
								checked={repeatWeekly}
								onChange={(e) => setRepeatWeekly(e.target.checked)}
								className="h-4 w-4"
								disabled={isRecurring}
							/>
							<label htmlFor="repeatWeeklyEdit" className="text-sm">
								Повторять еженедельно {isRecurring && <span className="text-muted-foreground">(уже серия)</span>}
							</label>
						</div>

						{isRecurring && (
							<div className="flex items-center gap-2">
								<input
									id="applyAll"
									type="checkbox"
									checked={applyToAll}
									onChange={(e) => setApplyToAll(e.target.checked)}
									className="h-4 w-4"
								/>
								<label htmlFor="applyAll" className="text-sm">
									Применять ко всем последующим урокам
								</label>
							</div>
						)}
					</div>
				)}

				<DialogFooter className="justify-between gap-2">
					{row && (
						<Button
							variant="destructive"
							onClick={() => {
								if (!row) return
								setSaving(true)
								onOpenChange(false) // закрываем сразу
								onDelete(row, applyToAll && isRecurring).finally(() => setSaving(false))
							}}
							disabled={saving}
						>
							{saving ? 'Удаляю…' : isRecurring ? 'Удалить (эту / все последующие)' : 'Удалить'}
						</Button>
					)}

					<Button
						onClick={async () => {
							const s = makeStart()
							if (!s || !row) return
							setSaving(true)
							onOpenChange(false) // закрываем сразу
							await onSave({
								target: row,
								newStart: s,
								durationMins: duration,
								applyToAll: applyToAll && isRecurring,
								repeatWeekly,
							}).finally(() => setSaving(false))
						}}
						disabled={saving || !row}
					>
						{saving ? 'Сохраняю…' : 'Сохранить'}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
