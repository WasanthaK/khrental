import { useEffect, useState } from 'react';
import { downloadTenantFile } from '../services/storageApiService';

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
        file = {
          bucket: canonical[1],
          path: canonical[2].split('/').map(decodeURIComponent).join('/')
        };
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
      try {
        const pdf = await downloadTenantFile(file);
        if (pdf.size < 5 || String.fromCharCode(...new Uint8Array(await pdf.slice(0, 5).arrayBuffer())) !== '%PDF-') {
          throw new Error('Invalid or empty PDF received.');
        }
        if (cancelled) return;
        temporaryUrl = URL.createObjectURL(new Blob([pdf], { type: 'application/pdf' }));
        setState({ status: 'ready', url: temporaryUrl, error: null });
      } catch (_error) {
        if (!cancelled) {
          setState({ status: 'error', url: null, error: 'Unable to retrieve this document. Check access and try again.' });
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
