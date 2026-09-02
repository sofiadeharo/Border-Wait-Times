# Building the report in Power BI Desktop

Prereq: Power BI Desktop (Windows). Connect to the **Azure Postgres** (or `localhost:5432`
if Docker Desktop and Power BI are on the same Windows box).

## 1 · Connect

1. **Home → Get data → More → Database → PostgreSQL database**.
2. Server `borderplex-pg-XXXX.postgres.database.azure.com` (or `localhost`),
   Database `border_wait_times`. Data Connectivity mode: **Import**.
   - If prompted about Npgsql, click *Install* (Power BI bundles it; one-time).
3. Credentials: **Database** → user `bwtadmin` / password. Encryption: **Enable**.
4. In the Navigator expand the **gold** schema, tick:
   `fact_border_delay_cost`, `dim_port`, `dim_date`, `dim_scenario`, `dim_cost_params`
   → **Load**.

## 2 · Model (Model view — left rail)

Create these relationships (drag key to key; all **many-to-one, single direction**):

| From | To |
|---|---|
| `fact_border_delay_cost[port_id]` | `dim_port[port_id]` |
| `fact_border_delay_cost[date]` | `dim_date[date]` |
| `fact_border_delay_cost[scenario_id]` | `dim_scenario[scenario_id]` |

Right-click **`dim_date` → Mark as date table** → date column `date`.

## 3 · What-if parameters

**Modeling → New parameter → Numeric range.** Create five. **Name each exactly as
below** so the generated table + column match the DAX:

| Name | Min | Max | Increment | Default |
|---|---|---|---|---|
| `p_added_wait` | 0 | 120 | 5 | 0 |
| `p_truck_hourly_cost` | 60 | 160 | 5 | 95 |
| `p_carrying_rate` | 0.10 | 0.35 | 0.01 | 0.20 |
| `p_stoppage_cost` | 0 | 8000 | 250 | 2500 |
| `p_volume_growth` | 0.8 | 1.5 | 0.05 | 1.0 |

Leave "Add slicer to page" ticked; you'll move them to the simulator page.

## 4 · Measures

**Model view → right-click `fact_border_delay_cost` → New measure.** Paste each measure
from [`measures.dax`](measures.dax) one at a time (the `//` lines are comments). Order:
the stored measures first, then the `_p_*` helpers, then `Sim Total Cost` and its two
followers.

Set formatting: `Annualised Cost ($M)` and `Sim Annualised ($M)` → format
`$ #,0.0 "M"`; `Cost per Day`, `Cargo Value at Risk` → `$ #,0`; the `% ` measures → `0.0 %`.

## 5 · Pages

Follow [`report_pages.md`](report_pages.md). Per page: drop a visual from the
**Visualizations** pane, drag fields onto its wells.

**Page 1 · Executive**
- **Card**: `Annualised Cost ($M)` — title "Projected cost of border delay / year".
- **Card** ×3: `Cost per Day`, `Avg Excess Delay (min)`, `Cargo Value at Risk`.
- **100% Stacked bar chart**: values `Direct Cost %`, `Inventory Cost %`, `Reliability Cost %`.
- **Line chart**: axis `dim_date[month]` (or a Date hierarchy), values `Annualised Delay Cost`.
- **Waterfall chart**: category `dim_scenario[scenario_name]`, values `Cost vs Baseline`.
- Slicers: `dim_scenario[scenario_name]` (single-select, default *Current wait times*),
  `dim_date` (between), `dim_port[port_name]`.

**Page 2 · Where the money leaks**
- **Matrix**: rows `dim_date[day_of_week]`, columns `fact_border_delay_cost[hour]`,
  values `Total Delay Cost`. Format → Cell elements → **Background color** on by value.
- **Bar chart**: `Annualised Cost ($M)` by `dim_port[port_name]`.
- **Column chart**: `Total Delay Cost` by `hour`.

**Page 3 · Scenario simulator**
- Put the five `p_*` slicers here.
- **Card**: `Sim Annualised ($M)` (large).
- **Card**: `Sim vs Stored Delta ($M)` — subtitle "vs. the selected scenario".
- **Gauge**: value `Sim Annualised ($M)`, Max = the commercial-disruption number (~456).
- **Clustered bar**: `Sim Total Cost` by `dim_port[port_name]`.
- **Text box**: parameter sources (ATRI $/hr, inventory carrying literature, BTS TransBorder).

**Page 4 · Supply-chain exposure** — needs `dim_commodity` (BTS TransBorder); build later.
**Page 5 · Forecast** — line of `fact_border_delay_cost[predicted_wait_min]` by date with
the built-in **Forecast** analytics option; line of `Total Delay Cost`.
**Page 6 · Backtest** — line of `Total Delay Cost` across 2019 / 2020 months; a text box
noting commercial lanes were shielded in 2019.

## 6 · Theme

**View → Themes → Customize current theme.** Neutral slate + one accent. In the cost
decomposition visuals set: Direct = slate, Inventory = amber, Reliability = red.

## 7 · Publish

**Home → Publish** → sign in → choose a workspace (Pro). In the Power BI **Service**:
workspace → the dataset → **Settings → Data source credentials** → edit → enter the
Postgres user/password, privacy level **Organizational**. Set a **Scheduled refresh**
(hourly) — Azure PG is a cloud source, no gateway needed. Share the report link.
