// ---------------------------------------------------------------------------
// Data layer for the mockup.
//
// Real figures come from  ../analysis/analyze.py  — its last step writes
//   src/data/panel.json     (monthly panel, 2000–2026)
//   src/data/findings.json  (event-study / cointegration results)
// which this module loads automatically. Run:
//     cd analysis && python -m venv .venv
//     .venv/bin/pip install -r requirements.txt && .venv/bin/python analyze.py
//
// Until then it falls back to a deterministic SYNTHETIC panel with the same
// shape, and a gold banner marks the page as illustrative.
// ---------------------------------------------------------------------------

const realPanelMod = import.meta.glob('./panel.json', { eager: true })
const realFindingsMod = import.meta.glob('./findings.json', { eager: true })
const realCommerceMod = import.meta.glob('./commerce.json', { eager: true })
const realChannelsMod = import.meta.glob('./channels.json', { eager: true })
const realPanel = Object.values(realPanelMod)[0]?.default
const realFindings = Object.values(realFindingsMod)[0]?.default
const realCommerce = Object.values(realCommerceMod)[0]?.default
const realChannels = Object.values(realChannelsMod)[0]?.default

// --- deterministic PRNG --------------------------------------------------
function mulberry32(seed) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const START_YEAR = 2000
const N = 27 * 12 // 2000-01 … 2026-12

function covidFactor(y, m) {
  const t = (y - 2020) * 12 + (m - 3)
  if (t < 0) return 1
  const trough = 0.3 + 0.55 * (1 - Math.exp(-t / 9))
  const reopening = t >= 20 ? 0.13 * (1 - Math.exp(-(t - 20) / 4)) : 0
  return Math.min(1, trough + reopening)
}
function slowdown2019(y, m) {
  if (y === 2019 && m >= 3 && m <= 8) return 0.9
  if (y === 2019 && m === 9) return 0.97
  return 1
}
const gaussian = (c, s, amp, i) => amp * Math.exp(-(((i - c) / s) ** 2))

function buildPanel() {
  const rng = mulberry32(20190401)
  const rows = []
  for (let i = 0; i < N; i++) {
    const year = START_YEAR + Math.floor(i / 12)
    const month = (i % 12) + 1
    const tt = i / (N - 1)
    const seasonal = 0.05 * Math.sin(((month - 3) / 12) * 2 * Math.PI)

    // crossings: strong secular decline (Ready Lane, WHTI documentation rules, 2008)
    const trendCx = 1.42 - 0.7 * tt + gaussian(108, 14, -0.12, i)
    const crossings =
      (trendCx + seasonal) * slowdown2019(year, month) * covidFactor(year, month) * (1 + (rng() - 0.5) * 0.05)

    // pedestrians: rise during the 2019 vehicle slowdown (mode substitution)
    const pedestrians =
      (0.42 + 0.15 * tt) *
      (year === 2019 && month >= 3 && month <= 8 ? 1.28 : 1) *
      covidFactor(year, month) *
      (1 + (rng() - 0.5) * 0.06)

    // El Paso employment: grows through the period (opposite trend to crossings)
    const elpaso_emp =
      250 + 55 * tt + gaussian(108, 16, -10, i) + gaussian(243, 6, -22, i) + (rng() - 0.5) * 3

    const elpaso_retail_emp =
      30 + 4 * tt + 0.18 * gaussian(108, 16, -10, i) + 0.5 * gaussian(243, 6, -22, i) + (rng() - 0.5) * 0.4

    const sales_tax =
      year < 2013 ? null : (5 + 4 * tt + 0.9 * seasonal) * covidFactor(year, month) * (1 + (rng() - 0.5) * 0.05)

    const mxn_usd = 9.4 + 12 * tt + gaussian(243, 5, 3, i) + (rng() - 0.5) * 0.3

    rows.push({
      date: `${year}-${String(month).padStart(2, '0')}-01`,
      year,
      month,
      crossings: +crossings.toFixed(3),
      pedestrians: +pedestrians.toFixed(3),
      elpaso_emp: +elpaso_emp.toFixed(1),
      elpaso_retail_emp: +elpaso_retail_emp.toFixed(1),
      sales_tax: sales_tax === null ? null : +sales_tax.toFixed(2),
      mxn_usd: +mxn_usd.toFixed(2),
    })
  }
  return rows
}

