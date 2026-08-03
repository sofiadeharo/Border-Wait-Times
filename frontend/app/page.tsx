'use client'

import { useEffect, useState } from 'react'
import BorderDashboard from './components/BorderDashboard'
import { isLaneOpen, WAIT_TAG, WaitLevel, WaitTime } from './lib/waitTimes'

// ACTION: default value for the report form's "when did you cross?" field — now, rounded to the minute.
function nowLocalDatetimeValue() {
  const d = new Date()
  d.setSeconds(0, 0)
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 16)
}

// LAYOUT: the home page. Top to bottom: header, fastest/slowest summary cards,
// wait-level legend, the map/port dashboard (BorderDashboard), then the report form.
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
    <main className="min-h-screen p-8 font-sans">
      <div className="max-w-5xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-black dark:text-almond-cream">
            El Paso to Ciudad Juárez Border Wait Times
          </h1>
          {lastUpdated && (
            <p className="text-sm text-blackberry-cream/80 dark:text-almond-cream/60 mt-1">
              Last updated: {lastUpdated.toLocaleTimeString()} - Refreshes every hour
            </p>
          )}
        </div>

        {/* LAYOUT: fastest/slowest summary cards, side by side on sm+ screens. */}
        {/* COLORS: `border-l-green-600` (fastest) / `border-l-red-600` (slowest) are
            fixed traffic-light colors, independent of the app's brand palette. */}
        {!loading && !error && fastest && slowest && (
          <div className="mb-8 grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-pale-oak dark:border-tan/30 bg-white/70 dark:bg-blackberry-cream/70 backdrop-blur-sm border-l-4 border-l-green-600 px-4 py-3">
              <p className="text-xs font-bold uppercase tracking-wide text-black-700 dark:text-white-400">
                Fastest crossing right now
              </p>
              <p className="text-lg font-medium text-blackberry-cream dark:text-almond-cream mt-1">
                {fastest.port_name}
              </p>
              <p className="text-xs text-blackberry-cream/60 dark:text-almond-cream/60">
                {fastest.crossing_type} - {fastest.lane_type}
              </p>
              <p className="text-3xl font-helvetica neue text-blackberry-cream dark:text-almond-cream mt-2">
                {fastest.wait_time_minutes}
                <span className="text-bold text-sm font-helvetica neue"> min</span>
              </p>
            </div>
            <div className="rounded-lg border border-pale-oak dark:border-tan/30 bg-white/70 dark:bg-blackberry-cream/70 backdrop-blur-sm border-l-4 border-l-red-600 px-4 py-3">
              <p className="text-xs font-bold uppercase tracking-wide text-black-700 dark:text-red-400">
                Slowest crossing right now
              </p>
              <p className="text-lg font-medium text-blackberry-cream dark:text-almond-cream mt-1">
                {slowest.port_name}
              </p>
              <p className="text-xs text-blackberry-cream/60 dark:text-almond-cream/60">
                {slowest.crossing_type} · {slowest.lane_type}
              </p>
              <p className="text-3xl font-mono text-blackberry-cream dark:text-almond-cream mt-2">
                {slowest.wait_time_minutes}
                <span className="text-sm font-sans"> min</span>
              </p>
            </div>
          </div>
        )}

        {/* LAYOUT/COLORS: wait-level legend — dot colors come from WAIT_TAG in lib/waitTimes.ts. */}
        <div className="mb-8 flex flex-wrap gap-4 text-sm">
          {(['light', 'expected', 'heavy'] as WaitLevel[]).map((level) => (
            <span key={level} className="flex items-center gap-2">
              <span className={`inline-block h-2.5 w-2.5 rounded-full ${WAIT_TAG[level].dot}`} />
              <span className="text-blackberry-cream/70 dark:text-almond-cream/70">
                {WAIT_TAG[level].label}
              </span>
            </span>
          ))}
        </div>

        {loading && (
          <p className="text-blackberry-cream/60 dark:text-almond-cream/60">Loading...</p>
        )}

        {error && <p className="text-red-600 dark:text-red-400">{error}</p>}

        {!loading && !error && data.length === 0 && (
          <p className="text-blackberry-cream/60 dark:text-almond-cream/60">
            No wait time data available right now.
          </p>
        )}

        {/* LAYOUT: the map + port list + per-port wait-time dashboard. See BorderDashboard.tsx. */}
        {!loading && !error && data.length > 0 && <BorderDashboard data={data} />}

        {/* LAYOUT: report form. COLORS/ACTION for each field are inline below. */}
        <section className="mt-4 rounded-lg border border-pale-oak dark:border-tan/30 bg-white/90 dark:bg-blackberry-cream/70 backdrop-blur-sm p-5 space-y-4">
          <div>
            <h2 className="text-lg font-bold text-blackberry-cream dark:text-almond-cream">
              Report Your Wait Time
            </h2>
            <p className="text-sm text-blackberry-cream/90 dark:text-almond-cream/60 mt-1">
              Crossed BOTA recently? Share your wait time to help improve the prediction model.
            </p>
          </div>

          {/* ACTION: updates `laneType`, sent as `lane_type` in submitReport. */}
          <label className="block text-sm text-bold text-blackberry-cream dark:text-almond-cream">
            Lane type
            <select
              value={laneType}
              onChange={(e) => setLaneType(e.target.value)}
              className="mt-1 w-full rounded border border-pale-oak dark:border-tan/40 bg-almond-cream dark:bg-blackberry-cream p-2 text-sm text-blackberry-cream dark:text-almond-cream"
            >
              <option value="Standard">Standard</option>
              <option value="Ready Lane">Ready Lane</option>
              <option value="Sentri">SENTRI</option>
              <option value="Pedestrian">Pedestrian</option>
            </select>
          </label>

          <label className="block text-sm text-blackberry-cream dark:text-almond-cream">
            When did you cross?
            <input
              type="datetime-local"
              value={crossingTime}
              onChange={(e) => setCrossingTime(e.target.value)}
              className="mt-1 block w-full rounded border border-pale-oak dark:border-tan/40 bg-almond-cream dark:bg-blackberry-cream p-2 text-sm text-blackberry-cream dark:text-almond-cream"
            />
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-blackberry-cream/70 dark:text-almond-cream/70">
              Or set to:
            </span>
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
                className="rounded-full border border-pale-oak dark:border-tan/40 bg-almond-cream dark:bg-blackberry-cream px-3 py-1.5 text-sm text-blackberry-cream hover:bg-pale-oak/20 dark:text-almond-cream dark:hover:bg-tan/20 transition-colors"
              >
                {option.label}
              </button>
            ))}
          </div>

          {/* ACTION: updates `waitMinutes`, sent as `reported_wait_minutes` in submitReport. */}
          <label className="block text-sm text-blackberry-cream dark:text-almond-cream">
            How long did you wait? (minutes)
            <input
              type="number"
              min={0}
              max={600}
              value={waitMinutes}
              onChange={(e) => setWaitMinutes(Number(e.target.value))}
              className="mt-1 w-full rounded border border-pale-oak dark:border-tan/40 bg-almond-cream dark:bg-blackberry-cream p-2 text-sm font-mono text-blackberry-cream dark:text-almond-cream"
            />
          </label>

          {/* ACTION: updates `notes`, sent as-is (or null if empty) in submitReport. */}
          <label className="block text-sm text-blackberry-cream dark:text-almond-cream">
            Notes (optional)
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="mt-1 w-full rounded border border-pale-oak dark:border-tan/40 bg-almond-cream dark:bg-blackberry-cream p-2 text-sm text-blackberry-cream dark:text-almond-cream"
            />
          </label>

          {/* ACTION: triggers submitReport; disabled while a submission is in flight. */}
          <button
            onClick={submitReport}
            disabled={submitting}
            className="rounded bg-blackberry-cream dark:bg-wheat text-almond-cream dark:text-blackberry-cream text-sm font-medium px-4 py-2 disabled:opacity-50"
          >
            {submitting ? 'Submitting...' : 'Submit report'}
          </button>

          {reportError && <p className="text-red-600 dark:text-red-400 text-sm">{reportError}</p>}
          {reportSuccess && (
            <p className="text-green-600 dark:text-green-400 text-sm">
              Thanks! Your report has been recorded.
            </p>
          )}
        </section>
      </div>
    </main>
  )
}
