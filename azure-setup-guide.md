# Azure Web App Deployment Guide for KH Rentals

This guide provides step-by-step instructions for setting up and configuring your Azure Web App deployment for the KH Rentals application.

## 1. Creating the Azure Web App

1. Log in to the [Azure Portal](https://portal.azure.com)
2. Click **Create a resource**
3. Search for **Web App** and select it
4. Fill in the following details:
   - **Subscription**: Your Azure subscription
   - **Resource Group**: Create new or select existing
   - **Name**: `khrental` (this will be your website URL: khrentals.kubeira.com)
   - **Runtime stack**: Node 22 LTS
   - **Operating System**: Linux
   - **Region**: Select the region closest to your users
   - **App Service Plan**: Create new or select existing
   - **Sku and size**: Standard S1 (you can change based on your needs)

5. Click **Review + create** and then **Create**

## 2. Configuring GitHub Actions Deployment

### Setting up GitHub Repository Secrets

1. In your GitHub repository, go to **Settings > Secrets and variables > Actions**
2. Add the following secrets:
   - `VITE_SUPABASE_URL`: Your Supabase project URL
   - `VITE_SUPABASE_ANON_KEY`: Your Supabase anon key
   - `VITE_EVIA_WEBHOOK_URL`: https://khrentals.kubeira.com/webhook/evia-sign
   - `AZURE_WEBAPP_PUBLISH_PROFILE`: The publish profile from Azure (see next section)

### Getting the Publish Profile from Azure

1. Go to your Azure Web App (khrental)
2. In the left menu, find **Get publish profile** and click it
3. This will download a file - open it in a text editor
4. Copy the entire content of the file
5. Paste this content as the value for the `AZURE_WEBAPP_PUBLISH_PROFILE` secret in GitHub

## 3. Configuring Web App Settings

### Setting Up Application Settings (Environment Variables)

1. In your Azure Web App, go to **Settings > Configuration**
2. Under **Application settings**, add the following:
   - `VITE_SUPABASE_URL`: Your Supabase project URL
   - `VITE_SUPABASE_ANON_KEY`: Your Supabase anon key
   - `VITE_EVIA_WEBHOOK_URL`: https://khrentals.kubeira.com/webhook/evia-sign
   - `WEBSITE_NODE_DEFAULT_VERSION`: 22.0.0

3. Click **Save** to apply these settings

### Configuring Deployment Settings

1. Go to **Deployment Center** in your Web App
2. Choose **GitHub** as the source
3. Authenticate with GitHub and select your repository and branch (main)
4. Choose **GitHub Actions** as the build provider
5. Your workflow will use the `.github/workflows/main-app-deploy.yml` file

## 4. Setting Up Client-Side Routing

1. Make sure the `web.config` file is in the root of your repository
2. This file contains the URL rewrite rules necessary for React Router to work correctly

## 5. Testing the Deployment

1. Push a change to your GitHub repository
2. Go to your GitHub repository's **Actions** tab to see the workflow run
3. Once the workflow completes, visit khrentals.kubeira.com to verify your app is working
4. Test the key features of your application, including:
   - Login functionality
   - Routing (navigate to different pages)
   - API integration
   - Evia Sign integration

## 6. Monitoring and Troubleshooting

### Setting Up Monitoring

1. In your Azure Web App, go to **Monitoring**
2. Enable **Application Insights** for detailed performance monitoring
3. Set up alerts for key metrics like response time and failure rate

### Viewing Logs

1. Go to **Monitoring > Log Stream** to view real-time logs
2. Check **Deployment Center > Logs** to see deployment-specific logs
3. Use **Advanced Tools (Kudu)** for more detailed diagnostics:
   - Go to **Advanced Tools** and click **Go**
   - Navigate to **Debug console > PowerShell**
   - Browse to site/wwwroot to see your deployed files

## 7. Scaling Your Web App

As your user base grows, you may need to scale your web app:

1. Go to **Scale up (App Service plan)** to increase the capabilities of your app
2. Go to **Scale out** to add more instances for higher traffic

## 8. Custom Domain and SSL

To set up a custom domain:

1. Go to **Custom domains** in your Web App
2. Click **Add custom domain** and follow the instructions
3. Add an SSL certificate for secure HTTPS access

## Additional Resources

- [Azure Web Apps Documentation](https://docs.microsoft.com/en-us/azure/app-service/)
- [GitHub Actions for Azure](https://docs.microsoft.com/en-us/azure/developer/github/github-actions)
- [Troubleshooting Web Apps](https://docs.microsoft.com/en-us/azure/app-service/troubleshoot-common-problems) 