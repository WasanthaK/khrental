import fs from 'node:fs';
const columns={"property_rental_offers": {"enquiry_id": ["uniqueidentifier", 16, false], "tenant_id": ["uniqueidentifier", 16, false], "property_id": ["uniqueidentifier", 16, false], "unit_id": ["uniqueidentifier", 16, true], "unit_label": ["nvarchar", 200, true], "application_version": ["int", 4, false], "status": ["varchar", 20, false], "version": ["int", 4, false], "currency": ["char", 3, false], "rent": ["decimal", 9, false], "deposit": ["decimal", 9, false], "fees": ["decimal", 9, false], "start_date": ["date", 3, false], "end_date": ["date", 3, false], "terms": ["nvarchar", -1, false], "offer_until": ["datetime2", 8, false], "hold_until": ["datetime2", 8, false], "accepted_at": ["datetime2", 8, true], "consent_version": ["varchar",30,true], "agreement_id": ["uniqueidentifier", 16, true], "updated_at": ["datetime2", 8, false]}, "property_rental_offer_events": {"id": ["uniqueidentifier", 16, false], "enquiry_id": ["uniqueidentifier", 16, false], "actor_id": ["uniqueidentifier", 16, true], "request_id": ["uniqueidentifier", 16, true], "payload_hash": ["char", 64, true], "version": ["int", 4, false], "event_type": ["varchar", 30, false], "snapshot": ["nvarchar", -1, false], "created_at": ["datetime2", 8, false]}, "rental_offer_agreement_links": {"agreement_id": ["uniqueidentifier", 16, false], "enquiry_id": ["uniqueidentifier", 16, false], "accepted_version": ["int", 4, false], "application_version": ["int", 4, false], "unit_id": ["uniqueidentifier", 16, true], "rent": ["decimal", 9, false], "deposit": ["decimal", 9, false], "start_date": ["date", 3, false], "end_date": ["date", 3, false]}};
const checks={"CK_property_rental_offers_state": "status IN('offered','accepted','agreement','declined','withdrawn','expired','invalidated')", "CK_property_rental_offers_version": "version>0 AND application_version>0", "CK_property_rental_offers_money": "rent>0 AND deposit>=0 AND fees>=0", "CK_property_rental_offers_dates": "end_date>start_date AND hold_until>offer_until", "CK_property_rental_offers_currency": "currency IN('LKR','BND')", "CK_property_rental_offers_terms": "LEN(LTRIM(RTRIM(terms)))>0 AND LEN(terms)<=8000", "CK_property_rental_offers_acceptance": "status IN('offered','declined','withdrawn','expired','invalidated') OR (accepted_at IS NOT NULL AND consent_version IS NOT NULL AND consent_version='rental-offer-v1')", "CK_property_rental_offers_agreement": "status<>'agreement' OR agreement_id IS NOT NULL", "CK_property_rental_offer_events_json": "ISJSON(snapshot)=1", "CK_property_rental_offer_events_version": "version>0", "CK_property_rental_offer_events_request": "(actor_id IS NULL AND request_id IS NULL AND payload_hash IS NULL) OR (actor_id IS NOT NULL AND request_id IS NOT NULL AND payload_hash IS NOT NULL)", "CK_rental_offer_agreement_links_terms": "accepted_version>0 AND application_version>0 AND rent>0 AND deposit>=0 AND end_date>start_date"};
const fks=[["FK_property_rental_offers_enquiry", "enquiry_id", "property_enquiries", "id"], ["FK_property_rental_offers_property", "property_id", "properties", "id"], ["FK_property_rental_offers_tenant", "tenant_id", "tenants", "id"], ["FK_property_rental_offers_unit", "unit_id", "property_units", "id"], ["FK_property_rental_offers_agreement", "agreement_id", "agreements", "id"], ["FK_property_rental_offer_events_offer", "enquiry_id", "property_rental_offers", "enquiry_id"], ["FK_property_rental_offer_events_actor", "actor_id", "app_users", "id"], ["FK_rental_offer_agreement_links_agreement", "agreement_id", "agreements", "id"], ["FK_rental_offer_agreement_links_offer", "enquiry_id", "property_rental_offers", "enquiry_id"], ["FK_rental_offer_agreement_links_unit", "unit_id", "property_units", "id"]];
const norm=v=>String(v||'').toLowerCase().replace(/[\s\[\]()]/g,'');
const checkNorm=v=>norm(v).replace(/(\w+)notin((?:'[^']*',?)+)/g,(_,key,list)=>list.split(',').map(x=>key+'<>'+x).join('and')).replace(/(\w+)in((?:'[^']*',?)+)/g,(_,key,list)=>list.split(',').map(x=>key+'='+x).join('or')).split('or').sort().join('or');
const triggerNorm=v=>String(v||'').toLowerCase().replace(/create\s+(?:or\s+alter\s+)?trigger/,'trigger').replace(/\s+/g,'').trim();
export const inspectRentalOffers=async pool=>{
 const result=await pool.request().query(`
 SELECT t.name AS table_name,c.name,ty.name AS type_name,c.max_length,c.is_nullable,c.precision,c.scale
 FROM sys.tables t JOIN sys.columns c ON c.object_id=t.object_id JOIN sys.types ty ON ty.user_type_id=c.user_type_id
 WHERE t.schema_id=SCHEMA_ID('dbo') AND t.name IN('property_rental_offers','property_rental_offer_events','rental_offer_agreement_links');
 SELECT name,definition,is_disabled,is_not_trusted FROM sys.check_constraints
 WHERE parent_object_id IN(OBJECT_ID('dbo.property_rental_offers'),OBJECT_ID('dbo.property_rental_offer_events'),OBJECT_ID('dbo.rental_offer_agreement_links'));
 SELECT fk.name,c.name AS column_name,rt.name AS target,rc.name AS target_column,fk.is_disabled,fk.is_not_trusted,fk.delete_referential_action,fk.update_referential_action
 FROM sys.foreign_keys fk JOIN sys.foreign_key_columns fc ON fc.constraint_object_id=fk.object_id
 JOIN sys.columns c ON c.object_id=fc.parent_object_id AND c.column_id=fc.parent_column_id
 JOIN sys.tables rt ON rt.object_id=fc.referenced_object_id JOIN sys.columns rc ON rc.object_id=rt.object_id AND rc.column_id=fc.referenced_column_id
 WHERE fk.parent_object_id IN(OBJECT_ID('dbo.property_rental_offers'),OBJECT_ID('dbo.property_rental_offer_events'),OBJECT_ID('dbo.rental_offer_agreement_links'));
 SELECT t.name AS table_name,i.name,i.is_primary_key,i.is_unique,i.is_disabled,i.filter_definition,
 (SELECT STRING_AGG(CONVERT(NVARCHAR(MAX),c.name),',') WITHIN GROUP(ORDER BY ic.key_ordinal) FROM sys.index_columns ic JOIN sys.columns c ON c.object_id=ic.object_id AND c.column_id=ic.column_id WHERE ic.object_id=i.object_id AND ic.index_id=i.index_id AND ic.key_ordinal>0) AS keys
 FROM sys.tables t JOIN sys.indexes i ON i.object_id=t.object_id WHERE t.name IN('property_rental_offers','property_rental_offer_events','rental_offer_agreement_links') AND t.schema_id=SCHEMA_ID('dbo');
 SELECT name,is_disabled,OBJECT_DEFINITION(object_id) AS definition FROM sys.triggers WHERE name IN('TR_agreements_rental_occupancy','TR_property_applications_invalidate_rental_offer','TR_property_enquiries_invalidate_rental_offer');
 SELECT t.name AS table_name,c.name,d.definition FROM sys.tables t JOIN sys.columns c ON c.object_id=t.object_id JOIN sys.default_constraints d ON d.object_id=c.default_object_id WHERE t.name IN('property_rental_offers','property_rental_offer_events','rental_offer_agreement_links') AND t.schema_id=SCHEMA_ID('dbo');
 `);
 const [actual=[],actualChecks=[],actualFks=[],indexes=[],triggers=[],defaults=[]]=result.recordsets||[];
 const problems=[];
 for(const [table,fields] of Object.entries(columns)){
  for(const [name,[type,length,nullable]] of Object.entries(fields)){
   const c=actual.find(x=>x.table_name===table&&x.name===name);
   if(!c||c.type_name!==type||c.max_length!==length||Boolean(c.is_nullable)!==nullable||(type==='decimal'&&(c.precision!==18||c.scale!==2))){problems.push(table+'.'+name);}
  }
 }
 for(const [name,definition] of Object.entries(checks)){
  const c=actualChecks.find(x=>x.name===name);
  if(!c||c.is_disabled||c.is_not_trusted||checkNorm(c.definition)!==checkNorm(definition)){problems.push(name);}
 }
 for(const [name,column,target,targetColumn] of fks){
  const f=actualFks.find(x=>x.name===name);
  if(!f||f.column_name!==column||f.target!==target||f.target_column!==targetColumn||f.is_disabled||f.is_not_trusted||f.delete_referential_action||f.update_referential_action){problems.push(name);}
 }
 for(const [name,keys,unique,primary,filter] of [
  ['PK_rental_offer_agreement_links','agreement_id',true,true,''],['IX_rental_offer_agreement_links_enquiry','enquiry_id',false,false,''],
  ['PK_property_rental_offers','enquiry_id',true,true,''],['PK_property_rental_offer_events','id',true,true,''],
  ['IX_property_rental_offers_property','tenant_id,property_id,status,hold_until',false,false,''],
  ['UX_property_rental_offers_agreement','agreement_id',true,false,'agreement_idisnotnull'],
  ['UQ_property_rental_offer_events_version','enquiry_id,version',true,false,''],
  ['UX_property_rental_offer_events_request','actor_id,request_id',true,false,'request_idisnotnull']]){
  const i=indexes.find(x=>x.name===name);
  if(!i||i.is_disabled||Boolean(i.is_unique)!==unique||Boolean(i.is_primary_key)!==primary||i.keys!==keys||norm(i.filter_definition)!==filter){problems.push(name);}
 }
 const source=fs.readFileSync(new URL('../migrations/20261029_01_rental_offers_and_holds.sql',import.meta.url),'utf8');
 for(const match of source.matchAll(/EXEC\(N'((?:[^']|'')*)'\);/g)){
  const expected=match[1].replace(/''/g,"'");const name=expected.match(/TR_\w+/)[0];const t=triggers.find(x=>x.name===name);
  if(!t||t.is_disabled||triggerNorm(t.definition)!==triggerNorm(expected)){problems.push(name);}
 }
 for(const [table,name,definition] of [['property_rental_offers','updated_at','sysutcdatetime'],['property_rental_offer_events','id','newid'],['property_rental_offer_events','created_at','sysutcdatetime']]){
  if(!defaults.some(x=>x.table_name===table&&x.name===name&&norm(x.definition)===definition)){problems.push(table+'.'+name+'.default');}
 }
 return {satisfied:problems.length===0,detail:problems.length?'drift='+problems.join(','):'offer/event tables, constraints, indexes, foreign keys, defaults and exact enabled occupancy/revocation triggers OK'};
};
