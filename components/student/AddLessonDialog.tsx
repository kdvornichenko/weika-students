'use client'

import { useEffect, useRef, useState } from 'react'

import { format } from 'date-fns'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'

import DateField from '../DateField'

function makeUUID() {
	if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
	// fallback
	return 'req-' + Math.random().toString(36).slice(2) + Date.now().toString(36)
}

export default function AddLessonDialog({
	onAdd,
}: {
	onAdd: (payload: {
		title?: string
		description?: string
		startISO: string
		durationMins: number
		repeatWeekly: boolean
		requestId: string
	}) => Promise<void>
}) {
	const [open, setOpen] = useState(false)
	const [date, setDate] = useState<Date | null>(new Date())
	const [time, setTime] = useState(format(new Date(), 'HH:mm'))
	const [duration, setDuration] = useState<number>(60)
	const [title, setTitle] = useState<string>('Урок')
	const [description, setDescription] = useState<string>('')
	const [repeatWeekly, setRepeatWeekly] = useState<boolean>(false)
	const [saving, setSaving] = useState(false)

	// Идемпотентный ключ на открытие диалога
	const requestIdRef = useRef<string>(makeUUID())
	useEffect(() => {
		if (open) {
			requestIdRef.current = makeUUID()
		}
	}, [open])

	// предохранитель от двойного клика
	const submittedRef = useRef(false)

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
		<Dialog
			open={open}
			onOpenChange={(v) => {
				if (!saving) setOpen(v)
			}}
		>
			<DialogTrigger asChild>
				<Button className="cursor-pointer" type="button">
					+ Добавить
				</Button>
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Новое занятие</DialogTitle>
				</DialogHeader>

				<div className="space-y-3">
					<div className="grid gap-3">
						<label className="text-sm text-muted-foreground">Название</label>
						<Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Урок" />
					</div>

					<div className="grid gap-3 md:grid-cols-[1fr_auto]">
						<DateField value={date} onChange={setDate} />
						<Input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="w-[140px]" />
					</div>

					<div className="grid items-center gap-2 md:grid-cols-[1fr_auto]">
						<label className="text-sm text-muted-foreground">Длительность, мин</label>
						<Input
							type="number"
							value={duration}
							min={15}
							step={5}
							onChange={(e) => setDuration(Number(e.target.value || 60))}
							className="w-[140px]"
						/>
					</div>

					<div className="flex items-center gap-2">
						<input
							id="repeatWeekly"
							type="checkbox"
							checked={repeatWeekly}
							onChange={(e) => setRepeatWeekly(e.target.checked)}
							className="h-4 w-4"
						/>
						<label htmlFor="repeatWeekly" className="text-sm">
							Повторять еженедельно
						</label>
					</div>

					<div className="grid gap-2">
						<label className="text-sm text-muted-foreground">Описание (необязательно)</label>
						<Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="" />
					</div>
				</div>

				<DialogFooter>
					<Button
						type="button"
						onClick={async () => {
							if (submittedRef.current) return
							submittedRef.current = true

							const s = makeStart()
							if (!s) {
								submittedRef.current = false
								return
							}

							try {
								setSaving(true)
								await onAdd({
									title,
									description,
									startISO: s.toISOString(),
									durationMins: duration,
									repeatWeekly,
									requestId: requestIdRef.current,
								})
								setOpen(false)
							} finally {
								setSaving(false)
								setTimeout(() => {
									submittedRef.current = false
								}, 250)
							}
						}}
						disabled={saving}
					>
						{saving ? 'Сохраняю…' : 'Создать'}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
