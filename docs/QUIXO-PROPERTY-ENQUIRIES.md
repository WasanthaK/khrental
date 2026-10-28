# Property enquiries and owner inbox

This is the next website package under the owner-directed listing-to-signing objective. SaaS subscription management remains afterward. Implementation is in PR #442; public enquiries are not activated by the source change.

## Behaviour

A property detail page can link to `/enquire?listingId=<public-reference>&country=LK|BN`. The application retains only that validated public reference and market through normal sign-in. It never accepts a redirect URL or tenant selection from that link. The enquiry screen is isolated from tenant storage, navigation and credential onboarding. Normal login remains the sole credential owner; the enquiry API never issues sessions or grants memberships.

The initial supported sender is the existing server-verified, tenantless global seeker. Server session linkage, verified-email evidence, active identity and absence of historical memberships are checked, with authoritative SQL rechecks in each serialized operation. Organization users and tenant administrators cannot impersonate that seeker. This does not change the existing general-signup gate or claim that the full new-user registration journey is released.

The sender explicitly consents to sharing their account name, verified email and message with that property's owner workspace. The immutable enquiry records the public reference, server-derived property/workspace, country/title snapshot, contact snapshot, consent version/time and request hash. It contains no uploaded documents, payment information or housing eligibility screening. The existing listing availability/opt-out/country predicate is rerun before a new submission. A successful retry can return the original receipt even if the property subsequently becomes unavailable.

Only one pending/responded enquiry per seeker/listing can exist. A request reference is unique for that seeker; identical retries return the same receipt and changed content returns conflict. Serialized actor and index-range locks, unique indexes, a durable ten-enquiries-per-24-hours limit and bounded payloads protect writes. Deadlock victims receive an explicit retry result rather than an apparent success.

An active workspace administrator reads the inbox under **Property enquiries**, saves a response or closes the enquiry. Server-derived workspace scope and active membership/session are rechecked transactionally. Staff and foreign workspaces are denied. The seeker sees their own receipt and reply, and can withdraw a pending/responded enquiry. Optimistic versions reject stale updates. Status/response events retain their versions and actor; no audit history is erased. Lists are paged in groups of 50.

Replies are stored in the application. **No email notification or confirmed viewing is claimed or sent by this implementation.** Success means the enquiry transaction committed to the owner's inbox. Availability, enquiry, confirmed viewing, reservation, signing and tenancy activation remain separate stages.

## Release boundary

All new gates default OFF. No production schema, signup, cloud flags or replica change is part of this preparation.

| Control | Effect |
| --- | --- |
| `PROPERTY_ENQUIRIES_ENABLED=true` | Enables both authenticated enquiry APIs only while the existing public-read/shared-rate readiness gates also allow browsing. Existing single-listing scope, when configured, is enforced for submission. |
| `VITE_PROPERTY_ENQUIRIES_UI_ENABLED=true` | Exposes the application enquiry form and administrator navigation. It grants no API authority. |
| `data-property-enquiries-enabled="true"` on the selected marketing detail area | Adds its specific enquiry link; omit until the API, schema and account journey are accepted. Hero/category stock imagery is unchanged. |
| Schema | Exact draft: `migrations/drafts/20261028_01_property_enquiries.sql`. It is intentionally outside the governed production runner until its execution proof and promotion are reviewed. No request/startup DDL is performed. |

Before activation: promote/register the proven migration with the governed runner and strict inspection, apply/verify it through the protected production workflow, deploy the exact accepted build, complete controlled authenticated browser acceptance with designated test identities and verify disabled/rollback behaviour. Resolve the existing signup rollout and new-user registration return path; do not enable unfinished general signup as a side effect. Recheck the actual property and workspace on submission. Do not fabricate live enquiries, create production test users or send mail merely to obtain evidence.

Rollback disables the enquiry server/UI/marketing switches. Retain records and audit history; do not drop enquiry tables or mutate occupancy. Existing public browsing and photo gates can remain as independently approved. No extra cloud replica is needed for this package.

## Verification

`tests/property-enquiries.test.js` exercises strict input/consent, safe return destinations, public/private receipt separation, default OFF, anonymous/unverified/foreign-origin denial, configured listing scope, authoritative actor/workspace derivation, owner/staff boundaries and withdrawal-only seeker writes.

`scripts/test-property-enquiries-sqlserver.mjs` executes the exact migration twice and the actual production store on disposable SQL Server: concurrent same-reference submissions, restart replay, conflicting content, duplicate open enquiries, foreign workspace denial, response/version conflicts, durable audit history, withdrawal, opt-out/country/reservation denial, durable quota and session/membership revocation. It removes its container on completion and never uses production configuration.

`scripts/test-property-enquiries-browser.mjs` exercises the real enquiry, login and owner-inbox components against isolated synthetic API fixtures: selected listing through login, required consent, failure/retry, saved enquiry, owner reply, seeker refresh, mobile width, withdrawal and disabled UI. External requests are blocked. This fixture proof is distinct from controlled production acceptance; it does not prove real email delivery or new-user registration.

The existing authentication/authorization regressions and production build also run. The local runtime prevents Chrome's socket creation; actual browser/SQL acceptance runs in GitHub's disposable jobs. Record successful run/head references in current canonical status before marking acceptance complete. Historical failed fixtures remain failures; later corrected proof supersedes their readiness implication.
