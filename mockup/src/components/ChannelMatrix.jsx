import {
  ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ReferenceArea, ReferenceLine, ResponsiveContainer,
} from 'recharts'
import { channelFrame, isFiniteNum, rAsPct, signPct, fmtP } from '../data/mockData'

function zscore(xs) {
  const v = xs.filter(isFiniteNum)
  const m = v.reduce((s, x) => s + x, 0) / v.length
  const sd = Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / v.length)
  return (x) => (isFiniteNum(x) ? (x - m) / sd : null)
}

export default function ChannelMatrix({ findings }) {
  const ch = findings.channels ?? { rows: [] }
  const composite = ch.rows.find((r) => r.key === 'border_activity') ?? {}
  const rCompEmp = isFiniteNum(ch.composite_corr_emp_yoy) ? ch.composite_corr_emp_yoy : composite.corr_emp_yoy

  const src = channelFrame.filter((r) => isFiniteNum(r.g_border_activity) && isFiniteNum(r.g_elpaso_emp))
  const zb = zscore(src.map((r) => r.g_border_activity))
  const ze = zscore(src.map((r) => r.g_elpaso_emp))
  const data = src.map((r) => ({ t: r.date.slice(0, 7), border: zb(r.g_border_activity), emp: ze(r.g_elpaso_emp) }))
  const yearTicks = data.filter((_, i) => i % 24 === 0).map((d) => d.t)

  return (
    <>
      <div style={{ display: 'flex', gap: 22, alignItems: 'baseline', margin: '0 0 4px' }}>
        <span style={{ fontSize: '1.9rem', fontWeight: 660, color: 'var(--accent)', fontVariantNumeric: 'tabular-nums' }}>
          {rAsPct(rCompEmp)}
        </span>
        <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
          composite border-crossing activity vs. El Paso employment · year-over-year growth · monthly
        </span>
      </div>

      <ResponsiveContainer width="100%" height={250}>
        <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 4, left: -6 }}>
          <CartesianGrid stroke="var(--border)" vertical={false} />
          <XAxis dataKey="t" ticks={yearTicks} tickFormatter={(t) => t.slice(0, 4)} tickLine={false} axisLine={false} />
          <YAxis tickLine={false} axisLine={false} width={46}
            tickFormatter={(v) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v)}σ`}
            domain={[-4, 4]} ticks={[-3, 0, 3]} />
          <ReferenceArea x1="2019-03" x2="2019-08" fill="#d92d20" fillOpacity={0.07} />
          <ReferenceArea x1="2020-04" x2="2021-10" fill="#667085" fillOpacity={0.09} />
          <ReferenceLine y={0} stroke="var(--border-strong)" />
          <Tooltip formatter={(v, n) => [`${v > 0 ? '+' : ''}${v.toFixed(2)}σ`, n]} />
          <Legend iconType="plainline" />
          <Line type="monotone" dataKey="border" name="Border-crossing activity"
            stroke="#4f46e5" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="emp" name="El Paso employment"
            stroke="#0d9488" strokeWidth={2} dot={false} />
        </ComposedChart>
      </ResponsiveContainer>

      <table className="mini-table">
        <thead>
          <tr>
            <th>Crossing channel</th>
            <th>vs. El&nbsp;Paso employment</th>
            <th>vs. retail employment</th>
            <th>2019 slowdown</th>
            <th>COVID ban</th>
          </tr>
        </thead>
        <tbody>
          {ch.rows.map((r) => {
            const isComposite = r.key === 'border_activity'
            const isTrucks = r.key === 'trucks'
            return (
              <tr key={r.key} style={{ fontWeight: isComposite ? 650 : 400, background: isTrucks ? 'var(--surface-2)' : undefined }}>
                <td style={{ textAlign: 'left' }}>
                  {r.label}
                  {isTrucks && <span className="muted"> — supply chain</span>}
                </td>
                <td>{rAsPct(r.corr_emp_yoy)}</td>
                <td>{rAsPct(r.corr_retail_yoy)}</td>
                <td>{isFiniteNum(r.e2019_pct) ? <>{signPct(r.e2019_pct, 0)} <span className="muted">{fmtP(r.e2019_p)}</span></> : '—'}</td>
                <td>{isFiniteNum(r.ecovid_pct) ? <>{signPct(r.ecovid_pct, 0)} <span className="muted">{fmtP(r.ecovid_p)}</span></> : '—'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>

      <p className="panel-note">
        Every channel's growth co-moves with the El Paso economy, but they respond to friction very
        differently. <strong>Freight is friction-immune</strong> — trucks (the Juárez maquiladora
        supply chain) show no measurable effect from the 2019 slowdown (+1%, n.s.) or even the COVID
        ban (−1%, n.s.), while personal-vehicle and pedestrian crossings swung 10–50%. Border friction
        taxes cross-border <em>consumers and commuters</em>, not the industrial integration between
        the two cities.
      </p>
    </>
  )
}
