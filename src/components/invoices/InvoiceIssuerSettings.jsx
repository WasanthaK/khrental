import { useEffect, useState } from 'react';
import { getInvoiceIssuerProfile, saveInvoiceIssuerProfile, previewInvoiceDesign } from '../../services/platformClient';
import { DEFAULT_INVOICE_DESIGN, INVOICE_TEMPLATES } from '../../api/platform/invoiceDesign';

const fields=[
  ['legalName','Legal invoice issuer name'],
  ['postalAddress','Registered/postal address'],
  ['supportEmail','Billing support email'],
  ['supportPhone','Billing support phone'],
  ['website','Website (HTTPS)']
];
const blank=()=>Object.fromEntries(fields.map(([k])=>[k,'']));
const normal=(data={})=>({...blank(),...data,design:{...DEFAULT_INVOICE_DESIGN,...data.design}});
export default function InvoiceIssuerSettings(){
  const [profile,setProfile]=useState(normal);
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [previewing,setPreviewing]=useState(false);
  const [pdfUrl,setPdfUrl]=useState(null);
  const [notice,setNotice]=useState('');
  const [error,setError]=useState('');
  const [previewError,setPreviewError]=useState('');
  const field=(key,value)=>setProfile(p=>({...p,[key]:value}));
  const design=(key,value)=>setProfile(p=>({...p,design:{...p.design,[key]:value}}));
  useEffect(()=>{
    let mounted=true;
    getInvoiceIssuerProfile().then(({data,error:loadError})=>{
      if(!mounted)return;
      if(loadError)setError(loadError.message);
      else setProfile(normal(data));
      setLoading(false);
    });
    return()=>{mounted=false;};
  },[]);
  useEffect(()=>()=>{if(pdfUrl)URL.revokeObjectURL(pdfUrl);},[pdfUrl]);
  const save=async event=>{
    event.preventDefault();setSaving(true);setNotice('');setError('');
    const result=await saveInvoiceIssuerProfile(profile);
    if(result.error)setError(result.error.message);
    else {
      setProfile(normal(result.data));
      setNotice('Invoice profile and design saved. Existing issued PDFs never change.');
    }
    setSaving(false);
  };
  const preview=async()=>{
    setPreviewing(true);setPreviewError('');
    const result=await previewInvoiceDesign(profile);
    if(result.error) setPreviewError(result.error.message);
    else if(result.data?.isSample && result.data.type==='application/pdf' && result.data.content){
      try {
        const binary=atob(result.data.content);
        const bytes=Uint8Array.from(binary,ch=>ch.charCodeAt(0));
        setPdfUrl(URL.createObjectURL(new Blob([bytes],{type:'application/pdf'})));
      }catch {setPreviewError('The PDF preview could not be decoded.');}
    }else setPreviewError('Preview response was not a sample PDF.');
    setPreviewing(false);
  };
  return <section className="app-panel lg:col-span-2" aria-label="Invoice Designer">
    <div className="app-panel-header">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Customer documents</p>
      <h2 className="text-xl font-semibold text-slate-900">Invoice Designer</h2>
      <p className="text-sm text-slate-500">Make every customer invoice look like your business. The selected design applies to future issuances only; it cannot change issued documents or accounting data.</p>
    </div>
    <form className="app-panel-body space-y-6" onSubmit={save}>
      {loading?<p className="text-sm text-slate-600">Loading invoice design…</p>:<>
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        {notice && <p role="status" className="text-sm text-emerald-700">{notice}</p>}
        <fieldset className="space-y-3">
          <legend className="text-sm font-semibold text-slate-800">Business identity</legend>
          <div className="grid gap-4 md:grid-cols-2">
            {fields.map(([key,label])=><label key={key} className="block text-sm font-medium text-slate-700">
              {label}
              <input type="text" maxLength={key==='postalAddress'?500:key==='website'?300:key==='supportEmail'?320:key==='supportPhone'?100:200}
                className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2"
                value={profile[key]||''} onChange={e=>field(key,e.target.value)}/>
            </label>)}
          </div>
        </fieldset>
        <fieldset className="space-y-3">
          <legend className="text-sm font-semibold text-slate-800">Invoice layout</legend>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {Object.entries(INVOICE_TEMPLATES).map(([id,style])=>{
              const selected=profile.design.template===id;
              return <label key={id} className={`block cursor-pointer rounded-xl border-2 p-3 transition-colors ${selected?'border-blue-700 bg-blue-50':'border-slate-200 bg-white hover:border-slate-400'}`}>
                <input type="radio" name="invoice-template" value={id} checked={selected}
                  onChange={()=>design('template',id)} className="sr-only"/>
                <span className="block overflow-hidden rounded border bg-white p-3 shadow-sm" aria-hidden="true">
                  <span className="block h-1.5 w-full rounded" style={{background:style.accent}}/>
                  <span className="mt-3 block h-2 w-2/3 rounded bg-slate-700"/>
                  <span className="mt-2 block h-1 w-full rounded bg-slate-200"/>
                  <span className="mt-1 block h-1 w-4/5 rounded bg-slate-200"/>
                  <span className="mt-3 block h-4 rounded" style={{background:style.pale}}/>
                </span>
                <span className="mt-2 block text-sm font-semibold text-slate-800">{style.label}</span>
                <span className="text-xs text-slate-500">{selected?'Selected':'Choose template'}</span>
              </label>;
            })}
          </div>
        </fieldset>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="text-sm font-medium text-slate-800">Accent color (optional)
            <div className="mt-1 flex gap-2 items-center">
              <input aria-label="Choose accent color" type="color" value={profile.design.primaryColor||INVOICE_TEMPLATES[profile.design.template].accent}
                onChange={e=>design('primaryColor',e.target.value)} className="h-10 w-12 cursor-pointer rounded border"/>
              <input aria-label="Accent hex" className="w-32 rounded-lg border border-slate-300 px-3 py-2"
                placeholder="Template color" value={profile.design.primaryColor}
                maxLength={7} onChange={e=>design('primaryColor',e.target.value)}/>
              <button type="button" className="text-xs underline" onClick={()=>design('primaryColor','')}>Reset</button>
            </div>
            <span className="text-xs text-slate-500">Use a dark color for readable print contrast.</span>
          </label>
          <label className="text-sm font-medium text-slate-800">Paper size
            <select className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2"
              value={profile.design.paperFormat} onChange={e=>design('paperFormat',e.target.value)}>
              <option value="A4">A4</option><option value="Letter">US Letter</option>
            </select>
          </label>
        </div>
        <fieldset className="space-y-2">
          <legend className="text-sm font-semibold text-slate-800">Optional customer details</legend>
          {[
            ['showPropertyAddress','Show property address'],
            ['showIssuerContact','Show billing contact details']
          ].map(([key,label])=><label key={key} className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={profile.design[key]}
              onChange={e=>design(key,e.target.checked)} className="rounded border-slate-300"/>
            {label}
          </label>)}
        </fieldset>
        <label className="block text-sm font-medium text-slate-800">Invoice footer note (optional)
          <textarea rows={2} maxLength={160} value={profile.design.footerText}
            className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2"
            placeholder="Payment queries? Contact our billing team."
            onChange={e=>design('footerText',e.target.value)}/>
          <span className="text-xs text-slate-500">160 printable Latin characters maximum. No scripts or HTML.</span>
        </label>
        <p className="text-xs text-slate-500">Preview uses fictional amounts and people and is marked SAMPLE. It never sends an email, issues an invoice, or changes your financial ledger.</p>
        <div className="flex flex-wrap gap-3">
          <button className="app-button" type="submit" disabled={saving}>{saving?'Saving…':'Save invoice design'}</button>
          <button className="app-button-secondary" type="button" disabled={previewing}
            onClick={preview}>{previewing?'Generating preview…':'Preview sample PDF'}</button>
        </div>
        {previewError && <p role="alert" className="text-sm text-red-700">{previewError}</p>}
        {pdfUrl && <div className="rounded-xl border border-slate-200 p-3">
          <div className="mb-2 flex items-center justify-between gap-3">
            <h3 className="font-semibold text-slate-800">SAMPLE invoice preview — not issued</h3>
            <button type="button" className="text-sm underline" onClick={()=>setPdfUrl(null)}>Close preview</button>
          </div>
          <iframe title="Sample invoice PDF preview" src={pdfUrl} className="h-[540px] w-full rounded-lg border border-slate-200"/>
        </div>}
      </>}
    </form>
  </section>;
}
