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
    // LAYOUT: phones = sticky bar across the top (brand + horizontally scrolling tabs),
    // md+ = full-height sidebar. z-index keeps it above the Leaflet map controls.
    <nav className="aero-nav sticky top-0 z-[1100] flex w-full items-center gap-2 px-2 py-2 md:h-screen md:w-44 md:shrink-0 md:flex-col md:items-stretch md:gap-0 md:px-3 md:py-6">
      <Link href="/" className="shrink-0 px-2 md:mb-8 md:block md:px-3">
        <p className="text-sm font-semibold leading-tight text-ink">Border Wait Times</p>
        <p className="hidden text-xs text-ink-3 md:block">El Paso, Ciudad Juárez</p>
      </Link>
      <div className="flex min-w-0 gap-1 overflow-x-auto md:flex-col md:gap-0.5 md:overflow-visible">
        {TABS.map((tab) => {
          // ACTION: highlight the tab matching the current route.
          const isActive = pathname === tab.href
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={isActive ? 'page' : undefined}
              // On the phone top bar the tabs scroll sideways; keep the current page's tab in view.
              ref={isActive ? (el) => el?.scrollIntoView({ block: 'nearest', inline: 'nearest' }) : undefined}
              className={
                'shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium transition-colors md:py-2 ' +
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
