'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

// ---------- types (mirror /economic-impact/annual in backend/api/api_layer.py) ----------
interface DailyPoint {
  date: string
  time_cost_usd: number
  retail_loss_usd: number
  person_hours_lost: number
  total_loss_usd: number
  cumulative_loss_usd: number
  delay_hours: number
}

interface MonthlyPoint {
  month: number
  time_cost_usd: number
  retail_loss_usd: number
  person_hours_lost: number
  total_loss_usd: number
  delay_hours: number
}

interface AnnualImpact {
  year: number
  summary: {
    total_loss_usd: number
    time_cost_usd: number
    retail_loss_usd: number
    person_hours_lost: number
    hours_in_delay: number
    avg_predicted_wait_minutes: number
    worst_month: number
  }
  daily: DailyPoint[]
  monthly: MonthlyPoint[]
  assumptions: {
    delay_threshold_minutes: number
    friction_threshold_minutes: number
    value_of_time_usd_per_hour: number
    avg_vehicle_occupancy: number
    discretionary_ratio: number
    abandonment_rate_per_10_min: number
    avg_retail_spend_usd: number
    throughput_veh_per_lane_hour: Record<string, number>
    lanes_open_by_hour: Record<string, number[]>
    lanes_open_source: 'cbp_observed' | 'default'
    lanes_open_observations: number
    weather_observed_through: string | null
    holiday_days: number
    holiday_definition: string
  }
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// Each chart is single-series (its title names it, so no legend). Color follows the entity:
// retail = categorical slot 1, time / productivity = slot 2 (pair validated light + dark).
const RETAIL_COLOR = 'var(--series-1)'
const TIME_COLOR = 'var(--series-2)'
const FULL_TIME_HOURS_PER_YEAR = 2080 // 40 h x 52 weeks, to express hours as full-time jobs

// COLORS: chart tokens. Dark values are their own validated steps, not a flip.
// COLORS: chart tokens reuse the site tokens (globals.css); the two series hues are the
// validated categorical pair, stepped separately for light and dark.
const VIZ_STYLE = `
.viz-root {
  --surface-1: var(--surface);
  --text-primary: var(--ink);
  --text-secondary: var(--ink-2);
  --text-muted: var(--ink-3);
  --grid: var(--line);
  --axis: #d0d5dd;
  --series-1: #2a78d6;
  --series-2: #eb6834;
}
@media (prefers-color-scheme: dark) {
  .viz-root {
    --axis: #3a414c;
    --series-1: #3987e5;
    --series-2: #d95926;
  }
}
`

// ---------- helpers ----------
function usd(value: number) {
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
}

function usdCompact(value: number) {
  if (Math.abs(value) >= 1e6) return `$${(value / 1e6).toFixed(value >= 1e7 ? 0 : 1)}M`
  if (Math.abs(value) >= 1e3) return `$${Math.round(value / 1e3)}K`
  return `$${Math.round(value)}`
}

function niceTicks(max: number, count = 4): number[] {
  if (max <= 0) return [0]
  const raw = max / count
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw
  const ticks: number[] = []
  for (let v = 0; v <= max + step * 0.001; v += step) ticks.push(v)
  if (ticks[ticks.length - 1] < max) ticks.push(ticks[ticks.length - 1] + step)
  return ticks
}

function formatDate(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  return `${MONTHS[m - 1]} ${d}, ${y}`
}

// Path for a bar whose top (data end) has 4px rounded corners and whose base is square.
function roundedTopBar(x: number, y: number, w: number, h: number, r = 4) {
  if (h <= 0) return ''
  const rr = Math.min(r, w / 2, h)
  return `M${x},${y + h} V${y + rr} Q${x},${y} ${x + rr},${y} H${x + w - rr} Q${x + w},${y} ${x + w},${y + rr} V${y + h} Z`
}

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    if (!ref.current) return
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    ro.observe(ref.current)
    return () => ro.disconnect()
  }, [])
  return [ref, width] as const
}

// ---------- shared pieces ----------
function Tooltip({ x, y, width, children }: { x: number; y: number; width: number; children: React.ReactNode }) {
  const TIP_W = 200
  const left = Math.min(Math.max(x + 12, 0), Math.max(width - TIP_W, 0))
  return (
    <div
      className="pointer-events-none absolute z-10 rounded-md border px-3 py-2 text-xs shadow-lg"
      style={{
        left,
        top: y,
        width: TIP_W,
        background: 'var(--surface-1)',
        borderColor: 'var(--grid)',
        color: 'var(--text-primary)',
      }}
    >
      {children}
    </div>
  )
}

