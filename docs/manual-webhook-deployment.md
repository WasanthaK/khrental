# Manual Webhook Deployment Guide

Since the Supabase CLI installation had some issues, follow these steps to manually deploy your webhook function:

## 1. Log in to the Supabase Dashboard

Go to [https://app.supabase.io/](https://app.supabase.io/) and log in to your account.

## 2. Select Your Project

Select the project with reference ID `vcorwfilylgtvzktszvi`.

## 3. Navigate to Edge Functions

In the left sidebar, click on **Edge Functions**.

## 4. Deploy the Evia Webhook Function

1. If you see `evia-webhook` in the list of functions, click on it.
2. If it says it's not deployed, click the **Deploy** button.
3. If you don't see `evia-webhook` listed:
   - Click **Create a new function**
   - Name it `evia-webhook`
   - Deploy it with the existing code (you can copy it from your local project)

## 5. Configure Function Settings

1. In the function details page, disable **JWT Verification** (since our webhook needs to receive calls from Evia Sign without authentication)
2. Make sure the function has access to your database by checking **Service role connection pooling**

## 6. Test the Webhook

Test if your webhook works by sending a test request:

```bash
curl -X POST https://vcorwfilylgtvzktszvi.supabase.co/functions/v1/evia-webhook \
  -H "Content-Type: application/json" \
  -d '{"RequestId":"test-123","EventId":1,"EventDescription":"SignRequestReceived","UserName":"Test User","Email":"test@example.com"}'
```

## 7. View Function Logs

1. In the function details page, click on the **Logs** tab
2. Check for any errors or successful responses

## 8. Create the webhook_events Table

If it doesn't exist yet, create a table to store webhook events:

1. Go to **Database** > **Tables** in the Supabase dashboard
2. Click **Create a new table**
3. Name it `webhook_events`
4. Add these columns:
   - `id` (type: uuid, primary key, default: gen_random_uuid())
   - `event_type` (type: text)
   - `request_id` (type: text)
   - `user_name` (type: text)
   - `user_email` (type: text)
   - `subject` (type: text)
   - `event_id` (type: integer)
   - `event_time` (type: timestamp with time zone, default: now())
   - `raw_data` (type: jsonb)
   - `createdat` (type: timestamp with time zone, default: now())

## 9. Update Your .env File

Make sure your `.env` file contains this line with the correct project reference:

```
VITE_EVIA_WEBHOOK_URL=https://vcorwfilylgtvzktszvi.supabase.co/functions/v1/evia-webhook
```

## 10. Restart Your Application

After making these changes, restart your application for the new environment variables to take effect. 