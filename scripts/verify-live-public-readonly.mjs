// Read-only serving-site smoke probe: no sessions, credentials, or mutations.
// Run from CI with outbound network access. Never print private listing data.
import assert from 'node:assert/strict';

const app='https://app.quixo.homes';
const site='https://quixo.homes';
const requests=[];
const get=async(path,{json=false,allowError=false}={})=>{
  const url=new URL(path,path.startsWith('/api/')||path==='/build-info.json'?app:site);
  assert.ok([app,site].includes(url.origin),'Unexpected probe origin');
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),18000);
  try{
    const response=await fetch(url,{method:'GET',redirect:'error',signal:controller.signal,
      headers:{Accept:json?'application/json':'text/html'},cache:'no-store'});
    requests.push({path:url.pathname+(url.search?'?type=selected':''),http:response.status});
    if(allowError&&response.status!==200)return {http:response.status};
    assert.equal(response.status,200,url.pathname+' HTTP');
    assert.ok((response.headers.get('content-type')||'').includes(json?'json':'html'),url.pathname+' content type');
    const text=await response.text();
    assert.ok(text.length>20&&text.length<3_000_000,url.pathname+' response bounds');
    return json?JSON.parse(text):text;
  } finally {clearTimeout(timeout);}
};
const home=await get('/');
assert.match(home,/href="lk\/"/,'Root has Sri Lanka entry');
assert.match(home,/href="bn\/"/,'Root has Brunei entry');
const build=await get('/build-info.json',{json:true});
assert.match(build.buildSha,/^[a-f0-9]{40}$/,'Serving app build has commit identity');
const health=await get('/api/mssql/health',{json:true,allowError:true});
const healthReady=health.connection==='ready';
console.log('APP_MSSQL_HEALTH='+ (healthReady?'PASS':'BLOCKED')+' http='+(health.http||200));
for(const [country,code] of [['lk','LK'],['bn','BN']]){
  const market=await get('/'+country+'/');
  assert.ok(market.includes('href="./search/"'),'Country homepage has rental search');
  assert.ok(market.includes('href="./owners/"'),'Country homepage has owner journey');
  for(const type of ['residential','commercial','retail','office']){
    const html=await get('/'+country+'/search/?type='+type);
    assert.ok(html.includes('data-public-listing-market="'+code+'"'),'Correct public market');
    assert.ok(html.includes('data-rental-filters'),'UX-08 filter form deployed');
    assert.ok(html.includes('name="location"')&&html.includes('name="maxRent"'),'Location/rent UI deployed');
    assert.ok(html.includes('data-public-listing-cards'),'Public catalog display deployed');
  }
  const owner=await get('/'+country+'/owners/');
  assert.ok(owner.includes('/owner-sign-up?country='+code),'UX-05 direct signup deployed');
  const catalog=await get('/api/public-listings?country='+code,{json:true});
  assert.equal(catalog.country,code,'Correct listing market');
  assert.ok(Array.isArray(catalog.data),'Public listing shape');
  for(const item of catalog.data){
    assert.equal(item.country,code,'No cross-market inventory');
    assert.ok(typeof item.id==='string'&&typeof item.title==='string','Public listing identity');
    for(const privateKey of ['tenant_id','tenantId','ownerEmail','owner_email','exactAddress','bankAccount']){
      assert.equal(Object.hasOwn(item,privateKey),false,'No private listing key');
    }
  }
  console.log('PUBLIC_MARKET_READONLY=PASS country='+code+' inventoryCount='+catalog.data.length);
}
console.log('PUBLIC_ROUTE_PROBES=PASS servingBuild='+build.buildSha+' checks='+requests.length);
assert.ok(healthReady,'LIVE_PUBLIC_READONLY=BLOCKED: app database health is not ready');
console.log('LIVE_PUBLIC_READONLY=PASS');
