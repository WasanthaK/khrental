# API Server Removal Plan

## Current Status

The application currently has a standalone Express server in `api-server.js` that handles Evia Sign webhook events. This server:

1. Provides an endpoint at `/api/evia-webhook` to receive webhook events from Evia Sign
2. Stores these events in the `webhook_events` table in the Supabase database
3. Updates agreement statuses based on webhook events

This functionality is now redundant because the application is using a dedicated webhook server at `kh-reantals-webhook.azurewebsites.net` that performs the same functions.

## Removal Plan

### 1. Verify Webhook Server Functionality

Before removing the local API server, confirm that the Azure webhook server is properly handling all Evia Sign webhook events:

- [ ] Verify that `kh-reantals-webhook.azurewebsites.net` is properly configured and running
- [ ] Confirm that webhook events are being correctly stored in the database
- [ ] Test the complete signature flow to ensure agreement statuses are properly updated
- [ ] Check that database triggers are correctly set up to process webhook events

### 2. Update Evia Sign Configuration

Ensure that Evia Sign is configured to send webhooks to the correct endpoint:

- [ ] Check the `evia_sign_config` table in the database and update the `webhook_url` entry:

```sql
UPDATE evia_sign_config 
SET config_value = 'https://kh-reantals-webhook.azurewebsites.net/webhook/evia-sign' 
WHERE config_key = 'webhook_url';
```

- [ ] Verify in the Evia Sign admin panel that webhooks are correctly configured to send to the Azure webhook server

### 3. Remove API Server

Once you've confirmed that the Azure webhook server is handling everything correctly:

- [ ] Delete the `api-server.js` file
- [ ] Remove any references to starting or configuring this server in scripts or documentation
- [ ] Remove any environment variables specifically for this server (e.g., `API_PORT`)

### 4. Update Documentation

Update relevant documentation to reflect this change:

- [ ] Update all webhook documentation to reference only the Azure webhook server
- [ ] Remove references to the local API server from setup guides
- [ ] Update environment variable documentation to remove any API server variables

### 5. Testing After Removal

After removing the local API server, test the following to ensure functionality is preserved:

- [ ] Test the complete signature flow from agreement creation to completion
- [ ] Verify that webhooks are still being received and stored
- [ ] Confirm that agreement statuses are still being updated correctly
- [ ] Check that the system admin tools still function properly

## Potential Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Azure webhook server is not properly configured | Medium | High | Thoroughly test before removing the local server |
| Some code may still reference the local server | Medium | Medium | Search the codebase for references to update |
| Evia Sign webhooks might not work temporarily | Low | High | Perform change during off-hours and have a rollback plan |
| Database triggers might be different | Medium | High | Verify trigger functionality before removing the server |

## Rollback Plan

If issues are encountered after removing the API server:

1. Restore the `api-server.js` file from version control
2. Update the webhook URL in the database to point back to the local server
3. Restart the service to activate the local API server
4. Investigate and fix the issues with the Azure webhook server

## Conclusion

Removing the `api-server.js` file will simplify the application architecture by eliminating redundant webhook handling. This change aligns with the principle of having a single source of truth for webhook processing and reduces the maintenance burden.

Before proceeding with the removal, ensure that all verification steps are completed successfully to maintain system functionality. 