#!/bin/bash
# Setup script for Azure Function for email sending

# Configuration variables - CHANGE THESE
RESOURCE_GROUP="ThreeCreeks"
LOCATION="eastasia"
FUNCTION_APP_NAME="kh-email-function"
# Make storage account name unique with timestamp
TIMESTAMP=$(date "+%m%d%H%M")
STORAGE_ACCOUNT_NAME="khemailstore$TIMESTAMP"
# Use existing App Service Plan
SERVICE_PLAN_NAME="ThreeCreeks"
SENDGRID_API_KEY="" # Leave empty - will prompt during execution
EMAIL_FROM="noreply@yourdomain.com" # Change to your email
EMAIL_FROM_NAME="KH Rentals"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${YELLOW}Starting Azure Function setup...${NC}"

# Check for Azure CLI
if ! command -v az &> /dev/null; then
    echo -e "${RED}Azure CLI is not installed. Please install it first.${NC}"
    exit 1
fi

# Login to Azure
echo -e "${YELLOW}Logging in to Azure...${NC}"
az login || { echo -e "${RED}Failed to login to Azure.${NC}"; exit 1; }

# Prompt for API key if not provided
if [ -z "$SENDGRID_API_KEY" ]; then
    echo -e "${YELLOW}Enter your SendGrid API key:${NC}"
    read -s SENDGRID_API_KEY
    if [ -z "$SENDGRID_API_KEY" ]; then
        echo -e "${RED}No API key provided. Exiting.${NC}"
        exit 1
    fi
fi

# Create resource group if it doesn't exist
echo -e "${YELLOW}Creating resource group if it doesn't exist...${NC}"
az group create --name "$RESOURCE_GROUP" --location "$LOCATION" || { 
    echo -e "${RED}Failed to create resource group.${NC}"
    exit 1
}

# Check if storage account name is available
echo -e "${YELLOW}Checking storage account name availability...${NC}"
STORAGE_AVAILABLE=$(az storage account check-name --name "$STORAGE_ACCOUNT_NAME" --query "nameAvailable" -o tsv)
if [ "$STORAGE_AVAILABLE" != "true" ]; then
    echo -e "${RED}Storage account name $STORAGE_ACCOUNT_NAME is not available. Please use a different name.${NC}"
    exit 1
fi

# Create storage account for the function
echo -e "${YELLOW}Creating storage account...${NC}"
az storage account create \
    --name "$STORAGE_ACCOUNT_NAME" \
    --location "$LOCATION" \
    --resource-group "$RESOURCE_GROUP" \
    --sku Standard_LRS || {
    echo -e "${RED}Failed to create storage account.${NC}"
    exit 1
}

# Check if the existing App Service Plan exists
echo -e "${YELLOW}Checking for existing App Service Plan '$SERVICE_PLAN_NAME'...${NC}"
PLAN_EXISTS=$(az appservice plan show --resource-group "$RESOURCE_GROUP" --name "$SERVICE_PLAN_NAME" --query "name" --output tsv 2>/dev/null)

if [ -z "$PLAN_EXISTS" ]; then
    echo -e "${YELLOW}Existing plan '$SERVICE_PLAN_NAME' not found in resource group '$RESOURCE_GROUP'.${NC}"
    echo -e "${YELLOW}Please enter the resource group where the App Service Plan exists:${NC}"
    read -r PLAN_RESOURCE_GROUP
    
    if [ -n "$PLAN_RESOURCE_GROUP" ]; then
        PLAN_EXISTS=$(az appservice plan show --resource-group "$PLAN_RESOURCE_GROUP" --name "$SERVICE_PLAN_NAME" --query "name" --output tsv 2>/dev/null)
        
        if [ -z "$PLAN_EXISTS" ]; then
            echo -e "${RED}Could not find App Service Plan '$SERVICE_PLAN_NAME' in resource group '$PLAN_RESOURCE_GROUP' either.${NC}"
            echo -e "${YELLOW}Please provide the exact name of the existing App Service Plan:${NC}"
            read -r CUSTOM_PLAN_NAME
            
            if [ -n "$CUSTOM_PLAN_NAME" ]; then
                SERVICE_PLAN_NAME="$CUSTOM_PLAN_NAME"
                echo -e "${YELLOW}Please provide the resource group of this App Service Plan:${NC}"
                read -r PLAN_RESOURCE_GROUP
            else
                echo -e "${RED}No App Service Plan name provided. Exiting.${NC}"
                exit 1
            fi
        else
            echo -e "${GREEN}Found App Service Plan '$SERVICE_PLAN_NAME' in resource group '$PLAN_RESOURCE_GROUP'.${NC}"
        fi
    else
        echo -e "${RED}No resource group provided for the App Service Plan. Exiting.${NC}"
        exit 1
    fi
