import { ols, commerce, isFiniteNum, rAsPct, r2AsPct, signPct, isSig } from '../data/mockData'

function Kpi({ label, value, sub, tone = 'default', tag }) {
  return (
    <div className={`kpi ${tone}`}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      {tag && <span className={`tag ${tag.sig ? 'sig' : 'nsig'}`}>{tag.text}</span>}
      {sub && <div className="kpi-sub">{sub}</div>}
    </div>
  )
}

export default function KpiGrid({ findings }) {
  const e = findings.event_2019 ?? {}
  const c = findings.event_covid ?? {}
  const com = findings.commerce ?? {}

  // fallbacks computed from data if findings absent
  const rYoY = isFiniteNum(com.corr_crossings_retail_yoy)
    ? com.corr_crossings_retail_yoy
    : ols(commerce.filter((r) => isFiniteNum(r.g_crossings) && isFiniteNum(r.g_sales_retail)), 'g_crossings', 'g_sales_retail').r

  const comp = findings.channels?.composite_corr_emp_yoy
  const trucks = (findings.channels?.rows ?? []).find((r) => r.key === 'trucks') ?? {}

  const cards = [
    {
      label: 'Border activity ↔ El Paso economy',
      value: rAsPct(isFiniteNum(comp) ? comp : rYoY),
      sub: `composite crossing index vs. employment · YoY growth · r² = ${r2AsPct(isFiniteNum(comp) ? comp : rYoY)}`,
      tone: 'accent',
    },
    {
      label: 'Retail sales ↔ crossings',
      value: rAsPct(rYoY),
      sub: `YoY growth · shares ${r2AsPct(rYoY)} of variance`,
      tone: 'accent',
    },
    {
      label: '2019 slowdown · vehicle crossings',
      value: signPct(e.crossings_pct),
      tone: 'neg',
      tag: { text: isSig(e.crossings_p) ? 'significant' : 'n.s.', sig: isSig(e.crossings_p) },
      sub: 'pedestrian crossings ' + signPct(e.pedestrians_pct) + ' — mode substitution',
    },
    {
      label: '2019 slowdown · freight (trucks)',
      value: signPct(trucks.e2019_pct, 0),
      tone: 'default',
      tag: { text: isSig(trucks.e2019_p) ? 'significant' : 'n.s.', sig: isSig(trucks.e2019_p) },
      sub: 'supply chain unaffected by friction',
    },
    {
      label: 'COVID ban · vehicle crossings',
      value: signPct(c.crossings_pct, 0),
      tone: 'neg',
      tag: { text: isSig(c.crossings_p) ? 'significant' : 'n.s.', sig: isSig(c.crossings_p) },
      sub: 'freight over the same period: ' + signPct(trucks.ecovid_pct, 0),
    },
    {
      label: 'Long-run link (cointegration)',
      value: findings.cointegration?.cointegrated ? 'Yes' : 'None',
      sub: `levels · Engle–Granger residual ADF p = ${findings.cointegration?.resid_adf_p ?? '—'}`,
    },
  ]

  return (
    <div className="kpi-grid">
      {cards.map((k) => (
        <Kpi key={k.label} {...k} />
      ))}
    </div>
  )
}
