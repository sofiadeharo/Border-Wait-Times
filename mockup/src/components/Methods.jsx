export default function Methods() {
  return (
    <div className="methods">
      <dl>
        <div>
          <dt>Identification</dt>
          <dd>
            Wait times are partly an effect of a strong economy, so levels regressions are
            endogenous and spurious. The 2019 CBP officer reassignment and the 2020–21 travel ban
            changed crossing friction for reasons unrelated to the El Paso business cycle — that is
            what identifies an effect.
          </dd>
        </div>
        <div>
          <dt>Model</dt>
          <dd>
            Log monthly series regressed on a 2019 indicator and a COVID indicator, with month
            fixed effects, a linear time trend, and log peso / log US-retail-sales controls; HAC
            (Newey–West, 6-lag) standard errors. Cointegration by Engle–Granger; Granger tests on
            differenced logs; commerce co-movement on quarterly year-over-year growth.
          </dd>
        </div>
        <div>
          <dt>Data limits</dt>
          <dd>
            Crossing counts and employment are monthly since 2000; taxable sales by industry are
            quarterly since 2016; sales-tax receipts lag the underlying sales ~2 months (shifted
            here). A moderate months-long shock may be too small to read in a single metro.
          </dd>
        </div>
        <div>
          <dt>Next</dt>
          <dd>
            Panel across US–Mexico sister-city pairs with two-way fixed effects and an instrument
            for wait times; near-border vs. interior retail difference-in-differences; Ciudad Juárez
            IMSS wage and maquiladora series for the friction × Juárez-income interaction.
          </dd>
        </div>
      </dl>
      <p style={{ margin: '14px 0 0', fontSize: '0.8rem', color: 'var(--text-faint)' }}>
        Reproducible: <code>analysis/analyze.py</code> · <code>analysis/elpaso_juarez_correlation.ipynb</code>
      </p>
    </div>
  )
}
