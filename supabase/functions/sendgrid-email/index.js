// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

/**
 * This function sends emails using the SendGrid API
 * It requires a SENDGRID_API_KEY in the environment
 */
Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    });
  }
  
  try {
    // Get request details
    const { to, subject, html, text, from, fromName, attachments } = await req.json();
    
    // Validate inputs
    if (!to || !subject || (!html && !text)) {
      return new Response(
        JSON.stringify({ error: 'Missing required parameters (to, subject, and html or text)' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }
    
    // Get environment variables
    const sendgridApiKey = Deno.env.get('SENDGRID_API_KEY');
    const defaultFromEmail = Deno.env.get('EMAIL_FROM') || 'noreply@khrentals.com';
    const defaultFromName = Deno.env.get('EMAIL_FROM_NAME') || 'KH Rentals';
    
    if (!sendgridApiKey) {
      return new Response(
        JSON.stringify({ error: 'Server configuration error (missing SendGrid API key)' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }
    
    // Prepare the payload for SendGrid
    const payload = {
      personalizations: [
        {
          to: [{ email: to }],
          subject: subject,
        },
      ],
      from: {
        email: from || defaultFromEmail,
        name: fromName || defaultFromName,
      },
      content: [],
    };
    
    // Add HTML content if provided
    if (html) {
      payload.content.push({
        type: 'text/html',
        value: html,
      });
    }
    
    // Add plain text if provided
    if (text) {
      payload.content.push({
        type: 'text/plain',
        value: text,
      });
    }
    
    // Add attachments if any
    if (attachments && attachments.length > 0) {
      payload.attachments = attachments;
    }

    // Send the email via SendGrid API
    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${sendgridApiKey}`,
      },
      body: JSON.stringify(payload),
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: response.statusText }));
      console.error('SendGrid API error:', errorData);
      
      return new Response(
        JSON.stringify({ error: `SendGrid API error: ${errorData.message || response.statusText}` }),
        { status: response.status, headers: { 'Content-Type': 'application/json' } }
      );
    }
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Email sent successfully via SendGrid',
        service: 'sendgrid',
        timestamp: new Date().toISOString()
      }),
      { 
        status: 200, 
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*' 
        } 
      }
    );
  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}); 