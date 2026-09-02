import {
  ScatterChart, Scatter, XAxis, YAxis, ZAxis, CartesianGrid, Tooltip,
  ReferenceLine, ResponsiveContainer,
} from 'recharts'
import { commerce, ols, isFiniteNum, rAsPct, r2AsPct, signPct, fmtP } from '../data/mockData'

export default function CommerceCoMovement({ findings }) {
  const c = findings.commerce ?? {}
  const pts = commerce
    .filter((r) => isFiniteNum(r.g_crossings) && isFiniteNum(r.g_sales_retail))
    .map((r) => ({ x: r.g_crossings, y: r.g_sales_retail, date: r.date.slice(0, 7) }))

  const { slope, intercept, r } = ols(pts, 'x', 'y')
  const rShown = isFiniteNum(c.corr_crossings_retail_yoy) ? c.corr_crossings_retail_yoy : r
  const xs = pts.map((p) => p.x)
  const fit = [
    { x: Math.min(...xs), y: intercept + slope * Math.min(...xs) },
    { x: Math.max(...xs), y: intercept + slope * Math.max(...xs) },
  ]

  return (
    <>
      <div style={{ display: 'flex', gap: 20, alignItems: 'baseline', margin: '0 0 6px' }}>
        <span style={{ fontSize: '1.7rem', fontWeight: 650, color: 'var(--accent)', fontVariantNumeric: 'tabular-nums' }}>
          {rAsPct(rShown)}
        </span>
        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          Pearson r · shares {r2AsPct(rShown)} of variance · levels only {rAsPct(c.corr_crossings_retail_levels)}
        </span>
      </div>
      <ResponsiveContainer width="100%" height={250}>
        <ScatterChart margin={{ top: 6, right: 12, bottom: 16, left: -4 }}>
          <CartesianGrid stroke="var(--border)" />
          <XAxis type="number" dataKey="x" name="crossings YoY"
            domain={['dataMin - 3', 'dataMax + 3']} tickLine={false} axisLine={false}
            allowDecimals={false} tickFormatter={(v) => `${Math.round(v)}%`}
            label={{ value: 'crossings — YoY % change', position: 'insideBottom', offset: -8, style: { fontSize: 11, fill: 'var(--text-faint)' } }} />
          <YAxis type="number" dataKey="y" name="retail sales YoY"
            domain={['dataMin - 2', 'dataMax + 2']} tickLine={false} axisLine={false} width={40}
            allowDecimals={false} tickFormatter={(v) => `${Math.round(v)}%`} />
          <ZAxis range={[34, 34]} />
          <Tooltip cursor={{ strokeDasharray: '3 3' }} formatter={(v) => `${v.toFixed(1)}%`} />
          <ReferenceLine x={0} stroke="var(--border-strong)" />
          <ReferenceLine y={0} stroke="var(--border-strong)" />
          <ReferenceLine segment={fit} stroke="var(--accent)" strokeWidth={1.5} ifOverflow="extendDomain" />
          <Scatter data={pts} fill="#4f46e5" fillOpacity={0.65} />
        </ScatterChart>
      </ResponsiveContainer>

      <table className="mini-table">
        <thead>
          <tr><th>Sector</th><th>2019 slowdown</th><th>COVID ban</th></tr>
        </thead>
        <tbody>
          <tr>
            <td>Retail trade</td>
            <td>{signPct(c.retail_2019_pct)} <span className="muted">{fmtP(c.retail_2019_p)}</span></td>
            <td>{signPct(c.retail_covid_pct)} <span className="muted">{fmtP(c.retail_covid_p)}</span></td>
          </tr>
          <tr>
            <td>Accommodation &amp; food</td>
            <td>{signPct(c.accom_2019_pct)}</td>
            <td style={{ color: 'var(--neg)' }}>{signPct(c.accom_covid_pct)}</td>
          </tr>
        </tbody>
      </table>
      <p className="panel-note">
        Retail spending and crossings track each other in growth rates ({c.sample ?? 'quarterly'}),
        but no single shock dented total retail — cross-border shoppers are a minority slice, and
        COVID stimulus spending offset the loss for everything except hotels and restaurants.
      </p>
    </>
  )
}
