# Quixo.Homes public listing and photograph publication boundary

**Approved product direction:** The Quixo.Homes marketplace will ultimately show *selected public views* of properties registered in the authenticated KH Rentals application. The owner confirmed on 2026-10-26 that eventual website imagery should come from properties registered in the app. **This is a future design requirement, not authorization to expose current properties or enable publication today.**

## Authoritative write owner and public projection

1. The authenticated application is authoritative for property identity, unit identity, ownership/tenant organization, availability, address, rental terms and image attachments. Do not create a second property-admin database just to drive the public website.
2. On creation, a property and every image default to **private/unpublished**. Only a suitably authorized property owner/manager can explicitly publish or withdraw a listing; the publisher must have current tenant-organization/property rights when the action occurs.
3. Create a separate, auditable **public listing projection** containing *allowlisted* owner-approved display fields only: anonymous public listing ID, selected country/region and generalized public location, property category, public headline, rent-per-month and currency when approved, long-term lease conditions, public availability state, approved descriptive features and published image IDs/URLs. Use an explicit listing moderation/approval workflow if required.
4. **Never** expose application property, tenant or organization tables directly, raw object-storage container paths, authenticated SAS tokens, agreements, bank details, invoices, maintenance records, exact unit identity, owner contacts or private full addresses without distinct consent and publication policy.
5. Photos originate in owner-uploaded app attachments but are **individually opted into public display**, checked for rights to publish and sensitive details, processed into privacy-safe optimized derivatives, served from a separate public-only asset route, and withdrawn on owner unpublish/delete/revocation. Private source assets retain their existing authenticated storage boundary.
6. Public readers get only a deliberately scoped, rate-limited read endpoint with strict server-side published/status/country gates; requester-supplied country, listing ID or URL is not an authority. Zero public anonymous writes, viewing enquiries and registration until separately approved.
7. Update public projection from authenticated app transactions/events with an idempotent publish/unpublish sequence, cache invalidation and rapid takedown semantics; no blanket auto-publish on property create or edit. Withdrawal must remove search results and revoke public media from active display, including CDN/cache paths as permitted by storage architecture.
8. Before live launch: negative tests for unpublished properties/images, cross-org/foreign owner attempts, revoked membership, withdrawn media URLs, information leaks in source/metadata, consent, cache and search indexing; confirm actual app schema and avoid imaginary migrations.

## Current proof-reading release

The static site contains **illustrative images from the owner-supplied design ZIP, explicitly approved for the public proof-reading display**, not genuine registered properties. Prices and property descriptions remain examples and must not be represented as real supply. This static release does not query application data, enable a listing endpoint, submit viewing requests, bill, sign up, or register properties. The existing R3 public/signup default-OFF and single-replica controls continue.

**Separate future stage:** Design the authenticated publish/unpublish workflow and public projection after visual proofreading, obtain explicit approval of data exposure fields/security and an owner-selected live property pilot. Keep R4 marketing aesthetics separate from this API/data release gate.
