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
	type DocumentData,
	type FirestoreDataConverter,
	type UpdateData,
	type WithFieldValue,
} from 'firebase/firestore'
import Link from 'next/link'
import { z } from 'zod'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import { db, auth } from '@/lib/firebase'
import type { StudentDoc, StudentWrite } from '@/types/student'

import DateField from './date-field'

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

			// ——— при наличии следующего урока — создаём/обновляем событие в календаре ———
			if (studentId && nextTs) {
				const startISO = nextTs.toDate().toISOString()
				const durationMins = 60
				const token = await auth.currentUser?.getIdToken()

				await fetch('/api/calendar/upsert', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
					body: JSON.stringify({
						studentId,
						title: `Урок: ${values.name}`,
						description: values.description,
						startISO,
						durationMins,
						timeZone: 'Europe/Stockholm',
					}),
				}).catch((e) => console.warn('Calendar upsert failed:', e))
			}

			window.location.href = '/students'
		} finally {
			setSaving(false)
		}
	}

	return (
		<form onSubmit={form.handleSubmit(onSubmit)}>
			<Card className="space-y-6 p-6">
				<div className="flex items-center justify-between">
					<div>
						<h1 className="text-xl font-semibold">{mode === 'create' ? 'Новый ученик' : 'Редактирование ученика'}</h1>
					</div>
					<div className="flex gap-2">
						<Link href="/students" className="self-center text-sm text-muted-foreground underline">
							Отмена
						</Link>
						<Button className="cursor-pointer" type="submit" disabled={saving}>
							{saving ? 'Сохраняю...' : 'Сохранить'}
						</Button>
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
				</div>
			</Card>
		</form>
	)
}
