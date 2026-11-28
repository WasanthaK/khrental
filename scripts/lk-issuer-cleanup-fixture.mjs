// Read-only identity checks shared by inspection and the cleanup transaction.
import assert from 'node:assert/strict';
import {BILLING_ACCOUNT} from '../src/api/managementBilling/contract.js';

const lower = value => String(value || '').toLowerCase();

function requireMatch(condition, field) {
  assert.ok(condition, field);
}

export async function readIssuerCleanupFixture(query, operation) {
  const email = `r5-issuer-${operation}@example.invalid`;
  const slug = 'r5-issuer-' + operation;
  const label = 'R5 synthetic deployed issuer cutover ' + operation;
  const [tenant] = await query('SELECT id,name,slug,status,[plan] FROM dbo.tenants WHERE id=@id', {id:operation});
  requireMatch(tenant && lower(tenant.id) === operation, 'fixture.tenant.id');
  requireMatch(tenant.name === label && tenant.slug === slug, 'fixture.tenant.label');
  requireMatch(tenant.status === 'active' && tenant.plan === 'development-testing', 'fixture.tenant.state');

  const users = await query('SELECT id,tenant_id,name,email,user_type,status FROM dbo.app_users WHERE tenant_id=@id OR email=@email', {id:operation,email});
  requireMatch(users.length === 1, 'fixture.user.count');
  const [actor] = users;
  requireMatch(lower(actor.tenant_id) === operation && actor.email === email && actor.name === label, 'fixture.user.identity');
  requireMatch(actor.user_type === 'admin' && actor.status === 'active', 'fixture.user.state');
  const memberships = await query('SELECT app_user_id,role,status,is_default FROM dbo.tenant_memberships WHERE tenant_id=@id', {id:operation});
  requireMatch(memberships.length === 1, 'fixture.membership.count');
  const [membership] = memberships;
  requireMatch(lower(membership.app_user_id) === lower(actor.id), 'fixture.membership.actor');
  requireMatch(membership.role === 'viewer' && membership.status === 'active' && Boolean(membership.is_default), 'fixture.membership.state');

  const properties = await query('SELECT id,name,status,propertytype,country_code FROM dbo.properties WHERE tenant_id=@id', {id:operation});
  requireMatch(properties.length === 1, 'fixture.property.count');
  const [property] = properties;
  requireMatch(property.name === 'R5 synthetic LKR 100000 dwelling', 'fixture.property.name');
  requireMatch(property.status === 'rented' && property.propertytype === 'house' && property.country_code === 'LK', 'fixture.property.state');
  const agreements = await query('SELECT propertyid,status,rentamount FROM dbo.agreements WHERE tenant_id=@id', {id:operation});
  requireMatch(agreements.length === 1, 'fixture.agreement.count');
  const [agreement] = agreements;
  requireMatch(lower(agreement.propertyid) === lower(property.id) && agreement.status === 'active' && Number(agreement.rentamount) === 100000, 'fixture.agreement.binding');

  const accounts = await query(`SELECT stripe_account_id,market,subscription_status,initial_payment_verified,quantity
    FROM dbo.management_billing_accounts WHERE tenant_id=@id`, {id:operation});
  requireMatch(accounts.length === 1, 'fixture.account.count');
  const [account] = accounts;
  requireMatch(account.stripe_account_id === BILLING_ACCOUNT && account.market === 'LK', 'fixture.account.binding');
  requireMatch(Boolean(account.initial_payment_verified) && Number(account.quantity) === 1, 'fixture.account.payment');
  if (account.subscription_status === 'canceled') {
    // The acceptance cancels this subscription before SQL teardown. The signed
    // receiver records both rows only after verifying the bound subscription.
    const cancellations = await query(`SELECT TOP (1) e.stripe_event_id FROM dbo.management_billing_events e
      JOIN dbo.management_billing_audit a ON a.tenant_id=e.tenant_id AND a.resource_id=e.stripe_event_id
      WHERE e.tenant_id=@id AND e.event_type='customer.subscription.deleted'
        AND a.action='stripe.event_reconciled' AND a.reason=e.event_type`, {id:operation});
    requireMatch(cancellations.length === 1, 'fixture.account.cancellation');
  } else {
    requireMatch(account.subscription_status === 'active', 'fixture.account.status');
  }

  const assignments = await query(`SELECT a.issuer_id,a.approval_reference,i.legal_name,i.country_code
    FROM dbo.management_market_issuer_assignments a JOIN dbo.management_invoice_issuers i ON i.id=a.issuer_id
    WHERE a.market='XZ' ORDER BY a.effective_at_utc,a.id`);
  requireMatch(assignments.length === 2, 'fixture.assignment.count');
  const [initial,later] = assignments;
  requireMatch(initial.approval_reference === 'R5 row 32 isolated synthetic schedule' &&
    initial.legal_name === 'R5 Synthetic Initial Issuer' && initial.country_code === 'US', 'fixture.assignment.initial');
  requireMatch(later.approval_reference === 'R5 row 32 isolated later synthetic assignment' &&
    later.legal_name === 'R5 Synthetic Later Issuer' && later.country_code === 'LK', 'fixture.assignment.later');
  const issuerIds = assignments.map(row => lower(row.issuer_id));
  requireMatch(new Set(issuerIds).size === 2, 'fixture.issuer.ids');
  const foreign = await query(`SELECT id FROM dbo.management_market_issuer_assignments
    WHERE market<>'XZ' AND issuer_id IN (@initial,@later)`, {initial:issuerIds[0],later:issuerIds[1]});
  requireMatch(foreign.length === 0, 'fixture.issuer.foreign');
  const authUsers = await query('SELECT app_user_id,email FROM dbo.auth_users WHERE app_user_id=@actor OR email=@email', {actor:actor.id,email});
  requireMatch(authUsers.length === 1 && lower(authUsers[0].app_user_id) === lower(actor.id) && authUsers[0].email === email, 'fixture.auth.binding');
  return {actor, issuerIds, email, slug, subscriptionStatus:account.subscription_status};
}

// Export only a named assertion. Driver diagnostics and row values stay private.
export function fixtureFailure(error) {
  return error.code === 'ERR_ASSERTION' && /^fixture\.[a-z]+\.[a-z]+$/.test(error.message)
    ? error.message : 'query_or_internal_error';
}
