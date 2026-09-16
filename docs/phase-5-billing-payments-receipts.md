# Phase 5 — Billing, Payments & Receipts

## Purpose

Phase 5 operationalizes an active tenancy after Phase 4 activation. The authoritative tenancy remains the active `agreements` row. Billing is derived from that tenancy rather than from legacy property association fields.

## Grounding

The repository already contained invoice screens, utility billing, payment-proof upload and payment verification UI. The main gap was transactional integrity: payment proof and verification could directly mutate invoice status without an auditable payment/receipt lifecycle.

Phase 5 keeps the existing invoice surface for compatibility but moves financial state transitions to dedicated server routes.

## Monthly billing model

`POST /api/billing/monthly-invoices`

For each selected active agreement:

1. enforce staff/admin invoice-management permission and property scope;
2. prevent duplicate tenancy invoices with `(tenant_id, agreementid, billingperiod)` uniqueness;
3. add contractual rent from `agreements.rentamount`;
4. add approved utility readings whose `billing_status = pending_invoice` for the billing month;
5. create source-linked `invoice_components` rows;
6. mark included utility readings `invoiced` and attach their `invoice_id`;
7. create a lifecycle event.

The existing `invoices.components` JSON is still populated for legacy UI compatibility. `invoice_components` is the auditable component ledger going forward.

## Payment lifecycle

### Tenant submits proof

`POST /api/billing/invoices/:invoiceId/payment-proof`

- tenant can only submit against their own invoice;
- amount cannot exceed outstanding balance;
- only one payment can await verification at a time;
- creates a `payments` row with status `pending`;
- legacy `invoices.paymentproofurl` is retained for current UI compatibility;
- invoice moves to `verification_pending`.

Uploading proof does **not** mark an invoice paid.

### Finance/admin verifies

`POST /api/billing/invoices/:invoiceId/verify-payment`

Approval:

- pending payment becomes `verified`;
- one immutable receipt record is created;
- outstanding balance is recalculated from verified payments;
- invoice becomes `paid` only when verified payments cover the full invoice amount.

Rejection:

- rejection reason is mandatory;
- payment becomes `rejected`;
- rejected amount does not reduce the balance;
- tenant may submit a replacement proof.

### Manual verified payment

`POST /api/billing/invoices/:invoiceId/manual-payment`

This replaces the legacy direct “mark paid” behavior. A manual payment creates the same verified payment ledger, receipt and balance recalculation as proof approval.

### Account view

`GET /api/billing/invoices/:invoiceId/account`

Returns:

- invoice;
- source-linked components;
- all payment attempts;
- receipts;
- derived outstanding balance.

Tenant access is limited to owned invoices. Staff access remains property-scoped.

## Database changes

Migration:

```bash
npm run migrate:billing-payment-lifecycle
```

Adds:

- invoice tenancy/issue metadata;
- payment ownership/submission/verification metadata;
- `invoice_components`;
- `payment_receipts`;
- `billing_lifecycle_events`;
- uniqueness/index guards.

## Release gate

The database migration must be applied **before** deploying Phase 5 application code.

## Smoke test

1. generate a monthly invoice for an active tenancy;
2. regenerate the same month and verify it is skipped rather than duplicated;
3. confirm rent and eligible utilities appear on the invoice;
4. sign in as the tenant and submit payment proof;
5. confirm invoice is `verification_pending`, not `paid`;
6. reject once with a reason and verify resubmission is possible;
7. submit again and approve;
8. verify a payment row and receipt exist;
9. verify outstanding balance reaches zero and invoice becomes `paid` only after sufficient verified amount;
10. attempt a second proof while one is pending and verify it is blocked;
11. verify tenant account/receipt history is visible only to that tenant;
12. verify staff cannot manage invoices outside assigned properties.

## Compatibility

Legacy invoice fields are intentionally retained during this phase. They can be removed only after all invoice surfaces use the dedicated billing projection and lifecycle API.
