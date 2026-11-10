export const managementBillingColumns={
  management_pricing_versions:['id','market','version','rules_json','status','stripe_price_id','created_by','created_at','published_at'],
  management_billing_accounts:['tenant_id','stripe_account_id','stripe_customer_id','stripe_subscription_id','stripe_item_id','stripe_schedule_id','stripe_price_id',
    'pricing_version_id','market',
    'subscription_status','initial_payment_verified','paid_through','grace_started_at','cancel_at_period_end','risk_hold','quantity','inventory_json','pending_quantity',
    'comp_type','comp_expires_at','version','created_at','updated_at'],
  management_billing_commands:['id','tenant_id','kind','payload_hash','payload_json','status','result_json','created_at','completed_at'],
  management_billing_events:['stripe_event_id','tenant_id','event_type','processed_at'],
  management_billing_audit:['id','tenant_id','actor_id','action','resource_id','previous_hash','current_hash','reason','created_at']
};
export const inspectManagementBilling=async pool=>{
  const result=await pool.request().query(`
    SELECT t.name AS table_name,c.name,ty.name AS type_name,c.max_length FROM sys.tables t
    JOIN sys.columns c ON c.object_id=t.object_id JOIN sys.types ty ON ty.user_type_id=c.user_type_id
    WHERE t.schema_id=SCHEMA_ID('dbo') AND t.name LIKE 'management[_]%';
    SELECT t.name AS table_name,i.name,i.is_unique,i.is_primary_key,i.is_disabled,i.filter_definition,
      (SELECT STRING_AGG(CONVERT(NVARCHAR(MAX),c.name),',') WITHIN GROUP(ORDER BY ic.key_ordinal)
      FROM sys.index_columns ic JOIN sys.columns c ON c.object_id=ic.object_id AND c.column_id=ic.column_id
      WHERE ic.object_id=i.object_id AND ic.index_id=i.index_id AND ic.key_ordinal>0) AS keys
    FROM sys.tables t JOIN sys.indexes i ON i.object_id=t.object_id
    WHERE t.schema_id=SCHEMA_ID('dbo') AND t.name LIKE 'management[_]%';
    SELECT name,is_disabled,is_not_trusted,definition FROM sys.check_constraints WHERE parent_object_id IN
      (SELECT object_id FROM sys.tables WHERE schema_id=SCHEMA_ID('dbo') AND name LIKE 'management[_]%');
    SELECT t.name AS table_name,c.name AS column_name,rt.name AS referenced_table,fk.is_disabled,fk.is_not_trusted,fk.delete_referential_action
    FROM sys.foreign_keys fk JOIN sys.foreign_key_columns fc ON fc.constraint_object_id=fk.object_id
    JOIN sys.tables t ON t.object_id=fk.parent_object_id JOIN sys.tables rt ON rt.object_id=fk.referenced_object_id
    JOIN sys.columns c ON c.object_id=t.object_id AND c.column_id=fc.parent_column_id
    WHERE t.schema_id=SCHEMA_ID('dbo') AND t.name LIKE 'management[_]%';
  `);
  const [columns=[],indexes=[],checks=[],fks=[]]=result.recordsets||[];
  const problems=[];
  for(const [table,fields] of Object.entries(managementBillingColumns)){
    for(const name of fields) if(!columns.some(c=>c.table_name===table&&c.name===name))problems.push(`${table}.${name}`);
    const key=table==='management_billing_accounts'?'tenant_id':table==='management_billing_events'?'stripe_event_id':'id';
    if(!indexes.some(i=>i.table_name===table&&i.is_primary_key&&!i.is_disabled&&i.keys===key))problems.push(`${table}.primary_key`);
  }
  const norm=value=>String(value||'').toLowerCase().replace(/[\s\[\]()]/g,'');
  for(const [name,keys,filter] of [['UQ_management_pricing_version','market,version',''],['UQ_management_billing_customer','stripe_customer_id','stripe_customer_idisnotnull'],['UQ_management_billing_subscription','stripe_subscription_id','stripe_subscription_idisnotnull']]){
    if(!indexes.some(i=>i.name===name&&i.is_unique&&!i.is_disabled&&i.keys===keys&&norm(i.filter_definition)===filter))problems.push(name);
  }
  for(const [name,fragment] of [['CK_management_pricing_market',"'lk'"],['CK_management_pricing_version','version>0'],['CK_management_pricing_json','isjsonrules_json=1'],
    ['CK_management_pricing_status',"'sandbox_published'"],['CK_management_billing_sandbox',"stripe_account_id='acct_1utgcdq4sarulnqa'"],
    ['CK_management_billing_inventory','isjsoninventory_json=1'],['CK_management_billing_quantities','quantity>=0'],['CK_management_billing_comp',"'ongoing'"],
    ['CK_management_billing_market',"'lk'"],
    ['CK_management_billing_commands_status',"'pending'"],['CK_management_billing_commands_payload','isjsonpayload_json=1'],['CK_management_billing_commands_result','isjsonresult_json=1']]){
    if(!checks.some(c=>c.name===name&&!c.is_disabled&&!c.is_not_trusted&&norm(c.definition).includes(fragment)))problems.push(name);
  }
  for(const [table,column,target] of [['management_pricing_versions','created_by','app_users'],['management_billing_accounts','tenant_id','tenants'],
    ['management_billing_accounts','pricing_version_id','management_pricing_versions'],
    ['management_billing_commands','tenant_id','management_billing_accounts'],['management_billing_events','tenant_id','management_billing_accounts'],
    ['management_billing_audit','tenant_id','tenants'],['management_billing_audit','actor_id','app_users']]){
    if(!fks.some(f=>f.table_name===table&&f.column_name===column&&f.referenced_table===target&&!f.is_disabled&&!f.is_not_trusted&&f.delete_referential_action===0))problems.push(`${table}.${column}.foreign_key`);
  }
  return {satisfied:problems.length===0,detail:problems.length?problems.join(', '):'Management billing schema, scoped identities and constraints verified.'};
};

