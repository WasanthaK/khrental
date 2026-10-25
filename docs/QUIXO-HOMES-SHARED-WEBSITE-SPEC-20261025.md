# Quixo.Homes shared website specification — approved design adaptation

**Approved by owner:** 2026-10-25 (conversation follow-up: "agreed and approved").  
**Scope:** Translate the owner-supplied `Quixo_Homes_Complete_Website_Mockups(1).zip` into one common design specification and draft **Sri Lanka (LK)** and **Brunei Darussalam (BN)** adaptations, while preserving the selected appearance. **No authorization to merge or publish the marketing site, turn on signup, launch listings, accept enquiries or payments, change Stripe, or scale Azure.**

## Source of truth

- The owner-supplied ZIP includes four complete mockup boards, a `DESIGN_BRIEF.md`, original Quixo wordmark reference and vector masters. The ZIP is private conversation material and **has not been committed to this public repository**.
- `01_homepage_desktop_mobile.png`: seeker-first photo hero, residential/commercial tabs and monthly rent fields, rental category cards, listing examples, lease steps and owner/tenant journeys.
- `02_search_residential_commercial_detail.png`: search filters/results and residential/commercial detail galleries, monthly rent, lease/deposit/advance/availability, viewing request and enquiry.
- `03_owners_how_it_works_tenancy_portal.png`: owner acquisition, simple 4-step leasing flow, tenant/owner application workflows.
- `04_mobile_rental_journey.png`: mobile search, results, detail and viewing-request reference.
- Tagline: **"a home for life and business."** Logo: **original lowercase `quixo.homes` vector**, blue square above i (`#3B8DCC`), green dot (`#22C55E`); brand navy `#0B2545`, white `#FFFFFF`, light `#F3F6FA`. Preserve original Quixo path geometry. The supplied primary and on-navy SVGs omit the blue square's explicit fill; the corrected **offline preview copy** changes only that attribute. The owner's ZIP remains untouched.

## Information architecture

| Surface | Required layout | Functional dependency before live use |
| --- | --- | --- |
| Country homepage `/lk/`, `/bn/` | Seeker-first search for residences/commercial premises; country switch; listing cards; owners and tenants CTAs | Approved market copy, verified public listing projection, localization, real media rights |
| Residential search | Location, property type, **monthly** rent, bedrooms, bathrooms, furnishing, parking, availability, optional pets | Server-side public-visibility restrictions, pagination and documented filter behavior |
| Commercial search | Subtype, floor area, monthly rent, possible/permitted use, frontage, parking, floor level, fit-out/access | Independently verified zoning/permitted-use claims; owner-authorized public listing projection |
| Property detail | Approved photos/floor plans, monthly rent, availability, minimum lease, deposit, advance, other fees, map and viewing/enquiry CTA | Record-specific owner publication approval and live enquiry abuse/privacy protection |
| For owners | Listing, enquiries, leasing, rental invoicing, maintenance and tenant workflows | R3 public/organization onboarding and paid entitlements require **separate** approvals |
| How it works | Search, view, agree, manage; existing-customer access to `app.quixo.homes` | Actual supported workflow/availability proof; tenant business data stays authenticated |
| Mobile layouts | Navigation, full-width search, cards, visible viewing CTA; no side scroll at 320–390 px | Device testing, keyboard/screen-reader review |

The website is **long-term renting/leasing**, residential and commercial — not hotel/holiday stays, nightly price, check-in dates or guest counts. Public property search is separate from the private app's tenant, agreement, rent invoice, owner PII, documents and audit data. No real listing or viewing request has been published.

## Country model

- **LK first:** `en-LK` draft copy, `LKR / month` rental price presentation; Sri Lankan rental/local legal terminology subject to local review.
- **BN second:** `en-BN` draft copy, `BND / month` rental price presentation; Brunei terminology/privacy/legal review independently required.
- Shared template/style/components, not two independent frontend forks. Country selector never authorizes billing/tax jurisdiction, property ownership or tenant access.
- **No LK/BN SaaS recurring price is approved.** The baseline commercial policy remains USD $5 per independently rentable dwelling/month, monthly only, no trial. Stripe eligibility, MoR, taxes, country launches and price objects are gated separately.

## Prototype outcome — 2026-10-25

A **self-contained offline review ZIP** was generated in the current conversation: `quixo-homes-lk-bn-design-preview.zip`. Contents: one `build.mjs` template, one responsive CSS system, corrected local SVG logo, illustrative image crops from the owner ZIP, a country picker and **five generated pages each for LK and BN** (homepage, search, property detail, owners, how-it-works). No backend route or production repository marketing file was modified by making this local artifact.

Local `node validate.mjs` **PASS** for 10 country pages, local paths, per-market locale/currency, mockup-disclaimer/noindex, disabled live signup/payment and corrected logo. This is static QA only; actual Chromium rendering was **not verified**: `ERR_BLOCKED_BY_ADMINISTRATOR` for local file and localhost navigation in the execution environment. Source mockup imagery is used for **offline concept only**, not approved/licensed production use. The local ZIP is a deliverable, not a deployed/servable website in Azure.

## Release gates and next steps

1. Review offline LK and BN pages against the owner-supplied visual boards on an actual browser/device; correct remaining layout and copy gaps.
2. Validate accessibility, real imagery licensing, accurate feature/availability claims, locale/country content and navigation/SEO before any publishable implementation.
3. Implement production routing and the **approved** public listing projection only under an independently authorized marketplace work package; do not leak private app data or turn on enquiries.
4. **Separately** authorize code integration, production marketing deployment, country page indexing, R3 signup release, Azure scaling or Stripe payments. The current `marketing/lk` and `marketing/bn` branch HTML are historical landlord-only drafts, still held from merge to main. No automatic Azure Static Web Apps publishing was invoked.

**Canonical status:** Design/adaptation scope APPROVED and delivered as an offline review prototype; browser visual acceptance OPEN; public website merge/publication NOT AUTHORIZED; all R3 rollout flags remain OFF and the current one-replica conditional release ceiling remains in force.
