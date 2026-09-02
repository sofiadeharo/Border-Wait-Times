# Power BI — Projected Economic Cost of Border Delays

A report that visualises **what border-crossing delay costs the El Paso–Ciudad Juárez
cross-border supply chain**, built on the `gold` schema from the medallion pipeline
([`../backend/warehouse/`](../backend/warehouse)).

Not "wait-time predictions" — the money those predictions imply.

## Files

| File | What |
|---|---|
| [`semantic_model.md`](semantic_model.md) | tables, relationships, storage mode, what-if parameters |
| [`measures.dax`](measures.dax) | copy-paste DAX for every measure |
| [`report_pages.md`](report_pages.md) | page-by-page layout and visual spec |

## Connect

1. **Get Data → PostgreSQL database** — server
   `borderplex-pg.postgres.database.azure.com`, database `border_wait_times`.
2. Import (`Import` mode — data is small, ~1 M rows) the `gold` tables:
   `fact_border_delay_cost`, `dim_port`, `dim_date`, `dim_scenario`, `dim_cost_params`.
3. Build relationships per `semantic_model.md`, paste measures from `measures.dax`.
4. **Publish** to a Power BI workspace; share the report link (Pro) or embed it in the
   Container Apps shell.

## Headline the report should land

> At today's wait times, border delay costs El Paso's cross-border freight sector an
> estimated **$22 M/year** — almost all of it absorbed, not avoided. If commercial
> lanes lost their staffing priority (a 2019-style shock), that jumps past **$450 M/year**
> as just-in-time plants start missing parts. A preclearance investment that shaves
> 12 minutes pays for itself many times over.
