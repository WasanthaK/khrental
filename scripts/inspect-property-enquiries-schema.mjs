// Shared by the governed production runner and actual SQL Server proof.
// Missing or drifted schema is never accepted on table existence alone.
const columns={
  property_enquiries:{
    id:['uniqueidentifier',16,false],listing_public_id:['uniqueidentifier',16,false],
    tenant_id:['uniqueidentifier',16,false],property_id:['uniqueidentifier',16,false],
    seeker_id:['uniqueidentifier',16,false],seeker_name:['nvarchar',400,false],
    seeker_email:['nvarchar',640,false],country_code:['char',2,false],
    listing_title:['nvarchar',300,false],message:['nvarchar',4000,false],
    consent_version:['varchar',30,false],consent_at:['datetime2',8,false],
    request_id:['uniqueidentifier',16,false],payload_hash:['char',64,false],
    status:['varchar',20,false],owner_response:['nvarchar',4000,true],
    updated_by:['uniqueidentifier',16,true],created_at:['datetime2',8,false],
    updated_at:['datetime2',8,false],version:['int',4,false]
  },
  property_enquiry_events:{id:['uniqueidentifier',16,false],enquiry_id:['uniqueidentifier',16,false],
    actor_user_id:['uniqueidentifier',16,false],from_status:['varchar',20,true],
    to_status:['varchar',20,false],version:['int',4,false],response:['nvarchar',4000,true],
    created_at:['datetime2',8,false]}
};
const norm=value=>String(value||'').toLowerCase().replace(/[\s\[\]()]/g,'');
const predicate=value=>norm(value).replace(/^(status|country_code)in(.+)$/,(_,key,list)=>
  list.split(',').map(v=>key+'='+v).join('or')).split('or').sort().join('or');
