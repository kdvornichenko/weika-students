'use client'

import { useEffect, useState } from 'react'

import { onAuthStateChanged } from 'firebase/auth'
import {
	collection,
	doc,
	onSnapshot,
	orderBy,
	query,
	where,
	type DocumentData,
	type FirestoreDataConverter,
} from 'firebase/firestore'
import Link from 'next/link'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { auth, db } from '@/lib/firebase'
import type { StudentDoc } from '@/types/student'

// даты как Timestamp и пр.

// --- Firestore converters (без any) ---
const studentConverter: FirestoreDataConverter<StudentDoc> = {
	toFirestore: (data: StudentDoc): DocumentData => data as DocumentData,
	fromFirestore: (snap, options): StudentDoc => snap.data(options) as StudentDoc,
}

type UserDoc = { calendarConnected?: boolean }

const userConverter: FirestoreDataConverter<UserDoc> = {
	toFirestore: (data: UserDoc): DocumentData => data as DocumentData,
	fromFirestore: (snap, options): UserDoc => snap.data(options) as UserDoc,
}

// --- UI-строки списка ---
type Row = {
	id: string
	name: string
	lessons?: { amount?: number; current?: number }
}

export default function StudentsPage() {
	const [uid, setUid] = useState<string | null>(null)
	const [rows, setRows] = useState<Row[]>([])
	const [calendarConnected, setCalendarConnected] = useState<boolean | null>(null)

	// следим за авторизацией
	useEffect(() => onAuthStateChanged(auth, (u) => setUid(u?.uid ?? null)), [])

	// подписка на список учеников (типизировано)
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

	// подписка на профиль пользователя → calendarConnected (типизировано)
	useEffect(() => {
		if (!uid) return
		const userRef = doc(db, 'users', uid).withConverter(userConverter)
		return onSnapshot(userRef, (snap) => {
			const data = snap.data()
			setCalendarConnected(Boolean(data?.calendarConnected))
		})
	}, [uid])

	// подключить/переподключить календарь
	async function connectCalendar() {
		const user = auth.currentUser
		if (!user) return
		const token = await user.getIdToken(true)
		const url = new URL('/api/google/auth', window.location.origin)
		url.searchParams.set('token', token)
		window.location.assign(url.toString())
	}

	return (
		<div>
			<div className="sticky top-0 z-10 mb-6 flex items-center justify-between bg-background/80 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/60">
				<h1 className="text-2xl font-semibold">Ученики</h1>

				<div className="flex items-center gap-3">
					{calendarConnected === null ? (
						<Badge variant="secondary">Проверяю календарь…</Badge>
					) : calendarConnected ? (
						<Badge>Календарь подключен</Badge>
					) : (
						<Badge variant="secondary">Календарь не подключен</Badge>
					)}

					<Button
						size="sm"
						variant={calendarConnected ? 'outline' : 'default'}
						onClick={connectCalendar}
						disabled={!uid}
					>
						{calendarConnected ? 'Переподключить' : 'Подключить календарь'}
					</Button>

					<Link href="/students/new" className="text-sm underline">
						+ Добавить
					</Link>
				</div>
			</div>

			<div className="grid gap-3">
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
									<span className="text-muted-foreground transition group-hover:translate-x-0.5">→</span>
								</div>
							</Card>
						</Link>
					)
				})}
			</div>
		</div>
	)
}