// --- exports -----------------------------------------------------------
export const isMock = !Array.isArray(realPanel) || realPanel.length === 0

export const panel = (isMock ? buildPanel() : realPanel).map((r) => {
  const d = new Date(r.date)
  return { ...r, year: r.year ?? d.getUTCFullYear(), month: r.month ?? d.getUTCMonth() + 1 }
})

export const synthFindings = {
  generated_at: null,
  sample: { start: '2000-01-01', end: '2026-07-01', n: N },
  headline: {
    stat: '−10%',
    label:
      'drop in El Paso personal-vehicle crossings during the 2019 CBP officer reassignment (Mar–Aug), net of seasonality, trend, the peso and US retail sales — while pedestrian crossings rose +28% as travelers switched modes',
  },
  pearson_crossings_activity: -0.54,
  cointegration: {
    pair: 'El Paso crossings ~ retail-trade employment (log levels, 2000–2026)',
    resid_adf_p: 0.39,
    long_run_beta: -0.14,
    cointegrated: false,
  },
  granger: { crossings_to_activity_p: 0.057, activity_to_crossings_p: 0.0002 },
  event_2019: {
    window: '2019-03 .. 2019-08',
    crossings_pct: -9.9, crossings_p: 0.002,
    pedestrians_pct: 28.0, pedestrians_p: 0.0,
    retail_emp_pct: -1.7, retail_emp_p: 0.12,
    sales_tax_pct: 1.5, sales_tax_p: 0.11,
  },
  event_covid: {
    window: '2020-04 .. 2021-10',
    crossings_pct: -39.4, crossings_p: 0.0,
    retail_emp_pct: -5.9, retail_emp_p: 0.005,
  },
  channels: {
    composite_corr_emp_yoy: 0.53,
    rows: [
      { key: 'crossings', label: 'Personal vehicles', corr_emp_yoy: 0.44, corr_retail_yoy: 0.62, e2019_pct: -9.9, e2019_p: 0.002, ecovid_pct: -39.4, ecovid_p: 0 },
      { key: 'pedestrians', label: 'Pedestrians', corr_emp_yoy: 0.35, corr_retail_yoy: 0.36, e2019_pct: 28.0, e2019_p: 0, ecovid_pct: -54.0, ecovid_p: 0 },
      { key: 'trucks', label: 'Trucks (freight)', corr_emp_yoy: 0.36, corr_retail_yoy: 0.35, e2019_pct: 1.1, e2019_p: 0.54, ecovid_pct: -1.3, ecovid_p: 0.75 },
      { key: 'bus_pax', label: 'Bus passengers', corr_emp_yoy: 0.28, corr_retail_yoy: 0.36, e2019_pct: 38.8, e2019_p: 0, ecovid_pct: -52.4, ecovid_p: 0.001 },
      { key: 'border_activity', label: 'Composite index', corr_emp_yoy: 0.53, corr_retail_yoy: 0.60 },
    ],
  },
  commerce: {
    sample: '2016-01 .. 2026-01 (quarterly, n=41)',
    corr_crossings_retail_levels: 0.1,
    corr_crossings_retail_yoy: 0.66,
    retail_2019_pct: -0.7, retail_2019_p: 0.39,
    retail_covid_pct: -3.3, retail_covid_p: 0.19,
    accom_2019_pct: 3.9, accom_covid_pct: -14.1,
  },
  note:
    'Illustrative synthetic data. Run analysis/analyze.py for the live figures. Event effects are HAC-robust OLS on log monthly series with month fixed effects, a linear trend and log peso / log US-retail controls.',
}

