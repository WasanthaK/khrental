# KH Rentals Stage 3 — Core Tenancy Lifecycle

## Purpose

Stage 3 connects the protected Phase 2 authorization foundation to the real KH Rentals operating lifecycle. The goal is not to add another set of disconnected screens. Existing agreement, invoice, payment, utility, maintenance, property/unit and rentee-portal features should become one auditable end-to-end flow.

Phase 2 remains the authorization boundary:

- active tenant membership is authoritative for role;
- administrators are tenant-wide;
- staff and contractors operate only within permitted roles and assigned properties/jobs;
- rentees/lessees operate only on their own tenancy data;
- client-supplied tenant/property IDs never prove access;
- new Stage 3 actions must use server-enforced permissions and trusted relationships.

## Business lifecycle to support

The Stage 3 target follows the operating requirements already captured for KH Rentals:

1. advertise/vacancy and select a rentee;
2. collect confirmation advance/security deposit;
3. prepare and sign the rent agreement;
4. complete the move-in item checklist;
5. issue monthly rent and utility invoices;
6. receive payment proof, verify payment, issue receipt/acknowledgement and reminders;
7. receive and execute maintenance work;
8. renew or terminate the tenancy;
9. inspect, settle damage and close/refund the deposit;
10. retain a complete audit history.

The first Stage 3 release focuses on the tenancy lifecycle from onboarding through closure. Vacancy advertising and broader CRM/enquiry tracking can follow after the core tenancy workflow is reliable.

## Stage 3A — Rentee onboarding and tenancy activation

### Objective

An administrator can take a new rentee from invitation to an active tenancy without SQL Query Editor or diagnostic screens, and the rentee immediately sees the correct tenancy in the portal.

### Flow

1. Administrator creates or invites the rentee.
2. Recipient securely accepts the invitation and establishes credentials.
3. Administrator selects the property and unit.
4. System records confirmation advance/security deposit where applicable.
5. Administrator creates the agreement using the correct template.
6. Required parties sign the agreement.
7. Administrator completes the move-in/item checklist.
8. Agreement becomes active only when the required activation conditions are met.
9. Rentee portal resolves the active property/unit/agreement from trusted server relationships.

### Engineering work

- Audit the current invitation/acceptance/password setup path for single-use, expiry and tenant binding.
- Make agreement/property/unit relationships the authoritative tenancy relationship.
- Define explicit activation status/transition rules rather than relying on UI assumptions.
- Add or normalize deposit/advance transaction records if the existing schema cannot represent an auditable balance safely.
- Implement a move-in checklist linked to the agreement/property/unit rather than free-form notes.
- Ensure portal queries use central ownership authorization and do not depend on browser filters.
- Record actor/time/state transition audit information for activation actions.

### Acceptance criteria

- Admin can complete onboarding using normal UI only.
- A rentee cannot select or alter another rentee/property/unit relationship.
- A rentee sees only their own active agreement, unit and related documents.
- A staff user without the appropriate permission/property assignment cannot activate a tenancy.
- Invitation acceptance cannot be reused or altered to claim a different account.
- Activation state is reproducible from persisted records, not frontend state.

## Stage 3B — Monthly billing, payments and receipts

### Objective

Produce one auditable monthly account flow from rent and utilities through payment verification and receipt.

### Flow

1. Generate charges for current rent.
2. Add approved electricity/utility charges.
3. Include fixed charges such as water where configured.
4. Carry approved arrears/past dues and applicable taxes/other charges.
5. Issue one invoice to the rentee.
6. Rentee submits payment proof.
7. Authorized finance/admin user verifies or rejects the payment.
8. System records the payment against the invoice/account.
9. System issues a receipt/payment acknowledgement and updates outstanding balance.
10. Reminder workflow can identify overdue balances without duplicating accounting state.

### Engineering work

- Use trusted server joins for `payment -> invoice -> property -> agreement/rentee` authorization.
- Remove the Phase 2 conservative staff-payment deny only where that full relationship is proven server-side.
- Define invoice component types and source references so rent, utility, arrears and adjustments remain traceable.
- Make payment verification a named server action with permitted state transitions.
- Prevent duplicate verification/receipt issuance.
- Preserve rejection reason and verification audit data.

### Acceptance criteria

- Finance staff can see/verify payments only for assigned properties.
- Rentee can see and submit proof only for their own invoice/account.
- A verified payment cannot be verified twice.
- Receipt totals reconcile to persisted payment and invoice amounts.
- Outstanding balance can be derived without manual spreadsheet/SQL correction.

