# Evia Sign Webhook Integration

This document explains how to set up and troubleshoot the Evia Sign webhook integration for the rental agreement signing functionality.

## Overview

The webhook allows Evia Sign to notify our application about signature events, including:
- When a signing request is sent
- When a signatory completes their signature
- When the entire signature request is completed

## Setup Instructions

### 1. Deploy the Webhook Function

The webhook is implemented as a Supabase Edge Function. To deploy it:

```bash
# Make the deployment script executable
chmod +x scripts/deploy-evia-webhook.sh

# Run the deployment script
./scripts/deploy-evia-webhook.sh
```

This will:
1. Deploy the webhook function to your Supabase project
2. Generate the correct webhook URL
3. Update your `.env` file with the webhook URL

### 2. Configure Environment Variables

Make sure your `.env` file contains:

```
VITE_EVIA_WEBHOOK_URL=https://your-project-ref.supabase.co/functions/v1/evia-webhook
```

Where `your-project-ref` is your actual Supabase project reference.

### 3. Enable Function Permissions

In the Supabase dashboard:
1. Go to **Functions** > **evia-webhook**
2. Ensure **JWT verification** is turned OFF (we're using the request ID to verify)
3. Enable the required permissions for the function to update your database

## Testing the Webhook

You can test the webhook functionality with:

```bash
# Use a test request ID or an actual Evia Sign request ID
node scripts/test-evia-webhook.js [requestID]
```

Or make an HTTP request to your webhook URL:

```bash
curl -X POST https://your-project-ref.supabase.co/functions/v1/evia-webhook \
  -H "Content-Type: application/json" \
  -d '{"RequestId":"test-123","EventId":1,"EventDescription":"SignRequestReceived","UserName":"Test User","Email":"test@example.com"}'
```

## Troubleshooting

### Common Issues

1. **Webhook URL Not Configured**
   - Check that `VITE_EVIA_WEBHOOK_URL` is correctly set in your .env file
   - Verify the URL can be reached with a simple curl test

2. **No Status Updates After Signing**
   - Check the Supabase function logs for errors
   - Ensure the `eviasignreference` field is correctly set in your agreements table

3. **Authentication Errors**
   - The Supabase function should not require authentication for the webhook
   - Check JWT verification is disabled for the function

4. **Database Update Failures**
   - Check function permissions for database access
   - Verify the agreements table structure matches what the webhook expects

## Manual Verification

You can manually check if a signature request was completed by using the checkSignatureStatus function:

```javascript
import { checkSignatureStatus } from '../services/eviaSignService';

// Replace with your actual request ID
const result = await checkSignatureStatus('your-request-id');
console.log(result);
```

## Webhook Event Schema

The Evia Sign webhook sends events with the following structure:

```javascript
{
  "RequestId": "c93fe389-cb3f-4a53-81d5-fa38b4077f98", // The Evia Sign request ID
  "UserName": "John Doe",
  "Email": "john@example.com",
  "Subject": "Rental Agreement",
  "EventId": 1, // 1=SignRequestReceived, 2=SignatoryCompleted, 3=RequestCompleted
  "EventDescription": "SignRequestReceived",
  "EventTime": "2023-03-31T05:55:55.2975393Z",
  "Documents": [] // Only included for RequestCompleted when CompletedDocumentsAttached=true
}
``` 