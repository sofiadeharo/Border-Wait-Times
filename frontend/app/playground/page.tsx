'use client'

import { useState } from 'react'

import { EconomicImpact, formatUsd } from '../lib/waitTimes'

interface PredictionResult {
  predicted_wait_minutes: number
  features_used: Record<string, number | boolean>
  day_context: Record<string, boolean>
  economic_impact: EconomicImpact
}

function nowLocalDate() {
  const d = new Date()
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 10)
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
        } catch (jsonError) {
          // Response was not JSON, use the status text.
        }
        throw new Error(errorMessage)
      }
      const data: PredictionResult = await res.json()
      setResult(data)
    } catch (e: any) {
      setError(e.message || 'Could not fetch prediction. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="page">
      <div className="max-w-4xl mx-auto">
        <header className="page-header">
          <h1 className="page-title">Prediction Playground</h1>
          <p className="page-subtitle">
            Experiment with the wait time prediction model for the Bridge of the Americas (BOTA).
          </p>
        </header>

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

          {result && (
            <div className="space-y-4 border-t border-line pt-5">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="rounded-lg border border-line bg-surface-muted p-4">
                  <p className="eyebrow">Predicted wait time</p>
                  <p className="mt-2 font-mono text-3xl text-ink">
                    {Math.round(result.predicted_wait_minutes)}
                    <span className="font-sans text-base text-ink-3"> min</span>
                  </p>
                </div>

                <div className="rounded-lg border border-line bg-surface-muted p-4">
                  <p className="eyebrow">Estimated cost of delay</p>
                  <p className="mt-2 font-mono text-3xl text-ink">
                    {formatUsd(result.economic_impact.total_loss_usd)}
                    <span className="font-sans text-base text-ink-3"> /hr</span>
                  </p>
                  <p className="mt-2 text-xs text-ink-2">
                    {result.economic_impact.is_delay
                      ? `${Math.round(result.economic_impact.excess_delay_minutes)} min over the ${result.economic_impact.delay_threshold_minutes}-min threshold · time lost ${formatUsd(result.economic_impact.time_cost_usd ?? 0)} + retail ${formatUsd(result.economic_impact.retail_loss_usd ?? 0)}`
                      : `No delay — predicted wait is within ${result.economic_impact.delay_threshold_minutes} min`}
                  </p>
                </div>
              </div>

              <div>
                <p className="eyebrow">Day context</p>
                <p className="mt-1 text-sm text-ink-2">
                  {(() => {
                    const contextItems: string[] = []
                    if (result.features_used.hora_pico_matutina) contextItems.push('Morning Rush')
                    if (result.features_used.hora_pico_vespertina) contextItems.push('Evening Rush')
                    if (result.features_used.es_fin_semana) contextItems.push('Weekend')

                    if (result.day_context.us_is_federal_holiday) contextItems.push('US Federal Holiday')
                    if (result.day_context.mx_is_official_holiday) contextItems.push('MX Official Holiday')
                    if (result.day_context.mx_is_bridge_day) contextItems.push('MX Bridge Day')
                    if (result.day_context.us_is_summer_vacation) contextItems.push('US Summer Vacation')
                    if (result.day_context.mx_is_summer_vacation) contextItems.push('MX Summer Vacation')
                    if (result.day_context.mx_is_school_vacation) contextItems.push('MX School Vacation')

                    return contextItems.length > 0 ? contextItems.join(', ') : 'Normal Day'
                  })()}
                </p>
              </div>
            </div>
          )}
        </section>

        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <section className="card card-pad">
            <h2 className="section-title mb-2">How it works</h2>
            <p className="prose-body">
              The prediction model uses <span className="font-medium text-ink">synthetic historical wait time data</span>,
              along with <span className="font-medium text-ink">contextual features</span> like the day of the week, hour,
              holidays, and weekends, to estimate wait times at the Bridge of the Americas (BOTA).
            </p>
          </section>
          <section className="card card-pad">
            <h2 className="section-title mb-2">What is missing</h2>
            <p className="prose-body">
              This project is missing <span className="font-medium text-ink">real historical data</span> to successfully
              train this model <span className="font-medium text-ink">and validate its predictions.</span> The goal of
              this project is to collect more real data to improve the model&apos;s accuracy over time.
            </p>
          </section>
        </div>
      </div>
    </main>
  )
}
