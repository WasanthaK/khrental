# One-property public pilot — current canonical status

Updated 2026-10-28 (Asia/Colombo). The [master program plan](EXECUTION-PLAN.md) retains program scope; this redacted companion reconciles the current pilot evidence and supersedes its earlier readiness/OFF checkpoints.

## Current website priorities

| Priority | Capability | Current boundary |
| --- | --- | --- |
| Now | Country/category browsing, actual detail pages and villa photo | Live; preserve the hero and three stock category images. |
| Now | Registration, verification, property enquiry and owner replies | LIVE after explicit approval and release #40682556348. Public seeker registration and email-verified property enquiries are enabled; real-account/mail-delivery acceptance remains a physical user test. |
| Next website work | Viewing coordination; private applications; versioned offers and dwelling holds | New public journey stages remain to be implemented and accepted. |
| Website completion | Connect accepted terms to existing signing, deposit/checklist evidence and explicit tenancy activation | Existing administrative controls are integration points; the public identity/authority bridge is still required. |
| After the website | Owner SaaS subscriptions | Canonical billing sandbox/design retained; no live subscription charging activated. |
| Deferred | Scaling | Single revision, min=max=1; no extra running web test replica. |

## Viewing coordination — implementation and acceptance in progress

The owner confirmed the remaining three website packages: viewing coordination; private applications/versioned offers/reservations; signing and explicit move-in activation. The first is now implemented for review in the existing seeker enquiry and administrator inbox. [Viewing controls and release boundary](QUIXO-PROPERTY-VIEWINGS.md) record reciprocal confirmation, property timezones, cancellation, private instructions, durable retries/versioned audit and the additive governed migration. Source defaults OFF. Production apply, strict 15/15 acceptance and explicit release are not claimed yet. Current public registration/enquiries remain LIVE, and all later stages remain incomplete. No extra running web replica is introduced.

## Public registration and enquiries — LIVE 2026-10-28

