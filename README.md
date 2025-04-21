# KH Rentals Management System

A comprehensive property management application for KH Rentals with digital signature integration, property management, and tenant portal features.

## Features

- Property management and tracking
- Digital signature integration with Evia Sign
- Agreement management and templating
- Tenant (rentee) portal for self-service
- Utility billing and tracking
- Maintenance request management
- Staff dashboard with role-based access controls
- Supabase backend integration

## Setup for Development

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Set up your environment variables by running:
   ```bash
   npm run setup-env
   ```
   This will guide you through setting up your Supabase URL and key.

   Alternatively, manually create a `.env` file based on this template:
   ```
   VITE_SUPABASE_URL=your_supabase_url
   VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
   VITE_EVIA_SIGN_CLIENT_ID=your_evia_client_id
   VITE_EVIA_SIGN_CLIENT_SECRET=your_evia_client_secret
   VITE_API_ENDPOINT=your_api_endpoint
   VITE_WEBHOOK_URL=your_webhook_url
   ```

4. Start the development server:
   ```bash
   npm run dev
   ```

## Environment Variables

The application uses the following strategy to load environment variables:

1. First attempts to read from `window._env_` (for production)
2. Falls back to Vite's `import.meta.env` 
3. Finally checks `process.env` (for Node.js environment)

The `npm run generate-env-config` script automatically generates the `public/env-config.js` file from your `.env` file. This script is run automatically when you start the development server or build the application.

## Security and Environment Configuration

### Important Security Notes

1. **Never commit real API keys or sensitive tokens to the repository.**
2. The `public/env-config.js` file is listed in `.gitignore` and should never be committed.
3. Use `public/env-config.example.js` as a template to create your own `public/env-config.js` file.
4. In production, environment variables should be set in your hosting environment (e.g., Azure App Settings).

### Setting Up Local Environment

1. Copy `public/env-config.example.js` to `public/env-config.js`
2. Add your local development values
3. For development with the email system:
   - Set up the Azure Function locally or use the test environment
   - Use the diagnostic tool at `/diagnostics/email` to verify your setup

### API Keys in Version Control

If you receive a "SendGrid API key found in commit" error when trying to commit, check for:
1. API keys in `public/env-config.js` (this file should not be committed)
2. Hard-coded keys in any JavaScript files
3. Keys in sample or example files

## Development

Start the development server:
```bash
npm run dev
```

## Production Build

Build for production:
```bash
npm run build
```

## Deployment

The application is configured for deployment to Azure Web App using GitHub Actions. The deployment workflow is defined in `.github/workflows/master_khrental.yml`.

### Environment Variables for Production

Ensure the following environment variables are set in your Azure Web App:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_EVIA_SIGN_CLIENT_ID`
- `VITE_EVIA_SIGN_CLIENT_SECRET`
- `VITE_API_ENDPOINT`
- `VITE_WEBHOOK_URL`

### Deployment Checklist

1. All environment variables are correctly set in Azure
2. GitHub Actions workflow is properly configured
3. Deployment artifacts are properly generated
4. Client-side routing is properly configured in web.config

## Recent Updates

### Fix for Agreement Loading Errors (2024-04-10)

- Fixed 400 Bad Request errors when loading agreements
- Removed references to a non-existent `processedcontent` database column
- Added better error handling to display load failures
- Note: To properly support template content processing, add a `processedcontent` column to your Supabase `agreements` table

### URL Encoding Fix for HTML Content (2024-04-10)

- Added URL encoding for path parameters that contain HTML content
- Fixes "431 Request Header Fields Too Large" errors when navigating with large HTML content
- Prevents infinite loops when attempting to navigate to URLs with embedded agreement content

### URL Handling Fix (2024-04-10)

- Fixed URL handling in env-config.js to properly process relative paths starting with "/"
- This resolves console loop errors when navigating to routes like "/dashboard"
- Implementation: SafeURL constructor now handles all relative paths by prepending window.location.origin

## Troubleshooting

### Common Issues

1. **Console Loop Errors with URLs**:
   - Check if env-config.js has the latest URL handling fixes
   - Ensure all relative URLs have proper protocols added

2. **Authentication Issues**:
   - Verify Supabase URL and anon key are correctly set
   - Check user permissions in Supabase dashboard

3. **Deployment Failures**:
   - Verify GitHub Actions workflow file is up to date
   - Check Azure configuration in the Azure Portal

## License

MIT
