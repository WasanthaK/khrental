import fs from 'node:fs';
export const inspectManagementRecovery=async pool=>{
  const result=await pool.request().query(`
    SELECT t.name AS table_name,c.name,ty.name AS type_name,c.is_nullable,c.max_length
    FROM sys.tables t JOIN sys.columns c ON c.object_id=t.object_id JOIN sys.types ty ON ty.user_type_id=c.user_type_id
    WHERE t.schema_id=SCHEMA_ID('dbo') AND t.name IN('management_billing_recovery','management_billing_steps');
    SELECT t.name AS table_name,i.is_primary_key,i.is_disabled,
      (SELECT STRING_AGG(CONVERT(NVARCHAR(MAX),c.name),',') WITHIN GROUP(ORDER BY ic.key_ordinal)
       FROM sys.index_columns ic JOIN sys.columns c ON c.object_id=ic.object_id AND c.column_id=ic.column_id
       WHERE ic.object_id=i.object_id AND ic.index_id=i.index_id AND ic.key_ordinal>0) AS keys
    FROM sys.tables t JOIN sys.indexes i ON i.object_id=t.object_id
    WHERE t.name IN('management_billing_recovery','management_billing_steps');
    SELECT definition,is_disabled,is_not_trusted FROM sys.check_constraints WHERE parent_object_id IN
      (OBJECT_ID('dbo.management_billing_recovery'),OBJECT_ID('dbo.management_billing_steps'));
    SELECT t.name AS table_name,c.name AS column_name,rt.name AS referenced_table,fk.is_disabled,fk.is_not_trusted
    FROM sys.foreign_keys fk JOIN sys.foreign_key_columns fc ON fc.constraint_object_id=fk.object_id
    JOIN sys.tables t ON t.object_id=fk.parent_object_id JOIN sys.tables rt ON rt.object_id=fk.referenced_object_id
    JOIN sys.columns c ON c.object_id=t.object_id AND c.column_id=fc.parent_column_id
    WHERE t.name IN('management_billing_recovery','management_billing_steps');
  `);
  const [columns=[],indexes=[],checks=[],fks=[]]=result.recordsets||[],problems=[];
  const expected={management_billing_recovery:{command_id:'uniqueidentifier',actor_id:'uniqueidentifier',intent_json:'nvarchar',state:'varchar',attempts:'int',
    lease_token:'uniqueidentifier',lease_until:'datetime2',next_attempt_at:'datetime2',updated_at:'datetime2',last_error:'varchar',completed_at:'datetime2'},
  management_billing_steps:{command_id:'uniqueidentifier',name:'varchar',input_hash:'char',input_json:'nvarchar',idempotency_key:'varchar',created_at:'datetime2',result_json:'nvarchar',completed_at:'datetime2'}};
  for(const [table,fields] of Object.entries(expected)){
    const nullable=table.endsWith('steps')?['result_json','completed_at']:['lease_token','lease_until','last_error','completed_at'];
    const lengths={intent_json:-1,state:24,last_error:80,name:60,input_hash:64,input_json:-1,idempotency_key:255,result_json:-1};
    for(const [name,type] of Object.entries(fields)){
      if(!columns.some(c=>c.table_name===table&&c.name===name&&c.type_name===type&&Boolean(c.is_nullable)===nullable.includes(name)
        &&(!(name in lengths)||c.max_length===lengths[name]))){problems.push(`${table}.${name}`);}
    }
    const keys=table.endsWith('steps')?'command_id,name':'command_id';
    if(!indexes.some(i=>i.table_name===table&&i.is_primary_key&&!i.is_disabled&&i.keys===keys)){problems.push(`${table}.primary_key`);}
  }
  if(!indexes.some(i=>i.table_name==='management_billing_recovery'&&!i.is_disabled&&i.keys==='state,next_attempt_at,lease_until')){problems.push('recovery.due_index');}
  const norm=s=>s.toLowerCase().replace(/[\s[\]()]/g,'');
  for(const expected of ['isjsonintent_json=1',"state='failed_needs_review'orstate='succeeded'orstate='running'orstate='pending'",'attempts>=0andattempts<=8',
    'isjsoninput_json=1','result_jsonisnullorisjsonresult_json=1']){
    if(!checks.some(c=>!c.is_disabled&&!c.is_not_trusted&&norm(c.definition)===expected)){problems.push(expected);}
  }
  for(const [table,column,target] of [['management_billing_recovery','command_id','management_billing_commands'],
    ['management_billing_recovery','actor_id','app_users'],['management_billing_steps','command_id','management_billing_recovery']]){
    if(!fks.some(f=>f.table_name===table&&f.column_name===column&&f.referenced_table===target&&!f.is_disabled&&!f.is_not_trusted)){problems.push(`${table}.${column}.foreign_key`);}
  }
  return {satisfied:problems.length===0,detail:problems.length?problems.join(', '):'Recovery journal, step identities, bounds and references verified.'};
};
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
    for(const name of fields) {if(!columns.some(c=>c.table_name===table&&c.name===name)){problems.push(`${table}.${name}`);}}
    const key=table==='management_billing_accounts'?'tenant_id':table==='management_billing_events'?'stripe_event_id':'id';
    if(!indexes.some(i=>i.table_name===table&&i.is_primary_key&&!i.is_disabled&&i.keys===key)){problems.push(`${table}.primary_key`);}
  }
  const norm=value=>String(value||'').toLowerCase().replace(/[\s[\]()]/g,'');
  for(const [name,keys,filter] of [['UQ_management_pricing_version','market,version',''],['UQ_management_billing_customer','stripe_customer_id','stripe_customer_idisnotnull'],['UQ_management_billing_subscription','stripe_subscription_id','stripe_subscription_idisnotnull']]){
    if(!indexes.some(i=>i.name===name&&i.is_unique&&!i.is_disabled&&i.keys===keys&&norm(i.filter_definition)===filter)){problems.push(name);}
  }
  for(const [name,fragment] of [['CK_management_pricing_market',"'lk'"],['CK_management_pricing_version','version>0'],['CK_management_pricing_json','isjsonrules_json=1'],
    ['CK_management_pricing_status',"'sandbox_published'"],['CK_management_billing_sandbox',"stripe_account_id='acct_1utgcdq4sarulnqa'"],
    ['CK_management_billing_inventory','isjsoninventory_json=1'],['CK_management_billing_quantities','quantity>=0'],['CK_management_billing_comp',"'ongoing'"],
    ['CK_management_billing_market',"'lk'"],
    ['CK_management_billing_commands_status',"'pending'"],['CK_management_billing_commands_payload','isjsonpayload_json=1'],['CK_management_billing_commands_result','isjsonresult_json=1']]){
    if(!checks.some(c=>c.name===name&&!c.is_disabled&&!c.is_not_trusted&&norm(c.definition).includes(fragment))){problems.push(name);}
  }
  for(const [table,column,target] of [['management_pricing_versions','created_by','app_users'],['management_billing_accounts','tenant_id','tenants'],
    ['management_billing_accounts','pricing_version_id','management_pricing_versions'],
    ['management_billing_commands','tenant_id','management_billing_accounts'],['management_billing_events','tenant_id','management_billing_accounts'],
    ['management_billing_audit','tenant_id','tenants'],['management_billing_audit','actor_id','app_users']]){
    if(!fks.some(f=>f.table_name===table&&f.column_name===column&&f.referenced_table===target&&!f.is_disabled&&!f.is_not_trusted&&f.delete_referential_action===0)){problems.push(`${table}.${column}.foreign_key`);}
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
    if(!columns.some(c=>c.name===name&&c.type_name===type&&c.max_length===length&&Boolean(c.is_nullable)===nullable)){problems.push(name);}
  }
  if(!indexes.some(i=>i.is_primary_key&&!i.is_disabled&&i.keys==='id')){problems.push('primary_key');}
  if(!indexes.some(i=>i.name==='IX_management_inventory_pending'&&!i.is_disabled&&i.keys==='tenant_id,status,id')){problems.push('pending_index');}
  const norm=value=>String(value||'').toLowerCase().replace(/[\s[\]()]/g,'');
  const expected={CK_management_inventory_kind:["kind='unit'orkind='property'","kind='property'orkind='unit'"],
    CK_management_inventory_payload:['isjsonpayload_json=1'],
    CK_management_inventory_status:["status='withdrawn'orstatus='promoted'orstatus='pending'","status='pending'orstatus='promoted'orstatus='withdrawn'"],
    CK_management_inventory_promotion:["status='pending'andpromoted_atisnullandpromotion_command_idisnullandwithdrawn_atisnullorstatus='promoted'andpromoted_atisnotnullandpromotion_command_idisnotnullandwithdrawn_atisnullorstatus='withdrawn'andpromoted_atisnullandpromotion_command_idisnullandwithdrawn_atisnotnull"]};
  for(const [name,definitions] of Object.entries(expected)){if(!checks.some(c=>c.name===name&&!c.is_disabled&&!c.is_not_trusted&&definitions.includes(norm(c.definition)))){problems.push(name);}}
  for(const [column,target] of [['tenant_id','tenants'],['created_by','app_users'],['promotion_command_id','management_billing_commands']]){
    if(!fks.some(f=>f.column_name===column&&f.referenced_table===target&&!f.is_disabled&&!f.is_not_trusted&&f.delete_referential_action===0)){problems.push(`${column}.foreign_key`);}
  }
  return {satisfied:problems.length===0,detail:problems.length?problems.join(', '):'Pending stock identities and promotion constraints verified.'};
};

