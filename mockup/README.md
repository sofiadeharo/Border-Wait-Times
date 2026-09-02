# Mockup — Border friction & the El Paso economy

A standalone **React + Vite** data story visualizing the Stage 2 analysis:
the raw (spurious) correlation, and the 2019 CBP-officer-reassignment and COVID
natural experiments.

```bash
cd mockup
npm install
npm run dev      # http://localhost:5173
npm run build    # -> dist/  (static, deploy anywhere)
```

## Data

The page reads `src/data/panel.json` + `src/data/findings.json`, written by
[`../analysis/analyze.py`](../analysis/analyze.py). Both are committed, so the
deployed page shows the real figures.

If they're missing, the page falls back to a deterministic **synthetic** panel of
the same shape (`src/data/mockData.js`) and shows a gold "illustrative" banner.

`findings.json` shape (see `analyze.py`):

```jsonc
{
  "sample": { "start": "2000-01-01", "end": "2026-07-01", "n": 319 },
  "headline": { "stat": "-10%", "label": "..." },
  "pearson_crossings_activity": -0.541,
  "cointegration": { "resid_adf_p": 0.39, "long_run_beta": -0.14, "cointegrated": false },
  "granger": { "crossings_to_activity_p": 0.057, "activity_to_crossings_p": 0.0002 },
  "event_2019": { "crossings_pct": -9.9, "crossings_p": 0.002, "pedestrians_pct": 28.0, ... },
  "event_covid": { "crossings_pct": -39.4, "retail_emp_pct": -5.9, "retail_emp_p": 0.005 }
}
```

`panel.json` — monthly records: `date, crossings, pedestrians, elpaso_emp,
elpaso_retail_emp, sales_tax, mxn_usd`.

## Structure

Analytics-dashboard layout: KPI tiles (correlation shown as Pearson r × 100), a chart
grid, a findings table, and methodology. Light + dark (follows `prefers-color-scheme`).

```
src/
  App.jsx                      dashboard shell (topbar, masthead, sections)
  data/mockData.js             real-data loader, synthetic fallback, stats + format helpers
  components/
    KpiGrid.jsx                key-metric tiles
    ChannelMatrix.jsx          THE measurement — composite crossing index vs. regional economy,
                               + channel-by-channel correlation / shock table
    CrossingsTimeSeries.jsx    crossings vs. El Paso employment, event bands
    EventStudy.jsx             2019 effects by metric + 2019-vs-COVID dose-response
    CommerceCoMovement.jsx     retail sales vs. crossings, YoY growth (r shown as %)
    CorrelationScatter.jsx     levels scatter — why the raw correlation misleads
    FindingsTable.jsx          all tests in one table
    Methods.jsx                identification, model, limits, next steps
```

Data files (written by `analyze.py`, committed): `panel.json`, `findings.json`,
`commerce.json`, `channels.json`.

Charts: [Recharts](https://recharts.org). React 19 + Recharts 2.15 install cleanly;
if npm warns, `npm install --legacy-peer-deps`.

## Deploy

Static build — `dist/` on GitHub Pages, Netlify, Vercel, or a Render static site.
`vite.config.js` sets `base: './'`.
