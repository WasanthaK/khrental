# Evia Sign Webhook Integration Guide

This guide explains how to set up and use the internal webhook storage system for Evia Sign integration.

## Overview

The KH Rentals application includes a built-in webhook system that captures and stores all webhook events from Evia Sign. This allows you to:

1. View all webhook events in a single dashboard
2. Filter events by type (request received, signatory completed, request completed)
3. Inspect the full payload of each event
4. Track the progression of signature requests

## Setup Steps

### 1. Create the Webhook Events Table

First, you need to create the webhook_events table in your Supabase database:

1. Open the Supabase dashboard
2. Go to the SQL Editor
3. Copy the contents of `src/scripts/createWebhookEventsTable.sql`
4. Run the SQL script

### 2. Deploy the Supabase Edge Function

Next, deploy the webhook endpoint as a Supabase Edge Function:

```bash
# Install Supabase CLI if you haven't already
npm install -g supabase

# Login to Supabase
supabase login

# Link your project
supabase link --project-ref your-project-ref

# Deploy the webhook function
supabase functions deploy evia-webhook --no-verify-jwt
```

### 3. Get Your Webhook URL

After deploying the function, your webhook URL will be:

```
https://[YOUR-PROJECT-REF].supabase.co/functions/v1/evia-webhook
```

Use this URL in your Evia Sign integration as the `CallbackUrl` parameter.

## Using the Webhook Dashboard

The webhook dashboard is available in the Admin Tools page under "Evia Sign Webhooks". From here you can:

1. View all webhook events
2. Filter events by type
3. See detailed information for each event
4. Clear all events if needed
5. Refresh the list to check for new events

## Webhook Payload Types

Evia Sign sends three types of webhook events:

1. **SignRequestReceived** - When a signing request is first created
   ```json
   {
     "RequestId": "c93fe389-cb3f-4a53-81d5-fa38b4077f98",
     "UserName": "Admin QA",
     "Email": "example@gmail.com",
     "Subject": "test 01",
     "EventId": 1,
     "EventDescription": "SignRequestReceived",
     "EventTime": "2025-03-31T05:55:55.2975393Z"
   }
   ```

2. **SignatoryCompleted** - When a signatory completes signing
   ```json
   {
     "RequestId": "c93fe389-cb3f-4a53-81d5-fa38b4077f98",
     "UserName": "Admin QA",
     "Email": "example@gmail.com",
     "Subject": "test 01",
     "EventId": 2,
     "EventDescription": "SignatoryCompleted",
     "EventTime": "2025-03-31T05:56:06.8342123Z"
   }
   ```

3. **RequestCompleted** - When the entire request is completed
   ```json
   {
     "RequestId": "68f62ce1-7424-43e1-b3cf-52fdf72744ca",
     "UserName": "Admin QA",
     "Email": "example@gmail.com",
     "Subject": "test 01",
     "EventId": 3,
     "EventDescription": "RequestCompleted",
     "EventTime": "2025-03-31T05:31:42.1064458Z",
     "Documents": [
       {
         "DocumentName": "document name in here",
         "DocumentContent": "JVBERi0xLjcNCiW1tb..." // Base64 PDF content
       }
     ]
   }
   ```

## Implementing CompletedDocumentsAttached

To include the completed document in the webhook payload, set `CompletedDocumentsAttached: true` in your signature request:

```javascript
const requestJson = {
  Message: "Please sign this document",
  Title: "Test Signature Request",
  CallbackUrl: "https://your-project-ref.supabase.co/functions/v1/evia-webhook",
  CompletedDocumentsAttached: true, // Set this to true to receive documents
  Documents: [documentToken],
  // ... other properties
};
```

## Handling the Documents in the Webhook

When `CompletedDocumentsAttached` is set to true, the final webhook event will include a `Documents` array with the signed document in base64 format. You can decode this to save the signed document automatically.

## Troubleshooting

If webhooks are not being received:

1. Check that the Supabase function is deployed correctly
2. Verify that the webhook URL is correct in your signature requests
3. Check the Supabase function logs for any errors
4. Ensure your webhook URL is publicly accessible (not behind a firewall)

For more information on Evia Sign webhooks, refer to the official documentation. 