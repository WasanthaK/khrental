import { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../services/supabaseClient';

// Create context
export const WebhookContext = createContext();

// Custom hook to use the webhook context
export const useWebhook = () => useContext(WebhookContext);

// Table name for storing webhook events
const WEBHOOK_TABLE = 'webhook_events';

export const WebhookProvider = ({ children }) => {
  const [webhookEvents, setWebhookEvents] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  // Load webhook events on mount
  useEffect(() => {
    loadWebhookEvents();
    
    // Set up real-time subscription for new webhook events
    const subscription = supabase
      .channel('webhook_events_channel')
      .on('postgres_changes', { 
        event: 'INSERT', 
        schema: 'public', 
        table: 'webhook_events' 
      }, (payload) => {
        setWebhookEvents(prev => [payload.new, ...prev]);
      })
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // Load webhook events from Supabase
  const loadWebhookEvents = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const { data, error } = await supabase
        .from(WEBHOOK_TABLE)
        .select('*')
        .order('createdat', { ascending: false })
        .limit(50);

      if (error) {
        throw error;
      }

      setWebhookEvents(data || []);
    } catch (error) {
      console.error('Error loading webhook events:', error);
      setError(error.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Store a new webhook event
  const storeWebhookEvent = async (event) => {
    try {
      const { data, error } = await supabase
        .from(WEBHOOK_TABLE)
        .insert([{
          event_type: event.EventDescription || 'unknown',
          request_id: event.RequestId || null,
          user_name: event.UserName || null,
          user_email: event.Email || null,
          subject: event.Subject || null,
          event_id: event.EventId || null,
          event_time: event.EventTime || new Date().toISOString(),
          raw_data: event
        }])
        .select();

      if (error) {
        throw error;
      }
      
      return { success: true, data };
    } catch (error) {
      console.error('Error storing webhook event:', error);
      return { success: false, error: error.message };
    }
  };

  // Clear webhook events
  const clearWebhookEvents = async () => {
    try {
      setIsLoading(true);
      
      // Delete all webhook events
      const { error } = await supabase
        .from(WEBHOOK_TABLE)
        .delete()
        .neq('id', 'placeholder'); // Delete all rows
      
      if (error) {
        throw error;
      }
      
      setWebhookEvents([]);
      return { success: true };
    } catch (error) {
      console.error('Error clearing webhook events:', error);
      setError(error.message);
      return { success: false, error: error.message };
    } finally {
      setIsLoading(false);
    }
  };

  // Context value
  const value = {
    webhookEvents,
    isLoading,
    error,
    storeWebhookEvent,
    loadWebhookEvents,
    clearWebhookEvents
  };

  return (
    <WebhookContext.Provider value={value}>
      {children}
    </WebhookContext.Provider>
  );
};

export default WebhookProvider; 