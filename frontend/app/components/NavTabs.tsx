'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

// LAYOUT: add/remove/reorder tabs here to change what shows up in the sidebar.
const TABS = [
  { href: '/', label: 'Wait Times' },
  { href: '/playground', label: 'Playground' },
  { href: '/impact', label: 'Annual Impact' },
  { href: '/blog', label: 'Blog' },
]

export default function NavTabs() {
  const pathname = usePathname()

  return (
    <nav className="aero-nav sticky top-0 h-screen w-44 shrink-0 px-3 py-6">
      <Link href="/" className="mb-8 block px-3">
        <p className="text-sm font-semibold leading-tight text-ink">Border Wait Times</p>
        <p className="text-xs text-ink-3">El Paso · Ciudad Juárez</p>
      </Link>
      <div className="flex flex-col gap-0.5">
        {TABS.map((tab) => {
          // ACTION: highlight the tab matching the current route.
          const isActive = pathname === tab.href
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={isActive ? 'page' : undefined}
              className={
                'rounded-full px-3 py-2 text-sm font-medium transition-colors ' +
                (isActive ? 'aero-tab-active' : 'text-ink-2 hover:bg-accent-soft hover:text-accent')
              }
            >
              {tab.label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
