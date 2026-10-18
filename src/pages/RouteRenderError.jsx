import { isRouteErrorResponse, Link, useRouteError } from 'react-router-dom';
import NotFound from './NotFound';

// A matched route that throws while loading/rendering isn't a missing URL.
// Preserve the old not-found UI for genuine unmatched/missing routes.
export default function RouteRenderError() {
  const error = useRouteError();
  if (isRouteErrorResponse(error) && error.status === 404) {
    return <NotFound />;
  }
  if (isRouteErrorResponse(error) && error.status < 500 && error.status !== 404) {
    return <div role="alert" className="m-6 rounded border border-amber-200 bg-amber-50 p-6">
      <h1 className="text-lg font-semibold">Unable to open this page</h1>
      <p>We could not complete this request.</p>
      <Link to="/dashboard/properties" className="text-blue-600 underline">Back to properties</Link>
    </div>;
  }
  // Avoid exposing error internals, tenant data or stack traces to browsers.
  if (import.meta.env.DEV) console.error('Route rendering failure', error);
  return <div role="alert" className="m-6 rounded border border-red-200 bg-red-50 p-6">
    <h1 className="text-lg font-semibold">We could not display this page</h1>
    <p>Your records were not changed. Please return to Properties and try again.</p>
    <Link to="/dashboard/properties" className="text-blue-600 underline">Back to properties</Link>
  </div>;
}