else
    echo -e "${GREEN}Found App Service Plan '$SERVICE_PLAN_NAME' in resource group '$RESOURCE_GROUP'.${NC}"
    PLAN_RESOURCE_GROUP="$RESOURCE_GROUP"
fi

# Create Function App using the existing App Service Plan
echo -e "${YELLOW}Creating Function App with existing App Service Plan...${NC}"
az functionapp create \
    --resource-group "$RESOURCE_GROUP" \
    --name "$FUNCTION_APP_NAME" \
    --storage-account "$STORAGE_ACCOUNT_NAME" \
    --plan "$SERVICE_PLAN_NAME" \
    --runtime node \
    --os-type Linux || {
    
    echo -e "${YELLOW}First attempt failed. Trying with different parameters...${NC}"
    az functionapp create \
        --resource-group "$RESOURCE_GROUP" \
        --name "$FUNCTION_APP_NAME" \
        --storage-account "$STORAGE_ACCOUNT_NAME" \
        --plan "$SERVICE_PLAN_NAME" \
        --runtime node \
        --functions-version 4 \
        --os-type Linux || {
        
        echo -e "${RED}Failed to create Function App.${NC}"
        echo -e "${RED}Please create the Function App manually in the Azure Portal.${NC}"
        exit 1
    }
}

# Wait for the Function App to be fully provisioned
echo -e "${YELLOW}Waiting for Function App to be fully provisioned...${NC}"
sleep 30

# Set environment variables for the Function App
echo -e "${YELLOW}Setting application settings...${NC}"
az functionapp config appsettings set \
    --resource-group "$RESOURCE_GROUP" \
    --name "$FUNCTION_APP_NAME" \
    --settings \
    SENDGRID_API_KEY="$SENDGRID_API_KEY" \
    EMAIL_FROM="$EMAIL_FROM" \
    EMAIL_FROM_NAME="$EMAIL_FROM_NAME" || {
    echo -e "${RED}Failed to set application settings.${NC}"
}

# Enable CORS
echo -e "${YELLOW}Enabling CORS...${NC}"
az functionapp cors add \
    --resource-group "$RESOURCE_GROUP" \
    --name "$FUNCTION_APP_NAME" \
    --allowed-origins "*" || {
    echo -e "${RED}Failed to configure CORS.${NC}"
}

# Save publishing profile to a file
echo -e "${YELLOW}Getting publishing profile...${NC}"
PROFILE_FILE="/tmp/azure-function-publish-profile.xml"
az functionapp deployment list-publishing-profiles \
    --resource-group "$RESOURCE_GROUP" \
    --name "$FUNCTION_APP_NAME" \
    --xml > "$PROFILE_FILE" 2>/dev/null || {
    echo -e "${RED}Failed to get publishing profile.${NC}"
}

echo -e "${GREEN}Azure Function infrastructure has been set up!${NC}"
echo -e "${YELLOW}Summary:${NC}"
echo -e "${GREEN}Resource Group:${NC} $RESOURCE_GROUP"
echo -e "${GREEN}Function App Name:${NC} $FUNCTION_APP_NAME"
echo -e "${GREEN}Storage Account:${NC} $STORAGE_ACCOUNT_NAME"
echo -e "${GREEN}App Service Plan:${NC} $SERVICE_PLAN_NAME (in $PLAN_RESOURCE_GROUP)"
echo -e "${GREEN}Location:${NC} $LOCATION"
echo -e "${GREEN}Publishing Profile:${NC} $PROFILE_FILE"

echo -e "${YELLOW}Next steps:${NC}"
echo -e "1. Deploy the function code using CI/CD or Azure Functions Core Tools"
echo -e "2. Test the function by sending a POST request to the function URL"
echo -e "3. Update your main application to use the function URL for emails"
echo -e ""
echo -e "${YELLOW}For GitHub Actions, add this secret:${NC}"
echo -e "${GREEN}Name:${NC} AZURE_FUNCTION_PUBLISH_PROFILE"
echo -e "${GREEN}Value:${NC} [Content of $PROFILE_FILE]"
echo -e ""
echo -e "${YELLOW}To get your function URL after deployment:${NC}"
echo -e "az functionapp function show --resource-group \"$RESOURCE_GROUP\" --name \"$FUNCTION_APP_NAME\" --function-name \"SendGridEmailFunction\" --query \"invokeUrlTemplate\" --output tsv"

exit 0 