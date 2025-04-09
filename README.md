# KH Rentals Webhook Server

A dedicated webhook server for handling digital signature events and agreement state management for KH Rentals.

## Features

- Digital signature webhook handling
- Agreement state management
- Supabase integration
- Azure deployment ready

## Setup

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create a `.env` file with the following variables:
   ```
   PORT=3000
   SUPABASE_URL=your_supabase_url
   SUPABASE_SERVICE_KEY=your_supabase_service_key
   EVIA_SIGN_WEBHOOK_URL=your_webhook_url
   ```

## Development

Start the development server:
```bash
npm start
```

## Deployment

The server is configured for deployment to Azure Web App. The deployment is automated through GitHub Actions.

## API Documentation

### Webhook Endpoints

- `POST /webhook/signature` - Handles digital signature events
- `GET /health` - Health check endpoint

## License

MIT
