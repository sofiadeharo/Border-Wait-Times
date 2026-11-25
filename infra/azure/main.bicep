// Border Wait Times on Azure (fits an Azure for Students subscription).
//
//   PostgreSQL Flexible Server (B1ms) ── shared with the Power BI cost-of-delay warehouse
//        ▲ (bronze/silver/gold schemas live in the same `border_wait_times` database)
//        │
//   Container Apps environment
//     ├─ bwt-frontend   Next.js, public ingress              → the site
//     ├─ bwt-api        FastAPI, INTERNAL ingress only       → called by the frontend
//     ├─ bwt-cbp-pipeline   job, hourly                      → CBP wait times → wait_times
//     └─ bwt-db-init        job, daily + run once on deploy  → schema.sql + holidays.csv
//
// Images come from GitHub Container Registry (.github/workflows/container-images.yml).
// Deploy with infra/azure/deploy.sh.

@description('Azure region. Student subscriptions only allow some regions.')
param location string = resourceGroup().location

@description('Name prefix for the Container Apps resources.')
param prefix string = 'bwt'

// ---------- PostgreSQL (shared) ----------
@description('Flexible Server name. Defaults to the server from docs/azure-postgres.md (Power BI warehouse).')
param pgServerName string = 'borderplex-pg'

@description('true = create the server; false = reuse an existing one (deploy.sh decides).')
param createPostgres bool = true

param pgAdminLogin string = 'bwtadmin'

@secure()
@description('Admin password of the Postgres server (the existing one, when reusing it).')
param pgAdminPassword string

param pgDatabaseName string = 'border_wait_times'

@description('Optional public IP allowed to reach Postgres directly (Power BI Desktop, psql, Adminer). Empty = none.')
param clientIp string = ''

// ---------- images ----------
@description('Registry path holding the images, e.g. ghcr.io/<github-user>.')
param imageRegistry string

param imageTag string = 'latest'

@description('Only needed while the GHCR packages are private: a GitHub user + token with read:packages.')
param registryUsername string = ''

@secure()
param registryPassword string = ''

@description('Changes on every deployment so Container Apps start a new revision and pull the image again.')
param deployStamp string = utcNow()

// ---------------------------------------------------------------------------
var pgHost = '${pgServerName}.postgres.database.azure.com'
var useRegistryAuth = !empty(registryPassword)
var registries = useRegistryAuth ? [
  {
    server: split(imageRegistry, '/')[0]
    username: registryUsername
    passwordSecretRef: 'registry-password'
  }
] : []
var registrySecrets = useRegistryAuth ? [
  {
    name: 'registry-password'
    value: registryPassword
  }
] : []
var secrets = concat([
  {
    name: 'db-password'
    value: pgAdminPassword
  }
], registrySecrets)
var dbEnv = [
  { name: 'DB_HOST', value: pgHost }
  { name: 'DB_PORT', value: '5432' }
  { name: 'DB_NAME', value: pgDatabaseName }
  { name: 'DB_USER', value: pgAdminLogin }
  { name: 'DB_PASSWORD', secretRef: 'db-password' }
]

// ---------- PostgreSQL ----------
resource pgNew 'Microsoft.DBforPostgreSQL/flexibleServers@2023-06-01-preview' = if (createPostgres) {
  name: pgServerName
  location: location
  sku: {
    name: 'Standard_B1ms'
    tier: 'Burstable'
  }
  properties: {
    version: '16'
    administratorLogin: pgAdminLogin
    administratorLoginPassword: pgAdminPassword
    storage: {
      storageSizeGB: 32
    }
    backup: {
      backupRetentionDays: 7
      geoRedundantBackup: 'Disabled'
    }
    highAvailability: {
      mode: 'Disabled'
    }
    network: {
      publicNetworkAccess: 'Enabled'
    }
  }
}

resource pg 'Microsoft.DBforPostgreSQL/flexibleServers@2023-06-01-preview' existing = {
  name: pgServerName
}

resource pgDatabase 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2023-06-01-preview' = if (createPostgres) {
  parent: pg
  name: pgDatabaseName
  properties: {
    charset: 'UTF8'
    collation: 'en_US.utf8'
  }
  dependsOn: [
    pgNew
  ]
}

// Container Apps reach Postgres over Azure IPs (0.0.0.0 = "allow Azure services").
resource pgAllowAzure 'Microsoft.DBforPostgreSQL/flexibleServers/firewallRules@2023-06-01-preview' = {
  parent: pg
  name: 'AllowAzureServices'
  properties: {
    startIpAddress: '0.0.0.0'
    endIpAddress: '0.0.0.0'
  }
  dependsOn: [
    pgNew
  ]
}

resource pgAllowClient 'Microsoft.DBforPostgreSQL/flexibleServers/firewallRules@2023-06-01-preview' = if (!empty(clientIp)) {
  parent: pg
  name: 'AllowClientIp'
  properties: {
    startIpAddress: clientIp
    endIpAddress: clientIp
  }
  dependsOn: [
    pgNew
  ]
}