function TipRow({ color, label, value }: { color?: string; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="inline-flex items-center gap-1.5" style={{ color: 'var(--text-secondary)' }}>
        {color && <span className="inline-block h-2 w-2 rounded-sm" style={{ background: color }} />}
        {label}
      </span>
      <span className="font-mono">{value}</span>
    </div>
  )
}

// ---------- generic single-series charts ----------
interface SeriesSpec {
  label: string // tooltip label for the value
  color: string
  format: (v: number) => string // full value (tooltip)
  formatCompact: (v: number) => string // axis ticks + end label
}

// Cumulative (compound) total of a daily measure across the year.
function CumulativeChart({ points: daily, spec, ariaLabel }: {
  points: { date: string; value: number }[]
  spec: SeriesSpec
  ariaLabel: string
}) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const height = 280
  const m = { top: 12, right: 72, bottom: 28, left: 56 }
  const innerW = Math.max(width - m.left - m.right, 10)
  const innerH = height - m.top - m.bottom

  const points = useMemo(() => {
    let running = 0
    return daily.map((d) => {
      running += d.value
      return { date: d.date, cum: running, day: d.value }
    })
  }, [daily])

  const last = points[points.length - 1]
  const ticks = niceTicks(last ? last.cum : 0)
  const yMax = ticks[ticks.length - 1] || 1
  const x = (i: number) => m.left + (points.length > 1 ? (i / (points.length - 1)) * innerW : 0)
  const y = (v: number) => m.top + innerH - (v / yMax) * innerH

  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i)},${y(p.cum)}`).join(' ')
  const area = `${line} L${x(points.length - 1)},${y(0)} L${x(0)},${y(0)} Z`

  const monthStarts = points
    .map((p, i) => ({ i, month: Number(p.date.slice(5, 7)), day: Number(p.date.slice(8, 10)) }))
    .filter((p) => p.day === 1)

  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const rel = (e.clientX - rect.left) / rect.width
    setHover(Math.round(Math.min(Math.max(rel, 0), 1) * (points.length - 1)))
  }
  const hp = hover !== null ? points[hover] : null

  return (
    <div ref={ref} className="relative w-full">
      {width > 0 && last && (
        <svg width={width} height={height} role="img" aria-label={ariaLabel}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={m.left} x2={m.left + innerW} y1={y(t)} y2={y(t)} stroke="var(--grid)" strokeWidth={1} />
              <text x={m.left - 8} y={y(t)} dy="0.32em" textAnchor="end" fontSize={11} fill="var(--text-muted)">
                {spec.formatCompact(t)}
              </text>
            </g>
          ))}
          {monthStarts.map((ms) => (
            <text key={ms.i} x={x(ms.i)} y={height - 8} textAnchor="start" fontSize={11} fill="var(--text-muted)">
              {MONTHS[ms.month - 1]}
            </text>
          ))}
          <path d={area} fill={spec.color} opacity={0.18} />
          <path d={line} fill="none" stroke={spec.color} strokeWidth={2} strokeLinejoin="round" />
          <line x1={m.left} x2={m.left + innerW} y1={y(0)} y2={y(0)} stroke="var(--axis)" strokeWidth={1} />

          {/* direct label on the end value */}
          <text x={m.left + innerW + 8} y={y(last.cum)} dy="0.32em" fontSize={11} fill="var(--text-secondary)">
            {spec.formatCompact(last.cum)}
          </text>

          {hp && hover !== null && (
            <g pointerEvents="none">
              <line x1={x(hover)} x2={x(hover)} y1={m.top} y2={m.top + innerH} stroke="var(--text-muted)" strokeWidth={1} />
              <circle cx={x(hover)} cy={y(hp.cum)} r={4} fill={spec.color} stroke="var(--surface-1)" strokeWidth={2} />
            </g>
          )}
          <rect
            x={m.left}
            y={m.top}
            width={innerW}
            height={innerH}
            fill="transparent"
            onPointerMove={onMove}
            onPointerLeave={() => setHover(null)}
          />
        </svg>
      )}
      {hp && hover !== null && (
        <Tooltip x={x(hover)} y={m.top} width={width}>
          <p className="mb-1 font-medium">Through {formatDate(hp.date)}</p>
          <TipRow color={spec.color} label={`Cumulative ${spec.label.toLowerCase()}`} value={spec.format(hp.cum)} />
          <TipRow label="That day" value={spec.format(hp.day)} />
        </Tooltip>
      )}
    </div>
  )
}

// One bar per month for a measure; `extra` rows are shown in the tooltip only.
function MonthlyChart({ bars, spec, ariaLabel }: {
  bars: { month: number; value: number; extra?: { label: string; value: string }[] }[]
  spec: SeriesSpec
  ariaLabel: string
}) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const height = 220
  const m = { top: 12, right: 8, bottom: 28, left: 56 }
  const innerW = Math.max(width - m.left - m.right, 10)
  const innerH = height - m.top - m.bottom
  const ticks = niceTicks(Math.max(...bars.map((d) => d.value), 0))
  const yMax = ticks[ticks.length - 1] || 1
  const band = innerW / Math.max(bars.length, 1)
  const barW = Math.min(band * 0.6, 40)
  const y = (v: number) => m.top + innerH - (v / yMax) * innerH

  const hd = hover !== null ? bars[hover] : null

  return (
    <div ref={ref} className="relative w-full">
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={ariaLabel}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={m.left} x2={m.left + innerW} y1={y(t)} y2={y(t)} stroke="var(--grid)" strokeWidth={1} />
              <text x={m.left - 8} y={y(t)} dy="0.32em" textAnchor="end" fontSize={11} fill="var(--text-muted)">
                {spec.formatCompact(t)}
              </text>
            </g>
          ))}
          {bars.map((d, i) => {
            const cx = m.left + band * i + band / 2
            const barH = y(0) - y(d.value)
            return (
              <g
                key={d.month}
                tabIndex={0}
                aria-label={`${MONTHS[d.month - 1]}: ${spec.format(d.value)}`}
                onPointerEnter={() => setHover(i)}
                onPointerLeave={() => setHover(null)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
                style={{ outline: 'none' }}
              >
                {/* hit target bigger than the mark: the whole column */}
                <rect x={m.left + band * i} y={m.top} width={band} height={innerH} fill="transparent" />
                <path
                  d={roundedTopBar(cx - barW / 2, y(0) - barH, barW, barH)}
                  fill={spec.color}
                  opacity={hover === null || hover === i ? 1 : 0.55}
                />
                <text x={cx} y={height - 8} textAnchor="middle" fontSize={11} fill="var(--text-muted)">
                  {MONTHS[d.month - 1]}
                </text>
              </g>
            )
          })}
          <line x1={m.left} x2={m.left + innerW} y1={y(0)} y2={y(0)} stroke="var(--axis)" strokeWidth={1} />
        </svg>
      )}
      {hd && hover !== null && (
        <Tooltip x={m.left + band * hover + band / 2} y={m.top} width={width}>
          <p className="mb-1 font-medium">{MONTHS[hd.month - 1]}</p>
          <TipRow color={spec.color} label={spec.label} value={spec.format(hd.value)} />
          {hd.extra?.map((e) => <TipRow key={e.label} label={e.label} value={e.value} />)}
        </Tooltip>
      )}
    </div>
  )
}

// ---------- page building blocks ----------
function StatTiles({ tiles }: { tiles: { label: string; value: string; hero?: boolean }[] }) {
  return (
    <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
      {tiles.map((t) => (
        <div key={t.label} className="card card-pad">
          <p className="eyebrow">{t.label}</p>
          <p className={`mt-2 font-mono text-ink ${t.hero ? 'text-3xl' : 'text-2xl'}`}>{t.value}</p>
        </div>
      ))}
    </div>
  )
}

function ChartCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="card card-pad">
      <div className="mb-4">
        <h3 className="text-base font-semibold text-ink">{title}</h3>
        {subtitle && <p className="mt-0.5 text-xs text-ink-3">{subtitle}</p>}
      </div>
      {children}
    </section>
  )
}

function SectionHeading({ step, title, subtitle }: { step: string; title: string; subtitle: string }) {
  return (
    <div className="pt-6">
      <p className="eyebrow">{step}</p>
      <h2 className="mt-1 text-xl font-semibold tracking-tight text-ink">{title}</h2>
      <p className="mt-1 text-sm text-ink-2">{subtitle}</p>
    </div>
  )
}

// Assumptions card shown right after each section: the formula, then each parameter.
function Assumptions({ title, formula, items, note }: {
  title: string
  formula: React.ReactNode
  items: { label: string; value: string; wide?: boolean }[]
  note?: string
}) {
  return (
    <section className="card card-pad bg-surface-muted">
      <h3 className="text-base font-semibold text-ink">{title}</h3>
      <div className="mt-3 rounded-lg border border-line bg-surface px-4 py-3 font-mono text-xs leading-relaxed text-ink">
        {formula}
      </div>
      <dl className="mt-4 grid gap-x-6 gap-y-3 sm:grid-cols-2">
        {items.map((item) => (
          <div
            key={item.label}
            className={`flex items-baseline justify-between gap-4 border-b border-line pb-2 ${item.wide ? 'sm:col-span-2' : ''}`}
          >
            <dt className="text-sm text-ink-2">{item.label}</dt>
            <dd className="shrink-0 font-mono text-sm text-ink">{item.value}</dd>
          </div>
        ))}
      </dl>
      {note && <p className="mt-3 text-xs text-ink-3">{note}</p>}
    </section>
  )
}

function DataTable({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  return (
    <details className="mt-4 text-xs text-ink-2">
      <summary className="cursor-pointer select-none hover:text-accent">Show data table</summary>
      <table className="mt-2 w-full text-left font-mono">
        <thead className="text-ink-3">
          <tr>
            {head.map((h, i) => (
              <th key={h} className={`py-1.5 font-sans font-medium ${i ? 'text-right' : ''}`}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="text-ink">
          {rows.map((r) => (
            <tr key={String(r[0])} className="border-t border-line">
              {r.map((c, i) => (
                <td key={i} className={`py-1.5 ${i ? 'text-right' : 'font-sans'}`}>{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  )
}

function hoursCompact(v: number) {
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M h`
  if (v >= 1e3) return `${Math.round(v / 1e3)}K h`
  return `${Math.round(v)} h`
}

