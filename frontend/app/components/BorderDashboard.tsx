'use client'

import dynamic from 'next/dynamic'
import { useState } from 'react'
import { PORTS, WAIT_TAG, waitLevel, WaitTime } from '../lib/waitTimes'

// ACTION: BorderMap uses `window`/`document` (Leaflet), so it's loaded client-only
// (`ssr: false`) to avoid breaking server rendering. `loading` is what shows
// while the map's JS chunk is being fetched.
const BorderMap = dynamic(() => import('./BorderMap'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center text-sm text-blackberry-cream/50">
      Loading map...
    </div>
  ),
})

interface BorderDashboardProps {
  data: WaitTime[]
}

// LAYOUT: the main dashboard card — a two-column panel (port list left, map or
// port detail right) that is deliberately solid white (`bg-white`) rather than
// the translucent/frosted look used elsewhere in the app, so it reads as a
// focal "control panel" over the background photo.
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
    // `sm:flex-row` on larger screens (side-by-side). `rounded-2xl`/`shadow-xl`
    // give it the "card floating over the photo" look.
    <div className="mb-8 flex flex-col overflow-hidden rounded-2xl bg-white shadow-xl sm:flex-row">
      {/* LAYOUT: left-hand port list. Fixed width on sm+ (`sm:w-56`); on mobile it
          becomes a horizontally-scrolling row of buttons instead (see the inner div). */}
      <div className="shrink-0 border-b border-blackberry-cream/10 p-4 sm:w-56 sm:border-b-0 sm:border-r">
        <p className="px-2 pb-3 text-xs font-semibold uppercase tracking-wide text-blackberry-cream/50">
          Ports of Entry
        </p>
        <div className="flex gap-1 overflow-x-auto sm:flex-col sm:overflow-visible">
          {/* ACTION: resets to the map view. */}
          {/* COLORS: `bg-blackberry-cream text-white` = selected row, `text-blackberry-cream/70` = unselected. */}
          <button
            onClick={() => setSelectedPort(null)}
            className={
              'shrink-0 whitespace-nowrap rounded-md px-3 py-2 text-left text-sm font-medium transition-colors ' +
              (selectedPort === null
                ? 'bg-blackberry-cream text-white'
                : 'text-blackberry-cream/70 hover:bg-blackberry-cream/5 hover:text-blackberry-cream')
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
                  ? 'bg-blackberry-cream text-white'
                  : 'text-blackberry-cream/70 hover:bg-blackberry-cream/5 hover:text-blackberry-cream')
              }
            >
              {port.name}
            </button>
          ))}
        </div>
      </div>

      {/* LAYOUT: right-hand panel — fills remaining width (`flex-1`), fixed minimum
          height (`min-h-[420px]`) so the map has room to render. */}
      <div className="relative min-h-[420px] flex-1">
        {selectedPort === null ? (
          <BorderMap onSelectPort={setSelectedPort} selectedPort={selectedPort} />
        ) : (
          <div className="h-full overflow-y-auto p-5">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-medium text-blackberry-cream">{selectedPort}</h3>
              {/* ACTION: same as clicking "Map overview" above. */}
              <button
                onClick={() => setSelectedPort(null)}
                className="text-sm font-medium text-blackberry-cream/60 hover:text-blackberry-cream"
              >
                ← Back to map
              </button>
            </div>

            {portRows.length === 0 && (
              <p className="text-sm text-blackberry-cream/50">No wait time data available right now.</p>
            )}

            {/* LAYOUT: one sub-section per crossing type (e.g. Passenger Vehicle,
                Pedestrian), each a 2-column grid of lane cards on sm+ screens. */}
            {Object.entries(groupedByCrossing).map(([crossingType, rows]) => (
              <div key={crossingType} className="mb-4">
                <h4 className="mb-2 text-sm font-medium uppercase tracking-wide text-blackberry-cream/50">
                  {crossingType}
                </h4>
                {/* LAYOUT: `auto-fit`/`minmax` sizes columns off the *actual* space available
                    here, not the browser viewport — a plain `sm:grid-cols-2` would force 2
                    columns any time the viewport is wide, even when the sidebar has left this
                    panel too narrow for that, which is what caused the squeezed/broken text. */}
                <div className="grid gap-2 grid-cols-[repeat(auto-fit,minmax(180px,1fr))]">
                  {rows.map((row) => {
                    // COLORS: `tag.border`/`tag.text` (from WAIT_TAG in lib/waitTimes.ts)
                    // drive the card's left-accent color and status text color.
                    const level = waitLevel(row.wait_time_minutes)
                    const tag = WAIT_TAG[level]
                    return (
                      <div
                        key={`${row.crossing_type}-${row.lane_type}`}
                        className={`flex items-center justify-between rounded-lg border border-blackberry-cream/10 bg-almond-cream/40 border-l-4 ${tag.border} px-4 py-3`}
                      >
                        {/* LAYOUT: `min-w-0` lets this side shrink below its content's natural
                            width (the flexbox default of `min-width: auto` would otherwise refuse
                            to shrink and force an overflow); `break-words` lets long unbroken
                            tokens like "NEXUS/SENTRI" wrap instead of spilling past the card edge. */}
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-blackberry-cream break-words">{row.lane_type}</p>
                          <p className="text-xs text-blackberry-cream/60 break-words">{row.status}</p>
                        </div>
                        {/* LAYOUT: `shrink-0` keeps the number column at full size — the lane
                            name on the left is the side that gives way and wraps. */}
                        <div className="shrink-0 text-right pl-3">
                          <p className="text-2xl font-mono text-blackberry-cream">
                            {row.wait_time_minutes}
                            <span className="text-sm font-sans"> min</span>
                          </p>
                          <p className={`text-xs font-medium ${tag.text}`}>{tag.label}</p>
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
