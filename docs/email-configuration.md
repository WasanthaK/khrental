# Email Configuration Guide

## Environment Variables

For emails to work correctly in both development and production environments, configure the following environment variables:

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `VITE_APP_BASE_URL` | The base URL of your application | `https://khrentals.kubeira.com` |
| `VITE_EMAIL_FUNCTION_URL` | URL of the Azure Email Function | `https://your-app.azurewebsites.net/api/send-email` |
| `VITE_EMAIL_FROM` | The email address to send from | `noreply@example.com` |
| `VITE_EMAIL_FROM_NAME` | The display name for emails | `KH Rentals` |

### Optional Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `VITE_EMAIL_FUNCTION_KEY` | Function key for the Azure Function (if auth is enabled) | `abcd1234...` |
| `VITE_SENDGRID_API_KEY` | Your SendGrid API key (only needed for local testing) | `SG.xxxxxxxxxxxx...` |

## Azure Function Setup

The application now uses an Azure Function to handle email sending, which solves CORS issues and improves security by keeping API keys off the client.

### Deploying the Azure Function

1. Navigate to the Azure Portal
2. Create a new Function App:
   - Go to "Create a resource" > "Compute" > "Function App"
   - Set appropriate runtime settings (Node.js, your preferred version)
   - Choose your hosting plan (Consumption plan is typically sufficient)
   - Create the Function App

3. Deploy your function code:
   - Navigate to your new Function App
   - Go to "Functions" and create a new function
   - Choose "HTTP trigger" template
   - Upload the code from `azure-functions/SendGridEmailFunction/` 
   - Or use VS Code and the Azure Functions extension to deploy

4. Configure environment variables:
   - In your Function App, go to "Configuration" > "Application settings"
   - Add the following settings:
     - `SENDGRID_API_KEY`: Your SendGrid API key
     - `EMAIL_FROM`: Default sender email (e.g., noreply@khrentals.com)
     - `EMAIL_FROM_NAME`: Default sender name (e.g., KH Rentals)

5. Get your function URL:
   - In your Function App, go to your function
   - Click "Get Function URL"
   - This is the URL you'll use for the `VITE_EMAIL_FUNCTION_URL` environment variable

### Authentication

You have two options for securing your Azure Function:

#### Option 1: Function Key (Recommended)

1. In your Function App, select your function
2. Go to "Function Keys" tab
3. Copy the default key or create a new key
4. Set this key as `VITE_EMAIL_FUNCTION_KEY` in your application settings

#### Option 2: IP Restrictions

1. In your Function App, go to "Networking"
2. Configure IP restrictions to only allow access from your application servers

## Main Application Configuration

After setting up the Azure Function, configure your main application:

1. In your Azure App Service for the main application:
   - Go to "Configuration" > "Application settings"
   - Add the required environment variables listed above
   - Save the settings and restart the application

2. For local development:
   - Add the variables to your `.env` file:
   ```
   VITE_APP_BASE_URL=http://localhost:5174
   VITE_EMAIL_FUNCTION_URL=https://your-function-app.azurewebsites.net/api/send-email
   VITE_EMAIL_FUNCTION_KEY=your-function-key
   VITE_EMAIL_FROM=noreply@khrentals.com
   VITE_EMAIL_FROM_NAME=KH Rentals
   ```

## Testing the Email Function

To test your email configuration:

1. Make sure your function is deployed and environment variables are set
2. Try sending an invitation through the application UI
3. Monitor the Azure Function logs for any errors:
   - In Azure Portal, go to your Function App
   - Select your function
   - Click on "Monitor" to see execution logs

### Testing the Function Directly

You can also test the function directly using tools like Postman:

```json
POST https://your-function-app.azurewebsites.net/api/send-email?code=your-function-key

{
  "to": "test@example.com",
  "subject": "Test Email",
  "html": "<p>This is a test email from Azure Function</p>",
  "from": "noreply@khrentals.com",
  "fromName": "KH Rentals"
}
```

## Deployment Configuration

### Azure

For Azure deployments, add these variables to your Application Settings:

1. Go to Azure Portal > App Services > Your App > Configuration
2. Add each environment variable under Application Settings
3. Make sure to restart the app after adding or changing settings

### Setting Up a CORS Proxy for Production

In production, you'll need a proper backend API or CORS proxy to handle SendGrid API calls:

#### Option 1: Azure Function

Create an Azure Function with a SendGrid binding to handle email sending:

```javascript
// Example Azure Function
module.exports = async function (context, req) {
    const { to, from, subject, html, text } = req.body;
    
    if (!to || !subject || !(html || text)) {
        context.res = {
            status: 400,
            body: "Missing required fields"
        };
        return;
    }
    
    context.bindings.message = {
        to,
        from: from || "noreply@khrentals.com",
        subject,
        content: [{
            type: "text/html",
            value: html || text
        }]
    };
    
    context.res = {
        status: 200,
        body: "Email sent successfully"
    };
};
```

#### Option 2: Simple Express Server

Deploy a simple Express server with CORS enabled to handle email sending:

```javascript
const express = require('express');
const cors = require('cors');
const sgMail = require('@sendgrid/mail');
const app = express();

app.use(cors());
app.use(express.json());

// Set SendGrid API Key
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

app.post('/api/send-email', async (req, res) => {
    try {
        const { to, subject, html, text } = req.body;
        
        if (!to || !subject || !(html || text)) {
            return res.status(400).json({ error: 'Missing required fields' });
        }
        
        const msg = {
            to,
            from: process.env.EMAIL_FROM || 'noreply@khrentals.com',
            subject,
            html: html || '',
            text: text || ''
        };
        
        await sgMail.send(msg);
        res.status(200).json({ success: true });
    } catch (error) {
        console.error('Email error:', error);
        res.status(500).json({ error: error.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
```

## Testing Configuration

To test your email configuration:

1. Add these variables to your `.env` file for local development
2. Verify the email service connects properly in the browser console
3. Test sending an invitation to ensure links are correctly formatted
4. Check that the recipient receives the email with working links 