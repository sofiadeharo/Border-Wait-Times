import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ReferenceArea, ResponsiveContainer,
} from 'recharts'

export default function CrossingsTimeSeries({ panel }) {
  const data = panel.map((r) => ({
    t: r.date.slice(0, 7),
    crossings: r.crossings,
    elpaso_emp: r.elpaso_emp,
  }))
  const yearTicks = data.filter((_, i) => i % 24 === 0).map((d) => d.t)

  return (
    <>
      <ResponsiveContainer width="100%" height={320}>
        <ComposedChart data={data} margin={{ top: 6, right: 8, bottom: 4, left: -12 }}>
          <CartesianGrid stroke="var(--border)" vertical={false} />
          <defs>
            <linearGradient id="cxFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#4f46e5" stopOpacity={0.22} />
              <stop offset="100%" stopColor="#4f46e5" stopOpacity={0.02} />
            </linearGradient>
          </defs>

          <ReferenceArea x1="2019-03" x2="2019-08" fill="#d92d20" fillOpacity={0.08} />
          <ReferenceArea x1="2020-04" x2="2021-10" fill="#667085" fillOpacity={0.1} />

          <XAxis dataKey="t" ticks={yearTicks} tickFormatter={(t) => t.slice(0, 4)} tickLine={false} axisLine={false} />
          <YAxis yAxisId="left" tickLine={false} axisLine={false} width={52}
            tickFormatter={(v) => `${v.toFixed(1)}M`} />
          <YAxis yAxisId="right" orientation="right" tickLine={false} axisLine={false} width={44}
            tickFormatter={(v) => `${Math.round(v)}k`} domain={['auto', 'auto']} />
          <Tooltip />
          <Legend iconType="plainline" />

          <Area yAxisId="left" type="monotone" dataKey="crossings" name="Vehicle crossings"
            stroke="#4f46e5" strokeWidth={1.75} fill="url(#cxFill)" connectNulls />
          <Line yAxisId="right" type="monotone" dataKey="elpaso_emp" name="El Paso employment"
            stroke="#0d9488" strokeWidth={2} dot={false} connectNulls />
        </ComposedChart>
      </ResponsiveContainer>
      <p className="panel-note">
        Vehicle crossings fell ~35% over 25 years (trusted-traveler lanes, tighter ID rules, 2008)
        while El Paso added jobs — the two series diverge structurally.
      </p>
    </>
  )
}
