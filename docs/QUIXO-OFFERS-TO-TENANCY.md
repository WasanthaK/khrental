# Rental offers, reservations and tenancy continuation

Website delivery package, 29 October 2026 (Asia/Colombo). The owner approved completing these three website priorities together, followed by a review of the canonical plan. This package does not itself close a major canonical milestone. Owner SaaS subscriptions remain after the website; scaling remains deferred.

## Operational journey

1. In **Dashboard → Property enquiries → Rental offer and reservation**, the owner issues exact commercial terms against the current accepted application version: dwelling, monthly rent, deposit, other fees (including explicit zero), rental dates, written terms, acceptance deadline and reservation deadline.
2. In **My enquiries** or **My rental journey**, the same verified seeker reviews and explicitly accepts that offer version. Acceptance atomically claims the exact whole property or unit until the owner-selected deadline. It does not generate a signature, record payment or activate a tenancy.
3. The owner selects a populated workspace agreement template and chooses **Prepare agreement for existing account**. The transaction creates one draft agreement, a durable accepted-terms binding and an active renter membership for the existing global identity, without changing credentials or creating another account. Revoked or incompatible membership is not reactivated or escalated.
4. The owner follows **Review agreement and arrange signing** and the existing Evia/manual-signature controls. The selected template content and commercial schedule are preserved; the schedule includes accepted fees and written terms even when a template omits those merge fields. The seeker follows **Open my agreements and signing status**. A full navigation refresh resolves the new membership. **My rental journey** preserves the seeker's own enquiry/offer history after conversion; ordinary public signup/enquiry eligibility is not broadened.
5. The owner follows **Deposit, move-in checks and activation**. Existing deposit evidence, required checklist and signature rules remain. Activation explicitly rechecks them and current accepted-offer authority transactionally. No browser redirect, offer acceptance or signature alone establishes payment or occupancy.

## Deadlines, changes and cancellation

There is no silently selected reservation duration or automatic extension. Owners enter both deadlines explicitly in the property's LK/BN timezone; UTC instants are persisted and displayed with that property timezone. Both must be future when issued, the reservation must end after the acceptance deadline, and the reservation deadline is bounded to 90 days from issue. These bounds are input safeguards, not an assumed commercial hold duration.

An unaccepted replacement offer requires fresh acceptance of its new version. Withdraw an accepted reservation before changing its terms. Expired/withdrawn reservations may be reissued against a still-current accepted application and open enquiry. Any previous draft/signed agreement and binding remain retained; a new accepted offer produces a new agreement. A previous agreement cannot activate under a replacement reservation. Active tenancies use the existing tenancy lifecycle rather than offer withdrawal.

Expiry releases catalogue eligibility immediately by SQL time predicate. Its durable `expired` event is materialized once when that property/offer is next read or changed; there is no scheduled production sweeper or extra running replica. Application withdrawal/version change or enquiry closure invalidates live offers/holds with an audit event in the same database transaction. Signed evidence is retained. Expiry/withdrawal does not silently erase a signature or terminate an already active tenancy.

## Occupancy, identity and privacy

All offer claims lock the same parent property before checking whole-property and unit overlaps. A database agreement guard uses that shared property lock for existing agreement writers as well; whole-property versus any unit must never both activate. Hold predicates participate in the shared catalogue/detail/photo/enquiry/viewing/application eligibility SQL, while other unheld available units remain visible. Source opt-out, market, workspace and exact property/unit bindings are rechecked before agreement preparation and activation.

The personal journey accepts only a live reciprocal verified global identity. After conversion, every membership must be active renter access derived from a retained accepted-offer agreement binding. Revoked access, arbitrary membership, spoofed workspace headers and foreign enquiry IDs fail closed. Owner writes require current administrator authority. No private source property IDs, contacts, hashes or internal workspace IDs enter anonymous listing projections.

