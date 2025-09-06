'use client'

import { zodResolver } from '@hookform/resolvers/zod'

import * as React from 'react'
import { useForm, type Resolver, type SubmitHandler } from 'react-hook-form'

import { format } from 'date-fns'
import {
	Timestamp,
	addDoc,
	collection,
	doc,
	serverTimestamp,
	updateDoc,
	deleteDoc,
	type DocumentData,
	type FirestoreDataConverter,
	type UpdateData,
	type WithFieldValue,
} from 'firebase/firestore'
import Link from 'next/link'
import { z } from 'zod'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { upsertLesson, deleteAllLessonsForStudent } from '@/lib/calendar-client'
import { db, auth } from '@/lib/firebase'
import type { StudentDoc, StudentWrite } from '@/types/student'

import DateField from '../DateField'
import { DeleteIcon } from '../ui/icons/detele'
import AddLessonDialog from './AddLessonDialog'

const schema = z.object({
	name: z.string().min(2, 'Введите имя'),
	description: z.string().optional(),
	lessons_amount: z.coerce.number().optional(),
	lessons_current: z.coerce.number().optional(),
	lessons_next_date: z.date().nullable().optional(),
	lessons_next_time: z.string().nullable().optional(),
	payment_last: z.date().nullable().optional(),
	payment_next: z.date().nullable().optional(),
	price_per_lesson: z.coerce.number().optional(),
	price_total: z.coerce.number().optional(),
})
export type StudentFormValues = z.infer<typeof schema>

export type StudentFormProps = {
	mode: 'create' | 'edit'
	docId?: string
	initial?: StudentDoc
}

const studentConverter: FirestoreDataConverter<StudentDoc> = {
	toFirestore: (data: StudentDoc): DocumentData => data as DocumentData,
	fromFirestore: (snap, options): StudentDoc => snap.data(options) as StudentDoc,
}

function tsToDate(v: Timestamp | Date | null | undefined): Date | null {
	if (!v) return null
	if (v instanceof Date) return v
	if (v instanceof Timestamp) return v.toDate()
	return null
}

function packDateTime(date: Date | null | undefined, timeHHMM: string | null | undefined): Timestamp | null {
	if (!date) return null
	if (!timeHHMM) return Timestamp.fromDate(date)
	const [H, M] = timeHHMM.split(':').map((n) => parseInt(n || '0', 10))
	const d = new Date(date)
	if (!Number.isNaN(H)) d.setHours(H)
	if (!Number.isNaN(M)) d.setMinutes(M)
	d.setSeconds(0, 0)
	return Timestamp.fromDate(d)
}

// до минут в UTC
function minuteKeyFromISO(iso: string) {
	return new Date(iso).toISOString().slice(0, 16) // YYYY-MM-DDTHH:MM
}

// детерминированный requestId = calendarId|studentId|минутный ключ
function makeRequestId(calendarId: string, studentId: string, startISO: string) {
	return `slot:${(calendarId || 'primary').trim()}|${studentId}|${minuteKeyFromISO(startISO)}`
}

type PendingLesson = {
	id: string // локальный id для списка
	title?: string
	description?: string
	startISO: string
	durationMins: number
	repeatWeekly: boolean
	requestId: string
}

