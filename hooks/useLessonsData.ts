'use client'

import { useCallback, useEffect, useState } from 'react'

import { listStudentEventsRange } from '@/lib/calendar-client'
import { Row } from '@/types/student'

export function useLessonsData(opts: {
	studentId: string
	calendarId?: string
	weekRange: { start: Date; end: Date }
}) {
	const { studentId, calendarId = 'primary', weekRange } = opts

	const [rows, setRows] = useState<Row[]>([])
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState<string | null>(null)

	const reload = useCallback(async () => {
		try {
			setLoading(true)
			setError(null)

			const { start, end } = weekRange
			const { items } = await listStudentEventsRange(studentId, {
				calendarId,
				fromISO: start.toISOString(),
				toISO: end.toISOString(),
			})

			const sorted = [...items].sort((a, b) => {
				const ta = a.start ? new Date(a.start).getTime() : 0
				const tb = b.start ? new Date(b.start).getTime() : 0
				return ta - tb
			})

			setRows(sorted)
		} catch (e) {
			if (e instanceof Error) setError(e.message)
			else setError('Ошибка загрузки')
		} finally {
			setLoading(false)
		}
	}, [studentId, calendarId, weekRange])

	useEffect(() => {
		void reload()
	}, [reload])

	return { rows, setRows, loading, error, reload }
}
