# Setting Up Evia Sign Webhook Integration

This guide will help you set up the Evia Sign webhook integration for your KH Rentals application. The webhook enables real-time updates from Evia Sign when documents are viewed, signed, or completed.

## Prerequisites

- Node.js (v14 or higher)
- npm (v6 or higher)
- Access to your Supabase project dashboard
- Your Supabase URL and API keys

## Step 1: Prepare Your Database

First, we need to ensure the `webhook_events` table is properly set up with all required columns, including the `processed` column:

```bash
# Run the table setup script
node scripts/fix-webhook-table-sql.js
```

This script will:
1. Check if the `webhook_events` table exists, and create it if needed
2. Add the `processed` column if it's missing
3. Set up proper indexes and RLS policies

If the script indicates that you need to run SQL manually, follow the instructions it provides to execute the SQL in your Supabase dashboard.

## Step 2: Deploy the Webhook Function

You have two options for deploying the webhook function:

### Option A: Manual Deployment (Recommended)

This is the most reliable method:

1. Export the function code:
   ```bash
   node scripts/export-webhook-function.js
   ```

2. Follow the instructions in the console to:
   - Go to your Supabase dashboard
   - Create a new Edge Function named "evia-webhook"
   - Copy and paste the function code
   - Deploy the function

### Option B: Automated Deployment

This method attempts to deploy the function automatically (may not work in all environments):

```bash
# Run the deployment script (no CLI required)
node scripts/deploy-evia-webhook-without-cli.js
```

## Step 3: Update Your Evia Sign Configuration

After deployment, update your Evia Sign API integration to use the new webhook URL:

1. Log in to your Evia Sign admin dashboard
2. Go to API Settings or Webhook Configuration
3. Enter the webhook URL:
   ```
   https://your-project-ref.supabase.co/functions/v1/evia-webhook
   ```
4. Save your changes

## Step 4: Test the Integration

To test that everything is working:

1. Send a test webhook event:
   ```bash
   node scripts/test-webhook.js
   ```

2. Check the `webhook_events` table in your Supabase dashboard to confirm the event was recorded

3. Create a new agreement in your application and send it for signing via Evia Sign

4. Monitor the webhook events as the document moves through the signing process

## Troubleshooting

### The webhook_events table is missing columns

If you see errors about missing columns (like "column 'processed' does not exist"), run:

```bash
node scripts/fix-webhook-table-sql.js
```

### The webhook function is not receiving events

1. Verify your webhook URL is correctly configured in Evia Sign
2. Check your function logs in the Supabase dashboard
3. Test the webhook endpoint directly:
   ```bash
   curl -X POST https://your-project-ref.supabase.co/functions/v1/evia-webhook \
     -H "Content-Type: application/json" \
     -d '{"RequestId":"test-123","EventId":1,"EventDescription":"SignRequestReceived"}'
   ```

### Events are received but not processed

1. Check the webhook function logs for errors
2. Verify that your agreements have the correct `eviasignreference` value
3. Ensure your database has the correct table structure and permissions

### Deployment script fails

If you encounter issues with the automated deployment script, use the manual deployment method (Option A) which is more reliable across different environments.

## How It Works

1. When a document status changes in Evia Sign, they send an event to your webhook URL
2. The webhook function stores the event in the `webhook_events` table
3. The function then processes the event to update the corresponding agreement status
4. The event is marked as processed to prevent duplicate processing

## Next Steps

- Set up monitoring for your webhook function
- Implement error notification for failed webhook events
- Add additional validation for webhook event payloads

For more information, see the [Evia Sign API Documentation](https://docs.sign.enadocapp.com/evia-sign-api). 