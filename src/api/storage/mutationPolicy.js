import {getRoleType} from '../platform/permissionEngine.js';
const denied=()=>Object.assign(new Error('This storage change is not authorized.'),{status:403,code:'STORAGE_MUTATION_FORBIDDEN'});
export const isTenantStorageAdmin = req => Boolean(req.user?.id && req.membership
  && String(req.membership.tenant_id||req.membership.tenantId)===String(req.tenantId)
  && req.membership.status==='active' && req.membership.role==='admin');

// Non-administrators may append their own rental evidence, never overwrite
// arbitrary tenant objects. Invoice-owned proof authorization runs separately.
export const storageUploadPolicy = ({req,bucket,path,proof}) => {
  if (isTenantStorageAdmin(req)) return {path,createOnly:false};
  if (proof?.applies && proof.allowed) return {path,createOnly:true};
  const m=req.membership;
  if (!req.user?.id || !m || m.status!=='active'
      || String(m.tenant_id||m.tenantId)!==String(req.tenantId)) throw denied();
  const prefix=`tenants/${req.tenantId}/`;
  if (!path.startsWith(prefix)) throw denied();
  const parts=path.slice(prefix.length).split('/');
  const folder=parts[0],name=parts.at(-1);
  const permitted=(bucket==='images' && ['maintenance','utility-readings','id-copies'].includes(folder))
    || (bucket==='files' && folder==='id-copies');
  if (!permitted || !name || !/^[A-Za-z0-9_.-]+$/.test(name)
      || !['rentee','staff'].includes(getRoleType({user:req.user,membership:m}))
      || (parts.length!==2 && !(parts.length===3 && parts[1]===String(req.user.id)))) throw denied();
  const body=req.body;
  const image=Buffer.isBuffer(body) && ((body[0]===0xff && body[1]===0xd8 && body[2]===0xff)
    || body.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
    || (body.toString('ascii',0,4)==='RIFF' && body.toString('ascii',8,12)==='WEBP'));
  const pdf=Buffer.isBuffer(body) && body.toString('ascii',0,5)==='%PDF-';
  if (!image && !(folder==='id-copies' && pdf)) throw denied();
  return {path:`${prefix}${folder}/${req.user.id}/${name}`,createOnly:true};
};

export const requireTenantStorageAdmin = (req,_res,next) => {
  if (!isTenantStorageAdmin(req)) return next(denied());
  next();
};
