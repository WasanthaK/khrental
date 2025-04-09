import { handleEviaSignWebhook } from '../webhooks';

/**
 * Route handler for webhook requests
 * @param {Request} req - The request object
 * @returns {Promise<Response>} - The response object
 */
export async function POST(req) {
  // Extract the webhook type from the URL
  const url = new URL(req.url);
  const webhookType = url.pathname.split('/').pop();

  switch (webhookType) {
    case 'evia-sign':
      return handleEviaSignWebhook(req);
    default:
      return new Response(`Unsupported webhook type: ${webhookType}`, {
        status: 400
      });
  }
} 