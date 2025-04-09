# Evia Sign Webhook Integration

This document explains the Evia Sign webhook integration for document signature status updates in KH Rentals.

## Overview

The application integrates with Evia Sign for digital signatures on rental agreements. Evia Sign sends webhook events to notify our application when documents are:

1. Received for signature (`SignRequestReceived`)
2. Signed by a signatory (`SignatoryCompleted`) 
3. Completed by all signatories (`RequestCompleted`)

These events are stored in the `webhook_events` table and processed to update agreement statuses automatically.

## Implementation Components

The webhook integration consists of:

1. **Supabase Edge Function**: A serverless function that receives events from Evia Sign and processes them
2. **Database Table**: The `webhook_events` table that stores all received events
3. **Client-Side Code**: The `eviaSignService.js` that sends documents for signing with proper webhook configuration

## Fixed Issues

We've fixed several issues with the webhook integration:

1. **Missing `processed` column**: Added the `processed` column to the `webhook_events` table
2. **Webhook URL configuration**: Updated the webhook URL to use the Supabase Edge Function instead of webhook.site
3. **Webhook parameters**: Ensured both `CallbackUrl` and `CompletedDocumentsAttached` are included in all signature requests
4. **Error handling**: Improved error handling in the webhook function to handle cases where the database schema might be incomplete

## Webhook URL

The webhook URL is now set to:
```
https://vcorwfilylgtvzktszvi.supabase.co/functions/v1/evia-webhook
```

This URL is stored in:
1. The `.env` file as `VITE_EVIA_WEBHOOK_URL`
2. Used as the default in `src/services/eviaSignService.js`
3. Included as `CallbackUrl` in all signature requests

## Testing the Integration

You can test the webhook integration with:

```bash
# Run this script to test if the webhook is correctly configured in the code
node scripts/verify-webhook-settings.js

# Run this script to test sending a sample event to the webhook
node scripts/test-evia-webhook.js
```

The `test-evia-webhook.js` script:
1. Sends a test event to the webhook URL
2. Waits for processing
3. Checks the database to verify the event was stored

## Troubleshooting

If the webhook is not working:

1. **Check webhook events table**: Make sure the `webhook_events` table exists with the `processed` column
   ```sql
   SELECT column_name, data_type 
   FROM information_schema.columns 
   WHERE table_name = 'webhook_events'
   ORDER BY ordinal_position;
   ```

2. **Check Edge Function logs**: Look at the logs in the Supabase dashboard for the evia-webhook function

3. **Test direct API calls**: Use the test script to send events directly to the webhook function
   ```bash
   node scripts/test-evia-webhook.js
   ```

4. **Verify webhook URL in requests**: Look at the browser network tab when sending documents for signing to ensure the webhook URL is being included in requests

## Evia Sign Webhook Payloads

The webhook receives three types of payloads:

### 1. When a signing request is received (SignRequestReceived):
```json
{
  "RequestId": "c93fe389-cb3f-4a53-81d5-fa38b4077f98",
  "UserName": "Admin QA",
  "Email": "user@example.com",
  "Subject": "Rental Agreement",
  "EventId": 1,
  "EventDescription": "SignRequestReceived",
  "EventTime": "2023-08-31T05:55:55.2975393Z"
}
```

### 2. When a signatory completes signing (SignatoryCompleted):
```json
{
  "RequestId": "c93fe389-cb3f-4a53-81d5-fa38b4077f98",
  "UserName": "John Doe",
  "Email": "john@example.com",
  "Subject": "Rental Agreement",
  "EventId": 2,
  "EventDescription": "SignatoryCompleted",
  "EventTime": "2023-08-31T05:56:06.8342123Z"
}
```

### 3. When the request is completed (RequestCompleted):
```json
{
  "RequestId": "c93fe389-cb3f-4a53-81d5-fa38b4077f98",
  "UserName": "John Doe",
  "Email": "john@example.com",
  "Subject": "Rental Agreement",
  "EventId": 3,
  "EventDescription": "RequestCompleted",
  "EventTime": "2023-08-31T05:56:20.1064458Z",
  "Documents": [
    {
      "DocumentName": "Rental Agreement.pdf",
      "DocumentContent": "JVBERi0xLjcNCiW1tb..." // Base64 encoded PDF
    }
  ]
}
```

The `Documents` array is only included when `CompletedDocumentsAttached` is set to `true` in the original request. 