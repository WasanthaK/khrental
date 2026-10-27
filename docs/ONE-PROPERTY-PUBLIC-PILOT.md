# One-property public pilot release and rollback

Prepared 2026-10-27. [EXECUTION-PLAN.md](EXECUTION-PLAN.md) remains authoritative.
This package prepares controls; merging it does not publish a listing, change
the website feed, modify a property, or close public lifecycle acceptance.
The selected property/content/photo were reviewed privately. Keep identifying
values and the private expected projection out of repository text and inputs.

## Release prerequisites

| Gate | Status / required evidence |
| --- | --- |
| Application release | Accepted serving build `f631e7902a4fdae736a47ed6207271c503d81db9`; recheck exact serving SHA at execution |
| Selected property | Private production eligibility, permitted fields and newly approved derivative accepted; do not reuse the earlier withdrawn test copy |
| Storage direct exposure | Audit #40494891305 attempt 3 PASS; no repeat absent a relevant settings change |
| Human operations | OPEN: production account match, owner/linked identity, recovery custody; assess any Workers/proxy route and cache behavior separately |
| Private release fixture | NOT CONFIGURED by this change: Production secret `R4_PILOT_EXPECTED_PUBLIC_JSON`, containing the exact privately reviewed public DTO and one approved derivative URL/alt |
| Public activation | NOT APPROVED: owner must approve exact property, fields, one photo and API/website audience separately |
| Website feed | LK and BN search flags remain false; existing illustrative design remains accepted |

The expected JSON has exactly `id`, `country`, `category`, `title`, `location`,
`monthlyRent`, `currency`, `images`. Country is LK, currency LKR, and `images`
contains exactly one `{url, alt}`. Use the authenticated private preview and
photo manifest to obtain the approved values; never guess identifiers or use a
source property ID. The image URL must be the guarded relative public route
with `?country=LK`, never a storage/original URL. Configure the secret only
through the authorized credential-management flow; no plaintext in chat/logs.

## Controlled execution after prerequisites and explicit owner approval

1. Freeze unrelated deployments for this short acceptance window. Keep one
   app replica, signup/enquiries/payments off, and the R2 bucket private.
2. Run **One-property public pilot controls / verify-disabled**, branch main,
   with exact serving SHA. It checks build, app/SQL health and anonymous LK/BN
   404 responses. It performs no Azure mutation and needs no private fixture.
3. Retain owner approval and the operations evidence reference. Only then run
   `activate`, exact serving SHA, confirmation
   `APPROVE-ONE-PROPERTY-PUBLIC-PILOT`, and the non-sensitive operations reference.
   A confirmation string is an execution guard, not evidence that the owner
   approved or that unresolved operations gates passed.
4. The workflow first installs and verifies exact single-listing scope in a
   ready revision with all public gates off. It then enables only read/media
   release gates, leaving administrator preparation/review off. Each revision
   has a bounded 15-minute readiness wait; no scale, restart or schema change.
5. The anonymous verifier requires exact approved projection, one photo, empty
   BN collection, country and unrelated-ID denials, no cookies, appropriate
   CORS, no-store responses, WebP container and metadata restrictions. It
   neither proves image visual identity nor exhausts the limiter. Existing
   SQL/concurrency and native processor acceptance remain retained evidence.
6. Any activation failure attempts shutdown and reports rollback unverified
   if shutdown/denial checks fail. Timeout, forced cancellation or runner loss
   can interrupt recovery; use the independent rollback dispatch immediately.
   An API PASS alone does not accept website, withdrawal or proxy/cache behavior.
7. With the already approved pilot audience, make a separate minimal LK search
   flag change to true and review/deploy it; keep BN false. Browse the actual
   marketing host anonymously from Sri Lanka search and switch to Brunei.
   Confirm the exact single real card/photo, no illustrative fallback presented
   as real inventory, no private fields and no cookie requirement. Do not claim
   custom-domain readiness from the default Azure hostname.
8. Perform the separately authorized public withdrawal test under current
   tenant-administrator access: temporarily enable management/review only,
   keeping the exact pilot scope; withdraw the approved derivative. The old
   public photo URL must return 404, including with a previously cached browser
   URL; revisit via the actual website/proxy topology. Confirm the private
   original remains accessible only to authorized users. Do not change rent,
   occupancy or agreements. The existing private workflow disables public gates
   and therefore cannot stand in for a live withdrawal test.
9. Finish the bounded window with rollback unless the owner explicitly accepts
   continued exposure. Record serving build, scope/field checks (redacted),
   country/media/cache/withdrawal results and actual rollback outcome in the
   master plan. Failed/not-run gates remain open. Reapproval after withdrawal
   is separate work; never silently restore a withdrawn copy.

## Emergency rollback

Run **One-property public pilot controls / rollback**, branch main, confirmation
`ROLLBACK`. It deliberately does not require a healthy build endpoint, expected
SHA, private fixture or operations evidence. It sets listing/readiness/media and
all temporary administrator preparation/review gates false, waits for readiness,
and requires anonymous LK and BN inventory 404s. Scope remains installed; never
remove scope while public gates may be on. Then verify old detail/media URLs
are denied and set the LK static feed flag false/deploy if it was enabled.

If the workflow fails or is interrupted, an authorized Azure operator applies
the same seven false booleans directly using the existing production OIDC/CLI
authority and verifies actual responses; do not treat the requested update or
latest revision name alone as shutdown proof. Disable any confirmed external
proxy cache route through its approved operations control. Escalate unverified
rollback immediately, preserving the private bucket and source property.

The API flag shutdown stops fresh origin responses. It does not delete an
already downloaded photograph, retract browser copies, or prove third-party
cache invalidation. Those limits must be part of the exact pilot decision.
