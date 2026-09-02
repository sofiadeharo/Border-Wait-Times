# Using the data + model without a live database

The Power BI Service can't reach a database on your laptop. Instead, import a
**file snapshot** of the gold schema — the report then carries its own data and
publishes with zero refresh/gateway setup.

## Refresh the snapshot files

```bash
DB_HOST=localhost DB_PORT=5544 DB_NAME=border_wait_times \
  DB_USER=postgres DB_PASSWORD=border_pass_2026 \
  python powerbi/export_gold.py
```

Writes to `powerbi/data/`:

| File | Rows | Use |
|---|---|---|
| `dim_port.csv`, `dim_scenario.csv`, `dim_cost_params.csv`, `dim_date.csv` | tiny | dimensions |
| `fact_border_delay_cost.parquet` | ~380k (last 3 yrs, hourly) | the fact — all 6 report pages incl. the simulator |
| `fact_monthly_summary.csv` | ~500 | quick previews / Excel |

---

## A · Power BI Desktop from files  *(recommended)*

1. **Get data → More → Folder** → select `powerbi/data/` → **Combine? No, Transform** →
   or just **Get data → Parquet / Text-CSV** and add each file one at a time.
2. Load `fact_border_delay_cost` (Parquet) + the four `dim_*` CSVs.
3. Model view: same 3 relationships and Mark-as-date-table as
   [`BUILD.md`](BUILD.md) step 2–3.
4. What-if parameters, measures, pages — [`BUILD.md`](BUILD.md) steps 3–6, unchanged
   (the measures in [`measures.dax`](measures.dax) are storage-agnostic).
5. **Publish.** No credentials to set, no gateway — the data is inside the file.
   Turn scheduled refresh **Off** on the dataset.

To update: re-run `export_gold.py`, then in Desktop **Refresh → Publish (Replace)**.

## B · Power BI Project (.pbip) — model as code

**File → Save as → `.pbip`** (enable *Power BI Project (preview)* in Options first).
Desktop externalizes the semantic model to **TMDL** text and the report to JSON:

```
border-delay-cost.SemanticModel/definition/tables/*.tmdl   ← tables, columns, measures
border-delay-cost.SemanticModel/definition/relationships.tmdl
border-delay-cost.Report/definition.pbir
```

Commit that folder — the model + every measure is now diffable and reviewable in git,
and edits can be made in **Tabular Editor** or any text editor.

## C · Excel + Power Pivot — same model, no Power BI

1. **Data → Get Data → From File** → import the CSVs / Parquet into the **Data Model**
   (tick "Add this data to the Data Model").
2. **Power Pivot → Manage → Diagram View** → draw the same relationships.
3. Add measures with DAX (Power Pivot uses the same language) — paste from
   [`measures.dax`](measures.dax).
4. Build **PivotCharts**; save to OneDrive / SharePoint or open in Excel for the web.

## D · Fabric Lakehouse — if you revisit Fabric

Upload `powerbi/data/*` to a Lakehouse `Files/`, load them to Delta tables, and point
a **Direct Lake** semantic model at them. Free during the 60-day trial.

## E · Programmatic — semantic-link (sempy) in a Fabric/AML notebook

```python
import sempy.fabric as fabric
fabric.evaluate_measure("Border delay cost", "Annualised Cost ($M)",
                        groupby_columns=["dim_scenario[scenario_name]"])
```

Read model tables and evaluate measures from Python — useful for regression-testing
the DAX or feeding results back into the ML pipeline.
