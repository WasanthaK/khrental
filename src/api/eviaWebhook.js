import { handleSignatureWebhook } from '../services/eviaSignService';

// This is pseudocode - adapt to your specific backend framework
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  try {
    // Optional: Add authentication for the webhook
    // const authHeader = req.headers.authorization;
    // if (!authHeader || authHeader !== `Bearer ${process.env.WEBHOOK_SECRET}`) {
    //   return res.status(401).json({ error: 'Unauthorized' });
    // }
    
    const result = await handleSignatureWebhook(req.body);
    
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }
    
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Webhook handler error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
} 