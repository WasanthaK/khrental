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
3. Create a `.env` file based on `.env.example`:
   ```
   VITE_SUPABASE_URL=your_supabase_url
   VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
   VITE_EVIA_SIGN_CLIENT_ID=your_evia_client_id
   VITE_EVIA_SIGN_CLIENT_SECRET=your_evia_client_secret
   VITE_API_ENDPOINT=your_api_endpoint
   VITE_WEBHOOK_URL=your_webhook_url
   ```

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
