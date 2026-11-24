# Deploying to Azure (Azure for Students)

The site runs on **Azure Container Apps** and shares one **Azure Database for PostgreSQL –
Flexible Server** with the Power BI cost-of-delay warehouse (`docs/azure-postgres.md` on the
`azure-postgres` branch). App tables live in the `public` schema of `border_wait_times`; the
warehouse uses `bronze` / `silver` / `gold` in the same database.

| Resource | What it runs |
|---|---|
| `borderplex-pg` (B1ms, PostgreSQL 16) | wait times, user reports, holidays, warehouse |
| `bwt-frontend` (public) | the Next.js site |
| `bwt-api` (internal only) | FastAPI — reachable only from the frontend |
| `bwt-cbp-pipeline` (job, hourly) | CBP wait times → `wait_times` |
| `bwt-db-init` (job, daily + on deploy) | `schema.sql` + `holidays.csv` |

Images are built by GitHub Actions into GitHub Container Registry (`ghcr.io/<you>/bwt-*`).

## First deployment

1. **Install the Azure CLI and sign in** with your student account:
   ```bash
   brew install azure-cli
   az login
   ```
2. **Build the images.** Merge to `main` (the workflow runs on every push to `main`), or
   run *Actions → Container images → Run workflow* once the workflow file is on `main`.
3. **Make the four packages public** (one time): GitHub → your profile → *Packages* →
   `bwt-api`, `bwt-frontend`, `bwt-pipeline`, `bwt-db-init` → *Package settings* →
   *Change visibility → Public*.
   Prefer private? Create a token with `read:packages` and run step 4 with
   `GHCR_USERNAME=<you> GHCR_TOKEN=<token>`.
4. **Deploy:**
   ```bash
   infra/azure/deploy.sh
   ```
   It asks for the Postgres admin password. If `borderplex-pg` already exists (created for
   the Power BI warehouse) it is **reused** — enter that server's password; otherwise the
   server is created with the password you type. At the end it prints the site URL and
   starts `bwt-db-init` once.

   Options: `LOCATION=eastus` (if your subscription blocks `southcentralus`),
   `ALLOW_MY_IP=1` (open Postgres to your machine for Power BI Desktop / psql / Adminer).

## Updating the site

Push to `main` → images rebuild → run `infra/azure/deploy.sh` again (each run starts a new
revision that pulls the latest images). Deploy a specific commit with `IMAGE_TAG=<sha>`.

## Looking at the data

- **Adminer (local)** → System *PostgreSQL*, Server `borderplex-pg.postgres.database.azure.com`,
  user `bwtadmin`, database `border_wait_times` (deploy once with `ALLOW_MY_IP=1`).
- `SELECT * FROM user_reports_vs_cbp ORDER BY submitted_at DESC;` — community reports next
  to the closest CBP reading.
- **Power BI** → *Get Data → PostgreSQL*, same server and database.

## Moving the local Docker data to Azure (optional)

```bash
infra/azure/migrate_local_data.sh
```
Copies the CBP history and the community reports from the local `cbp_postgres` container to
Azure (needs the container running and the Azure firewall open to you: deploy once with
`ALLOW_MY_IP=1`). Rows already on Azure are skipped, so it is safe to re-run.

## Cost (Azure for Students credit)

- Postgres B1ms + 32 GB: covered by the 12-month free offer when eligible, otherwise roughly
  $12–15/month from the credit. `az postgres flexible-server stop -g borderplex-rg -n borderplex-pg`
  pauses compute (Azure restarts it automatically after 7 days).
- Container Apps scale to zero; at this traffic the apps and jobs usually stay inside the
  monthly free grant. Log Analytics: first 5 GB/month free.
- When the credit runs out, services stop — there is no surprise bill unless you upgrade.
- Check spend: Azure portal → *Cost Management*.

## Tear down

```bash
az group delete -n borderplex-rg   # deletes EVERYTHING in the group, including the shared Postgres
```
