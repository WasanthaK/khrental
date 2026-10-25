# Quixo.Homes public website — controlling design alignment brief

**Decision date:** 2026-10-25  
**Status:** OWNER-AGREED DESIGN DIRECTION — MOCKUPS/DESIGN REVIEW ONLY; NOT PUBLICATION OR IMPLEMENTATION APPROVAL  
**Applies to:** One shared Quixo.Homes public website experience, initially adapted for Sri Lanka (LK) and Brunei Darussalam (BN).  
**Supersedes:** Landlord-only visual direction of the unpublished `marketing/lk/index.html` and `marketing/bn/index.html` draft pages. It does **not** supersede KH Rentals business release, R3 default-OFF controls, R4/R5 regional/Stripe commercial gates, or approved architecture.

## Source and evidence boundary

The owner approved the **latest** public website direction from a separate 2026-10-25 visual-design discussion, and in the KH Rentals continuation agreed to use that direction as the common design before adjusting country pages. The recorded verbal decisions below are recoverable. **The exact final rendered mockup image is not available for a pixel-level comparison in this GitHub repository/review context.** Therefore this document is a requirements alignment brief, not a claim that the final reference artwork was visually verified or reproduced.

The separate design conversation explicitly requested **mockups only, no actual site/code/deployment** at that stage. This document makes no change to marketing code, runtime feature flags, publication, SQL, subscriptions or customer information.

## Visual identity — owner's latest direction

- Use the **lowercase `quixo.homes` wordmark**.
- Retain the original **Quixo `q` and wordmark letterforms**; the letter `i` has a **blue square above it**.
- Retain the **green separator dot** between `quixo` and `homes`.
- Set `homes` in restrained, simple lowercase lettering. **No separate house/roof icon**, decorative lettering, or newly invented emblem.
- Exact image geometry, pixel dimensions, font assets, colors beyond the explicitly specified blue-square and green-dot distinction, spacing, and responsive treatment need the **actual approved visual mockup** before final art approval. Do not substitute a historical roof/Q candidate or interpret earlier logo/IP screening as overriding this later decision.

## Product and audience architecture

The public site serves **two audiences**, with distinct paths through a single brand/site:
1. **Rental seekers** exploring **long-term residential and commercial rentals**, searching listings and sending viewing/enquiry requests. This is **not** a nightly-stay, guest-count or holiday-booking flow.
2. **Owners/managers** with **1–10 independently rentable dwellings** who need one application for property/unit details, tenants/agreements, invoices, maintenance, and ongoing administration.

The public marketplace and property-listing projection are design targets; **no production private rental/tenant records, images, addresses, pricing, or documents are authorized for publication** solely by this brief. The Quixo.Homes SaaS management product and the rental marketplace are related but have separate launch gates.

## Required mockup set before implementation

- Unified desktop **homepage** that clearly presents both the *Find a rental* and *Manage my rentals* pathways.
- **Search/results** screen with long-term rental semantics (property/location/type/monthly price rather than stay dates/guests).
- **Property detail** screen with an obvious viewing/enquiry path; use clearly identified illustrative content unless a listing is approved for publication.
- **Owner/manager product** landing/view illustrating the management workflow, without implying open paid signup.
- **How it works** content for seekers and owners.
- **Mobile responsive variants** for the homepage, listing/search, property detail and viewing enquiry; review navigation, CTAs and readability.

These are **mockups**, not instructions to implement routes, activate APIs, email real prospects or publish property listings. Design-review acceptance needs direct comparison to the latest owner-selected mockup, not just compliance with these words.

## Shared LK/BN design and commercial guardrails

- Use **one shared design system, frontend and authenticated application** at `app.quixo.homes`. Planned localized marketing variants: `quixo.homes/lk/` then `quixo.homes/bn/`. These are proposed routes, not proofs of deployment.
- Sri Lanka: expected LKR/month rental examples and appropriate Sri Lankan terminology; Brunei: BND/month rental examples and appropriate local terminology. All displayed prices in mockups must be **clearly illustrative**, not invented public listings, approved SaaS regional rates, or customer-specific prices.
- **SaaS baseline remains USD $5 per independently rentable dwelling/month, monthly only, no trial**; LK/BN-specific SaaS prices and billing/tax/MoR eligibility are **not approved**. Do not design active checkout or assert service availability.
- Existing R3 B04 conditional **single Azure replica** acceptance stands. **All five general signup/seeker rollout flags remain OFF**; no replica scaling before required distinct-replica test and approval.
- No Redis, extra paid resources, real invoices, Evia signing, production email, customer registration or Stripe changes under this design task.

## Existing draft discrepancy and disposition

The isolated branch `r4/lk-bn-marketing-drafts-20261025` presently contains landlord-first marketing HTML based around a **house symbol** brand and a management-only first impression. Those draft pages are **not approved visual designs** for the new two-audience Quixo.Homes concept; template parity and static checks do not constitute design acceptance. **Hold publication/merge of those marketing pages.** Retain the drafts only as historical/reference implementation experiments; do not call them the approved final website.

## Next canonical design steps (no coding yet)

1. Obtain/review the actual **final owner-selected visual mockup**, if the image itself becomes available, and verify wordmark shapes, layout, page hierarchy, desktop/mobile appearance and seeker/owner balance against it.
2. Produce/review unified public-site **mockups only**, with the agreed two-audience page set.
3. After explicit design sign-off, prepare country-specific LK/BN adaptations from that **one shared design**, including accessibility/mobile/content review.
4. Seek **separate** implementation/merge/publication approval before modifying `marketing/**`, because merges to main can automatically deploy Azure Static Web Apps. Public marketplace launch, R3 signup activation, billing and country paid launch each retain their own release gates.

**Current decision:** DESIGN DIRECTION AGREED; MOCKUP EVIDENCE/REVIEW PENDING; EXISTING COUNTRY MARKETING DRAFTS HOLD/UNPUBLISHED; WEBSITE IMPLEMENTATION NOT AUTHORIZED.
