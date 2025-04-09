# Evia Sign Integration Guide

This document provides information on integrating with Evia Sign for digital signatures, common issues, and solutions.

## Environment Setup

To integrate with Evia Sign, make sure you have the following environment variables in your `.env` file:

```
VITE_EVIA_SIGN_CLIENT_ID=your_client_id
VITE_EVIA_SIGN_CLIENT_SECRET=your_client_secret
```

## Important Notes

1. **Environment Variables Format**:
   - Ensure there are NO spaces around the equals sign in your `.env` file
   - Make sure all Evia Sign variables have the `VITE_` prefix for client-side access

2. **Resource Parameter**:
   - The authorization URL MUST include the `resource=RESOURCE_APPLICATION` parameter exactly as specified in the Evia Sign documentation
   - Removing or changing this parameter will result in a server error

3. **URL Format**:
   - The authorization URL MUST follow the exact format from Evia Sign documentation
   - Note that the parameter `responce_type` (with intentional typo in "response") must be used as-is

4. **Request IDs**:
   - When checking signature status, ensure the request ID is in valid UUID format
   - Trim any whitespace from request IDs before sending to the API

## Common Issues and Solutions

### "Object reference not set to an instance of an object"

**Cause**: Missing or incorrect `resource` parameter in the authorization URL.

**Solution**: Ensure that the authorization URL includes `resource=RESOURCE_APPLICATION`.

### 400 Bad Request when checking signature status

**Causes**:
- Invalid UUID format for the request ID
- Request ID doesn't exist in Evia Sign system
- Expired request
- Invalid or expired authentication token

**Solutions**:
- Verify the request ID is a valid UUID format
- Ensure the request ID exists in Evia Sign system
- Check if the request has expired
- Use webhooks instead of direct status checks (recommended)
- Get a fresh authentication token before checking status

### 401 Unauthorized when checking status

**Causes**:
- Missing authentication token
- Expired authentication token
- Incorrect token format

**Solutions**:
- Always use `getAccessToken()` instead of `getAuthToken()`
- Ensure you're using the Bearer prefix in the Authorization header
- Implement proper token refresh logic

## Webhooks vs. Status Checks

### Status Check Approach (Polling)
- **Pros**: Simple to implement initially
- **Cons**: Can lead to rate limiting, relies on client-side polling, may use expired tokens

### Webhook Approach (Recommended)
- **Pros**: Real-time updates, more reliable, reduces API calls
- **Cons**: Requires server endpoint setup, needs public internet access

## Setting Up Webhooks

1. **Create an Endpoint**:
   ```javascript
   // src/api/webhooks.js
   import { handleSignatureWebhook } from '../services/eviaSignService';
   
   export async function eviaSignWebhookHandler(req, res) {
     // Handle webhook payload
     const result = await handleSignatureWebhook(req.body);
     return res.status(result.success ? 200 : 500).json(result);
   }
   ```

2. **Configure Your Server**:
   For development, use a service like ngrok to expose your localhost endpoint.
   For production, ensure your webhook endpoint is publicly accessible.

3. **Include Webhook URL**:
   When sending a document for signature, include your webhook URL:
   ```javascript
   const requestJson = {
     // ...other properties
     WebhookUrl: "https://your-domain.com/api/evia-webhook"
   };
   ```

## Implementation Best Practices

1. **Error Handling**:
   - Always implement comprehensive error handling for all Evia Sign API calls
   - Log specific error details for troubleshooting

2. **Validation**:
   - Validate all input parameters (especially UUIDs) before sending to Evia Sign API
   - Use proper regex validation for expected formats

3. **Authentication**:
   - Implement proper token refresh logic
   - Store tokens securely in localStorage with expiration handling

4. **Status Updates**:
   - Prefer webhooks over polling for status updates
   - As a fallback, implement periodic status checking with proper validation

## API Endpoints

- **Authorization**: `https://evia.enadocapp.com/_apis/falcon/auth/oauth2/authorize`
- **Token**: `https://evia.enadocapp.com/_apis/falcon/auth/api/v1/Token`
- **Document Upload**: `https://evia.enadocapp.com/_apis/sign/thumbs/api/Requests/document`
- **Send Request**: `https://evia.enadocapp.com/_apis/sign/api/Requests`
- **Check Status**: `https://evia.enadocapp.com/_apis/sign/api/Requests/status`

## Signature Workflow

1. **Authentication**: Obtain auth token via OAuth flow
2. **Document Upload**: Upload document to get a document token
3. **Create Signature Request**: Create a request with document token and signatories
4. **Status Tracking**:
   - **Option A (Recommended)**: Set up webhook to receive status updates
   - **Option B (Fallback)**: Periodically check status of the signature request
