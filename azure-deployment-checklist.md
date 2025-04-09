# Azure Deployment Checklist

Use this checklist to ensure you've configured everything correctly for your Azure deployment.

## GitHub Repository Setup

- [ ] Repository created on GitHub (`yourusername/khrental`)
- [ ] Code pushed to GitHub repository
- [ ] Proper `.gitignore` file configured
- [ ] GitHub Actions workflows added:
  - [ ] `.github/workflows/main-app-deploy.yml`
  - [ ] `.github/workflows/webhook-deploy.yml`

## GitHub Secrets Configuration

- [ ] `VITE_SUPABASE_URL` added
- [ ] `VITE_SUPABASE_ANON_KEY` added
- [ ] `SUPABASE_SERVICE_KEY` added
- [ ] `VITE_EVIA_WEBHOOK_URL` added
- [ ] `AZURE_STATIC_WEB_APPS_API_TOKEN` added
- [ ] `WEBHOOK_PUBLISH_PROFILE` added

## Azure Static Web App (Main Application)

- [ ] Create new Static Web App in Azure Portal
- [ ] Choose GitHub as source code location
- [ ] Select your organization, repository, and branch (main)
- [ ] Configure build details:
  - [ ] Build Preset: `Vite`
  - [ ] App location: `/`
  - [ ] API location: `api`
  - [ ] Output location: `dist`
- [ ] Save and wait for initial deployment
- [ ] Copy deployment token to GitHub Secrets as `AZURE_STATIC_WEB_APPS_API_TOKEN`
- [ ] Check deployment status in GitHub Actions

## Azure App Service (Webhook Server)

- [ ] Create new App Service in Azure Portal
- [ ] Choose Node.js 22 as runtime stack
- [ ] Choose Linux as operating system
- [ ] Choose appropriate region (same as Static Web App)
- [ ] Create or select App Service Plan
- [ ] Configure deployment settings:
  - [ ] Deployment Center > GitHub
  - [ ] Choose your organization and repository
  - [ ] Choose branch (main)
- [ ] Configure application settings:
  - [ ] `PORT`: 8080
  - [ ] `SUPABASE_URL`: Your Supabase URL
  - [ ] `SUPABASE_SERVICE_KEY`: Your Supabase service key
  - [ ] `EVIA_SIGN_WEBHOOK_URL`: Your webhook endpoint
- [ ] Configure startup command:
  - [ ] `cd webhook-server && node server.js`
- [ ] Download publish profile
- [ ] Add publish profile to GitHub Secrets as `WEBHOOK_PUBLISH_PROFILE`
- [ ] Check deployment status in GitHub Actions

## Evia Sign Configuration

- [ ] Update Evia Sign webhook URL to point to Azure App Service
  - [ ] `https://your-app-name.azurewebsites.net/webhook/evia-sign`
- [ ] Test webhook connection from Evia Sign dashboard

## Testing After Deployment

### Main Application
- [ ] Visit your Static Web App URL
- [ ] Test login functionality
- [ ] Test creating new agreements
- [ ] Test viewing invoices
- [ ] Test all other critical features

### Webhook Server
- [ ] Visit `https://your-app-name.azurewebsites.net/status`
- [ ] Create a test agreement and sign it
- [ ] Verify webhook events are processed correctly
- [ ] Check Supabase for updated agreement records

## Troubleshooting

If you encounter issues:

1. Check application logs in Azure Portal
2. Check GitHub Actions workflow runs
3. Verify environment variables in Azure App Service
4. Test webhook server locally before deployment
5. Check Supabase logs for database errors

## Post-Deployment Tasks

- [ ] Configure custom domain (if needed)
- [ ] Set up Azure Monitor alerts
- [ ] Configure SSL certificates
- [ ] Set up backup schedule for Supabase database
- [ ] Document APIs and endpoints
- [ ] Configure rate limiting and security features 