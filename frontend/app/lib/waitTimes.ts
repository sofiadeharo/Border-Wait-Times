export interface WaitTime {
  port_id: string
  port_name: string
  crossing_type: string
  lane_type: string
  wait_time_minutes: number
  status: string
  timestamp: string
  // Set by the API for open Passenger Vehicle lanes only; null otherwise.
  economic_impact?: EconomicImpact | null
}

// Cost of one hour at this wait (see backend/Economic_Ratios/getting_ratios.py).
// Passenger lanes -> time + retail loss; commercial lanes -> productivity + freight loss.
export interface EconomicImpact {
  delay_category: 'passenger' | 'commercial'
  is_delay: boolean
  wait_minutes: number
  excess_delay_minutes: number
  delay_threshold_minutes: number
  vehicles_per_hour: number
  total_loss_usd: number
  basis: 'per_hour'
  // passenger
  time_cost_usd?: number
  retail_loss_usd?: number
  // commercial
  productivity_cost_usd?: number
  cargo_in_transit_cost_usd?: number
  late_delivery_cost_usd?: number
}

export function formatUsd(value: number): string {
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
}

// ACTION: statuses that mean the lane isn't actually operating — CBP reports
// these with wait_time_minutes = 0, which looks like a fast crossing but
// really means there's no crossing happening at all. Filter these out before
// computing "fastest"/"slowest" anywhere in the app.
const NON_OPERATIONAL_STATUSES = new Set(['Lanes Closed', 'N/A'])

export function isLaneOpen(row: WaitTime): boolean {
  return !NON_OPERATIONAL_STATUSES.has(row.status)
}

export type WaitLevel = 'light' | 'expected' | 'heavy'

// ACTION: classifies a raw minute count into a wait-level bucket. Change the
// 60/30 thresholds here to redefine what counts as "heavy" vs "light" everywhere.
export function waitLevel(minutes: number): WaitLevel {
  if (minutes >= 60) return 'heavy'
  if (minutes <= 30) return 'light'
  return 'expected'
}

// COLORS: label + Tailwind classes used to render each wait level (legend dots,
// card left-border accent, status text). Edit the class strings here to restyle
// every wait-time card/tag across the app in one place.
export const WAIT_TAG: Record<WaitLevel, { label: string; text: string; dot: string; border: string }> = {
  light: {
    label: 'Light',
    text: 'text-green-700 dark:text-green-400',
    dot: 'bg-green-600',
    border: 'border-l-green-600',
  },
  expected: {
    label: 'Expected',
    text: 'text-blue-700 dark:text-blue-400',
    dot: 'bg-blue-600',
    border: 'border-l-blue-600',
  },
  heavy: {
    label: 'Heavy',
    text: 'text-red-900 dark:text-red-400',
    dot: 'bg-red-600',
    border: 'border-l-red-600',
  },
}

// LAYOUT: ports shown in the dashboard's port list and as markers on the map.
// `name` must match the `port_name` values returned by the API exactly. Add or
// remove entries here to change which ports appear in both places.
// Coordinates = each US port of entry (OpenStreetMap border_control points).
export const PORTS: { name: string; short: string; lat: number; lng: number }[] = [
  { name: 'Bridge of the Americas (BOTA)', short: 'BOTA', lat: 31.7669, lng: -106.4512 },
  { name: 'Paso Del Norte (PDN)', short: 'Paso Del Norte', lat: 31.75, lng: -106.4867 },
  { name: 'Ysleta', short: 'Ysleta', lat: 31.6722, lng: -106.3355 },
  { name: 'Santa Teresa', short: 'Santa Teresa', lat: 31.7852, lng: -106.68 },
]
