// Simple Express server for handling API endpoints
import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import { createServer as createViteServer } from 'vite';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Create a Supabase client
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function createServer() {
  const app = express();
  
  // Middleware
  app.use(cors());
  app.use(bodyParser.json());
  
  // Create a separate router for API endpoints
  const apiRouter = express.Router();
  
  // Webhook endpoint for Evia Sign
  apiRouter.post('/webhooks/evia', async (req, res) => {
    try {
      console.log('✅ Received webhook:', {
        eventId: req.body.EventId,
        eventType: req.body.EventDescription,
        requestId: req.body.RequestId
      });
      
      // Store the raw webhook data for debugging/testing
      const { data, error } = await supabase
        .from('webhook_events')
        .insert([{
          event_type: req.body.EventDescription || 'unknown',
          request_id: req.body.RequestId?.toString(),
          user_name: req.body.UserName || null,
          user_email: req.body.Email || null,
          subject: req.body.Subject || null,
          event_id: req.body.EventId || null,
          event_time: req.body.EventTime || new Date().toISOString(),
          raw_data: req.body
        }]);
      
      if (error) {
        console.error('❌ Error storing webhook:', error);
      } else {
        console.log('✅ Webhook stored successfully');
      }
      
      if (req.body.RequestId) {
        // Find the agreement with this reference ID
        const { data: agreement, error: agreementError } = await supabase
          .from('agreements')
          .select('*')
          .eq('eviasignreference', req.body.RequestId)
          .single();
          
        if (!agreementError && agreement) {
          console.log('✅ Found agreement:', agreement.id);
          
          // Update the agreement status based on the event
          let signatureStatus = 'pending';
          let agreementStatus = 'draft';
          
          if (req.body.EventId === 2) {
            signatureStatus = 'in_progress';
            agreementStatus = 'partially_signed';
          } else if (req.body.EventId === 3) {
            signatureStatus = 'completed';
            agreementStatus = 'signed';
          }
          
          const { data: updateData, error: updateError } = await supabase
            .from('agreements')
            .update({
              signature_status: signatureStatus,
              status: agreementStatus,
              updatedat: new Date().toISOString()
            })
            .eq('id', agreement.id);
            
          if (updateError) {
            console.error('❌ Error updating agreement:', updateError);
          } else {
            console.log('✅ Agreement updated successfully');
          }
        }
      }
      
      // Return a more detailed success response
      res.status(200).json({ 
        success: true,
        message: `Webhook processed successfully: ${req.body.EventDescription || 'unknown event'}`,
        timestamp: new Date().toISOString(),
        received: {
          eventId: req.body.EventId,
          eventType: req.body.EventDescription,
          requestId: req.body.RequestId
        }
      });
    } catch (error) {
      console.error('❌ Webhook error:', error);
      // Still return 200 to acknowledge receipt
      res.status(200).json({ 
        success: false, 
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });
  
  // Add a GET endpoint for checking webhook status
  apiRouter.get('/webhooks/evia', async (req, res) => {
    res.status(200).json({
      status: 'active',
      message: 'Evia Sign webhook endpoint is active and ready to receive events',
      timestamp: new Date().toISOString(),
      endpoints: {
        post: '/api/webhooks/evia',
        supportedEvents: [
          { id: 1, name: 'SignRequestReceived' },
          { id: 2, name: 'SignatoryCompleted' },
          { id: 3, name: 'RequestCompleted' }
        ]
      }
    });
  });
  
  // Mount the API router before Vite middleware
  app.use('/api', apiRouter);
  
  // Vite dev server for frontend
  const vite = await createViteServer({
    server: { middlewareMode: true }
  });
  app.use(vite.middlewares);
  
  // Start server
  const port = process.env.PORT || 5174;
  app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
    console.log(`Webhook endpoint: http://localhost:${port}/api/webhooks/evia`);
  });
}

createServer(); 