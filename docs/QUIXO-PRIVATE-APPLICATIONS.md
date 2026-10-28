# Private rental applications

Website-first package, updated 29 October 2026 (Asia/Colombo). Applications are LIVE after approved migration and public release #40777168505; source defaults remain OFF for new deployments. This follows the live enquiry and viewing journey. Applications are private to the same verified seeker and active owner-workspace administrator; browsing, enquiry and viewing permissions do not create a tenancy membership.

## Current acceptance

PR #450 merged at `c36ff6231966c669c6518c4283757cdd3a8f156e` after all required checks passed at `506ff38c037b1ece939b34f31073b472f33a4a15`. Disposable SQL and real React browser proof #40734091225 PASS; governed migration proof #40734091360, application/authorization, default-public privacy, two-tenant SQL and marketing layout checks PASS. Local build and 52 focused tests PASS. The owner explicitly approved the migration and activation. Dedicated-executor production apply #40738580244 PASS through `20261028_03_property_applications`; approved public release #40777168505 PASS in public mode against exact serving build `c36ff6231966c669c6518c4283757cdd3a8f156e`. Strict 16/16 schema acceptance, restricted runtime access, prerequisites, ready revision, enabled flag, anonymous denial and browsing checks passed. `PROPERTY_APPLICATIONS_ENABLED=true`; Single revision/min=max=1 retained. The earlier transport blocker is resolved. Real participant acceptance remains a physical user test. No production fixture, application, review decision or email was created. [Canonical status](ONE-PROPERTY-PILOT-STATUS.md) retains deployment and release evidence separately from isolated acceptance.

## Renter and owner controls

Both participants use the **Rental application** section of the existing property enquiry. The owner opens **Dashboard → Property enquiries**; the seeker opens **My enquiries**. The selected property, market and verified enquiry identity stay attached on the server.

The seeker submits only proposed move-in date, occupant count, proposed term in months and a short rental statement, with explicit sharing consent. A completed viewing and an open enquiry are required. The date is evaluated against the property's LK/BN civil timezone and must be from today through the next year. Occupant count is 1–50, proposed term 1–120 months and statement at most 2,000 characters. These are application proposals, not accepted contract terms.

The first application step does not collect identity-document images, financial account details, income evidence, health data or other sensitive supporting documents. No upload endpoint or external storage URL is accepted. A later document-request capability requires its own scoped authenticated delivery, explicit document consent and retention design; it must not reuse public listing photos or expose attachments to the public catalogue.

| Action | Actor | State and effect |
| --- | --- | --- |
| Submit | Verified enquiry seeker after completed viewing | Submitted, with consent snapshot |
| Request information | Workspace administrator reviewing a submitted application | Needs information, with a required applicant-visible note |
| Resubmit | Same seeker | Submitted with current version and renewed consent |
| Accept for offer preparation | Workspace administrator reviewing submitted details | Accepted; no reservation, lease, payment or membership created |
| Decline | Workspace administrator | Declined, with required review note; terminal |
| Withdraw | Same seeker while submitted, needs information or accepted | Withdrawn; terminal; existing records remain private and retained for audit |

All decisions are explicit authorised owner actions. The software does not score applicants or make automated eligibility decisions. A closed enquiry cannot submit, request information or accept; an existing application can still be withdrawn by its seeker or declined by the owner. This does not delete records. The first slice retains one application per enquiry; declined/withdrawn records cannot be silently reopened or overwritten.

## Scope, consistency and audit

Every read/write uses the existing serializable enquiry authority: reciprocal global identity, current session, verified personal seeker or live administrator membership, and a locked enquiry scoped to that actor/workspace. Neither browser tenant headers nor submitted property/contact identifiers establish authority. Completed-viewing evidence is read inside the transaction. Submission and acceptance recheck current listing eligibility, market, source property and owner workspace. Withdrawal and decline remain possible after a property is unlisted.

Each change carries the current application version and an actor/request UUID. Exact retries return current state without duplicating an event; changed payload or enquiry conflicts. A unique enquiry/version event ledger preserves each submitted proposal, renewed consent and explicit review note. The durable actor quota is 100 updates in 24 hours. Old replay and delayed refresh cannot replace a newer withdrawal/decision. Private UI components are keyed by identity/workspace and enquiry and unmount when scope changes.

The offer/hold package #453 implements binding to accepted application versions and explicit terms, rechecks state during offer acceptance and invalidates downstream authority when an application is withdrawn. Its production migration and release remain pending; see [offer-to-tenancy controls](QUIXO-OFFERS-TO-TENANCY.md). Application acceptance alone must never suppress public inventory. Concurrent whole-property versus unit holds and activation remain part of the later transactional reservation proof. Existing signing/onboarding authority is reused only after the explicit accepted-offer/identity bridge is built.

## Governed release

Migration `20261028_03_property_applications` adds the application and immutable-through-API event tables after the fifteen existing migrations. The strict inspector verifies columns, types/nullability, primary keys, request/version uniqueness, trusted noncascading foreign keys, state/range/statement/consent/version constraints and defaults. No startup/request-time DDL, production fixtures or web-identity schema privileges are introduced.

`PROPERTY_APPLICATIONS_ENABLED` is independent and defaults OFF. The manual **Property application release controls** workflow supports preflight, public and rollback. After approved apply through the exact target, release now requires strict **17/17** executor ledger/checksum/schema proof against the matched application DB, zero-row restricted application access, live enquiry/viewing prerequisites, exact accepted build and Single revision/min=max=1. It changes only the application switch. Anonymous denial, ready revision and public browsing are checked without customer writes; a failed activation closes the application switch and verifies closure. Rollback remains independent of schema/readiness availability.

The release confirmations are `CHECK-APPLICATION-READINESS`, `ENABLE-PUBLIC-APPLICATIONS` and `CLOSE-PUBLIC-APPLICATIONS`. Production apply requires its explicit action-time approval. Isolated SQL/browser acceptance, production activation and real participant acceptance are distinct. No test account, real rental decision or verification email is fabricated in production. Offers/reservations and the signing/move-in bridge remain subsequent website work. SaaS subscriptions follow website completion; scaling stays deferred and extra running web test replicas are not used.
