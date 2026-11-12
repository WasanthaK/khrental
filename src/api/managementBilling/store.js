import {billingClock} from './clock.js';
import crypto from 'node:crypto';
import {resolveRegisteredPhoto,trustedPhotoOrigins} from '../publicListings/sourceImages.js';
import {getMssqlPool, sql} from '../mssql/pool.js';
import {runQuery} from '../mssql/query.js';
import {BILLING_ACCOUNT, BILLING_PRICE, hash, problem, identifier, dwellingInventory, stagedStock, cessationBlockers, reason as decisionReason, complimentaryChange, entitlement, managementWriteEnforced} from './contract.js';

// The caller must supply its mutation transaction, never an independent pool
// read. Hold the account row through commit so revoke/reconciliation cannot
// race a previously admitted write. Evaluate expiry using the database clock.
export const assertManagementWrite = async ({tenantId, transaction, env = process.env}) => {
  if (!managementWriteEnforced(tenantId, env)) {return;}
  if (env.MANAGEMENT_BILLING_SCHEMA_READY !== 'true' || !(transaction instanceof sql.Transaction)) {
    throw problem(503, 'BILLING_ACCESS_UNAVAILABLE', 'Management access could not be verified. Try again later.');
  }
  const request = new sql.Request(transaction);
  request.input('tenantId', sql.UniqueIdentifier, tenantId);
  const account = (await request.query(`SELECT *, SYSUTCDATETIME() AS entitlement_checked_at
    FROM dbo.management_billing_accounts WITH (UPDLOCK, HOLDLOCK)
    WHERE tenant_id=@tenantId`)).recordset[0];
  if (account && (account.stripe_account_id !== BILLING_ACCOUNT ||
      !(account.entitlement_checked_at instanceof Date) || !Number.isFinite(account.entitlement_checked_at.getTime()))) {
    throw problem(503, 'BILLING_ACCESS_UNAVAILABLE', 'Management access could not be verified. Try again later.');
  }
  if (!entitlement(account, account?.entitlement_checked_at.getTime()).management) {
    throw problem(403, 'MANAGEMENT_READ_ONLY', 'Management is read-only. Ask your organization administrator to review subscription access. Existing records remain available.');
  }
};

// Use for writers that previously issued standalone SQL statements. The
// entitlement lock and every domain/audit write share one commit boundary.
export const withManagementWrite = async ({tenantId, action}) => {
  const transaction = new sql.Transaction(await getMssqlPool());
  await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
  try {
    await assertManagementWrite({tenantId, transaction});
    const result = await action(transaction);
    await transaction.commit();
    return result;
  } catch (error) {
    await transaction.rollback().catch(() => {});
    throw error;
  }
};

export const runManagementQuery = (statement, params, tenantId = params.tenantId) => withManagementWrite({
  tenantId,
  action: transaction => runQuery(statement, params, transaction)
});

export const runSingleManagementQuery = async (statement, params) =>
  (await runManagementQuery(statement, params))[0] || null;

