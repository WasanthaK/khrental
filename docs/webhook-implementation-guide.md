# Evia Sign Webhook Implementation Guide

This document provides a step-by-step guide to implementing the Evia Sign webhook handler directly in our application.

## 1. Why We're Using an Internal Webhook Handler

We've chosen to handle Evia Sign webhooks directly within our application instead of using Supabase Edge Functions because:

- **Simpler development workflow** - No need to deploy separate cloud functions
- **Easier debugging** - All code is in one place 
- **Integrated with our app** - Uses the same authentication and database access

## 2. How to Implement the Webhook Handler

### Step 1: Create a Webhook Handler Service

First, create a file at `src/services/webhookHandler.js`:

```javascript
import { supabase } from './supabaseClient';

/**
 * Process webhook events from Evia Sign
 * @param {Object} payload - Webhook payload from Evia Sign
 * @returns {Promise<Object>} - Processing result
 */
export const handleSignatureWebhook = async (payload) => {
  try {
    console.log('Received webhook payload:', payload);
    
    // Extract data
    const {
      RequestId,
      EventId,
      EventDescription,
      UserName,
      Email,
      Subject,
      EventTime,
      Documents
    } = payload;
    
    // Log the event type
    console.log(`Processing ${EventDescription} event for request ${RequestId}`);
    
    // Store in webhook_events table if it exists
    try {
      const { error: eventError } = await supabase
        .from('webhook_events')
        .insert([{
          event_type: EventDescription || 'unknown',
          request_id: RequestId || null,
          user_name: UserName || null,
          user_email: Email || null,
          subject: Subject || null,
          event_id: EventId || null,
          event_time: EventTime || new Date().toISOString(),
          raw_data: payload
        }]);
      
      if (eventError) {
        console.warn('Error storing webhook event (table might not exist):', eventError);
      }
    } catch (logError) {
      console.warn('Could not log webhook event to database:', logError);
    }
    
    // Find the agreement using the RequestId
    const { data: agreement, error: findError } = await supabase
      .from('agreements')
      .select('*')
      .eq('eviasignreference', RequestId)
      .single();
    
    if (findError) {
      console.error('Error finding agreement:', findError);
      return { 
        success: false, 
        error: 'Agreement not found' 
      };
    }
    
    if (!agreement) {
      console.error('No agreement found with eviasignreference:', RequestId);
      return { 
        success: false, 
        error: 'No matching agreement found' 
      };
    }
    
    console.log('Found agreement:', {
      id: agreement.id,
      status: agreement.status,
      signature_status: agreement.signature_status
    });
    
    // Handle different event types
    switch (EventId) {
      case 1: // SignRequestReceived
        await updateAgreement(agreement.id, {
          signature_status: 'pending',
          signatories_status: []
        });
        break;
        
      case 2: // SignatoryCompleted
        // Get current signatory status
        const { data: currentAgreement } = await supabase
          .from('agreements')
          .select('signatories_status')
          .eq('id', agreement.id)
          .single();
          
        // Create or update signatories array
        const currentSignatories = currentAgreement?.signatories_status || [];
        const updatedSignatories = Array.isArray(currentSignatories) 
          ? [...currentSignatories] 
          : [];
        
        // Find or add the signatory
        const signatoryIndex = updatedSignatories.findIndex(s => s.email === Email);
        if (signatoryIndex >= 0) {
          updatedSignatories[signatoryIndex] = {
            ...updatedSignatories[signatoryIndex],
            status: 'completed',
            signedAt: EventTime
          };
        } else {
          updatedSignatories.push({
            name: UserName,
            email: Email,
            status: 'completed',
            signedAt: EventTime
          });
        }
        
        await updateAgreement(agreement.id, {
          signature_status: 'in_progress',
          signatories_status: updatedSignatories
        });
        break;
        
      case 3: // RequestCompleted
        let signedPdfUrl = null;
        
        // Process the completed document if included
        if (Documents && Documents.length > 0) {
          try {
            const signedDoc = Documents[0];
            signedPdfUrl = await uploadSignedDocument(signedDoc, agreement.id);
          } catch (docError) {
            console.error('Error uploading signed document:', docError);
          }
        }
        
        // Update the agreement as signed
        await updateAgreement(agreement.id, {
          status: 'signed',
          signature_status: 'completed',
          signeddate: EventTime || new Date().toISOString(),
          signatureurl: signedPdfUrl
        });
        break;
        
      default:
        console.warn(`Unknown event type: ${EventId}`);
    }
    
    return { 
      success: true, 
      message: `Processed ${EventDescription} event` 
    };
  } catch (error) {
    console.error('Error processing webhook:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

/**
 * Update an agreement in the database
 * @param {string} agreementId - Agreement ID
 * @param {Object} updates - Updates to apply
 */
async function updateAgreement(agreementId, updates) {
  try {
    const { error } = await supabase
      .from('agreements')
      .update({
        ...updates,
        updatedat: new Date().toISOString()
      })
      .eq('id', agreementId);
      
    if (error) {
      console.error('Error updating agreement:', error);
      throw error;
    }
  } catch (error) {
    console.error(`Error updating agreement ${agreementId}:`, error);
    throw error;
  }
}

/**
 * Upload a signed document from webhook payload
 * @param {Object} signedDoc - Document from webhook
 * @param {string} agreementId - Agreement ID
 * @returns {Promise<string|null>} - URL of uploaded document
 */
async function uploadSignedDocument(signedDoc, agreementId) {
  try {
    if (!signedDoc || !signedDoc.DocumentContent) {
      throw new Error('Invalid document data');
    }
    
    // Convert base64 to blob
    const byteCharacters = atob(signedDoc.DocumentContent);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: 'application/pdf' });
    
    // Upload to Supabase Storage
    const fileName = `signed_${agreementId}_${Date.now()}.pdf`;
    const filePath = `agreements/${fileName}`;
    
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('files')
      .upload(filePath, blob, {
        contentType: 'application/pdf',
        upsert: true
      });
      
    if (uploadError) {
      console.error('Storage upload error:', uploadError);
      return null;
    }
    
    // Get the public URL
    const { data: urlData } = supabase.storage
      .from('files')
      .getPublicUrl(filePath);
      
    return urlData?.publicUrl || null;
  } catch (error) {
    console.error('Error uploading signed document:', error);
    return null;
  }
}
```

