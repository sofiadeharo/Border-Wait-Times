'use client'

import { useState } from 'react'

interface PredictionResult {
  predicted_wait_minutes: number
  features_used: Record<string, number | boolean>
  day_context: Record<string, boolean>
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
      const res = await fetch(`/api/predict?${params.toString()}`)
      if (!res.ok) {
        let errorMessage = `Prediction failed with status: ${res.status}`
        // The server might send a JSON error, or it might be a network/proxy error with HTML.
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
    <main className="min-h-screen p-8 font-sans">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-blackberry-cream dark:text-almond-cream">
            Prediction Playground
          </h1>
          <p className="text-sm text-blackberry-cream/60 dark:text-almond-cream/60 mt-1">
            Experiment with the wait time prediction model for the Bridge of the Americas (BOTA).
          </p>
        </div>

        <div className="space-y-6 rounded-lg border border-white/40 dark:border-white/10 bg-white/30 dark:bg-white/10 backdrop-blur-lg p-5">
          <div className="grid sm:grid-cols-2 gap-4">
            <label className="block text-sm font-medium text-blackberry-cream dark:text-almond-cream">
              Date
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="mt-1 w-full rounded border border-pale-oak dark:border-tan/40 bg-almond-cream dark:bg-blackberry-cream p-2 text-sm text-blackberry-cream dark:text-almond-cream"
              />
            </label>
            <label className="block text-sm font-medium text-blackberry-cream dark:text-almond-cream">
              Hour (0-23)
              <input
                type="number"
                min={0}
                max={23}
                value={hour}
                onChange={(e) => setHour(Number(e.target.value))}
                className="mt-1 w-full rounded border border-pale-oak dark:border-tan/40 bg-almond-cream dark:bg-blackberry-cream p-2 text-sm text-blackberry-cream dark:text-almond-cream"
              />
            </label>
          </div>
          <label className="flex items-center gap-2 text-sm font-medium text-blackberry-cream dark:text-almond-cream">
            <input
              type="checkbox"
              checked={isReadyLane}
              onChange={(e) => setIsReadyLane(e.target.checked)}
              className="rounded border-pale-oak dark:border-tan/40 text-blackberry-cream dark:text-wheat focus:ring-blackberry-cream/50"
            />
            Ready Lane
          </label>

          <button
            onClick={getPrediction}
            disabled={loading}
            className="rounded bg-blackberry-cream dark:bg-wheat text-almond-cream dark:text-blackberry-cream text-sm font-medium px-4 py-2 disabled:opacity-50"
          >
            {loading ? 'Predicting...' : 'Get Prediction'}
          </button>


          {error && <p className="text-red-600 dark:text-red-400 text-sm">{error}</p>}

          {result && (
            <div className="rounded-lg bg-white/30 dark:bg-white/5 backdrop-blur-lg p-4 space-y-3">
              <p className="text-blackberry-cream dark:text-almond-cream">
                Predicted Wait:
                <span className="ml-2 text-3xl font-mono">
                  {Math.round(result.predicted_wait_minutes)}
                </span>
                <span className="text-sm font-sans"> min</span>
              </p>
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-blackberry-cream/50 dark:text-almond-cream/50">
                  Day Context
                </h3>
                <p className="text-xs text-blackberry-cream/80 dark:text-almond-cream/80">
                  {(() => {
                    const contextItems: string[] = []
                    // From features_used
                    if (result.features_used.hora_pico_matutina) contextItems.push('Morning Rush')
                    if (result.features_used.hora_pico_vespertina) contextItems.push('Evening Rush')
                    if (result.features_used.es_fin_semana) contextItems.push('Weekend')

                    // From day_context
                    if (result.day_context.us_is_federal_holiday)
                      contextItems.push('US Federal Holiday')
                    if (result.day_context.mx_is_official_holiday)
                      contextItems.push('MX Official Holiday')
                    if (result.day_context.mx_is_bridge_day) contextItems.push('MX Bridge Day')
                    if (result.day_context.us_is_summer_vacation)
                      contextItems.push('US Summer Vacation')
                    if (result.day_context.mx_is_summer_vacation)
                      contextItems.push('MX Summer Vacation')
                    if (result.day_context.mx_is_school_vacation)
                        contextItems.push('MX School Vacation')
                    

                    return contextItems.length > 0 ? contextItems.join(', ') : 'Normal Day'
                  })()}
                </p>
                
              </div>

            </div>
            
          )}
        </div>
      </div>

               
          <div className="max-w-4xl mx-auto grid grid-cols-1 gap-4 mt-4 sm:grid-cols-2">
             <div className="p-4 rounded-lg bg-white/30 dark:bg-white/10 backdrop-blur-lg">
            <h2 className="text-lg font-medium text-blackberry-cream dark:text-almond-cream mb-2 animate-pulse">
              How It Works 
            </h2>
            <p>
              The prediction model uses{' '}
              <span className="font-semibold text-blackberry-cream dark:text-tan">
                synthetic historical wait time data
              </span>
              , along with{' '}
              <span className="font-semibold text-blackberry-cream dark:text-tan">
                contextual features
              </span>{' '}
              like the day of the week, hour, holidays, and weekends, to estimate wait times at the
              Bridge of the Americas (BOTA).
            </p>
          </div>
          <div className="p-4 rounded-lg bg-white/30 dark:bg-white/10 backdrop-blur-lg">
            <h2 className="text-lg font-medium text-blackberry-cream dark:text-almond-cream mb-2 animate-pulse">
              What is Missing
            </h2>
            <p>
              This project is missing{' '}
              <span className="font-semibold text-blackberry-cream dark:text-tan">
                real historical data
              </span>{' '}
              enough to succesfully train this model{' '}
              <span className="font-semibold text-blackberry-cream dark:text-tan">
                and validate its predictions
              </span>
             The goal of this project is to collect more real data to improve the model's accuracy over time.
            </p>
          </div>

          </div>


    </main>
  )
}