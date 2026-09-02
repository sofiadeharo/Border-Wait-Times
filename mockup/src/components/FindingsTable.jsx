import { ols, commerce, isFiniteNum, rAsPct, signPct, fmtP, isSig } from '../data/mockData'

export default function FindingsTable({ findings, panel }) {
  const e = findings.event_2019 ?? {}
  const c = findings.event_covid ?? {}
  const com = findings.commerce ?? {}
  const coint = findings.cointegration ?? {}
  const granger = findings.granger ?? {}

  const rLevels = isFiniteNum(findings.pearson_crossings_activity)
    ? findings.pearson_crossings_activity
    : ols(panel, 'crossings', 'elpaso_emp').r
  const rYoY = isFiniteNum(com.corr_crossings_retail_yoy)
    ? com.corr_crossings_retail_yoy
    : ols(commerce.filter((r) => isFiniteNum(r.g_crossings)), 'g_crossings', 'g_sales_retail').r

  const comp = findings.channels?.composite_corr_emp_yoy
  const trucks = (findings.channels?.rows ?? []).find((r) => r.key === 'trucks') ?? {}

  const rows = [
    {
      test: 'Border activity ↔ economy',
      metric: 'composite crossing index vs. El Paso employment (YoY growth)',
      value: rAsPct(isFiniteNum(comp) ? comp : rYoY),
      pill: ['pos', 'holds'],
      read: 'The core measurement — border-crossing activity and the regional economy grow and slow together.',
    },
    {
      test: 'Channel: freight',
      metric: 'truck crossings — friction shocks',
      value: `${signPct(trucks.e2019_pct, 0)} / ${signPct(trucks.ecovid_pct, 0)}`,
      pill: ['mut', 'n.s.'],
      read: 'The Juárez maquiladora supply chain kept moving through both the 2019 slowdown and the COVID ban.',
    },
    {
      test: 'Correlation — levels',
      metric: 'crossings vs. El Paso employment',
      value: rAsPct(rLevels),
      pill: ['mut', 'spurious'],
      read: 'Negative and misleading — opposite 25-year trends, not a causal link.',
    },
    {
      test: 'Correlation — YoY growth',
      metric: 'crossings vs. El Paso retail sales',
      value: rAsPct(rYoY),
      pill: ['pos', 'holds'],
      read: 'Once trends are removed, spending and crossings accelerate and slow together.',
    },
    {
      test: 'Cointegration',
      metric: 'Engle–Granger residual ADF',
      value: coint.cointegrated ? 'Cointegrated' : 'None',
      pill: coint.cointegrated ? ['pos', 'holds'] : ['mut', `p = ${coint.resid_adf_p ?? '—'}`],
      read: 'No stable long-run tie in levels — the link is cyclical, not structural.',
    },
    {
      test: 'Granger causality',
      metric: 'direction of prediction',
      value: 'Activity → crossings',
      pill: ['mut', fmtP(granger.activity_to_crossings_p)],
      read: 'Crossing volume mostly follows the economy rather than driving it.',
    },
    {
      test: '2019 CBP reassignment',
      metric: 'vehicle crossings',
      value: signPct(e.crossings_pct),
      pill: isSig(e.crossings_p) ? ['neg', fmtP(e.crossings_p)] : ['mut', fmtP(e.crossings_p)],
      read: `Pedestrian crossings ${signPct(e.pedestrians_pct)} over the same months — mode substitution.`,
    },
    {
      test: 'COVID land-border ban',
      metric: 'vehicle crossings',
      value: signPct(c.crossings_pct, 0),
      pill: isSig(c.crossings_p) ? ['neg', fmtP(c.crossings_p)] : ['mut', fmtP(c.crossings_p)],
      read: `El Paso retail employment ${signPct(c.retail_emp_pct)} (${fmtP(c.retail_emp_p)}); hotels & restaurants ${signPct(com.accom_covid_pct)}.`,
    },
  ]

  return (
    <div className="data-table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>Test</th>
            <th>Metric</th>
            <th>Value</th>
            <th>Significance</th>
            <th>Interpretation</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.test}>
              <td>{r.test}</td>
              <td className="read">{r.metric}</td>
              <td className="num">{r.value}</td>
              <td><span className={`pill ${r.pill[0]}`}>{r.pill[1]}</span></td>
              <td className="read">{r.read}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