export default function StudentForm({ mode, docId, initial }: StudentFormProps) {
	const defaults: StudentFormValues = {
		name: initial?.name ?? '',
		description: initial?.description ?? '',
		lessons_amount: initial?.lessons?.amount ?? undefined,
		lessons_current: initial?.lessons?.current ?? undefined,
		lessons_next_date: tsToDate(initial?.lessons?.next) ?? null,
		lessons_next_time: initial?.lessons?.next ? format(tsToDate(initial?.lessons?.next)!, 'HH:mm') : null,
		payment_last: tsToDate(initial?.payment?.last) ?? null,
		payment_next: tsToDate(initial?.payment?.next) ?? null,
		price_per_lesson: initial?.price?.per_lesson ?? undefined,
		price_total: initial?.price?.total ?? undefined,
	}

	const form = useForm<StudentFormValues>({
		resolver: zodResolver(schema) as unknown as Resolver<StudentFormValues>,
		defaultValues: defaults,
	})

	const [saving, setSaving] = React.useState(false)

	// ---------------- DELETE STUDENT ----------------
	const [deleteOpen, setDeleteOpen] = React.useState(false)
	const [deleting, setDeleting] = React.useState(false)
	const calendarIdForDeletion =
		(initial && 'calendar' in initial
			? (initial as { calendar?: { calendarId?: string } }).calendar?.calendarId
			: undefined) || 'primary'

	const handleConfirmDelete = async () => {
		if (!docId) return
		setDeleting(true)
		try {
			await deleteAllLessonsForStudent(docId, { calendarId: calendarIdForDeletion }).catch((e) => {
				console.warn('Failed to delete lessons from calendar:', e)
			})
			await deleteDoc(doc(db, 'students', docId))
			window.location.href = '/students'
		} finally {
			setDeleting(false)
			setDeleteOpen(false)
		}
	}
	// -----------------------------------------------

	// ---------- NEW: Запланированные уроки при создании ----------
	const [pendingLessons, setPendingLessons] = React.useState<PendingLesson[]>([])

	function addPendingLesson(p: {
		title?: string
		description?: string
		startISO: string
		durationMins: number
		repeatWeekly: boolean
		requestId: string
	}) {
		const id = crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)
		setPendingLessons((prev) => [...prev, { id, ...p }])
	}

	function removePendingLesson(id: string) {
		setPendingLessons((prev) => prev.filter((x) => x.id !== id))
	}
	// -------------------------------------------------------------

	const onSubmit: SubmitHandler<StudentFormValues> = async (values) => {
		const uid = auth.currentUser?.uid
		if (!uid) return
		setSaving(true)

		const lessons: NonNullable<StudentWrite['lessons']> = {}
		if (values.lessons_amount !== undefined) lessons.amount = values.lessons_amount
		if (values.lessons_current !== undefined) lessons.current = values.lessons_current
		const nextTs = packDateTime(values.lessons_next_date ?? null, values.lessons_next_time ?? null)
		if (nextTs !== null) lessons.next = nextTs

		const price: NonNullable<StudentWrite['price']> = {}
		if (values.price_per_lesson !== undefined) price.per_lesson = values.price_per_lesson
		if (values.price_total !== undefined) price.total = values.price_total

		const payload: StudentWrite = {
			ownerId: uid,
			name: values.name,
			description: values.description || undefined,
			...(Object.keys(lessons).length ? { lessons } : {}),
			payment: {
				last: values.payment_last ? Timestamp.fromDate(values.payment_last) : null,
				next: values.payment_next ? Timestamp.fromDate(values.payment_next) : null,
			},
			...(Object.keys(price).length ? { price } : {}),
			updatedAt: serverTimestamp(),
		}

		try {
			const studentsCol = collection(db, 'students').withConverter(studentConverter)

			let studentId = docId

			if (mode === 'create') {
				const createData: WithFieldValue<StudentDoc> = {
					...(payload as unknown as WithFieldValue<StudentDoc>),
					createdAt: serverTimestamp(),
				}
				const ref = await addDoc(studentsCol, createData)
				studentId = ref.id
			} else {
				const ref = doc(studentsCol, docId!)
				const updateData: UpdateData<StudentDoc> = payload as unknown as UpdateData<StudentDoc>
				await updateDoc(ref, updateData)
			}

			// ——— Создание уроков ———
			if (studentId) {
				const calendarId = 'primary'
				const toCreate: PendingLesson[] = [...pendingLessons]

				// Если указан «Следующий урок», добавим его тоже,
				// НО только если нет дубликата по минуте среди запланированных.
				if (payload?.lessons?.next) {
					const startISO = payload.lessons.next.toDate().toISOString()
					const mk = minuteKeyFromISO(startISO)
					const dup = toCreate.some((x) => minuteKeyFromISO(x.startISO) === mk)
					if (!dup) {
						toCreate.push({
							id: 'next',
							title: `Урок: ${values.name}`,
							description: values.description || '',
							startISO,
							durationMins: 60,
							repeatWeekly: false,
							requestId: makeRequestId(calendarId, studentId, startISO),
						})
					}
				}

				if (toCreate.length) {
					await Promise.allSettled(
						toCreate.map((l) =>
							upsertLesson({
								calendarId,
								studentId,
								title: l.title || `Урок: ${values.name}`,
								description: l.description,
								startISO: l.startISO,
								durationMins: l.durationMins,
								timeZone: 'Europe/Stockholm',
								repeatWeekly: l.repeatWeekly,
								requestId: makeRequestId(calendarId, studentId!, l.startISO),
							})
						)
					)
				}
			}

			window.location.href = '/students'
		} finally {
			setSaving(false)
		}
	}

	return (
		<>
			<form onSubmit={form.handleSubmit(onSubmit)}>
				<Card className="space-y-6 p-6">
					<div className="flex items-center justify-between">
						<div>
							<h1 className="text-xl font-semibold">{mode === 'create' ? 'Новый ученик' : 'Редактирование ученика'}</h1>
						</div>
					</div>

					<Separator />

					<div className="grid gap-6 md:grid-cols-2">
						<div className="space-y-4">
							<div className="space-y-2">
								<Label>Имя и фамилия *</Label>
								<Input {...form.register('name')} placeholder="Имя Фамилия" />
								{form.formState.errors.name && (
									<p className="text-sm text-destructive">{form.formState.errors.name.message}</p>
								)}
							</div>

							<div className="space-y-2">
								<Label>Описание</Label>
								<Textarea {...form.register('description')} rows={5} placeholder="Нотесы, ссылки и т.п." />
							</div>
						</div>

						<div className="space-y-4">
							<div className="grid gap-4 md:grid-cols-2">
								<div className="space-y-2">
									<Label>Цена за урок</Label>
									<Input type="number" step="0.01" {...form.register('price_per_lesson')} placeholder="2000" />
								</div>
								<div className="space-y-2">
									<Label>Итого (total)</Label>
									<Input type="number" step="0.01" {...form.register('price_total')} placeholder="16000" />
								</div>
							</div>

							<div className="grid gap-4 md:grid-cols-2">
								<div className="space-y-2">
									<Label>Следующая оплата</Label>
									<DateField
										value={form.watch('payment_next') ?? null}
										onChange={(d) => form.setValue('payment_next', d)}
									/>
								</div>
								<div className="space-y-2">
									<Label>Последняя оплата</Label>
									<DateField
										value={form.watch('payment_last') ?? null}
										onChange={(d) => form.setValue('payment_last', d)}
									/>
								</div>
							</div>
						</div>
					</div>

					<Separator />

					<div className="grid gap-6 md:grid-cols-2">
						<div className="space-y-4">
							<h2 className="text-sm font-medium text-muted-foreground">Уроки</h2>
							<div className="grid gap-4 md:grid-cols-2">
								<div className="space-y-2">
									<Label>Всего уроков (amount)</Label>
									<Input type="number" {...form.register('lessons_amount')} />
								</div>
								<div className="space-y-2">
									<Label>Проведено (current)</Label>
									<Input type="number" {...form.register('lessons_current')} />
								</div>
							</div>

							<div className="space-y-2">
								<Label>Следующий урок</Label>
								<div className="grid gap-3 md:grid-cols-[1fr_auto]">
									<DateField
										value={form.watch('lessons_next_date') ?? null}
										onChange={(d) => form.setValue('lessons_next_date', d ?? null)}
									/>
									<Input
										type="time"
										value={form.watch('lessons_next_time') ?? ''}
										onChange={(e) => form.setValue('lessons_next_time', e.target.value)}
										className="w-[120px]"
									/>
								</div>
							</div>
						</div>

						{/* NEW: Запланированные уроки при создании */}
						{mode === 'create' && (
							<div className="space-y-3">
								<div className="flex items-center justify-between">
									<h2 className="text-sm font-medium text-muted-foreground">Запланированные уроки</h2>
									<AddLessonDialog
										onAdd={async (p) => {
											addPendingLesson({
												title: p.title,
												description: p.description,
												startISO: p.startISO,
												durationMins: p.durationMins,
												repeatWeekly: p.repeatWeekly,
												requestId: p.requestId,
											})
										}}
									/>
								</div>

								{pendingLessons.length === 0 ? (
									<p className="text-sm text-muted-foreground">
										Добавьте один или несколько уроков — они будут созданы после нажатия «Сохранить».
									</p>
								) : (
									<div className="overflow-x-auto">
										<Table>
											<TableHeader>
												<TableRow>
													<TableHead>Дата</TableHead>
													<TableHead>Время</TableHead>
													<TableHead>Длительность</TableHead>
													<TableHead>Повтор</TableHead>
													<TableHead className="text-right">Действия</TableHead>
												</TableRow>
											</TableHeader>
											<TableBody>
												{pendingLessons
													.slice()
													.sort((a, b) => new Date(a.startISO).getTime() - new Date(b.startISO).getTime())
													.map((l) => {
														const d = new Date(l.startISO)
														const mins = l.durationMins
														return (
															<TableRow key={l.id}>
																<TableCell>{format(d, 'd MMM yyyy')}</TableCell>
																<TableCell>{format(d, 'HH:mm')}</TableCell>
																<TableCell>{mins} мин</TableCell>
																<TableCell>{l.repeatWeekly ? 'еженедельно' : '—'}</TableCell>
																<TableCell className="text-right">
																	<Button
																		size="sm"
																		variant="outline"
																		type="button"
																		onClick={() => removePendingLesson(l.id)}
																	>
																		Удалить
																	</Button>
																</TableCell>
															</TableRow>
														)
													})}
											</TableBody>
										</Table>
									</div>
								)}

								<p className="text-xs text-muted-foreground">
									Подсказка: если вы также заполните поле «Следующий урок» слева, мы создадим его только если он не
									дублирует один из запланированных (с точностью до минуты).
								</p>
							</div>
						)}
					</div>
					<div className="flex justify-between gap-2">
						{mode === 'edit' && (
							<Button
								type="button"
								className="cursor-pointer"
								asChild
								variant="destructive"
								onClick={() => setDeleteOpen(true)}
								disabled={saving}
							>
								<span>
									<DeleteIcon />
									<span>Удалить</span>
								</span>
							</Button>
						)}
						<div className="flex gap-x-2">
							<Button asChild variant="secondary">
								<Link href="/students">Отмена</Link>
							</Button>
							<Button className="cursor-pointer" type="submit" disabled={saving}>
								{saving ? 'Сохраняю...' : 'Сохранить'}
							</Button>
						</div>
					</div>
				</Card>
			</form>

			{/* Диалог удаления — весь контент внутри DialogContent */}
			<Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Удалить ученика?</DialogTitle>
					</DialogHeader>
					<div className="space-y-2">
						<p className="text-sm">
							Вы уверены, что хотите удалить этого ученика? <br />
							<strong>Все его уроки в Google Calendar будут удалены безвозвратно.</strong>
						</p>
					</div>
					<DialogFooter className="justify-between">
						<Button type="button" variant="outline" onClick={() => setDeleteOpen(false)} disabled={deleting}>
							Отмена
						</Button>
						<Button type="button" variant="destructive" onClick={handleConfirmDelete} disabled={deleting}>
							{deleting ? 'Удаляю…' : 'Удалить'}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	)
}