export const inspectManagementCessation=async pool=>{
  const result=await pool.request().query(`
    SELECT c.name,ty.name AS type_name,c.max_length,c.is_nullable FROM sys.columns c
      JOIN sys.types ty ON ty.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID('dbo.management_inventory_controls');
    SELECT i.name,i.is_disabled,i.is_primary_key,i.is_unique,i.filter_definition,
      (SELECT STRING_AGG(CONVERT(NVARCHAR(MAX),c.name),',') WITHIN GROUP(ORDER BY ic.key_ordinal)
       FROM sys.index_columns ic JOIN sys.columns c ON c.object_id=ic.object_id AND c.column_id=ic.column_id
       WHERE ic.object_id=i.object_id AND ic.index_id=i.index_id AND ic.key_ordinal>0) AS keys
      FROM sys.indexes i WHERE i.object_id=OBJECT_ID('dbo.management_inventory_controls');
    SELECT name,is_disabled,is_not_trusted,definition FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID('dbo.management_inventory_controls');
    SELECT c.name AS column_name,rt.name AS referenced_table,fk.is_disabled,fk.is_not_trusted,fk.delete_referential_action
      FROM sys.foreign_keys fk JOIN sys.foreign_key_columns fc ON fc.constraint_object_id=fk.object_id
      JOIN sys.tables rt ON rt.object_id=fk.referenced_object_id JOIN sys.columns c ON c.object_id=fk.parent_object_id AND c.column_id=fc.parent_column_id
      WHERE fk.parent_object_id=OBJECT_ID('dbo.management_inventory_controls');
    SELECT name,is_disabled,OBJECT_DEFINITION(object_id) AS definition FROM sys.triggers WHERE name LIKE '%[_]management[_]cessation';
    SELECT c.name,d.definition FROM sys.columns c JOIN sys.default_constraints d ON d.object_id=c.default_object_id
      WHERE c.object_id=OBJECT_ID('dbo.management_inventory_controls');
  `);
  const [columns=[],indexes=[],checks=[],fks=[],triggers=[],defaults=[]]=result.recordsets||[],problems=[];
  for(const [name,type,length,nullable] of [['id','uniqueidentifier',16,false],['tenant_id','uniqueidentifier',16,false],
    ['property_id','uniqueidentifier',16,false],['unit_id','uniqueidentifier',16,true],['state','varchar',12,false],
    ['ceased_by','uniqueidentifier',16,false],['ceased_at','datetime2',8,false],['reason','nvarchar',2000,false]]){
    if(!columns.some(c=>c.name===name&&c.type_name===type&&c.max_length===length&&Boolean(c.is_nullable)===nullable)){problems.push(name);}
  }
  if(!indexes.some(i=>i.is_primary_key&&!i.is_disabled&&i.keys==='id')){problems.push('primary_key');}
  const restoration=columns.some(c=>c.name==='restored_at');
  if(!indexes.some(i=>i.name===(restoration?'UQ_management_inventory_active_resource':'UQ_management_inventory_resource')&&i.is_unique&&!i.is_disabled&&i.keys==='tenant_id,property_id,unit_id'&&(!restoration||String(i.filter_definition).replace(/[\s[\]()]/g,'').toLowerCase()==='restored_atisnull'))){problems.push('unique_resource');}
  const norm=v=>String(v||'').toLowerCase().replace(/[\s[\]()]/g,'');
  for(const [name,definition] of [['CK_management_inventory_control_state',"state='ceased'"],
    ['CK_management_inventory_control_reason','lenltrimrtrimreason>=10andlenltrimrtrimreason<=1000']]){
    if(!checks.some(c=>c.name===name&&!c.is_disabled&&!c.is_not_trusted&&norm(c.definition)===definition)){problems.push(name);}
  }
  for(const [column,target] of [['tenant_id','tenants'],['property_id','properties'],['unit_id','property_units'],['ceased_by','app_users']]){
    if(!fks.some(f=>f.column_name===column&&f.referenced_table===target&&!f.is_disabled&&!f.is_not_trusted&&f.delete_referential_action===0)){problems.push(`${column}.foreign_key`);}
  }
  for(const [name,definition] of [['state',"'ceased'"],['ceased_at','sysutcdatetime']]){if(!defaults.some(d=>d.name===name&&norm(d.definition)===definition)){problems.push(`${name}.default`);}}
  const triggerNorm=v=>String(v||'').toLowerCase().replace(/create\s+(?:or\s+alter\s+)?trigger/,'trigger').replace(/\s+/g,'').trim();
  const source=fs.readFileSync(new URL(restoration?'../migrations/20261112_02_management_restoration.sql':'../migrations/20261110_02_management_cessation.sql',import.meta.url),'utf8');
  for(const match of source.matchAll(/EXEC\(N'((?:[^']|'')*)'\);/g)){
    if(!match[1].startsWith('CREATE OR ALTER TRIGGER')){continue;}
    const expected=match[1].replace(/''/g,"'"),name=expected.match(/TR_\w+/)[0],actual=triggers.find(t=>t.name===name);
    if(!actual||actual.is_disabled||triggerNorm(actual.definition)!==triggerNorm(expected)){problems.push(name);}
  }
  return {satisfied:!problems.length,detail:problems.length?problems.join(', '):'Cessation identity, audit constraints and exact enabled domain guards verified.'};
};


