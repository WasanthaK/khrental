import React, { useState } from 'react';
import { toast } from 'react-toastify';

const WebhookTester = () => {
  const [webhookUrl, setWebhookUrl] = useState('');
  const [webhookEvents, setWebhookEvents] = useState([]);
  const [pollInterval, setPollInterval] = useState(5);
  const [isPulling, setIsPulling] = useState(false);
  const [intervalId, setIntervalId] = useState(null);

  // For webhook.site
  const testWebhook = async () => {
    if (!webhookUrl) {
      toast.error('Please enter a webhook URL');
      return;
    }

    try {
      // Extract token from webhook.site URL
      const webhookToken = webhookUrl.split('/').pop();
      
      if (!webhookToken) {
        toast.error('Invalid webhook.site URL');
        return;
      }

      toast.info('Starting webhook monitoring...');
      setIsPulling(true);
      
      // Clear existing interval if any
      if (intervalId) {
        clearInterval(intervalId);
      }

      // Function to fetch webhook events
      const fetchEvents = async () => {
        try {
          const response = await fetch(`https://webhook.site/token/${webhookToken}/requests?sorting=newest`);
          
          if (!response.ok) {
            throw new Error('Failed to fetch webhook events');
          }
          
          const data = await response.json();
          setWebhookEvents(data.data || []);
        } catch (error) {
          console.error('Error fetching webhook events:', error);
        }
      };

      // Fetch immediately
      await fetchEvents();
      
      // Then set up interval
      const id = setInterval(fetchEvents, pollInterval * 1000);
      setIntervalId(id);
    } catch (error) {
      toast.error('Error: ' + error.message);
    }
  };

  const stopPolling = () => {
    if (intervalId) {
      clearInterval(intervalId);
      setIntervalId(null);
      setIsPulling(false);
      toast.info('Webhook monitoring stopped');
    }
  };

  // Format the JSON for display
  const formatJson = (json) => {
    try {
      if (typeof json === 'string') {
        return JSON.stringify(JSON.parse(json), null, 2);
      }
      return JSON.stringify(json, null, 2);
    } catch (e) {
      return json;
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6 bg-white rounded-lg shadow">
      <h2 className="text-2xl font-bold mb-6">Webhook Tester</h2>
      
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Webhook.site URL
        </label>
        <input
          type="url"
          value={webhookUrl}
          onChange={(e) => setWebhookUrl(e.target.value)}
          placeholder="https://webhook.site/your-token"
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
        />
        <p className="mt-1 text-sm text-gray-500">
          Create a webhook at <a href="https://webhook.site" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">webhook.site</a> and paste the URL here
        </p>
      </div>

      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Polling Interval (seconds)
        </label>
        <input
          type="number"
          value={pollInterval}
          onChange={(e) => setPollInterval(Math.max(1, parseInt(e.target.value) || 5))}
          min="1"
          className="mt-1 block w-32 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
        />
      </div>

      <div className="flex space-x-4 mb-6">
        <button
          onClick={testWebhook}
          disabled={isPulling || !webhookUrl}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50"
        >
          Start Monitoring
        </button>
        
        <button
          onClick={stopPolling}
          disabled={!isPulling}
          className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:opacity-50"
        >
          Stop Monitoring
        </button>
      </div>

      {/* Webhook events display */}
      <div className="mt-8">
        <h3 className="text-lg font-semibold mb-4">Webhook Events ({webhookEvents.length})</h3>
        
        {webhookEvents.length > 0 ? (
          <div className="space-y-4">
            {webhookEvents.map((event) => (
              <div key={event.uuid} className="border rounded-md p-4 bg-gray-50">
                <div className="flex justify-between mb-2">
                  <span className="font-medium">{new Date(event.created_at).toLocaleString()}</span>
                  <span className={`px-2 py-1 rounded text-xs ${
                    event.method === 'POST' ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'
                  }`}>
                    {event.method}
                  </span>
                </div>
                
                <div className="mb-2">
                  <strong>Headers:</strong>
                  <pre className="mt-1 p-2 bg-gray-100 rounded text-xs overflow-auto max-h-32">
                    {formatJson(event.headers)}
                  </pre>
                </div>
                
                <div>
                  <strong>Content:</strong>
                  <pre className="mt-1 p-2 bg-gray-100 rounded text-xs overflow-auto max-h-60">
                    {formatJson(event.content)}
                  </pre>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-500">No webhook events received yet</p>
        )}
      </div>
    </div>
  );
};

export default WebhookTester; 