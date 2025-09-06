'use client'

import { useMemo, useState } from 'react'

import { startOfWeek, endOfWeek, addWeeks } from 'date-fns'
import { ru } from 'date-fns/locale'

export function useWeekPager() {
	const [weekOffset, setWeekOffset] = useState<number>(0)

	const weekRange = useMemo(() => {
		const base = new Date()
		const currentStart = startOfWeek(base, { weekStartsOn: 1, locale: ru })
		const start = addWeeks(currentStart, weekOffset)
		const end = endOfWeek(start, { weekStartsOn: 1, locale: ru })
		return { start, end }
	}, [weekOffset])

	return { weekOffset, setWeekOffset, weekRange }
}
