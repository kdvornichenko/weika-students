'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const items = [
	{ href: '/students', label: 'Ученики' },
	{ href: '/calendar', label: 'Календарь' },
	{ href: '/settings', label: 'Настройки' },
]

export default function Sidebar() {
	const pathname = usePathname()

	return (
		<aside className="sticky top-0 hidden h-dvh w-64 shrink-0 border-r bg-white/70 px-3 py-6 backdrop-blur md:block">
			<nav className="space-y-1">
				{items.map(({ href, label }) => {
					const active = pathname?.startsWith(href)
					return (
						<Link
							key={href}
							href={href}
							aria-current={active ? 'page' : undefined}
							className={`block rounded-xl px-3 py-2 text-sm transition ${
								active ? 'bg-black text-white' : 'hover:bg-gray-100'
							}`}
						>
							{label}
						</Link>
					)
				})}
			</nav>
		</aside>
	)
}
