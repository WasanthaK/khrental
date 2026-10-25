# Quixo.Homes public website — controlling design alignment brief

**Decision date:** 2026-10-25  
**Status:** OWNER-SUPPLIED FINAL-DIRECTION MOCKUPS INSPECTED — VISUAL REFERENCE LOCKED FOR DESIGN ALIGNMENT; NOT PUBLICATION OR IMPLEMENTATION APPROVAL  
**Applies to:** One shared Quixo.Homes public website experience, initially adapted for Sri Lanka (LK) and Brunei Darussalam (BN).  
**Supersedes:** Landlord-only visual direction of the unpublished `marketing/lk/index.html` and `marketing/bn/index.html` draft pages. It does **not** supersede KH Rentals business release, R3 default-OFF controls, R4/R5 regional/Stripe commercial gates, or approved architecture.

## Source and evidence boundary

The owner approved the latest direction from a separate 2026-10-25 website-design discussion and has now uploaded **`Quixo_Homes_Complete_Website_Mockups(1).zip`** directly in this KH Rentals conversation. The ZIP was opened, all four rendered mockup PNGs visually reviewed, and its `DESIGN_BRIEF.md`, source wordmark reference PNG, and three vector branding files inspected on 2026-10-25. **This owner-supplied package is now the controlling visual reference for design alignment**; the package is a concept/mockup set, not evidence of code, live inventory or a real service. The uploaded archive is not committed or redistributed into the public repository. This file records its filenames and requirements only.

The separate design conversation explicitly requested **mockups only, no actual site/code/deployment** at that stage. This document makes no change to marketing code, runtime feature flags, publication, SQL, subscriptions or customer information.

## Visual identity — owner's latest direction

- Use the **lowercase `quixo.homes` wordmark**.
- Retain the original **Quixo `q` and wordmark letterforms**; the letter `i` has a **blue square above it**.
- Retain the **green separator dot** between `quixo` and `homes`.
- Set `homes` in restrained, simple lowercase lettering. **No separate house/roof icon**, decorative lettering, or newly invented emblem.
- The uploaded ZIP contains the actual *design-package* vector master `brand_reference/quixo-homes-primary.svg`, dark-background `quixo-homes-on-navy.svg`, `quixo-homes-app-icon.svg`, and original owner-provided Quixo wordmark PNG. Use the included primary vector as the **design's visual master**, not a CSS/text reconstruction or unrelated roof/Q icon. The supplied brief specifies navy `#0B2545`, green `#22C55E`, blue square `#3B8DCC`, white `#FFFFFF` and light surface `#F3F6FA`.
- The master is in the user-supplied private conversation ZIP, **not** in the public GitHub repo; its use in any deployed assets needs explicit later implementation approval and applicable brand/license confirmation.

## Product and audience architecture

The public site serves **two audiences** under one brand, with a **seeker-first homepage hero** and clear dedicated owner/tenant pathways, matching the supplied mockups:
1. **Rental seekers** exploring **long-term residential and commercial rentals**, searching listings and sending viewing/enquiry requests. This is **not** a nightly-stay, guest-count or holiday-booking flow.
2. **Owners/managers** with **1–10 independently rentable dwellings** who need one application for property/unit details, tenants/agreements, invoices, maintenance, and ongoing administration.

The public marketplace and property-listing projection are design targets; **no production private rental/tenant records, images, addresses, pricing, or documents are authorized for publication** solely by this brief. The Quixo.Homes SaaS management product and the rental marketplace are related but have separate launch gates.

## Uploaded controlling design package — contents verified 2026-10-25

Archive: `Quixo_Homes_Complete_Website_Mockups(1).zip`; folder `Quixo_Homes_Website_Design_Mockups/`.

| Rendered mockup / asset | Verified design coverage |
| --- | --- |
| `01_homepage_desktop_mobile.png` | Desktop/mobile seeker-first homepage, residential vs commercial search, monthly-rent filters, homes/shops/offices category tiles, listing cards, four-step lease journey, owner and tenant follow-on CTAs |
| `02_search_residential_commercial_detail.png` | Desktop residential/commercial search filters; home and commercial retail detail pages including monthly rent, availability, minimum lease, deposit, advance, property facets, photos, map and viewing/enquiry actions |
| `03_owners_how_it_works_tenancy_portal.png` | Owner acquisition page; four-step seeker process; owner/tenant app-portal concept with agreements, rental invoices/payments and maintenance |
| `04_mobile_rental_journey.png` | Four mobile concept screens: residential/commercial search, listings/results, property detail, viewing-request form |
| `DESIGN_BRIEF.md` | Intended public navigation, precise palette/tagline, UX facets, audience, disclaimers and nonimplementation scope |
| `brand_reference/original_quixo_wordmark_user_reference.png`, `quixo-homes-primary.svg`, `quixo-homes-on-navy.svg`, `quixo-homes-app-icon.svg` | Source Quixo logo reference and design-package vector master, on-navy treatment and icon |

