const getSendGridApiKey = () => process.env.TWILIO_SENDGRID_API_KEY || process.env.SENDGRID_API_KEY || '';

const getDefaultSender = () => ({
  email: process.env.EMAIL_FROM || process.env.DEFAULT_FROM_EMAIL || process.env.VITE_EMAIL_FROM || 'noreply@khrentals.com',
  name: process.env.EMAIL_FROM_NAME || process.env.DEFAULT_FROM_NAME || process.env.VITE_EMAIL_FROM_NAME || 'KH Rentals'
});

export const getBillingReminderPortalUrl = () => {
  const baseUrl = process.env.PUBLIC_APP_URL || process.env.VITE_APP_BASE_URL || process.env.PASSWORD_RESET_BASE_URL || '';
  if (!baseUrl) return null;
  return `${String(baseUrl).replace(/\/$/, '')}/rentee/invoices`;
};

export const sendBillingReminderEmail = async ({ to, subject, text, html }) => {
  const apiKey = getSendGridApiKey();
  if (!apiKey) {
    const error = new Error('Email delivery is not configured. TWILIO_SENDGRID_API_KEY is missing on the server.');
    error.status = 503;
    error.code = 'EMAIL_NOT_CONFIGURED';
    throw error;
  }

  const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: getDefaultSender(),
      subject,
      content: [
        ...(text ? [{ type: 'text/plain', value: text }] : []),
        ...(html ? [{ type: 'text/html', value: html }] : [])
      ]
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    const error = new Error(errorText || `SendGrid request failed with status ${response.status}`);
    error.status = 502;
    error.code = 'REMINDER_DELIVERY_FAILED';
    throw error;
  }

  return {
    provider: 'twilio-sendgrid',
    accepted: true
  };
};