// ---------- Container Apps environment ----------
resource logs 'Microsoft.OperationalInsights/workspaces@2022-10-01' = {
  name: '${prefix}-logs'
  location: location
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: 30
  }
}

// environmentMode must be explicit: left unset, new environments can come up as 'Express',
// which rejects Container Apps Jobs (bwt-cbp-pipeline, bwt-db-init).
resource env 'Microsoft.App/managedEnvironments@2026-07-01' = {
  name: '${prefix}-env'
  location: location
  properties: {
    environmentMode: 'WorkloadProfiles'
    workloadProfiles: [
      {
        name: 'Consumption'
        workloadProfileType: 'Consumption'
      }
    ]
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logs.properties.customerId
        sharedKey: logs.listKeys().primarySharedKey
      }
    }
  }
}

// ---------- API (internal only) ----------
resource api 'Microsoft.App/containerApps@2024-03-01' = {
  name: '${prefix}-api'
  location: location
  properties: {
    managedEnvironmentId: env.id
    configuration: {
      ingress: {
        external: false
        targetPort: 8000
        transport: 'auto'
      }
      secrets: secrets
      registries: registries
    }
    template: {
      containers: [
        {
          name: 'api'
          image: '${imageRegistry}/bwt-api:${imageTag}'
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
          env: concat(dbEnv, [
            { name: 'DEPLOYED_AT', value: deployStamp }
          ])
          probes: [
            {
              type: 'Readiness'
              httpGet: {
                path: '/health'
                port: 8000
              }
              initialDelaySeconds: 5
              periodSeconds: 10
            }
          ]
        }
      ]
      scale: {
        minReplicas: 0
        maxReplicas: 1
      }
    }
  }
  dependsOn: [
    pgAllowAzure
  ]
}

// ---------- frontend (public) ----------
resource frontend 'Microsoft.App/containerApps@2024-03-01' = {
  name: '${prefix}-frontend'
  location: location
  properties: {
    managedEnvironmentId: env.id
    configuration: {
      ingress: {
        external: true
        targetPort: 3000
        transport: 'auto'
      }
      secrets: registrySecrets
      registries: registries
    }
    template: {
      containers: [
        {
          name: 'frontend'
          image: '${imageRegistry}/bwt-frontend:${imageTag}'
          resources: {
            cpu: json('0.25')
            memory: '0.5Gi'
          }
          env: [
            // Server-side calls from the Next.js /api/* routes to the internal API.
            { name: 'API_URL', value: 'https://${api.properties.configuration.ingress.fqdn}' }
            { name: 'DEPLOYED_AT', value: deployStamp }
          ]
        }
      ]
      scale: {
        minReplicas: 0
        maxReplicas: 1
      }
    }
  }
}

// ---------- scheduled jobs ----------
resource cbpPipeline 'Microsoft.App/jobs@2024-03-01' = {
  name: '${prefix}-cbp-pipeline'
  location: location
  properties: {
    environmentId: env.id
    configuration: {
      triggerType: 'Schedule'
      replicaTimeout: 600
      replicaRetryLimit: 1
      scheduleTriggerConfig: {
        cronExpression: '0 * * * *' // hourly, UTC
        parallelism: 1
        replicaCompletionCount: 1
      }
      secrets: secrets
      registries: registries
    }
    template: {
      containers: [
        {
          name: 'cbp-pipeline'
          image: '${imageRegistry}/bwt-pipeline:${imageTag}'
          command: [
            'python'
            '-u'
            'cbp_data_pipeline.py'
          ]
          resources: {
            cpu: json('0.25')
            memory: '0.5Gi'
          }
          env: dbEnv
        }
      ]
    }
  }
  dependsOn: [
    pgAllowAzure
  ]
}

resource dbInit 'Microsoft.App/jobs@2024-03-01' = {
  name: '${prefix}-db-init'
  location: location
  properties: {
    environmentId: env.id
    configuration: {
      triggerType: 'Schedule'
      replicaTimeout: 600
      replicaRetryLimit: 1
      scheduleTriggerConfig: {
        cronExpression: '30 5 * * *' // daily, UTC; deploy.sh also starts it once
        parallelism: 1
        replicaCompletionCount: 1
      }
      secrets: secrets
      registries: registries
    }
    template: {
      containers: [
        {
          name: 'db-init'
          image: '${imageRegistry}/bwt-db-init:${imageTag}'
          resources: {
            cpu: json('0.25')
            memory: '0.5Gi'
          }
          env: dbEnv
        }
      ]
    }
  }
  dependsOn: [
    pgAllowAzure
  ]
}

output siteUrl string = 'https://${frontend.properties.configuration.ingress.fqdn}'
output postgresHost string = pgHost
output dbInitJobName string = dbInit.name
