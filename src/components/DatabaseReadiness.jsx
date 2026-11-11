import React, { useEffect, useState } from 'react';
import { ensureDatabaseReady } from '../utils/databaseReadiness';

// Keep mounted forms and credential flows intact after the initial readiness gate.
export default function DatabaseReadiness({ children }) {
  const [state, setState] = useState('checking');
  const [started, setStarted] = useState(false);
  useEffect(() => {
    const update = event => {
      setState(event.detail);
      if (event.detail === 'ready') {setStarted(true);}
    };
    window.addEventListener('quixo:database', update);
    ensureDatabaseReady().then(() => { setStarted(true); setState('ready'); }).catch(() => {});
    return () => window.removeEventListener('quixo:database', update);
  }, []);
  const retry = () => ensureDatabaseReady().catch(() => {});
  return <>
    {started && <div inert={state !== 'ready' ? '' : undefined}>{children}</div>}
    {state !== 'ready' && <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-50/95 p-6">
      <section className="max-w-md rounded-2xl bg-white p-8 text-center shadow-lg" role="status" aria-live="polite" aria-busy={state === 'checking'}>
        <p className="text-sm font-semibold text-blue-700">Quixo.Homes</p>
        <h1 className="my-4 text-2xl font-bold text-slate-900">
          {state === 'checking' ? 'We’re gathering our minions to serve you…' : 'Our minions need another moment'}
        </h1>
        <p className="text-slate-600">{state === 'checking'
          ? 'Getting everything ready. This may take up to a minute—we’ll continue automatically.'
          : 'We couldn’t connect just yet. Please try again in a moment. Your open page is still here.'}</p>
        {state === 'unavailable' && <button type="button" onClick={retry}
          className="mt-6 rounded-lg bg-blue-700 px-6 py-3 font-semibold text-white focus:ring-4 focus:ring-blue-300">
          Try again
        </button>}
      </section>
    </div>}
  </>;
}
