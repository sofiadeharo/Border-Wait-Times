#!/usr/bin/env bash
# Deploy Border Wait Times to Azure (Container Apps + shared PostgreSQL Flexible Server).
#
#   az login                      # once
#   infra/azure/deploy.sh         # create or update everything
#
# Settings (environment variables, all optional except the password):
#   PG_ADMIN_PASSWORD   Postgres admin password (prompted if unset). When the server already
#                       exists (e.g. created for the Power BI warehouse) use ITS password.
#   RG                  resource group            (default: borderplex-rg)
#   LOCATION            Azure region              (default: southcentralus)
#   PG_SERVER           Postgres server name      (default: borderplex-pg)
#   PG_ADMIN            Postgres admin login      (default: bwtadmin)
#   PG_DB               database name             (default: border_wait_times)
#   IMAGE_REGISTRY      where the images live     (default: ghcr.io/<owner of the origin remote>)
#   IMAGE_TAG           image tag to deploy       (default: latest)
#   GHCR_USERNAME / GHCR_TOKEN   only if the GHCR packages are private (token: read:packages)
#   ALLOW_MY_IP=1       also open Postgres to this machine's public IP (Power BI, psql, Adminer)
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RG="${RG:-borderplex-rg}"
LOCATION="${LOCATION:-southcentralus}"
PG_SERVER="${PG_SERVER:-borderplex-pg}"
PG_ADMIN="${PG_ADMIN:-bwtadmin}"
PG_DB="${PG_DB:-border_wait_times}"
IMAGE_TAG="${IMAGE_TAG:-latest}"
PREFIX="bwt"

if [[ -z "${IMAGE_REGISTRY:-}" ]]; then
  owner="$(git -C "$HERE" remote get-url origin | sed -E 's#.*github\.com[:/]([^/]+)/.*#\1#' | tr '[:upper:]' '[:lower:]')"
  IMAGE_REGISTRY="ghcr.io/${owner}"
fi

say() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }

command -v az >/dev/null || { echo "Azure CLI not found. Install it: https://learn.microsoft.com/cli/azure/install-azure-cli"; exit 1; }
az account show >/dev/null 2>&1 || { echo "Not signed in. Run: az login"; exit 1; }
echo "Subscription: $(az account show --query name -o tsv)"

if [[ -z "${PG_ADMIN_PASSWORD:-}" ]]; then
  read -rsp "Postgres admin password for ${PG_ADMIN}@${PG_SERVER}: " PG_ADMIN_PASSWORD; echo
fi

say "Registering resource providers (first run only takes a minute)"
for ns in Microsoft.App Microsoft.OperationalInsights Microsoft.DBforPostgreSQL; do
  az provider register --namespace "$ns" --wait >/dev/null
done
az extension add --name containerapp --upgrade --only-show-errors >/dev/null

say "Checking images in ${IMAGE_REGISTRY} (tag: ${IMAGE_TAG})"
for img in bwt-api bwt-frontend bwt-pipeline bwt-db-init; do
  repo="${IMAGE_REGISTRY#ghcr.io/}/${img}"
  token="$(curl -fsS "https://ghcr.io/token?scope=repository:${repo}:pull" 2>/dev/null | sed -E 's/.*"token":"([^"]+)".*/\1/' || true)"
  if [[ -n "$token" ]] && curl -fsS -o /dev/null -H "Authorization: Bearer ${token}" \
       -H "Accept: application/vnd.oci.image.index.v1+json, application/vnd.docker.distribution.manifest.v2+json, application/vnd.docker.distribution.manifest.list.v2+json" \
       "https://ghcr.io/v2/${repo}/manifests/${IMAGE_TAG}"; then
    echo "  ok       ${img}:${IMAGE_TAG}"
  elif [[ -n "${GHCR_TOKEN:-}" ]]; then
    echo "  private? ${img}:${IMAGE_TAG} (not publicly readable; using GHCR_TOKEN)"
  else
    echo "  MISSING  ${img}:${IMAGE_TAG} — run the 'Container images' GitHub Action first, then make the"
    echo "           package public (GitHub → Packages → ${img} → Settings) or set GHCR_USERNAME/GHCR_TOKEN."
    exit 1
  fi
done

say "Resource group ${RG} (${LOCATION})"
az group create -n "$RG" -l "$LOCATION" -o none

create_pg=true
if az postgres flexible-server show -g "$RG" -n "$PG_SERVER" -o none 2>/dev/null; then
  create_pg=false
  say "Reusing existing Postgres server ${PG_SERVER} (shared with the Power BI warehouse)"
  if ! az postgres flexible-server db show -g "$RG" -s "$PG_SERVER" -d "$PG_DB" -o none 2>/dev/null; then
    az postgres flexible-server db create -g "$RG" -s "$PG_SERVER" -d "$PG_DB" -o none
  fi
else
  say "Creating Postgres server ${PG_SERVER} (B1ms, PostgreSQL 16)"
fi

client_ip=""
if [[ "${ALLOW_MY_IP:-0}" == "1" ]]; then
  client_ip="$(curl -fsS https://api.ipify.org)"
  echo "Allowing direct Postgres access from ${client_ip}"
fi

say "Deploying (Postgres, Container Apps environment, api, frontend, jobs) — 5-10 min the first time"
outputs="$(az deployment group create -g "$RG" -n "bwt-$(date +%Y%m%d%H%M%S)" \
  -f "$HERE/main.bicep" \
  -p location="$LOCATION" prefix="$PREFIX" \
     pgServerName="$PG_SERVER" createPostgres="$create_pg" \
     pgAdminLogin="$PG_ADMIN" pgAdminPassword="$PG_ADMIN_PASSWORD" pgDatabaseName="$PG_DB" \
     clientIp="$client_ip" \
     imageRegistry="$IMAGE_REGISTRY" imageTag="$IMAGE_TAG" \
     registryUsername="${GHCR_USERNAME:-}" registryPassword="${GHCR_TOKEN:-}" \
  --query properties.outputs -o json)"

site_url="$(printf '%s' "$outputs" | sed -nE 's/.*"siteUrl"[^}]*"value": *"([^"]+)".*/\1/p' | head -1)"
[[ -n "$site_url" ]] || site_url="$(az containerapp show -g "$RG" -n "${PREFIX}-frontend" --query 'properties.configuration.ingress.fqdn' -o tsv | sed 's#^#https://#')"

say "Initialising the database (schema + holiday calendar)"
az containerapp job start -g "$RG" -n "${PREFIX}-db-init" -o none
echo "Started ${PREFIX}-db-init. Check it with:"
echo "  az containerapp job execution list -g $RG -n ${PREFIX}-db-init -o table"

say "Done"
echo "Site:      ${site_url}"
echo "Postgres:  ${PG_SERVER}.postgres.database.azure.com / ${PG_DB}"
echo "CBP data:  ${PREFIX}-cbp-pipeline runs hourly; start it now with"
echo "           az containerapp job start -g $RG -n ${PREFIX}-cbp-pipeline"
