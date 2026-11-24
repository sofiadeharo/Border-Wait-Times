'use client'

import { MapContainer, TileLayer, Marker, Tooltip } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { PORTS } from '../lib/waitTimes'

// COLORS/LAYOUT: builds the dot icon used for each port marker. `background`
// is the marker fill color (hex, since it's inlined into raw HTML rather than
// a Tailwind class), `size` controls the dot's diameter in px — bumped up
// when the marker is the currently-selected port.
function portIcon(highlighted: boolean) {
  const size = highlighted ? 20 : 14
  return L.divIcon({
    className: '',
    html: `<div style="
      width:${size}px;height:${size}px;border-radius:9999px;
      background:#184e77;border:2px solid #ffffff;
      box-shadow:0 1px 4px rgba(0,0,0,0.4);
    "></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  })
}

interface BorderMapProps {
  onSelectPort: (portName: string) => void
  selectedPort?: string | null
}

// LAYOUT: the map itself — `center`/`zoom` control the initial framing (see
// PORTS in lib/waitTimes.ts for the pins plotted on it), `className="h-full
// w-full"` makes it fill whatever container it's placed in (BorderDashboard
// gives that container an explicit height). `scrollWheelZoom` is off so the
// map doesn't hijack page-scroll.
// ACTION: clicking a marker calls `onSelectPort`, which BorderDashboard uses
// to swap the map out for that port's wait-time detail view.
export default function BorderMap({ onSelectPort, selectedPort }: BorderMapProps) {
  return (
    <MapContainer
      center={[31.77, -106.45]}
      zoom={10}
      scrollWheelZoom={false}
      className="h-full w-full"
    >
      {/* COLORS/LAYOUT: base map imagery — swap the `url` to use a different tile provider/style. */}
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {PORTS.map((port) => (
        <Marker
          key={port.name}
          position={[port.lat, port.lng]}
          icon={portIcon(port.name === selectedPort)}
          eventHandlers={{ click: () => onSelectPort(port.name) }}
        >
          <Tooltip direction="top" offset={[0, -8]}>
            {port.name}
          </Tooltip>
        </Marker>
      ))}
    </MapContainer>
  )
}
