'use client'

import { useEffect, useState } from 'react'
import BorderDashboard from './components/BorderDashboard'
import { isLaneOpen, WaitTime } from './lib/waitTimes'

// ACTION: default value for the report form's "when did you cross?" field — now, rounded to the minute.
function nowLocalDatetimeValue() {
  const d = new Date()
  d.setSeconds(0, 0)
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 16)
}

// LAYOUT: the home page. Top to bottom: header, fastest/slowest summary cards,
// the map/port dashboard (BorderDashboard), then the report form.
export default function Home() {
  // ACTION: wait-time data + fetch status, populated by fetchData below.
  const [data, setData] = useState<WaitTime[]>([])
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // ACTION: report form field state + submit status.
  const [laneType, setLaneType] = useState('Standard')
  const [crossingTime, setCrossingTime] = useState(nowLocalDatetimeValue())
  const [waitMinutes, setWaitMinutes] = useState(30)
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [reportSuccess, setReportSuccess] = useState(false)
  const [reportError, setReportError] = useState<string | null>(null)

  // ACTION: submits the report form to /api/report (proxies to the FastAPI backend).
  // Edit the `body` fields here if the report form gains/loses inputs.
  const submitReport = async () => {
    setSubmitting(true)
    setReportError(null)
    setReportSuccess(false)
    try {
      const res = await fetch('/api/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lane_type: laneType,
          crossing_time: new Date(crossingTime).toISOString(),
          reported_wait_minutes: waitMinutes,
          notes: notes || null,
        }),
      })
      if (!res.ok) throw new Error('Submission failed')
      setReportSuccess(true)
      setNotes('')
    } catch (e) {
      setReportError('Could not submit your report. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  // ACTION: loads current wait times from /api/wait-times.
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

  // ACTION: fetch on mount, then poll every hour. Change `3_600_000` to adjust the refresh interval.
  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, 3_600_000)
    return () => clearInterval(interval)
  }, [])

  // ACTION: derives the single fastest/slowest lane across all ports for the summary cards below.
  // Closed/non-operational lanes report 0 minutes but aren't actually crossable, so they're
  // excluded here (see isLaneOpen in lib/waitTimes.ts) to avoid a closed lane looking "fastest".
  const openLanes = data.filter(isLaneOpen)
  const fastest = openLanes.length
    ? openLanes.reduce((min, row) => (row.wait_time_minutes < min.wait_time_minutes ? row : min))
    : null
  const slowest = openLanes.length
    ? openLanes.reduce((max, row) => (row.wait_time_minutes > max.wait_time_minutes ? row : max))
    : null

  return (
    // LAYOUT: `max-w-5xl mx-auto` centers and caps the width of everything on this page.
    <main className="page">
      <div className="max-w-5xl mx-auto">
        <header className="page-header">
          <h1 className="page-title">El Paso to Ciudad Juárez Border Wait Times</h1>
          {lastUpdated && (
            <p className="page-subtitle">
              Last updated {lastUpdated.toLocaleTimeString()}  Refreshes every hour :D
            </p>
          )}
        </header>

        {/* LAYOUT: fastest/slowest summary cards, side by side on sm+ screens. */}
        {!loading && !error && fastest && slowest && (
          <div className="mb-4 grid gap-3 sm:mb-6 sm:grid-cols-2 sm:gap-4">
            {[
              { title: 'Fastest crossing right now', row: fastest },
              { title: 'Slowest crossing right now', row: slowest },
            ].map(({ title, row }) => (
              <div key={title} className="card card-pad">
                <p className="eyebrow">{title}</p>
                <div className="mt-3 flex items-end justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-base font-medium text-ink">{row.port_name}</p>
                    <p className="text-xs text-ink-3">
                      {row.crossing_type}, {row.lane_type}
                    </p>
                  </div>
                  <p className="shrink-0 font-mono text-3xl text-ink">
                    {row.wait_time_minutes}
                    <span className="font-sans text-sm text-ink-3"> min</span>
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}

        {loading && <p className="text-sm text-ink-3">Loading…</p>}

        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

        {!loading && !error && data.length === 0 && (
          <p className="text-sm text-ink-3">No wait time data available right now.</p>
        )}

        {/* LAYOUT: the map + port list + per-port wait-time dashboard. See BorderDashboard.tsx. */}
        {!loading && !error && data.length > 0 && <BorderDashboard data={data} />}

        {/* LAYOUT: report form. */}
        <section className="card card-pad space-y-5">
          <div>
            <h2 className="section-title">Report your wait time</h2>
            <p className="mt-1 text-sm text-ink-2">
              Crossed BOTA recently? Share your wait time to help improve the prediction model.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {/* ACTION: updates `laneType`, sent as `lane_type` in submitReport. */}
            <label className="field-label">
              Lane type
              <select value={laneType} onChange={(e) => setLaneType(e.target.value)} className="field">
                <option value="Standard">Standard</option>
                <option value="Ready Lane">Ready Lane</option>
                <option value="NEXUS/SENTRI">SENTRI</option>
                <option value="Pedestrian">Pedestrian</option>
              </select>
            </label>

            {/* ACTION: updates `waitMinutes`, sent as `reported_wait_minutes` in submitReport. */}
            <label className="field-label">
              How long did you wait? (minutes)
              <input
                type="number"
                min={0}
                max={600}
                value={waitMinutes}
                onChange={(e) => setWaitMinutes(Number(e.target.value))}
                className="field font-mono"
              />
            </label>
          </div>

          <div>
            <label className="field-label">
              When did you cross?
              <input
                type="datetime-local"
                value={crossingTime}
                onChange={(e) => setCrossingTime(e.target.value)}
                className="field"
              />
            </label>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="text-sm text-ink-3">Or set to:</span>
              {[
                { label: 'Just now', minutes: 0 },
                { label: '15 min ago', minutes: 15 },
                { label: '30 min ago', minutes: 30 },
                { label: '1 hour ago', minutes: 60 },
              ].map((option) => (
                <button
                  key={option.label}
                  type="button"
                  onClick={() => {
                    const d = new Date()
                    d.setMinutes(d.getMinutes() - option.minutes - new Date().getTimezoneOffset())
                    d.setSeconds(0, 0)
                    setCrossingTime(d.toISOString().slice(0, 16))
                  }}
                  className="chip"
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {/* ACTION: updates `notes`, sent as-is (or null if empty) in submitReport. */}
          <label className="field-label">
            Notes (optional)
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="field" />
          </label>

          <div className="flex flex-wrap items-center gap-3">
            {/* ACTION: triggers submitReport; disabled while a submission is in flight. */}
            <button onClick={submitReport} disabled={submitting} className="btn btn-primary">
              {submitting ? 'Submitting…' : 'Submit report'}
            </button>
            {reportError && <p className="text-sm text-red-600 dark:text-red-400">{reportError}</p>}
            {reportSuccess && (
              <p className="text-sm text-green-700 dark:text-green-400">Thanks! Your report has been recorded.</p>
            )}
          </div>
        </section>
      </div>
    </main>
  )
}
