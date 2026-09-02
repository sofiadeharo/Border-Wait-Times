import {
  ScatterChart, Scatter, XAxis, YAxis, ZAxis, CartesianGrid, Tooltip, Legend,
  ReferenceLine, ResponsiveContainer,
} from 'recharts'
import { ols, isFiniteNum, rAsPct } from '../data/mockData'

export default function CorrelationScatter({ panel, findings }) {
  const rows = panel.filter((r) => isFiniteNum(r.crossings) && isFiniteNum(r.elpaso_emp))
  const pre = rows.filter((r) => r.year < 2020).map((r) => ({ x: r.crossings, y: r.elpaso_emp, date: r.date.slice(0, 7) }))
  const post = rows.filter((r) => r.year >= 2020).map((r) => ({ x: r.crossings, y: r.elpaso_emp, date: r.date.slice(0, 7) }))

  const { slope, intercept, r } = ols(rows, 'crossings', 'elpaso_emp')
  const rShown = isFiniteNum(findings.pearson_crossings_activity) ? findings.pearson_crossings_activity : r
  const xs = rows.map((p) => p.crossings)
  const fit = [
    { x: Math.min(...xs), y: intercept + slope * Math.min(...xs) },
    { x: Math.max(...xs), y: intercept + slope * Math.max(...xs) },
  ]

  return (
    <>
      <div style={{ display: 'flex', gap: 20, alignItems: 'baseline', margin: '0 0 6px' }}>
        <span style={{ fontSize: '1.7rem', fontWeight: 650, color: 'var(--neg)', fontVariantNumeric: 'tabular-nums' }}>
          {rAsPct(rShown)}
        </span>
        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          Pearson r in raw levels — negative, and an artifact of opposite trends
        </span>
      </div>
      <ResponsiveContainer width="100%" height={340}>
        <ScatterChart margin={{ top: 6, right: 12, bottom: 16, left: 2 }}>
          <CartesianGrid stroke="var(--border)" />
          <XAxis type="number" dataKey="x" name="crossings"
            domain={['dataMin - 0.05', 'dataMax + 0.05']} tickLine={false} axisLine={false}
            tickFormatter={(v) => `${v.toFixed(1)}M`}
            label={{ value: 'monthly crossings (millions)', position: 'insideBottom', offset: -8, style: { fontSize: 11, fill: 'var(--text-faint)' } }} />
          <YAxis type="number" dataKey="y" name="El Paso employment" unit="k"
            domain={['auto', 'auto']} tickLine={false} axisLine={false} width={52} />
          <ZAxis range={[26, 26]} />
          <Tooltip cursor={{ strokeDasharray: '3 3' }} />
          <Legend iconType="circle" />
          <ReferenceLine segment={fit} stroke="var(--text)" strokeDasharray="5 4" ifOverflow="extendDomain" />
          <Scatter name="2000–2019" data={pre} fill="#94a3b8" fillOpacity={0.5} />
          <Scatter name="2020–2026" data={post} fill="#4f46e5" fillOpacity={0.6} />
        </ScatterChart>
      </ResponsiveContainer>
      <p className="panel-note">
        Both series trend hard in opposite directions, so any levels regression is spurious. The
        analysis works in growth rates and off discrete shocks instead — that is where a real
        relationship shows up.
      </p>
    </>
  )
}
