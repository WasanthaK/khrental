// Management-entitlement gate for writes that are not themselves SQL inside
// withManagementWrite (object storage, multi-statement identity repositories).
// It is the same decision as every other management write: organizations
// outside the server-configured enforcement scope pass without a lock;
// otherwise the organization's billing-account row is locked (UPDLOCK,
// HOLDLOCK, SERIALIZABLE) and evaluated, and 403 MANAGEMENT_READ_ONLY is
// thrown when management is not entitled. No request field is read. The store
// is loaded lazily so callers stay importable without a database driver.
//
// withManagementEntitlement keeps that lock until `action` settles. Every
// billing-state change (subscription sync, complimentary grant/revocation,
// risk hold) is an UPDATE of the same row, so none can commit between the
// entitlement decision and the action's writes. The action uses its own pool
// connections; it must not write dbo.management_billing_accounts.
export const withManagementEntitlement = async ({ tenantId, action, guard, env = process.env }) => {
  if (!guard) {
    const { managementWriteEnforced } = await import('./contract.js');
    if (!managementWriteEnforced(tenantId, env)) {return action();}
  }
  const run = guard || (await import('./store.js')).withManagementWrite;
  return run({ tenantId, action: () => action() });
};

export const assertManagementEntitlement = ({ tenantId, guard, env }) =>
  withManagementEntitlement({ tenantId, guard, env, action: async () => undefined });
