// Read-only release preflight inside the existing application revision.
// No identities, challenges, quota buckets, messages or schema are written.
import fs from 'node:fs';
import crypto from 'node:crypto';
import {getMssqlPool,closeMssqlPool} from '../src/api/mssql/pool.js';
import {inspectPropertyEnquiries} from './inspect-property-enquiries-schema.mjs';
import {createPublicSignupSendGridAdapters} from '../src/api/auth/publicSignupSendGrid.js';

try{
  const pool=await getMssqlPool();
  const schema=await inspectPropertyEnquiries(pool);
  if(!schema.satisfied){throw Error('Enquiry schema is not ready.');}
  const checksum=crypto.createHash('sha256').update(fs.readFileSync(new URL('../migrations/20261028_01_property_enquiries.sql',import.meta.url))).digest('hex');
  const rows=(await pool.request().query(`SELECT migration_id,checksum FROM dbo.schema_migrations
    WHERE migration_id IN('20261028_01_property_enquiries','20261023_01_create_public_signup_challenges','20261024_01_create_public_signup_rate_limits')`)).recordset;
  if(rows.length!==3||!rows.some(r=>r.migration_id==='20261028_01_property_enquiries'&&r.checksum===checksum)){
    throw Error('Governed enquiry/signup migrations are not ready.');
  }
  if(process.env.PUBLIC_SIGNUP_INGRESS_MODE!=='azure-container-apps-http'||
      process.env.PUBLIC_SIGNUP_VERIFICATION_ORIGIN!=='https://app.quixo.homes'||
      String(process.env.PUBLIC_SIGNUP_THROTTLE_SECRET||'').length<32){throw Error('Signup runtime readiness is incomplete.');}
  createPublicSignupSendGridAdapters({apiKey:process.env.PUBLIC_SIGNUP_SENDGRID_API_KEY,
    senderEmail:process.env.PUBLIC_SIGNUP_SENDER_EMAIL,senderName:process.env.PUBLIC_SIGNUP_SENDER_NAME||'Quixo.Homes',
    baseUrl:process.env.PUBLIC_SIGNUP_VERIFICATION_ORIGIN,production:true});
  console.log('ENQUIRY_RELEASE_READINESS=PASS schema_ledger_checksum signup_config no_customer_writes');
}catch{
  console.error('ENQUIRY_RELEASE_READINESS=FAIL no_customer_writes');process.exitCode=1;
}finally{await closeMssqlPool().catch(()=>{});}
