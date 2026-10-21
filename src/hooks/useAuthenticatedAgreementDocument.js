import { useEffect, useState } from 'react';
import { buildRequestContextHeaders } from '../services/requestContext';
import { describeEviaAuditFetchFailure } from '../utils/eviaAuditFailure';

// Authenticated object bytes, rather than embedding the protected storage URL
// in an iframe that cannot attach the selected-tenant bearer headers.
// Object URLs exist only in this tab and are revoked on closure or tenant swap.
export const useAuthenticatedAgreementDocument = documentUrl => {
  const [state, setState] = useState({ status: 'idle', url: null, error: null });
  useEffect(() => {
    let cancelled = false;
    let temporaryUrl = null;
    if (!documentUrl) {
      setState({ status: 'idle', url: null, error: null });
      return undefined;
    }
    let file;
    try {
      const source = new URL(documentUrl, window.location.origin);
      if (!['http:', 'https:'].includes(source.protocol)) {
        throw new Error('Unsupported agreement document URL.');
      }
      const canonical = source.pathname.match(/^\/storage\/([A-Za-z_][A-Za-z0-9_-]*)\/(.+\.pdf)$/i);
      if (canonical && source.origin === window.location.origin) {
        // The server owns the signed-document path, tenant, agreement and
        // archive ACL. Do not re-scope its canonical persisted URL in the
        // browser; normalization may change UUID case or object key bytes.
        file = source.href;
      } else if (source.pathname.startsWith('/storage/')) {
        throw new Error('Protected documents must be loaded from this application.');
      } else {
        setState({ status: 'ready', url: source.href, error: null });
        return undefined;
      }
    } catch (_error) {
      setState({ status: 'error', url: null, error: 'Agreement document URL is not valid.' });
      return undefined;
    }
    setState({ status: 'loading', url: null, error: null });
    const load = async () => {
      let failureStatus = null;
      let invalidPdf = false;
      try {
        const response = await fetch(file, {
          headers: buildRequestContextHeaders()
        });
        if (!response.ok) {
          failureStatus = response.status;
          throw new Error('Protected storage denied the PDF request.');
        }
        const pdf = await response.blob();
        if (pdf.size < 5 || String.fromCharCode(...new Uint8Array(await pdf.slice(0, 5).arrayBuffer())) !== '%PDF-') {
          invalidPdf = true;
          throw new Error('Invalid or empty PDF received.');
        }
        if (cancelled) return;
        temporaryUrl = URL.createObjectURL(new Blob([pdf], { type: 'application/pdf' }));
        setState({ status: 'ready', url: temporaryUrl, error: null });
      } catch (_error) {
        if (!cancelled) {
          setState({ status: 'error', url: null, error: describeEviaAuditFetchFailure({
            documentUrl: file, status: failureStatus, invalidPdf
          }) });
        }
      }
    };
    void load();
    return () => {
      cancelled = true;
      if (temporaryUrl) URL.revokeObjectURL(temporaryUrl);
    };
  }, [documentUrl]);
  return state;
};
