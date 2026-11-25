'use client'

import dynamic from 'next/dynamic'
import { useState } from 'react'
import { PORTS, WaitTime } from '../lib/waitTimes'

// ACTION: BorderMap uses `window`/`document` (Leaflet), so it's loaded client-only
// (`ssr: false`) to avoid breaking server rendering. `loading` is what shows
// while the map's JS chunk is being fetched.
const BorderMap = dynamic(() => import('./BorderMap'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center text-sm text-ink-3">
      Loading map...
    </div>
  ),
})

interface BorderDashboardProps {
  data: WaitTime[]
}

// LAYOUT: the main dashboard card — a two-column panel (port list left, map or
// port detail right) using the shared `.card` style.
export default function BorderDashboard({ data }: BorderDashboardProps) {
  // ACTION: `null` = show the map; a port name = show that port's wait times.
  // Set by clicking a port button below or a marker on the map (see BorderMap's onSelectPort).
  const [selectedPort, setSelectedPort] = useState<string | null>(null)

  // ACTION: filters + groups the raw wait-time rows down to just the selected
  // port, then by crossing type, for the detail view rendered further down.
  const portRows = selectedPort ? data.filter((row) => row.port_name === selectedPort) : []
  const groupedByCrossing = portRows.reduce<Record<string, WaitTime[]>>((acc, row) => {
    if (!acc[row.crossing_type]) acc[row.crossing_type] = []
    acc[row.crossing_type].push(row)
    return acc
  }, {})
  return (
    // LAYOUT: `flex-col` on mobile (port list stacks above the map/detail area),
    // `sm:flex-row` on larger screens (side-by-side).
    <div className="card mb-6 flex flex-col overflow-hidden sm:flex-row">
      {/* LAYOUT: left-hand port list. Fixed width on sm+ (`sm:w-56`); on mobile it
          becomes a horizontally-scrolling row of buttons instead (see the inner div). */}
      <div className="shrink-0 border-b border-line p-2 sm:w-56 sm:border-b-0 sm:border-r sm:p-4">
        <p className="eyebrow hidden px-3 pb-3 sm:block">
          Ports of Entry
        </p>
        <div className="flex gap-1 overflow-x-auto sm:flex-col sm:overflow-visible">
          {/* ACTION: resets to the map view. */}
          {/* COLORS: `bg-accent-soft text-accent` = selected row, `text-ink-2` = unselected. */}
          <button
            onClick={() => setSelectedPort(null)}
            className={
              'shrink-0 whitespace-nowrap rounded-md px-3 py-2 text-left text-sm font-medium transition-colors ' +
              (selectedPort === null
                ? 'bg-accent-soft text-accent'
                : 'text-ink-2 hover:bg-surface-muted hover:text-ink')
            }
          >
            Map overview
          </button>
          {/* ACTION: selects a port, which swaps the right-hand panel to its wait-time detail. */}
          {PORTS.map((port) => (
            <button
              key={port.name}
              onClick={() => setSelectedPort(port.name)}
              className={
                'shrink-0 whitespace-nowrap sm:whitespace-normal rounded-md px-3 py-2 text-left text-sm font-medium transition-colors ' +
                (selectedPort === port.name
                  ? 'bg-accent-soft text-accent'
                  : 'text-ink-2 hover:bg-surface-muted hover:text-ink')
              }
            >
              {port.name}
            </button>
          ))}
        </div>
      </div>

      {/* LAYOUT: right-hand panel — fills remaining width (`flex-1`), fixed minimum
          height (`min-h-[420px]`) so the map has room to render. */}
      {/* Phones get a fixed 320px height: the map's `h-full` needs a definite parent height,
          which a min-height alone doesn't give in the stacked (flex-col) layout. `flex-1` only
          from sm up — in a column its 0 flex-basis would override the height and collapse it. */}
      <div className="relative h-[320px] sm:h-auto sm:min-h-[420px] sm:flex-1">
        {selectedPort === null ? (
          <BorderMap onSelectPort={setSelectedPort} selectedPort={selectedPort} />
        ) : (
          <div className="h-full overflow-y-auto p-5">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="section-title">{selectedPort}</h3>
              {/* ACTION: same as clicking "Map overview" above. */}
              <button
                onClick={() => setSelectedPort(null)}
                className="text-sm font-medium text-ink-3 hover:text-accent"
              >
                ← Back to map
              </button>
            </div>

            {portRows.length === 0 && (
              <p className="text-sm text-ink-3">No wait time data available right now.</p>
            )}

            {/* LAYOUT: one sub-section per crossing type (e.g. Passenger Vehicle,
                Pedestrian), each a 2-column grid of lane cards on sm+ screens. */}
            {Object.entries(groupedByCrossing).map(([crossingType, rows]) => (
              <div key={crossingType} className="mb-4">
                <h4 className="eyebrow mb-2">
                  {crossingType}
                </h4>
                {/* LAYOUT: `auto-fit`/`minmax` sizes columns off the *actual* space available
                    here, not the browser viewport — a plain `sm:grid-cols-2` would force 2
                    columns any time the viewport is wide, even when the sidebar has left this
                    panel too narrow for that, which is what caused the squeezed/broken text. */}
                <div className="grid gap-2 grid-cols-[repeat(auto-fit,minmax(180px,1fr))]">
                  {rows.map((row) => {
                    return (
                      <div
                        key={`${row.crossing_type}-${row.lane_type}`}
                        className="flex items-center justify-between rounded-lg border border-line bg-surface px-4 py-3"
                      >
                        {/* LAYOUT: `min-w-0` lets this side shrink below its content's natural
                            width (the flexbox default of `min-width: auto` would otherwise refuse
                            to shrink and force an overflow); `break-words` lets long unbroken
                            tokens like "NEXUS/SENTRI" wrap instead of spilling past the card edge. */}
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-ink break-words">{row.lane_type}</p>
                          <p className="text-xs text-ink-3 break-words">{row.status}</p>
                        </div>
                        {/* LAYOUT: `shrink-0` keeps the number column at full size — the lane
                            name on the left is the side that gives way and wraps. */}
                        <div className="shrink-0 text-right pl-3">
                          <p className="text-2xl font-mono text-ink">
                            {row.wait_time_minutes}
                            <span className="text-sm font-sans text-ink-3"> min</span>
                          </p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
