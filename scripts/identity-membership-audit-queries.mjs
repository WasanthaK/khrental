/**
 * Read-only, aggregate-only reconciliation of historical identity linkage.
 * This code intentionally returns no names, emails, GUIDs, or record-level data.
 * Do not add joins/projections of individual identities to the output.
 */
export const IDENTITY_MEMBERSHIP_AUDIT_SQL = `
SELECT
  (SELECT COUNT_BIG(*)
   FROM dbo.app_users AS u
   WHERE u.tenant_id IS NOT NULL) AS legacy_tenant_pointer_count,

  (SELECT COUNT_BIG(*)
   FROM dbo.app_users AS u
   WHERE u.tenant_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM dbo.tenant_memberships AS m WHERE m.app_user_id = u.id
     )) AS legacy_without_any_membership_count,

  (SELECT COUNT_BIG(*)
   FROM dbo.app_users AS u
   WHERE u.tenant_id IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM dbo.tenant_memberships AS m WHERE m.app_user_id = u.id
     )
     AND NOT EXISTS (
       SELECT 1
       FROM dbo.tenant_memberships AS m
       INNER JOIN dbo.tenants AS t ON t.id = m.tenant_id
       WHERE m.app_user_id = u.id
         AND m.status = 'active'
         AND (t.status IS NULL OR t.status = 'active')
     )) AS legacy_with_history_but_no_active_membership_count,

  (SELECT COUNT_BIG(*)
   FROM dbo.app_users AS u
   WHERE u.tenant_id IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM dbo.tenant_memberships AS m
       INNER JOIN dbo.tenants AS t ON t.id = m.tenant_id
       WHERE m.app_user_id = u.id
         AND m.status = 'active'
         AND (t.status IS NULL OR t.status = 'active')
     )
     AND NOT EXISTS (
       SELECT 1
       FROM dbo.tenant_memberships AS m
       INNER JOIN dbo.tenants AS t ON t.id = m.tenant_id
       WHERE m.app_user_id = u.id
         AND m.tenant_id = u.tenant_id
         AND m.status = 'active'
         AND (t.status IS NULL OR t.status = 'active')
     )) AS legacy_pointer_without_matching_active_membership_count,

  (SELECT COUNT_BIG(*)
   FROM dbo.app_users AS u
   WHERE u.auth_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM dbo.auth_users AS a WHERE a.auth_id = u.auth_id
     )) AS app_user_auth_id_without_auth_record_count,

  (SELECT COUNT_BIG(*)
   FROM dbo.auth_users AS a
   WHERE a.app_user_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM dbo.app_users AS u
       WHERE u.id = a.app_user_id AND u.auth_id = a.auth_id
     )) AS auth_record_without_matching_app_user_link_count,

  (SELECT COUNT_BIG(*)
   FROM dbo.app_users AS u
   WHERE u.auth_id IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM dbo.auth_users AS a
       WHERE a.email = u.email
         AND a.auth_id <> u.auth_id
     )) AS same_email_different_auth_id_count,

  (SELECT COUNT_BIG(*)
   FROM dbo.app_users AS u
   WHERE u.tenant_id IS NULL
     AND NOT EXISTS (
       SELECT 1 FROM dbo.tenant_memberships AS m WHERE m.app_user_id = u.id
     )) AS tenantless_global_profile_count;
`;

export const IDENTITY_MEMBERSHIP_AUDIT_FIELDS = Object.freeze([
  'legacy_tenant_pointer_count',
  'legacy_without_any_membership_count',
  'legacy_with_history_but_no_active_membership_count',
  'legacy_pointer_without_matching_active_membership_count',
  'app_user_auth_id_without_auth_record_count',
  'auth_record_without_matching_app_user_link_count',
  'same_email_different_auth_id_count',
  'tenantless_global_profile_count'
]);

export const readIdentityMembershipAuditCounts = (row) => {
  if (!row || typeof row !== 'object') throw new Error('Audit query returned no count row.');
  const result = {};
  for (const field of IDENTITY_MEMBERSHIP_AUDIT_FIELDS) {
    const raw = row[field];
    const parsed = typeof raw === 'bigint' ? Number(raw) : Number(raw);
    if (raw === null || raw === undefined || !Number.isSafeInteger(parsed) || parsed < 0) {
      throw new Error('Invalid aggregate count in identity membership audit.');
    }
    result[field] = parsed;
  }
  return result;
};
