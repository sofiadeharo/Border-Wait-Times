'use client'

import { useState } from 'react'

import { EconomicImpact, formatUsd } from '../lib/waitTimes'

interface Assumptions {
  model: string
  holiday_definition: string
  daily_volume: number
  hours_per_day: number
  delay_threshold_minutes: number
  value_of_time_usd_per_hour: number
  avg_vehicle_occupancy: number
  friction_threshold_minutes: number
  abandonment_rate_per_10_min: number
  discretionary_ratio: number
  avg_retail_spend_usd: number
}

interface PredictionResult {
  predicted_wait_minutes: number
  features_used: Record<string, number>
  day_context: Record<string, boolean | string | null>
  economic_impact: EconomicImpact
  assumptions: Assumptions
}

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

function nowLocalDate() {
  const d = new Date()
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 10)
}

const num = (v: number, digits = 1) => v.toLocaleString('en-US', { maximumFractionDigits: digits })
const pct = (v: number) => `${+(v * 100).toFixed(2)}%`
const hourLabel = (h: number) => `${String(h).padStart(2, '0')}:00`

// LAYOUT: one "input → value" row in the "What the model used" list.
function InputRow({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-line py-2">
      <dt className="text-sm text-ink-2">
        {label}
        {note && <span className="block text-xs text-ink-3">{note}</span>}
      </dt>
      <dd className="shrink-0 text-right font-mono text-sm text-ink">{value}</dd>
    </div>
  )
}

// LAYOUT: one numbered calculation step: what it is + formula with numbers, result on the right.
function Step({ n, title, formula, result }: { n: number; title: string; formula: string; result: string }) {
  return (
    <li className="grid grid-cols-[1.5rem_1fr_auto] items-baseline gap-x-3 border-b border-line py-2.5">
      <span className="font-mono text-xs text-ink-3">{n}</span>
      <div className="min-w-0">
        <p className="text-sm text-ink">{title}</p>
        <p className="mt-0.5 break-words font-mono text-xs text-ink-2">{formula}</p>
      </div>
      <span className="font-mono text-sm text-ink">{result}</span>
    </li>
  )
}