export const findings = realFindings ?? synthFindings

// monthly: composite border-activity index vs. El Paso employment, YoY growth
export const channelFrame =
  Array.isArray(realChannels) && realChannels.length
    ? realChannels
    : buildPanel().map((r, i, arr) => {
        const p12 = arr[i - 12]
        return {
          date: r.date,
          g_border_activity: p12 ? ((r.crossings - p12.crossings) / p12.crossings) * 100 : null,
          g_elpaso_emp: p12 ? ((r.elpaso_emp - p12.elpaso_emp) / p12.elpaso_emp) * 100 : null,
          border_activity: 40 + (r.crossings - 1) * 45,
          elpaso_emp: r.elpaso_emp,
        }
      })

// quarterly commerce panel (crossings vs. taxable retail sales, YoY growth)
export const commerce =
  Array.isArray(realCommerce) && realCommerce.length
    ? realCommerce
    : buildPanel()
        .filter((r) => r.month % 3 === 1)
        .map((r, i, arr) => {
          const prev = arr[i - 4]
          const retail = 0.9 + 0.02 * i
          return {
            date: r.date,
            g_crossings: prev ? ((r.crossings - prev.crossings) / prev.crossings) * 100 : null,
            g_sales_retail: prev ? 3 + ((r.crossings - prev.crossings) / prev.crossings) * 40 : null,
            crossings: r.crossings,
            sales_retail: retail,
          }
        })

// --- helpers ----------------------------------------------------------
export function ols(points, xKey, yKey) {
  const pts = points.filter((p) => Number.isFinite(p[xKey]) && Number.isFinite(p[yKey]))
  const n = pts.length
  let sx = 0, sy = 0, sxx = 0, sxy = 0
  for (const p of pts) { sx += p[xKey]; sy += p[yKey]; sxx += p[xKey] ** 2; sxy += p[xKey] * p[yKey] }
  const slope = (n * sxy - sx * sy) / (n * sxx - sx * sx)
  const intercept = (sy - slope * sx) / n
  const my = sy / n
  let ssTot = 0, ssRes = 0
  for (const p of pts) { ssTot += (p[yKey] - my) ** 2; ssRes += (p[yKey] - (intercept + slope * p[xKey])) ** 2 }
  const r2 = 1 - ssRes / ssTot
  return { slope, intercept, r2, r: Math.sign(slope) * Math.sqrt(Math.max(0, r2)) }
}

export function eventEffect(rows, key, { months = [3, 4, 5, 6, 7, 8], treatYear = 2019, baseYears = [2016, 2017, 2018] } = {}) {
  const clean = (a) => a.filter(Number.isFinite)
  const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN)
  const during = mean(clean(rows.filter((r) => r.year === treatYear && months.includes(r.month)).map((r) => r[key])))
  const base = mean(clean(rows.filter((r) => baseYears.includes(r.year) && months.includes(r.month)).map((r) => r[key])))
  return { during, base, pct: (during / base - 1) * 100 }
}

export const isFiniteNum = (x) => typeof x === 'number' && Number.isFinite(x)
export const fmtP = (p) => (isFiniteNum(p) ? (p < 0.001 ? 'p < 0.001' : `p = ${p.toFixed(3)}`) : '—')

// correlation r shown as a signed percentage, e.g. 0.664 -> "+66%", -0.541 -> "−54%"
export const rAsPct = (r) => (isFiniteNum(r) ? `${r < 0 ? '−' : '+'}${Math.round(Math.abs(r) * 100)}%` : '—')
// shared variance r^2 as a percentage
export const r2AsPct = (r) => (isFiniteNum(r) ? `${Math.round(r * r * 100)}%` : '—')
export const signPct = (x, d = 1) => (isFiniteNum(x) ? `${x > 0 ? '+' : x < 0 ? '−' : ''}${Math.abs(x).toFixed(d)}%` : '—')
export const isSig = (p) => isFiniteNum(p) && p < 0.05
