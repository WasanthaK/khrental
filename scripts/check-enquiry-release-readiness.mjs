// Read-only release preflight inside the existing application revision.
// No identities, challenges, quota buckets, messages or schema are written.
import {getMssqlPool,closeMssqlPool} from '../src/api/mssql/pool.js';
import {inspectEnquiryApplicationAccess} from '../src/api/enquiries/readiness.js';
import {createPublicSignupSendGridAdapters} from '../src/api/auth/publicSignupSendGrid.js';

let phase='connection';
try{
  const pool=await getMssqlPool();
  // The release workflow first requires fresh strict executor evidence for all
  // governed schemas/checksums. Do not widen web rights to inspect definitions.
  phase='application_access';
  if(!(await inspectEnquiryApplicationAccess(pool)).satisfied){throw Error('Application enquiry access is not ready.');}
  phase='ingress';
  if(process.env.PUBLIC_SIGNUP_INGRESS_MODE!=='azure-container-apps-http'||
      process.env.PUBLIC_SIGNUP_VERIFICATION_ORIGIN!=='https://app.quixo.homes'||
      String(process.env.PUBLIC_SIGNUP_THROTTLE_SECRET||'').length<32){throw Error('Signup runtime readiness is incomplete.');}
  phase='mail';
  createPublicSignupSendGridAdapters({apiKey:process.env.PUBLIC_SIGNUP_SENDGRID_API_KEY,
    senderEmail:process.env.PUBLIC_SIGNUP_SENDER_EMAIL,senderName:process.env.PUBLIC_SIGNUP_SENDER_NAME||'Quixo.Homes',
    baseUrl:process.env.PUBLIC_SIGNUP_VERIFICATION_ORIGIN,production:true});
  console.log('ENQUIRY_RELEASE_READINESS=PASS application_access signup_config no_customer_writes');
}catch(error){
  console.error('ENQUIRY_RELEASE_READINESS=FAIL phase='+phase+' sqlNumber='+(Number.isInteger(error.number)?error.number:0));process.exitCode=1;
}finally{await closeMssqlPool().catch(()=>{});}
