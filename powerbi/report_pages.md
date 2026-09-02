# Report pages

Slicers on every page: `dim_scenario[scenario_name]` (single-select, default *Current
wait times*), `dim_date` range, `dim_port[port_name]`.

## 1 · Executive

| Visual | Fields |
|---|---|
| Card — hero | `[Annualised Cost ($M)]` · title "Projected cost of border delay / year" |
| Card row | `[Cost per Day]`, `[Avg Excess Delay (min)]`, `[Cargo Value at Risk]` |
| 100% stacked bar | `[Direct Cost %]` / `[Inventory Cost %]` / `[Reliability Cost %]` |
| Line | `[Annualised Delay Cost]` by `dim_date[month]` |
| Waterfall | `[Cost vs Baseline]` by `dim_scenario[scenario_name]` |

## 2 · Where the money leaks

| Visual | Fields |
|---|---|
| Matrix heatmap | rows `dim_date[day_of_week]`, cols `fact[hour]`, values `[Total Delay Cost]`, conditional-formatted |
| Bar | `[Annualised Cost ($M)]` by `dim_port[port_name]` |
| Bar | `[Total Delay Cost]` by `fact[hour]` |

## 3 · Scenario simulator

Uses the **live** measures. Five what-if slicers (`p_added_wait`, `p_truck_hourly_cost`,
`p_carrying_rate`, `p_stoppage_cost`, `p_volume_growth`).

| Visual | Fields |
|---|---|
| Card | `[Sim Annualised ($M)]` (big) |
| Card | `[Sim vs Stored Delta ($M)]` — "vs. the selected scenario" |
| Gauge | `[Sim Annualised ($M)]`, max = commercial-disruption scenario value |
| Bar | `[Sim Total Cost]` split by port |
| Text box | model + parameter sources (ATRI, BTS TransBorder, inventory carrying literature) |

## 4 · Supply-chain exposure

*(needs the commodity dimension — add `dim_commodity` from BTS TransBorder)*

| Visual | Fields |
|---|---|
| Treemap | `[Cargo Value at Risk]` by `dim_commodity[maquila_industry]` |
| Bar | `[Reliability Cost]` by `dim_commodity[description]` |
| Card | `[Reliability Cost]` — "JIT disruption exposure" |

## 5 · Forecast

| Visual | Fields |
|---|---|
| Line + band | `fact[predicted_wait_min]` by `dim_date[date]`, next 30 days, forecast analytics |
| Line | `[Total Delay Cost]` projected, next 30 days |
| Card | next-week projected cost |

## 6 · Backtest

| Visual | Fields |
|---|---|
| Line | modeled `[Total Delay Cost]` vs. months of the 2019 CBP slowdown and COVID |
| Annotation | note: historically **commercial lanes were shielded** in 2019 — the
`commercial_disruption` scenario models the counterfactual |

## Theme

Neutral slate + a single accent; format currency as `$#,0,,"M"` on annualised cards,
`$#,0` elsewhere. Cost decomposition: direct = slate, inventory = amber, reliability = red.
