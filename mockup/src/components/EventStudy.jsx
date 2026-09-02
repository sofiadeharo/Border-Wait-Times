import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, Cell, ResponsiveContainer, LabelList,
} from 'recharts'
import { eventEffect, isFiniteNum, fmtP, signPct } from '../data/mockData'

const ROWS = [
  { key: 'crossings', pctKey: 'crossings_pct', pKey: 'crossings_p', label: 'Vehicle crossings' },
  { key: 'pedestrians', pctKey: 'pedestrians_pct', pKey: 'pedestrians_p', label: 'Pedestrian crossings' },
  { key: 'elpaso_retail_emp', pctKey: 'retail_emp_pct', pKey: 'retail_emp_p', label: 'Retail employment' },
  { key: 'sales_tax', pctKey: 'sales_tax_pct', pKey: 'sales_tax_p', label: 'Sales-tax receipts' },
]

export default function EventStudy({ panel, findings }) {
  const e = findings.event_2019 ?? {}
  const c = findings.event_covid ?? {}

  const data = ROWS.map((r) => {
    const pct = isFiniteNum(e[r.pctKey]) ? e[r.pctKey] : eventEffect(panel, r.key).pct
    return { name: r.label, pct: +pct.toFixed(1), p: e[r.pKey], sig: isFiniteNum(e[r.pKey]) && e[r.pKey] < 0.05 }
  })

  return (
    <>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 48, bottom: 4, left: 6 }}>
          <CartesianGrid stroke="var(--border)" horizontal={false} />
          <XAxis type="number" unit="%" tickLine={false} axisLine={false} domain={['dataMin - 4', 'dataMax + 4']} />
          <YAxis type="category" dataKey="name" width={128} tickLine={false} axisLine={false} />
          <Tooltip formatter={(v, _n, o) => [`${v}%  (${fmtP(o.payload.p)})`, 'effect']} />
          <ReferenceLine x={0} stroke="var(--border-strong)" />
          <Bar dataKey="pct" radius={[0, 4, 4, 0]} barSize={20}>
            {data.map((d) => (
              <Cell key={d.name} fill={d.pct < 0 ? '#d92d20' : '#067647'} fillOpacity={d.sig ? 1 : 0.35} />
            ))}
            <LabelList dataKey="pct" position="right"
              formatter={(v) => `${v > 0 ? '+' : ''}${v}%`}
              style={{ fontSize: 11, fill: 'var(--text-muted)', fontWeight: 600 }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      <table className="mini-table">
        <thead>
          <tr><th>Shock</th><th>Vehicle crossings</th><th>Retail employment</th></tr>
        </thead>
        <tbody>
          <tr>
            <td>2019 reassignment (6 mo)</td>
            <td>{signPct(e.crossings_pct)} <span className="muted">{fmtP(e.crossings_p)}</span></td>
            <td>{signPct(e.retail_emp_pct)} <span className="muted">{fmtP(e.retail_emp_p)}</span></td>
          </tr>
          <tr>
            <td>COVID ban (19 mo)</td>
            <td>{signPct(c.crossings_pct, 0)} <span className="muted">{fmtP(c.crossings_p)}</span></td>
            <td>{signPct(c.retail_emp_pct)} <span className="muted">{fmtP(c.retail_emp_p)}</span></td>
          </tr>
        </tbody>
      </table>
      <p className="panel-note">
        Solid bars significant at p&nbsp;&lt;&nbsp;0.05. The moderate 2019 shock moved crossing
        behavior but not jobs; only the far larger COVID shock produced a clear employment drop —
        a dose–response pattern.
      </p>
    </>
  )
}