export const inspectManagementRestoration=async pool=>{
  const base=await inspectManagementCessation(pool);
  const result=await pool.request().query(`
    SELECT c.name,ty.name AS type_name,c.is_nullable FROM sys.columns c JOIN sys.types ty ON ty.user_type_id=c.user_type_id
      WHERE c.object_id=OBJECT_ID('dbo.management_inventory_controls');
    SELECT name,definition,is_disabled,is_not_trusted FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID('dbo.management_inventory_controls');
    SELECT c.name,rt.name AS target,f.is_disabled,f.is_not_trusted FROM sys.foreign_keys f
      JOIN sys.foreign_key_columns fc ON fc.constraint_object_id=f.object_id JOIN sys.columns c ON c.object_id=f.parent_object_id AND c.column_id=fc.parent_column_id
      JOIN sys.tables rt ON rt.object_id=f.referenced_object_id WHERE f.parent_object_id=OBJECT_ID('dbo.management_inventory_controls');
  `);
  const [columns=[],checks=[],fks=[]]=result.recordsets||[],problems=base.satisfied?[]:[base.detail];
  for(const [name,type] of [['restored_at','datetime2'],['restored_by','uniqueidentifier'],['restoration_command_id','uniqueidentifier'],['restoration_reason','nvarchar']]){
    if(!columns.some(c=>c.name===name&&c.type_name===type&&c.is_nullable)){problems.push(name);}
  }
  for(const [name,target] of [['restored_by','app_users'],['restoration_command_id','management_billing_commands']]){
    if(!fks.some(f=>f.name===name&&f.target===target&&!f.is_disabled&&!f.is_not_trusted)){problems.push(name+'.foreign_key');}
  }
  const norm=s=>String(s||'').toLowerCase().replace(/[\s[\]()]/g,'');
  const expected='restored_atisnullandrestored_byisnullandrestoration_command_idisnullandrestoration_reasonisnullorrestored_atisnotnullandrestored_byisnotnullandrestoration_command_idisnotnullandrestoration_reasonisnotnullandrestored_at>=ceased_atandlenltrimrtrimrestoration_reason>=10andlenltrimrtrimrestoration_reason<=1000';
  if(!checks.some(c=>c.name==='CK_management_inventory_restoration'&&!c.is_disabled&&!c.is_not_trusted&&norm(c.definition)===expected)){problems.push('restoration.constraint');}
  return {satisfied:!problems.length,detail:problems.length?problems.join(', '):'Restoration metadata, active episode uniqueness and exact domain guards verified.'};
};