## Stage 3C — Maintenance execution lifecycle

### Objective

A rentee can report a problem, operations can assign the work, and an authorized worker can complete it while the rentee sees progress.

### Flow

1. Rentee creates a maintenance request for their tenancy.
2. Administrator/manager reviews and prioritizes it.
3. Work is assigned to an eligible staff member or contractor.
4. Worker sees the job in an assigned-work queue only.
5. Worker records progress, permitted notes/photos and completion.
6. Administrator/manager can review completion and costs as permitted.
7. Rentee sees customer-safe status updates and completion.

### Engineering work

- Reuse Phase 2 assigned-property and direct job-assignment authorization.
- Separate internal operational notes from rentee-visible comments if the current schema mixes them.
- Validate maintenance attachment storage through tenant/record ownership.
- Define controlled status transitions and completion metadata.
- Limit worker access to the minimum rentee contact information necessary for the assigned job.

### Acceptance criteria

- Contractor/staff cannot enumerate unassigned work.
- Rentee cannot view another rentee's maintenance request or attachments.
- Manager cannot operate a maintenance request outside assigned properties.
- Status history identifies who changed what and when.

## Stage 3D — Renewal, termination, inspection and settlement

### Objective

Close or renew a tenancy without losing financial, document or maintenance history.

### Flow

1. Renewal/termination notice is recorded and delivered.
2. Move-out inspection/checklist is completed when terminating.
3. Damage items and approved settlement amounts are recorded.
4. Deposit balance is calculated against approved settlement items.
5. Final invoice/payment/refund is recorded.
6. Agreement is closed with an effective end date.
7. Unit becomes available only when closure conditions are met.
8. Historical tenancy remains readable according to authorization/audit policy.

### Acceptance criteria

- Closing a tenancy does not delete historical records.
- Deposit settlement is auditable and reconciles to the original deposit plus approved deductions/refunds.
- A former rentee cannot gain access to a new occupant's records after the relationship ends.
- Unit availability follows persisted tenancy state rather than a manual UI toggle alone.

## Stage 3 sequencing

Implement and release in this order:

1. **3A Onboarding and tenancy activation**
2. **3B Billing, payments and receipts**
3. **3C Maintenance lifecycle**
4. **3D Renewal/exit/settlement**

Each slice should be independently testable and releasable. Avoid combining all Stage 3 work into one large pull request.

## Existing product areas to reuse

Stage 3 should first reuse and harden the existing code rather than create duplicate modules:

- rentee portal and rentee agreement/invoice/maintenance/utility pages;
- agreement creation, templates, signing and agreement details;
- properties and property units;
- invoice generation and invoice management;
- payment proof upload and payment verification;
- utility reading/review/billing features;
- maintenance request, assignment, status, comments and attachments;
- invitation/account setup;
- central Phase 2 tenant context and permission engine.

Where duplicated legacy paths exist, Stage 3 should converge them onto the central platform authorization path instead of adding another compatibility layer.

## Explicitly outside the first Stage 3 slice

Do not pull these into 3A unless required to complete activation safely:

- broad dashboard redesign;
- vacancy advertising/enquiry CRM;
- recurring cleaning/maintenance calendar;
- camera/data-plan renewal management;
- general communication centre;
- broad UI visual polish;
- new analytics/reporting platform.

These remain valuable follow-on work once the core lifecycle is trustworthy.

## Release and security gates

Every Stage 3 slice must satisfy the same release discipline established in Phase 2:

- server-side authorization is authoritative;
- positive tests for permitted administrator/staff/rentee actions;
- negative tests for cross-rentee, cross-property and unauthorized-role access;
- no raw SQL/schema RPC or client-controlled authorization shortcut;
- explicit database migration review and execution before code deployment when schema changes are required;
- authorization tests and production build green on the final branch head;
- PR deployment skipped;
- final diff reviewed before merge;
- production deployment health check passes;
- role-based production smoke test after deployment.

## Immediate implementation task — Stage 3A discovery

Before changing schema or UI, trace the current end-to-end paths for:

- create/invite rentee;
- invitation acceptance and credential setup;
- property/unit selection;
- agreement creation and activation/signing;
- deposit/advance representation;
- item/checklist representation;
- rentee portal tenancy resolution.

Document which existing tables/services/pages are authoritative, identify duplicate/legacy paths, and then make the smallest coherent set of changes required for a secure 3A vertical slice.
