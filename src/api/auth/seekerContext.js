// B04 S3c2b: read-only evidence for an authenticated global seeker.
// No tenant grant, token/session issuance or redirect occurs here.
import { runQuery } from '../mssql/query.js';

const sameId = (a, b) => Boolean(a && b)
  && String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
const normalize = s => String(s || '').trim().toLowerCase();

// Fail closed: only a verified bearer session linked to the same app_users
// row is authoritative. A browser-supplied role, x-auth-id, membership
// projection or a missing membership table cannot certify "zero memberships".
export const resolveVerifiedSeekerContext = async ({
  authSession = null,
  user = null,
  tenantContext = null,
  query = runQuery
} = {}) => {
  const denied = { verified: false, eligible: false };
  const record = authSession?.record;
  if (!record?.authId || !record?.appUserId ||
      !sameId(record.appUserId, user?.id) ||
      !sameId(record.authId, user?.auth_id) ||
      !normalize(record.email) || normalize(record.email) !== normalize(user?.email) ||
      normalize(record.role) !== 'authenticated' ||
      record.metadata?.global_email_verified !== true ||
      normalize(user?.role) !== 'authenticated' ||
      normalize(user?.user_type) !== 'seeker' ||
      user?.tenant_id || user?.tenantId || user?.is_dev_bypass ||
      tenantContext?.identity?.devBypassRole ||
      tenantContext?.requestedTenantId ||
      tenantContext?.tenantId ||
      tenantContext?.tenant ||
      tenantContext?.membership ||
      tenantContext?.resolution !== 'none' ||
      !Array.isArray(tenantContext?.memberships) ||
      tenantContext.memberships.length !== 0) {
    return denied;
  }
  if (typeof query !== 'function') return denied;

  // Do not use the legacy active-memberships projection: it ignores revoked
  // rows and can return [] when the membership schema is missing. A direct
  // query must prove the table exists and that no historical membership could
  // silently be reused as a privileged tenant association.
  const rows = await query(`
    SELECT TOP (1) id
    FROM dbo.tenant_memberships
    WHERE app_user_id = @appUserId
  `, { appUserId: record.appUserId });
  if (!Array.isArray(rows)) return denied;
  return rows.length === 0
    ? { verified: true, eligible: true, userType: 'seeker', tenantId: null }
    : { verified: true, eligible: false };
};

// Personal rental activity belongs to the verified global actor. Memberships
// grant business access separately and cannot broaden this actor-only context.
export const resolvePersonalRentalContext = async ({authSession=null,user=null,tenantContext=null}={}) => {
  const record=authSession?.record;
  const denied={verified:false,eligible:false};
  if(!authSession?.sessionId||!record?.authId||!record?.appUserId||
    !sameId(record.appUserId,user?.id)||!sameId(record.authId,user?.auth_id)||
    !normalize(record.email)||normalize(record.email)!==normalize(user?.email)||
    !normalize(record.role)||normalize(record.role)!==normalize(user?.role)||
    record.metadata?.global_email_verified!==true||
    (user?.status&&normalize(user.status)!=='active')||user?.active===false||
    user?.is_dev_bypass||tenantContext?.identity?.devBypassRole||tenantContext?.requestedTenantId){return denied;}
  return {verified:true,eligible:true,userType:'rental',tenantId:null};
};
