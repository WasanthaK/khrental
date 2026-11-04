import crypto from 'node:crypto';
import {getMssqlPool, sql} from '../mssql/pool.js';
import {BILLING_ACCOUNT, BILLING_PRICE, hash, problem, dwellingInventory} from './contract.js';

export const createBillingStore = ({getPool = getMssqlPool} = {}) => {
  const query = async (connection, statement, params = {}) => {
    const request = connection instanceof sql.Transaction ? new sql.Request(connection) : connection.request();
    for (const [key,value] of Object.entries(params)) request.input(key,value);
    return (await request.query(statement)).recordset || [];
  };
  const read = async (statement, params) => query(await getPool(), statement, params);
  const locked = async (resource, action) => {
    const tx = new sql.Transaction(await getPool());
    await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    try {
      await query(tx, `DECLARE @result INT;
        EXEC @result=sys.sp_getapplock @Resource=@resource,@LockMode='Exclusive',@LockOwner='Transaction',@LockTimeout=10000;
        IF @result<0 THROW 51000,'Billing operation is busy; retry.',1;`, {resource:`management-billing:${resource}`});
      const q = (statement, params) => query(tx, statement, params);
      const result = await action(q);
      await tx.commit();
      return result;
    } catch (error) { await tx.rollback().catch(()=>{}); throw error; }
  };
  const account = async (tenantId, q = read) => (await q('SELECT * FROM dbo.management_billing_accounts WHERE tenant_id=@tenantId',{tenantId}))[0] || null;
  const assertActor = async(q,tenantId,actorId)=>{
    const allowed=await q(`SELECT TOP 1 m.id FROM dbo.tenant_memberships m
      JOIN dbo.app_users u ON u.id=m.app_user_id JOIN dbo.tenants t ON t.id=m.tenant_id
      WHERE m.tenant_id=@tenantId AND m.app_user_id=@actorId AND LOWER(m.role)='admin'
      AND LOWER(COALESCE(m.status,'active'))='active' AND LOWER(COALESCE(u.status,'active'))='active'
      AND LOWER(t.status)='active'`,{tenantId,actorId});
    if(!allowed.length) throw problem(403,'BILLING_ADMIN_REQUIRED','The workspace administrator membership is no longer active.');
  };
  const audit = (q, {tenantId=null,actorId=null,action,resourceId,previous=null,current,reason}) =>
    q(`INSERT INTO dbo.management_billing_audit(tenant_id,actor_id,action,resource_id,previous_hash,current_hash,reason)
      VALUES(@tenantId,@actorId,@action,@resourceId,@previous,@current,@reason)`,
    {tenantId,actorId,action,resourceId,previous:previous === null ? null : hash(previous),current:hash(current),reason});
  const inventory = async (tenantId, q = read) => {
    const properties = await q('SELECT id,tenant_id,name,propertytype FROM dbo.properties WHERE tenant_id=@tenantId',{tenantId});
    // Deliberately includes malformed cross-tenant child relationships so the contract rejects them.
    const units = await q(`SELECT u.id,u.tenant_id,u.propertyid,u.unitnumber FROM dbo.property_units u
      JOIN dbo.properties p ON p.id=u.propertyid WHERE p.tenant_id=@tenantId`,{tenantId});
    return dwellingInventory({tenantId,properties,units});
  };
  const listPricing = async () => (await read('SELECT * FROM dbo.management_pricing_versions ORDER BY created_at DESC,version DESC'))
    .map(row => ({...row,rules:JSON.parse(row.rules_json),rules_json:undefined}));
  const savePricing = async ({rules,expectedVersion,actorId}) => locked(`pricing:${rules.market}`, async q => {
    const latest = (await q('SELECT MAX(version) AS version FROM dbo.management_pricing_versions WHERE market=@market',{market:rules.market}))[0];
    if ((latest?.version || 0) !== expectedVersion) throw problem(409,'BILLING_STALE_VERSION','Pricing changed. Reload before saving a new version.');
    const id = crypto.randomUUID();
    await q(`INSERT INTO dbo.management_pricing_versions(id,market,version,rules_json,created_by)
      VALUES(@id,@market,@version,@rules,@actorId)`,{id,market:rules.market,version:expectedVersion+1,rules:JSON.stringify(rules),actorId});
    await audit(q,{actorId,action:'pricing.draft_created',resourceId:id,current:rules,reason:rules.reason});
    return {id,version:expectedVersion+1};
  });
  const enroll = ({tenantId,actorId,reason,market,useApprovedSandboxBaseline=false}) => locked(tenantId,async q => {
    const existing = await account(tenantId,q);
    if (existing) return existing;
    const tenant = (await q('SELECT id,[plan],status FROM dbo.tenants WHERE id=@tenantId',{tenantId}))[0];
    if (!tenant || tenant.plan !== 'development-testing' || tenant.status !== 'active')
      throw problem(409,'BILLING_SANDBOX_WORKSPACE_REQUIRED','Sandbox billing is limited to an active development-testing workspace.');
    const items = await inventory(tenantId,q);
    if (!items.length) throw problem(409,'BILLING_INVENTORY_EMPTY','Add residential inventory before enrolling this sandbox workspace.');
    const selected=(await q(`SELECT TOP 1 id,stripe_price_id FROM dbo.management_pricing_versions
      WHERE market=@market AND status='sandbox_published' AND TRY_CONVERT(DATETIMEOFFSET,JSON_VALUE(rules_json,'$.effectiveAt'))<=SYSUTCDATETIME()
      ORDER BY TRY_CONVERT(DATETIMEOFFSET,JSON_VALUE(rules_json,'$.effectiveAt')) DESC,version DESC`,{market}))[0];
    if(!selected && !useApprovedSandboxBaseline) throw problem(409,'BILLING_MARKET_UNCONFIGURED','Publish an effective market rule, or explicitly select the approved sandbox baseline.');
    const selectedPrice=useApprovedSandboxBaseline?BILLING_PRICE:selected.stripe_price_id;
    const pricingVersion=useApprovedSandboxBaseline?null:selected.id;
    await q(`INSERT INTO dbo.management_billing_accounts(tenant_id,stripe_account_id,stripe_price_id,pricing_version_id,market,inventory_json)
      VALUES(@tenantId,@stripeAccount,@price,@pricingVersion,@market,@inventory)`,
      {tenantId,stripeAccount:BILLING_ACCOUNT,price:selectedPrice,pricingVersion,market,inventory:JSON.stringify(items)});
    await audit(q,{tenantId,actorId,action:'sandbox.enrolled',resourceId:tenantId,current:{inventory:items,market,price:selectedPrice,pricingVersion,useApprovedSandboxBaseline},reason});
    return account(tenantId,q);
  });
  const beginCommand = ({tenantId,id,kind,payload,actorId}) => locked(tenantId,async q => {
    await assertActor(q,tenantId,actorId);
    const existing=(await q('SELECT * FROM dbo.management_billing_commands WHERE id=@id',{id}))[0];
    const digest=hash(payload);
    if(existing){
      if(String(existing.tenant_id).toLowerCase()!==tenantId.toLowerCase() || existing.kind!==kind || existing.payload_hash!==digest)
        throw problem(409,'BILLING_REQUEST_CONFLICT','This request identifier belongs to a different operation.');
      if(existing.status==='pending' && Date.now()-new Date(existing.created_at).getTime()>23*3600000)
        throw problem(409,'BILLING_RECONCILIATION_REQUIRED','An older interrupted operation needs reconciliation before retrying.');
      return {...existing,createdNow:false};
    }
    const pending=(await q(`SELECT TOP 1 id FROM dbo.management_billing_commands WHERE tenant_id=@tenantId AND status='pending'`,{tenantId}))[0];
    if(pending) throw problem(409,'BILLING_COMMAND_PENDING','Retry the unfinished billing operation before starting another.');
    await q(`INSERT INTO dbo.management_billing_commands(id,tenant_id,kind,payload_hash,payload_json,status)
      VALUES(@id,@tenantId,@kind,@digest,@payload,'pending')`,{id,tenantId,kind,digest,payload:JSON.stringify(payload)});
    return {id,status:'pending',createdNow:true};
  });
  const completeCommand = (q,id,result) => q(`UPDATE dbo.management_billing_commands SET status='completed',result_json=@result,
    completed_at=SYSUTCDATETIME() WHERE id=@id`,{id,result:JSON.stringify(result)});
  return {read,locked,account,assertActor,audit,inventory,listPricing,savePricing,enroll,beginCommand,completeCommand};
};
