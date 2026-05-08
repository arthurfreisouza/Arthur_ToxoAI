@description('The name of the person/owner for the naming convention.')
param personName string 

@description('Specifies the name of the environment (e.g., dev, prod).')
param environment string 

@description('Specifies the location of the resources.')
@allowed([
    'australiaeast'
    'brazilsouth'
    'canadacentral'
    'centralus'
    'eastasia'
    'eastus'
    'eastus2'
    'francecentral'
    'japaneast'
    'koreacentral'
    'northcentralus'
    'northeurope'
    'southeastasia'
    'southcentralus'
    'uksouth'
    'westcentralus'
    'westus'
    'westus2'
    'westeurope'
    'usgovvirginia'
  ])
param location string

// Convention: {personName}-{environment}
// This creates a consistent base for all resource names
var baseName = '${personName}-${environment}'

// Azure Storage names must be alphanumeric and lowercase (max 24 chars) 
var storageAccountName = toLower(take(replace('st${baseName}', '-', ''), 24))
var keyVaultName = take('kv-${baseName}', 24)
var applicationInsightsName = 'appi-${baseName}'
var containerRegistryName = toLower(take(replace('cr${baseName}', '-', ''), 24))
var workspaceName = 'mlw-${baseName}'

resource storageAccount 'Microsoft.Storage/storageAccounts@2022-05-01' = {
  name: storageAccountName
  location: location
  sku: { name: 'Standard_RAGRS' }
  kind: 'StorageV2'
  properties: {
    encryption: {
      services: {
        blob: { enabled: true }
        file: { enabled: true }
      }
      keySource: 'Microsoft.Storage'
    }
    supportsHttpsTrafficOnly: true
    minimumTlsVersion: 'TLS1_2'
    allowBlobPublicAccess: false
    networkAcls: { 
      defaultAction: 'Allow' 
    }
  }
}

resource vault 'Microsoft.KeyVault/vaults@2022-07-01' = {
  name: keyVaultName
  location: location
  properties: {
    tenantId: subscription().tenantId
    sku: { name: 'standard', family: 'A' }
    accessPolicies: []
    enableSoftDelete: true
  }
}

resource applicationInsight 'Microsoft.Insights/components@2020-02-02' = {
  name: applicationInsightsName
  location: location
  kind: 'web'
  properties: { 
    Application_Type: 'web' 
  }
}

resource registry 'Microsoft.ContainerRegistry/registries@2022-02-01-preview' = {
  name: containerRegistryName
  location: location
  sku: { name: 'Standard' }
  properties: { 
    adminUserEnabled: false 
  }
}

resource workspace 'Microsoft.MachineLearningServices/workspaces@2022-10-01' = {
  name: workspaceName
  location: location
  identity: { type: 'SystemAssigned' }
  properties: {
    friendlyName: workspaceName
    storageAccount: storageAccount.id
    keyVault: vault.id
    applicationInsights: applicationInsight.id
    containerRegistry: registry.id
  }
}

output mlWorkspaceName string = workspace.name
