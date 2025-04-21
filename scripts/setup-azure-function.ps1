# PowerShell script to set up Azure Function for email sending

# Configuration variables - CHANGE THESE
$ResourceGroup = "ThreeCreeks"
$Location = "eastasia"
$FunctionAppName = "kh-email-function"
# Make storage account name unique with a timestamp suffix
$StorageAccountName = "khemailstorage" + (Get-Date -Format "MMddHHmm")
$ServicePlanName = "kh-email-function-plan"
$SendgridApiKey = "your-sendgrid-api-key-here"  # ⚠️ Enter your key ONLY during script execution, don't save it here
$EmailFrom = "noreply@yourdomain.com"  # Change to your email
$EmailFromName = "KH Rentals"

Write-Host "Starting Azure Function setup..." -ForegroundColor Yellow

# Check for Azure PowerShell module
if (!(Get-Module -ListAvailable Az)) {
    Write-Host "Azure PowerShell module is not installed. Please install it first." -ForegroundColor Red
    Write-Host "Run: Install-Module -Name Az -AllowClobber -Scope CurrentUser" -ForegroundColor Red
    exit
}

# Login to Azure
Write-Host "Logging in to Azure..." -ForegroundColor Yellow
try {
    Connect-AzAccount
} catch {
    Write-Host "Failed to connect to Azure: $_" -ForegroundColor Red
    exit
}

# Verify storage account name is available
Write-Host "Checking if storage account name is available..." -ForegroundColor Yellow
$storageNameAvailable = Get-AzStorageAccountNameAvailability -Name $StorageAccountName
if (-not $storageNameAvailable.NameAvailable) {
    Write-Host "Storage account name $StorageAccountName is already taken. Please use a different name." -ForegroundColor Red
    exit
}

# Create resource group if it doesn't exist
Write-Host "Creating resource group if it doesn't exist..." -ForegroundColor Yellow
try {
    New-AzResourceGroup -Name $ResourceGroup -Location $Location -Force
} catch {
    Write-Host "Failed to create resource group: $_" -ForegroundColor Red
    exit
}

# Create storage account for the function
Write-Host "Creating storage account..." -ForegroundColor Yellow
try {
    New-AzStorageAccount -ResourceGroupName $ResourceGroup `
        -Name $StorageAccountName `
        -Location $Location `
        -SkuName Standard_LRS
} catch {
    Write-Host "Failed to create storage account: $_" -ForegroundColor Red
    exit
}

# We'll use Azure CLI for some operations that are easier with CLI
# Check if Azure CLI is installed
$azCommand = Get-Command az -ErrorAction SilentlyContinue
if (!$azCommand) {
    Write-Host "Azure CLI is not installed. Please install it for full script functionality." -ForegroundColor Red
    Write-Host "Visit: https://docs.microsoft.com/en-us/cli/azure/install-azure-cli" -ForegroundColor Red
    exit
}

# Create App Service plan (Consumption)
Write-Host "Creating consumption plan..." -ForegroundColor Yellow
try {
    # Correct SKU format for Azure Functions consumption plan
    az functionapp plan create `
        --resource-group $ResourceGroup `
        --name $ServicePlanName `
        --location $Location `
        --sku Y1
} catch {
    Write-Host "Failed to create App Service plan: $_" -ForegroundColor Red
    exit
}

# Create Function App
Write-Host "Creating Function App..." -ForegroundColor Yellow
try {
    # Use preferred Node.js version (18 is now recommended)
    az functionapp create `
        --resource-group $ResourceGroup `
        --name $FunctionAppName `
        --storage-account $StorageAccountName `
        --plan $ServicePlanName `
        --runtime node `
        --runtime-version 18 `
        --functions-version 4
} catch {
    Write-Host "Failed to create Function App: $_" -ForegroundColor Red
    exit
}

# Wait for Function App to be ready
Write-Host "Waiting for Function App to be fully provisioned..." -ForegroundColor Yellow
Start-Sleep -Seconds 30

# Set environment variables for the Function App
Write-Host "Setting application settings..." -ForegroundColor Yellow
try {
    # Verify key is not the placeholder
    if ($SendgridApiKey -eq "your-sendgrid-api-key-here") {
        $SendgridApiKey = Read-Host -Prompt "Enter your SendGrid API key" -AsSecureString
        $BSTR = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($SendgridApiKey)
        $SendgridApiKey = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($BSTR)
    }
    
    az functionapp config appsettings set `
        --resource-group $ResourceGroup `
        --name $FunctionAppName `
        --settings `
        SENDGRID_API_KEY="$SendgridApiKey" `
        EMAIL_FROM="$EmailFrom" `
        EMAIL_FROM_NAME="$EmailFromName"
} catch {
    Write-Host "Failed to set application settings: $_" -ForegroundColor Red
}

# Enable CORS
Write-Host "Enabling CORS..." -ForegroundColor Yellow
try {
    az functionapp cors add `
        --resource-group $ResourceGroup `
        --name $FunctionAppName `
        --allowed-origins "*"
} catch {
    Write-Host "Failed to configure CORS: $_" -ForegroundColor Red
}

# Get the publish profile for GitHub Actions
Write-Host "Getting publishing profile..." -ForegroundColor Yellow
try {
    $PublishProfile = az functionapp deployment list-publishing-profiles `
        --resource-group $ResourceGroup `
        --name $FunctionAppName `
        --xml
    
    # Save to a file for easy copying
    $profilePath = Join-Path $env:TEMP "azure-function-publish-profile.xml"
    $PublishProfile | Out-File -FilePath $profilePath
    
    Write-Host "Publishing profile saved to: $profilePath" -ForegroundColor Green
} catch {
    Write-Host "Failed to get publishing profile: $_" -ForegroundColor Red
}

Write-Host "Azure Function infrastructure has been set up!" -ForegroundColor Green
Write-Host "Summary:" -ForegroundColor Yellow
Write-Host "- Resource Group: $ResourceGroup" -ForegroundColor Cyan
Write-Host "- Function App Name: $FunctionAppName" -ForegroundColor Cyan
Write-Host "- Storage Account: $StorageAccountName" -ForegroundColor Cyan
Write-Host "- Location: $Location" -ForegroundColor Cyan

Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1. Deploy the function code using CI/CD or Azure Functions Core Tools"
Write-Host "2. Test the function by sending a POST request to the function URL"
Write-Host "3. Update your main application to use the function URL for emails"
Write-Host ""
Write-Host "For GitHub Actions, add this secret:" -ForegroundColor Yellow
Write-Host "Name: AZURE_FUNCTION_PUBLISH_PROFILE" -ForegroundColor Cyan
Write-Host "Value: [Content of the publishing profile XML saved to $profilePath]" -ForegroundColor Cyan

Write-Host "To get your function URL after deployment:" -ForegroundColor Yellow
Write-Host "az functionapp function show --resource-group $ResourceGroup --name $FunctionAppName --function-name SendGridEmailFunction --query invokeUrlTemplate --output tsv" 