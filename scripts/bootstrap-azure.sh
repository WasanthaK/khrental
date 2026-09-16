#!/usr/bin/env bash

set -euo pipefail

# Idempotent bootstrap for the KH Rentals free-cloud deployment. Run this from
# Azure Cloud Shell while signed in to the subscription that owns the existing
# khrental-prod-rg resource group and Azure SQL database.

readonly subscription_id="${AZURE_SUBSCRIPTION_ID:-3d42a180-fda5-4013-afcc-fdba10266f9b}"
readonly resource_group="${AZURE_RESOURCE_GROUP:-khrental-prod-rg}"
readonly location="${AZURE_LOCATION:-southeastasia}"
readonly container_environment="${AZURE_CONTAINER_ENVIRONMENT:-khrental-prod-env}"
readonly container_app="${AZURE_CONTAINER_APP_NAME:-khrental-app}"
readonly sql_server="${MSSQL_SERVER:-khrentals.database.windows.net}"
readonly sql_database="${MSSQL_DATABASE:-khrentalsdb}"
readonly github_repository="${GITHUB_REPOSITORY:-WasanthaK/khrental}"
readonly github_environment="${GITHUB_ENVIRONMENT:-Production}"
readonly deployment_identity="${AZURE_DEPLOYMENT_IDENTITY_NAME:-khrental-github-deploy}"
readonly federated_credential_name="github-${github_environment,,}"

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Required command is unavailable: $1" >&2
    exit 1
  fi
}

require_command az

if ! az account show >/dev/null 2>&1; then
  echo "Azure CLI is not signed in. Open Azure Cloud Shell and run this script there." >&2
  exit 1
fi

az account set --subscription "$subscription_id"

if [[ "$(az group exists --name "$resource_group" -o tsv)" != "true" ]]; then
  echo "Resource group $resource_group does not exist in subscription $subscription_id." >&2
  exit 1
fi

echo "Registering Azure Container Apps provider..."
az provider register --namespace Microsoft.App --wait
az provider register --namespace Microsoft.ManagedIdentity --wait
az extension add --name containerapp --upgrade --yes >/dev/null

if ! az containerapp env show \
  --name "$container_environment" \
  --resource-group "$resource_group" >/dev/null 2>&1; then
  echo "Creating Container Apps consumption environment..."
  az containerapp env create \
    --name "$container_environment" \
    --resource-group "$resource_group" \
    --location "$location" \
    --logs-destination none \
    --output none
fi

if ! az containerapp show \
  --name "$container_app" \
  --resource-group "$resource_group" >/dev/null 2>&1; then
  echo "Creating the Container App shell..."
  az containerapp create \
    --name "$container_app" \
    --resource-group "$resource_group" \
    --environment "$container_environment" \
    --image mcr.microsoft.com/azuredocs/containerapps-helloworld:latest \
    --ingress external \
    --target-port 80 \
    --min-replicas 0 \
    --max-replicas 1 \
    --cpu 0.25 \
    --memory 0.5Gi \
    --output none
fi

echo "Enabling the application's system-assigned managed identity..."
az containerapp identity assign \
  --name "$container_app" \
  --resource-group "$resource_group" \
  --system-assigned \
  --output none

echo "Configuring non-secret application settings..."
az containerapp update \
  --name "$container_app" \
  --resource-group "$resource_group" \
  --set-env-vars \
    NODE_ENV=production \
    PORT=5174 \
    MSSQL_SERVER="$sql_server" \
    MSSQL_DATABASE="$sql_database" \
    MSSQL_AUTHENTICATION=managed-identity \
    MSSQL_ENCRYPT=true \
    MSSQL_TRUST_SERVER_CERTIFICATE=false \
    AUTH_SESSION_TTL_DAYS=30 \
    VITE_API_ENDPOINT= \
    VITE_ENABLE_DEV_BYPASS=false \
  --output none

tenant_id="$(az account show --query tenantId -o tsv)"

if ! az identity show \
  --name "$deployment_identity" \
  --resource-group "$resource_group" >/dev/null 2>&1; then
  echo "Creating the GitHub deployment managed identity..."
  az identity create \
    --name "$deployment_identity" \
    --resource-group "$resource_group" \
    --location "$location" \
    --output none
fi

app_client_id="$(az identity show \
  --name "$deployment_identity" \
  --resource-group "$resource_group" \
  --query clientId -o tsv)"
service_principal_id="$(az identity show \
  --name "$deployment_identity" \
  --resource-group "$resource_group" \
  --query principalId -o tsv)"

federated_subject="repo:${github_repository}:environment:${github_environment}"
if ! az identity federated-credential show \
  --name "$federated_credential_name" \
  --identity-name "$deployment_identity" \
  --resource-group "$resource_group" >/dev/null 2>&1; then
  echo "Trusting the GitHub Production environment through OIDC..."
  az identity federated-credential create \
    --name "$federated_credential_name" \
    --identity-name "$deployment_identity" \
    --resource-group "$resource_group" \
    --issuer https://token.actions.githubusercontent.com \
    --subject "$federated_subject" \
    --audiences api://AzureADTokenExchange \
    --output none
fi

container_app_id="$(az containerapp show \
  --name "$container_app" \
  --resource-group "$resource_group" \
  --query id -o tsv)"

if ! az role assignment list \
  --assignee "$service_principal_id" \
  --scope "$container_app_id" \
  --query "[?roleDefinitionName=='Contributor'] | [0].id" -o tsv | grep -q .; then
  echo "Granting deployment access only to the KH Rentals Container App..."
  az role assignment create \
    --assignee-object-id "$service_principal_id" \
    --assignee-principal-type ServicePrincipal \
    --role Contributor \
    --scope "$container_app_id" \
    --output none
fi

container_principal_id="$(az containerapp identity show \
  --name "$container_app" \
  --resource-group "$resource_group" \
  --query principalId -o tsv)"
container_fqdn="$(az containerapp show \
  --name "$container_app" \
  --resource-group "$resource_group" \
  --query properties.configuration.ingress.fqdn -o tsv)"

cat <<OUTPUT

Azure bootstrap completed successfully.

Add these GitHub environment secrets to Production:
AZURE_CLIENT_ID=$app_client_id
AZURE_TENANT_ID=$tenant_id
AZURE_SUBSCRIPTION_ID=$subscription_id

Add these GitHub environment variables to Production:
AZURE_RESOURCE_GROUP=$resource_group
AZURE_CONTAINER_APP_NAME=$container_app

Then authorize the Container App inside khrentalsdb with:
CREATE USER [$container_app] FROM EXTERNAL PROVIDER;
ALTER ROLE db_datareader ADD MEMBER [$container_app];
ALTER ROLE db_datawriter ADD MEMBER [$container_app];

Container App managed identity object ID: $container_principal_id
Temporary URL: https://$container_fqdn
OUTPUT
