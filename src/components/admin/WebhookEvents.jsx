import React, { useState, useEffect } from 'react';
import { useWebhook } from '../../contexts/WebhookContext';
import { toast } from 'react-toastify';

const WebhookEvents = () => {
  const { webhookEvents, isLoading, error, loadWebhookEvents, clearWebhookEvents } = useWebhook();
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    loadWebhookEvents();
  }, [loadWebhookEvents]);

  const handleClearEvents = async () => {
    if (window.confirm('Are you sure you want to clear all webhook events? This action cannot be undone.')) {
      const result = await clearWebhookEvents();
      if (result.success) {
        toast.success('Webhook events cleared successfully');
      } else {
        toast.error(`Failed to clear webhook events: ${result.error}`);
      }
    }
  };

  const formatJson = (json) => {
    try {
      return JSON.stringify(json, null, 2);
    } catch (e) {
      return 'Invalid JSON';
    }
  };

  const handleRefresh = () => {
    loadWebhookEvents();
    toast.info('Webhook events refreshed');
  };

  // Filter events by type
  const filteredEvents = filter === 'all' 
    ? webhookEvents 
    : webhookEvents.filter(event => event.event_type === filter);

  return (
    <div className="bg-white rounded-lg shadow">
      <div className="p-4 border-b border-gray-200">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-medium">Webhook Events</h2>
          <div className="flex space-x-2">
            <button
              onClick={handleRefresh}
              disabled={isLoading}
              className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {isLoading ? 'Loading...' : 'Refresh'}
            </button>
            <button
              onClick={handleClearEvents}
              disabled={isLoading || webhookEvents.length === 0}
              className="px-3 py-1 bg-red-600 text-white text-sm rounded hover:bg-red-700 disabled:opacity-50"
            >
              Clear All
            </button>
          </div>
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">Filter by Event Type:</label>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
          >
            <option value="all">All Events</option>
            <option value="SignRequestReceived">Sign Request Received</option>
            <option value="SignatoryCompleted">Signatory Completed</option>
            <option value="RequestCompleted">Request Completed</option>
          </select>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 text-red-700">{error}</div>
      )}

      <div className="p-4">
        {isLoading ? (
          <div className="text-center py-4">Loading webhook events...</div>
        ) : filteredEvents.length === 0 ? (
          <div className="text-center py-4 text-gray-500">No webhook events found</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-1 border-r pr-4">
              <h3 className="font-medium mb-2">Event List</h3>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {filteredEvents.map((event) => (
                  <div
                    key={event.id}
                    onClick={() => setSelectedEvent(event)}
                    className={`p-3 rounded border cursor-pointer ${
                      selectedEvent?.id === event.id
                        ? 'bg-blue-50 border-blue-300'
                        : 'hover:bg-gray-50 border-gray-200'
                    }`}
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <span className={`inline-block px-2 py-1 text-xs rounded mb-1 ${
                          event.event_type === 'SignRequestReceived' ? 'bg-blue-100 text-blue-800' :
                          event.event_type === 'SignatoryCompleted' ? 'bg-green-100 text-green-800' :
                          event.event_type === 'RequestCompleted' ? 'bg-purple-100 text-purple-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {event.event_type}
                        </span>
                        <div className="text-sm font-medium">{event.subject || 'No Subject'}</div>
                        <div className="text-xs text-gray-500">{event.request_id}</div>
                      </div>
                      <div className="text-xs text-gray-400">
                        {new Date(event.event_time).toLocaleString()}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            
            <div className="md:col-span-2">
              <h3 className="font-medium mb-2">Event Details</h3>
              {selectedEvent ? (
                <div>
                  <div className="mb-4 grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs text-gray-500">Event Type</label>
                      <div>{selectedEvent.event_type}</div>
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">Event Time</label>
                      <div>{new Date(selectedEvent.event_time).toLocaleString()}</div>
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">Request ID</label>
                      <div className="truncate">{selectedEvent.request_id}</div>
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">User</label>
                      <div>{selectedEvent.user_name} ({selectedEvent.user_email})</div>
                    </div>
                  </div>

                  <div>
                    <label className="text-xs text-gray-500">Raw Payload</label>
                    <pre className="mt-1 p-4 bg-gray-50 rounded text-xs overflow-auto max-h-96">
                      {formatJson(selectedEvent.raw_data)}
                    </pre>
                  </div>
                </div>
              ) : (
                <div className="text-center py-12 text-gray-500">
                  Select an event to view details
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default WebhookEvents; 