export const inspectManagementSplits=async pool=>{
  const base=await inspectManagementRestoration(pool),problems=base.satisfied?[]:[base.detail];
  const result=await pool.request().query(`
    SELECT t.name AS table_name,c.name,ty.name AS type_name,c.is_nullable FROM sys.columns c JOIN sys.tables t ON t.object_id=c.object_id
      JOIN sys.types ty ON ty.user_type_id=c.user_type_id WHERE t.name IN('management_inventory_splits','management_inventory_split_units','property_units');
    SELECT name,is_disabled,OBJECT_DEFINITION(object_id) AS definition FROM sys.triggers WHERE name IN('TR_units_split_identity','TR_agreements_split_inventory','TR_offers_split_inventory');
    SELECT name,is_disabled,is_not_trusted FROM sys.check_constraints WHERE parent_object_id IN(OBJECT_ID('dbo.management_inventory_splits'),OBJECT_ID('dbo.management_inventory_split_units'));
    SELECT name,is_unique,is_disabled,filter_definition FROM sys.indexes WHERE object_id=OBJECT_ID('dbo.management_inventory_splits');
    SELECT OBJECT_NAME(parent_object_id) AS table_name,is_disabled,is_not_trusted FROM sys.foreign_keys WHERE parent_object_id IN(OBJECT_ID('dbo.management_inventory_splits'),OBJECT_ID('dbo.management_inventory_split_units'));
  `);
  const [columns=[],triggers=[],checks=[],indexes=[],fks=[]]=result.recordsets||[];
  for(const [table,fields] of [['management_inventory_splits',[['command_id','uniqueidentifier'],['tenant_id','uniqueidentifier'],['property_id','uniqueidentifier'],['state','varchar'],['created_at','datetime2'],['activated_at','datetime2']]],
    ['management_inventory_split_units',[['id','uniqueidentifier'],['command_id','uniqueidentifier'],['payload_json','nvarchar'],['payload_hash','char']]],
    ['property_units',[['split_operation_id','uniqueidentifier'],['parent_stock_id','uniqueidentifier'],['stock_type','varchar']]]]){
    for(const [name,type] of fields){if(!columns.some(c=>c.table_name===table&&c.name===name&&c.type_name===type&&Boolean(c.is_nullable)===(table==='property_units'||name==='activated_at'))){problems.push(table+'.'+name);}}
  }
  if(checks.length!==3||checks.some(c=>c.is_disabled||c.is_not_trusted)){problems.push('split.constraints');}
  if(fks.length!==4||fks.some(f=>f.is_disabled||f.is_not_trusted)){problems.push('split.foreign_keys');}
  if(!indexes.some(i=>i.name==='UQ_management_split_parent'&&i.is_unique&&!i.is_disabled&&String(i.filter_definition).replace(/[\s[\]()]/g,'').toLowerCase()==="state<>'aborted'")){problems.push('split.parent_uniqueness');}
  const norm=v=>String(v||'').toLowerCase().replace(/create\s+(?:or\s+alter\s+)?trigger/,'trigger').replace(/\s+/g,'').trim();
  const source=fs.readFileSync(new URL('../migrations/20261112_03_management_splits.sql',import.meta.url),'utf8');
  for(const match of source.matchAll(/EXEC\(N'((?:[^']|'')*)'\);/g)){
    const expected=match[1].replace(/''/g,"'"),name=expected.match(/TR_\w+/)[0],actual=triggers.find(t=>t.name===name);
    if(!actual||actual.is_disabled||norm(actual.definition)!==norm(expected)){problems.push(name);}
  }
  return {satisfied:!problems.length,detail:problems.length?problems.join(', '):'Split reservations, parent uniqueness and exact domain guards verified.'};
};
