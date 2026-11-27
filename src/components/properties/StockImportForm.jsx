import React, {useRef, useState} from 'react';
import {readStockImport} from './stockImport';

export default function StockImportForm({tenantId, busy, onAction}) {
  const [records, setRecords] = useState([]);
  const [error, setError] = useState('');
  const input = useRef(null);

  async function selectFile(event) {
    const file = event.target.files[0];
    setRecords([]);
    setError('');
    if (!file) { return; }
    try {
      if (file.size > 1024 * 1024) { throw new Error('Choose a CSV file smaller than 1 MB.'); }
      const selected = readStockImport(await file.text(), tenantId);
      if (input.current?.files[0] === file) { setRecords(selected); }
    } catch (cause) {
      if (input.current?.files[0] === file) { setError(cause.message); }
    }
  }

  async function submit(event) {
    event.preventDefault();
    if (!records.length || busy) { return; }
    const result = await onAction('stock/prepare', {
      records, reason: 'Organization administrator imported dwellings for billing review.'
    });
    if (result && input.current) {
      input.current.value = '';
      setRecords([]);
    }
  }

  return <details className="rounded-lg border border-slate-200 p-3">
    <summary className="cursor-pointer font-semibold">Import properties and units</summary>
    <form aria-label="Import properties and units" className="mt-3 space-y-3 text-sm" onSubmit={submit}>
      <p><a className="font-semibold text-teal-800 underline" href="/dwelling-import-template.csv" download>Download the CSV template</a> and replace the examples with up to 100 records. Keep the same references when retrying a file. For a unit, enter the reference of its imported parent property.</p>
      <label className="block">Inventory CSV file<input className="mt-1 block w-full" type="file" accept=".csv,text/csv" ref={input} disabled={busy} onChange={selectFile}/></label>
      {error && <p role="alert" className="text-red-800">{error}</p>}
      {records.length > 0 && <>
        <h3 className="font-semibold">Review {records.length} {records.length === 1 ? 'record' : 'records'}</h3>
        <ul className="max-h-56 list-disc space-y-1 overflow-auto pl-5">{records.map(({kind, payload}) =>
          <li key={payload.id} className="break-words">{kind === 'unit' ? payload.unitnumber + ' · Unit' : payload.name + ' · ' + payload.propertytype + ' · ' + payload.country_code}</li>)}</ul>
        <button className="rounded-lg border border-slate-300 bg-white px-4 py-2 font-semibold disabled:opacity-40" disabled={busy}>Prepare imported inventory</button>
      </>}
    </form>
  </details>;
}