**Tagline:** `a home for life and business.`

**Source-derived navigation:** *rent a home / residential; commercial spaces; for property owners; how it works; help & contact; sign in* (to `app.quixo.homes`), plus an owner listing CTA gated by product readiness.

**Rental-search facets:** residential: type, location, **monthly** rent, beds/baths, furnishing, parking, availability, pets as relevant; commercial: subtype, floor area, monthly rent, permitted/possible uses subject to verification, frontage, parking, floor level, fitout and access. Detail screen includes available date, minimum lease, deposit, advances, utilities/fees, gallery/floor plan, map and viewing/enquiry contact.

**Illustrative-data warning:** Mockup property inventory totals, rents, dates, places, fees, photos, benefit claims, reviews, app screens, possible listing status/verification, payment interactions and examples do **not** prove production data, licensed assets, or functioning features. Some cross-screen examples intentionally conflict. Replace/validate before any public release. In particular, mockup `Pay now` controls, verified statuses, 'secure'/'private' and owner listing actions do not authorize actual payment, security claims, publication, accounts or customer writes.

**Visual-review outcome:** The supplied package covers the requested desktop/mobile homepage, search, residential/commercial detail, owner overview, tenancy app concepts and mobile viewing enquiry. No replacement mockup is needed merely to recover the design direction. True implementation/accessibility/country copy review remains separate; screen-reader behavior, mobile overflow and production routing were not evaluated from images alone.

These are mockups, not instructions to implement routes, activate APIs, email real prospects or publish property listings.

## Shared LK/BN design and commercial guardrails

- Use **one shared design system, frontend and authenticated application** at `app.quixo.homes`. Planned localized marketing variants: `quixo.homes/lk/` then `quixo.homes/bn/`. These are proposed routes, not proofs of deployment.
- Sri Lanka: expected LKR/month rental examples and appropriate Sri Lankan terminology; Brunei: BND/month rental examples and appropriate local terminology. All displayed prices in mockups must be **clearly illustrative**, not invented public listings, approved SaaS regional rates, or customer-specific prices.
- **SaaS baseline remains USD $5 per independently rentable dwelling/month, monthly only, no trial**; LK/BN-specific SaaS prices and billing/tax/MoR eligibility are **not approved**. Do not design active checkout or assert service availability.
- Existing R3 B04 conditional **single Azure replica** acceptance stands. **All five general signup/seeker rollout flags remain OFF**; no replica scaling before required distinct-replica test and approval.
- No Redis, extra paid resources, real invoices, Evia signing, production email, customer registration or Stripe changes under this design task.

## Existing draft discrepancy and disposition

The isolated branch `r4/lk-bn-marketing-drafts-20261025` presently contains landlord-first marketing HTML based around a **house symbol** brand and a management-only first impression. Those draft pages are **not approved visual designs** for the new two-audience Quixo.Homes concept; template parity and static checks do not constitute design acceptance. **Hold publication/merge of those marketing pages.** Retain the drafts only as historical/reference implementation experiments; do not call them the approved final website.

## Next canonical steps — aligned to supplied visuals, no production mutation

1. **Complete:** owner-provided design ZIP retrieved and visually reviewed. Use this package, including its exact vector master, as reference. Do not generate a divergent logo or generic real-estate design.
2. Conduct a focused design/content gap review and country adaptation for **LK first, BN second**, retaining a seeker-first homepage, clearly separated commercial/residential filters and owner/tenant pathways. Country price, imagery and copy must be genuine or explicit mock data.
3. Map proposed site pages and API/data dependencies **without publishing any listing**. Distinguish public listing projection/viewing requests from private tenant/rent/invoice/maintenance data; respect the conditional R3 single-replica ceiling and OFF public signup gates.
4. Seek **separate implementation and publication authorization** before merging or changing `marketing/**` on main, because the existing Azure Static Web Apps workflow deploys marketing changes automatically. Paid Stripe, marketplace listing publication, public registration and regional launch each require independent gates.

**Current decision:** OWNER-SUPPLIED MOCKUP PACKAGE REVIEWED; CONTROLLING VISUAL DIRECTION ESTABLISHED; COUNTRY MARKETING DRAFTS HOLD/UNPUBLISHED; WEBSITE IMPLEMENTATION AND PUBLIC RELEASE NOT AUTHORIZED.
