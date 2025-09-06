import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'

import Sidebar from '@/components/Sidebar'
import AuthGate from '@/components/auth/AuthGate'
import AutoPromptConnectCalendar from '@/components/auth/AutoPromptConnectCalendar'

import './globals.css'

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] })
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] })

export const metadata: Metadata = { title: 'Weikateach - Students' }

export default function RootLayout({ children }: { children: React.ReactNode }) {
	return (
		<html lang="en">
			<body className={`${geistSans.variable} ${geistMono.variable} text-black antialiased`}>
				<AuthGate>
					<AutoPromptConnectCalendar />
					<div className="mx-auto flex min-h-dvh max-w-7xl gap-6">
						<Sidebar />
						<main className="flex-1 py-6">{children}</main>
					</div>
				</AuthGate>
			</body>
		</html>
	)
}
