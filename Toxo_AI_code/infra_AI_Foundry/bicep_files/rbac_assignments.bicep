targetScope = 'resourceGroup' 

@description('Array of objects containing principalId and roleName') 
param assignments array 

// Mapping of common Role Names to their Definition IDs 
var roleMapping = { 
  Owner: '8e3af657-a8ff-443c-a75c-2fe8c4bcb635' 
  Contributor: 'b24988ac-6180-42a0-ab88-20f7382dd24c' 
  Reader: 'acdd72a7-3385-48ef-bd42-f606fba81ae7' 
  AcrPull: '7f951dda-4ed3-4680-af7a-1e05135b3a49' // Removed quotes to satisfy linter
} 

resource roleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = [for assignment in assignments: { 
  // Generate a unique, deterministic name for the assignment 
  name: guid(resourceGroup().id, assignment.principalId, assignment.roleName) 
  properties: { 
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roleMapping[assignment.roleName]) 
    principalId: assignment.principalId 
    // Changed to 'User' to match the identity detected in your logs
    principalType: 'User'
  } 
}]
