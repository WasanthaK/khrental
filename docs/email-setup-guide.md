# Email Setup Guide for KH Rentals

This document provides step-by-step instructions for setting up email functionality in the KH Rentals application.

## Overview

KH Rentals uses a multi-layered approach for sending emails:

1. **Primary Method**: SendGrid API for direct email sending
2. **Secondary Method**: Supabase Auth SMTP for authentication-related emails
3. **Fallback Method**: EmailJS for client-side email sending when other methods fail

## Prerequisites

- A SendGrid account with API key
- (Optional) An EmailJS account for fallback email support
- Access to the Supabase project dashboard

## Setting Up SendGrid

1. **Create a SendGrid Account**:
   - Visit [SendGrid](https://sendgrid.com/) and create an account
   - Verify your account and domain

2. **Create an API Key**:
   - Navigate to Settings → API Keys
   - Create a new API key with "Mail Send" permissions
   - Copy the API key for use in your environment variables

3. **Verify a Sender Identity**:
   - Go to Settings → Sender Authentication
   - Set up either Domain Authentication or Single Sender Verification
   - This establishes your "From" email address

## Environment Variables Configuration

Create a `.env.local` file for local development or configure these in your hosting environment:

```
# SendGrid Configuration
VITE_SENDGRID_API_KEY=your-sendgrid-api-key
VITE_EMAIL_FROM=noreply@yourdomain.com
VITE_EMAIL_FROM_NAME=KH Rentals

# EmailJS Configuration (Fallback)
VITE_EMAILJS_USER_ID=your-emailjs-user-id
VITE_EMAILJS_SERVICE_ID=your-emailjs-service-id
VITE_EMAILJS_TEMPLATE_ID=your-emailjs-template-id
```

## Configuring Supabase SMTP (Optional but Recommended)

For improved delivery of authentication emails (magic links, password resets):

1. **Access Supabase Dashboard**:
   - Log in to your Supabase project

2. **Configure SMTP Settings**:
   - Navigate to Authentication → Email Templates
   - Click "Email Settings"
   - Enter your SMTP credentials (you can use SendGrid's SMTP service)
   - Test the configuration

3. **Customize Email Templates**:
   - Stay in the Email Templates section
   - Customize the templates for Magic Link, Confirmation, and Invite

## Setting Up EmailJS (Fallback Method)

1. **Create an EmailJS Account**:
   - Visit [EmailJS](https://www.emailjs.com/) and sign up

2. **Create a Service**:
   - Connect to an email service (Gmail, Outlook, etc.)
   - Note the Service ID

3. **Create an Email Template**:
   - Create a new template with variables:
     - `to_email`: Recipient's email
     - `to_name`: Recipient's name
     - `subject`: Email subject
     - `message`: Email content (HTML)
   - Note the Template ID

4. **Get Your User ID**:
   - Find your User ID in the EmailJS dashboard
   - Add it to your environment variables

## Testing Your Email Configuration

1. **Test All Email Methods**:
   - Run the application locally
   - Try inviting a new user (tests Supabase + fallback methods)
   - Test a direct notification (tests SendGrid API)

2. **Check Email Logs**:
   - Monitor your browser console for email-related logs
   - Check SendGrid dashboard for delivery statistics
   - Check EmailJS dashboard for fallback email usage

## Troubleshooting

### Common Issues:

1. **Emails Not Sending**:
   - Check API key permissions in SendGrid
   - Verify sender authentication is complete
   - Check browser console for errors

2. **Emails Going to Spam**:
   - Complete domain authentication in SendGrid
   - Ensure proper SPF and DKIM setup
   - Use a consistent "From" address

3. **Magic Links Not Working**:
   - Verify Supabase SMTP configuration
   - Check redirectTo URLs for proper formatting
   - Ensure site URLs are correctly set in Supabase dashboard

## Implementation Details

The email system has several components:

- `directEmailService.js`: Main service handling direct email sending via SendGrid
- `notificationService.js`: Higher-level service for application notifications
- `invitation.js`: Handles user invitations with magic links

For developers, the main functions to use are:

```javascript
// For general notifications
import { sendEmailNotification } from './services/notificationService';
await sendEmailNotification(email, subject, htmlContent, plainTextContent);

// For user invitations
import { inviteTeamMember, inviteRentee } from './services/invitation';
await inviteTeamMember(email, name, role);
```

## Monitoring and Logging

Email operations are logged to the console for debugging. In production, consider implementing:

- Log collection via Sentry or similar service
- Email success/failure metrics in your dashboard
- Retry mechanisms for failed emails

## Security Considerations

- Never expose your SendGrid API key in client-side code
- Use environment variables for all sensitive information
- Set appropriate CORS settings for EmailJS (if used)
- Consider rate limiting email-sending operations to prevent abuse 