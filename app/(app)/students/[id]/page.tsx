'use client'

import { useEffect, useState } from 'react'

import { doc, onSnapshot, type DocumentData, type FirestoreDataConverter } from 'firebase/firestore'
import { useParams } from 'next/navigation'

import StudentForm from '@/components/student-form'
import StudentLessonsCard from '@/components/student-lessons-card'
import { Skeleton } from '@/components/ui/skeleton'
import { db } from '@/lib/firebase'
import type { StudentDoc } from '@/types/student'

const studentConverter: FirestoreDataConverter<StudentDoc> = {
	toFirestore: (data: StudentDoc): DocumentData => data as DocumentData,
	fromFirestore: (snap, options): StudentDoc => snap.data(options) as StudentDoc,
}

// Документ с id для формы/карточек
type Initial = { id: string } & StudentDoc

export default function EditStudentPage() {
	const { id } = useParams<{ id: string }>()
	const [initial, setInitial] = useState<Initial | null>(null)

	useEffect(() => {
		if (!id) return
		const ref = doc(db, 'students', id).withConverter(studentConverter)
		return onSnapshot(ref, (snap) => {
			if (!snap.exists()) return setInitial(null)
			const data = snap.data()
			setInitial({ id: snap.id, ...data })
		})
	}, [id])

	if (!initial) {
		return (
			<div className="space-y-4">
				<Skeleton className="h-10 w-64" />
				<Skeleton className="h-40 w-full" />
			</div>
		)
	}

	return (
		<>
			<StudentForm mode="edit" docId={initial.id} initial={initial} />
			<div className="mt-6">
				<StudentLessonsCard studentId={initial.id} />
			</div>
		</>
	)
}
