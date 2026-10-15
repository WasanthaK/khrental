import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { BellIcon, ArrowPathIcon, CheckCircleIcon } from '@heroicons/react/24/outline';
import { useAuth } from '../hooks/useAuth';
import { getUserNotifications, markNotificationAsRead } from '../services/notificationService';

const MAINTENANCE_EVENT_LABELS = Object.freeze({
  request_created: 'New maintenance request',
  request_assigned: 'Maintenance request assigned',
  work_started: 'Maintenance work started',
  work_completed: 'Maintenance work completed',
  request_cancelled: 'Maintenance request cancelled'
});

const describeNotification = (message, portal) => {
  const match = /^Maintenance (request_created|request_assigned|work_started|work_completed|request_cancelled): request ([0-9a-f-]{36})$/i.exec(
    String(message || '')
  );
  if (!match) return { title: 'Notification', detail: String(message || ''), requestId: null, link: null };
  const requestId = match[2].toLowerCase();
  return {
    title: MAINTENANCE_EVENT_LABELS[match[1].toLowerCase()] || 'Maintenance update',
    detail: 'Request #' + requestId.slice(0, 8),
    requestId,
    // This is a locator only. The destination route enforces tenant and
    // maintenance ownership; a notification never grants resource access.
    link: portal === 'rentee'
      ? '/rentee/maintenance/' + requestId
      : '/dashboard/maintenance/' + requestId
  };
};

const Notifications = ({ portal = 'dashboard' }) => {
  const { activeTenantId } = useAuth();
  const requestSerial = useRef(0);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [markingId, setMarkingId] = useState(null);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    const current = ++requestSerial.current;
    setLoading(true);
    setError('');
    try {
      const response = await getUserNotifications();
      if (current !== requestSerial.current) return;
      if (!response.success || !Array.isArray(response.data)) {
        throw new Error(response.error || 'Unable to load notifications.');
      }
      setItems(response.data);
    } catch (cause) {
      if (current !== requestSerial.current) return;
      setItems([]);
      setError(cause.message || 'Unable to load notifications.');
    } finally {
      if (current === requestSerial.current) setLoading(false);
    }
  }, [activeTenantId]);

  useEffect(() => {
    // Clear the previous organization's list immediately on a tenant switch.
    setItems([]);
    setMarkingId(null);
    refresh();
    return () => { requestSerial.current += 1; };
  }, [refresh]);

  const markRead = async notification => {
    if (!notification?.id || markingId) return;
    const current = requestSerial.current;
    setMarkingId(notification.id);
    setError('');
    try {
      const response = await markNotificationAsRead(notification.id);
      if (!response.success || !response.data?.[0]?.id) {
        throw new Error(response.error || 'Unable to mark the notification as read.');
      }
      if (current !== requestSerial.current) return;
      setItems(existing => existing.map(item =>
        item.id === notification.id ? { ...item, is_read: true } : item
      ));
    } catch (cause) {
      if (current === requestSerial.current) {
        setError(cause.message || 'Unable to mark the notification as read.');
      }
    } finally {
      if (current === requestSerial.current) setMarkingId(null);
    }
  };

  const unread = items.filter(item => !item.is_read).length;

  return (
    <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6" aria-label="Notifications">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
            <BellIcon className="h-7 w-7" aria-hidden="true" />
            Notifications
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Updates for your current organization. {unread} unread.
          </p>
        </div>
        <button type="button" onClick={refresh} disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 disabled:opacity-50">
          <ArrowPathIcon className="h-4 w-4" aria-hidden="true" /> Refresh
        </button>
      </div>
      {error && <p role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {loading ? (
        <p role="status" className="rounded-xl bg-white p-6 text-slate-600">Loading notifications…</p>
      ) : items.length === 0 && !error ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
          <BellIcon className="mx-auto mb-3 h-9 w-9 text-slate-400" aria-hidden="true" />
          <p className="font-medium text-slate-800">No notifications yet</p>
          <p className="mt-1 text-sm text-slate-600">Maintenance updates will appear here.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map(notification => {
            const parsed = describeNotification(notification.message, portal);
            const read = Boolean(notification.is_read);
            return (
              <article key={notification.id} data-notification-id={notification.id}
                data-request-id={parsed.requestId || undefined}
                className={'rounded-xl border p-4 shadow-sm ' +
                  (read ? 'border-slate-200 bg-white' : 'border-blue-200 bg-blue-50')}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-slate-900">{parsed.title}</p>
                      {!read && <span className="rounded-full bg-blue-700 px-2 py-0.5 text-xs font-medium text-white">Unread</span>}
                    </div>
                    <p className="mt-1 break-words text-sm text-slate-600">{parsed.detail}</p>
                    {notification.createdat && (
                      <p className="mt-2 text-xs text-slate-500">
                        {new Date(notification.createdat).toLocaleString()}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {parsed.link && (
                      <Link to={parsed.link} className="rounded-lg px-3 py-2 text-sm font-medium text-blue-800 underline">
                        View request
                      </Link>
                    )}
                    {read ? (
                      <span className="flex items-center gap-1 text-xs text-slate-500">
                        <CheckCircleIcon className="h-4 w-4" aria-hidden="true" /> Read
                      </span>
                    ) : (
                      <button type="button" onClick={() => markRead(notification)}
                        aria-label={'Mark notification ' + notification.id + ' as read'}
                        disabled={Boolean(markingId)} className="rounded-lg border border-blue-300 bg-white px-3 py-2 text-sm font-medium text-blue-800 disabled:opacity-50">
                        {markingId === notification.id ? 'Saving…' : 'Mark as read'}
                      </button>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </main>
  );
};

export default Notifications;
