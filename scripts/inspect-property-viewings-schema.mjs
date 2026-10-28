// Shared by the governed production runner and actual SQL Server proof.
// Missing or drifted schema is never accepted on table existence alone.
const columns={
  property_viewings:{enquiry_id:['uniqueidentifier',16,false],status:['varchar',20,false],
    starts_at:['datetime2',8,false],ends_at:['datetime2',8,false],timezone:['varchar',40,false],
    instructions:['nvarchar',1000,true],version:['int',4,false],updated_at:['datetime2',8,false]},
  property_viewing_events:{id:['uniqueidentifier',16,false],enquiry_id:['uniqueidentifier',16,false],
    actor_id:['uniqueidentifier',16,false],request_id:['uniqueidentifier',16,false],payload_hash:['char',64,false],
    status:['varchar',20,false],starts_at:['datetime2',8,false],ends_at:['datetime2',8,false],
    timezone:['varchar',40,false],instructions:['nvarchar',1000,true],version:['int',4,false],created_at:['datetime2',8,false]}
};
const norm=value=>String(value||'').toLowerCase().replace(/[\s\[\]()]/g,'');
const predicate=value=>norm(value).replace(/^(status|country_code)in(.+)$/,(_,key,list)=>
  list.split(',').map(v=>key+'='+v).join('or')).split('or').sort().join('or');
export const inspectPropertyViewings=async pool=>{
  const result=await pool.request().query(`
    SELECT t.name AS table_name,c.name,ty.name AS type_name,c.max_length,c.is_nullable
    FROM sys.tables t JOIN sys.columns c ON c.object_id=t.object_id
    JOIN sys.types ty ON ty.user_type_id=c.user_type_id
    WHERE t.schema_id=SCHEMA_ID('dbo') AND t.name IN('property_viewings','property_viewing_events');
    SELECT t.name AS table_name,i.name,i.is_unique,i.is_primary_key,i.is_disabled,i.filter_definition,
      (SELECT STRING_AGG(CONVERT(NVARCHAR(MAX),c.name),',') WITHIN GROUP(ORDER BY ic.key_ordinal)
       FROM sys.index_columns ic JOIN sys.columns c ON c.object_id=ic.object_id AND c.column_id=ic.column_id
       WHERE ic.object_id=i.object_id AND ic.index_id=i.index_id AND ic.key_ordinal>0) AS keys
    FROM sys.tables t JOIN sys.indexes i ON i.object_id=t.object_id
    WHERE t.schema_id=SCHEMA_ID('dbo') AND t.name IN('property_viewings','property_viewing_events');
    SELECT t.name AS table_name,pc.name AS column_name,rt.name AS referenced_table,rc.name AS referenced_column,
      fk.is_disabled,fk.is_not_trusted,fk.delete_referential_action,fk.update_referential_action
    FROM sys.foreign_keys fk JOIN sys.foreign_key_columns fc ON fc.constraint_object_id=fk.object_id
    JOIN sys.tables t ON t.object_id=fk.parent_object_id
    JOIN sys.columns pc ON pc.object_id=t.object_id AND pc.column_id=fc.parent_column_id
    JOIN sys.tables rt ON rt.object_id=fk.referenced_object_id
    JOIN sys.columns rc ON rc.object_id=rt.object_id AND rc.column_id=fc.referenced_column_id
    WHERE t.schema_id=SCHEMA_ID('dbo') AND rt.schema_id=SCHEMA_ID('dbo')
      AND t.name IN('property_viewings','property_viewing_events');
    SELECT name,definition,is_disabled,is_not_trusted FROM sys.check_constraints
    WHERE parent_object_id=OBJECT_ID('dbo.property_viewings');
    SELECT t.name AS table_name,c.name,d.definition
    FROM sys.tables t JOIN sys.columns c ON c.object_id=t.object_id
    JOIN sys.default_constraints d ON d.object_id=c.default_object_id
    WHERE t.schema_id=SCHEMA_ID('dbo') AND t.name IN('property_viewings','property_viewing_events');
  `);
  const [actual=[],indexes=[],fks=[],checks=[],defaults=[]]=result.recordsets||[];
  const problems=[];
  for(const [table,fields] of Object.entries(columns)){
    for(const [name,[type,length,nullable]] of Object.entries(fields)){
      const c=actual.find(x=>x.table_name===table&&x.name===name);
      if(!c||c.type_name!==type||c.max_length!==length||Boolean(c.is_nullable)!==nullable){problems.push(table+'.'+name);}
    }
    if(!indexes.some(x=>x.table_name===table&&x.is_primary_key&&!x.is_disabled&&x.keys===(table==='property_viewings'?'enquiry_id':'id'))){problems.push(table+'.primary_key');}
  }
  const neededIndexes=[
    ['property_viewing_events','UQ_property_viewing_events_request','actor_id,request_id',true],
    ['property_viewing_events','UQ_property_viewing_events_version','enquiry_id,version',true]
  ];
  for(const [table,name,keys,unique] of neededIndexes){
    const i=indexes.find(x=>x.table_name===table&&x.name===name);
    if(!i||i.is_disabled||Boolean(i.is_unique)!==unique||i.keys!==keys){problems.push(name);continue;}
    if(norm(i.filter_definition)){problems.push(name+'.filter');}
  }
  for(const [table,column,target,key] of [
    ['property_viewings','enquiry_id','property_enquiries','id'],
    ['property_viewing_events','enquiry_id','property_viewings','enquiry_id'],
    ['property_viewing_events','actor_id','app_users','id']]){
    if(!fks.some(x=>x.table_name===table&&x.column_name===column&&x.referenced_table===target&&
      x.referenced_column===key&&!x.is_disabled&&!x.is_not_trusted&&
      x.delete_referential_action===0&&x.update_referential_action===0)){problems.push(table+'.'+column+'.foreign_key');}
  }
  const neededChecks={
    CK_property_viewings_status:["statusin'requested','proposed','confirmed','cancelled','completed','no_show'"],
    CK_property_viewings_time:['datediff_bigsecond,starts_at,ends_at>=900anddatediff_bigsecond,starts_at,ends_at<=10800'],
    CK_property_viewings_zone:["timezone='asia/colombo'ortimezone='asia/brunei'"],
    CK_property_viewings_version:['version>0']
  };
  for(const [name,definitions] of Object.entries(neededChecks)){
    const c=checks.find(x=>x.name===name);
    if(!c||c.is_disabled||c.is_not_trusted||!definitions.some(d=>predicate(d)===predicate(c.definition))){problems.push(name);}
  }
  for(const [table,name,definition] of [
    ['property_viewings','updated_at','sysutcdatetime'],
    ['property_viewing_events','id','newid'],['property_viewing_events','created_at','sysutcdatetime']]){
    if(!defaults.some(d=>d.table_name===table&&d.name===name&&norm(d.definition)===definition)){problems.push(table+'.'+name+'.default');}
  }
  return {satisfied:problems.length===0,detail:problems.length?'Missing or drifted viewing schema: '+problems.join(','):'Viewing columns, primary/unique/scoped indexes, trusted foreign keys and checks verified.'};
};
