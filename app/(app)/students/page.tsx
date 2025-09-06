'use client'

import { useEffect, useState } from 'react'

import { onAuthStateChanged } from 'firebase/auth'
import {
	collection,
	onSnapshot,
	orderBy,
	query,
	where,
	type DocumentData,
	type FirestoreDataConverter,
} from 'firebase/firestore'
import Link from 'next/link'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useCalendarConnection } from '@/hooks/useCalendarConnection'
import { auth, db } from '@/lib/firebase'
import type { StudentDoc } from '@/types/student'

const studentConverter: FirestoreDataConverter<StudentDoc> = {
	toFirestore: (data: StudentDoc): DocumentData => data as DocumentData,
	fromFirestore: (snap, options): StudentDoc => snap.data(options) as StudentDoc,
}

type Row = {
	id: string
	name: string
	lessons?: { amount?: number; current?: number }
}

export default function StudentsPage() {
	const [uid, setUid] = useState<string | null>(null)
	const [rows, setRows] = useState<Row[]>([])
	const { calendarConnected } = useCalendarConnection(uid)

	useEffect(() => onAuthStateChanged(auth, (u) => setUid(u?.uid ?? null)), [])

	useEffect(() => {
		if (!uid) return

		const studentsRef = collection(db, 'students').withConverter(studentConverter)
		const q = query(studentsRef, where('ownerId', '==', uid), orderBy('name'))

		return onSnapshot(q, (snap) => {
			const next: Row[] = snap.docs.map((d) => {
				const s = d.data() // StudentDoc
				const amount = s.lessons?.amount
				const current = s.lessons?.current
				const lessons = amount !== undefined || current !== undefined ? { amount, current } : undefined
				return { id: d.id, name: s.name, lessons }
			})
			setRows(next)
		})
	}, [uid])

	return (
		<div>
			<div className="sticky top-0 z-10 mb-6 flex items-center justify-between backdrop-blur supports-[backdrop-filter]:bg-background/60">
				<h1 className="text-2xl font-semibold">Ученики</h1>

				<div className="flex items-center gap-3">
					{calendarConnected === false && (
						<Button asChild size="sm">
							<Link href="/settings">Подключить календарь</Link>
						</Button>
					)}

					<Button asChild size="sm">
						<Link href="/students/new">+ Добавить</Link>
					</Button>
				</div>
			</div>

			<div className="grid grid-cols-3 gap-3">
				{rows.map((r) => {
					const remain = (r.lessons?.amount ?? 0) - (r.lessons?.current ?? 0)
					return (
						<Link key={r.id} href={`/students/${r.id}`} className="group">
							<Card className="p-4 transition-all group-hover:border-primary group-hover:shadow-sm">
								<div className="flex items-center justify-between">
									<div>
										<div className="font-medium">{r.name}</div>
										<div className="text-sm text-muted-foreground">
											Осталось уроков: {Number.isFinite(remain) ? remain : '—'}
										</div>
									</div>
								</div>
							</Card>
						</Link>
					)
				})}
			</div>
		</div>
	)
}
