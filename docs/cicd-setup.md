# CI/CD Setup Guide

This guide explains how to set up continuous integration and deployment for the KH Rentals application.

## Prerequisites

- GitHub repository for your code
- Web hosting environment (Azure App Service, Netlify, Vercel, etc.)
- Supabase account and project

## Setting Up Main Application Deployment

### 1. Configure Environment Variables

In your hosting platform:

1. Add all required environment variables:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_SENDGRID_API_KEY` (if using SendGrid)
   - `VITE_EMAIL_FROM`
   - `VITE_EMAIL_FROM_NAME`
   - `VITE_APP_BASE_URL`
   - Any other custom env variables your application uses

2. If using Azure:
   - Go to App Service → Configuration → Application Settings
   - Add each variable and click "Save" (which will restart the app)

### 2. Set Up GitHub Actions Workflow

1. Create a `.github/workflows/deploy.yml` file:

```yaml
name: Deploy Application

on:
  push:
    branches: [ main, master ]
  workflow_dispatch:

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Set up Node.js
      uses: actions/setup-node@v3
      with:
        node-version: '18'
        cache: 'npm'
        
    - name: Install dependencies
      run: npm ci
      
    - name: Build
      run: npm run build
      env:
        VITE_SUPABASE_URL: ${{ secrets.VITE_SUPABASE_URL }}
        VITE_SUPABASE_ANON_KEY: ${{ secrets.VITE_SUPABASE_ANON_KEY }}
        # Add other build-time env variables here
        
    - name: Deploy to hosting
      uses: azure/webapps-deploy@v2  # Example for Azure
      with:
        app-name: 'your-app-name'
        publish-profile: ${{ secrets.AZURE_PUBLISH_PROFILE }}
        package: './dist'  # Your build output folder
```

### 3. Add GitHub Secrets

1. Go to your GitHub repository
2. Navigate to Settings → Secrets → Actions
3. Add the following secrets:
   - `VITE_SUPABASE_URL`: Your Supabase project URL
   - `VITE_SUPABASE_ANON_KEY`: Your Supabase anon key
   - `AZURE_PUBLISH_PROFILE`: Your Azure publish profile (if using Azure)
   - Any other secrets needed for deployment

## Troubleshooting

If you encounter deployment issues:

1. Check GitHub Actions workflow logs for errors
2. Verify all environment variables are set correctly
3. Make sure builds complete successfully before deployment
4. Check the application logs on your hosting platform

## Manual Deployment

For manual deployment:

1. Build your application locally:
   ```
   npm run build
   ```

2. Upload the contents of the `dist` folder to your web server
3. Configure the server to serve your application correctly

## Additional Resources

- [GitHub Actions documentation](https://docs.github.com/actions)
- [Vite deployment guide](https://vitejs.dev/guide/static-deploy.html)
- [Supabase hosting options](https://supabase.com/docs/guides/hosting) 