export const inspectPropertyEnquiries=async pool=>{
  const result=await pool.request().query(`
    SELECT t.name AS table_name,c.name,ty.name AS type_name,c.max_length,c.is_nullable
    FROM sys.tables t JOIN sys.columns c ON c.object_id=t.object_id
    JOIN sys.types ty ON ty.user_type_id=c.user_type_id
    WHERE t.schema_id=SCHEMA_ID('dbo') AND t.name IN('property_enquiries','property_enquiry_events');
    SELECT t.name AS table_name,i.name,i.is_unique,i.is_primary_key,i.is_disabled,i.filter_definition,
      (SELECT STRING_AGG(CONVERT(NVARCHAR(MAX),c.name),',') WITHIN GROUP(ORDER BY ic.key_ordinal)
       FROM sys.index_columns ic JOIN sys.columns c ON c.object_id=ic.object_id AND c.column_id=ic.column_id
       WHERE ic.object_id=i.object_id AND ic.index_id=i.index_id AND ic.key_ordinal>0) AS keys
    FROM sys.tables t JOIN sys.indexes i ON i.object_id=t.object_id
    WHERE t.schema_id=SCHEMA_ID('dbo') AND t.name IN('property_enquiries','property_enquiry_events');
    SELECT t.name AS table_name,pc.name AS column_name,rt.name AS referenced_table,rc.name AS referenced_column,
      fk.is_disabled,fk.is_not_trusted,fk.delete_referential_action,fk.update_referential_action
    FROM sys.foreign_keys fk JOIN sys.foreign_key_columns fc ON fc.constraint_object_id=fk.object_id
    JOIN sys.tables t ON t.object_id=fk.parent_object_id
    JOIN sys.columns pc ON pc.object_id=t.object_id AND pc.column_id=fc.parent_column_id
    JOIN sys.tables rt ON rt.object_id=fk.referenced_object_id
    JOIN sys.columns rc ON rc.object_id=rt.object_id AND rc.column_id=fc.referenced_column_id
    WHERE t.schema_id=SCHEMA_ID('dbo') AND rt.schema_id=SCHEMA_ID('dbo')
      AND t.name IN('property_enquiries','property_enquiry_events');
    SELECT name,definition,is_disabled,is_not_trusted FROM sys.check_constraints
    WHERE parent_object_id=OBJECT_ID('dbo.property_enquiries');
    SELECT t.name AS table_name,c.name,d.definition
    FROM sys.tables t JOIN sys.columns c ON c.object_id=t.object_id
    JOIN sys.default_constraints d ON d.object_id=c.default_object_id
    WHERE t.schema_id=SCHEMA_ID('dbo') AND t.name IN('property_enquiries','property_enquiry_events');
  `);
  const [actual=[],indexes=[],fks=[],checks=[],defaults=[]]=result.recordsets||[];
  const problems=[];
  for(const [table,fields] of Object.entries(columns)){
    for(const [name,[type,length,nullable]] of Object.entries(fields)){
      const c=actual.find(x=>x.table_name===table&&x.name===name);
      if(!c||c.type_name!==type||c.max_length!==length||Boolean(c.is_nullable)!==nullable){problems.push(table+'.'+name);}
    }
    if(!indexes.some(x=>x.table_name===table&&x.is_primary_key&&!x.is_disabled&&x.keys==='id')){problems.push(table+'.primary_key');}
  }
  const neededIndexes=[
    ['property_enquiries','UQ_property_enquiries_request','seeker_id,request_id',true],
    ['property_enquiries','UX_property_enquiries_open','seeker_id,listing_public_id',true],
    ['property_enquiries','IX_property_enquiries_inbox','tenant_id,created_at,id',false],
    ['property_enquiries','IX_property_enquiries_seeker','seeker_id,created_at,id',false],
    ['property_enquiry_events','UQ_property_enquiry_events_version','enquiry_id,version',true]
  ];
  for(const [table,name,keys,unique] of neededIndexes){
    const i=indexes.find(x=>x.table_name===table&&x.name===name);
    if(!i||i.is_disabled||Boolean(i.is_unique)!==unique||i.keys!==keys){problems.push(name);continue;}
    const filter=norm(i.filter_definition);
    if(name==='UX_property_enquiries_open'){
      if(predicate(filter)!==predicate("statusin'pending','responded'")){problems.push(name+'.filter');}
    } else if(filter){problems.push(name+'.filter');}
  }
  for(const [table,column,target] of [
    ['property_enquiries','listing_public_id','public_listing_preferences'],
    ['property_enquiries','tenant_id','tenants'],['property_enquiries','property_id','properties'],
    ['property_enquiries','seeker_id','app_users'],['property_enquiry_events','enquiry_id','property_enquiries'],
    ['property_enquiry_events','actor_user_id','app_users']]){
    const key=column==='listing_public_id'?'public_id':'id';
    if(!fks.some(x=>x.table_name===table&&x.column_name===column&&x.referenced_table===target&&
      x.referenced_column===key&&!x.is_disabled&&!x.is_not_trusted&&
      x.delete_referential_action===0&&x.update_referential_action===0)){problems.push(table+'.'+column+'.foreign_key');}
  }
  const neededChecks={
    CK_property_enquiries_status:["statusin'pending','responded','closed','withdrawn'","status='pending'orstatus='responded'orstatus='closed'orstatus='withdrawn'"],
    CK_property_enquiries_country:["country_codein'lk','bn'","country_code='lk'orcountry_code='bn'"],
    CK_property_enquiries_message:['lenmessage>0']
  };
  for(const [name,definitions] of Object.entries(neededChecks)){
    const c=checks.find(x=>x.name===name);
    if(!c||c.is_disabled||c.is_not_trusted||!definitions.some(d=>predicate(d)===predicate(c.definition))){problems.push(name);}
  }
  for(const [table,name,definition] of [
    ['property_enquiries','id','newid'],['property_enquiries','version','1'],
    ['property_enquiries','status',"'pending'"],['property_enquiries','consent_at','sysutcdatetime'],
    ['property_enquiries','created_at','sysutcdatetime'],['property_enquiries','updated_at','sysutcdatetime'],
    ['property_enquiry_events','id','newid'],['property_enquiry_events','created_at','sysutcdatetime']]){
    if(!defaults.some(d=>d.table_name===table&&d.name===name&&norm(d.definition)===definition)){problems.push(table+'.'+name+'.default');}
  }
  return {satisfied:problems.length===0,detail:problems.length?'Missing or drifted enquiry schema: '+problems.join(','):'Enquiry columns, primary/unique/scoped indexes, trusted foreign keys and checks verified.'};
};
