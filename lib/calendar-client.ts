import { auth } from '@/lib/firebase'

export async function listStudentEvents(studentId: string, params?: { calendarId?: string; days?: number }) {
	const t = await auth.currentUser?.getIdToken()
	const url = new URL('/api/calendar/student-events', window.location.origin)
	url.searchParams.set('studentId', studentId)
	if (params?.calendarId) url.searchParams.set('calendarId', params.calendarId)
	if (params?.days) url.searchParams.set('days', String(params.days))
	const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${t}` } })
	if (!res.ok) throw new Error(await res.text())
	return res.json() as Promise<{
		items: { id: string; recurringEventId?: string; summary?: string; start?: string; end?: string }[]
	}>
}

export async function updateInstance(payload: {
	calendarId?: string
	eventId: string
	startISO: string
	durationMins: number
	timeZone?: string
}) {
	const t = await auth.currentUser?.getIdToken()
	const res = await fetch('/api/calendar/update-instance', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
		body: JSON.stringify(payload),
	})
	if (!res.ok) throw new Error(await res.text())
	return res.json()
}

export async function deleteOneOccurrence(recurringEventId: string, instanceStartISO: string, calendarId = 'primary') {
	const t = await auth.currentUser?.getIdToken()
	const res = await fetch('/api/calendar/delete-instance', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
		body: JSON.stringify({ recurringEventId, instanceStartISO, calendarId }),
	})
	if (!res.ok) throw new Error(await res.text())
	return res.json()
}
