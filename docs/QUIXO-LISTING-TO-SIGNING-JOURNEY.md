# Quixo.Homes: listing to signing

Owner direction, 28 October 2026 (Asia/Colombo). This is the product journey and delivery sequence for the public website, connected to the existing rental administration application. It supplements the program master plan and current pilot status; it does not reopen owner-deferred scaling or invoice-archive work.

## Browse and classify

The three public categories are **houses & apartments**, **shops & retail**, and **offices & workspaces**. A new property registration must select exactly one. Physical property type remains separate because apartment units, houses and land have existing operational meanings. Residential browsing selects the first category; commercial browsing combines the latter two. Existing houses/apartments/condominiums retain residential classification. Existing broad commercial or land records are not guessed into retail or office: the owner must classify them when appropriate. Previously published legacy inventory remains available in the all-properties view until explicitly changed.

Keep the approved hero and the three stock category images. Each category tile opens country-specific available public inventory. An empty commercial market displays an explicit empty message; a failed request displays a retry message; loading never leaves an unexplained blank area. A missing approved photograph gets a labelled placeholder, not an unrelated stock property image.

The country homepage shows current available properties. These cards are not a paid or curated featured-placement product. Curated featuring is a later story below. Selecting a card opens its real public detail page using an opaque listing reference, with approved public copy, category, general location, rent and reviewed photographs. No source property identifiers, exact private address, owner contacts, agreements or financial documents enter this page. Anonymous browsing needs no account.

## End-to-end renter and owner journey

| Stage | Renter action | Owner/operator action | State and acceptance |
| --- | --- | --- | --- |
| Discover | Choose country, residential/commercial, then one of the three categories | Register property with country, category and accurate public copy; prepare/review photos | Only currently eligible, available and non-opted-out stock appears. A featured slot cannot bypass those checks. Browsing and real detail pages are the first delivery slice. |
| Enquire | From a specific detail page, request a viewing; verify email/global identity when submitting | Receive a property-scoped enquiry in the correct workspace inbox | Planned: enquiry has immutable listing reference, submitted time, verified contact, consent and pending/responded/closed status. Dedupe/idempotency, abuse limits and delivery failure feedback are required before enabling submission. No tenant-admin membership is granted to a seeker. |
| View | Select/request a time, receive confirmation, reschedule or cancel | Confirm a slot and manage a viewing calendar | Planned: requested, confirmed, rescheduled, completed, cancelled/no-show states; timezone displayed. A request does not reserve the property or promise availability. Contact/address disclosure is limited to the authorised viewing workflow. |
| Apply | Submit an application for the selected dwelling after viewing, with explicit consent for requested documents | Review the application and accept, reject or request information | Planned: submitted, needs-information, accepted, declined, withdrawn. Private documents remain authenticated and scoped. Decisions are explicit owner actions, not automatic protected-characteristic screening. |
| Offer and reserve | Review the exact rent, deposit, dates, fees and terms; accept the versioned offer | Confirm terms and reserve the exact property/unit transactionally | Planned: recheck vacancy and authorisation at acceptance; prevent double reservation and duplicate actions. Reservation expiry duration and extension policy need an owner decision. A confirmed reservation suppresses that dwelling from public availability; other available units follow the existing unit rules. |
| Agree and sign | Review the generated agreement, verify parties and sign through the supported signing flow | Generate from the approved template/version, countersign and track signing events | Integrate the existing authenticated agreement and Evia/manual-signature capabilities. Draft, sent, partially signed, fully signed, declined/cancelled/expired remain distinct. Verified callbacks or explicit audited manual evidence establish signature state; a browser redirect does not. Preserve the existing archive deferral/waivers. |
| Move in | Complete deposit/payment arrangements and the move-in checklist; receive confirmation | Verify required evidence and explicitly activate the tenancy | Use the existing tenancy-onboarding and activation rules. A signature alone does not mark funds received or activate tenancy. Never invent a payment gateway or merchant arrangement. Active tenancy hides occupied inventory and opens the supported tenant agreement/invoice/maintenance workspace. |
| Exit or retry | Withdraw, decline terms, cancel a viewing or resume an unfinished step | Close the enquiry/application, release an expired reservation through an audited action, or correct terms | Every interruption has a visible outcome and next action. Releasing a hold does not erase signatures, applications, payment records or audit history. Re-listing rechecks current eligibility and owner opt-out. |

Each stage must carry the selected property and, where relevant, dwelling/unit through the journey. Do not ask the renter to re-enter a property name or send them to a generic sign-in page that loses their selected listing. Once identity is needed, retain a safe return destination and resume the same enquiry/application. All writes enforce actor, workspace and record scope on the server.

## Featured-property story

Proposed first version: an authorised owner requests featuring; a platform operator selects an eligible property for a country/category slot and a defined start/end interval. The renter sees a clearly identified featured card and follows the exact same detail-to-enquiry-to-signing journey above. Featuring changes placement only: it grants no availability override, no guaranteed tenancy and no automatic access to private data. Reservation, tenancy, opt-out or photo withdrawal immediately affects every placement. Expired or ineligible selections disappear; an empty slot is omitted.

Before implementing curated placement, decide who may approve it, slot limits, duration and whether it is free or paid. Paid promotion is not approved or implied by this plan. Owner SaaS billing for actively managed dwellings remains a separate product and must not be confused with tenant rent, deposits or featured-placement charges.

## Delivery order and current boundary

1. **Current repair slice:** required three-way classification at property registration; working homepage/category links; loading/empty/error states; real available homepage cards and property details; the missing villa derivative prepared and reviewed through the existing controls. Hero and category imagery stay unchanged. Record actual test/deployment/photo outcomes in current status.
2. **Next implementation slice:** property-scoped enquiry and owner inbox, with verified seeker identity and a resumable return path. Add confirmed viewing scheduling after the enquiry lifecycle is accepted.
3. **Then:** application, versioned offer and reservation with concurrency/idempotency proof; connect existing agreement signing and tenancy activation. Public owner signup remains dependent on the paying-organisation B04-owner/B05 package; reuse the canonical billing sandbox and catalogue.
4. **Later:** curated featuring after the policy choices above; additional search filters and pagination; regional legal/operational acceptance. Scaling remains owner-deferred, and no extra running test replica is part of this work.

Only browsing and the explicitly deployed repair slice may be presented as live. Enquiry, viewing, application, offer/reservation and public signing entry points remain unavailable until each corresponding implementation is accepted. Keep disabled states truthful rather than displaying a working-looking form that loses a request.

## Physical acceptance

- From each country homepage, click all three stock tiles and the residential/commercial hero links. Verify matching inventory, country/currency isolation, useful empty states and selected category indication at desktop/mobile widths.
- Register with no category and with an invalid category through the API: reject. Register each valid category: persist it and show it in the correct public search only when availability and opt-out permit. A rent-only update must preserve a saved category.
- Click a real card and see that same public property in its detail view. A wrong-country, withdrawn, rented or unknown listing must not expose private records or substitute an illustration.
- Verify the villa's reviewed derivative loads on its own card and detail page. Originals and unreviewed photos remain private; withdrawing a photo removes its eligibility everywhere.
- For future enquiry-to-signing slices, test retry, duplicate submission, concurrent reservation, expired verification/hold, signing decline and interrupted payment evidence. An apparent frontend success must never replace authoritative server state.
