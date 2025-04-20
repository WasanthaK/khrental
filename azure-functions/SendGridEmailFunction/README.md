# SendGrid Email Azure Function

This Azure Function handles email sending for the KH Rentals application using SendGrid.

## Overview

This function provides a secure way to send emails from the frontend without exposing API keys in the client-side code. It requires:

1. A SendGrid account and API key
2. An Azure Function App

## Configuration

Set the following Application Settings in your Azure Function App:

- `SENDGRID_API_KEY`: Your SendGrid API key
- `EMAIL_FROM` (optional): Default sender email address
- `EMAIL_FROM_NAME` (optional): Default sender name

## API Usage

### Endpoint

```
POST /api/send-email
```

### Request Body

```json
{
  "to": "recipient@example.com",
  "subject": "Email subject",
  "html": "<p>HTML content</p>",
  "text": "Plain text content (optional)",
  "from": "sender@example.com (optional)",
  "fromName": "Sender Name (optional)",
  "attachments": [] 
}
```

### Response

Success (200 OK):
```json
{
  "success": true,
  "message": "Email sent successfully",
  "to": "recipient@example.com",
  "subject": "Email subject",
  "timestamp": "2023-05-01T12:34:56.789Z"
}
```

Error (400 Bad Request or 500 Internal Server Error):
```json
{
  "success": false,
  "error": "Error message",
  "timestamp": "2023-05-01T12:34:56.789Z"
}
```

## Local Development

To run this function locally:

1. Install the Azure Functions Core Tools
2. Create a `local.settings.json` file:
```json
{
  "IsEncrypted": false,
  "Values": {
    "FUNCTIONS_WORKER_RUNTIME": "node",
    "SENDGRID_API_KEY": "your-sendgrid-api-key",
    "EMAIL_FROM": "noreply@khrentals.com",
    "EMAIL_FROM_NAME": "KH Rentals"
  }
}
```
3. Run `npm install` to install dependencies
4. Run `func start` to start the function locally

## Deployment

Deploy this function to Azure using:

- Azure Portal
- Azure Functions Core Tools
- Visual Studio Code with Azure Functions extension
- Azure CLI

## Security Considerations

- Always use HTTPS for production deployments
- Consider implementing IP restrictions to limit access to your function
- Use function-level authentication (Auth Level: Function) for basic security
- For production, implement a robust authentication mechanism

## Troubleshooting

If emails are not being sent properly:

1. Check Azure Function Logs
2. Verify SendGrid API key is correctly set
3. Ensure all required fields are present in requests
4. Check SendGrid Activity dashboard for delivery issues 