Every offer action has an actor/request UUID, payload hash and current version. Exact retries return current state; changed content conflicts. Events retain the submitted terms and explicit action. The daily actor quota is 100 updates; replay is resolved before quota. Private React components are scoped by account/workspace/enquiry and ignore older delayed versions.

## Governed release and acceptance

Migration `20261029_01_rental_offers_and_holds` adds offer state, event history and durable agreement-binding tables, plus occupancy and enquiry/application invalidation guards. Existing agreement/enquiry SQL uses trigger-compatible result capture. No startup/request DDL or web identity metadata grants are introduced. The governed manifest now contains 17 migrations; strict acceptance verifies all columns, constraints, indexes, noncascading foreign keys, defaults and exact enabled trigger definitions.

Source defaults keep new offers OFF. `Rental offer release controls` supports preflight, public and rollback with exact confirmations `CHECK-RENTAL-OFFER-READINESS`, `ENABLE-PUBLIC-RENTAL-OFFERS`, `CLOSE-PUBLIC-RENTAL-OFFERS`. It requires strict 17/17 executor proof, exact serving build, runtime access and live enquiry/viewing/application prerequisites, Single revision and min=max=1. Public mode installs `PROPERTY_RENTAL_OFFERS_SCHEMA_READY=true` and enables `PROPERTY_RENTAL_OFFERS_ENABLED=true`.

Rollback closes new offer admission only. Schema readiness remains true so existing reservations, authenticated history and withdrawals continue to work and held stock cannot reappear prematurely. Automatic closure follows failed release acceptance. Anonymous checks perform no customer writes. No extra running web test replica is created.

Isolated SQL/browser proof, production migration/release and real participant acceptance are separate. No production account, rental decision, signature, payment or email may be fabricated for verification. The website remains open for the already accepted browsing/enquiry/viewing/application stages while this package is prepared. Update [current canonical status](ONE-PROPERTY-PILOT-STATUS.md) with exact proof/deployment/release outcomes, then review the canonical plan after this package, as requested.

## Retained source acceptance

PR #453 merged at `4870a6f0566ea445f8dfb7beb337b8e6d5589c2b` after all checks passed at `e700c9d257a129737c8b398facf475aaa5f2ec5a`. Disposable actual SQL and real-component browser proof #40785265466 PASS with `RENTAL_OFFERS_SQL=PASS` and `RENTAL_OFFERS_BROWSER=PASS`; existing enquiry/viewing/application regressions pass too. Governed migration #40785265448 PASS; authorization/build #40785265242 passes 774 tests and build. Default-public privacy, two-tenant billing, renter workflow, Evia webhook and protected billing browser checks pass. Production deployment, schema and activation remain separately pending in current status. No actual applicant outcome, contract signature or funds receipt is inferred from fixtures.


Readiness follow-up #455 merged at `fcc69ee8c3ca0cd98607650feaf7a6fbc3929f83` after authorization/build #40787337706 passed 775 tests and actual SQL/browser regression #40787337934 passed at `28d50de732ac893366d2261aab5590d0a9901191`. Expired/replaced reservations now block the move-in readiness projection, with a clear refresh/review response when conditions change during activation. This uses the same seventeenth migration. The initial deployment #40785795774 and read-only plan retry #40785795673 PASS; the new migration is PENDING with no database writes. That intermediate deployment was superseded by the consent-invariant correction #456; final deployment acceptance and production apply/release remain separate.


Consent correction #456 merged at `dc0893fe0c44e7c5df10a92f00c6378dc1ff81ac`; governed SQL #40788381739 and full SQL/browser regression #40788381741 PASS at `6482ad05a4707bfcd99443378e6b55d2174b02f0`. The unapplied draft now explicitly rejects NULL consent evidence for accepted offers. Final build deployment #40788728443 and a fresh read-only plan remain pending acceptance. Automatic approval review blocked the exact production apply before dispatch because action-time user approval for this migration is required. No manual apply or offer-release run exists. Canonical-plan review follows technical release; real participant acceptance remains explicitly open rather than being inferred from fixtures.
