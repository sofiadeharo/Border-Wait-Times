# Stage 2 — Border-crossing activity & the El Paso–Juárez regional economy

How does border-crossing activity relate to regional economic activity across El Paso
and Ciudad Juárez, and how does that link hold up under crossing friction? A monthly
panel (2000–2026), border crossings decomposed by channel, plus two natural experiments.

## Run

```bash
cd analysis
python -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/python analyze.py            # fetch + model + write outputs
# or, narrated:
.venv/bin/jupyter lab elpaso_juarez_correlation.ipynb
```

`analyze.py` caches raw pulls to `data/raw/`, writes the panel to `output/`,
figures to `../docs/`, and `panel.json` / `findings.json` to `../mockup/src/data/`.

## Findings

| Test | Result |
|---|---|
| **Composite border-crossing activity ↔ El Paso employment** (YoY growth) | **r ≈ +0.53** · retail employment +0.60 · retail *sales* +0.66 |
| Channel: personal vehicles ↔ El Paso retail employment (YoY) | r ≈ +0.62 |
| Channel: trucks (freight) — friction shocks | 2019 **+1% (n.s.)**, COVID **−1% (n.s.)** — the Juárez maquila supply chain is friction-immune |
| Correlation, crossings vs. El Paso employment (raw levels) | **r ≈ −0.54** — negative and spurious (opposite 25-yr trends) |
| Engle–Granger cointegration | **none** (residual ADF p ≈ 0.39) — no stable long-run link in levels |
| Granger causality | El Paso activity → crossings (p ≈ 0.0002); reverse weak — crossings are demand-driven |
| **2019 CBP officer reassignment** (Mar–Aug) | vehicle crossings **−9.9%** (p = 0.002); **−13%** for Apr–Jul; pedestrian crossings **+28%** (p < 0.001); El Paso employment / retail sales / sales tax: not significant |
| **COVID land-border ban** (Apr 2020 – Oct 2021) | vehicle crossings **−39%** (p < 0.001); El Paso retail employment **−5.9%** (p = 0.005); accommodation & food sales **−14%** (p < 0.001); general retail sales −3% (n.s.) |
| **Commerce co-movement** — crossings vs. El Paso taxable retail sales (quarterly, 2016+) | levels r ≈ 0.10; **year-over-year growth r ≈ 0.66** |

**Read:** border-crossing activity and the El Paso economy move together in growth
rates (r ≈ 0.5–0.66), even though the raw levels correlation is negative and spurious.
Friction shocks hit the *consumer/commuter* channels hard — personal vehicles −10%
(2019) / −39% (COVID), with substitution to walking (+28% pedestrians in 2019) — but
**freight is friction-immune**: truck crossings, the physical Juárez→El Paso
maquiladora supply chain, show no measurable effect from either shock. Border friction
taxes cross-border consumers and workers, not the industrial integration between the
two cities. No cointegration in levels; the link is cyclical and shock-driven.

## Data sources

- **BTS Border Crossing/Entry Data** (`keg4-3bc2`) — El Paso, Ysleta, Tornillo; personal vehicles, pedestrians, trucks, bus passengers; monthly since 1996
- **FRED** — `LAUMT482134000000005` (El Paso MSA employment), `SMU48213404200000001` (El Paso retail employment), `DEXMXUS`, `RSXFS`, `CPIAUCSL`
- **Texas Comptroller** — `vfba-b57j` City of El Paso monthly sales-tax allocation (2013+, shifted −2 months for the reporting lag); `7z4d-yf2c` quarterly taxable sales by NAICS industry (2016+)

## Method

Log monthly series regressed on a 2019 indicator + a COVID indicator, with month
fixed effects, a linear time trend, and log peso / log US-retail controls; HAC
(Newey–West, 6-lag) standard errors. Cointegration via Engle–Granger two-step;
Granger tests on differenced logs.

## Limitations & next steps

- Monthly frequency; sales tax only 2013+. A moderate months-long shock may be too
  small to read in one metro's monthly employment.
- Single time series → panel across US–Mexico sister-city pairs with two-way fixed
  effects and an instrument for wait times.
- Add Ciudad Juárez IMSS employment / wages and maquiladora output to test the
  friction × Juárez-income interaction.
