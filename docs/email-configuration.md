# Email Configuration

The application uses email for:
1. User invitations
2. Password reset links
3. Notification emails

## Environment Variables

Configure these in your `.env` file (for development) and in your hosting environment:

| Variable | Description | Example |
|----------|-------------|---------|
| `VITE_SENDGRID_API_KEY` | SendGrid API key | `SG.abc123...` |
| `VITE_EMAIL_FROM` | Sender email address | `noreply@yourcompany.com` |
| `VITE_EMAIL_FROM_NAME` | Sender name | `KH Rentals` |
| `VITE_APP_BASE_URL` | Base URL for links in emails | `https://app.example.com` |

## Email Sending Approach

The application uses Supabase's built-in email functionality for authentication-related emails, including:
- Password reset emails
- Email verification
- Magic link authentication

For these emails, Supabase handles all delivery automatically.

In development mode, emails are simulated rather than actually sent. You'll see logs in the console showing what emails would be sent in production.

### Setting Up Supabase Email

1. Log in to your Supabase dashboard
2. Go to Authentication → Email Templates
3. Customize the templates as needed for your application
4. Verify your sending domain if needed

### Testing Email Functionality

Use the built-in email diagnostic page:

```
/diagnostics/email
```

You can run tests to verify your email configuration is working correctly.

## Debugging Email Issues

If emails aren't being sent correctly:

1. Check the browser console for error messages
2. Verify your environment variables are set correctly
3. Use the email diagnostic page to test your configuration
4. Check Supabase logs for any delivery issues

## Email Templates

The application uses simple HTML templates for various email types. These are defined in the application code.

```json
{
  "to": "user@example.com",
  "subject": "Welcome to KH Rentals",
  "html": "<p>This is a test email from the application</p>",
  "text": "This is a test email from the application"
}
```

## Alternative Approaches

### Custom Email Implementation

If you need more control over email sending, you can implement a custom solution:

1. Deploy a server-side API endpoint for email sending
2. Use a service like SendGrid, Mailgun, or AWS SES directly
3. Update the `directEmailService.js` file to use your custom implementation 