export const createBillingStore = ({getPool = getMssqlPool,env=process.env,clock=billingClock} = {}) => {
  const validateImages=(records,tenantId)=>{
    for(const {payload} of records){
      for(let index=0;index<(payload.images?.length||0);index++){
        try{resolveRegisteredPhoto(payload.images,index,tenantId,{allowedOrigins:trustedPhotoOrigins(env),allowPrivateGif:true});}
        catch{throw problem(400,'BILLING_STOCK_IMAGE','Property images must belong to this workspace’s private property storage.');}
      }
    }
  };
  const stagingEnabled=()=>env.MANAGEMENT_INVENTORY_SCHEMA_READY==='true';
  // Once controls are recorded, keep readiness on across application rollback.
  const cessationEnabled=()=>env.MANAGEMENT_CESSATION_SCHEMA_READY==='true';
  const query = async (connection, statement, params = {}) => {
    const request = connection instanceof sql.Transaction ? new sql.Request(connection) : connection.request();
    for (const [key,value] of Object.entries(params)) {request.input(key,value);}
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
    if(!allowed.length) {throw problem(403,'BILLING_ADMIN_REQUIRED','The workspace administrator membership is no longer active.');}
  };
  const audit = (q, {tenantId=null,actorId=null,action,resourceId,previous=null,current,reason}) =>
    q(`INSERT INTO dbo.management_billing_audit(tenant_id,actor_id,action,resource_id,previous_hash,current_hash,reason)
      VALUES(@tenantId,@actorId,@action,@resourceId,@previous,@current,@reason)`,
    {tenantId,actorId,action,resourceId,previous:previous === null ? null : hash(previous),current:hash(current),reason});
  const pendingStock=async(tenantId,q=read)=>stagingEnabled()?q(`SELECT * FROM dbo.management_inventory_staging
    WHERE tenant_id=@tenantId AND status='pending' ORDER BY id`,{tenantId}):[];
  const inventory = async (tenantId, q = read, {includePending=false,stageIds=null}={}) => {
    const properties = await q('SELECT id,tenant_id,name,propertytype FROM dbo.properties WHERE tenant_id=@tenantId',{tenantId});
    // Deliberately includes malformed cross-tenant child relationships so the contract rejects them.
    const units = await q(`SELECT u.id,u.tenant_id,u.propertyid,u.unitnumber FROM dbo.property_units u
      JOIN dbo.properties p ON p.id=u.propertyid WHERE p.tenant_id=@tenantId`,{tenantId});
    if(cessationEnabled()){
      const controls=await q("SELECT property_id,unit_id FROM dbo.management_inventory_controls WHERE tenant_id=@tenantId AND state='ceased'",{tenantId});
      for(const property of properties){if(controls.some(c=>!c.unit_id&&String(c.property_id).toLowerCase()===String(property.id).toLowerCase())){property.management_state='ceased';}}
      for(const unit of units){if(controls.some(c=>c.unit_id&&String(c.unit_id).toLowerCase()===String(unit.id).toLowerCase())){unit.management_state='ceased';}}
    }
    const staged=includePending?(await pendingStock(tenantId,q)).filter(row=>!stageIds||stageIds.includes(String(row.id).toLowerCase())):[];
    staged.sort((a,b)=>a.kind===b.kind?String(a.id).localeCompare(String(b.id)):a.kind==='property'?-1:1);
    for(const row of staged){
      const payload=JSON.parse(row.payload_json);
      if(row.payload_hash!==hash(payload)||String(payload.id).toLowerCase()!==String(row.id).toLowerCase())
        {throw problem(409,'BILLING_STOCK_CHANGED','Prepared stock needs review before continuing.');}
      if(row.kind==='property'){properties.push({...payload,tenant_id:tenantId});}
      else{
        const parent=properties.find(p=>String(p.id).toLowerCase()===payload.propertyid);
        const stagedParent=staged.some(s=>s.kind==='property'&&String(s.id).toLowerCase()===payload.propertyid);
        // Split/restoration timing is a separate governed transition. Adding a
        // child must never silently replace an existing whole managed dwelling.
        if(!parent||(!stagedParent&&!units.some(u=>String(u.propertyid).toLowerCase()===payload.propertyid)))
          {throw problem(409,'BILLING_STOCK_PARENT','Choose an existing multi-unit property or prepare the new building and its units together.');}
        units.push({...payload,tenant_id:tenantId});
      }
    }
    const items=dwellingInventory({tenantId,properties,units});
    if(!staged.length){return items;}
    for(const row of staged){
      const payload=JSON.parse(row.payload_json),propertyId=row.kind==='property'?payload.id:payload.propertyid;
      if(!items.some(item=>String(item.propertyId).toLowerCase()===propertyId))
        {throw problem(409,'BILLING_STOCK_PARENT','Prepared units must belong to a residential property in this organization.');}
    }
    const stagedRecords=staged.map(row=>({id:String(row.id).toLowerCase(),hash:row.payload_hash}));
    return items.map((item,index)=>index===0?{...item,stagedRecords}:item);
  };
  const stageStock=({tenantId,actorId,records,reason})=>{
    if(!stagingEnabled()){throw problem(503,'BILLING_STOCK_UNAVAILABLE','Preparing additions is not available yet.');}
    const normalized=stagedStock(records);
    validateImages(normalized,tenantId);
    const note=decisionReason(reason);
    return locked(tenantId,async q=>{
      await assertActor(q,tenantId,actorId);
      const enrolled=await account(tenantId,q);
      if(enrolled&&normalized.some(r=>r.kind==='property'&&r.payload.country_code!==enrolled.market))
        {throw problem(409,'BILLING_STOCK_MARKET','Prepare stock in the workspace’s enrolled billing market.');}
      if((await q(`SELECT TOP 1 id FROM dbo.management_billing_commands WHERE tenant_id=@tenantId AND status='pending'`,{tenantId})).length)
        {throw problem(409,'BILLING_COMMAND_PENDING','Finish the pending billing operation before preparing more stock.');}
      let changed=false;
      for(const {kind,payload} of normalized){
        const existing=(await q('SELECT * FROM dbo.management_inventory_staging WHERE id=@id',{id:payload.id}))[0];
        if(existing){
          if(String(existing.tenant_id).toLowerCase()!==tenantId.toLowerCase()||existing.kind!==kind||existing.payload_hash!==hash(payload))
            {throw problem(409,'BILLING_STOCK_CONFLICT','This record identifier already belongs to different stock.');}
          if(existing.status==='withdrawn'){throw problem(409,'BILLING_STOCK_WITHDRAWN','This prepared record was withdrawn. Prepare a new record to continue.');}
          continue;
        }
        if((await q(`SELECT id FROM dbo.properties WHERE id=@id UNION ALL SELECT id FROM dbo.property_units WHERE id=@id`,{id:payload.id})).length)
          {throw problem(409,'BILLING_STOCK_CONFLICT','This property or unit already exists.');}
        await q(`INSERT INTO dbo.management_inventory_staging(id,tenant_id,kind,payload_json,payload_hash,created_by)
          VALUES(@id,@tenantId,@kind,@payload,@digest,@actorId)`,
        {id:payload.id,tenantId,kind,payload:JSON.stringify(payload),digest:hash(payload),actorId});
        changed=true;
      }
      if((await pendingStock(tenantId,q)).length>1000){throw problem(409,'BILLING_STOCK_LIMIT','Review the pending additions before preparing more stock.');}
      await inventory(tenantId,q,{includePending:true});
      if(changed){await audit(q,{tenantId,actorId,action:'inventory.staged',resourceId:normalized[0].payload.id,
        current:normalized.map(r=>({id:r.payload.id,kind:r.kind,hash:hash(r.payload)})),reason:note});}
      return {prepared:normalized.map(r=>r.payload.id),status:'pending'};
    });
  };
  const withdrawStock=({tenantId,actorId,ids,reason})=>{
    if(!stagingEnabled()){throw problem(503,'BILLING_STOCK_UNAVAILABLE','Preparing additions is not available yet.');}
    if(!Array.isArray(ids)||!ids.length||ids.length>1000){throw problem(400,'BILLING_STOCK_INVALID','Choose the prepared records to withdraw.');}
    const selected=[...new Set(ids.map(identifier))],note=decisionReason(reason);
    return locked(tenantId,async q=>{
      await assertActor(q,tenantId,actorId);
      if((await q(`SELECT TOP 1 id FROM dbo.management_billing_commands WHERE tenant_id=@tenantId AND status='pending'`,{tenantId})).length)
        {throw problem(409,'BILLING_COMMAND_PENDING','Finish the pending billing operation before withdrawing prepared stock.');}
      const current=await account(tenantId,q),snapshot=JSON.parse(current?.inventory_json||'[]');
      const bound=snapshot[0]?.stagedRecords?.some(ref=>selected.includes(ref.id));
      if(bound&&(await q(`SELECT TOP 1 id FROM dbo.management_billing_commands WHERE tenant_id=@tenantId AND kind='checkout' AND status='completed'`,{tenantId})).length)
        {throw problem(409,'BILLING_STOCK_CHECKOUT_PENDING','Checkout already includes this stock. Resolve that checkout before withdrawing it.');}
      let changed=false;
      for(const id of selected){
        const row=(await q('SELECT * FROM dbo.management_inventory_staging WHERE id=@id AND tenant_id=@tenantId',{id,tenantId}))[0];
        if(!row){throw problem(404,'BILLING_STOCK_NOT_FOUND','Prepared stock was not found in this workspace.');}
        if(row.status==='promoted'){throw problem(409,'BILLING_CESSATION_REQUIRED','Managed stock requires management-cessation checks. It has not been removed.');}
        if(row.status==='withdrawn'){continue;}
        await q(`UPDATE dbo.management_inventory_staging SET status='withdrawn',withdrawn_at=SYSUTCDATETIME() WHERE id=@id AND tenant_id=@tenantId`,{id,tenantId});
        changed=true;
      }
      const remaining=await inventory(tenantId,q,{includePending:true});
      if(bound){await q('UPDATE dbo.management_billing_accounts SET inventory_json=@inventory,version=version+1 WHERE tenant_id=@tenantId',
        {tenantId,inventory:JSON.stringify(remaining)});}
      if(changed){await audit(q,{tenantId,actorId,action:'inventory.withdrawn',resourceId:selected[0],current:{ids:selected},reason:note});}
      return {withdrawn:selected};
    });
  };
  const promoteStock=async(q,{tenantId,snapshot,commandId})=>{
    const refs=snapshot?.[0]?.stagedRecords;
    if(!refs?.length){return;}
    if(!stagingEnabled()){throw problem(503,'BILLING_STOCK_UNAVAILABLE','Prepared stock confirmation is not available yet.');}
    const command=(await q(`SELECT id FROM dbo.management_billing_commands WHERE id=@commandId AND tenant_id=@tenantId
      AND kind IN('checkout','quantity_apply') AND status IN('pending','completed')`,{commandId,tenantId}))[0];
    if(!command){throw problem(409,'BILLING_STOCK_CONFIRMATION','A matching billing confirmation is required.');}
    const current=(await q(`SELECT *,SYSUTCDATETIME() AS checked_at FROM dbo.management_billing_accounts WITH(UPDLOCK,HOLDLOCK)
      WHERE tenant_id=@tenantId`,{tenantId}))[0];
    if(!current||current.stripe_account_id!==BILLING_ACCOUNT||!current.initial_payment_verified||
      !(current.checked_at instanceof Date)||!Number.isFinite(current.checked_at.getTime())||current.subscription_status!=='active'||
      Date.parse(current.paid_through||'')<=current.checked_at.getTime()||!Number.isFinite(Date.parse(current.paid_through||''))||
      current.risk_hold||current.quantity<snapshot.length)
      {throw problem(409,'BILLING_STOCK_CONFIRMATION','Paid subscription confirmation is required before stock becomes managed.');}
    const stageIds=refs.map(ref=>ref.id);
    const expected=await inventory(tenantId,q,{includePending:true,stageIds});
    if(hash(expected)!==hash(snapshot)){throw problem(409,'BILLING_STOCK_CHANGED','Prepared stock changed. Review the billing confirmation before continuing.');}
    const selected=(await pendingStock(tenantId,q)).filter(row=>stageIds.includes(String(row.id).toLowerCase()));
    // Parent inserts precede child inserts regardless of caller/import ordering.
    selected.sort((a,b)=>a.kind===b.kind?String(a.id).localeCompare(String(b.id)):a.kind==='property'?-1:1);
    for(const row of selected){
      const payload=JSON.parse(row.payload_json);
      // Availability is preparation metadata, never a caller-selected SQL column.
      const columns=Object.keys(payload).filter(key=>key!=='availability');
      const params={tenantId,id:row.id,commandId,availability:payload.availability||'available'};
      columns.forEach((key,i)=>{params[`v${i}`]=payload[key]!==null&&typeof payload[key]==='object'?JSON.stringify(payload[key]):payload[key];});
      // Fields are revalidated even for persisted payloads before constructing SQL.
      validateImages(stagedStock([{kind:row.kind,payload}]),tenantId);
      await q(`INSERT INTO dbo.${row.kind==='property'?'properties':'property_units'}
        (tenant_id,status,${columns.map(c=>`[${c}]`).join(',')}) VALUES(@tenantId,@availability,${columns.map((_c,i)=>`@v${i}`).join(',')});
        UPDATE dbo.management_inventory_staging SET status='promoted',promoted_at=SYSUTCDATETIME(),promotion_command_id=@commandId
        WHERE id=@id AND tenant_id=@tenantId AND status='pending';`,params);
    }
    await audit(q,{tenantId,action:'inventory.promoted',resourceId:commandId,current:refs,
      reason:'Prepared stock promoted only after verified billing confirmation.'});
  };
  const cessationPreviewLocked=async(q,{tenantId,actorId,propertyId,unitId=null,commandId=null})=>{
    if(!cessationEnabled()){throw problem(503,'BILLING_CESSATION_UNAVAILABLE','Ending management is not available yet.');}
    await assertActor(q,tenantId,actorId);
    const params={tenantId,propertyId:identifier(propertyId),unitId:unitId===null?null:identifier(unitId),commandId};
    const property=(await q('SELECT id,name FROM dbo.properties WITH(UPDLOCK,HOLDLOCK) WHERE id=@propertyId AND tenant_id=@tenantId',params))[0];
    if(!property){throw problem(404,'BILLING_STOCK_NOT_FOUND','This property was not found in the workspace.');}
    const unit=params.unitId?(await q('SELECT id,unitnumber FROM dbo.property_units WITH(UPDLOCK,HOLDLOCK) WHERE id=@unitId AND propertyid=@propertyId AND tenant_id=@tenantId',params))[0]:null;
    if(params.unitId&&!unit){throw problem(404,'BILLING_STOCK_NOT_FOUND','This unit was not found in the property.');}
    const existing=(await q(`SELECT * FROM dbo.management_inventory_controls WHERE tenant_id=@tenantId AND property_id=@propertyId
      AND (unit_id IS NULL OR unit_id=@unitId)`,params))[0]||null;
    const items=await inventory(tenantId,q);
    if(existing){return {propertyId:params.propertyId,unitId:params.unitId,label:unit?`${property.name} · ${unit.unitnumber}`:property.name,
      alreadyCeased:true,record:existing,inventoryHash:hash(items),eligible:true,blockers:[]};}
    const agreements=await q(`SELECT id,status FROM dbo.agreements WITH(UPDLOCK,HOLDLOCK) WHERE tenant_id=@tenantId AND propertyid=@propertyId
      AND (@unitId IS NULL OR unitid IS NULL OR unitid=@unitId)`,params);
    const invoices=await q(`SELECT i.id,i.status,i.totalamount,
      COALESCE((SELECT SUM(p.amount) FROM dbo.payments p WHERE p.tenant_id=i.tenant_id AND p.invoiceid=i.id AND p.status='verified'),0) AS paid,
      i.totalamount-COALESCE((SELECT SUM(p.amount) FROM dbo.payments p WHERE p.tenant_id=i.tenant_id AND p.invoiceid=i.id AND p.status='verified'),0) AS outstanding
      FROM dbo.invoices i WITH(UPDLOCK,HOLDLOCK) LEFT JOIN dbo.agreements a ON a.id=i.agreementid AND a.tenant_id=i.tenant_id
      WHERE i.tenant_id=@tenantId AND (i.propertyid=@propertyId OR a.propertyid=@propertyId)
      AND (@unitId IS NULL OR a.id IS NULL OR a.unitid IS NULL OR a.unitid=@unitId)`,params);
    const payments=await q(`SELECT p.id FROM dbo.payments p WITH(UPDLOCK,HOLDLOCK)
      LEFT JOIN dbo.invoices i ON i.id=p.invoiceid AND i.tenant_id=p.tenant_id
      LEFT JOIN dbo.agreements a ON a.id=i.agreementid AND a.tenant_id=i.tenant_id
      WHERE p.tenant_id=@tenantId AND (p.propertyid=@propertyId OR i.propertyid=@propertyId OR a.propertyid=@propertyId)
      AND (@unitId IS NULL OR a.id IS NULL OR a.unitid IS NULL OR a.unitid=@unitId)
      AND LOWER(COALESCE(p.status,'')) NOT IN('verified','rejected')`,params);
    const settlements=await q(`SELECT s.id FROM dbo.tenancy_settlements s WITH(UPDLOCK,HOLDLOCK)
      JOIN dbo.agreements a ON a.id=s.agreement_id AND a.tenant_id=s.tenant_id WHERE s.tenant_id=@tenantId AND a.propertyid=@propertyId
      AND (@unitId IS NULL OR a.unitid IS NULL OR a.unitid=@unitId) AND LOWER(COALESCE(s.status,'')) NOT IN('settled','voided')`,params);
    const deposits=await q(`SELECT d.id FROM dbo.tenancy_deposit_transactions d WITH(UPDLOCK,HOLDLOCK)
      JOIN dbo.agreements a ON a.id=d.agreement_id AND a.tenant_id=d.tenant_id WHERE d.tenant_id=@tenantId AND a.propertyid=@propertyId
      AND (@unitId IS NULL OR a.unitid IS NULL OR a.unitid=@unitId) AND
      (LOWER(COALESCE(d.status,'')) NOT IN('received','refunded','rejected','voided') OR (d.status='received' AND d.amount>0 AND
        NOT EXISTS(SELECT 1 FROM dbo.tenancy_settlements s WHERE s.agreement_id=a.id AND s.tenant_id=a.tenant_id AND s.status='settled')))`,params);
    const maintenance=await q(`SELECT id FROM dbo.maintenance_requests WITH(UPDLOCK,HOLDLOCK) WHERE tenant_id=@tenantId AND propertyid=@propertyId
      AND (@unitId IS NULL OR unitid IS NULL OR unitid=@unitId) AND LOWER(COALESCE(status,'')) NOT IN('completed','cancelled')`,params);
    const holds=await q(`SELECT h.enquiry_id FROM dbo.property_rental_offers h WITH(UPDLOCK,HOLDLOCK) WHERE h.tenant_id=@tenantId AND h.property_id=@propertyId
      AND (@unitId IS NULL OR h.unit_id IS NULL OR h.unit_id=@unitId)
      AND ((h.status='offered' AND h.offer_until>SYSUTCDATETIME()) OR (h.status IN('accepted','agreement') AND h.hold_until>SYSUTCDATETIME()))
      AND NOT EXISTS(SELECT 1 FROM dbo.agreements a WHERE a.id=h.agreement_id AND a.tenant_id=h.tenant_id AND a.status='closed')`,params);
    const pending=await q(`SELECT id FROM dbo.management_billing_commands WHERE tenant_id=@tenantId AND status='pending'
      AND (@commandId IS NULL OR id<>@commandId)`,params);
    const staged=await q(`SELECT id FROM dbo.management_inventory_staging WHERE tenant_id=@tenantId AND status='pending'
      AND ((kind='property' AND id=@propertyId) OR (kind='unit' AND TRY_CONVERT(UNIQUEIDENTIFIER,JSON_VALUE(payload_json,'$.propertyid'))=@propertyId))`,params);
    const current=await account(tenantId,q);
    const blockers=cessationBlockers({agreements,invoices,payments,settlements,deposits,maintenance,holds,pending,staged,riskHold:Boolean(current?.risk_hold)});
    return {propertyId:params.propertyId,unitId:params.unitId,label:unit?`${property.name} · ${unit.unitnumber}`:property.name,
      alreadyCeased:false,inventoryHash:hash(items),eligible:!blockers.length,blockers};
  };
  const ceaseStockLocked=async(q,{tenantId,actorId,id,propertyId,unitId=null,inventoryHash,reason})=>{
    const note=decisionReason(reason);
    const preview=await cessationPreviewLocked(q,{tenantId,actorId,propertyId,unitId,commandId:id});
    if(preview.alreadyCeased){return preview;}
    if(preview.inventoryHash!==inventoryHash){throw problem(409,'BILLING_INVENTORY_CHANGED','Managed stock changed. Review ending management again.');}
    if(!preview.eligible){throw problem(409,'BILLING_CESSATION_BLOCKED',preview.blockers.map(b=>b.message).join(' '));}
    // Suppress availability before inserting the durable control. This also
    // keeps older readers safe on rollback, without using status for billing.
    const params={tenantId,propertyId:preview.propertyId,unitId:preview.unitId,id:identifier(id),actorId,reason:note};
    if(params.unitId){await q("UPDATE dbo.property_units SET status='inactive' WHERE id=@unitId AND propertyid=@propertyId AND tenant_id=@tenantId",params);}
    else{
      await q("UPDATE dbo.properties SET status='inactive' WHERE id=@propertyId AND tenant_id=@tenantId",params);
      await q("UPDATE dbo.property_units SET status='inactive' WHERE propertyid=@propertyId AND tenant_id=@tenantId AND LOWER(COALESCE(status,''))<>'inactive'",params);
    }
    const record=(await q(`INSERT INTO dbo.management_inventory_controls(id,tenant_id,property_id,unit_id,ceased_by,reason)
      OUTPUT INSERTED.* VALUES(@id,@tenantId,@propertyId,@unitId,@actorId,@reason)`,params))[0];
    await audit(q,{tenantId,actorId,action:'inventory.ceased',resourceId:id,current:{propertyId:params.propertyId,unitId:params.unitId},reason:note});
    return {...preview,record};
  };
  const listPricing = async () => (await read('SELECT * FROM dbo.management_pricing_versions ORDER BY created_at DESC,version DESC'))
    .map(row => ({...row,rules:JSON.parse(row.rules_json),rules_json:undefined}));
  const savePricing = async ({rules,expectedVersion,actorId}) => locked(`pricing:${rules.market}`, async q => {
    const latest = (await q('SELECT MAX(version) AS version FROM dbo.management_pricing_versions WHERE market=@market',{market:rules.market}))[0];
    if ((latest?.version || 0) !== expectedVersion) {throw problem(409,'BILLING_STALE_VERSION','Pricing changed. Reload before saving a new version.');}
    const id = crypto.randomUUID();
    await q(`INSERT INTO dbo.management_pricing_versions(id,market,version,rules_json,created_by)
      VALUES(@id,@market,@version,@rules,@actorId)`,{id,market:rules.market,version:expectedVersion+1,rules:JSON.stringify(rules),actorId});
    await audit(q,{actorId,action:'pricing.draft_created',resourceId:id,current:rules,reason:rules.reason});
    return {id,version:expectedVersion+1};
  });
  const enroll = ({tenantId,actorId,reason,market,useApprovedSandboxBaseline=false}) => locked(tenantId,async q => {
    const existing = await account(tenantId,q);
    if (existing) {return existing;}
    const tenant = (await q('SELECT id,[plan],status FROM dbo.tenants WHERE id=@tenantId',{tenantId}))[0];
    if (!tenant || tenant.plan !== 'development-testing' || tenant.status !== 'active')
      {throw problem(409,'BILLING_SANDBOX_WORKSPACE_REQUIRED','Sandbox billing is limited to an active development-testing workspace.');}
    if((await pendingStock(tenantId,q)).some(row=>row.kind==='property'&&JSON.parse(row.payload_json).country_code!==market))
      {throw problem(409,'BILLING_STOCK_MARKET','The prepared properties must match the selected billing market.');}
    const items = await inventory(tenantId,q,{includePending:true});
    if (!items.length) {throw problem(409,'BILLING_INVENTORY_EMPTY','Add residential inventory before enrolling this sandbox workspace.');}
    const selected=(await q(`SELECT TOP 1 id,stripe_price_id FROM dbo.management_pricing_versions
      WHERE market=@market AND status='sandbox_published' AND TRY_CONVERT(DATETIMEOFFSET,JSON_VALUE(rules_json,'$.effectiveAt'))<=SYSUTCDATETIME()
      ORDER BY TRY_CONVERT(DATETIMEOFFSET,JSON_VALUE(rules_json,'$.effectiveAt')) DESC,version DESC`,{market}))[0];
    if(!selected && !useApprovedSandboxBaseline) {throw problem(409,'BILLING_MARKET_UNCONFIGURED','Publish an effective market rule, or explicitly select the approved sandbox baseline.');}
    const selectedPrice=useApprovedSandboxBaseline?BILLING_PRICE:selected.stripe_price_id;
    const pricingVersion=useApprovedSandboxBaseline?null:selected.id;
    await q(`INSERT INTO dbo.management_billing_accounts(tenant_id,stripe_account_id,stripe_price_id,pricing_version_id,market,inventory_json)
      VALUES(@tenantId,@stripeAccount,@price,@pricingVersion,@market,@inventory)`,
      {tenantId,stripeAccount:BILLING_ACCOUNT,price:selectedPrice,pricingVersion,market,inventory:JSON.stringify(items)});
    await audit(q,{tenantId,actorId,action:'sandbox.enrolled',resourceId:tenantId,current:{inventory:items,market,price:selectedPrice,pricingVersion,useApprovedSandboxBaseline},reason});
    return account(tenantId,q);
  });
  const beginCommand = ({tenantId,id,kind,payload,actorId,recovery=false}) => locked(tenantId,async q => {
    if(recovery && (env.MANAGEMENT_RECOVERY_SCHEMA_READY!=='true'||kind!=='cancellation')){
      throw problem(503,'BILLING_RECOVERY_UNAVAILABLE','Billing recovery is not available.');
    }
    await assertActor(q,tenantId,actorId);
    const existing=(await q('SELECT * FROM dbo.management_billing_commands WHERE id=@id',{id}))[0];
    const digest=hash(payload);
    if(existing){
      if(String(existing.tenant_id).toLowerCase()!==tenantId.toLowerCase() || existing.kind!==kind || existing.payload_hash!==digest)
        {throw problem(409,'BILLING_REQUEST_CONFLICT','This request identifier belongs to a different operation.');}
      const journaled=recovery&&(await q('SELECT command_id FROM dbo.management_billing_recovery WHERE command_id=@id',{id})).length;
      if(!journaled&&existing.status==='pending' && clock.now()-new Date(existing.created_at).getTime()>23*3600000)
        {throw problem(409,'BILLING_RECONCILIATION_REQUIRED','An older interrupted operation needs reconciliation before retrying.');}
      return {...existing,createdNow:false};
    }
    const pending=(await q(`SELECT TOP 1 id FROM dbo.management_billing_commands WHERE tenant_id=@tenantId AND status='pending'`,{tenantId}))[0];
    if(pending) {throw problem(409,'BILLING_COMMAND_PENDING','Retry the unfinished billing operation before starting another.');}
    // Commit the provider ownership boundary before any external write. Keep
    // the caller payload hash unchanged so retries use the original binding.
    const current=['cancellation','quantity_apply','cessation'].includes(kind)?await account(tenantId,q):null;
    const storedPayload=current?{...payload,_subscriptionId:current.stripe_subscription_id}:payload;
    await q(`INSERT INTO dbo.management_billing_commands(id,tenant_id,kind,payload_hash,payload_json,status)
      VALUES(@id,@tenantId,@kind,@digest,@payload,'pending')`,{id,tenantId,kind,digest,payload:JSON.stringify(storedPayload)});
    if(recovery){
      if(!current?.stripe_subscription_id){throw problem(409,'BILLING_CANCELLATION_UNAVAILABLE','An active subscription is required.');}
      await q(`INSERT dbo.management_billing_recovery(command_id,actor_id,intent_json)
        VALUES(@id,@actorId,@intent)`,{id,actorId,intent:JSON.stringify({...storedPayload,
        customerId:current.stripe_customer_id,scheduleId:current.stripe_schedule_id||null})});
    }
    return {id,status:'pending',createdNow:true};
  });
  const completeCommand = (q,id,result) => q(`UPDATE dbo.management_billing_commands SET status='completed',result_json=@result,
    completed_at=SYSUTCDATETIME() WHERE id=@id`,{id,result:JSON.stringify(result)});
  const complimentaryStatus = async (tenantId, q = read) => {
    const current = await account(tenantId, q);
    if (!current || current.stripe_account_id !== BILLING_ACCOUNT) {
      throw problem(409, 'BILLING_NOT_ENROLLED', 'Enroll this sandbox workspace before managing complimentary access.');
    }
    return {version:current.version, mode:current.comp_type, expiresAt:current.comp_expires_at || null,
      entitlement:entitlement(current,clock.now()), riskHold:Boolean(current.risk_hold), liveChargingEnabled:false};
  };
  const setComplimentary = ({tenantId, actorId, ...input}) => locked(tenantId, async q => {
    const change = complimentaryChange(input,clock.now());
    const current = await account(tenantId, q);
    if (!current || current.stripe_account_id !== BILLING_ACCOUNT) {
      throw problem(409, 'BILLING_NOT_ENROLLED', 'Enroll this sandbox workspace before managing complimentary access.');
    }
    if (current.version !== change.expectedVersion) {
      throw problem(409, 'BILLING_STALE_VERSION', 'Billing changed. Reload and review the current access before saving.');
    }
    const compType = change.mode === 'revoke' ? null : change.mode;
    await q(`UPDATE dbo.management_billing_accounts SET comp_type=@compType,comp_expires_at=@expiry,
      version=version+1,updated_at=SYSUTCDATETIME() WHERE tenant_id=@tenantId`,
    {tenantId,compType,expiry:change.expiresAt ? new Date(change.expiresAt) : null});
    await audit(q, {tenantId,actorId,action:`sandbox.complimentary.${change.mode}`,resourceId:tenantId,
      previous:{type:current.comp_type,expiresAt:current.comp_expires_at},
      current:{type:compType,expiresAt:change.expiresAt},reason:change.reason});
    return complimentaryStatus(tenantId, q);
  });
  return {read,locked,account,assertActor,audit,inventory,listPricing,savePricing,enroll,beginCommand,completeCommand,
    complimentaryStatus,setComplimentary,stagingEnabled,pendingStock,stageStock,withdrawStock,promoteStock,
    cessationEnabled,cessationPreviewLocked,ceaseStockLocked};
};
