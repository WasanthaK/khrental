# Evia Sign Webhook Solution

## Issue Identified

We identified several issues with the Evia Sign webhook integration:

1. **Authentication Mismatch**: The Supabase Edge Function required an Authorization header, but Evia Sign doesn't include one when sending webhook events.

2. **Database Schema Issue**: The webhook_events table had a missing `processed` column that the code was trying to use.

3. **Database Constraint Error**: The code was trying to update agreements with an "unknown" status, which violated a database constraint.

## Solution

We've fixed these issues with the following changes:

1. **Authentication Bypass**: Modified the webhook function to accept requests without an Authorization header.

2. **Robust Column Handling**: Added fallback logic to handle cases where the `processed` column is missing.

3. **CORS Support**: Added proper CORS headers to the function's responses.

4. **Error Handling**: Improved error handling throughout the code to make it more resilient.

5. **Constraint Avoidance**: Modified the code to avoid setting "unknown" as a signature status.

## Action Required

To deploy this fix:

1. **Deploy the Updated Function**:
   - Go to Supabase dashboard > Edge Functions
   - Select `evia-webhook` (or create it if it doesn't exist)
   - Paste the contents of `evia-webhook-function.js`
   - Deploy the function

2. **Test the Function**:
   ```bash
   # Test the function with a simulated Evia Sign request (no auth header)
   node scripts/test-evia-sign-webhook.js
   ```

3. **Update Evia Sign Configuration** (if needed):
   - Ensure `CallbackUrl` is set to your webhook URL
   - Ensure `CompletedDocumentsAttached` is set to `true`

## How It Works Now

The improved webhook integration:

1. **Accepts Requests Without Auth**: The function accepts webhook requests without an Authorization header, as Evia Sign doesn't provide one.

2. **Gracefully Handles Missing Columns**: If the `processed` column doesn't exist, the function falls back to storing the event without it.

3. **Adds CORS Headers**: The function now includes proper CORS headers for all responses.

4. **Better Error Handling**: All error cases are properly logged and handled.

5. **Avoids Database Constraints**: The function avoids setting invalid status values that would violate database constraints.

## Testing and Verification

You can verify the solution works by:

1. Sending a test event:
   ```bash
   node scripts/test-evia-sign-webhook.js
   ```

2. Checking the webhook_events table:
   ```sql
   SELECT * FROM webhook_events
   ORDER BY createdat DESC
   LIMIT 10;
   ```

3. Sending a real document for signing and checking if webhook events are received.

## Monitoring

To monitor the webhook function:

1. Go to your Supabase dashboard
2. Navigate to Edge Functions
3. Select `evia-webhook`
4. Check the Invocations and Logs tabs 