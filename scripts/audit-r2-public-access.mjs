import {pathToFileURL} from 'node:url';

// Read-only Cloudflare control-plane audit. Object keys are deliberately NOT
// accepted as a substitute for the separately scoped management API token.
export const auditR2PublicAccess=async({env=process.env,fetchImpl=globalThis.fetch}={})=>{
  const account=String(env.R2_ACCOUNT_ID||'').trim();
  const bucket=String(env.R2_BUCKET||'').trim();
  const token=String(env.CLOUDFLARE_R2_AUDIT_TOKEN||'').trim();
  const jurisdiction=String(env.R2_JURISDICTION||'').trim();
  const blocked=code=>({status:'BLOCKED',code});
  if(!token)return blocked('MISSING_CLOUDFLARE_R2_AUDIT_TOKEN');
  if(!/^[a-f0-9]{32}$/i.test(account))return blocked('INVALID_R2_ACCOUNT_ID');
  if(!/^[a-z0-9][a-z0-9.-]{1,62}[a-z0-9]$/.test(bucket))return blocked('INVALID_R2_BUCKET');
  if(/\s/.test(token))return blocked('INVALID_AUDIT_TOKEN_FORMAT');
  if(jurisdiction&&!['default','eu','us','fedramp','fedramp-high'].includes(jurisdiction)){
    return blocked('INVALID_R2_JURISDICTION');
  }
  const headers={Authorization:'Bearer '+token,Accept:'application/json'};
  if(jurisdiction)headers['cf-r2-jurisdiction']=jurisdiction;
  const base='https://api.cloudflare.com/client/v4/accounts/'+account+
    '/r2/buckets/'+encodeURIComponent(bucket)+'/domains/';
  const get=async kind=>{
    let response;
    try{
      response=await fetchImpl(base+kind,{
        method:'GET',headers,redirect:'error',signal:AbortSignal.timeout(15000)
      });
    }catch{
      throw Object.assign(new Error('Audit request unavailable.'),{auditCode:'CLOUDFLARE_REQUEST_UNAVAILABLE'});
    }
    if(response.status===401||response.status===403){
      throw Object.assign(new Error('Audit authorization unavailable.'),{auditCode:'AUDIT_TOKEN_ACCESS_DENIED'});
    }
    if(response.status!==200){
      throw Object.assign(new Error('Audit response unavailable.'),{auditCode:'CLOUDFLARE_HTTP_ERROR'});
    }
    let body;
    try{body=await response.json();}catch{
      throw Object.assign(new Error('Invalid audit response.'),{auditCode:'INVALID_CLOUDFLARE_RESPONSE'});
    }
    if(body?.success!==true||!body.result||typeof body.result!=='object'){
      throw Object.assign(new Error('Incomplete audit response.'),{auditCode:'INVALID_CLOUDFLARE_RESPONSE'});
    }
    return body;
  };
  try{
    const managed=await get('managed');
    const custom=await get('custom');
    const domains=custom.result.domains;
    if(typeof managed.result.enabled!=='boolean'||!Array.isArray(domains)||
      domains.some(domain=>typeof domain?.enabled!=='boolean')||
      (custom.result_info?.total_count!==undefined&&custom.result_info.total_count!==domains.length)){
      return blocked('INCOMPLETE_DOMAIN_CONFIGURATION');
    }
    const enabled=domains.filter(domain=>domain.enabled).length;
    return {
      status:managed.result.enabled||enabled>0?'FAIL':'PASS',
      code:managed.result.enabled||enabled>0?'DIRECT_PUBLIC_BUCKET_ACCESS_ENABLED':'DIRECT_PUBLIC_BUCKET_ACCESS_DISABLED',
      managedPublicAccess:managed.result.enabled,
      enabledCustomDomains:enabled,
      configuredCustomDomains:domains.length
    };
  }catch(error){
    // Do not print provider bodies, account/bucket identifiers, URLs or secrets.
    return blocked(error?.auditCode||'AUDIT_UNAVAILABLE');
  }
};

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const result=await auditR2PublicAccess();
  console.log(JSON.stringify(result));
  process.exitCode=result.status==='PASS'?0:result.status==='FAIL'?1:2;
}
