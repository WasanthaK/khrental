# Invoice master data — schema-only deployment gate

Migration: `20261019_01_invoice_master_data`.

This migration adds `tenant_settings.invoice_issuer_profile_json` (nullable JSON),
`properties.bank_beneficiary_name` (nullable string) and
`property_units.bank_beneficiary_name` (nullable string). No defaults, data
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
