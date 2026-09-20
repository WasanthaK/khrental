import React, { useEffect, useMemo, useState } from 'react';
import { toast } from 'react-hot-toast';
import {
  createAdminTenant,
  createOrAttachTenantAdministrator,
  getPlatformAdminStatus,
  inviteTenantAdministrator,
  listAdminTenants,
  listTenantAdministrators,
  removeTenantAdministrator,
  updateAdminTenant
} from '../services/tenantAdminService';

const DEFAULT_TENANT_FORM = {
  name: '',
  slug: '',
  status: 'active',
  plan: 'legacy'
};

const DEFAULT_ADMIN_FORM = {
  name: '',
  email: '',
  sendInvitation: true
};

const statusOptions = ['active', 'inactive'];

const TenantAdminCanonical = () => {
  const [platformAdmin, setPlatformAdmin] = useState(null);
  const [tenants, setTenants] = useState([]);
  const [tenantsLoading, setTenantsLoading] = useState(true);
  const [tenantSearch, setTenantSearch] = useState('');
  const [selectedTenantId, setSelectedTenantId] = useState(null);
  const [tenantForm, setTenantForm] = useState(DEFAULT_TENANT_FORM);
  const [tenantSaving, setTenantSaving] = useState(false);

  const [administrators, setAdministrators] = useState([]);
  const [administratorsLoading, setAdministratorsLoading] = useState(false);
  const [adminForm, setAdminForm] = useState(DEFAULT_ADMIN_FORM);
  const [adminSaving, setAdminSaving] = useState(false);
  const [adminActionId, setAdminActionId] = useState(null);

  const selectedTenant = useMemo(
    () => tenants.find((tenant) => tenant.id === selectedTenantId) || null,
    [tenants, selectedTenantId]
  );

  const applyTenantToForm = (tenant) => {
    setTenantForm({
      name: tenant?.name || '',
      slug: tenant?.slug || '',
      status: tenant?.status || 'active',
      plan: tenant?.plan || 'legacy'
    });
  };

  const loadAdministrators = async (tenantId) => {
    if (!tenantId) {
      setAdministrators([]);
      return;
    }

    try {
      setAdministratorsLoading(true);
      const data = await listTenantAdministrators(tenantId);
      setAdministrators(Array.isArray(data) ? data : []);
    } catch (error) {
      toast.error(error.message || 'Failed to load tenant administrators');
    } finally {
      setAdministratorsLoading(false);
    }
  };

  const loadTenants = async (preferredTenantId = null) => {
    try {
      setTenantsLoading(true);
      const data = await listAdminTenants({ search: tenantSearch || undefined, pageSize: 100 });
      const items = Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : [];
      setTenants(items);

      const nextTenant = (preferredTenantId && items.find((tenant) => tenant.id === preferredTenantId))
        || (selectedTenantId && items.find((tenant) => tenant.id === selectedTenantId))
        || items[0]
        || null;

      setSelectedTenantId(nextTenant?.id || null);
      applyTenantToForm(nextTenant);
    } catch (error) {
      toast.error(error.message || 'Failed to load tenants');
    } finally {
      setTenantsLoading(false);
    }
  };

  useEffect(() => {
    const initialize = async () => {
      try {
        const status = await getPlatformAdminStatus();
        const allowed = Boolean(status?.isPlatformAdmin);
        setPlatformAdmin(allowed);
        if (allowed) {
          await loadTenants();
        } else {
          setTenantsLoading(false);
        }
      } catch (error) {
        setPlatformAdmin(false);
        setTenantsLoading(false);
        toast.error(error.message || 'Unable to verify platform administrator access');
      }
    };

    initialize();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    applyTenantToForm(selectedTenant);
    loadAdministrators(selectedTenantId);
  }, [selectedTenant, selectedTenantId]);

  const handleCreateTenant = () => {
    setSelectedTenantId(null);
    setTenantForm(DEFAULT_TENANT_FORM);
    setAdministrators([]);
  };

  const handleTenantSubmit = async (event) => {
    event.preventDefault();

    try {
      setTenantSaving(true);
      const payload = {
        name: tenantForm.name,
        slug: tenantForm.slug,
        status: tenantForm.status,
        plan: tenantForm.plan,
        settings: {
          branding_json: { name: tenantForm.name }
        }
      };

      const savedTenant = selectedTenant?.id
        ? await updateAdminTenant(selectedTenant.id, payload)
        : await createAdminTenant(payload);

      toast.success(selectedTenant?.id ? 'Organization updated' : 'Organization created');
      await loadTenants(savedTenant?.id || null);
    } catch (error) {
      toast.error(error.message || 'Failed to save organization');
    } finally {
      setTenantSaving(false);
    }
  };

  const handleAdministratorSubmit = async (event) => {
    event.preventDefault();
    if (!selectedTenantId) {
      toast.error('Select an organization first');
      return;
    }

    try {
      setAdminSaving(true);
      const result = await createOrAttachTenantAdministrator(selectedTenantId, {
        name: adminForm.name.trim(),
        email: adminForm.email.trim().toLowerCase()
      });

      const appUser = result?.user;
      const membership = result?.membership;
      if (!appUser?.id || !membership?.id) {
        throw new Error('Tenant administrator onboarding did not return a complete identity and membership.');
      }

      if (adminForm.sendInvitation) {
        await inviteTenantAdministrator(selectedTenantId, appUser.id, appUser);
        toast.success('Tenant administrator added and invitation sent');
      } else {
        toast.success('Tenant administrator added');
      }

      setAdminForm(DEFAULT_ADMIN_FORM);
      await loadAdministrators(selectedTenantId);
      await loadTenants(selectedTenantId);
    } catch (error) {
      toast.error(error.message || 'Failed to onboard tenant administrator');
    } finally {
      setAdminSaving(false);
    }
  };

  const handleInvite = async (membership) => {
    try {
      setAdminActionId(membership.id);
      await inviteTenantAdministrator(selectedTenantId, membership.app_user_id, membership.app_user || {});
      toast.success('Administrator invitation sent');
    } catch (error) {
      toast.error(error.message || 'Failed to send administrator invitation');
    } finally {
      setAdminActionId(null);
    }
  };

  const handleRemove = async (membership) => {
    if (!window.confirm(`Remove ${membership.app_user?.name || membership.app_user?.email || 'this administrator'} from ${selectedTenant?.name || 'this organization'}?`)) {
      return;
    }

    try {
      setAdminActionId(membership.id);
      await removeTenantAdministrator(selectedTenantId, membership.id);
      toast.success('Tenant administrator removed');
      await loadAdministrators(selectedTenantId);
      await loadTenants(selectedTenantId);
    } catch (error) {
      toast.error(error.message || 'Failed to remove tenant administrator');
    } finally {
      setAdminActionId(null);
    }
  };

  if (platformAdmin === null) {
    return <div className="app-empty-state">Checking platform administrator access...</div>;
  }

  if (!platformAdmin) {
    return (
      <div className="app-page">
        <div className="app-panel p-6">
          <h1 className="text-xl font-semibold text-slate-900">Platform administration</h1>
          <p className="mt-2 text-sm text-slate-600">
            This area is reserved for platform administrators. Tenant administrators manage renters, team members, properties, agreements, billing, and maintenance from their own workspace.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="app-page">
      <div className="page-hero">
        <p className="page-kicker">Platform administration</p>
        <h1 className="page-title">Organizations and tenant administrators</h1>
        <p className="page-subtitle">
          Platform administrators create organizations and appoint their administrators. Day-to-day people and property operations remain inside each tenant workspace.
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[340px_minmax(0,1fr)]">
        <section className="app-panel">
          <div className="app-panel-header">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Organizations</h2>
                <p className="text-sm text-slate-500">Platform tenant registry</p>
              </div>
              <button type="button" onClick={handleCreateTenant} className="app-button-secondary">
                New organization
              </button>
            </div>
            <input
              type="text"
              value={tenantSearch}
              onChange={(event) => setTenantSearch(event.target.value)}
              onKeyDown={(event) => event.key === 'Enter' && loadTenants()}
              placeholder="Search organizations"
              className="app-input mt-4"
            />
          </div>

          <div className="max-h-[640px] overflow-y-auto p-3">
            {tenantsLoading ? (
              <div className="app-empty-state">Loading organizations...</div>
            ) : tenants.length === 0 ? (
              <div className="app-empty-state">No organizations found.</div>
            ) : (
              <div className="space-y-2">
                {tenants.map((tenant) => (
                  <button
                    key={tenant.id}
                    type="button"
                    onClick={() => setSelectedTenantId(tenant.id)}
                    className={`w-full rounded-2xl border px-4 py-3 text-left transition ${tenant.id === selectedTenantId ? 'border-blue-500 bg-blue-50' : 'border-slate-200 bg-white hover:bg-slate-50'}`}
                  >
                    <div className="flex justify-between gap-3">
                      <div>
                        <div className="font-medium text-slate-900">{tenant.name}</div>
                        <div className="mt-1 text-xs uppercase tracking-wide text-slate-500">{tenant.slug}</div>
                      </div>
                      <span className="text-xs text-slate-500">{tenant.status}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </section>

        <div className="space-y-6">
          <section className="app-panel">
            <div className="app-panel-header">
              <h2 className="text-lg font-semibold text-slate-900">Organization profile</h2>
              <p className="text-sm text-slate-500">Create or maintain platform-level tenant metadata.</p>
            </div>
            <form onSubmit={handleTenantSubmit} className="grid gap-4 p-5 md:grid-cols-2">
              <label className="app-label">
                Organization name
                <input className="app-input" required value={tenantForm.name} onChange={(event) => setTenantForm((current) => ({ ...current, name: event.target.value }))} />
              </label>
              <label className="app-label">
                Slug
                <input className="app-input" required value={tenantForm.slug} onChange={(event) => setTenantForm((current) => ({ ...current, slug: event.target.value }))} />
              </label>
              <label className="app-label">
                Status
                <select className="app-select" value={tenantForm.status} onChange={(event) => setTenantForm((current) => ({ ...current, status: event.target.value }))}>
                  {statusOptions.map((status) => <option key={status} value={status}>{status}</option>)}
                </select>
              </label>
              <label className="app-label">
                Plan
                <input className="app-input" value={tenantForm.plan} onChange={(event) => setTenantForm((current) => ({ ...current, plan: event.target.value }))} />
              </label>
              <div className="md:col-span-2 flex justify-end">
                <button type="submit" disabled={tenantSaving} className="app-button">
                  {tenantSaving ? 'Saving...' : selectedTenant ? 'Save organization' : 'Create organization'}
                </button>
              </div>
            </form>
          </section>

          <section className="app-panel">
            <div className="app-panel-header">
              <h2 className="text-lg font-semibold text-slate-900">Tenant administrators</h2>
              <p className="text-sm text-slate-500">
                Appoint the administrators who will manage renters, staff, properties, agreements, billing, and maintenance inside this organization.
              </p>
            </div>

            {!selectedTenant ? (
              <div className="p-5 text-sm text-slate-500">Select or create an organization first.</div>
            ) : (
              <div className="space-y-5 p-5">
                <form onSubmit={handleAdministratorSubmit} className="grid gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-2">
                  <label className="app-label">
                    Administrator name
                    <input className="app-input" required value={adminForm.name} onChange={(event) => setAdminForm((current) => ({ ...current, name: event.target.value }))} placeholder="Full name" />
                  </label>
                  <label className="app-label">
                    Administrator email
                    <input type="email" className="app-input" required value={adminForm.email} onChange={(event) => setAdminForm((current) => ({ ...current, email: event.target.value }))} placeholder="admin@example.com" />
                  </label>
                  <label className="md:col-span-2 flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
                    <input type="checkbox" checked={adminForm.sendInvitation} onChange={(event) => setAdminForm((current) => ({ ...current, sendInvitation: event.target.checked }))} />
                    Send secure account invitation after appointment
                  </label>
                  <div className="md:col-span-2 flex justify-end">
                    <button type="submit" disabled={adminSaving} className="app-button">
                      {adminSaving ? 'Adding...' : 'Add tenant administrator'}
                    </button>
                  </div>
                </form>

                {administratorsLoading ? (
                  <div className="app-empty-state">Loading tenant administrators...</div>
                ) : administrators.length === 0 ? (
                  <div className="app-empty-state">No tenant administrators have been appointed yet.</div>
                ) : (
                  <div className="space-y-3">
                    {administrators.map((membership) => (
                      <div key={membership.id} className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <div className="font-medium text-slate-900">{membership.app_user?.name || 'Unnamed administrator'}</div>
                          <div className="mt-1 text-sm text-slate-500">{membership.app_user?.email || membership.app_user_id}</div>
                          <div className="mt-1 text-xs text-slate-400">{membership.status || 'active'}</div>
                        </div>
                        <div className="flex gap-2">
                          <button type="button" disabled={adminActionId === membership.id} onClick={() => handleInvite(membership)} className="app-button-secondary">
                            Invite
                          </button>
                          <button type="button" disabled={adminActionId === membership.id} onClick={() => handleRemove(membership)} className="rounded-xl border border-rose-200 px-3 py-2 text-sm font-medium text-rose-700 hover:bg-rose-50">
                            Remove
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};

export default TenantAdminCanonical;
