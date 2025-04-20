/**
 * KH Rentals Email Service API
 * 
 * A secure backend service for sending emails via SendGrid.
 * This keeps your API keys secure on the server side.
 */

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { SENDGRID_API_KEY, API_KEY, ALLOWED_ORIGINS, PORT } = process.env;
const sgMail = require('@sendgrid/mail');

// Initialize Express app
const app = express();

// Configure SendGrid with API key
if (SENDGRID_API_KEY) {
  sgMail.setApiKey(SENDGRID_API_KEY);
} else {
  console.error('SENDGRID_API_KEY is not set. Emails will not be sent.');
}

// Middleware setup
app.use(bodyParser.json());

// Configure CORS - only allow requests from your frontend
const corsOptions = {
  origin: function(origin, callback) {
    // Allow requests with no origin (like mobile apps, curl, etc)
    if (!origin) return callback(null, true);
    
    // Parse allowed origins from env var or use default
    const allowedOrigins = ALLOWED_ORIGINS ? ALLOWED_ORIGINS.split(',') : ['http://localhost:3000'];
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['POST'],
  credentials: true
};

app.use(cors(corsOptions));

// API key authentication middleware
const authenticateApiKey = (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  
  if (!API_KEY) {
    console.warn('API_KEY environment variable not set - authentication disabled');
    return next();
  }
  
  if (!apiKey || apiKey !== API_KEY) {
    return res.status(401).json({ 
      success: false, 
      error: 'Unauthorized - invalid API key' 
    });
  }
  
  next();
};

// Email sending endpoint
app.post('/api/send-email', authenticateApiKey, async (req, res) => {
  try {
    const { to, subject, html, text, from, fromName } = req.body;
    
    // Validate required fields
    if (!to || !subject || (!html && !text)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required fields: to, subject, and either html or text content' 
      });
    }
    
    // If SendGrid API key is not set, simulate the email
    if (!SENDGRID_API_KEY) {
      console.log('SIMULATING EMAIL:', { to, subject, from });
      return res.status(200).json({
        success: true,
        simulated: true,
        message: 'Email simulated - SENDGRID_API_KEY not configured'
      });
    }
    
    // Prepare email message
    const msg = {
      to,
      subject,
      from: {
        email: from || process.env.DEFAULT_FROM_EMAIL || 'noreply@khrentals.com',
        name: fromName || process.env.DEFAULT_FROM_NAME || 'KH Rentals'
      }
    };
    
    // Add content based on what was provided
    if (html) {
      msg.html = html;
    }
    if (text) {
      msg.text = text;
    }
    
    // Send the email
    const result = await sgMail.send(msg);
    
    // Log success
    console.log(`Email sent successfully to ${to}`);
    
    // Return success response
    return res.status(200).json({
      success: true,
      message: 'Email sent successfully',
      to,
      subject,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    // Log the error
    console.error('Error sending email:', error);
    
    // Return error response
    return res.status(500).json({
      success: false,
      error: error.message || 'An error occurred while sending the email',
      timestamp: new Date().toISOString()
    });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({ 
    status: 'ok',
    service: 'kh-rentals-email-service',
    timestamp: new Date().toISOString()
  });
});

// Start the server
const port = PORT || 3001;
app.listen(port, () => {
  console.log(`Email service running on port ${port}`);
});

module.exports = app; // Export for testing or serverless functions 