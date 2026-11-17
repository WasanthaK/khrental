// A management-entitlement check for writes that are not themselves SQL
// mutations inside withManagementWrite (for example object storage) or that
// are classified before their own write. It is the same decision as every
// other management write: organizations outside the server-configured
// enforcement scope pass without a lock, otherwise the billing account is
// locked and evaluated and 403 MANAGEMENT_READ_ONLY is thrown when management
// is not entitled. No request field is read. The store is loaded lazily so
// callers stay importable without a database driver.
export const assertManagementEntitlement = async ({ tenantId, guard, env = process.env }) => {
  if (!guard) {
    const { managementWriteEnforced } = await import('./contract.js');
    if (!managementWriteEnforced(tenantId, env)) {return undefined;}
  }
  const run = guard || (await import('./store.js')).withManagementWrite;
  return run({ tenantId, action: async () => undefined });
};