5. **Download Signed Document**: Once completed, download the signed document

## Contact

For persistent issues, contact the Evia Sign support team with:
- Your client ID
- Detailed error messages
- Steps to reproduce the issue

# Agreement Signature Service

## Overview

This service handles the electronic signature process for agreements using the Evia Sign API. The current implementation includes a simplified flow to allow testing and demonstration of the full rental agreement process without requiring a full integration with the Evia Sign API.

## Implementation Details

### Current Implementation (Simplified for Demo)

In the current implementation:

1. The system sends documents for signature through the normal flow, generating a request ID.
2. The status check function (`getSignatureStatus`) always returns a successful result for testing purposes.
3. When checking status, the system will:
   - Mark the agreement as signed
   - Update the property status to "rented"
   - Create a property assignment to the tenant
   - Redirect the user to the agreements list

This allows the full rental process to be demonstrated without requiring actual signatures.

### Production Implementation

For production use, you would:

1. Remove the simplified status check in `getSignatureStatus` function
2. Uncomment the actual API call code
3. Ensure proper authentication handling
4. Consider implementing webhook handling for real-time status updates

## Common Issues

### Authentication

Authentication with Evia Sign requires:
- Client ID and Secret stored in environment variables (VITE_EVIA_SIGN_CLIENT_ID, VITE_EVIA_SIGN_CLIENT_SECRET)
- Proper redirect URI configuration
- Handling token refresh

### Status Check

The status check can return various results:
- `completed` - All signatories have signed
- `pending` - Waiting for signatures
- `rejected` - One or more signatories rejected
- `expired` - The signature request has expired

## Workflow

1. Generate agreement document
2. Send for signature via Evia Sign API
3. Store request ID in database
4. Check status (manual or via webhook)
5. When completed, mark agreement as signed and update property status
6. Assign property to tenant

## Usage

To check a signature status:

```jsx
import { getSignatureStatus } from '../services/eviaSignService';

// ... in your component
const checkStatus = async () => {
  const requestId = agreement.eviasignreference;
  const result = await getSignatureStatus(requestId);
  
  if (result.success) {
    // Handle successful signature
  } else {
    // Handle error
  }
};
```

# Services Documentation

## Utility Billing Service

The Utility Billing Service manages the workflow for utility readings and billing within the property management system. It provides a structured approach to handling electricity and water consumption data, from submission to invoicing.

### Key Components

1. **Utility Readings Management**
   - Fetching pending readings for review (`fetchPendingReadings`)
   - Approving readings with automatic billing calculation (`approveReading`)
   - Rejecting readings with reason (`rejectReading`)

2. **Utility Billing Management**
   - Fetching approved readings ready for invoicing (`fetchReadingsForInvoice`)
   - Marking utility bills as invoiced (`markAsInvoiced`)
   - Usage summary and analytics (`getRenteeUtilityUsage`)

3. **Database Integration**
   - Transaction-based approval process using stored procedures
   - Automatic calculation of consumption and billing amounts
   - Linking utility readings to invoice records

### Data Flow

```
Rentee Submission → Admin Review → Approval → Billing Preparation → Invoice Generation
```

### UI Components

1. **UtilityMeterForm**: Reusable component for tenants to submit utility readings
2. **UtilityBillingReview**: Admin interface for reviewing submitted readings
3. **UtilityBillingInvoice**: Interface for converting approved readings into invoices

### Database Schema

The service uses two main tables:

1. **utility_readings**:
   - Stores raw meter readings
   - Contains approval status and metadata
   - Links to properties and rentees

2. **utility_billing**:
   - Stores calculated billing information
   - Contains invoice status and amounts
   - Used for reporting and analytics

### Transaction Handling

The service implements a transaction-based approach for approving readings:

1. When a reading is approved, a transaction begins
2. The reading status is updated to "approved"
3. A new billing record is created with calculated amounts
4. If any step fails, the entire transaction is rolled back

### Integration with Invoice System

Utility bills are designed to integrate with the existing invoice system:

1. Approved utility readings are grouped by rentee
2. Selected readings can be converted into line items on invoices
3. Once added to an invoice, utility bills are marked as "invoiced"

### Best Practices

1. **Data Integrity**: The service enforces validation to ensure readings progress logically
2. **Performance**: Queries are optimized with proper joins and filters
3. **Error Handling**: Comprehensive error handling with user-friendly messages
4. **Separation of Concerns**: Clear separation between reading management and billing

### Utility Rate Management

Property-specific utility rates are stored in the properties table:
- `electricity_rate`: Price per kWh for electricity
- `water_rate`: Price per cubic meter for water

These rates are used to automatically calculate billing amounts when readings are approved. 