### Step 2: Create an API Endpoint for the Webhook

Create a file at `src/pages/api/evia-webhook.js`:

```javascript
import { handleSignatureWebhook } from '../../services/webhookHandler';

/**
 * Webhook handler for Evia Sign callbacks
 * This endpoint receives webhook events from Evia Sign API
 */
export default async function handler(req, res) {
  // Only accept POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('Received webhook from Evia Sign:', req.body);
    
    // Process the webhook
    const result = await handleSignatureWebhook(req.body);
    
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }
    
    return res.status(200).json({ success: true, message: result.message });
  } catch (error) {
    console.error('Webhook handler error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
```

### Step 3: Configure API Routes

For a Vite application with React Router, we need to modify our routing configuration to handle the API endpoint. Add this to your routing setup:

1. In the case of Next.js, the API file above is enough
2. For React Router, add a custom route handler in your main router configuration

### Step 4: Update the Environment Variable

Update your `.env` file:

```
# Development
VITE_EVIA_WEBHOOK_URL=http://localhost:5173/api/evia-webhook

# Production (after deployment)
VITE_EVIA_WEBHOOK_URL=https://your-domain.com/api/evia-webhook
```

### Step 5: Create the Database Table

Run this SQL in your Supabase project to create the webhook events table:

```sql
-- Create the webhook_events table to store Evia webhook events
CREATE TABLE IF NOT EXISTS webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT,
  request_id TEXT,
  user_name TEXT,
  user_email TEXT,
  subject TEXT,
  event_id INTEGER,
  event_time TIMESTAMPTZ DEFAULT now(),
  raw_data JSONB,
  createdat TIMESTAMPTZ DEFAULT now(),
  updatedat TIMESTAMPTZ DEFAULT now()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_webhook_events_request_id ON webhook_events(request_id);
CREATE INDEX IF NOT EXISTS idx_webhook_events_event_id ON webhook_events(event_id);
```

## 3. Testing the Implementation

### Method 1: Using the Test Script

Run this test script that sends simulated webhook events:

```bash
npm run test-webhook
```

### Method 2: Manual Testing

Test the endpoint with curl:

```bash
curl -X POST http://localhost:5173/api/evia-webhook \
  -H "Content-Type: application/json" \
  -d '{"RequestId":"test-123","EventId":1,"EventDescription":"SignRequestReceived","UserName":"Test User","Email":"test@example.com"}'
```

## 4. Troubleshooting the 404 Errors

If you're seeing 404 errors when testing the webhook endpoint, follow these steps:

### For a Vite App with React Router:

1. **Install additional dependencies if needed**:
   ```bash
   npm install express cors body-parser
   ```

2. **Create a server middleware**:
   Create a file at `server.js` in your project root:
   
   ```javascript
   // Simple Express server for handling API endpoints
   const express = require('express');
   const cors = require('cors');
   const bodyParser = require('body-parser');
   const { createServer: createViteServer } = require('vite');
   const { handleSignatureWebhook } = require('./src/services/webhookHandler');
   
   async function createServer() {
     const app = express();
     
     // Middleware
     app.use(cors());
     app.use(bodyParser.json());
     
     // Webhook endpoint
     app.post('/api/evia-webhook', async (req, res) => {
       try {
         console.log('Received webhook:', req.body);
         const result = await handleSignatureWebhook(req.body);
         res.json(result);
       } catch (error) {
         console.error('Webhook error:', error);
         res.status(500).json({ error: error.message });
       }
     });
     
     // Vite dev server
     const vite = await createViteServer({
       server: { middlewareMode: true }
     });
     app.use(vite.middlewares);
     
     // Start server
     const port = process.env.PORT || 5173;
     app.listen(port, () => {
       console.log(`Server running at http://localhost:${port}`);
     });
   }
   
   createServer();
   ```
   
3. **Update package.json scripts**:
   ```json
   "scripts": {
     "dev": "node server.js",
     "build": "vite build",
     "preview": "vite preview"
   }
   ```

### For Other Frameworks:

- **Next.js**: The API routes should work out of the box at `/api/evia-webhook`
- **Express**: Register a POST handler at the correct route
- **Other Frameworks**: Check your framework's documentation for handling API endpoints

## 5. Production Considerations

1. **Update the webhook URL** in your environment variables for production
2. **Ensure proper error handling** to prevent the webhook from crashing your application
3. **Implement rate limiting** to prevent abuse
4. **Add logging** to track webhook events and errors
5. **Set up monitoring** to detect issues with the webhook processing

## 6. Alternative Approach: Using Webhook.site for Testing

If you're still having issues with the internal webhook handler, you can use webhook.site as a temporary solution:

1. Go to [webhook.site](https://webhook.site/)
2. Get your unique URL
3. Update your environment variable:
   ```
   VITE_EVIA_WEBHOOK_URL=https://webhook.site/your-unique-id
   ```
4. Send documents for signature
5. View the webhook events on the webhook.site interface

This is a great way to debug the Evia Sign webhook payloads without needing to set up your own endpoint. 