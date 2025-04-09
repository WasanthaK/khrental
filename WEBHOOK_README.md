# Webhook Server Testing Tools

This folder contains scripts to help you test the webhook server and verify that events are being stored correctly in the Supabase database.

## Prerequisites

- Node.js installed (tested with v12+)
- Supabase project set up with a `webhook_events` table
- npm package `@supabase/supabase-js` installed

## Available Scripts

### Windows PowerShell & Batch Scripts

These scripts provide a user-friendly way to test the webhook server:

1. **run-server.bat**
   - Starts the simple webhook server on port 3033
   - Uses Node.js to run the server

2. **check-db.ps1**
   - PowerShell script to check the current state of the webhook_events table
   - Shows the total count and most recent events

3. **test-webhook.ps1**
   - PowerShell script to send a test webhook to the server
   - Creates a unique payload and sends it to the webhook endpoint

4. **run-complete-test.bat**
   - Comprehensive test that runs all the above scripts in sequence
   - Checks database before and after to verify the event was stored

## How to Test the Webhook Server

### Option 1: Complete Test

1. Double-click `run-complete-test.bat`
2. Follow the prompts on screen
3. The script will:
   - Check the current database state
   - Start the webhook server in a new window
   - Send a test webhook
   - Check the database again to verify the event was stored

### Option 2: Manual Testing

1. Start the server:
   - Double-click `run-server.bat`
   - Or run `node simple-webhook-server.js` in a terminal

2. Check the database:
   - Right-click `check-db.ps1` and select "Run with PowerShell"
   - Or run `powershell -File check-db.ps1` in a terminal

3. Send a test webhook:
   - Right-click `test-webhook.ps1` and select "Run with PowerShell"
   - Or run `powershell -File test-webhook.ps1` in a terminal

4. Check the database again to verify the event was stored.

## Troubleshooting

- **Server won't start**: Make sure Node.js is installed and in your PATH
- **Database connection fails**: Verify your Supabase URL and key in the scripts
- **Webhook fails**: Ensure the server is running before sending webhooks
- **No events in database**: Check server logs for any errors during processing

## JavaScript Files

For developers who prefer using JavaScript directly:

- `simple-webhook-server.js` - The main webhook server
- `test-simple-webhook.js` - Test script to send webhooks programmatically