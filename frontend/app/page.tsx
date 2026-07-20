'use client'

import { useEffect, useState } from 'react'

interface WaitTime {
  port_id: string
  port_name: string
  crossing_type: string
  lane_type: string
  wait_time_minutes: number
  status: string
  timestamp: string
}

interface DayTypeEffect {
  coef_min: number
  p_value: number
  ci95: [number, number]
}

interface DayTypeEffectsResponse {
  n_obs?: number
  r_squared?: number
  day_type_effects?: Record<string, DayTypeEffect>
  day_types_skipped?: string[]
  run_at?: string
}

interface PredictionResponse {
  predicted_wait_minutes?: number
  predicted_at?: string
}

type GroupedData = Record<string, Record<string, WaitTime[]>>

const DAY_TYPE_LABELS: Record<string, string> = {
  feriado_us: 'US Federal Holiday',
  feriado_mx: 'MX Official Holiday',
  puente_mx: 'MX Bridge Day',
  vacaciones_us: 'US Summer Vacation',
  vacaciones_mx: 'MX Summer Vacation',
}

export default function Home() {
  const [data, setData] = useState<WaitTime[]>([])
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [effects, setEffects] = useState<DayTypeEffectsResponse | null>(null)
  const [effectsLoading, setEffectsLoading] = useState(true)
  const [effectsError, setEffectsError] = useState<string | null>(null)

  const [prediction, setPrediction] = useState<PredictionResponse | null>(null)
  const [predictionLoading, setPredictionLoading] = useState(true)
  const [predictionError, setPredictionError] = useState<string | null>(null)

  const fetchData = async () => {
    try {
      const res = await fetch('/api/wait-times')
      if (!res.ok) throw new Error('Failed to fetch data')
      const json: WaitTime[] = await res.json()
      setData(json)
      setLastUpdated(new Date())
      setError(null)
    } catch (e) {
      setError('Could not load wait times. Retrying in 1 hour.')
    } finally {
      setLoading(false)
    }
  }

  const fetchEffects = async () => {
    try {
      const res = await fetch('/api/day-type-effects')
      if (!res.ok) throw new Error('Failed to fetch correlation data')
      const json: DayTypeEffectsResponse = await res.json()
      setEffects(json)
      setEffectsError(null)
    } catch (e) {
      setEffectsError('Could not load correlation data.')
    } finally {
      setEffectsLoading(false)
    }
  }

  const fetchPrediction = async () => {
    try {
      const res = await fetch('/api/predict')
      if (!res.ok) throw new Error('Failed to fetch prediction')
      const json: PredictionResponse = await res.json()
      setPrediction(json)
      setPredictionError(null)
    } catch (e) {
      setPredictionError('Could not load prediction.')
    } finally {
      setPredictionLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
    fetchEffects()
    fetchPrediction()
    const interval = setInterval(() => {
      fetchData()
      fetchEffects()
      fetchPrediction()
    }, 3_600_000)
    return () => clearInterval(interval)
  }, [])

  const grouped = data.reduce<GroupedData>((acc, row) => {
    if (!acc[row.port_name]) acc[row.port_name] = {}
    if (!acc[row.port_name][row.crossing_type]) acc[row.port_name][row.crossing_type] = []
    acc[row.port_name][row.crossing_type].push(row)
    return acc
  }, {})

  return (
    <main className="min-h-screen bg-zinc-50 dark:bg-zinc-900 p-8 font-sans">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
            El Paso – Ciudad Juárez Border Wait Times
          </h1>
          {lastUpdated && (
            <p className="text-sm text-zinc-500 mt-1">
              Last updated: {lastUpdated.toLocaleTimeString()} · Refreshes every hour
            </p>
          )}
        </div>

        <section className="mb-8 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-5">
          <h2 className="text-lg font-medium text-zinc-800 dark:text-zinc-200">
            Predicted Wait Time (BOTA, ML model)
          </h2>
          <p className="text-sm text-zinc-500 mb-4">
            Initial test — random forest model, standard lane, placeholder daily volume
          </p>

          {predictionLoading && (
            <p className="text-zinc-500 text-sm">Loading prediction...</p>
          )}

          {!predictionLoading && predictionError && (
            <p className="text-red-500 text-sm">{predictionError}</p>
          )}

          {!predictionLoading && !predictionError && prediction?.predicted_wait_minutes !== undefined && (
            <>
              <p className="text-3xl font-mono text-zinc-900 dark:text-zinc-100">
                {prediction.predicted_wait_minutes} min
              </p>
              {prediction.predicted_at && (
                <p className="text-xs text-zinc-400 mt-2">
                  Predicted for {new Date(prediction.predicted_at).toLocaleString()}
                </p>
              )}
            </>
          )}
        </section>

        <section className="mb-8 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-5">
          <h2 className="text-lg font-medium text-zinc-800 dark:text-zinc-200">
            Wait Time Correlations
          </h2>
          <p className="text-sm text-zinc-500 mb-4">
            Estimated effect on wait times by day type
          </p>

          {effectsLoading && (
            <p className="text-zinc-500 text-sm">Loading correlation data...</p>
          )}

          {!effectsLoading && effectsError && (
            <p className="text-red-500 text-sm">{effectsError}</p>
          )}

          {!effectsLoading && !effectsError && !effects?.day_type_effects && (
            <p className="text-zinc-500 text-sm">
              No correlation data available yet. The model runs weekly.
            </p>
          )}

          {!effectsLoading && !effectsError && effects?.day_type_effects && Object.keys(effects.day_type_effects).length === 0 && (
            <p className="text-zinc-500 text-sm">
              No correlation data available yet. The model runs weekly.
            </p>
          )}

          {!effectsLoading && !effectsError && effects?.day_type_effects && Object.keys(effects.day_type_effects).length > 0 && (
            <>
              <ul className="space-y-2">
                {Object.entries(effects.day_type_effects).map(([alias, effect]) => {
                  const label = DAY_TYPE_LABELS[alias] ?? alias
                  const isSignificant = effect.p_value < 0.05
                  const isSlower = effect.coef_min > 0
                  return (
                    <li key={alias} className="flex items-center justify-between text-sm">
                      <span className="text-zinc-700 dark:text-zinc-300">{label}</span>
                      <span className="flex items-center gap-2">
                        <span
                          className={
                            'font-mono ' +
                            (isSlower ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400')
                          }
                        >
                          {effect.coef_min > 0 ? '+' : ''}
                          {effect.coef_min} min
                        </span>
                        {isSignificant ? (
                          <span className="text-xs text-zinc-500">significant</span>
                        ) : (
                          <span className="text-xs text-zinc-400 italic">
                            not significant (p={effect.p_value})
                          </span>
                        )}
                      </span>
                    </li>
                  )
                })}
              </ul>

              {effects.day_types_skipped && effects.day_types_skipped.length > 0 && (
                <p className="text-xs text-zinc-400 mt-3">
                  Not enough variation in the data yet:{' '}
                  {effects.day_types_skipped.map((a) => DAY_TYPE_LABELS[a] ?? a).join(', ')}
                </p>
              )}

              <p className="text-xs text-zinc-400 mt-3">
                Based on {effects.n_obs} observations, R² = {effects.r_squared}
                {effects.run_at && ` · Model last updated ${new Date(effects.run_at).toLocaleString()}`}
              </p>
            </>
          )}
        </section>

        {loading && (
          <p className="text-zinc-500">Loading...</p>
        )}

        {error && (
          <p className="text-red-500">{error}</p>
        )}

        {!loading && !error && Object.entries(grouped).map(([portName, crossingTypes]) => (
          <div key={portName} className="mb-8">
            <h2 className="text-lg font-medium text-zinc-800 dark:text-zinc-200 mb-3">
              {portName}
            </h2>
            {Object.entries(crossingTypes).map(([crossingType, rows]) => (
              <div key={crossingType} className="mb-4">
                <h3 className="text-sm font-medium text-zinc-500 uppercase tracking-wide mb-2">
                  {crossingType}
                </h3>
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="bg-zinc-100 dark:bg-zinc-800 text-left">
                      <th className="px-4 py-2 text-zinc-600 dark:text-zinc-400 font-medium">Lane Type</th>
                      <th className="px-4 py-2 text-zinc-600 dark:text-zinc-400 font-medium">Wait (min)</th>
                      <th className="px-4 py-2 text-zinc-600 dark:text-zinc-400 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr
                        key={`${row.crossing_type}-${row.lane_type}`}
                        className="border-t border-zinc-200 dark:border-zinc-700"
                      >
                        <td className="px-4 py-2 text-zinc-800 dark:text-zinc-200">{row.lane_type}</td>
                        <td className="px-4 py-2 font-mono text-zinc-900 dark:text-zinc-100">
                          {row.wait_time_minutes}
                        </td>
                        <td className="px-4 py-2 text-zinc-600 dark:text-zinc-400">{row.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        ))}
      </div>
    </main>
  )
}
