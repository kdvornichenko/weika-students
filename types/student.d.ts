// types/student.ts
import type { Timestamp, FieldValue } from 'firebase/firestore'

export type StudentDoc = {
	ownerId: string
	name: string
	description?: string

	lessons?: {
		amount?: number
		current?: number
		next?: Timestamp | null
	}

	payment?: {
		last?: Timestamp | null
		next?: Timestamp | null
	}

	price?: {
		per_lesson?: number
		total?: number
	}

	createdAt?: Timestamp
	updatedAt?: Timestamp
}

// Тип для записи/апдейта
export type StudentWrite = Omit<StudentDoc, 'createdAt' | 'updatedAt'> & {
	createdAt?: FieldValue
	updatedAt?: FieldValue
}
