import crypto from 'node:crypto';
import { normalizeInvoiceDocumentSnapshot } from './invoicePdfCandidate.js';
import { issuedInvoiceArchivePath } from './issuedInvoiceArchiveCandidate.js';

// Draft-only SQL adapter. The real invoice issuance path does not yet write a
// canonical documentSnapshot + documentSnapshotSha256 to invoice_issued events.
// Missing, inconsistent or legacy issuance events always fail closed.
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
const error = (code,message) => {const e = new Error(message);e.code=code;throw e;};
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HASH = /^[0-9a-f]{64}$/;
const guid = v => {
  if(typeof v!=='string'||!GUID.test(v)) error('INVOICE_ARCHIVE_SCOPE_DENIED','Invalid archive identity.');
  return v.toLowerCase();
};
const ids = v => ({tenantId:guid(v.tenantId),invoiceId:guid(v.invoiceId)});
const snapshotEvidence = metadata => {
  try {
    const event=typeof metadata==='string'?JSON.parse(metadata):metadata;
    if (!event || !HASH.test(event.documentSnapshotSha256||''))return null;
    const snap=normalizeInvoiceDocumentSnapshot(event.documentSnapshot);
    const hash=sha256(JSON.stringify(snap));
    if(hash!==event.documentSnapshotSha256)return null;
    return {snapshot:snap,snapshotSha256:hash};
  } catch{return null;}
};
export const createInvoiceArchiveSqlCandidateAdapters = ({pool,sql}) => {
  if(!pool || typeof pool.request!=='function' || !sql || !sql.Transaction) {
    error('INVOICE_ARCHIVE_ADAPTER_REQUIRED','SQL Server pool and mssql driver required.');
  }
  const bind=(request,scope)=>request
    .input('tenantId',sql.UniqueIdentifier,scope.tenantId)
    .input('invoiceId',sql.UniqueIdentifier,scope.invoiceId);
  const one=async (db,statement,scope) =>
    (await bind(db.request(),scope).query(statement)).recordset?.[0]||null;
  const issue=async (db,scope,locked=false)=>{
    const inv=await one(db,
      'SELECT TOP 1 id,tenant_id,status FROM dbo.invoices '+
      (locked?'WITH (UPDLOCK,HOLDLOCK) ':'')+
      'WHERE tenant_id=@tenantId AND id=@invoiceId',scope);
    if(!inv || !inv.status || String(inv.status).toLowerCase()==='draft')return null;
    const ev=await one(db,
      "SELECT TOP 1 metadata FROM dbo.billing_lifecycle_events WHERE tenant_id=@tenantId "+
      "AND invoice_id=@invoiceId AND event_type='invoice_issued' "+
      'ORDER BY createdat DESC,id DESC',scope);
    const found=snapshotEvidence(ev?.metadata);
    if(!found || guid(found.snapshot.tenantId)!==scope.tenantId ||
        guid(found.snapshot.invoiceId)!==scope.invoiceId)return null;
    return {...scope,issued:true,snapshotSha256:found.snapshotSha256,snapshot:found.snapshot};
  };
  const stored=async (db,scope,locked=false)=>{
    const row=await one(db,
      'SELECT tenant_id,invoice_id,archive_version,pdf_sha256,snapshot_sha256,'+
      'object_path,byte_length,issued_snapshot_json FROM dbo.invoice_pdf_archives '+
      (locked?'WITH (UPDLOCK,HOLDLOCK) ':'')+
      'WHERE tenant_id=@tenantId AND invoice_id=@invoiceId',scope);
    if(!row)return null;
    return {
      tenantId:guid(row.tenant_id),invoiceId:guid(row.invoice_id),
      version:row.archive_version,bucket:'invoices',path:row.object_path,
      pdfSha256:row.pdf_sha256,snapshotSha256:row.snapshot_sha256,
      byteLength:row.byte_length,state:'committed',
      issuedSnapshotJson:row.issued_snapshot_json
    };
  };
  return {
    issuanceLedger:{loadIssued: scope=>issue(pool,ids(scope))},
    archiveLedger:{
      loadCommitted:scope=>stored(pool,ids(scope)),
      commitIfAbsent:async doc=>{
        const scope=ids(doc);
        if(doc.version!==1 || doc.bucket!=='invoices' ||
          !HASH.test(doc.pdfSha256||'') || !HASH.test(doc.snapshotSha256||'') ||
          !Number.isInteger(doc.byteLength)||doc.byteLength<100 ||
          doc.byteLength>5*1024*1024 ||
          doc.path!==issuedInvoiceArchivePath({...scope,pdfSha256:doc.pdfSha256})) {
          error('INVOICE_ARCHIVE_INVALID','Invalid archive descriptor.');
        }
        const actorId=guid(doc.actorUserId);
        let snap;
        try {snap=normalizeInvoiceDocumentSnapshot(JSON.parse(doc.issuedSnapshotJson));}
        catch {error('INVOICE_ARCHIVE_INVALID','Malformed canonical issued snapshot.');}
        const canonical=JSON.stringify(snap);
        if(guid(snap.tenantId)!==scope.tenantId ||
          guid(snap.invoiceId)!==scope.invoiceId ||
          canonical!==doc.issuedSnapshotJson ||
          sha256(canonical)!==doc.snapshotSha256) {
          error('INVOICE_ARCHIVE_ISSUANCE_MISMATCH','Archive payload differs from verified issuance.');
        }
        const tx=new sql.Transaction(pool);
        await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
        const db={request:()=>new sql.Request(tx)};
        try{
          const current=await issue(db,scope,true);
          if(!current || current.snapshotSha256!==doc.snapshotSha256 ||
             JSON.stringify(current.snapshot)!==canonical) {
            error('INVOICE_ARCHIVE_ISSUANCE_MISMATCH','Issued document hash differs or is missing.');
          }
          const existing=await stored(db,scope,true);
          if(existing){
            if(existing.pdfSha256!==doc.pdfSha256 ||
              existing.snapshotSha256!==doc.snapshotSha256 ||
              existing.path!==doc.path ||
              existing.byteLength!==doc.byteLength ||
              existing.issuedSnapshotJson!==canonical) {
              error('INVOICE_ARCHIVE_CONFLICT','Committed issued invoice is immutable.');
            }
            await tx.commit();return {outcome:'existing'};
          }
          await bind(new sql.Request(tx),scope)
            .input('version',sql.SmallInt,1)
            .input('pdfHash',sql.Char(64),doc.pdfSha256)
            .input('snapshotHash',sql.Char(64),doc.snapshotSha256)
            .input('objectPath',sql.NVarChar(512),doc.path)
            .input('byteLength',sql.Int,doc.byteLength)
            .input('snapshot',sql.NVarChar(sql.MAX),canonical)
            .input('actorId',sql.UniqueIdentifier,actorId)
            .query('INSERT INTO dbo.invoice_pdf_archives '+
              '(tenant_id,invoice_id,archive_version,pdf_sha256,snapshot_sha256,'+
              'object_path,byte_length,issued_snapshot_json,archived_by) VALUES '+
              '(@tenantId,@invoiceId,@version,@pdfHash,@snapshotHash,'+
              '@objectPath,@byteLength,@snapshot,@actorId)');
          await tx.commit();return {outcome:'inserted'};
        } catch(e) {await tx.rollback().catch(()=>{});throw e;}
      }
    }
  };
};
