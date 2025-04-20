# KH Rentals - Email Setup Guide

This guide explains how to set up email sending for KH Rentals using Supabase Authentication.

## Approach

Our application uses Supabase Auth for user management, which handles the email sending process securely. This approach:

1. Keeps API keys and credentials secure on the server side
2. Uses standard Supabase auth flows that are well-tested
3. Provides consistent user experiences for registration, login, and password resets

## Setting Up Email in Supabase

To enable email sending for invitations, password resets, and other auth-related emails:

1. Log in to your Supabase dashboard at https://app.supabase.com
2. Select your KH Rentals project
3. Navigate to **Authentication** → **Email Templates**
4. Customize the email templates for:
   - Confirmation emails
   - Invitation emails
   - Magic link emails
   - Password reset emails
5. Navigate to **Authentication** → **Email Settings**
6. Set up SMTP credentials:
   - **SMTP Host**: (from your email provider, e.g., `smtp.sendgrid.net` for SendGrid)
   - **SMTP Port**: Usually 587 for TLS
   - **SMTP Username**: (from your email provider)
   - **SMTP Password**: (from your email provider)
   - **Sender Email**: The email address emails will be sent from (e.g., `no-reply@khrentals.com`)
   - **Sender Name**: The name that will appear (e.g., `KH Rentals`)

## SendGrid SMTP Setup

If using SendGrid as your email provider:

1. Create an account on [SendGrid](https://sendgrid.com/)
2. Create an API key with "Mail Send" permissions
3. Use the following settings in Supabase:
   - **SMTP Host**: `smtp.sendgrid.net`
   - **SMTP Port**: `587`
   - **SMTP Username**: `apikey`
   - **SMTP Password**: Your SendGrid API key
   - **Sender Email**: A verified email in your SendGrid account
   - **Sender Name**: KH Rentals

## Testing

After setup:

1. Go to the Admin Dashboard
2. Try sending an invitation to a test user
3. Check that the email is received properly
4. Test password reset functionality

## Troubleshooting

If emails aren't being sent:

1. Check that SMTP credentials are correct in Supabase
2. Verify that the sender email is authorized by your email provider
3. Look for error messages in the Supabase logs (Authentication → Logs)
4. Test using the "Send Test Email" feature in Supabase Email settings

## Contact

If you encounter any issues with the email setup, please contact the development team. 