// ---------- page ----------
export default function ImpactPage() {
  const [data, setData] = useState<AnnualImpact | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/annual-impact', { cache: 'no-store' })
      .then(async (res) => {
        const body = await res.json()
        if (!res.ok) throw new Error(body.detail || `Request failed (${res.status})`)
        setData(body)
      })
      .catch((e) => setError(e.message || 'Could not load the annual impact.'))
  }, [])

  const a = data?.assumptions
  const retailSpec: SeriesSpec = { label: 'Retail loss', color: RETAIL_COLOR, format: usd, formatCompact: usdCompact }
  const timeSpec: SeriesSpec = { label: 'Productivity lost', color: TIME_COLOR, format: usd, formatCompact: usdCompact }
  const hoursSpec: SeriesSpec = {
    label: 'Person-hours lost',
    color: TIME_COLOR,
    format: (v) => `${Math.round(v).toLocaleString('en-US')} h`,
    formatCompact: hoursCompact,
  }
  const worstRetailMonth = data
    ? data.monthly.reduce((w, d) => (d.retail_loss_usd > w.retail_loss_usd ? d : w), data.monthly[0]).month
    : 1

  const pct = (v: number) => `${+(v * 100).toFixed(2)}%`
  const flowValue = a
    ? Object.entries(a.throughput_veh_per_lane_hour)
        .map(([lane, mu]) => `${mu} (${lane})`)
        .join(', ')
    : ''
  const lanesNote = a
    ? `Open lanes: ${
        a.lanes_open_source === 'cbp_observed'
          ? `average of ${a.lanes_open_observations} CBP readings by hour of day (unobserved hours use the lane’s overall average)`
          : 'default profile until the pipeline collects CBP readings'
      }. Holidays: ${a.holiday_days} days of the year count as holidays (${a.holiday_definition}). Wait times are model predictions, not observed history; weather observed through ${
        a.weather_observed_through ?? 'n/a'
      }, later days use the same day of the previous year.`
    : ''

  return (
    <main className="page">
      <style>{VIZ_STYLE}</style>
      <div className="max-w-4xl mx-auto">
        <header className="page-header">
          <h1 className="page-title">Annual Cost of Delay</h1>
          <p className="page-subtitle">
            What passenger-vehicle delays at the Bridge of the Americas (BOTA) cost over a year
            {data ? ` in ${data.year}` : ''}.
          </p>
        </header>

        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        {!data && !error && <p className="text-sm text-ink-3">Calculating every hour of the year…</p>}

        {data && a && (
          <div className="viz-root space-y-4">
            {/* ----- 1. lost productivity ----- */}
            <SectionHeading
              step="1 Lost productivity"
              title="Time lost in line, translated to money"
              subtitle={`Every person-hour spent waiting past ${a.delay_threshold_minutes} min, valued at $${a.value_of_time_usd_per_hour}/hour.`}
            />
            <StatTiles
              tiles={[
                { label: 'Productivity lost', value: usdCompact(data.summary.time_cost_usd), hero: true },
                { label: 'Person-hours lost', value: hoursCompact(data.summary.person_hours_lost) },
                {
                  label: 'Full-time jobs equivalent',
                  value: Math.round(data.summary.person_hours_lost / FULL_TIME_HOURS_PER_YEAR).toLocaleString('en-US'),
                },
              ]}
            />
            <ChartCard
              title="Cumulative productivity lost through the year"
              subtitle="Value of the time travelers spend waiting past the delay threshold."
            >
              <CumulativeChart
                points={data.daily.map((d) => ({ date: d.date, value: d.time_cost_usd }))}
                spec={timeSpec}
                ariaLabel="Cumulative productivity lost to passenger-vehicle delays over the year"
              />
            </ChartCard>
            <ChartCard title="Person-hours lost by month">
              <MonthlyChart
                bars={data.monthly.map((d) => ({
                  month: d.month,
                  value: d.person_hours_lost,
                  extra: [{ label: 'Productivity lost', value: usd(d.time_cost_usd) }],
                }))}
                spec={hoursSpec}
                ariaLabel="Monthly person-hours lost to passenger-vehicle delays"
              />
              <DataTable
                head={['Month', 'Person-hours lost', 'Productivity lost']}
                rows={data.monthly.map((d) => [
                  MONTHS[d.month - 1],
                  Math.round(d.person_hours_lost).toLocaleString('en-US'),
                  usd(d.time_cost_usd),
                ])}
              />
            </ChartCard>
            <Assumptions
              title="Assumptions on lost productivity"
              formula={
                <>
                  flow = open lanes × μ
                  <br />
                  person-hours = flow × occupancy × (wait − {a.delay_threshold_minutes} min) ÷ 60
                  <br />
                  productivity lost = person-hours × value of time
                </>
              }
              items={[
                { label: 'Delay threshold', value: `${a.delay_threshold_minutes} min` },
                { label: 'Value of time', value: `$${a.value_of_time_usd_per_hour} / person-hour` },
                { label: 'Vehicle occupancy', value: `${a.avg_vehicle_occupancy} people` },
                { label: 'Full-time job', value: `${FULL_TIME_HOURS_PER_YEAR.toLocaleString('en-US')} h / year` },
                { label: 'μ, vehicles per lane per hour', value: flowValue, wide: true },
              ]}
              note={lanesNote}
            />

            {/* ----- 2. retail loss ----- */}
            <SectionHeading
              step="2 Retail loss"
              title="Shopping trips that never happen because of the wait"
              subtitle={`Past ${a.friction_threshold_minutes} min, some discretionary crossers give up the trip, and their spending with it.`}
            />
            <StatTiles
              tiles={[
                { label: 'Annual retail loss', value: usdCompact(data.summary.retail_loss_usd), hero: true },
                { label: 'Hours in delay', value: data.summary.hours_in_delay.toLocaleString('en-US') },
                { label: 'Worst month', value: MONTHS[worstRetailMonth - 1] },
              ]}
            />
            <ChartCard
              title="Cumulative retail loss through the year"
              subtitle={`Every hour with a predicted wait over ${a.friction_threshold_minutes} min adds forgone shopping trips to the running total.`}
            >
              <CumulativeChart
                points={data.daily.map((d) => ({ date: d.date, value: d.retail_loss_usd }))}
                spec={retailSpec}
                ariaLabel="Cumulative retail loss from passenger-vehicle delays over the year"
              />
            </ChartCard>
            <ChartCard title="Retail loss by month">
              <MonthlyChart
                bars={data.monthly.map((d) => ({
                  month: d.month,
                  value: d.retail_loss_usd,
                  extra: [{ label: 'Hours in delay', value: String(d.delay_hours) }],
                }))}
                spec={retailSpec}
                ariaLabel="Monthly retail loss from passenger-vehicle delays"
              />
              <DataTable
                head={['Month', 'Retail loss', 'Hours in delay']}
                rows={data.monthly.map((d) => [MONTHS[d.month - 1], usd(d.retail_loss_usd), d.delay_hours])}
              />
            </ChartCard>
            <Assumptions
              title="Assumptions on retail loss"
              formula={
                <>
                  flow = open lanes × μ
                  <br />
                  abandon rate = {pct(a.abandonment_rate_per_10_min)} × (wait − {a.friction_threshold_minutes} min) ÷ 10
                  <br />
                  retail loss = flow × discretionary share × abandon rate × spend per crosser
                </>
              }
              items={[
                { label: 'Abandonment threshold', value: `${a.friction_threshold_minutes} min` },
                { label: 'Trips abandoned', value: `${pct(a.abandonment_rate_per_10_min)} per 10 min` },
                { label: 'Discretionary crossers', value: pct(a.discretionary_ratio) },
                { label: 'Retail spend per crosser', value: `$${a.avg_retail_spend_usd}` },
                { label: 'μ, vehicles per lane per hour', value: flowValue, wide: true },
              ]}
              note={lanesNote}
            />
          </div>
        )}
      </div>
    </main>
  )
}
