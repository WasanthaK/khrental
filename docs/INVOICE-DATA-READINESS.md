# Invoice data readiness — release contract

Status: **foundation in draft only; no production behavior change**.

The professional invoice sample is a visual mockup, not authoritative data. Never use its dummy business address, beneficiary name, phone, email, website or property address in a real invoice.

## Existing fields and authoritative joins

- Issued invoice: `invoices`, `invoice_components`, `invoice_payment_references`.
- Renter: `app_users.name`, `email`, `contact_details`; always tenant-scoped.
- Property: `properties.name`, `address`; unit number through the invoice agreement and property unit.
- Bank: recorded issue-time instructions from the unit override or property-level banking configuration; **never infer beneficiary name from tenant display name**.
- Payments and receipts: only verified server-side accounting projections; do not mistake a live outstanding balance for the original issued invoice total.

## Required new governed configuration before enabling pre-issue validation

1. Tenant-scoped *Invoice Business Profile*: verified issuer legal name, postal address, at least one verified support contact; website/logo and registration/tax details only when configured and applicable.
2. Property/unit-level verified bank beneficiary name, with full destination completeness validation.
3. Additive database migration and admin-only, audited update surfaces for these fields, deployed **before** invoice issue begins requiring them.
4. Atomic invoice-issued snapshot of issuer, property, renter, bank destination, invoice components, amount, dates and reference; preserve the original on retries and historical resends.

The existing `tenant_settings.branding_json` name by itself is not a verified legal identity. The current SQL schema does not establish an authoritative bank beneficiary name. These cannot be silently substituted.

## Readiness policy

The pure function `inspectInvoiceIssuanceReadiness` returns `{ready, missing}` with stable field IDs, reasons and admin destinations; it performs no IO and is **not yet called by invoice issuance**. Missing mandatory fields must eventually block **new** issuance *before* allocating a payment reference or changing invoice status, once the admin data model is available. Never enable these checks against the existing unconfigured production schema.

Optional content (website, logo, optional renter phone, tax rows, units, notes) is hidden when absent. Existing issued invoices remain readable, without fabricating missing payment references, addresses or bank details.

## Delivery sequence

1. Review this validator and its local unit tests.
2. Prepare schema-only migration PR and its migration-ledger/strict-verification updates.
3. Add restricted admin forms for invoice issuer profile and bank beneficiary.
4. Add tenant-safe loading, strict pre-issue validation and atomic immutable snapshots.
5. Redesign PDF layout and responsive renter/staff presentation to use only verified snapshot data; target one page for simple invoices.
6. Run local unit/PDF tests and disposable SQL/browser integration before considering an app merge.
7. Separately authorize production migration and application deployment, with the schema-only release **first**.

No live invoices, company profiles, bank accounts or production SQL records were altered in this foundation slice.