The owner gave the required action-time approval to open public personal-seeker registration and email-verified property enquiries. [Public release #40682556348](https://github.com/WasanthaK/khrental/actions/runs/40682556348) PASS against accepted serving build `def79ca8fb12110cb59285f370c6a7890b576f5c`: request validation, fresh strict **14/14** executor schema/ledger/checksum acceptance, matched database target, restricted application DML access, signup origin/limiter/mail configuration and exact-build verification all passed before activation.

The workflow applied explicit public signup mode/approval and the signup, personal-seeker and enquiry API/UI switches. Post-release acceptance PASS: the new Ready revision serves the same accepted build, Single revision/min=max=1 remains intact, anonymous enquiry/owner-inbox requests are denied, missing-origin signup writes are rejected before customer work, public country browsing remains available and eligible property enquiry capability is ON. Automatic closure was not needed. No extra running web test replica was created.

Fresh browser acceptance followed the actual villa detail page → **Enquire about this property** → the selected-property enquiry screen → sign-in → **Create seeker account**. The same public listing pointer and LK market remained attached, the villa photograph loaded, and the name/email/verification-link registration form was available. No production test account, customer enquiry, verification email or password was fabricated by the agent. The owner inbox route correctly requires sign-in; a newly authenticated real-account enquiry/reply and actual mail delivery are not claimed by these read-only checks.

A stale static banner still claimed signup/enquiries unavailable despite the working live link. The copy correction in [PR #447](https://github.com/WasanthaK/khrental/pull/447) merged at `7e134821e559986f3eab4b09f95ff68abdfba2dc`; [marketing deployment #40684236548](https://github.com/WasanthaK/khrental/actions/runs/40684236548) PASS. All application and website PR checks passed at `022d2e8b4f8e6d40c69e6d09e707684f5cdfd4cb`, including [11-page/four-width browser acceptance #40683866456](https://github.com/WasanthaK/khrental/actions/runs/40683866456). Conditional property-level enquiry wording now covers all 11 pages and distinguishes unavailable viewing appointments/applications/reservations/payments from live property messages. Fresh public-domain inspection confirms the corrected banner, villa photograph and enquiry link. This static-only deployment did not redeploy the application or change release flags. Hero/category stock imagery, eligibility/privacy gates and the existing owner-account boundary are preserved.

**Next:** physical renter acceptance using a real personal seeker account; owner replies under **Dashboard → Property enquiries** after normal sign-in. Continue implementing confirmed viewings, private applications, versioned offers and dwelling holds, then the authenticated connection to existing signing and tenancy activation. This milestone does not mean the full listing-to-signing website is complete. SaaS subscriptions remain afterward; scaling remains deferred.

Earlier OFF/pre-activation statements below are retained historical checkpoints; the LIVE checkpoint above controls current status.

## Readiness identity repair — deployed and accepted 2026-10-28

[PR #445](https://github.com/WasanthaK/khrental/pull/445) supplied safe diagnostics and deployed at `921f57070bbc7c8464b19737a9af15fad6ddfc3b` to ready revision 0000409 in [#40678429133](https://github.com/WasanthaK/khrental/actions/runs/40678429133). [Read-only preflight #40678695027](https://github.com/WasanthaK/khrental/actions/runs/40678695027) established the failure: the restricted web identity could see columns, keys and relationships but could not inspect the index-filter/check/default definitions needed by strict schema acceptance. It failed at `phase=schema`; no gate changed. This supersedes earlier uncertainty about the failure's cause.

[PR #446](https://github.com/WasanthaK/khrental/pull/446) merged at `def79ca8fb12110cb59285f370c6a7890b576f5c`. Its application/authorization and enquiry checks PASS at `5fa17a05b8c7ec850b73d8ec3cff2b455e87a026`. [Disposable SQL and browser acceptance #40680201087](https://github.com/WasanthaK/khrental/actions/runs/40680201087) additionally proved that a restricted user denied VIEW DEFINITION can pass the required application access checks, while revoking audit INSERT fails readiness without creating a record. Existing strict drift, concurrency, quota, identity-revocation and registration/enquiry browser proofs also PASS.

The release workflow now validates the request, automatically requires the existing dedicated executor's strict schema/ledger/checksum proof against the same database as the serving application, and then uses zero-row queries to prove the web identity's required columns and DML permissions. It retains the existing web privileges. Rollback bypasses schema/provider readiness so closure is available independently. No production schema or grants changed in this repair.

[Application deployment #40680458189](https://github.com/WasanthaK/khrental/actions/runs/40680458189) PASS: ready revision 0000410 serves the exact `def79ca8fb12110cb59285f370c6a7890b576f5c` build with healthy MSSQL and expected browser configuration. [Combined read-only readiness #40680583378](https://github.com/WasanthaK/khrental/actions/runs/40680583378) PASS: request validation, fresh **14/14** strict executor ledger/schema/checksum evidence against the matched database, exact serving build, Single revision/min=max=1, required application access and signup origin/limiter/mail configuration. The runtime probe reports `ENQUIRY_RELEASE_READINESS=PASS`; no customer record or email was created. Activation and rollback steps were skipped in this read-only mode. Public signup/enquiries remain OFF, and fresh deployed enquiry-page inspection states they are not open yet. No extra web test replica or production customer record was created.

**Historical next action (completed by the public release above):** obtain the required action-time confirmation and run the explicit public registration/enquiry release against accepted build `def79ca8fb12110cb59285f370c6a7890b576f5c`. This opens personal seeker registration and property enquiries to verified visitors; it does not create owner/admin memberships, reserve property, confirm viewings or complete later journey stages. After opening, real people complete registration/credential entry and controlled physical acceptance; do not fabricate production users/messages or claim real email delivery from fixture/preflight evidence. Continue the remaining website stages before SaaS subscriptions.

## Public enquiry release package — deployed, readiness remains closed

[PR #444](https://github.com/WasanthaK/khrental/pull/444) merged at `de58d3b1f564077c23291f4295a5bfb25f588ad9`. [Application deployment #40675325909](https://github.com/WasanthaK/khrental/actions/runs/40675325909), attempt 2, PASS: ready revision 0000408 serves the exact build with healthy MSSQL and expected browser configuration. Attempt 1 reached the ready revision but failed when Azure Resource Manager returned a 503 during final verification; it remains a failed attempt, superseded by the successful retry. [Marketing deployment #40675325842](https://github.com/WasanthaK/khrental/actions/runs/40675325842) PASS.

All PR checks passed at `219fa5c3d03ad93fd572e3d4c24e714ac236fdd7`: application/authorization, default-public privacy, actual disposable SQL/enquiry browser acceptance [#40674889927](https://github.com/WasanthaK/khrental/actions/runs/40674889927), and website browser acceptance [#40674889930](https://github.com/WasanthaK/khrental/actions/runs/40674889930) across 11 pages and four widths, including the selected-listing capability link. An initial truncated fixture failed; the complete corrected source was verified before merge.

The default remains the existing single-mailbox registration pilot. A future general release additionally requires explicit public mode and public approval. Marketing exposes the selected property's enquiry link only when all public signup, seeker and enquiry gates are open. The manual release workflow defaults to read-only preflight and supports verified closure after a failed activation. Hero/category stock images and existing public eligibility/privacy gates are retained; no extra running web replica was created.

**Readiness is not accepted yet; public signup/enquiries remain OFF.** Read-only preflights [#40675618505](https://github.com/WasanthaK/khrental/actions/runs/40675618505), [#40676952484](https://github.com/WasanthaK/khrental/actions/runs/40676952484) and [#40677573639](https://github.com/WasanthaK/khrental/actions/runs/40677573639) failed before any gate mutation. The exact serving build, Single revision and min=max=1 checks pass; failure occurs inside the application-side readiness probe. Its root cause is not established. [PR #445](https://github.com/WasanthaK/khrental/pull/445) adds safe connection/schema/ledger/ingress/mail phase diagnostics without weakening the checks or exposing row/configuration values. Do not claim activation, real email delivery or live customer enquiry acceptance.

**Next:** resolve and accept the readiness check, obtain the required action-time confirmation for opening general public registration, activate and complete real-account acceptance. Continue with viewings, private applications, versioned offers/reservations, signing and explicit tenancy activation. SaaS subscriptions remain afterward.

## Governed enquiry schema and registration continuation — accepted 2026-10-28

The newest checkpoint controls the earlier draft-schema/registration-continuation statements below. [PR #443](https://github.com/WasanthaK/khrental/pull/443) merged at `72f79e478544b9565b5604660a94d484c55a8f15`. [Application deployment #40672655957](https://github.com/WasanthaK/khrental/actions/runs/40672655957) PASS: exact build served by ready revision 0000407, healthy MSSQL connection, Single revision and min=max=1.

[Production apply #40674652759](https://github.com/WasanthaK/khrental/actions/runs/40674652759) PASS through the exact `20261028_01_property_enquiries` target using the dedicated migration executor. The two additive enquiry/audit tables were applied and strictly inspected; earlier migrations were skipped as already applied. [Strict verification #40675157032](https://github.com/WasanthaK/khrental/actions/runs/40675157032) PASS with all **14/14** migrations LEDGERED and SCHEMA_OK, checksum/executor checks accepted and the persistent job definition retained in read-only plan mode. No production enquiry, identity or quota record was fabricated, and no extra running web replica was created.

New seeker registration now preserves the safe selected-listing pointer through verification email, verification in another browser, normal sign-in and enquiry. Exact migration rerun, strict metadata drift rejection, actual store concurrency and isolated browser continuation passed in [#40672219226](https://github.com/WasanthaK/khrental/actions/runs/40672219226). The email proof uses synthetic transport; real production delivery and customer actions are not claimed.

Public signup/enquiries remain OFF. The remaining release work is the exact-build readiness check, required action-time confirmation for opening general public registration, activation and real-account acceptance. Viewing coordination, private application, versioned offer/reservation, signing entry and explicit tenancy activation still follow. SaaS subscription work remains afterward.

## Property enquiries and owner inbox — merged and deployed, 2026-10-28

**Implemented, tested and deployed; public enquiries remain OFF.** [PR #442](https://github.com/WasanthaK/khrental/pull/442) merged at `fa0b39d83b42109c3198df9cdcdc54babeea007e`. [Application deployment #40653396621](https://github.com/WasanthaK/khrental/actions/runs/40653396621) and [website deployment #40653396615](https://github.com/WasanthaK/khrental/actions/runs/40653396615) PASS. The exact merged application build is serving from ready revision 0000406, with runtime/MSSQL health accepted, Single revision mode and min=max=1. No extra cloud test replica was created.

The package carries the selected public listing through normal sign-in, records explicit contact-sharing consent and immutable server-derived listing/workspace/contact snapshots, and provides a private administrator inbox. Owners can save replies or close an enquiry; seekers can revisit their own replies and withdraw. Serialized identity/authority rechecks, durable daily limits, idempotent request references, one-open-enquiry constraints, version conflicts and retained response/status events protect the lifecycle. Account changes and logout invalidate previous enquiry content. No tenant membership is granted and no notification email is claimed or sent.

All PR checks PASS at `a93d6202998d56eb3295d5a6ed5926e643c7c42f`. [Enquiry acceptance #40652986751](https://github.com/WasanthaK/khrental/actions/runs/40652986751) passed the exact migration rerun and actual production store on disposable SQL Server, including concurrent retries, durable quota/audit, workspace isolation, availability/country/opt-out, withdrawal and session/membership revocation. Isolated real-component browser acceptance passed selected-listing login, consent, failed-submit/retry, owner reply, seeker refresh, mobile layout, logout privacy, withdrawal and default OFF. Existing application/authorization, billing SQL, migration, public privacy/native-photo and website checks also passed. Initial fixture failures and cancelled runs remain historical; no production account, property or enquiry was fabricated for proof.

Fresh deployed-page acceptance at `app.quixo.homes/enquire` states that enquiries are not open yet. The deployed enquiry API returns `ENQUIRIES_UNAVAILABLE`. Both new release switches retain their default OFF boundary, and the marketing enquiry entry remains dormant. The exact schema remains a draft outside the governed production migration runner; no production enquiry DDL, signup activation or enquiry write was performed. Replies are in-app; confirmed viewing, application, offer/reservation and signing entry points remain future packages.

[Read-only production migration plan #40653396624](https://github.com/WasanthaK/khrental/actions/runs/40653396624), attempt 2, PASS against the accepted serving release. Attempt 1 correctly refused a differing earlier runtime/workflow snapshot while deployment was underway. The retry did not apply schema or change cloud release gates.

**Next:** promote/register and strictly verify the proven enquiry schema through the governed migration process; complete the selected-listing continuation for new seeker registration and controlled real-account acceptance; then activate the enquiry journey under the existing release controls. The initial implementation supports existing verified tenantless seekers. General signup remains under its separate gate. [Enquiry behaviour and controls](QUIXO-PROPERTY-ENQUIRIES.md) distinguish fixture proof from production acceptance. Viewing coordination follows accepted enquiries; SaaS subscription management stays after the operational rental website.

## Villa photo and registration acceptance — completed 2026-10-28

Manual sign-in established the intended administrator session. Under the owner's existing publication instruction, the already prepared exterior derivative was reopened and visually verified, its rights/privacy review recorded through the authenticated photo controls, and approval completed. No re-preparation, original-photo publication, property data change or release-workflow execution was used.

Fresh public website acceptance confirms the villa's photograph loads on both its residential result card and its actual opaque-reference detail page, with nonzero natural dimensions through the controlled public-listing media route. The earlier withheld-photo/authentication blocker is resolved. Credentials were not inspected or copied.

The deployed **Add Property** form was also inspected while authenticated: **Website category** is required and offers exactly houses & apartments, shops & retail, and offices & workspaces, plus the empty prompt. No synthetic property was created.

**Current next package:** property-scoped enquiry and owner inbox, followed by viewing, private application/offer, safe reservation, signing and explicit tenancy activation. Browsing/details/photos are live; the website still states that enquiries and applications are unavailable until their implementation and acceptance. SaaS subscription management remains afterward. Single-replica boundary is unchanged and no temporary test capacity exists.

The newest checkpoints control current status; earlier withheld/pending or B04-first statements below are historical.

## Owner priority and approved fixes — 2026-10-28

**NOW: fully operational rental website, listing to signing. AFTERWARD: SaaS subscription management.** This explicit owner direction supersedes earlier B04-owner/B05-first prioritisation. [The journey plan](QUIXO-LISTING-TO-SIGNING-JOURNEY.md) records the remaining implementation/acceptance sequence. Subscription design and canonical sandbox decisions are retained but queued; no live billing is activated by this change.

The owner instructed completing the previously reviewed villa photo and verifier fixes. The category-only release-verifier correction is now saved at `cae784ea9e42c9b05baf2fa00d15905099538865`; exact readback confirms only retail/office acceptance changed. Local execution of the saved verifier with synthetic responses accepted six supported current/legacy categories and rejected unknown category/private-field cases. No release workflow was executed, no Azure flags or scope changed, and no test capacity was created. This supersedes the earlier blocked/pending verifier status.

The prepared villa derivative remains withheld pending completion of administrator sign-in, not another publication-permission question. The secure sign-in request returned submitted but both the target tab and a fresh dashboard verification remained at login with no visible error. Authentication outcome is not established; no claim of incorrect credentials, successful login or a proven application defect is made. Credentials were not inspected, copied or read from storage. Manual sign-in in the task's existing browser is the next concrete unblocker; do not work around authentication or claim the photo public before anonymous delivery is verified.

## Three-category browsing and journey repair — deployed 2026-10-28

Owner direction preserves the main hero and all three stock category images. [#441](https://github.com/WasanthaK/khrental/pull/441) merged at `72963f41e9d8292c94cff5766e53fd39493135fd`. [Website deployment #40631464457](https://github.com/WasanthaK/khrental/actions/runs/40631464457) and [application deployment #40631464823](https://github.com/WasanthaK/khrental/actions/runs/40631464823) **PASS**, including ready revision, exact serving build and runtime/SQL health.

- New property registration requires **houses & apartments**, **shops & retail**, or **offices & workspaces** on both client and server. The saved category is preserved by rent-only legacy updates. Physical property type remains independent. Existing residential types retain their known grouping; existing broad commercial/land records are not guessed into retail/office.
- The three unchanged stock tiles now open distinct category searches. Commercial browsing combines shops/retail and offices/workspaces. Residential/commercial homepage navigation was exercised in the actual live site: two residential results rendered, while commercial, retail and office returned explicit empty messages for current inventory. Synthetic browser acceptance also verifies positive retail/office results and actual homepage clicks for all four views.
- Country homepages render current available public properties instead of sample featured layouts. Loading, empty, missing-photo and error states are explicit. Hero and stock image assets are unchanged. Each live card opens its actual opaque-reference public detail page. Actual villa card-to-detail acceptance passed; unavailable enquiry/application actions are stated plainly.
- Application/build, public listing/privacy/SQL/native-image and isolated desktop/mobile browser checks passed at the PR head. Focused local category/country/projection/eligibility tests: 17 PASS. No production property was fabricated for testing. A fresh admin registration UI session required sign-in after rollout, so post-deployment signed-in form acceptance remains unverified; deployed form/server validation and CI passed.
- No scaling, database DDL/backfill, opt-out override, payment activation or public signup activation. Existing public inventory and administrator gates remain as already owner-approved; no new release-control workflow was run.

### Photo and operator actions still pending

The villa's registered photograph was prepared privately with metadata stripping and its derivative visually inspected. It remains **withheld / not public**, pending the owner's confirmation of the exact prepared photo before public release. No rights checkbox was asserted or review approval submitted by the agent. The signed-in session expired during deployment; completing the photo action also requires secure app sign-in.

Automatic approval review rejected the optional enum-only edit to `.github/workflows/public-listing-testing-release.yml` because that existing workflow contains broader production publication controls and the review did not recognise broader-release authorisation. The retry first checked the recorded owner approval, successful existing broad release #40613719898, and exact one-assertion diff; it was rejected again. The file remains **unchanged**; no alternative route or indirect execution was used. Do not rerun that broad release workflow against new retail/office inventory until its category verifier correction is explicitly approved: its old enum would reject valid new categories and invoke shutdown. Current browsing and registration do not require rerunning it. Emergency shutdown remains available separately.

### Listing to signing plan

[Listing-to-signing journey](QUIXO-LISTING-TO-SIGNING-JOURNEY.md) is the controlling product story for country/category discovery → public detail → verified enquiry/owner inbox → viewing → private application → versioned offer/reservation → agreement signing → deposit/checklist and explicit tenancy activation. It includes cancellation/retry paths, identity/workspace isolation, concurrency/idempotency acceptance, featured-placement decisions and delivery order. Only browsing/details are live; later public journey stages remain planned/unavailable. Curated featuring is proposed separately from the current available-property cards, and no paid promotion policy is assumed. Owner SaaS billing remains separate from tenant rent/deposits and existing B04-owner/B05 scope is retained.

## First owner physical-test finding — 2026-10-28

An owner-enabled additional residential property was present in the public catalog but difficult to identify because its optional public headline was blank, producing the generic “Home for rent” title, and it had no reviewed public photograph. Authenticated inspection confirmed saved LK country, opt-out false and eligible preview; matching the opaque public reference confirmed it was already in the catalog. This was a presentation/recognition problem, not another publication gate or failed save.

The intended non-sensitive public headline was saved through the existing administrator control. A fresh real-site residential search then rendered the identifiable card with its existing rent. Source address, private financial fields, original photographs, occupancy and rollout flags were unchanged. The photo remains unpublished pending its own review. Current observed LK catalog has **3 listings: 2 residential and 1 land**, superseding the release-time LK count below.

Priority UX follow-up: replace ambiguous pilot/eligibility wording with an actual website visibility result, an actionable hidden reason when relevant, and a direct way to view the matching public card. Explain the generic headline and missing approved-photo states clearly; do not infer that an optional blank headline means the property failed publication.

## Eligible-inventory physical testing release — LIVE, 2026-10-28

The owner approved activation of all eligible listings and administrator controls. [Release #40613719898](https://github.com/WasanthaK/khrental/actions/runs/40613719898) **PASS** on workflow commit `c62d529e46ca28e469e3de9dde475533d510ae27`, preserving serving application build `d80e8c49b60fdff415f2869a93542934c9560d0d`. This checkpoint supersedes the single-property scope and prepared/pending activation statements below.

- Server-only `PUBLIC_LISTING_PILOT_PUBLIC_ID` removed entirely. Public read/media and authenticated management/preparation/review gates verified ON in the ready revision. No property data, countries, occupancy, opt-outs or photo approvals were bulk-changed.
- Strict public projection, market/currency isolation, matching detail projection, wrong-country denial, invalid-country rejection, CORS/no-store and anonymous denial of private administrator controls PASS. LK catalog count **2**, BN count **0**.
- Actual [Sri Lanka all-category search](https://quixo.homes/lk/search/) rendered two real cards: one land and one residential. The approved residential derivative loaded. The land card has no automatically approved original photo. Residential-filtered navigation intentionally excludes land; use the all-category URL to see both.
- Minimum and maximum replica settings verified as 1 before mutation, maximum rechecked as 1 afterward; Single revision mode required. No scale change or extra test replica was created.
- Controls are enabled at **Properties → open property → Quixo.Homes public listing** for an active tenant administrator. Country and opt-out/public-copy settings can be saved; photo preparation, rights/privacy review and withdrawal are available separately. This browser currently requires app sign-in, so authenticated UI acceptance after activation is left for the owner's hands-on session; enabled flags and anonymous authentication denial were verified.
- Signup, viewing enquiries, payments and additional search filters remain unavailable. The existing maximum of 50 results per market remains. Other properties appear only when existing country, tenant, vacancy and opt-out checks pass.

Initial releases #40612889108 and #40613328721 failed verification and completed shutdown before retry. The second pinpointed market/category/value validation. The verifier had omitted the application's existing `land` category; the corrected verifier accepts canonical residential/commercial/land/other while rejecting private fields, unknown category and wrong currency in synthetic tests. Privacy, occupancy and authorization rules were not weakened. Retain both failed runs as historical evidence.

Physical-test follow-up observed: the API's generic fallback headline currently calls land “Home for rent”; an administrator can set an accurate public headline now, and a category-aware default is a product-copy follow-up. The earlier intermittent SQL timeout root cause remains open, with recovered runtime health recorded below. Public withdrawal/cache and operational handover follow-ups remain open rather than passed.

**Next:** owner hands-on browsing and property-control testing; triage actual findings, then resume B04-owner/B05. Scaling remains owner-deferred.

## Physical testing release preparation — 2026-10-28

The owner requested fixing listing controls and releasing the website for hands-on testing. This is now the immediate priority ahead of B04-owner/B05. The existing one-property pilot remains the last verified production state until the broader release run succeeds.

The prepared release removes the server-only single-property scope and enables authenticated administrator listing preferences, photo preparation, review and withdrawal. It preserves country, current availability, opt-out, derivative privacy and independent photo approval. Both country search pages are prepared to render real eligible inventory with empty/unavailable states; no illustrative search cards substitute for stock. Signup, enquiries and payments remain unavailable. No country values, opt-outs, occupancy or photo approvals are bulk-changed. Existing catalog queries return at most 50 properties per market; pagination beyond that is a follow-up, not a claim that unlimited inventory is supported.

Controls: sign in to app.quixo.homes as an active tenant administrator, open Properties, then a property, and use **Quixo.Homes public listing**. Save the country/public text and **Do not advertise this property on Quixo.Homes** opt-out. Prepare/review photos separately; existing original attachments never become public automatically. Unassigned or unsupported countries require administrator correction before eligibility.

Production activation uses `.github/workflows/public-listing-testing-release.yml`, exact serving build and `RELEASE-ELIGIBLE-LISTINGS`. It checks one-replica limits, readiness, build, strict public field shape, country isolation, CORS/no-store and anonymous denial of private controls. It disables release gates if post-mutation checks fail. The previous one-property workflow remains an emergency shutdown path; its activation mode must not be used over an already-live broader release.

Status: [#440](https://github.com/WasanthaK/khrental/pull/440) merged; application checks and isolated browser acceptance PASS. [Website deployment #40607690862](https://github.com/WasanthaK/khrental/actions/runs/40607690862) PASS. Broader inventory and authenticated controls are prepared, **not yet activated**; final public-exposure confirmation remains pending.

Fresh browser checking initially received a SQL connection timeout and the website correctly displayed an unavailable message. [Read-only audit #40608009755](https://github.com/WasanthaK/khrental/actions/runs/40608009755) then passed exact existing build, ready revision, application and SQL health with min=max=1; the BN catalog subsequently returned its expected empty response under the existing single-property scope. No restart or scale change was used. Timeout root cause is **not established**. SQL management-plane inspection #40608127147 could not read server settings because the deployment identity lacks Microsoft.Sql/servers/read; no broader permissions were granted. Do not characterize this as a permanent timeout fix. Scaling remains deferred; no additional test replica is authorized or created.

## Owner acceptance and next package — 2026-10-27

The owner confirmed the property is visible and instructed moving on. The bounded public browsing pilot is **OWNER-ACCEPTED / LIVE**. Do not repeat its private review, publication, country/media or browsing checks solely for another checklist tick. Public withdrawal/cache and operational handover remain honest follow-ups; they are parked from the immediate critical path under this move-on instruction, not falsely marked passed.

**NOW: paying-organization setup (B04-owner/B05)** — verified owner identity, isolated billing-pending organization, server-owned dwelling quantity and Stripe linkage, then sandbox Checkout, signed/idempotent webhooks and paid entitlements. Reuse the owner-confirmed canonical billing sandbox and existing catalog; no duplicate setup. Keep public signup/live billing and scaling under their existing gates.

## Current result: approved pilot LIVE

The owner explicitly approved public visibility of the reviewed single property, permitted fields and one approved exterior derivative. [Open the live Sri Lanka pilot](https://quixo.homes/lk/search/?type=residential).

[Activation #40545952854](https://github.com/WasanthaK/khrental/actions/runs/40545952854) PASS. Exact configured scope was installed and verified in a ready revision before anonymous listing/media gates opened. The verifier accepted exactly one reviewed listing/photo, exact saved public projection, empty BN inventory, country/unrelated-ID denial, anonymous/CORS/no-store boundaries and safe WebP delivery. Temporary management/preparation/review remained OFF.

[Website #439](https://github.com/WasanthaK/khrental/pull/439) merged at `6ca8166b8d573e55b49e270048d33f4478ea142f`; [marketing deployment #40546437978](https://github.com/WasanthaK/khrental/actions/runs/40546437978) PASS. Actual quixo.homes browser acceptance showed one real residential card, the approved photo loaded, the saved rent rendered and no sample-results links on Sri Lanka search. Commercial selection showed no residential card. Switching to Brunei retained the category and showed its illustrative page with the live-feed flag false and no real pilot card. Returning to residential restored the one live listing.

The site's existing hostname and custom domain are visible. Homepage notices identify the limited Sri Lanka pilot and keep other illustrative examples explicit. Signup, viewing enquiries, payments and additional search filters remain unavailable. LK search is enabled; BN and homepage feed flags remain disabled.

## Deployment and cost boundary

[Read-only production audit #40546580955](https://github.com/WasanthaK/khrental/actions/runs/40546580955) PASS:
- Serving app build `d80e8c49b60fdff415f2869a93542934c9560d0d`, latest/ready revision `khrental-app--0000399`.
- Revision mode Single, minReplicas=1, maxReplicas=1.
- One active revision, one running replica, 100% traffic; app and MSSQL health passed.
- Restart false. No scale change or extra test replica; none required shutdown.

Scaling and distinct-replica acceptance remain owner-deferred and do not block this single-replica pilot. Any future authorized temporary test capacity must be removed afterward and actual inventory/limits verified. Existing production costs remain; zero total hosting/SQL/storage/GitHub cost is not claimed.

## Preparation and retained evidence

- Private export [#438](https://github.com/WasanthaK/khrental/pull/438) deployed successfully in [#40537493730](https://github.com/WasanthaK/khrental/actions/runs/40537493730). It exports only the authorized eligible public projection and exactly one approved photo, omitting source/private fields.
- Protected GitHub Production setting `R4_PILOT_EXPECTED_PUBLIC_JSON` was saved and its metadata verified. Actual property values, identifiers and image references are omitted here.
- Private access #40540078231 and final private shutdown #40541016227 passed before activation. Original photo, property, occupancy, rent and agreements were unchanged.
- Direct Cloudflare bucket privacy audit #40494891305 attempt 3 remains PASS; do not repeat it absent a relevant configuration change. Human ownership/recovery custody remains an unverified operational handover follow-up, not an unresolved bucket privacy fault.
- Current website head `0cdeb7c409505f4a2a12ed8a7894fd58d103e890` passed application, R4/privacy/SQL/native-photo and isolated browser acceptance before merge. Browser fixtures were synthetic and external production requests blocked.

Initial activation #40545316163 stopped on an HTTP 503 before cloud mutation. SQL readiness subsequently returned ready. Workflow-only commit `10c28151b9862775a83a4e817678af1b3f9be12f` adds bounded HTTP-unavailability retries before mutation and a fresh-revision SQL health check before catalog acceptance, preserving exact build/scope/field/privacy assertions. The underlying cause of the transient 503 is not established; the failed run remains historical evidence.

Earlier private setup #40536577750 encountered Azure throttling; intermediate shutdown #40537376249 was cancelled as the private-export app deployment acquired concurrency. Later successful access/shutdown and the live activation/audit above establish current state. Earlier draft-only website assertions and one category-test selector error were corrected before green merge; no production exposure was inferred from failed tests.

## Remaining canonical work

| Priority | Work | Disposition |
| --- | --- | --- |
| Completed | Exact private listing/photo review, protected manifest, single-property activation and real-site browsing | LIVE / accepted for this bounded pilot |
| Parked follow-up | Public per-photo withdrawal/cache/takedown lifecycle and controlled rollback acceptance after actual public delivery | OPEN; prior private withdrawal evidence is retained; no public photo withdrawal/deletion was performed in this publication |
| Follow-up | Human ownership/recovery custody and any external proxy/cache operational handover | OPEN; keep separate from the completed direct-bucket privacy audit |
| 1 — NOW | Verified billing-pending owner organization, Checkout, signed/idempotent webhooks and server-owned quantity/entitlement lifecycle | ACTIVE; canonical billing sandbox selection is owner-confirmed, existing sandbox catalog retained |
| Following | Marketplace/enquiry journey and staged Sri Lanka/Brunei regional paid-launch acceptance | OPEN |
| Parked | Scaling/distinct-replica proof, invoice archive R2, expanded copy and general signup activation | Preserve existing decisions and evidence |

R1 remains owner-closed. R3 remains conditionally accepted for one replica with general signup OFF. Invoice archive R2 remains owner-deferred. Public pilot visibility does not close paid billing or regional launch.

## Emergency stop

Use [One-property public pilot controls](../.github/workflows/one-property-public-pilot.yml), branch main, mode rollback, confirmation ROLLBACK. It disables anonymous and temporary administrator gates without depending on app build health or the private fixture, then verifies denial. Preserve exact scope until public gates are safely off. Revert the #439 marketing package if the public site must also return to the prior design-only state. Record actual outcome; interrupted or unverified rollback requires immediate operator action.

Private historical property details in the master/supporting files were preserved after earlier automatic privacy-review blocks; they were not recopied by this reconciliation.
