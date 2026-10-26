import {getMssqlPool,sql} from '../mssql/pool.js';
// One durable per-market/detail minute bucket across all app replicas; no client identity stored.
// Defaults to restrictive, safe when app scales to two ACA instances.
export const consumeReadBudget=async(bucket,maxHits=120)=>{
  if(!['LK','BN','DETAIL'].includes(bucket))throw new Error('Unsupported budget.');
  const pool=await getMssqlPool(),tx=new sql.Transaction(pool);
  await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
  try{
    const req=new sql.Request(tx);
    req.input('bucket',sql.VarChar(10),bucket);
    req.input('maxHits',sql.Int,maxHits);
    const r=await req.query(`
      DECLARE @window DATETIME2=DATEADD(MINUTE,DATEDIFF(MINUTE,0,SYSUTCDATETIME()),0);
      DECLARE @hits INT,@from DATETIME2,@permit BIT=0;
      SELECT @hits=hits,@from=window_start FROM dbo.public_listing_read_buckets
        WITH(UPDLOCK,HOLDLOCK) WHERE bucket=@bucket;
      IF @from IS NULL BEGIN
        INSERT INTO dbo.public_listing_read_buckets(bucket,window_start,hits) VALUES(@bucket,@window,1);
        SET @permit=1;
      END
      ELSE IF @from < @window BEGIN
        UPDATE dbo.public_listing_read_buckets SET window_start=@window,hits=1 WHERE bucket=@bucket;
        SET @permit=1;
      END
      ELSE IF @hits<@maxHits BEGIN
        UPDATE dbo.public_listing_read_buckets SET hits=hits+1 WHERE bucket=@bucket;
        SET @permit=1;
      END
      SELECT @permit AS allowed;
    `);
    await tx.commit();
    return r.recordset?.[0]?.allowed===true||r.recordset?.[0]?.allowed===1;
  }catch(error){await tx.rollback().catch(()=>{});throw error;}
};
