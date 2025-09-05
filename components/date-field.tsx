'use client'

import * as React from 'react'

import { format } from 'date-fns'
import { ru } from 'date-fns/locale'
import { CalendarIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

export type DateFieldProps = {
	value?: Date | null
	onChange: (d: Date | null) => void
	placeholder?: string
	disabled?: boolean
	className?: string
}

export default function DateField({
	value,
	onChange,
	placeholder = 'Выбрать дату',
	disabled,
	className,
}: DateFieldProps) {
	const d = value ?? null

	return (
		<Popover>
			<PopoverTrigger asChild>
				<Button
					type="button"
					variant="outline"
					disabled={disabled}
					className={cn('w-full justify-start text-left font-normal', !d && 'text-muted-foreground', className)}
				>
					<CalendarIcon className="mr-2 h-4 w-4" />
					{d ? format(d, 'd MMMM yyyy', { locale: ru }) : placeholder}
				</Button>
			</PopoverTrigger>

			<PopoverContent className="w-auto p-0" align="start">
				<Calendar
					mode="single"
					selected={d ?? undefined}
					onSelect={(day) => onChange(day ?? null)}
					autoFocus
					locale={ru}
				/>
			</PopoverContent>
		</Popover>
	)
}