export const inspectManagementInventoryStaging=async pool=>{
  const result=await pool.request().query(`
    SELECT c.name,ty.name AS type_name,c.max_length,c.is_nullable FROM sys.columns c
      JOIN sys.types ty ON ty.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID('dbo.management_inventory_staging');
    SELECT i.name,i.is_disabled,i.is_primary_key,
      (SELECT STRING_AGG(CONVERT(NVARCHAR(MAX),c.name),',') WITHIN GROUP(ORDER BY ic.key_ordinal)
       FROM sys.index_columns ic JOIN sys.columns c ON c.object_id=ic.object_id AND c.column_id=ic.column_id
       WHERE ic.object_id=i.object_id AND ic.index_id=i.index_id AND ic.key_ordinal>0) AS keys
      FROM sys.indexes i WHERE i.object_id=OBJECT_ID('dbo.management_inventory_staging');
    SELECT name,is_disabled,is_not_trusted,definition FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID('dbo.management_inventory_staging');
    SELECT c.name AS column_name,rt.name AS referenced_table,fk.is_disabled,fk.is_not_trusted,fk.delete_referential_action
      FROM sys.foreign_keys fk JOIN sys.foreign_key_columns fc ON fc.constraint_object_id=fk.object_id
      JOIN sys.tables rt ON rt.object_id=fk.referenced_object_id
      JOIN sys.columns c ON c.object_id=fk.parent_object_id AND c.column_id=fc.parent_column_id
      WHERE fk.parent_object_id=OBJECT_ID('dbo.management_inventory_staging');
  `);
  const [columns=[],indexes=[],checks=[],fks=[]]=result.recordsets||[],problems=[];
  for(const [name,type,length,nullable] of [['id','uniqueidentifier',16,false],['tenant_id','uniqueidentifier',16,false],
    ['kind','varchar',12,false],['payload_json','nvarchar',-1,false],['payload_hash','char',64,false],['status','varchar',12,false],
    ['created_by','uniqueidentifier',16,false],['created_at','datetime2',8,false],['promoted_at','datetime2',8,true],['withdrawn_at','datetime2',8,true],['promotion_command_id','uniqueidentifier',16,true]]){
    if(!columns.some(c=>c.name===name&&c.type_name===type&&c.max_length===length&&Boolean(c.is_nullable)===nullable))problems.push(name);
  }
  if(!indexes.some(i=>i.is_primary_key&&!i.is_disabled&&i.keys==='id'))problems.push('primary_key');
  if(!indexes.some(i=>i.name==='IX_management_inventory_pending'&&!i.is_disabled&&i.keys==='tenant_id,status,id'))problems.push('pending_index');
  const norm=value=>String(value||'').toLowerCase().replace(/[\s\[\]()]/g,'');
  const expected={CK_management_inventory_kind:["kind='unit'orkind='property'","kind='property'orkind='unit'"],
    CK_management_inventory_payload:['isjsonpayload_json=1'],
    CK_management_inventory_status:["status='withdrawn'orstatus='promoted'orstatus='pending'","status='pending'orstatus='promoted'orstatus='withdrawn'"],
    CK_management_inventory_promotion:["status='pending'andpromoted_atisnullandpromotion_command_idisnullandwithdrawn_atisnullorstatus='promoted'andpromoted_atisnotnullandpromotion_command_idisnotnullandwithdrawn_atisnullorstatus='withdrawn'andpromoted_atisnullandpromotion_command_idisnullandwithdrawn_atisnotnull"]};
  for(const [name,definitions] of Object.entries(expected))if(!checks.some(c=>c.name===name&&!c.is_disabled&&!c.is_not_trusted&&definitions.includes(norm(c.definition))))problems.push(name);
  for(const [column,target] of [['tenant_id','tenants'],['created_by','app_users'],['promotion_command_id','management_billing_commands']]){
    if(!fks.some(f=>f.column_name===column&&f.referenced_table===target&&!f.is_disabled&&!f.is_not_trusted&&f.delete_referential_action===0))problems.push(`${column}.foreign_key`);
  }
  return {satisfied:problems.length===0,detail:problems.length?problems.join(', '):'Pending stock identities and promotion constraints verified.'};
};
