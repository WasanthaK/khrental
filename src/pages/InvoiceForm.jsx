import { Navigate } from 'react-router-dom';

/**
 * Legacy invoice creation routes now converge on the tenancy-aware monthly
 * billing workflow. Monthly rent, utilities and future traceable adjustments
 * must be issued against the authoritative active agreement rather than a
 * free-form property/rentee pairing.
 */
const InvoiceForm = () => (
  <Navigate to="/dashboard/invoices/batch-generate" replace />
);

export default InvoiceForm;
