'use client'

import { MapContainer, Marker, Polyline, Tooltip } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { BORDER_LINE } from '../lib/borderLine'
import { PORTS } from '../lib/waitTimes'

// COLORS: the border line color. Edit here to restyle it.
const BORDER_COLOR = '#1d4ed8'

// LAYOUT: 📍 pin for each port of entry. The tip of the pin sits on the crossing
// (anchor = bottom-center); the selected port is drawn larger.
function pinIcon(highlighted: boolean) {
  const size = highlighted ? 34 : 26
  return L.divIcon({
    className: '',
    html: `<div style="font-size:${size}px;line-height:1;filter:drop-shadow(0 1px 1px rgba(0,0,0,.25))">📍</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size],
  })
}

// LAYOUT: faint country labels so the plain white map still reads as US (north) / Mexico (south).
function countryLabel(text: string) {
  return L.divIcon({
    className: '',
    html: `<div style="font:600 11px/1 'Helvetica Neue',Arial,sans-serif;letter-spacing:.2em;color:#98a2b3;white-space:nowrap;transform:translateX(-50%)">${text}</div>`,
    iconSize: [0, 0],
  })
}

interface BorderMapProps {
  onSelectPort: (portName: string) => void
  selectedPort?: string | null
}

// LAYOUT: on phone-width screens (below Tailwind's `sm`, matching BorderDashboard's stacked
// layout) the map starts zoomed in on downtown El Paso, where BOTA and Paso Del Norte sit
// ~3 km apart and their labels would otherwise overlap. Ysleta and Santa Teresa are a pan
// or pinch away. Wider screens fit all four ports.
const PHONE_QUERY = '(max-width: 639px)'
const PHONE_FOCUS = ['BOTA', 'Paso Del Norte']

// LAYOUT: minimal map — white background (no basemap tiles), the US–Mexico border in blue,
// and a 📍 pin per crossing with its name. Bounds are fitted to the ports (see above).
// ACTION: clicking a pin calls `onSelectPort`, which BorderDashboard uses to swap the map
// out for that port's wait-time detail view.
export default function BorderMap({ onSelectPort, selectedPort }: BorderMapProps) {
  // This component only renders client-side (BorderDashboard loads it with ssr: false),
  // so `window` is available here.
  const isPhone = window.matchMedia(PHONE_QUERY).matches
  const framed = isPhone ? PORTS.filter((p) => PHONE_FOCUS.includes(p.short)) : PORTS
  const bounds = L.latLngBounds(framed.map((p) => [p.lat, p.lng] as [number, number])).pad(isPhone ? 1.2 : 0.25)

  return (
    <MapContainer
      bounds={bounds}
      scrollWheelZoom={false}
      className="h-full w-full"
      style={{ background: '#ffffff' }}
      attributionControl
    >
      <Polyline
        positions={BORDER_LINE}
        pathOptions={{ color: BORDER_COLOR, weight: 3, opacity: 0.9 }}
        attribution='Border &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      />
      <Marker position={[31.8, -106.36]} icon={countryLabel('UNITED STATES')} interactive={false} />
      <Marker position={[31.66, -106.52]} icon={countryLabel('MÉXICO')} interactive={false} />
      {PORTS.map((port) => (
        <Marker
          key={port.name}
          position={[port.lat, port.lng]}
          icon={pinIcon(port.name === selectedPort)}
          eventHandlers={{ click: () => onSelectPort(port.name) }}
        >
          <Tooltip direction="right" offset={[10, -14]} permanent>
            {port.short}
          </Tooltip>
        </Marker>
      ))}
    </MapContainer>
  )
}
