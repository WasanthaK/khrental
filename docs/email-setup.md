# Email Configuration for KH Rentals

This document explains how to properly set up email sending for KH Rentals using SendGrid and Supabase Edge Functions.

## Why Use Supabase Edge Functions for Emails?

When sending emails from a web application, you should never call external APIs like SendGrid directly from the frontend because:

1. It would expose your API keys to the client-side code (a security risk)
2. Many API providers (including SendGrid) block browser-based calls due to CORS restrictions

Instead, we use Supabase Edge Functions to create a secure, serverless endpoint that our frontend can call, which then makes the API calls to SendGrid with proper authentication.

## Setup Instructions

### 1. Set Up a SendGrid Account

1. Sign up for a SendGrid account at [sendgrid.com](https://sendgrid.com/)
2. Create an API key with "Mail Send" permissions
3. Verify your sender domain and email addresses

### 2. Configure Supabase CLI

Make sure you have the Supabase CLI installed and logged in:

```bash
# Install Supabase CLI
npm install -g supabase

# Login to Supabase
supabase login
```

### 3. Set Environment Variables in Supabase

```bash
# Set SendGrid API key
supabase secrets set SENDGRID_API_KEY=your_sendgrid_api_key

# Set default from email and name (optional)
supabase secrets set EMAIL_FROM=noreply@khrentals.com
supabase secrets set EMAIL_FROM_NAME="KH Rentals"
```

### 4. Deploy the Edge Function

```bash
# Deploy SendGrid email function
npm run deploy:functions
```

### 5. Update Environment Variables in Your Frontend

Ensure your frontend has the Supabase URL set correctly:

```
VITE_SUPABASE_URL=https://your-project-id.supabase.co
```

## Testing the Integration

After deploying, you can test whether the function works by:

1. Accessing the Admin Dashboard
2. Inviting a new user (ensure "Simulate Email" is NOT checked)
3. Check that the email is sent successfully

## Troubleshooting

### Common Errors

#### CORS Errors
- If you see CORS errors in the console, check that the Edge Function is properly deployed and has appropriate CORS headers.

#### "User ID not configured"
- If you see "EmailJS User ID not configured", this means the system is falling back to EmailJS but it's not properly configured. This should not happen if SendGrid is working correctly.

#### SendGrid API Errors
- If you see errors from the SendGrid API, check the error message and ensure your API key has proper permissions.

### Checking Logs

You can check the logs of your Edge Function with:

```bash
supabase functions logs sendgrid-email
```

## Reverting to Development Mode

During local development, you can enable email simulation by setting the `simulated` parameter to `true` when calling `sendDirectEmail`. 