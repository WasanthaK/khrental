# Property viewing coordination

Website-first package, 28 October 2026. This connects verified seekers and active workspace administrators through their existing property enquiry. It does not create memberships, reserve stock, send email or activate a tenancy.

## Current acceptance

PR #448 merged at `6d4982956b8c35ae949df062a8e1fabc2653b22c`; final required checks passed at `c70cfc75dd1a8f011d357ce4c7847b9c495eba28`. Disposable SQL and actual React browser proof #40727465285 PASS, including cancellation after enquiry closure, delayed refresh and replay privacy. Governed migration #40727465296, application/authorization, two-tenant SQL and marketing layout checks PASS. Local build and 47 focused tests PASS. Production activation remains OFF: automatic approval review rejected production migration submission before dispatch because exact action-time user approval is required. No production fixture or real viewing was created. Current deployment/evidence is retained in [canonical status](ONE-PROPERTY-PILOT-STATUS.md).

## Controls and states

The seeker uses **My enquiries → Viewing appointment**. The owner uses **Dashboard → Property enquiries → Viewing appointment**. Each enquiry has one versioned appointment, retained across rescheduling and cancellation. The inbox is the current schedule view; a separate multi-property calendar is not implemented in this slice.

| Action | Authority | Result |
| --- | --- | --- |
| Request time / request different time | Verified enquiry seeker | Requested; previous confirmation no longer applies |
| Confirm requested time | Current workspace administrator | Confirmed |
| Propose time / reschedule | Current workspace administrator | Proposed; requires seeker acceptance |
| Accept proposed time | Verified enquiry seeker | Confirmed |
| Cancel | Either authorised participant | Cancelled; meeting instructions withheld |
| Complete / no-show | Current workspace administrator after appointment end | Completed / no-show |

Closed or withdrawn enquiries cannot schedule, confirm or accept a new appointment. An existing appointment remains independently cancellable; closing a message does not silently cancel a confirmed appointment. Completed/no-show appointments are terminal. A cancelled appointment can be rebooked while the enquiry remains open.

Times are entered and displayed in the property's launch-market timezone: **Asia/Colombo** for LK or **Asia/Brunei** for BN. Browser timezone cannot change the appointment. Duration is 15–180 minutes; scheduling/confirmation requires a future start within 90 days. SQL Server supplies the authoritative current time. Completion requires the end time to have passed.

Optional meeting instructions are supplied explicitly by the owner. They are scoped to the same enquiry and shared with the seeker only after confirmation; proposed/cancelled receipts omit them. Original private property addresses and contacts are never automatically copied. No public feed, photograph or availability response includes viewing data. Exact replay after cancellation returns the current appointment, so it cannot restore withdrawn instructions.

## Durability and scope

The existing enquiry transaction rechecks reciprocal app/auth identity, live session and verified personal-seeker or active-tenant-administrator authority before locking the scoped enquiry. Foreign enquiry references return not-found. Scheduling, rescheduling, confirmation and acceptance recheck current public listing eligibility and country/property/workspace linkage inside that transaction. Cancellation and recording the outcome remain possible after a listing is withdrawn.

Every change includes current version and a request UUID. Version conflicts require refresh. The same actor/request replays without another event; changed payload or enquiry conflicts. The event ledger is append-only through the application and has unique actor/request and enquiry/version constraints. A durable 100-update/24-hour actor quota bounds writes; exact retries and reads do not consume it. SQL deadlocks return a retry response. Private components unmount on seeker identity or owner workspace change.

## Release boundary

Source defaults **OFF** unless `PROPERTY_VIEWINGS_ENABLED=true`; parent enquiry/public-read/session/origin gates remain mandatory. The UI discovers the authenticated subroute and omits appointment controls for the explicit disabled response. No signup, listing, payment, membership or scale switch is changed by this feature.

Governed additive migration `20261028_02_property_viewings` is managed after the existing fourteen migrations. Strict inspection checks columns/types/nullability, keys, unique request/version indexes, trusted noncascading foreign keys, state/time/timezone/version constraints and defaults. No request-time DDL or production fixture writes are permitted.

After accepted application deployment, apply through that migration using the existing dedicated executor, then run strict **15/15** verification. The manual **Property viewing release controls** workflow requires the exact accepted serving SHA and `CHECK-VIEWING-READINESS` (preflight) or `ENABLE-PUBLIC-VIEWINGS` (public). It requires fresh strict executor proof, zero-row restricted application access and existing enquiry prerequisites before opening. It preserves Single revision/min=max=1 and verifies anonymous denial without customer writes. Failure after a switch update closes viewings and checks the ready closed state. `CLOSE-PUBLIC-VIEWINGS` rollback skips readiness so closure remains available if the schema or parent journey is unavailable.

Implementation and isolated acceptance are separate from production activation and actual participant acceptance. Real people must confirm actual appointments; synthetic SQL/browser fixtures do not prove a real viewing or email delivery. Applications, transactional holds and the signing/tenancy bridge remain subsequent website packages. SaaS subscriptions follow website completion; scaling is deferred.
