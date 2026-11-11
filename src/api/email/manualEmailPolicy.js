import {createHmac} from 'node:crypto';
import {createTenantContextMiddleware} from '../tenant/context.js';
import {createSqlPublicSignupLimiter} from '../auth/publicSignupSqlLimiter.js';

const failure=(status,code,message)=>Object.assign(new Error(message),{status,code});
const mailbox=value=>typeof value==='string' && value.length<=320
  && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(value);

export const validateManualEmail = body => {
  const recipients=Array.isArray(body?.to)?body.to:[body?.to];
  if (!recipients.length || recipients.length>5 || !recipients.every(mailbox)
      || typeof body?.subject!=='string' || !body.subject.trim() || body.subject.length>200
      || /[\r\n]/.test(body.subject)
      || (!body.html && !body.text)
      || ['html','text'].some(key=>body[key]!==undefined && (typeof body[key]!=='string' || body[key].length>200000))
      || (body.attachments!==undefined && (!Array.isArray(body.attachments) || body.attachments.length>5))
      || (body.attachments||[]).some(a=>!a || typeof a.filename!=='string' || a.filename.length>255
        || typeof a.content!=='string' || a.content.length>2000000)) {
    throw failure(400,'EMAIL_REQUEST_INVALID','Enter valid recipients, subject and message within the attachment limits.');
  }
};

// Reuse the existing atomic SQL quota ledger across replicas. There is no
// process-local fallback: unknown quota outcomes must never dispatch mail.
export const createManualEmailGuards = ({
  resolveContext=createTenantContextMiddleware({requireUser:true,requireTenant:true}),
  limiter=createSqlPublicSignupLimiter(), secret=process.env.PUBLIC_SIGNUP_THROTTLE_SECRET || ''
}={}) => [resolveContext, async(req,res,next)=>{
  try {
    const m=req.membership;
    if (!req.authSession || !req.user?.id || !req.tenantId || !m
        || String(m.tenant_id||m.tenantId)!==String(req.tenantId)
        || m.status!=='active' || String(m.role).toLowerCase()!=='admin') {
      throw failure(403,'EMAIL_ADMIN_REQUIRED','Workspace administrator access is required to send email.');
    }
    validateManualEmail(req.body);
    if (Buffer.byteLength(secret)<32 || limiter?.durable!==true) {
      throw failure(503,'EMAIL_LIMITER_UNAVAILABLE','Email sending is temporarily unavailable.');
    }
    for (const [scope,identifier,max,windowSeconds] of [
      ['manual-email-user',String(req.user.id),5,60],
      ['manual-email-tenant',String(req.tenantId),50,3600]
    ]) {
      const key=createHmac('sha256',secret).update(`quixo-manual-email-v1\0${scope}\0${identifier}`).digest('hex');
      let allowed;
      try { allowed=await limiter.consume({scope,key,max,windowSeconds}); }
      catch { throw failure(503,'EMAIL_LIMITER_UNAVAILABLE','Email sending is temporarily unavailable.'); }
      if (allowed!==true) {
        res.set('Retry-After',String(windowSeconds));
        throw failure(429,'EMAIL_RATE_LIMITED','Email sending limit reached. Please try again later.');
      }
    }
    next();
  } catch(error) {next(error);}
}];
