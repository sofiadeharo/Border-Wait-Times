'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

// LAYOUT: add/remove/reorder tabs here to change what shows up in the sidebar.
const TABS = [
  { href: '/', label: 'Wait Times' },
  { href: '/playground', label: 'Playground' },
  { href: '/blog', label: 'Blog' }
  
]

// LAYOUT: fixed-width sticky sidebar (see `w-56`, `h-screen`) that sits to the
// left of every page (mounted once in layout.tsx). Change `w-56` to resize it.
// COLORS: the sidebar bar itself is `bg-blackberry-cream/90` regardless of
// light/dark theme — it's meant to stay a constant brand-navy bar.
export default function NavTabs() {
  const pathname = usePathname()

  return (
    <nav className="sticky top-0 h-screen w-40 shrink-0 flex flex-col gap-1 bg-pale-oak/90 backdrop-blur-sm px-4 py-8">
      <p className="px-3 pb-6 text-xs font-bold uppercase tracking-wide text-almond-cream/50">
        Menu
      </p>
      {TABS.map((tab) => {
        // ACTION: highlight the tab matching the current route.
        const isActive = pathname === tab.href
        return (
          <Link
            key={tab.href}
            href={tab.href}
            // COLORS: `border-wheat text-wheat` = active tab, `text-almond-cream/70` = inactive.
            // `hover:border-tan` controls the hover accent.
            className={
              'px-3 py-2 rounded-md text-sm font-medium border-l-2 transition-colors ' +
              (isActive
                ? 'border-wheat text-wheat bg-almond-cream/10'
                : 'border-transparent text-almond-cream/70 hover:text-almond-cream hover:border-tan')
            }
          >
            {tab.label}
          </Link>
        )
      })}
    </nav>
  )
}
