'use client'

import { useEffect, useState } from 'react'

import { doc, onSnapshot } from 'firebase/firestore'
import { useParams } from 'next/navigation'

import StudentForm from '@/components/student-form'
import StudentLessonsCard from '@/components/student-lessons-card'
import { Skeleton } from '@/components/ui/skeleton'
import { db } from '@/lib/firebase'

export default function EditStudentPage() {
	const { id } = useParams<{ id: string }>()
	const [initial, setInitial] = useState<any | null>(null)

	useEffect(() => {
		if (!id) return
		const ref = doc(db, 'students', id)
		return onSnapshot(ref, (snap) => setInitial(snap.exists() ? { id: snap.id, ...snap.data() } : null))
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
