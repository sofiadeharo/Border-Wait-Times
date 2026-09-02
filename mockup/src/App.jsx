import { panel, findings, isMock } from './data/mockData'
import KpiGrid from './components/KpiGrid'
import ChannelMatrix from './components/ChannelMatrix'
import CrossingsTimeSeries from './components/CrossingsTimeSeries'
import EventStudy from './components/EventStudy'
import CommerceCoMovement from './components/CommerceCoMovement'
import CorrelationScatter from './components/CorrelationScatter'
import FindingsTable from './components/FindingsTable'
import Methods from './components/Methods'

function Section({ id, title, children }) {
  return (
    <section className="section" id={id}>
      <div className="section-head">
        <h2>{title}</h2>
      </div>
      {children}
    </section>
  )
}

function Panel({ title, subtitle, wide, children }) {
  return (
    <div className={`panel${wide ? ' wide' : ''}`}>
      <div className="panel-head">
        <h3>{title}</h3>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {children}
    </div>
  )
}

export default function App() {
  const span = `${findings.sample?.start?.slice(0, 4) ?? '2000'}–${findings.sample?.end?.slice(0, 4) ?? '2026'}`
  const through = findings.sample?.end ?? '—'

  return (
    <div className="page">
      <div className="topbar">
        <div className="mark">
          <span className="dot" />
          El Paso · Juárez Border Economics
        </div>
        <div className="meta">
          {isMock ? (
            <span className="chip warn">Illustrative data — run analysis/analyze.py</span>
          ) : (
            <span className="chip">BTS · FRED · TX Comptroller</span>
          )}
          <span className="chip">{findings.sample?.n ?? '—'} months · through {through?.slice(0, 7)}</span>
        </div>
      </div>

      <div className="masthead">
        <div className="eyebrow">El Paso · Ciudad Juárez</div>
        <h1>Measuring the link between border-crossing activity and the regional economy</h1>
        <p>
          A {span} monthly panel that decomposes border-crossing activity into its economic channels —
          personal vehicles, pedestrians, freight, buses — and measures how each tracks El Paso
          employment and retail, and how each responds to two friction shocks (the 2019 CBP officer
          reassignment and the COVID land-border ban).
        </p>
      </div>

      <Section id="metrics" title="Key metrics">
        <KpiGrid findings={findings} />
      </Section>

      <Section id="measurement" title="The measurement">
        <div className="panel-grid">
          <Panel
            wide
            title="Border-crossing activity vs. regional economic activity"
            subtitle="Composite crossing index (first principal component of the four channels) against El Paso employment, plus the channel-by-channel breakdown."
          >
            <ChannelMatrix findings={findings} />
          </Panel>
        </div>
      </Section>

      <Section id="charts" title="Detail">
        <div className="panel-grid">
          <Panel
            wide
            title="Crossings vs. El Paso employment"
            subtitle="Monthly personal-vehicle crossings (left) and El Paso MSA employment (right). Shaded: 2019 officer reassignment, COVID travel ban."
          >
            <CrossingsTimeSeries panel={panel} />
          </Panel>

          <Panel
            title="Friction shock — 2019 CBP reassignment"
            subtitle="Effect on each series, OLS with month fixed effects, trend and peso / US-retail controls (HAC errors)."
          >
            <EventStudy panel={panel} findings={findings} />
          </Panel>

          <Panel
            title="Commerce co-movement"
            subtitle="El Paso taxable retail sales vs. crossings, quarterly, year-over-year growth."
          >
            <CommerceCoMovement findings={findings} />
          </Panel>

          <Panel
            wide
            title="Why the raw levels correlation misleads"
            subtitle="Crossings vs. El Paso employment in levels — a shared time trend, not a relationship."
          >
            <CorrelationScatter panel={panel} findings={findings} />
          </Panel>
        </div>
      </Section>

      <Section id="findings" title="All findings">
        <FindingsTable findings={findings} panel={panel} />
      </Section>

      <Section id="methods" title="Methodology">
        <Methods />
      </Section>

      <footer className="site-footer">
        <p>
          <strong>Data.</strong> BTS Border Crossing/Entry Data (El Paso, Ysleta, Tornillo) · FRED
          (El Paso MSA employment &amp; retail employment, MXN/USD, US retail sales, CPI) · Texas
          Comptroller monthly sales-tax allocation and quarterly taxable sales by industry.
        </p>
        <p>
          <strong>Method.</strong> Monthly panel, {span}. ADF stationarity → Engle–Granger
          cointegration → Granger causality → event-study OLS with month fixed effects, a linear
          trend and log peso / log US-retail controls, HAC (Newey–West) standard errors. Correlation
          shown as Pearson r × 100. Reproducible in <code>analysis/analyze.py</code>.
        </p>
        <p>
          {isMock
            ? 'Figures on this page are synthetic and for layout only.'
            : `Generated by analyze.py${findings.generated_at ? ` · ${findings.generated_at.slice(0, 10)}` : ''}.`}
        </p>
      </footer>
    </div>
  )
}
