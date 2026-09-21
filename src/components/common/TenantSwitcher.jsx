import React, { useMemo } from 'react';
import { toast } from 'react-hot-toast';
import { useAuth } from '../../hooks/useAuth';

const buildTenantOptions = (memberships = []) => {
  const entries = memberships.filter(Boolean);
  const optionMap = new Map();

  entries.forEach((membership) => {
    const tenantId = membership?.tenant_id || membership?.tenant?.id;
    if (!tenantId || optionMap.has(tenantId)) {
      return;
    }

    optionMap.set(tenantId, membership);
  });

  return Array.from(optionMap.values());
};

const getTenantName = (membership, activeTenant) => {
  if (membership?.tenant?.name) {
    return membership.tenant.name;
  }

  if (activeTenant?.id && (membership?.tenant_id || membership?.tenant?.id) === activeTenant.id) {
    return activeTenant.name || activeTenant.slug || 'Active tenant';
  }

  return membership?.tenant_id || 'Tenant';
};

const TenantSwitcher = ({ compact = false }) => {
  const {
    activeTenant,
    activeTenantId,
    hasMultipleTenants,
    hasTenantAccess,
    isAuthenticated,
    isSwitchingTenant,
    memberships,
    switchTenant
  } = useAuth();

  const tenantOptions = useMemo(() => buildTenantOptions(memberships), [memberships]);

  const handleChange = async (event) => {
    const nextTenantId = event.target.value;

    if (!nextTenantId || nextTenantId === activeTenantId) {
      return;
    }

    const { error } = await switchTenant(nextTenantId);

    if (error) {
      toast.error(error.message || 'Failed to switch tenant');
      return;
    }

    // Keep this transient confirmation away from top-right page actions such as
    // Add Property. A short duration also avoids a stale-looking notification
    // after the tenant-scoped route tree remounts.
    toast.success('Tenant switched', {
      duration: 2000,
      position: 'bottom-center',
      id: 'tenant-switch-success'
    });
  };

  if (!isAuthenticated) {
    return null;
  }

  if (!hasTenantAccess) {
    return (
      <div className={`rounded-md border px-3 py-2 text-xs ${compact ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-amber-300 bg-amber-50/95 text-amber-900'}`}>
        No tenant access assigned.
      </div>
    );
  }

  if (!hasMultipleTenants) {
    if (!activeTenant) {
      return null;
    }

    return (
      <div className={`rounded-md border px-3 py-2 ${compact ? 'border-gray-200 bg-gray-50 text-gray-700 text-xs' : 'border-white/20 bg-white/10 text-white text-xs'}`}>
        <span className="block uppercase tracking-wide opacity-75">Tenant</span>
        <span className="block font-medium truncate">{activeTenant.name || activeTenant.slug || activeTenantId}</span>
      </div>
    );
  }

  return (
    <label className={`block ${compact ? 'min-w-[220px]' : 'w-full'}`}>
      <span className={`block mb-1 ${compact ? 'text-[11px] uppercase tracking-wide text-gray-500' : 'text-[11px] uppercase tracking-wide text-green-100/90'}`}>
        Active tenant
      </span>
      <select
        value={activeTenantId || ''}
        onChange={handleChange}
        disabled={isSwitchingTenant}
        className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-offset-0 ${compact ? 'border-gray-300 bg-white text-gray-900 focus:ring-blue-500' : 'border-white/20 bg-white/10 text-white focus:ring-white/70'}`}
      >
        {tenantOptions.map((membership) => {
          const tenantId = membership?.tenant_id || membership?.tenant?.id;
          const tenantName = getTenantName(membership, activeTenant);
          const membershipRole = membership?.role ? ` (${membership.role})` : '';

          return (
            <option key={tenantId} value={tenantId} className="text-gray-900">
              {`${tenantName}${membershipRole}`}
            </option>
          );
        })}
      </select>
      {isSwitchingTenant && (
        <span className={`mt-1 block text-xs ${compact ? 'text-gray-500' : 'text-green-100/80'}`}>
          Switching tenant...
        </span>
      )}
    </label>
  );
};

export default TenantSwitcher;