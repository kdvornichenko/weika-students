import { format } from 'date-fns'
import { ru } from 'date-fns/locale'

/** type guard: у записи точно есть start */
export function hasStart<T extends { start?: string }>(r: T): r is T & { start: string } {
	return typeof r.start === 'string' && r.start.length > 0
}

/** Человекочитаемый заголовок недели */
export function formatWeekTitle(start: Date, end: Date) {
	return `Неделя: ${format(start, 'd MMM', { locale: ru })} — ${format(end, 'd MMM', { locale: ru })}`
}

/** Формат UNTIL для Google RRULE: YYYYMMDDTHHMMSSZ (UTC) */
export function formatRRuleUntilOneYearFrom(startISO: string): string {
	const start = new Date(startISO)
	const until = new Date(start.getTime())
	until.setUTCFullYear(until.getUTCFullYear() + 1)
	const pad = (n: number) => String(n).padStart(2, '0')
	const YYYY = until.getUTCFullYear()
	const MM = pad(until.getUTCMonth() + 1)
	const DD = pad(until.getUTCDate())
	const hh = pad(until.getUTCHours())
	const mm = pad(until.getUTCMinutes())
	const ss = pad(until.getUTCSeconds())
	return `${YYYY}${MM}${DD}T${hh}${mm}${ss}Z`
}
