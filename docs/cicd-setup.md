# CI/CD Pipeline Setup for KH Rentals

This guide explains how to set up continuous integration and deployment for both the main KH Rentals application and the Azure Function for email sending.

## Prerequisites

- GitHub repository for your code
- Azure account with:
  - App Service for the main application
  - Azure Function App for the email service
- Access to create GitHub Actions secrets

## Setting Up Azure Function Deployment

### 1. Create the Azure Function App

If you haven't already created the Function App:

1. Go to the Azure Portal
2. Create a new Function App:
   - Runtime stack: Node.js
   - Hosting plan: Consumption (Serverless) or App Service Plan
   - Region: Choose the same region as your main app

### 2. Get the Publish Profile

1. In the Azure Portal, navigate to your Function App
2. Go to "Overview" > "Get publish profile"
3. Download the publish profile XML file

### 3. Add Publish Profile to GitHub Secrets

1. In your GitHub repository, go to "Settings" > "Secrets and variables" > "Actions"
2. Click "New repository secret"
3. Name: `AZURE_FUNCTION_PUBLISH_PROFILE`
4. Value: Paste the entire content of the publish profile XML file
5. Click "Add secret"

### 4. Configure Environment Variables

In the Azure Function App:

1. Go to "Configuration" > "Application Settings"
2. Add the following settings:
   - `SENDGRID_API_KEY`: Your SendGrid API key
   - `EMAIL_FROM`: Default sender email (optional)
   - `EMAIL_FROM_NAME`: Default sender name (optional)

## Setting Up Main Application Deployment

### 1. Add Azure Web App Publish Profile

1. In the Azure Portal, navigate to your App Service
2. Go to "Overview" > "Get publish profile"
3. Download the publish profile XML file
4. Add it as a GitHub secret named `AZURE_WEBAPP_PUBLISH_PROFILE`

### 2. Update Environment Variables

Make sure your App Service has the proper environment variables:

1. Go to "Configuration" > "Application Settings"
2. Add or update:
   - `VITE_APP_BASE_URL`: Your application URL
   - `VITE_EMAIL_FUNCTION_URL`: URL of your email function
   - `VITE_EMAIL_FUNCTION_KEY`: Function key (if using function-level auth)
   - `VITE_EMAIL_FROM`: Default sender email
   - `VITE_EMAIL_FROM_NAME`: Default sender name

## GitHub Actions Workflows

### Azure Function Workflow

This workflow deploys the SendGrid Email Function whenever changes are made to the function code.

File: `.github/workflows/azure-function-deploy.yml`

```yaml
name: Deploy Email Function

on:
  push:
    branches: [ master, main ]
    paths:
      - 'azure-functions/SendGridEmailFunction/**'
      - '.github/workflows/azure-function-deploy.yml'
  workflow_dispatch:  # Allows manual triggering

env:
  AZURE_FUNCTION_APP_NAME: kh-email-function  # Replace with your Function App name
  AZURE_FUNCTION_PATH: './azure-functions/SendGridEmailFunction'
  NODE_VERSION: '16.x'  # Adjust based on your preferred Node.js version

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    steps:
    - name: Checkout code
      uses: actions/checkout@v3

    - name: Setup Node.js ${{ env.NODE_VERSION }}
      uses: actions/setup-node@v3
      with:
        node-version: ${{ env.NODE_VERSION }}
        
    - name: Install dependencies
      run: |
        cd ${{ env.AZURE_FUNCTION_PATH }}
        npm ci

    - name: 'Deploy to Azure Function App'
      uses: Azure/functions-action@v1
      with:
        app-name: ${{ env.AZURE_FUNCTION_APP_NAME }}
        package: ${{ env.AZURE_FUNCTION_PATH }}
        publish-profile: ${{ secrets.AZURE_FUNCTION_PUBLISH_PROFILE }}
```

### Main Application Workflow

If you don't already have a workflow for your main application, create one:

File: `.github/workflows/azure-webapp-deploy.yml`

```yaml
name: Deploy Web App

on:
  push:
    branches: [ master, main ]
    paths-ignore:
      - 'azure-functions/**'
      - '**.md'
  workflow_dispatch:

env:
  NODE_VERSION: '16.x'
  AZURE_WEBAPP_NAME: kh-rentals  # Replace with your App Service name
  AZURE_WEBAPP_PACKAGE_PATH: './dist'  # Path to build output

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v3

    - name: Set up Node.js
      uses: actions/setup-node@v3
      with:
        node-version: ${{ env.NODE_VERSION }}
        cache: 'npm'

    - name: Install dependencies
      run: npm ci

    - name: Build
      run: npm run build

    - name: Deploy to Azure Web App
      uses: azure/webapps-deploy@v2
      with:
        app-name: ${{ env.AZURE_WEBAPP_NAME }}
        publish-profile: ${{ secrets.AZURE_WEBAPP_PUBLISH_PROFILE }}
        package: ${{ env.AZURE_WEBAPP_PACKAGE_PATH }}
```

## Testing the CI/CD Pipeline

To test your CI/CD pipeline:

1. Push a change to your repository
2. Go to "Actions" tab in GitHub to monitor the workflow progress
3. Once deployed, verify:
   - The main application is working
   - The email function is deployed and accessible
   - Invitations can be sent from the production environment

## Troubleshooting

If your deployment fails:

1. Check the GitHub Actions logs for errors
2. Verify all secrets are properly set up
3. Ensure your Azure resources have the correct permissions
4. Test the Azure Function locally before deployment

For Azure Function specific issues:

1. Check the Function App logs in Azure Portal
2. Verify environment variables are properly set
3. Test the endpoint directly with a tool like Postman

## Additional Configuration

### Using Azure Service Principal Instead of Publish Profile

For more secure automation, you can use a service principal:

1. Create a service principal with contributor access to your resource group
2. Add the following GitHub secret:
   - Name: `AZURE_CREDENTIALS`
   - Value: The JSON output from the service principal creation

3. Update your workflows to use the service principal:
```yaml
- name: 'Azure Login'
  uses: azure/login@v1
  with:
    creds: ${{ secrets.AZURE_CREDENTIALS }}

# Then use azure/webapps-deploy or Azure/functions-action without publish-profile
``` 