export default function PlaygroundPage() {
  const [date, setDate] = useState(nowLocalDate())
  const [hour, setHour] = useState(new Date().getHours())
  const [isReadyLane, setIsReadyLane] = useState(false)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<PredictionResult | null>(null)

  const getPrediction = async () => {
    setLoading(true)
    setError(null)
    setResult(null)

    const params = new URLSearchParams({
      date,
      hour: String(hour),
      es_ready_lane: isReadyLane ? '1' : '0',
    })

    try {
      const res = await fetch(`/api/predict?${params.toString()}`, { cache: 'no-store' })
      if (!res.ok) {
        let errorMessage = `Prediction failed with status: ${res.status}`
        try {
          const errorData = await res.json()
          errorMessage = errorData.detail || errorMessage
        } catch {
          // Response was not JSON, use the status text.
        }
        throw new Error(errorMessage)
      }
      const data: PredictionResult = await res.json()
      setResult(data)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not fetch prediction. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const f = result?.features_used
  const c = result?.day_context
  const a = result?.assumptions
  const ei = result?.economic_impact

  // Names behind the "Holiday" input, and other calendar context that is NOT a model input.
  const holidayNames = c
    ? [c.us_federal_holiday_name, c.mx_official_holiday_name, c.us_is_summer_vacation ? 'El Paso ISD summer vacation' : null].filter(
        Boolean,
      )
    : []
  const otherContext = c
    ? [c.mx_bridge_day_name, c.us_school_break_name, c.mx_is_summer_vacation ? 'Mexico summer vacation' : null].filter(Boolean)
    : []

  // Worked calculation — mirrors calculate_delay_cost() in backend/Economic_Ratios/getting_ratios.py.
  const wait = result?.predicted_wait_minutes ?? 0
  const flow = a ? a.daily_volume / a.hours_per_day : 0
  const excess = a ? Math.max(0, wait - a.delay_threshold_minutes) : 0
  const personHours = a ? (flow * a.avg_vehicle_occupancy * excess) / 60 : 0
  const overFriction = a ? Math.max(0, wait - a.friction_threshold_minutes) : 0
  const abandonRate = a ? Math.min(1, (a.abandonment_rate_per_10_min * overFriction) / 10) : 0

  return (
    <main className="page">
      <div className="max-w-4xl mx-auto">
        <header className="page-header">
          <h1 className="page-title">Prediction Playground</h1>
          <p className="page-subtitle">
            Pick a date and hour to see the predicted wait for passenger vehicles at the Bridge of the Americas (BOTA),
            what the model used to get there, and how the cost of that wait is calculated.
          </p>
        </header>

        {/* ---------- inputs ---------- */}
        <section className="card card-pad space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="field-label">
              Date
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="field" />
            </label>
            <label className="field-label">
              Hour (0–23)
              <input
                type="number"
                min={0}
                max={23}
                value={hour}
                onChange={(e) => setHour(Number(e.target.value))}
                className="field"
              />
            </label>
          </div>
          <label className="flex items-center gap-2 text-sm font-medium text-ink">
            <input
              type="checkbox"
              checked={isReadyLane}
              onChange={(e) => setIsReadyLane(e.target.checked)}
              className="h-4 w-4 rounded border-line accent-[var(--accent)]"
            />
            Ready Lane
          </label>

          <button onClick={getPrediction} disabled={loading} className="btn btn-primary">
            {loading ? 'Predicting…' : 'Get prediction'}
          </button>

          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        </section>

        {/* ---------- result ---------- */}
        {result && f && c && a && ei && (
          <div className="mt-6 space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="card card-pad">
                <p className="eyebrow">Predicted wait time</p>
                <p className="mt-2 font-mono text-3xl text-ink">
                  {Math.round(result.predicted_wait_minutes)}
                  <span className="font-sans text-base text-ink-3"> min</span>
                </p>
                <p className="mt-2 text-xs text-ink-2">
                  {f.es_ready_lane ? 'Ready Lane' : 'Standard lane'}, {DAYS[f.dia_semana]} {date}, {hourLabel(f.hour)}
                </p>
              </div>
              <div className="card card-pad">
                <p className="eyebrow">Estimated cost of this wait</p>
                <p className="mt-2 font-mono text-3xl text-ink">
                  {formatUsd(ei.total_loss_usd)}
                  <span className="font-sans text-base text-ink-3"> /hr</span>
                </p>
                <p className="mt-2 text-xs text-ink-2">
                  {ei.is_delay
                    ? `${num(ei.excess_delay_minutes)} min over the ${a.delay_threshold_minutes}-min delay threshold`
                    : `No delay, the predicted wait is within ${a.delay_threshold_minutes} min, so the cost is $0.`}
                </p>
              </div>
            </div>

            <section className="card card-pad">
              <h2 className="section-title">What the model used</h2>
              <p className="mt-1 text-sm text-ink-2">
                The prediction comes only from these inputs: calendar, lane, holidays, weather and traffic volume.
              </p>
              <dl className="mt-3 grid gap-x-8 sm:grid-cols-2">
                <InputRow label="Month" value={MONTHS[f.month - 1]} />
                <InputRow label="Day of week" value={`${DAYS[f.dia_semana]}${f.es_fin_semana ? ' (weekend)' : ''}`} />
                <InputRow label="Hour" value={hourLabel(f.hour)} />
                <InputRow
                  label="Rush hour"
                  value={f.hora_pico_matutina ? 'Morning (6–9)' : f.hora_pico_vespertina ? 'Evening (16–19)' : 'No'}
                />
                <InputRow label="Lane" value={f.es_ready_lane ? 'Ready Lane' : 'Standard'} />
                <InputRow
                  label="Holiday"
                  value={f.es_feriado ? 'Yes' : 'No'}
                  note={holidayNames.length ? holidayNames.join(', ') : a.holiday_definition}
                />
                <InputRow label="School semester active" value={f.semestre_activo ? 'Yes' : 'No'} note="Feb–May and Sep–Nov" />
                <InputRow
                  label="Weather"
                  value={`${num(f.hourly_temp_f, 0)}°F, ${f.is_raining ? `${num(f.precip_in, 2)} in rain` : 'no rain'}`}
                  note={String(c.weather_source ?? '')}
                />
                <InputRow label="Daily passenger vehicles" value={num(f.baseline_daily_volume_vehiculos_BOTA, 0)} />
              </dl>
              {otherContext.length > 0 && (
                <p className="mt-3 text-xs text-ink-3">
                  Also on this date (context only, not a model input): {otherContext.join(', ')}
                </p>
              )}
              {c.calendar_covers_date === false && (
                <p className="mt-3 text-xs text-ink-3">
                  This date is outside the holiday calendar, so it is treated as a normal day.
                </p>
              )}
            </section>

            <section className="card card-pad">
              <h2 className="section-title">How the cost was calculated</h2>
              <p className="mt-1 text-sm text-ink-2">
                Scenario: every BOTA passenger vehicle in that hour faces the predicted wait of{' '}
                <span className="font-mono text-ink">{num(wait)} min</span>.
              </p>
              <ol className="mt-3">
                <Step
                  n={1}
                  title="Vehicles in the hour"
                  formula={`daily vehicles ÷ ${a.hours_per_day} = ${num(a.daily_volume, 0)} ÷ ${a.hours_per_day}`}
                  result={`${num(flow)} veh`}
                />
                <Step
                  n={2}
                  title="Minutes over the delay threshold"
                  formula={`max(0, wait − ${a.delay_threshold_minutes}) = max(0, ${num(wait)} − ${a.delay_threshold_minutes})`}
                  result={`${num(excess)} min`}
                />
                <Step
                  n={3}
                  title="Person-hours lost"
                  formula={`vehicles × ${a.avg_vehicle_occupancy} people × minutes over ÷ 60 = ${num(flow)} × ${a.avg_vehicle_occupancy} × ${num(excess)} ÷ 60`}
                  result={`${num(personHours)} h`}
                />
                <Step
                  n={4}
                  title="Lost productivity (time → money)"
                  formula={`person-hours × $${a.value_of_time_usd_per_hour}/h = ${num(personHours)} × $${a.value_of_time_usd_per_hour}`}
                  result={formatUsd(ei.time_cost_usd ?? 0)}
                />
                <Step
                  n={5}
                  title="Share of trips abandoned"
                  formula={`${pct(a.abandonment_rate_per_10_min)} × max(0, wait − ${a.friction_threshold_minutes}) ÷ 10 = ${pct(a.abandonment_rate_per_10_min)} × ${num(overFriction)} ÷ 10`}
                  result={pct(abandonRate)}
                />
                <Step
                  n={6}
                  title="Lost retail spending"
                  formula={`vehicles × ${pct(a.discretionary_ratio)} discretionary × abandoned × $${a.avg_retail_spend_usd} = ${num(flow)} × ${pct(a.discretionary_ratio)} × ${pct(abandonRate)} × $${a.avg_retail_spend_usd}`}
                  result={formatUsd(ei.retail_loss_usd ?? 0)}
                />
              </ol>
              <div className="mt-3 flex items-baseline justify-between">
                <p className="text-sm font-medium text-ink">Total cost of this hour (4 + 6)</p>
                <p className="font-mono text-lg text-ink">{formatUsd(ei.total_loss_usd)}</p>
              </div>
            </section>
          </div>
        )}

        {/* ---------- always-visible explanation ---------- */}
        <section className="card card-pad mt-6">
          <h2 className="section-title">How the prediction works</h2>
          <div className="mt-3 grid gap-6 sm:grid-cols-2">
            <div className="prose-body space-y-2">
              <p>
                <span className="font-medium text-ink">What is predicted.</span> The wait, in minutes, for a passenger
                vehicle crossing northbound at the Bridge of the Americas (BOTA), in the Standard or Ready Lane, for one
                hour of one day.
              </p>
              <p>
                <span className="font-medium text-ink">How.</span> An XGBoost regression model learned how waits change
                with the hour (and rush hours), day of week, weekends, month, school semester, holidays, temperature,
                rain and daily traffic volume. For the date you pick it looks those up, holidays from the US/Mexico
                calendar, weather from Open-Meteo, and returns the expected wait.
              </p>
              <p>
                <span className="font-medium text-ink">Holidays.</span> A day counts as a holiday when it is a US federal
                holiday, a Mexican official holiday, or El Paso ISD summer vacation, the same definition the model was
                trained with.
              </p>
            </div>
            <div className="prose-body space-y-2">
              <p className="font-medium text-ink">Cost formulas (per hour)</p>
              <pre className="whitespace-pre-wrap rounded-lg border border-line bg-surface-muted px-3 py-2.5 font-mono text-xs leading-relaxed text-ink">
{`vehicles      = daily vehicles ÷ 24
minutes over  = max(0, wait − 60)
person-hours  = vehicles × 1.5 × minutes over ÷ 60
productivity  = person-hours × $17
abandoned     = 1.5% × minutes over ÷ 10
retail        = vehicles × 30% × abandoned × $75
total         = productivity + retail`}
              </pre>
              <p className="text-xs text-ink-3">
                $17/hour value of time, 1.5 people per vehicle, 30% discretionary trips and $75 spending per trip are
                assumptions, not measured data.
              </p>
            </div>
          </div>
          <div className="mt-5 rounded-lg border border-line bg-surface-muted p-4 text-sm text-ink-2">
            <span className="font-medium text-ink">Limitations.</span> This project is missing{' '}
            <span className="font-medium text-ink">real historical data</span> to train the model and validate its
            predictions, it was trained on <span className="font-medium text-ink">synthetic</span> wait times, so treat
            results as estimates. The site keeps collecting real CBP wait times and community reports to improve it over
            time.
          </div>
        </section>
      </div>
    </main>
  )
}
