import type { DocumentData } from 'firebase/firestore'

export function remainingLessons(s: DocumentData) {
	const amount = s?.lessons?.amount ?? 0
	const current = s?.lessons?.current ?? 0
	return amount - current
}
