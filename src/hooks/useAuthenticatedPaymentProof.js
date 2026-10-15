import { useEffect, useState } from 'react';
import { buildRequestContextHeaders } from '../services/requestContext';

export const useAuthenticatedPaymentProof = proofUrl => {
  const [state, setState] = useState({ status: 'idle', url: null, type: null, error: null });
  useEffect(() => {
    let cancelled = false, blobUrl = null;
    if (!proofUrl) {
      setState({ status: 'idle', url: null, type: null, error: null });
      return undefined;
    }
    let source;
    try {
      source = new URL(proofUrl, window.location.origin);
      if (source.origin !== window.location.origin
        || !/^\/storage\/invoices\/tenants\/[^/]+\/payment_proofs\//i.test(source.pathname)
        || source.search || source.hash) throw new Error('Invalid path');
    } catch {
      setState({ status: 'error', url: null, type: null, error: 'Payment proof location is invalid.' });
      return undefined;
    }
    setState({ status: 'loading', url: null, type: null, error: null });
    (async () => {
      try {
        const response = await fetch(source.href, { headers: buildRequestContextHeaders() });
        if (!response.ok) throw new Error('Forbidden or absent');
        const bytes = await response.arrayBuffer();
        if (bytes.byteLength < 5 || bytes.byteLength > 5 * 1024 * 1024) throw new Error('Invalid bytes');
        const a = new Uint8Array(bytes);
        const pdf = String.fromCharCode(...a.slice(0,5)) === '%PDF-';
        const png = a.length >= 8 && [137,80,78,71,13,10,26,10].every((v,i) => a[i] === v);
        const jpg = a[0] === 255 && a[1] === 216 && a[2] === 255;
        if (!pdf && !png && !jpg) throw new Error('Invalid proof type');
        if (cancelled) return;
        const type = pdf ? 'application/pdf' : png ? 'image/png' : 'image/jpeg';
        blobUrl = URL.createObjectURL(new Blob([bytes], { type }));
        setState({ status: 'ready', url: blobUrl, type, error: null });
      } catch {
        if (!cancelled) setState({ status: 'error', url: null, type: null, error: 'Unable to load payment evidence securely.' });
      }
    })();
    return () => { cancelled = true; if (blobUrl) URL.revokeObjectURL(blobUrl); };
  }, [proofUrl]);
  return state;
};
