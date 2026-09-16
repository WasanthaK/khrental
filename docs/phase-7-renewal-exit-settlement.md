# Phase 7 — Renewal, Exit & Settlement

## Objective

Complete the tenancy lifecycle without deleting operational, financial or document history. The active agreement remains the tenancy master until controlled closure.

## Dependency

Phase 7 requires the Phase 4 tenancy onboarding schema and the Phase 5 billing/payment schema. Settlement derives security deposit receipts from Phase 4 and outstanding agreement invoices from Phase 5.

## Renewal / termination notices

Management can issue either:

- `renewal_offer`
- `termination_notice`

Tenants may accept/decline a renewal offer or acknowledge a termination notice. Responses are persisted with actor/time rather than inferred from email delivery.

An accepted renewal offer can create a new **draft** agreement linked through `renewed_from_agreement_id`. The renewal draft still follows the normal agreement/signature/onboarding/activation controls; renewal does not bypass them.

## Move-out inspection

A termination path initializes one move-out inspection per agreement. The checklist is copied from the original move-in checklist when available, falling back to the property checklist.

Each item records condition (`good`, `damaged`, `missing`, `not_applicable`), notes and an optional proposed deduction. All items must be reviewed before completing the inspection.

## Settlement

One settlement is maintained per agreement.

The calculation is server-derived:

```text
obligations = approved deductions + outstanding agreement invoices
refund      = max(security deposit received - obligations, 0)
amount due  = max(obligations - security deposit received, 0)
```

Only received Phase 4 `security_deposit` transactions count as deposit. Confirmation advances remain distinct.

Damage/other settlement items must be explicitly approved or rejected before settlement approval. A non-zero refund or amount due requires a settlement reference when marked settled.

## Controlled tenancy closure

`POST /api/tenancy-exit/agreements/:agreementId/close`

Closure requires:

- move-out inspection `completed`;
- financial settlement `settled`;
- agreement still `active`.

The closure transaction:

1. marks agreement `closed` with effective end date/actor/reason;
2. releases its unit to `available` when applicable;
3. changes property to `available` only when no other active agreement remains at that property;
4. records a tenancy lifecycle event.

Generic platform CRUD and legacy agreement updates are prevented from directly setting `status=closed`.

## API surface

Mounted at `/api/tenancy-exit`:

- `GET /agreements/:agreementId`
- `POST /agreements/:agreementId/notices`
- `POST /notices/:noticeId/respond`
- `POST /agreements/:agreementId/renewal-draft`
- `POST /agreements/:agreementId/move-out-inspection`
- `PATCH /agreements/:agreementId/move-out-inspection/items/:itemId`
- `POST /agreements/:agreementId/move-out-inspection/complete`
- `POST /agreements/:agreementId/settlement/items`
- `PATCH /agreements/:agreementId/settlement/items/:itemId`
- `POST /agreements/:agreementId/settlement/approve`
- `POST /agreements/:agreementId/settlement/settle`
- `POST /agreements/:agreementId/close`

## Database release gate

Apply after Phase 5 is deployed/migrated:

```bash
npm run migrate:tenancy-exit-settlement
```

`property_units.unitnumber` is the canonical unit display field and is used directly by the Phase 7 lifecycle API. No compatibility `name` column or additional unit migration is required.

## Smoke test

1. issue a renewal offer and verify tenant can accept/decline only their own notice;
2. create an accepted renewal draft and confirm it is `draft`, not active;
3. issue/acknowledge a termination notice;
4. initialize move-out inspection and verify move-in checklist items were copied;
5. mark all inspection items and complete inspection;
6. approve/reject damage deductions;
7. confirm settlement uses only received security deposit and verified invoice payments;
8. confirm refund/amount-due arithmetic;
9. mark settlement settled with a financial reference when money changes hands;
10. verify closure is blocked before inspection/settlement completion;
11. close tenancy and verify agreement `closed`;
12. verify unit becomes `available`;
13. verify property becomes `available` only if it has no other active tenancy;
14. verify historical agreement/invoices/payments/maintenance remain readable under access policy;
15. verify generic CRUD cannot set an agreement directly to `closed`.
