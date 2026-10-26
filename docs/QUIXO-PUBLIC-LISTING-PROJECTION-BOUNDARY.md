# Quixo.Homes — automatic public property listing policy

**Owner's controlling business decision (26 October 2026):** Every eligible property **registered in the KH Rentals application is listed on the public Quixo.Homes website by default**, **unless it is rented, reserved, or the owner/tenant administrator has opted it out**. This supersedes the earlier opt-in/publish-each-property assumption.

## Authoritative visibility rules

- **Default:** Public advertising is ON for available registered rental properties after their country is reliably identified. Registration does not require an extra individual “Publish” operation.
- **Automatically excluded:** Reserved, fully rented/occupied, inactive, under-maintenance and otherwise unavailable properties. Active tenancy/lease is authoritative even if a stale property status still says “available.”
- **Multiple units:** A property/building stays advertised if at least one independently rentable unit is available and unreserved; only available units may be offered. A rented apartment does not hide another vacant apartment in the same property. A full-property reservation or active whole-property tenancy suppresses the whole listing.
- **Persistent opt-out:** Each property has a clear opt-out setting, default `false`. The administrator may opt out at any time. Opt-out overrides availability and stays in place across rented-to-available transitions. Re-enabling makes an otherwise eligible property visible without manual publication.
- **Reappearance:** A property that becomes available again is automatically eligible unless opted out; live reads must check authoritative occupancy/availability, not a stale “published” snapshot.
- **Market:** LK and BN must use explicit, trusted country assignment, not guessed private address parsing. The current properties table has no dedicated country code; this is a one-time classification/data-readiness requirement before live activation. It is not an individual publication approval. Do not silently assign the wrong country/currency.
- **Property types:** Do not exclude available app properties merely for an unexpected property type. Map recognized types to residential, commercial and land; use a generic property category until a valid public type is assigned.

## Country-first browsing UX — owner confirmation 26 October 2026

**Country is the primary visible browsing filter**, for user experience rather than a per-property publication approval. A visitor explicitly chooses **Sri Lanka** or **Brunei** from the homepage or country switch, and sees only the eligible listings belonging to that country. The chosen market determines the public page, currency (LKR or BND), and relevant content. Switching markets from search should retain a supported residential/commercial choice, not arbitrary URL parameters or private account data.

Country-specific browsing must be enforced **server-side as well as in the user interface**. The collection endpoint must reject absent or unsupported markets and must discard any mismatched-country record even if its SQL query regresses. Direct public listing details also require a selected country and must return 404 for a listing belonging to another market. Do not infer a market from IP location, browser language, or personal profile; the visitor makes an explicit, changeable choice.

The original visual design remains accepted, so this is a compact country filter/navigation improvement rather than a website redesign. Actual app property country assignment must be reliable before its public availability can be enabled. No new live listing release flags are authorized by this clarification.

## Security, images and data boundary

Public anonymous queries use a strict allowlist/projection. Never return the source property row or internal property IDs, tenant IDs, private addresses, tenants, agreements, invoices, payments, bank details, internal documents, original image URLs or signed/credentialed storage links. Public title and generalized location can be separately curated; avoid exposing a private address by default. Use an opaque public listing identifier.

Photos should originate from the images attached to properties in the KH Rentals application, but **only via a public-safe, rights-checked optimized derivative**, not from private storage paths. The current static demo photographs are illustrative examples only. The public image derivative/takedown workflow is a separate feature gate.

All public reads use the same SQL store of authoritative app inventory and status, with a shared cross-replica admission limit, strict country filtering, privacy-safe field projection, and no cookies required. No public create/update, viewing enquiries, signup, registration or payment actions accompany this listing stage. Authenticated opt-out/country editing requires an active tenant administrator and an independent authorization check; keep a change/audit trail.

## Implementation/release boundaries

The R4 foundation is staged in GitHub branch `r4/public-property-projection-foundation-20261026`. It covers automatic eligibility semantics, SQL preference/opt-out schema, strictly projected read-only API and tests. The schema migration is **not applied**, the public site is **not yet connected to real app properties**, and `PUBLIC_LISTING_READ_ENABLED`, `PUBLIC_LISTING_SHARED_RATE_LIMIT_READY`, `PUBLIC_LISTING_MANAGEMENT_ENABLED` remain disabled by default. The owner approved the linking direction and default-public policy, but live data exposure must wait for security testing, market metadata readiness, private-image isolation and review of the first real records. No external user records were exposed by documenting this decision.

**Next milestones:** Test SQL migration against representative multi-tenant data, implement reliable property country assignment and easy opt-out in the app, verify active tenancy/units and fast takedown, create public-safe photograph derivatives, connect LK/BN website search to the API, and perform a controlled end-to-end pilot before enabling anonymous visibility.

## Governed publication migration after app-only rollout — 2026-10-26

PR #431 deployed the app country/photo correction and the governed
`20261026_02_property_iso_country` schema. Authenticated demo acceptance proved
country persistence and original-photo display. The publication schema remains
unapplied and all public flags remain disabled.

The draft publication migration now explicitly depends on that country schema.
It never copies listing-preference country back into the canonical property.
The governed runner places `20261026_01_public_listing_preferences` AFTER the
already-deployed `_02_property_iso_country` entry despite filename numbering;
manifest order is authoritative. Executor target selection and strict evidence
cover all 13 managed entries. This is source readiness, not production apply.

Disposable verification must execute both migrations in that order, apply the
publication migration twice, preserve an explicitly saved property country,
backfill unknown legacy countries without guessing, create no public media or
review approvals, and retain existing two-tenant availability/opt-out/lease,
photo withdrawal and authorization proofs. A rejected precondition must roll
back without leaving a partial publication table.

Before release, complete the administrator photo-preparation/review workflow,
verify deployed source-origin/storage configuration and controlled removal,
and obtain the separate public pilot/release-switch authorization. No live
public inventory or source photograph is enabled by this source checkpoint.
