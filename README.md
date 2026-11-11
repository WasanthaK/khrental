# KH Rentals Management System

## Current project documentation — 11 November 2026

Quixo Homes uses [quixo.homes](https://quixo.homes) for discovery and [app.quixo.homes](https://app.quixo.homes) for rental management. R5 remains active/incomplete; Sri Lanka readiness precedes Brunei. Signing is accepted. Full enforcement and live charging remain OFF.

Latest verified application release: [manual release #1538](https://github.com/WasanthaK/khrental/actions/runs/43045282585) passed at Ready revision **0000487**, serving `673f975394cdbfe85e3ca27f94a78e0c92ffb0f2`. The release reran strict lint with zero errors/warnings, **1,178/1,178 tests** and the production build. Independent public build readback matched at **15:15:36 UTC** on 11 November; SQL health returned **HTTP 200 ready at 15:15:40 UTC**. See the [security disposition](docs/SECURITY-REVIEW-20261111.md#lint-and-review-follow-up-release--11-november-2026) and [canonical current status](docs/EXECUTION-PLAN.md#canonical-current-status--11-november-2026) for evidence, remaining work and milestone boundaries. Strict lint is enforced in CI; rollout and live charging remain OFF.

- [Canonical execution plan](docs/EXECUTION-PLAN.md): milestone dispositions and next work.
- [R4/R5 delivery programme](docs/R4-R5-DELIVERY.md): delivery scope and dependencies.
- [R5 task and acceptance ledger](docs/R5-LIFECYCLE-ACCEPTANCE-20261105.md): exact implementation, CI, release and remaining evidence.
- [Inventory/cessation release](docs/R5-INVENTORY-CESSATION-RELEASE-20261110.md): historical 0000483 implementation checkpoint and pending production migrations; current runtime is above.
- [Billing contract](docs/QUIXO-HOMES-STRIPE-SAAS-BILLING.md) and [commercial readiness](docs/QUIXO-STRIPE-B02-B03-READINESS.md): approved behavior versus held decisions.
- [Migration authority](docs/PRODUCTION-MIGRATION-EXECUTOR.md), [infrastructure handover](docs/INFRASTRUCTURE-HANDOVER.md) and [Evia audit recovery](docs/EVIA-AUDIT-RECOVERY.md): operational runbooks and limitations.

Dated material below is supporting technical/history documentation; current acceptance is controlled by the linked plan and ledger. Public documentation uses role/scoped-record placeholders in place of personal emails and operational record/provider identifiers. Resolve actual values only through authorized configuration and sessions; never paste credentials into documentation.

A comprehensive property management application for KH Rentals with digital signature integration, property management, and tenant portal features.

## Features

- Property management and tracking
- Digital signature integration with Evia Sign
- Agreement management and templating
- Tenant (rentee) portal for self-service
- Utility billing and tracking
- Maintenance request management
- Staff dashboard with role-based access controls
- SQL Server backend integration

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
   This will guide you through setting up your API endpoint and local environment.

   Alternatively, manually create a `.env` file based on this template:
   ```
   EVIA_SIGN_CLIENT_ID=your_server_evia_client_id
   EVIA_SIGN_CLIENT_SECRET=your_server_evia_client_secret
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
   - Use the test environment
   - Configure environment variables in your `.env` file

### API Keys in Version Control

If you receive a "SendGrid API key found in commit" error when trying to commit, check for:
1. API keys in `public/env-config.js` (this file should not be committed)
2. Hard-coded keys in any JavaScript files
3. Keys in sample or example files

For email delivery, keep `TWILIO_SENDGRID_API_KEY` or `SENDGRID_API_KEY` on the server only. Do not expose them through any `VITE_` variable.

## Security regression checks

Run `npm run test:security` for the priority security fixes and `npm test` (or `npm run test:authorization`) for the automatically discovered full gate. See the [security review disposition](docs/SECURITY-REVIEW-20261111.md) for exact proof, secondary fixes and remaining dependencies. Browser/SQL CI remains required; local Chrome absence is not a pass. Never place an Evia token or secret in `VITE_` settings; the build rejects those settings. Optional platform bootstrap is server-configured, OFF by default and requires independent verified email evidence.

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

The application deploys an immutable container to Azure Container Apps through `.github/workflows/deploy-container-apps.yml`. Production verification requires the exact serving source, Ready revision and live SQL health. Marketing hosting and schema application are separate; see the linked runbooks.

### Environment Variables for Production

Use `.env.example` and the existing hosting secret configuration. Keep `EVIA_SIGN_CLIENT_SECRET`, `EVIA_SIGN_API_KEY`, Stripe keys and email credentials server-side; never put secrets in `VITE_` variables or browser runtime configuration. Only public API URLs and approved nonsecret client settings belong in the browser.

### Deployment Checklist

1. All environment variables are correctly set in Azure
2. GitHub Actions workflow is properly configured
3. Deployment artifacts are properly generated
4. Container startup, SPA routing, exact build readback and live SQL health pass

## Recent Updates

### Fix for Agreement Loading Errors (2024-04-10)

- Fixed 400 Bad Request errors when loading agreements
- Removed references to a non-existent `processedcontent` database column
- Added better error handling to display load failures
- Note: To properly support template content processing, add a `processedcontent` column to your application `agreements` table if it is still missing

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
   - Verify the API endpoint is correctly set
   - Check user permissions in the application database and auth records

3. **Deployment Failures**:
   - Verify GitHub Actions workflow file is up to date
   - Check Azure configuration in the Azure Portal

## License

MIT

## Free-cloud production deployment

For the stateless Azure Container Apps + Azure SQL + Cloudflare R2 architecture, including GitHub OIDC deployment and migration steps, see [Free-cloud deployment](docs/free-cloud-deployment.md).

Production deployment now requires an explicit main-branch workflow dispatch after verification; pushes run checks only. Follow [CI and production release](docs/cicd-setup.md). Production credential throttling uses the existing shared SQL ledger and a server-only 32-byte-or-longer `AUTH_THROTTLE_SECRET` (or existing `PUBLIC_SIGNUP_THROTTLE_SECRET`), failing closed if unavailable. `npm run lint` passes with one flat config and zero allowed warnings; it is a required CI and deployment verification step.
