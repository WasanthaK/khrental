# Invoice master data — schema-only deployment gate

Migration: `20261019_01_invoice_master_data`.

This migration adds `tenant_settings.invoice_issuer_profile_json` (nullable JSON),
`properties.bank_beneficiary_name` (nullable string) and
`property_units.bank_beneficiary_name` (nullable string), optional `properties.invoice_party_overrides_json`, and optional property billing contact name/email/phone. A tenant-scoped `invoice_master_data_audit` table supports auditable changes without storing raw old/new bank account values. No defaults, data
backfill, beneficiary inference, or changes to issued invoices.

**Do not merge until approved.** GitHub main push runs a read-only migration
plan and may also deploy the same application image with the new manifest;
production apply is always a separate confirmation via the privileged isolated
migration executor. The existing application continues working without using
these new columns.

After merge: verify isolated executor preflight with eight migration entries,
authorize `Run production database migrations` in apply mode with
`through=20261019_01_invoice_master_data` only after reviewing the plan, and perform strict
read-only verification of all eight migrations. No schema migration on the
web-serving identity. Only then merge the app/admin configuration changes.

The SQL Server integration test exercises actual two-run migration, existing
bank values/reference preservation, absence of invented issuer/beneficiary
values, the JSON constraint, and populated fields added explicitly by
an administrator.

## Typical manager and exceptional external manager

The **SaaS tenant owner's organization** is normally the property manager (the
business operating this KH Rentals workspace). This is different from the
**renter/occupant** and may be different from the **legal property owner**.
Do not repeat its business name, address and contact details on every property.

**Ordinary managed property:** absence of `invoice_party_overrides_json`
means management remains with the tenant organization. Its name/contact details
are displayed only when a verified organization business profile exists.
The verified tenant invoice-issuer profile is the ordinary issuer, subject to
the actual contractual and tax rules; lack of verified issuer data is an admin
readiness failure, never permission to invent it.

**Exception — outsourced management:** when management is formally delegated
to another business, an authorized admin records a verified `externalManager`
within `invoice_party_overrides_json`, including the business name and
contact details, and confirms the delegation. The UI must not require or
synthesize an external manager for ordinary properties.

**Different property owner or issuer:** a property can have an explicitly
verified `propertyOwner` and optional `issuerOverride`. They are not
automatically the manager or bank account holder, and an override does not
automatically prove legal invoicing authority.

**Payment recipient:** `bank_beneficiary_name` belongs to the authorized
property/unit bank destination. It must be verified separately and never
copied from the tenant owner, manager, issuer or landlord automatically.

Before enabling any application writes, a secured, tenant-scoped admin API
must enforce a narrow JSON field allowlist, verify the effective property
scope, and write the audit record in the same SQL transaction as the update.
Nullable JSON is a storage envelope, not automatic authentication or
verification of legal identity. Existing issued invoices and snapshots must
remain unchanged.

## Admin UX

- Organization Settings → Invoice Issuer: enter *verified* issuer legal name,
  address and support channels only once for the organization.
- Property Information → Payment & Billing: reuse existing property name,
  property address, bank, branch and account number; request the missing
  beneficiary and optional property-level billing contact.
- Property Information → Management: "Managed by our organization" is the
  normal behaviour (no extra fields). An explicit "Outsourced" option reveals
  manager identity/contact/delegation details.
- Property Information → Invoice Issuer Override: optional exceptional role
  selection, only when a different verified party is permitted to issue.
- Unit Information: request beneficiary for a unit bank override; preserve
  the fail-closed complete-unit-override precedence.
