# KH Rentals Execution Plan

## UX-04/UX-05/UX-06 entry changes merged — 1 November 2026

PR #475 merged at `129ab69a3cbd0321cd5a93706cce18ac3a759661` from reviewed head `8ddd33cc11aa249ceea56d4b8286c54a48385a64`. Application verification #41268505308 PASS (deploy job skipped on PR), public website browser #41268505293 PASS, enquiry journey #41268505296 PASS. Public responsive artifact 13067888005 and enquiry-browser artifact 13068540920 were generated; manual visual inspection of artifact contents and live post-merge acceptance remain pending. The original stale owner-entry assertion was corrected in the same PR after initial failure.

Delivered: both customer-purpose actions prominent on root/LK/BN entry; direct owner account creation from LK/BN owner marketing; owner-country switch and account/verification/workspace/property guidance; simplified context-specific sign-in and workspace wording. No existing approved imagery, public category routes, credentials, tenant authority, consent, schema, payments or subscriptions changed. **Do not claim production deployment or UX acceptance from the PR checks**. Verify main-push release and actual serving build, inspect desktop/390px screenshots and live task navigation before marking UX-04/05/06 accepted. Canonical #459 and genuine enquiry-to-tenancy acceptance remain open; UX-08 follows.

---

## Customer-purpose correction deployed and live-verified — 31 October 2026

PR #474 deployment #41220067874 SUCCESS: 813/813 tests/build, Ready revision 0000437, exact serving SHA `b814c0efc293c779fcc7d3d2251af0d0fdf73d04`, deterministic startup, live MSSQL and expected runtime. Independent browser build-info matches. Final reviewed-head CI and desktop/390px evidence are recorded below.

**Live bounded acceptance PASS:** the existing demo owner followed Properties → Find a place → personal rental overview → Browse Sri Lanka → selected public property → Express your interest. The actual message form now appears with the correct public photo/property/rent instead of the personal-seeker rejection. Message remained empty, consent unchecked and Send enquiry disabled. List/manage my property → existing-workspace panel → Open my properties restored the same workspace/property. Separately, public owner marketing → Sign in to the app returned directly to existing properties, without a new workspace form or manual reload. No live workspace, enquiry, consent, message, repair, credential, signature or payment was fabricated.

Controlled browser tests separately prove failed-context retry without setup/progress writes and preservation of a newer account. Existing-owner handoff, owner personal overview/enquiry-form access, selected-property context and management return are accepted within this correction. Fresh password sign-in, live unfinished-owner/new-browser recovery, actual enquiry submission and the complete viewing/application/offer/agreement/tenancy lifecycle remain separate OPEN acceptance. UX-03's demonstrated owner-switching blocker is corrected; this does not close full lifecycle acceptance.

**Next:** ordered UX-04/UX-05/UX-06 entry presentation (prominent Find a place and List/manage my property, remove repeated signup choices, consistent wording/progress), then UX-08 filter presentation and the remaining listing/rental lifecycle. Preserve approved imagery and existing security boundaries. #459 stays OPEN; subscriptions remain later. This status supersedes release-pending entries while retaining their history.

---


## Customer-purpose corrections merged; live verification next — 31 October 2026

PR #474 MERGED at `b814c0efc293c779fcc7d3d2251af0d0fdf73d04` from reviewed head `23bb81312b3f5e501dc6aca486eb2c1fdd242ce2`. Final-head checks all PASS: application #41219728220 (813 tests/build), two-tenant billing SQL #41219728231, public visibility/privacy SQL #41219728320, protected billing browser #41219728218 and owner/enquiry/rental-offer journey #41219728187. Artifact 13050035439 contains reviewed desktop/390px owner-context retry and same-owner personal-enquiry form screenshots. The four affected screenshots match the already-inspected pixels exactly.

Delivered source: unavailable workspace context produces a retry state without new setup or draft writes; retry cannot overwrite a concurrently changed account. Existing-workspace navigation stays separate from new-workspace drafts. Explicit Find a place and List/manage my property preserve the selected management workspace. Personal enquiry/viewing/application/offer access uses the live, reciprocal verified global actor and actor-owned SQL scope; business inbox/actions retain target-workspace administrator membership. A consumed email-proof ledger is rechecked during certification and serialized SQL operations, so caller-editable verification metadata alone cannot authorize personal activity. Agreement preparation retains target-membership conflict protection. No new schema, dependencies, global role grants, billing configuration or subscription work.

Deployment #41220067874 is running. Live repeated owner entry, personal selected-property form and management return remain OPEN until the serving build is verified. No real enquiry, consent, workspace or repair is created for live testing. Fresh password login and live unfinished-owner/new-browser recovery remain separate open acceptance. Keep #459 and the full operational website/rental lifecycle OPEN; continue the ordered entry/UI and filter work after this correction is accepted.

---


## Active correction: one account across customer purposes — 31 October 2026

Expected experience: returning owners open their existing properties; workspace lookup failures offer retry and preserve the account instead of starting another business. A verified owner chooses Find a place, browses and enquires personally, then uses List/manage my property to return to their selected management workspace. One account supports both tasks without role changes or duplicate registration.

Prepared correction: explicitly track workspace-context success in AuthProvider and block new-setup rendering/autosave while it is unavailable; recover with the existing refresh authority. Keep legacy tenantless signup/default-entry proof unchanged. Add explicit personal-rental proof for verified reciprocal active identities, and recheck it inside the existing serialized SQL enquiry authority. Require the consumed email-verification ledger record as well as its metadata marker; a caller-editable marker alone is insufficient. Scope personal reads/writes by the session actor, retaining business administrator membership checks and consent. Preserve the existing workspace selection throughout the purpose switch. Existing offer/agreement target-membership conflicts remain closed; unrelated role, subscription and schema changes are outside scope.

Verification package: actual AuthProvider/routes render the failed-context retry, no extra setup/progress write, same-account personal overview/selected-property enquiry form and management return; real SQL covers an owner from another organization making an actor-owned enquiry without business inbox access, forged actor denial, verification removal, membership preservation and existing rental-offer transitions. Inspect desktop/mobile screenshots and repeat the observed live paths after rollout. Source preparation and focused tests are in progress; CI, release and live acceptance remain OPEN. Fresh password-login and live unfinished-owner/new-browser recovery remain separate open evidence. Continue the ordered website goal before subscriptions; #459 stays OPEN.

---


## Live customer-purpose test: owner return and rental search — 31 October 2026

**Owner-authorized live test, using the existing authenticated demo account. No password was re-entered, session cleared, account re-created, workspace submitted, consent checked or enquiry sent.** This proves the session-restoration/navigation cases below, not a fresh password-login handshake or an unfinished new-owner account.

| Case | Observed outcome | Acceptance |
| --- | --- | --- |
| Fresh application document at Properties | Restored the same administrator and existing workspace/property. | PASS — session restoration and property persistence |
| Public owner page → Sign in to the app | Preserved ownerCountry=LK, but the first transition showed workspace creation despite an existing workspace/property. Reloading owner-start restored “Continue in [existing workspace]” and “Open my properties”; that action opened the existing property list. | FAIL / intermittent — existing-owner entry must not depend on reload; root cause not yet established |
| Ordinary /login with the existing valid session | Restored the administrator dashboard with one property in the existing workspace. | PASS — authenticated entry; not a fresh credential test |
| Same account → residential category → selected public property | Inventory, public photograph, rent and selected listing/country survived into Express your interest. | PASS — discovery and selected-property context |
| Same owner account → selected-property enquiry | The app showed “A verified personal seeker account is required.” No message form was available. | FAIL — UX-03 / BJ-06 one-account purpose switching |
| Rental-search Overview → management | Returned the same account to its existing dashboard. The navigation does not provide a complete deliberate personal-search/management switch. | Management preserved; UX-03 still OPEN |

**Source-supported gap:** src/api/auth/seekerContext.js intentionally rejects any current or historical organization membership and tenant association; src/api/enquiries/router.js reuses that tenantless-only proof for personal enquiries. This explains the observed dual-purpose denial. Do not simply remove checks or reuse organization administration authority for personal rental actions. The next bounded correction must provide verified, actor-owned personal rental access for an account that also manages property, retain selected-property intent and the selected management workspace, and preserve consent, participant/owner boundaries and organization isolation.

**Owner-entry investigation:** src/hooks/useAuth.jsx currently falls back to profile-only state when fresh tenant context fails; src/pages/OwnerSetup.jsx interprets absence of a resolved existing workspace as new setup and can autosave its displayed draft. This is an investigation lead, not a proven cause of the live intermittent transition. Test missing/failed/delayed context separately from a confirmed zero-membership result before correcting this entry. Do not create a second workspace to work around it.

**Immediate next scope:** correct these two observed purpose-continuity defects, then retest the same account across both purposes and the existing-owner handoff. Live unfinished-owner ordinary-login/new-browser recovery remains OPEN because this demo account has already completed its workspace and first property; existing isolated browser/SQL coverage remains separate evidence. Continue the ordered UX-04/UX-05/UX-06 entry work, UX-08 filters and the genuine rental lifecycle afterward. Keep #459 OPEN; subscriptions remain later. This update records test evidence only; no serving source, permissions or runtime configuration changed.

---


## Property save and maintenance correction released — 31 October 2026

**Maintenance release and live form verification PASS.** Application #41212951883 SUCCESS with 808/808 tests and build, Ready revision 0000436, deterministic startup, live MSSQL, expected runtime and exact serving code SHA `437209ac6281c977035ded233537f68bb6f575cd`. Independent browser build-info matches. The existing demo workspace administrator's Maintenance tab loads normally; Create New Request now displays the newly saved workspace property, without the renter-tenancy verification error, and Submit is available. Cancel returns to the expected empty list; the normal Create New Request link returns to the working form. Desktop live form wording/layout reviewed; final-head desktop/390px screenshots and real SQL/browser save, controlled failure/retry, reload and isolation proof are recorded below. No real repair request or fabricated maintenance work was submitted to production. Actual customer repairs, image-upload bytes and full maintenance lifecycle acceptance remain distinct from this bounded correction.

Delivered fixes: management property eligibility/create authority, tenant-local and assigned-property scope, renter active-tenancy restrictions, nullable resident/agreement for property-management reports, durable authenticated reporter event, permission-aligned route/button, truthful request-source wording, maintenance image label, and retry after a save error. PR #473 MERGED; its exact reviewed head and all final verification runs are recorded in the preceding release-progress section. The first-property save correction remains live-verified and persisted after reload. These two reported blockers are corrected; broader owner resumption, dual-purpose access, public listing and genuine rental-lifecycle goals remain OPEN under #459. Continue the documented website journey before subscription management. This status supersedes the older 'release underway' entries without deleting their evidence/history.

---


## First property persisted; maintenance release underway — 31 October 2026

**Live first-property save PASS.** PR #472 merged at `e998dfb194baaf390727ed0a82a5c5b5b7b7f4ac`; application #41212257629 SUCCESS, Ready revision 0000435, exact public build fingerprint, deterministic startup and live MSSQL verified. The signed-in demo workspace administrator's already-filled failed form was preserved throughout rollout and retried successfully, using the backend's compatibility normalization for the earlier client. The owner-supplied property appears in its authorized workspace with the entered rent and remains after full reload. No duplicate property or new account was created. This establishes the observed first-property save/readback; interrupted/new-browser owner continuation, full public listing and the complete rental lifecycle retain their separate open acceptance criteria.

Reviewed property head `21d3aea4474d2eb6e1b16f6eaf3cc806382abed0`: application #41211916627 PASS; category/privacy SQL #41211916620 PASS; journey #41211916626 PASS, including actual PropertyForm create/edit for all three categories and legacy JSON. Owner desktop/mobile rendering reviewed. Private property, banking and credential data are excluded from this record. The live property list's missing-photo fallback and disproportionate country-assignment panel remain UI follow-up observations, not a save failure or a claim of complete design acceptance.

**Maintenance correction merged; live release OPEN.** PR #473 merged at `437209ac6281c977035ded233537f68bb6f575cd` from reviewed head `305c81fd8301af03d63020359f3de9942dc63392`. Final checks PASS: application #41212587745, disposable two-tenant SQL #41212587737, protected billing browser #41212587748 and enquiry/owner regressions #41212587779. The actual manager form survives a controlled save failure, permits retry, commits through the governed API and persists after reload. Real-session SQL also proves administrator creation for a vacant property, scoped-manager denial, no forged resident/agreement, lifecycle reporter attribution, and renter/worker/foreign-organization restrictions. Desktop and 390px screenshots reviewed in artifact 13047146324, including maintenance-specific image wording. Deployment #41212951883 is underway; fresh-build/live administrator acceptance is still required. Keep #459 and the operational website goal OPEN; subscriptions remain later.

---


## Active maintenance creation correction — 31 October 2026

Live administrator acceptance reproduced an active-tenancy verification error on Create Maintenance Request. Both the shared form and governed create API were renter-only despite the management entry. Restore the existing maintenance.manage authority: administrators may report property maintenance in their selected organization, property managers only for assigned properties, while renters retain the active-tenancy requirement. An unoccupied property does not require an invented resident or agreement. Keep the reporter in the lifecycle event actor, with nullable resident/agreement fields for management reports; retain transactional notifications and tenant isolation. Use a dedicated scoped eligible-properties read and the existing create authority, never generic SQL writes or client-selected permissions. Hide creation from assigned-only workers and align the route with the same permission.

Regression scope: real-session two-tenant SQL creation/denial/readback, vacant-property administrator report, resident impersonation rejection, actual manager form submission and reload, desktop/mobile visual review. Source and focused tests are prepared; exact-head CI, rollout and live browser acceptance remain OPEN. First-property correction remains the immediate release dependency. No subscriptions or external maintenance messages are introduced.

---


## Active first-property save correction — 31 October 2026

Live acceptance reached the authenticated new-property form. Saving failed with PROPERTY_LISTING_CATEGORY_REQUIRED despite a selected Houses & apartments category. Source traces the mismatch to the shared insert/update formatter recursively lowercasing JSON keys: listingCategory becomes listingcategory before the server validates rentalvalues. This is a reproduced save-path contract defect, not a missing customer category or an onboarding authentication failure.

The bounded correction preserves the canonical rentalvalues document in property insert/update/upsert payloads without changing other tables' formatting. Server normalization accepts only the exact older lowercase key spelling, validates one of the same three approved category values, canonicalizes it and rejects conflicting dual keys. This supports retrying the already-open form without losing its entered details. Existing tenant/membership/property authorization, public-field allowlists and country rules remain authoritative. Remove submission-payload console logging so private property/banking fields are not logged by new clients.

Validation includes category/alias/conflict tests and the actual PropertyForm using the production save client to create all three categories through the fixture API contract. Current live draft remains in the user's browser; do not refresh it or copy private/banking values into repository evidence. Source/CI/deployment and a real save/readback remain separate. Keep owner first-property and #459 acceptance OPEN until the persisted property outcome is observed. No schema, dependency, subscription, payment or unrelated UI work is included.

---

## Owner continuity deployed; live first-property acceptance next — 31 October 2026

PR #471 MERGED at `0cc6c7b46a98967496ed460e48c9ded88e0a103a` (reviewed head `1d9675229b819c314690be0939db89b717c6ef06`). Application release #41205201733 SUCCESS: 807/807 merged tests and build, Ready revision 0000434, exact public fingerprint, deterministic startup, live MSSQL and expected runtime. Independent browser build-info readback matches. Marketing #41205201697 SUCCESS on retry; its first attempt failed starting the downloaded Azure publisher with spawn ETXTBSY. No source/configuration workaround or unrelated deployment change was required.

**Delivered technical progress:** UX-01 durable owner draft/purpose and ordinary-login continuation; UX-02 owner-marketing sign-in context; the owner-entry action supporting UX-03; contextual sign-in/setup wording, saved/unsaved feedback and a simple step indication supporting UX-06. Existing auth metadata stores only bounded name/country/request ID. Verified signup establishes initial owner purpose, the authenticated reciprocal identity owns serialized draft saves, and workspace creation retains it transactionally. Fresh server context plus selected active membership, matching workspace provenance, property-management permission and real property existence determine first-property continuation. Preferences grant no permissions and select no tenant. No schema migration, new library, credential reset or global role/membership-policy change.

**Reviewed-head evidence:** application #41204836802 PASS (807 tests/build); two-tenant SQL #41204836823 PASS, including persisted owner purpose from actual signup redemption with the normal credential verifier; journey #41204836801 PASS (actual client/AuthProvider/Login/routes, ordinary login and a separate browser restoring the same draft, 74 contracts, exact disposable owner SQL identity/provenance/property-existence/rollback plus enquiry/offer browsers); marketing #41204836804 PASS, including purpose/country on every owner-page login link. Billing browser, public-listing/privacy and Evia webhook regressions PASS. Desktop and 390px rendering reviewed in artifacts enquiry-browser-proof 13043557574 and verification-browse-proof 13044302269.

**Live observed:** /lk/owners/ header and existing-account links retain ownerCountry=LK. Following Sign in to the app opens /login?ownerCountry=LK with “Sign in to manage your properties or continue setting up your first property.” The shared browser is currently signed out; no live account, workspace, property, enquiry, signature or payment was fabricated. Prior browser-auth tool timeouts remain a testing limitation; no new insecure credential handling was attempted.

**Remaining exit:** use the existing demo account in that owner-context sign-in, confirm the draft is reported saved, verify ordinary-login/new-browser resumption, and create/manage its actual first property through the approved owner journey. An account whose earlier intent was never stored must enter the owner flow once to establish it; it need not register again. Technical regression is accepted, but UX-01 and full owner first-property acceptance remain OPEN until this live evidence is obtained. UX-02 public handoff is live-verified; existing-manager continuity retains its automated/prior evidence and is included in the remaining live check.

UX-03 complete dual-purpose authenticated enquiry access, UX-04 homepage hierarchy, UX-05 entry simplification, full UX-06 usability acceptance and UX-08 filter presentation retain their documented sequence. Continue independent work within this canonical package when an acceptance dependency blocks a step. #459 and full operational-website/rental-lifecycle acceptance remain OPEN; subscription management remains later. This release record is documentation-only and does not redeploy the serving build.

---

## Owner continuity implementation in review — 31 October 2026

Active scope is UX-01/UX-02 and the owner-continuation foundation of UX-03, under the customer-journey package below and #459. The correction reuses existing auth metadata for a bounded country/name/request-ID draft; it is task/form state only. Signup redemption can persist the selected owner country with the verified new account, and the signed-in owner form serializes autosaves through an identity-bound endpoint. Workspace creation retains the same draft transactionally. No new schema, dependency or service authority is introduced.

Fresh authenticated context returns validated owner progress. With no membership it resumes workspace setup; for the actually selected active owner/admin membership, server-owned workspace provenance and real property existence determine first-property or completed setup. Draft metadata cannot select a workspace, grant membership, change roles or replace verification. Ordinary login restores the unfinished owner task; explicit selected-property context and existing business/admin destinations retain precedence. Owner marketing login links preserve purpose/country. The seeker screen gains an owner-entry action, and setup/login copy makes the next task clearer.

Prepared evidence includes focused parser/identity/continuation tests, disposable SQL persistence/provenance/property-existence and rollback tests, and actual-auth-client browser checks for plain-login resumption and a separate browser restoring the same draft. Source/build and CI evidence remain separate from actual production owner workspace/first-property creation. All UX items remain OPEN pending their required evidence. Full dual-purpose authenticated enquiry access, homepage hierarchy, entry simplification and inactive-filter presentation remain within their sequenced packages; a new link alone does not close them. No subscriptions, pricing or payments work is included.

---

## Active website package: complete the chosen customer journey — 31 October 2026

**Owner direction:** document the live UI/UX review, set a concrete goal and follow it under the repository rules and global canonical goals. This package implements the fundamental customer-purpose stories BJ-01–BJ-08 below. It is part of the existing operational-website objective tracked by #459, not a replacement milestone or a new product track.

**Goal:** a person chooses **Find a place** or **List/manage my property** on Quixo.Homes and reaches the appropriate useful outcome through signup, verification, sign-in and subsequent visits. A first-time owner reaches their first property in their own workspace; an unfinished owner resumes the next incomplete step; an existing authorized manager reaches their properties. A renter browses freely and returns to the selected property's enquiry when authentication is needed. One account supports deliberate movement between the two purposes.

**Global sequence stays controlling:** complete the operational website and genuine rental lifecycle acceptance, review canonical progress, then proceed to subscription management under its existing authority. Preserve approved hero/category images, one global identity, verified access, organization isolation, existing membership permissions, invitations/recovery and the authorized development-testing workspace model. This package introduces no pricing decision, payment collection, new trial, unrelated feature or new dependency/library. Earlier accepted milestones and explicit deferrals retain their status.

### Live UI/UX review and open work

| Item | Observed implementation / evidence | Required correction and story | Priority / state |
| --- | --- | --- | --- |
| UX-01 — Owner continuation | The demo browser reached the authenticated seeker page and restored that session after reload. Source only recovers owner continuation from URL context; the draft is per-tab. | Persist verified-account owner purpose/progress and resume its next incomplete step from ordinary login, including another browser. BJ-02/BJ-03. | Critical — OPEN |
| UX-02 — Owner sign-in links | Live /lk/owners/ header Sign in and Sign in to the app point to generic /login. The later owner-start screen preserves ownerCountry, so entry behavior is inconsistent. | Every owner entry/sign-in handoff carries the chosen purpose/country and returns existing managers to authorized property management. BJ-03/BJ-04. | Critical — OPEN |
| UX-03 — Switching purpose | The previously observed seeker home and current source offer rental-search actions without a clear owner continuation. Management/search API boundaries also require review for one-account dual-purpose use. | Offer clear Find a place and List/manage my property actions; continue the selected task with server-authorized access. BJ-06. | High — OPEN |
| UX-04 — Homepage hierarchy | Live desktop hero prominently presents rental search. Owner access is a smaller navigation link and a later owner section; the top two-purpose banner is informational text. | Present both entry actions prominently, preserving approved imagery and working category navigation. BJ-01/BJ-02/BJ-04. | High — OPEN |
| UX-05 — Repeated account entry | Live owner marketing Create owner account opens owner-start, which again asks the visitor to choose Create owner account. Country is already LK from the selected market. | Give each screen a distinct job; streamline repeated account-entry decisions while retaining an explicit editable property country. BJ-02. | Medium — OPEN |
| UX-06 — Purpose-specific copy and progress | Live owner signup correctly says Start managing your property. Owner-context login still uses combined generic search/management copy; the journey lacks a consistent step indication. | Use owner-context sign-in wording and show account/verification/workspace/first-property progress with one clear next action and the established workspace explanation. BJ-02/BJ-03. | Medium — OPEN |
| UX-07 — Working rental discovery | Live anonymous residential search loads inventory; Water Fall Villa displays its photo/rent. Express your interest retains the selected listing/country and opens an app prompt showing its photo/name/rent with sign-in/signup return links. | Preserve this working entry while correcting owner routing; prove authenticated continuation separately. BJ-01/BJ-05. | Observed entry PASS; end-to-end acceptance OPEN |
| UX-08 — Inactive filter presentation | Live homepage location/rent and search filters are disabled; search retains pilot-era helper copy and prominent inactive controls. | Align the presentation with working search. Review filter implementation as the next bounded website task after purpose continuity; do not let it interrupt the active owner package. | Medium — OPEN / sequenced next |

Review scope: live desktop public homepage, owner marketing, owner-start, owner signup, owner-context login, residential inventory, property detail and selected-property auth prompt; earlier live authenticated seeker observation; current route/onboarding source. A current authenticated owner first-property flow, fresh mobile acceptance and genuine agreement-to-tenancy completion have not been established. Existing-account session availability and secure browser-auth timeouts are tool/testing limitations, not proof of an application credential rejection. Additional demo accounts are permitted by the owner when useful, but must serve a concrete acceptance case and follow the existing account lifecycle; do not create duplicates merely to bypass a failed test.

### Ordered execution within this package

1. **Resolve continuation authority first (UX-01/UX-02/UX-03).** Trace existing signup verification, account state, owner workspace creation, selected-membership resolution and property setup. Specify the smallest durable account-bound continuation change using existing authorities. A URL/preference can select a task; it cannot authorize membership or management access. Reconcile legitimate rental-search access for an account that also manages property before claiming dual-purpose completion.
2. **Implement one coherent owner journey.** Correct every owner handoff and ordinary-login resumption together. Preserve existing manager/staff/resident/platform-admin destinations, valid different sessions, account isolation and the selected-property renter journey. Account creation, verification, workspace creation and first-property setup remain distinct, accurately represented transitions. Use the governed migration process only if durable state needs a schema change.
3. **Align the entry UI (UX-04/UX-05/UX-06).** Add clear primary choices, remove redundant account-entry decisions and use context-specific wording/progress. Keep the chosen market editable and retain the established workspace explanation. One account can change its task deliberately.
4. **Validate and release through the existing process.** Run meaningful regression and required repository checks, review the exact diff, inspect rendered desktop/mobile interactions and screenshots, then use the normal reviewed merge/deploy workflows already authorized for product testing. Preserve runtime controls and existing authorities. Record exact build/release and live results in this plan.
5. **Continue the global website objective.** After the chosen-purpose journey passes, address UX-08 in its bounded website scope and continue outstanding first-property/public-listing and enquiry → viewing → application → offer/agreement → tenancy acceptance. Update canonical status before entering the later subscription phase.

### Completion criteria and execution discipline

- First-time and returning unfinished owners complete the correct account → verification → workspace → first-property flow, including ordinary login after browser closure and verification in another browser.
- Existing managers reach their authorized properties without a second workspace; ambiguous workspace context is resolved explicitly.
- A deliberate purpose switch works with the same account and appropriate permissions; renter selected-property context survives required authentication.
- Staff, invited residents, platform administrators, different-account preservation, retry/error, expired-link, replay, reload and tenant-isolation cases retain correct behavior.
- Actual headings/actions/progress, keyboard use and mobile/desktop layout are reviewed. Automated fixtures, deployed readiness and real participant outcomes are recorded separately.
- Keep each UX item OPEN until its functional and usability evidence supports closure. A navigation link, accepted email, successful login or mocked destination is not a first-property or complete rental-lifecycle result.
- Follow PROJECT_RULES.md, AUTHENTICATION-LIFECYCLE.md and this execution plan before each affected change. Check existing files/imports/services; reuse current libraries and authorities; make minimal corrections to these specific gaps. Document a dependency and advance independent work inside this package when blocked. Avoid parallel side projects and repeated speculative login fixes.
- Keep #459 OPEN until the operational-website and genuine rental-lifecycle exit criteria pass. This record sets the execution goal and order; the listed corrections remain unimplemented/open.

---

## Fundamental business journey: preserve the customer's purpose — 31 October 2026

**Controlling owner decision.** A visitor arrives at Quixo.Homes with a purpose: find a place to rent, or list/manage their property. The website presents those two clear entry choices and carries the selected purpose through registration, email verification, sign-in and subsequent visits. This is a fundamental business requirement, not an optional navigation improvement. It takes precedence over earlier defaults that treat every public account as a rental seeker. The original choice should remain meaningful after the first page.

### Expected customer experience and user stories

| Story | Customer intention | Required experience |
| --- | --- | --- |
| BJ-01 — Find a place | As a prospective renter, I want to explore places before committing to an account. | Find a place → browse/search freely → choose a property → Express your interest → register/sign in when needed → return to that property's enquiry with its country and listing context retained. Continue through replies, viewing, application, offer/agreement and tenancy. |
| BJ-02 — First-time owner | As a first-time owner/manager, I want to register so I can add and manage my property. | List/manage my property → sign up → verify email and establish credentials → set up my property workspace → add my first property/dwelling, category, country, details and photos → enter property management and the applicable listing journey. The purpose remains owner onboarding throughout. |
| BJ-03 — Returning owner with unfinished setup | As an owner who left before finishing, I want to continue from my next incomplete step. | Ordinary sign-in, including after logout, browser closure or opening the verification email in another browser → recover the verified account's owner onboarding progress → Continue setting up your property → next incomplete step. Completed verification/setup steps remain completed. |
| BJ-04 — Existing property manager | As an owner or authorized manager with an existing workspace, I want to manage my properties immediately. | List/manage my property → sign in → existing authorized workspace/property management. Retain an authorized current selection; offer a clear workspace choice when the context is ambiguous. An additional workspace is an explicit separate-business action. |
| BJ-05 — Returning rental seeker | As someone searching for a rental, I want to resume my selected property or ongoing conversation. | Find a place → sign in when needed → selected enquiry or rental-search activity. A selected property takes the customer back to that property's task. |
| BJ-06 — One person, both purposes | As someone who both rents and owns/manages property, I want to use one account for both activities. | Clear actions to Find a place and List/manage my property allow deliberate switching. Existing conversations and management access stay with the same identity. Changing purpose changes the task presented; organization permissions remain derived from actual membership. |
| BJ-07 — Invited participant | As invited staff or a resident, I want to reach the work or tenancy I was invited to access. | Invitation → establish/verify account access through the existing invitation authority → the authorized organization/tenancy and role-appropriate next task. An existing global account is reused safely. |
| BJ-08 — Platform administrator | As a platform administrator, I want to reach platform administration and deliberately enter an organization when needed. | Ordinary administrative sign-in retains the authorized administrative destination. A separately selected public task has clear continuation without erasing platform or organization authority. |

### Business rules

1. **Purpose is selected at entry.** Use clear customer actions such as Find a place and List/manage my property. Continue the choice already made; a repeat purpose question is unnecessary when that choice is known.
2. **Owner purpose and progress are durable.** Associate resumable onboarding with the verified global account so ordinary login and another browser can recover it. URL parameters and per-tab drafts may carry immediate context but are insufficient as the sole record. Pending anonymous context must be associated with an identity only through successful verified account establishment; one browser account must never inherit another's progress.
3. **Explicit task and saved progress guide continuation.** Honor a valid selected property/task or deliberate purpose switch. For ordinary login without a new task, resume the account's unfinished owner setup when applicable, otherwise its appropriate established management, rental-search, tenancy or administrative destination. Resolve ambiguous workspace context explicitly.
4. **One global account supports both purposes.** Purpose is not a permission grant or a permanent renter/owner restriction. Backend identity, verified-email and membership checks independently control access. The internal initial seeker classification must not determine an owner's customer-facing completion state.
5. **Setup happens once for the intended workspace.** Explain: “A workspace is your account for managing properties. It keeps your properties, team, agreements and invoices together. One workspace can manage many properties.” An individual can use their own name; a company is not required merely to understand the form. Existing managers continue in an existing authorized workspace.
6. **A person can understand their next action.** Owner entry, email confirmation and post-login screens consistently describe property setup/management. Rental-search screens expose a clear route to list/manage property. Verification acceptance, successful login and completion of owner onboarding are separate outcomes.
7. **Current testing and commercial sequence remain intact.** Existing development-testing owner workspaces support the implemented property journey while subscription management is deferred under the earlier owner instruction. This decision changes neither approved pricing nor commercial activation requirements, collects no payment and does not imply paid-launch acceptance.

### Current implementation gap and acceptance status

Live browser observation now confirms an authenticated rental-search page and session restoration after reload, following the owner's sign-in. It does not establish completion of owner onboarding or independently recover the original signup selection. The owner's business concern is valid: reaching the seeker page alone is not completion of an owner journey.

Source review finds that public signup creates an initial seeker identity, owner continuation is carried through the ownerCountry URL context, and the current owner form draft is per-account tab storage. Ordinary /login without that context cannot recover owner purpose from durable onboarding state. The seeker landing offers rental-search actions but no clear owner continuation. Existing membership-based manager routing and URL-based owner continuation are useful foundations; durable resumption and a usable dual-purpose journey remain gaps. The current tenantless-seeker API restrictions also require review before claiming that one person can complete both journeys; a navigation link alone does not establish that capability.

**Next implementation package:** close BJ-02/BJ-03/BJ-04/BJ-06 together through a bounded gap review, durable owner continuation, clear purpose-switch entry and regression of existing membership-based destinations. Use the existing identity/onboarding authorities. Keep the original property, country and unfinished task intact. This documentation records the expected behavior; it does not claim the correction is implemented.

### Required acceptance evidence

- New owner follows List/manage my property through signup and email verification to workspace setup and actual first-property management.
- Owner exits at each incomplete step, logs out/closes the browser, then uses ordinary login and resumes the correct next step without repeating completed setup.
- Email verification opened in another browser preserves owner continuation; valid different signed-in accounts are preserved and receive clear guidance.
- Existing authorized managers reach their properties; multiple-workspace selection, explicit additional-workspace setup, staff, resident and platform-administrator destinations remain correct.
- Rental seekers browse anonymously, retain the selected property through authentication and resume their enquiry.
- One account can deliberately move between rental search and authorized property management without losing either activity or creating a duplicate identity.
- Retry/error, expired link, reload, mobile and desktop behavior remain usable; backend authorization and organization isolation hold independently of navigation.
- Tests, rendered UI review and actual live customer-journey evidence are recorded separately. Authentication success or a mocked destination alone does not close owner or full rental-lifecycle acceptance.

Canonical issue #459 remains OPEN. Full operational-website acceptance and the later subscription-management phase retain their existing order. This is a documentation-only business decision; no runtime, schema, account, workspace, membership or payment change is made here.

---

## Login error preservation deployed — 31 October 2026

PR #470 MERGED at `fd0947ba67104902e6deba31de20885b5b824eb5`, reviewed head `c82da114fce2bebc29557a216e76ba1f1a9bfd34`. Application release #41183287046 SUCCESS: 803/803 merged tests and build; Ready revision 0000433, deterministic startup, exact public build fingerprint, live MSSQL and expected browser runtime configuration. Independent cloud-browser build-info readback confirms the merge SHA.

Credential submission now uses Login's local pending state, so a rejected request no longer unmounts the form and silently erases its error. Global loading remains with auth startup/session-event profile resolution. Production auth client/storage/listeners/MSSQL-adapter browser regression PASS: delayed 401 and 503 messages, retained email, enabled retry, no session on failure, successful retry and fresh-document session restoration, plus owner/staff/renter/new-owner/seeker routing. Application CI #41183006160 and complete journey CI #41183006149 PASS; desktop and 390px screenshots visually reviewed, artifact 13035752996. Local 19/19 focused and build PASS; full local suite's sole unavailable-Chrome failure passes in CI.

This is a proven silent-error repair, not proof of the intended real account's underlying rejection or successful login. User supplied verification-email receipt and reports completed verification, but its real credential submission/session outcome remains unverified; previous secure sign-in timed out and available cloud logs did not capture the user's failure. No account/password/verification/membership changes, recreation or resend performed. Keep intended-account login and #459 acceptance OPEN; subscriptions deferred. Next is a refreshed real sign-in and its now-visible error/result. Do not assume the account needs to be recreated or its password reset.

---

## Active login-return investigation — 31 October 2026

The owner reports a newly self-registered, email-verified account returning silently to `/login` after submitting credentials. Mailbox receipt is evidenced; successful credential redemption, normal login and session persistence for the intended account are not yet independently established. Do not recreate the account, reset credentials, resend an invitation or treat prior administrator-session acceptance as proof for this identity.

Source establishes an error-presentation defect: `AuthProvider.login` sets global loading before sending credentials; `PublicRoute` replaces/unmounts `Login` while loading. On any rejected request, Login's local error is written to the discarded component and the replacement form appears blank. Keep pending credential submission in Login's existing local state; global auth loading remains owned by startup/session-event profile resolution. This preserves errors and retry without weakening credential verification, server certification, membership or tenant checks. It explains a silent failed request, not the specific account's underlying rejection.

Strengthen the existing rendered regression to use the production auth client, session storage, listeners and MSSQL profile adapter instead of substituting auth/session behavior. Check delayed HTTP 401 and 503, visible errors, retained email, enabled retry, no failed-request session, successful retry, fresh-document session restoration, existing owner/staff/renter and new owner/seeker routing, plus desktop/mobile presentation. CI, release and actual intended-account login remain pending; overall #459 acceptance stays OPEN and subscriptions stay deferred.

---

## Returning-owner entry and workspace explanation deployed — 31 October 2026

The owner clarifies that workspace is the SaaS tenant and accepts that name when explained. A workspace groups properties, team access, agreements and invoices; one workspace manages many properties. Returning managers use their current workspace. Another workspace remains an explicit optional action for a separately managed business.

PR #469 is MERGED at `faa439673acbd84f1b6b4f8a234653e71ff05584` (reviewed head `5943004218985a9380666999125eedc4c308db63`). Application release #41172347770 SUCCESS: 803/803 merged tests + build, Ready revision 0000432, exact serving build, deterministic startup, live MSSQL and expected browser runtime. Browser independently confirmed the merge SHA from build-info.json.

Corrected: returning owner entry shows the selected existing workspace and its property links rather than forcing new-workspace creation; owner-context sign-in/signup continues to existing properties. New-owner setup explains workspace meaning. Normal business/tenant login uses the freshly resolved profile/membership and skips seeker-only certification; business accounts reaching the seeker landing return to their normal portal. The owner brand link returns to public browsing. No backend permission, credential, membership, billing or tenant-selection behavior changed. Normal credential sign-in has no email allowlist; this release corrects account-context navigation, not an invented mailbox whitelist.

Reviewed-head CI PASS: application #41172038880 (803/803 + build), journey #41172038926 (actual AuthProvider/Login/PublicRoute/ProtectedRoute/OwnerSetup; distinct synthetic email accounts and owner/staff/tenant/new-owner/seeker cases; no business seeker probe; current-workspace reuse; explicit optional additional workspace; previous auth/verification/enquiry/offer and SQL regressions), billing SQL #41172038882 and protected billing browser #41172038847. Desktop/390px returning-owner and new-owner explanation captures visually reviewed; artifact enquiry-browser-proof 13032075040.

Live authenticated navigation PASS on serving revision 0000432: owner-start displayed Continue in KH Rentals, the workspace explanation, Open my properties, Add a property and optional separate-business setup. Open my properties showed the existing ten properties under the current Administrator identity. A fresh owner-context login URL reused the existing valid session and returned to those same properties. The seeker entry recovered to the normal administrator dashboard instead of access denial. Existing membership/selected organization and session were preserved; no new workspace, property, email, credential, message, signature or payment was submitted. The working property page is left available.

This is current-session navigation acceptance. A fresh production password login was not performed because the valid session was preserved; synthetic fresh-login tests are not real credential acceptance. New-owner workspace/actual property creation, any remaining reported fresh-login failure and genuine rental lifecycle acceptance remain OPEN. Existing management access must not be gated on completing a second workspace or the earlier new-workspace email test. #459 and overall operational-website acceptance remain OPEN; subscriptions remain deferred. This release-record documentation update does not redeploy the serving application.

---

## Existing-account owner verification deployed — 31 October 2026

Live review reproduced a signed-in existing Administrator blocked by `OWNER_VERIFICATION_REQUIRED`. The workspace action sent no email and offered no send/resend continuation, while new-account signup intentionally skipped existing identities. The owner authorized the repair.

PR #468 is MERGED at `8e02a423fab144bdae076bbf8118024230609ba6` (reviewed head `18c91a5118d697f8315565886b01bfa9787955b6`). Application release #41170037818 SUCCESS: 802/802 merged tests + build, Ready revision 0000431, exact public build fingerprint, deterministic startup, live MSSQL and expected browser runtime. The browser independently returned the exact merge SHA from build-info.json.

The existing-account owner form now provides send/resend using the existing SendGrid adapter and shared SQL quotas. Proof is purpose-separated and bound to persisted app/auth identity, email and current credential in the existing hash-only ledger. Isolated explicit confirmation consumes proof and updates verification metadata atomically without changing passwords, roles, memberships or browser sessions. Owner drafts retain name/country/request ID per account and tab. No new library or production schema migration.

Reviewed-head CI PASS: application #41169747629 (802/802 + build), default-public privacy #41169747625 and journey #41169747646 (71 contracts, actual-provider auth, isolated verification, exact-ledger disposable SQL and complete enquiry/offer browser regressions). Existing-account SQL proves reciprocal identity, cooldown/resend revocation, concurrent single use, current-credential/expired/unsent denial, rollback, unchanged password/global role/memberships and actual owner-store continuation. Actual-page browser proves send/retry, draft/country/request ID across reload, fragment scrubbing, explicit confirmation with no password/session switch and first-property routing. The last destination remains a fixture, not actual production property creation. Current-head desktop/390px send and verified-success screenshots visually reviewed; artifact enquiry-browser-proof 13030357706.

Live post-release: the existing signed-in session resumed; the entered owner draft was restored without sign-out or browser-data clearing. Continue to first property correctly exposed the new verification action. One verification email was requested; the live form returned the provider-accepted success message, changed the action to Resend verification email and retained the draft. This proves the request path and accepted-send finalization, not mailbox receipt or completed verification. Live desktop wording/layout inspected; form left open for continuation.

Remaining acceptance: owner mailbox receipt and explicit link confirmation, actual owner workspace/first-property creation, reported new-account login return and genuine rental lifecycle acceptance. No workspace, property, auth verification metadata, enquiry, signature or payment outcome was fabricated. #459 and full operational-website acceptance remain OPEN; subscriptions stay deferred. This release-record documentation update does not redeploy the serving application.

---

## Owner-authorized product testing — 31 October 2026

The owner confirms there are no public clients and explicitly directs: open the implemented product and test it; do not wait for completion of the entire product before enabling customer journeys. This supersedes earlier planning-only approval fences where they prevented internal development testing.

- Enable implemented listing, signup, enquiry, viewing, application and offer flows through existing release workflows. Preserve authentication, verified identity, organization isolation, public-field/privacy boundaries and rollback controls; these are correctness requirements, not reasons to postpone testing.
- Implement and expose owner self-registration as a usable journey rather than a closed marketing message: verified global identity → the owner's separately owned workspace → first property. Reuse the canonical credential service and one identity per email. No client-supplied global role or access to another workspace.
- During this pre-customer testing phase, a newly self-provisioned owner workspace may have an explicitly recorded development-testing plan and active owner membership so property and lifecycle screens can be exercised without waiting for Stripe implementation. This is not a paid subscription, a customer free trial, a billing acceptance claim or permission to collect money. Paid commercial launch retains the later Stripe/pricing acceptance requirements.
- Replace obsolete LIMITED PUBLIC PILOT and closed-owner messaging only with functioning, tested entry points. Preserve approved hero and category images. Do not pretend unfinished functionality is enabled by changing copy alone.
- Authorized work includes the needed source changes, CI, normal reviewed merge/deployment and existing feature release controls for these test flows; do not repeatedly seek the same test-opening approval. Report actual blockers and distinguish development regression evidence, live testing and completed real participant acceptance.
- The reported sign-out/new-account login return remains a defect to reproduce and correct. Preserve the last signed-in account/tab; do not clear live browser storage or sign out to manufacture a test state. Use isolated synthetic tests for destructive/session-race scenarios. No fabricated signatures, deposits or payment evidence.

---


### Owner testing release evidence — 31 October 2026

PR #467 is merged at `d51a69db934c1b22e864e0989f4b6096bf243b1a` (reviewed head `6cb1c9712fc19b1bb59c4eafe2a371cd6077d8a4`). Application release #41150326835 PASS: 795/795 merged tests + build; Ready revision 0000430, exact serving fingerprint, deterministic startup, live MSSQL and expected browser runtime. Marketing #41150326731 PASS. The owner path is exposed for development testing without waiting for Stripe/commercial launch.

Implemented: verified global account → owner/country continuation across email and sign-in → own development-testing workspace/admin membership → first-property form with country preselected. No payment is collected. SQL creation is transactional/idempotent and requires reciprocal identity plus a completed verification/invitation record for this credential. Editable metadata alone cannot authorize it; global roles and existing default membership preferences are unchanged. Pending responses preserve a newly changed signed-in account.

Reviewed-head CI PASS: application #41149932240 (795/795/build), journey #41149932229 (71 contracts, actual auth/verification, disposable SQL, owner and existing enquiry/offer browser journeys), billing SQL #41149932288, billing browser #41149932319, listing #41149932350, marketing #41149932220 (11 pages × 4 viewports), webhook #41149932308. Exact-head desktop/390px owner setup and marketing screenshots reviewed. The owner fixture uses a stand-in for the final first-property destination; it does not establish actual production property creation by a new owner.

Live post-release read-only review: owner marketing no longer has the LIMITED PUBLIC PILOT banner or closed-registration message; Create owner account navigates to owner-start with LK retained, then to the enabled owner signup form. No account request was submitted. Public rental inventory initially showed temporary unavailability during rollout, then loaded after Ready/reload; WATER FALL VILLA photo/rent/detail and Express your interest observed. No cause beyond the timing is inferred. Browser pages left available; no live sign-out, browser-data clearing, customer account/workspace, enquiry, signature or payment write performed.

Remaining acceptance: reproduce the reported real sign-in return and perform a real verified owner signup/workspace/first-property test plus genuine rental lifecycle acceptance. These remain tests to execute while the product is open, not reasons to close it until the full product is complete. Advanced search filters remain unimplemented placeholders (including residual helper copy referencing a pilot); do not represent those as a subscription/entitlement gate. No overall operational-website or paid-launch completion claim.

---

## Controlling customer journeys, commercial decisions and implementation order — 30 October 2026

**Authority:** owner's clarified decisions in the Quixo.Homes project conversation, confirmed with “yes update the canonical plan and then we can start”. This section controls over conflicting earlier checkpoints below, including register-before-browsing, a separate listing fee, permanently hardcoded USD 5 pricing or tenant-admin pricing controls. Earlier sections remain historical evidence, not current completion claims.

### Product promise and entry journeys

The public website must immediately serve two intentions: **Find a property** and **List my property**. Preserve the approved marketing hero and three category stock images; residential/commercial/category searches must open eligible available public inventory.

| Customer | Required journey |
| --- | --- |
| Prospective renter | Browse/search freely → choose a property → **Express your interest** → register or sign in if needed → return directly to that property's enquiry → owner reply → viewing → application → offer/agreement → tenancy |
| Owner/manager | Sign up and verify → establish their own organization through verified server authority → add the first property/dwelling → enter the governed management-subscription flow → manage the rental lifecycle; eligible available property is publicly listed automatically unless opted out |
| Returning customer | Sign in → resume the selected property or actual next task; no generic dead-end account screen |

Property details needed for discovery remain browsable. Registration is requested at **Express your interest**, not before search. Carry only the validated public listing reference/market across registration and verification; do not lose the customer’s chosen property. Complete setup with the server-issued session where safe, preserving a valid different signed-in identity explicitly; do not force redundant password entry or silently switch accounts. Server verification, one global identity per email, organization isolation, explicit enquiry-sharing consent and separate existing-renter tenancy authority remain mandatory.

Customer screens must present useful next actions and ordinary language. Do not expose internal organization membership, tenant context, access-boundary or subscription architecture as the renter’s onboarding instructions. These are product usability requirements, not authorization bypasses.

### Agreed commercial model and Global Admin authority

- Management fee pays for **property and rental-lifecycle management**, not for placing a listing.
- Standard public listing is an **included value-add**, automatic for eligible available inventory unless the owner opts out. No separate listing fee.
- Premium/featured paid listing products are **out of initial scope**.
- USD 5 per independently rentable dwelling/month is the **starting base-fee baseline**, not a permanent code constant.
- The base fee includes management up to a **market-specific monthly-rent threshold**; market research informs that threshold.
- **Global Admin only**, through platform-wide setup, can configure each market’s base fee/billing currency and included rent threshold/local currency. Tenant/organization admins, property owners, staff and renters cannot change market pricing; they may see the applicable customer price.
- Include validated values, a price preview, effective date/version and an audit of actor/before/after/reason. Existing subscriptions and historical invoices must not silently change when an admin edits a rule.
- Above-threshold pricing policy/rate, FX/rounding and final market thresholds remain **undecided**. Rs 25,000, USD 100 and BND 1,200 are discussion examples, not approved defaults or market-research findings. Do not invent or activate a surcharge.
- Global Admin controls commercial pricing policy; Stripe remains the payment/subscription/invoice authority. Implementation must synchronize published pricing versions with Stripe rather than create a separate collection/invoice system. Merchant/tax readiness and the existing no-trial decision remain intact.
- Detailed controlling billing requirements: [canonical SaaS billing contract](QUIXO-HOMES-STRIPE-SAAS-BILLING.md#controlling-owner-decision--configurable-market-pricing-30-october-2026).

### Current evidence and limits

| Item | Current accepted evidence / remaining work |
| --- | --- |
| Isolated verification entry | #460 merged/deployed; actual-entry/StrictMode fragment preservation correction proved. This is not proof of successful registration for the intended account. |
| Signup diagnostics | #461 deployed at application build e36474a1515f010233af43e5528a3a894bc7ff08, Ready revision 0000424. Release #40972954960 and read-only #40974303591 passed exact-build/SQL health. Returned diagnostic log window had no signup-unavailable event; original redemption 503 cause remains unverified. |
| Reported sign-in return | Owner reported a repeat sign-in screen after submitting credentials, then supplied seeker-area screenshots. Those show page access, not independent proof of the intended identity or resolution of the reported loop. Keep live acceptance open. |
| Renter entry and customer UX | #462 owner-approved and merged at `6cc9ed24365504daa82a215eadbf157896d15a56`. App release #41005810829 PASS, Ready revision 0000425 with exact public build, deterministic startup and SQL ready; marketing #41005810839 PASS. Fresh live browser proved anonymous Water Fall Villa discovery/image, **Express your interest**, and selected-property retention into the new sign-in/free-registration route. 787 tests and complete PR public/SQL/browser regressions passed. Intended-account sign-in/verification and actual agreement-to-tenancy acceptance remain OPEN; live credential entry is the next dependency. |
| Owner signup | Current generic /register is not verified owner/organization onboarding and returns to generic sign-in. Do not relabel the legacy renter-registration flow as owner signup. |
| Global Admin pricing / subscriptions | Requirements recorded; editable market controls, approved excess pricing, safe Stripe synchronization and customer billing acceptance remain unimplemented/open. |
| Overall operational website | #459 remains OPEN. Genuine participant agreement-to-tenancy and final customer acceptance have not passed; no subscription/planning decision closes them. |

### Ordered implementation and acceptance

1. **Renter entry and interest continuation — FIRST ACTIVE PACKAGE.** Align the public property action to Express your interest; preserve the selected property through signup/sign-in/verification; establish safe, explicit session continuation; reproduce/correct the reported login return using evidence. Integrate useful #462 customer navigation/empty states in this journey. Prove new and returning customers, reload/new-browser email opening, expired/replayed links, an already-signed-in different account, logout/re-login and mobile. No registration wall before browsing.
2. **Owner onboarding foundation.** Replace legacy generic signup with verified global identity + separately owned organization; take the owner to first-property setup (country, one of the three categories, details/photos, availability and opt-out) and listing preview. Draft preparation must not grant unpaid management entitlement or imply paid launch. Preserve one global identity and server-resolved membership/role authority.
3. **Existing rental lifecycle acceptance.** Complete actual enquiry → reply → viewing → application → offer → agreement/signature → deposit/checklist → explicit tenancy activation. Automated fixtures are regression evidence only; never fabricate participant consent, signatures, money or activation to close acceptance. Review the complete canonical status after this website/lifecycle package.
4. **Subscription-management phase: Global Admin setup and paid owner activation.** Build platform-only market settings with deny tests for tenant admins/owners/seekers; settle/validate researched thresholds and above-threshold policy before activation; implement effective pricing versions, approved Stripe catalog mapping, Checkout, signed webhook handling, dwelling quantity, dunning/cancellation and subscription isolation. Preserve merchant/tax launch gates and historical customer access. No separate listing charge or premium-listing feature.
5. **Complete owner launch and final acceptance.** Verify paid owner signup → first property → automatic eligible listing/opt-out → public renter discovery/interest through the same property, plus multi-organization and existing-account cases. Check desktop/mobile, payment failure and renewal/cancellation behavior. A paid-owner journey is not operational until subscription acceptance passes; preparing its screens in step 2 is not completion.

**Release discipline:** prepare concrete tested changes for review; do not infer production deployment approval from this planning update. No runtime, schema, customer-account, payment or listing publication change is performed by updating this plan.

---

## Seeker redemption 503 — read-only evidence and diagnostic preparation, 2026-10-30

Real seeker completion remains blocked by HTTP 503 from `/api/public-signup/redeem`; #460's successful rendering correction is not signup/login acceptance. Approved read-only production run #40970286104 passed against serving build `b1656bc1c6f39045d25a00f13085f5dbbcb82f40`: schema, application identity DML permissions, required-column/default metadata and insert-trigger absence checked. Follow-up #40970990956 passed memory-only synthetic password derivation and foreign-key inspection; only the expected app-user-to-tenant foreign key was returned, and aggregate broken seeker app/auth linkage was zero. These observations do not establish the original request's failure stage or whether that particular account exists. No production customer write, token/password inspection, email resend, schema or permission change occurred.

The existing endpoint intentionally collapses request-address, limiter, redemption, identity-readback and session failures into one public 503 and currently discards the private failure evidence. The bounded next diagnostic adds only allowlisted server-side stage/category labels, with no raw error, SQL, body, token, credential, contact, IP, tenant or provider output. Public responses, normal session authority and fail-closed guards remain unchanged. Tests cover each unexpected failure stage, hostile error values, diagnostic-sink failure, ingress rejection before parsing, successful signup and expected invalid/replayed challenge handling. This diagnostic is not a root-cause correction; deployment and a controlled real verification followed by normal login remain separate acceptance gates. Keep #459 open, subscription work deferred, and do not claim an operational website from these read-only results.

## Website acceptance correction — seeker verification, 2026-10-29

The protected rental-offer release is LIVE: preflight #40884956520 and public activation #40885569427 passed on accepted build `39068ecef4ef0fff998423c3c2fceb6303b51c54`, including strict 17/17 schema and Single/min=max=1 checks. This technical release does not close real participant agreement-to-tenancy acceptance or a major canonical milestone; #459 remains open and subscriptions remain deferred.

The owner-authorized seeker registration email reached the owner, but the verification screen reported “This link is missing or invalid” before password setup. Account creation, normal seeker login and the downstream enquiry/offer journey are not accepted. The page destructively scrubbed the fragment in a React initializer inside the tenant-keyed application shell. Existing-account hydration can replace that tree and discard the only in-memory token; issuing another link alone does not repair that lifecycle.

The bounded correction captures and scrubs verification context once at the browser entry, renders verification outside owner auth/tenant initialization, and uses full navigation when leaving this isolated entry. Failed scrub and malformed tokens still deny setup; redemption remains explicit and anonymous, preserving any existing stored session. The actual-entry browser regression uses synthetic tokens/API only and covers owner hydration, StrictMode, no implicit redemption, token privacy, session preservation and return navigation. Live email/password acceptance remains required after deployment; never bypass verification or fabricate signatures, deposits or occupancy to close #459.

## Private pilot preparation — status reconciliation, 2026-10-27

Authenticated administrator release-preview acceptance is complete for the selected pilot property: the scoped production eligibility check passed, the public-field allowlist was reviewed, and the prepared derivative loaded and was approved under the previously confirmed rights/privacy scope. Private property details, preview identifiers, field values and image references are intentionally omitted from this update.

The existing temporary-controls enable and disable workflows both succeeded. Final state: temporary administrator preparation/review OFF, anonymous publication OFF. No rent, occupancy, agreement or original-image edit was made. The approved copy remains gated; the earlier withdrawn acceptance copy remains withdrawn.

Next: finish the bounded public-pilot release preparation, operational storage/account readiness, website feed configuration and rollback procedure, then obtain the separate exact-pilot activation decision. Anonymous country isolation, delivery and withdrawal/cache acceptance remain open. This completion does not authorize public exposure or close regional launch. Existing R1, conditional R3 and deferred invoice R2 decisions remain unchanged.

## Deployment recovery accepted — 2026-10-27

**Current controlling result:** the #436 private listing-preview release is now serving and deployment recovery is accepted. [Read-only release verification #40523009356](https://github.com/WasanthaK/khrental/actions/runs/40523009356), job `122254901785`, passed with retained marker `RELEASE_ACCEPTANCE=PASS expected_build=f631e7902a4fdae736a47ed6207271c503d81db9 ready_revision=khrental-app--0000390`. Both application and MSSQL health returned `ok=true`, database connection ready. [Corrected diagnostics #40522371215](https://github.com/WasanthaK/khrental/actions/runs/40522371215) recorded revision Healthy, 100% traffic, one replica, zero restarts. Independent app.quixo.homes build and SQL health checks agree; LK public inventory still responds PUBLIC_LISTINGS_DISABLED.

**Cause established for the failed readiness gate:** original [#40515503895](https://github.com/WasanthaK/khrental/actions/runs/40515503895) exhausted 30 six-second polls while the new container was still Waiting/PullingImage and not started. Its replica was created at 13:56:07 UTC and subsequently started at 14:05:00 UTC, approximately nine minutes later, with zero restarts. This establishes delayed image availability/start relative to the old readiness budget; the underlying provider/network reason for that pull duration is not independently established. The original workflow remains historically FAILED; later recovery proof does not rewrite it green.

**Repair completed:** `6bf55cf` gives the deployment verifier a bounded 15-minute elapsed-time readiness window and a 20-minute step timeout, preserving exact-build, SQL, startup and revision checks. System logs use supported JSON without invalid revision scope. `cc1ed04` repairs the read-only diagnostic system-log format and limits replica output to operational fields. `f460632` adds optional expected-build acceptance to that diagnostic without deployment/restart. Both YAML files and all 12 embedded shell blocks passed syntax validation; isolated mocked immediate-ready, delayed-ready and timeout cases passed. Workflow-only changes did not redeploy the app; no cloud restart, traffic override, scaling, SQL apply or public release was performed.

This supersedes older “deployment unaccepted / previous build serving / diagnostics queued” statements below. **Next canonical action:** resume the private administrator preview on the now-accepted serving build to obtain Solace's exact opaque listing ID, authoritative eligibility and permitted public fields. Public activation still requires the separately reviewed one-property decision. The fresh prepared derivative remains withheld; prior private acceptance need not be repeated.

## Current canonical dashboard and work priority — 2026-10-27

**Controlling reconciliation:** Requested by the owner after reviewing the program status. This dashboard supersedes older current/next/source-only statements below wherever they conflict. Historical evidence and narrowly accepted waivers remain intact. The master authority is this document; supporting documents explain individual gates.

**Business outcome now:** prepare one real Sri Lankan property for the separately approved Quixo.Homes public pilot, then complete paying-organization and regional-launch acceptance. One active work package at a time. If a step is access-blocked, record the dependency and advance independent preparation within this scope. Do not restart completed invoice, signing, private-photo or migration acceptance merely for another checklist tick.

**Milestone naming:** The original locked sequence uses R4 for paying organizations and R5 for marketplace/regional expansion. Later owner-approved website/property packages use the R4 prefix. Preserve those PR/workflow names, but identify work by its business deliverable in this dashboard. Completed website/private-photo work does not close paying-organization billing or the regional marketplace launch.

| Workstream | Current disposition | Remaining exit |
| --- | --- | --- |
| R1 — original KH Rentals release | **CLOSED — owner approved 2026-10-24.** Core release accepted; historic Evia local-audit recovery and invoice provider-correlation limitations retain their explicit owner waivers. | Preserve evidence; reopen only under the recorded owner/production-critical exception. |
| R2 — Invoice Designer immutable archive | **OWNER-DEFERRED; incomplete.** Schema/default-OFF foundations and controlled PDF/date acceptance retained. | Resume only when rescheduled: bounded real R2/SQL archive, byte readback, authorized retrieval and delivery acceptance. Outside current critical path. |
| R3 — seeker registration | **CONDITIONALLY ACCEPTED for the existing single ACA replica.** Controlled identity/session/tenant-boundary, SQL concurrency and challenge-ledger evidence retained. | General signup remains OFF; distinct-replica enforcement proof mandatory before scaling. Documented verification-UX/live-negative limits remain. |
| Quixo.Homes website look-and-feel | **OWNER APPROVED; illustrative website published.** | Additional copy/sections parked for later owner discussion. Real inventory activation is separate. |
| Real-property/photo integration (existing R4 packages) | **PRIVATE ACCEPTANCE COMPLETE; public pilot preparation ACTIVE.** #430/#432 deployed, governed 13/13 schema verified, Solace photo prepared/previewed/approved/withdrawn, original retained, private controls shut down. #434 single-listing safeguard deployed. | Authoritative selected-property eligibility and opaque listing ID, exact projected content, derivative takedown/cache/access checks, site/API country acceptance and exact public pilot go-live approval. |
| R2 infrastructure privacy and operations | **Direct-public-access audit PASS**, 2026-10-27; working object operations retained. | Human account/linked identity, production account match and recovery custody remain unverified. Workers/proxy/cache/takedown checks remain part of public-pilot readiness. This storage track is distinct from deferred invoice milestone R2. |
| Paying organizations — B01/B02/B03/B04-owner/B05 | **OPEN.** Commercial policy approved; sandbox setup is partial progress. | Verified account/tax/MoR readiness, isolated billing-pending owner setup, Checkout, signed/idempotent webhooks, server-counted quantity/proration, paid entitlements and lifecycle acceptance. |
| Marketplace/regional expansion — B06/B07/P3–P7 | **OPEN.** Sri Lanka then Brunei; shared architecture and country-first browsing approved. | Controlled listings/search/enquiry journey, regional legal/privacy readiness and staged launch decisions. No broad regional launch accepted. |

### Execution queue and decision points

| Priority | Concrete work | Completion evidence / dependency |
| --- | --- | --- |
| **1 — NOW** | Finish the bounded one-property public-pilot preparation for SOLACE RESIDENCE, third-floor apartment. Resolve its opaque listing ID and authoritative availability without changing occupancy/agreements; read back the exact allowlisted public fields and chosen derivative. | Authenticated projection/eligibility evidence; no source property ID substituted for the public ID. Retain private original and source rights/privacy confirmation. |
| **2 — SAME PILOT** | Complete storage access and withdrawal/cache checks, country-scoped collection/detail/media denial and site live-feed configuration review. Reconcile owner/account/recovery custody in the infrastructure handover. | Evidence tied to the selected listing, serving build and approved topology. The successful direct-public-domain audit is already closed; no repeat required absent a relevant change. Do not invent cache/Workers proof from it. |
| **3 — PILOT RELEASE DECISION** | Present the exact property, fields, photo, exposure scope, acceptance and rollback procedure to the owner. After explicit activation approval, run the bounded public API/site pilot and retain withdrawal/rollback results. | Separate owner go-live decision; documentation approval alone does not enable public inventory/media. Prepare the reviewable package before requesting approval. |
| **4 — NEXT PROGRAM PACKAGE** | Complete organization/billing readiness and paid onboarding under B02/B04-owner/B05, beginning with unresolved Stripe account and regional tax/MoR eligibility, then owner setup through verified paid management. | USD 5 per independently rentable dwelling/month, monthly/no trial; midcycle addition proration collected next regular invoice; 7-day renewal grace. Sandbox lifecycle acceptance precedes approved live charging. |
| **5 — FOLLOWING** | Complete country marketplace/search/enquiry and regional pilot acceptance, Sri Lanka then Brunei, using the shared application and public projection boundary. | Regional legal/privacy readiness and explicit staged launch decision. Existing illustrative site approval is not regional service-launch proof. |
| **PARKED** | Invoice Designer archive R2; expanded website copy; general signup activation and extra replicas. | R2/content need owner rescheduling; signup needs separate rollout decision; scaling needs distinct-replica acceptance and any required infrastructure/cost approval. |

### Latest retained evidence

- [#434](https://github.com/WasanthaK/khrental/pull/434) merged; [deployment #40489759980](https://github.com/WasanthaK/khrental/actions/runs/40489759980) succeeded at serving build `2760ad031f5cc92dcfc4d80e0bb9eccbf1694fe7`, Ready revision 0000386, MSSQL ready, R2 object write/read/cleanup passed. Recorded anonymous LK/BN inventory returned 404; public activation remains OFF.
- [Private controls shutdown #40487576537](https://github.com/WasanthaK/khrental/actions/runs/40487576537) succeeded after the Solace approval/withdrawal test. The acceptance derivative is withdrawn and original retained. No repeat private test is required.
- [R2 direct-public-access audit #40494891305, attempt 3](https://github.com/WasanthaK/khrental/actions/runs/40494891305/attempts/3) succeeded on 2026-10-27 at 17:43:06 Asia/Colombo: `DIRECT_PUBLIC_BUCKET_ACCESS_DISABLED`, `managedPublicAccess=false`, zero configured/enabled custom domains, against Production-configured storage. This closes that specific settings gate, not human ownership or Workers/proxy/cache/takedown acceptance.
- Governed publication apply and [independent strict verification #40363846709](https://github.com/WasanthaK/khrental/actions/runs/40363846709) already recorded 13/13; do not reapply completed production schema.
- Supporting gate records: [infrastructure handover](INFRASTRUCTURE-HANDOVER.md) and [public listing projection boundary](QUIXO-PUBLIC-LISTING-PROJECTION-BOUNDARY.md).

**Authorization for this reconciliation:** update planning/supporting documentation and priorities. No new public exposure, signup, property change, invoice/email/signature, SQL apply, payment or infrastructure scaling is authorized by this update.

### One-property pilot review screen — bounded follow-on, 2026-10-27

GitHub authentication recovered. Existing [private workflow #40510702814](https://github.com/WasanthaK/khrental/actions/runs/40510702814) passed against actual serving build `2760ad031f5cc92dcfc4d80e0bb9eccbf1694fe7`, enabling administrator controls with anonymous publication OFF. After a transient startup SQL timeout, the live MSSQL health endpoint returned ready and authenticated KH Rentals property access resumed. No database/schema change was performed.

For the selected Solace property, saved private settings show LK, no public headline/location overrides and opt-out unselected. A fresh registered-photo derivative with description “Exterior of the apartment building” was prepared and the private preview loaded. The new copy remains **withheld / awaiting review**, not publicly approved or published; the earlier completed approval/withdrawal acceptance remains closed. A separate disable workflow was dispatched after preparation; its final result must be retained before claiming shutdown complete.

**Concrete release-preparation gap:** existing administrator UI discards the opaque public ID and has no authoritative eligibility preview, so public activation would require an unreviewed identifier/projection. [PR #436](https://github.com/WasanthaK/khrental/pull/436) adds only a private, management-gated GET and visible saved public fields/reference. SQL reuses the existing eligibility predicate with authenticated tenant AND exact source-property constraints. No new schema, anonymous route, signup or billing behavior. Tests cover default-off/revoked/staff/foreign-tenant denial, mismatched public ID/country, safe output and the exact preview query against disposable two-tenant inventory. **Source implementation prepared; CI, merge/deployment and live preview acceptance pending.** Do not label this as public-pilot completion.

Next: accept CI, deploy the bounded private preview, run the existing temporary controls against the then-current serving build, read back the exact public ID/projection/eligibility, finish storage/site readiness, shut controls down and present the exact public pilot for its separate owner activation decision. Keep the prepared copy private until that review is concrete.

### One-property pilot continuation — authenticated app check, 2026-10-27

The owner selected the one-property public pilot as the next work package. Fresh authenticated KH Rentals UI inspection confirmed selected SOLACE RESIDENCE property `DAE78C13-B571-42CB-A8EC-9C2C656B5B0B`: country Sri Lanka (LK), Apartment, LKR 60,000/month, Active, one registered exterior image and no currently associated rentees. These are UI observations, **not a substitute for the authoritative public eligibility query**. No property, agreement, rent, country or photo was changed.

Private listing/photo controls are absent, consistent with the accepted shutdown. The public listing ID and live allowlisted projection remain unresolved. Source inspection confirms the existing management GET returns the opaque public ID only while the management gate is enabled; the existing private-pilot workflow enables administrator preparation/review while forcing anonymous listing/media gates OFF.

**Current execution dependency:** the application browser is authenticated; GitHub browser is not. The connector cannot dispatch workflows. GitHub sign-in reached two-factor authentication, then visibly returned “Two-factor authentication failed” and the login form. No workflow was dispatched and no runtime flag or public site was changed. Continue through owner-completed GitHub authentication, then run the existing private preparation workflow with the actual serving-build guard, resolve listing ID/projection/eligibility and prepare the exact pilot review package. Do not create replacement automation or extract credentials to evade this dependency. Public activation still requires the separately scoped owner decision after the package is concrete.

## Infrastructure access recovery correction — 2026-10-27

Owner identified an incomplete operational handover: existing R2 credentials work,
but the inspected records do not establish Cloudflare account owner/login/recovery
or current direct public-domain access. This is an access/documentation gap, not
evidence of storage failure. Working object checks do not close that gap.

Bounded corrective package: [Infrastructure handover](INFRASTRUCTURE-HANDOVER.md)
records verified Azure/R2/GitHub provisioning and credential references, explicitly
unconfirmed ownership and recovery custodians, normal owner-led recovery, and a
read-only R2 managed/custom-domain audit. The audit uses a separate authorized
management token; existing S3 object credentials are never exposed or substituted.
PASS requires both direct access mechanisms disabled; missing/denied/incomplete
evidence is BLOCKED. It does not certify Workers/proxy/cache behavior.

The live direct-public-access audit is now accepted: [#40494891305 attempt 3](https://github.com/WasanthaK/khrental/actions/runs/40494891305/attempts/3) succeeded on 2026-10-27 with managed public access disabled and zero custom domains. Account ownership/recovery acceptance remains open; see the controlling dashboard above. No provider account, role, token, bucket, public setting or production
resource is changed by this source package. Existing private-photo acceptance and
shutdown remain closed. R2 invoice archive deferral is unchanged. Real-listing
activation remains OFF pending this operational acceptance and separate public
pilot approval.


## Controlling R4 advance — private acceptance complete; bounded public pilot preparation (2026-10-27)

**Supersedes the pending private approval/shutdown statements below.** All four owner-authorized private steps are complete: administrator controls enabled by [#40481489814](https://github.com/WasanthaK/khrental/actions/runs/40481489814); SOLACE RESIDENCE (`DAE78C13-B571-42CB-A8EC-9C2C656B5B0B`, third-floor apartment, LKR 60,000/month) assigned the owner-confirmed Sri Lanka `LK` through the country-specific control; its registered exterior photo prepared, loaded privately at **733×1200**, rights/privacy confirmed under the owner's explicit confirmation, approved successfully, then withdrawn. UI reported no remaining public-delivery eligibility and no cleanup failure. Original image still loaded at **768×1258**. No change to property type, rent, occupancy or agreement.

**Shutdown verified:** [#40487576537](https://github.com/WasanthaK/khrental/actions/runs/40487576537), job `122133135482`, passed with exact marker `R4_PRIVATE_PHOTO_CONTROLS=disable; ANONYMOUS_PUBLICATION=OFF; BUILD_MATCH=PASS; REVISION_READY=PASS` on serving runtime `f585c7c3036212dfb1ca0a0c1e8e40a31be9c43a`. Management/preparation/review and anonymous publication gates are OFF. Earlier failed shutdown submissions made no Azure changes; the successful run supersedes them. No repeat private test is required merely to gather another tick. The derivative used for acceptance is withdrawn; this does not establish anonymous bucket ACL/cache/takedown proof.

**Business next:** real available properties browsable by country on Quixo.Homes, beginning with the separately owner-approved public pilot. Signup, enquiries, payments, website content expansion and deferred R2 remain outside this work.

**Read-only availability preflight:** the agreements screen listed three agreements. The active SOLACE RESIDENCE agreement `7A002E5A-617F-4609-BFBA-A57152E1F5F1` resolves to the *other* property `DF5D68DD-98D8-4E16-9916-D283BC39B1C3` and unit KH211, not the selected third-floor apartment. No agreement was edited. This supports the selected property's candidacy, but the authoritative SQL eligibility query must still accept it at activation; do not replace that check with a matching display name or stale Active label.

**Release-scope correction, source only:** existing anonymous flags enable all eligible country-classified inventory across tenants. They cannot alone make a promise of one-property exposure. Add optional server-only `PUBLIC_LISTING_PILOT_PUBLIC_ID` using the opaque listing ID, consistently applied to collection, detail and media routes. Invalid/empty explicitly configured values deny reads; query parameters cannot change scope. Absence preserves the eventual default-public business policy behind existing default-OFF flags. This is a temporary rollout boundary, not a per-property Publish button, opt-out rewrite or SQL migration. New actual HTTP tests cover mixed inventory, unrelated direct/photo links, mismatched projections, invalid config, country checks and withdrawal recheck. **Update 2026-10-27:** #434 merged and deployment #40489759980 succeeded at serving build `2760ad031f5cc92dcfc4d80e0bb9eccbf1694fe7`, Ready revision 0000386. Recorded anonymous LK and BN inventory returned 404. Safeguard deployment is complete; public activation remains pending separate approval.

**Proposed public content, pending live projection/readback and owner go-live:** existing allowlisted defaults would show “Home for rent”, “Sri Lanka”, residential category and LKR 60,000/month. Public description/precise street address, bank details, tenant/contact data, agreements and original image URLs are excluded. The photo would be a newly prepared/approved metadata-stripped derivative after release preparation, not the withdrawn acceptance copy. Opaque listing ID must be resolved under the authenticated administrator context; never substitute the source property ID in pilot configuration.

**Outstanding acceptance before public go-live:** direct-public-domain configuration is now verified by successful audit #40494891305 attempt 3; do not repeat it merely for a checklist tick. Still required: derivative takedown/cache behavior, human ownership/recovery and production-account match, authoritative projected inventory and selected opaque ID, country-scoped anonymous CORS/cache/rate-limit behavior and static-site live-feed switch. Separate explicit owner approval of the exact public pilot and activation is still required. No live flag, storage ACL, property or website mutation occurs in this source step.


## Controlling R4 checkpoint — private rollout accepted, public release pending (2026-10-27)

This checkpoint supersedes the older R4 draft/unmerged/source-only status below **only for the owner-approved private rollout**. Evidence is recorded in [PR #430](https://github.com/WasanthaK/khrental/pull/430), including its final private acceptance checkpoint, and corrective [PR #432](https://github.com/WasanthaK/khrental/pull/432). Historical evidence remains intact; no public activation is authorized.

| Gate | Current evidence / decision |
| --- | --- |
| Canonical scope | R1 closed by owner; R2 deferred; R3 conditionally accepted for one ACA replica. Continue R4 real-property/photo acceptance. Website copy expansion and unrelated features remain parked. |
| App-only country/photo rollout | #431 deployed; the prior authenticated demo test saved LK and verified the original photo at 1920×1440. Legacy unknown countries remain unassigned until explicitly verified. |
| Private R4 deployment | #430 merged at `9025ee25e29bc428d4513f277669e7b93cbccdfd`. App deployment [#40362312999](https://github.com/WasanthaK/khrental/actions/runs/40362312999) and illustrative static site deployment [#40362313091](https://github.com/WasanthaK/khrental/actions/runs/40362313091) passed. |
| Production migration | Governed apply [#40363193676](https://github.com/WasanthaK/khrental/actions/runs/40363193676) and separate strict read-only [#40363846709](https://github.com/WasanthaK/khrental/actions/runs/40363846709) passed; 13/13 ledger/schema entries recorded. Do not repeat this completed apply for another checklist tick. |
| Source-path correction | #432 preserves exact registered R2 source-key casing after ownership validation. Deployment [#40365625032](https://github.com/WasanthaK/khrental/actions/runs/40365625032) passed at serving build `f585c7c3036212dfb1ca0a0c1e8e40a31be9c43a`. No source-image move, URL rewrite or further migration required. |
| Actual private pilot | Preparation and 1600×1200 private preview passed. The copy stayed withheld. Withdrawal removed it from the visible prepared-photo list and cleared its preview without a reported cleanup error; the original 1920×1440 photo still loaded. This is private workflow acceptance, not independent anonymous object ACL/deletion proof. |
| Approval transition | **Still untested live.** The pilot photo contains people; no rights/privacy confirmation or ready approval was fabricated. Automated approval tests are not live approval evidence. |
| Temporary controls | Shutdown [#40430963466](https://github.com/WasanthaK/khrental/actions/runs/40430963466) passed: management/preparation/review OFF; anonymous listing/shared-limiter-ready/media/processor-ready OFF. Recorded no-credential checks: inventory 404; original photo 401. These are recorded prior results, not newly rerun checks. |
| Public site | Illustrative static site remains live. Real-property listings/photos, public signup and payment activation remain OFF/unapproved. |

**Next bounded work:** inspect registered demo images in the authenticated app, select a rights/privacy-cleared image, then exercise the missing administrator approval and withdrawal transition under the existing private-pilot scope. Confirm rights from the owner; a visually empty image alone does not prove a publication licence. Do not change tenancy/availability to force listing eligibility or infer a legacy country from address/currency.

**Remaining before public launch:** explicit country classification for selected inventory; authoritative availability/active-agreement acceptance; actual derivative-storage anonymous ACL and withdrawal/cache/takedown acceptance; end-to-end country-scoped public API/site checks under a separately approved public pilot; explicit owner activation decision. Enabling the anonymous listing/media or static live-inventory switches is not part of the private pilot.

**Read-only continuation, 2026-10-27:** authenticated app dashboard and property pages are accessible. WATER FALL VILLA and Malabe “Nescius” display registered original images and show “Country required”; no country assignment, property availability, tenancy, photo approval or public switch was changed during this inspection. Malabe's image includes people and is not cleared for the approval test. Private controls are absent from the inspected property UI, consistent with the recorded shutdown, without independently asserting current Azure flag values.



### Owner-confirmed next private photo test — 2026-10-27

The owner explicitly confirmed publication rights, privacy clearance and Sri Lanka (`LK`) for **SOLACE RESIDENCE**, the third-floor apartment with monthly rent LKR 60,000 (property `DAE78C13-B571-42CB-A8EC-9C2C656B5B0B`). Its registered exterior image was visually inspected with no people apparent. This confirmation allows recording the existing rights/privacy attestations during the private approval test; it is **not anonymous publication authorization**.

**Execution status: blocked before mutation.** The app session is authenticated, but temporary private management/preparation/review controls are not visible. The GitHub connector has no workflow-dispatch operation. GitHub browser sign-in returned “Your browser did something unexpected”; no pilot workflow was dispatched and no flags, country, photo approvals or availability were changed in this continuation.

**Avoid collateral property edits:** the standard edit form displays the existing Apartment as “Apartment Complex.” The edit was cancelled without saving. This is an observed form/detail discrepancy, not a verified source/root-cause finding and not a new implementation workstream. Use the existing country-specific management control once the private pilot workflow is available; do not save the unrelated whole form just to assign country.

**Resume:** existing [administrator-only pilot workflow](https://github.com/WasanthaK/khrental/actions/workflows/r4-private-photo-pilot.yml), branch main, mode enable, expected build `f585c7c3036212dfb1ca0a0c1e8e40a31be9c43a`, confirmation `PRIVATE-PHOTO-PILOT`. Its own live-build guard must pass; do not substitute a guessed SHA. It forces anonymous publication flags OFF. Assign confirmed LK through the country-specific control; prepare, load private preview, record the owner-confirmed attestations, verify approval, withdraw and verify original-photo retention. Finish with the same workflow in disable mode and retained ready/build/OFF evidence. Do not reapply schema, enable anonymous inventory/media, or change occupancy to force eligibility.

## CONTROLLING MASTER CANONICAL CHECKPOINT — 2026-10-24

**Authority and supersession.** This checkpoint is the controlling work priority and current evidence ledger, not a claim that the project has launched. Older dated status sections below remain historical. The master plan is **KH Rentals business release + Quixo.Homes regional SaaS expansion**, not only B04 database registration. One active fix at a time; execute the next independent item if access blocks an item. For any fix: reproduce/read-only evidence -> focused change -> exact-head CI -> main deployment/ready SHA/MSSQL -> real acceptance -> record decision. Do not repeat successful live invoicing, signing, emails, database apply or schema checks only to gather another tick.

### R4 public photo rights/privacy approval and withdrawal — verified source gate, 2026-10-26

**Source-only milestone PASS; live release still blocked.** Draft [PR #430](https://github.com/WasanthaK/khrental/pull/430) at `10a86b508b32e76f942bce9df29c8bc03604c67a` now includes a separately **default-OFF** `PUBLIC_LISTING_MEDIA_REVIEW_ENABLED` owner-admin review/withdraw API, two affirmative publication-rights/privacy attestations, SQL approval and withdrawal audit records, SHA verification of both original and public derivative, SERIALIZABLE source/membership revalidation, explicit HTTPS app image-origin allowlist, and DB withdrawal before best-effort object deletion. This does not change the owner's **default-public when available, unless rented/reserved/opted out** property policy; it only gates personal/private photo safety.

**All six exact-head checks SUCCESS:** [focused API/SQL #40301120298](https://github.com/WasanthaK/khrental/actions/runs/40301120298): 48/48 unit+HTTP privacy/authorization tests, 2/2 native Sharp tests, disposable SQL (two tenants, nine properties, confirmed rights/privacy review audit, revoked admin and cross-tenant real SQL). [Static browser #40301119698](https://github.com/WasanthaK/khrental/actions/runs/40301119698), [app verify #40301120342](https://github.com/WasanthaK/khrental/actions/runs/40301120342) (**app deploy skipped**), production migration verification #40301119982, billing SQL #40301120083 and Evia #40301122227 also passed.

**Not yet accepted:** no real Azure SQL migration; no app feature flag enabled; no real KH Rentals property images accessed, converted, audited or served to the public. Need authenticated first demo-property app session for source URL/origin check, LK/BN classification, reviewed-property preview/approval UX, real R2 access-control and deletion checks and an end-to-end test before any real media publication. This approval/source-only work does **not** authorize merging/deploying PR #430.

### R4 registered property photo processor — verified source milestone, 2026-10-26

**STATUS: IMPLEMENTED IN UNMERGED DRAFT PR #430; NOT DEPLOYED.** Owner-approved policy remains: an available KH Rentals property is eligible for the selected country's public Quixo.Homes listing unless rented/reserved or opted out. Property-image integration is a separate security gate. The draft now includes a verified **Sharp 0.34.4 server-side JPEG/PNG/WebP-to-WebP re-encoder**, pinned/npm-locked dependencies, removal of EXIF/XMP/ICC image metadata, safe tenant-owned registered-photo path checks, opaque media IDs, post-conversion **SERIALIZABLE** membership/source recheck, withheld-by-default DB media rows, stale/orphan cleanup, historical media withdrawal, exact public-media SQL eligibility, and local derivative storage **outside the Express-served public directory**. Neither a registered property nor its photographs are published by this source implementation.

**At exact draft SHA `94d19d337f00236b94daf65df1fd417148c72fa6` all SIX workflows are GREEN:** [R4 privacy and real SQL #40275724627](https://github.com/WasanthaK/khrental/actions/runs/40275724627) passed **39/39** unit/HTTP tests, **2/2 actual Sharp conversion** tests and disposable SQL two-tenant/nine-property migration, availability, exact media details and withdrawal. [Static review browser #40275724697](https://github.com/WasanthaK/khrental/actions/runs/40275724697) passed; [app build #40275724610](https://github.com/WasanthaK/khrental/actions/runs/40275724610) green **with deployment SKIPPED**; standard migration #40275724611, billing SQL #40275724632 and Evia webhook #40275724488 green. There was no production image upload, SQL migration, public listing activation or real-data read.

**Remaining before releasing photos:** actual tenant image origin and production R2/local-object-storage verification, source rights and privacy approval policy for registered images, first real authorized property/country assignment, processor + media-approval workflow, public site switch, cache/takedown/storage consistency proofs and explicit pilot/production release decision. `PUBLIC_LISTING_IMAGE_PREPARE_ENABLED`, `PUBLIC_LISTING_MEDIA_ENABLED`, `PUBLIC_LISTING_IMAGE_PROCESSOR_READY`, both listing read/rate-limit switches and browser live-listing flag remain default OFF. This source milestone supersedes the earlier note below that the processor was not yet implemented, **but does not close end-to-end publication acceptance**.

### R4 public registered-property media integration — gated foundation, 2026-10-26

**Canonical implementation status:** [DRAFT PR #430](https://github.com/WasanthaK/khrental/pull/430) now contains the default-public/property availability and opt-out logic, authenticated market assignment, dual-gated anonymous LK/BN listings, and a staged public-safe **property-image manifest and delivery route** with a third/fourth independent media release gate. **All five exact-head CI checks green** at `12e988f898e289d20b7fa911f1cd55785c12e782`; focused [CI #40272313792](https://github.com/WasanthaK/khrental/actions/runs/40272313792) reports 29/29 tests and disposable SQL Server `media-withdrawal` acceptance (2 tenants, 9 properties), [browser run #40272313839](https://github.com/WasanthaK/khrental/actions/runs/40272313839) passed 44/44 viewports; app verify green, deploy skipped. The schema adds **zero** public-media records; private registered property images were **not copied or exposed**. It fails closed for cross-country direct media links, opt-out, active tenancies, invalid or missing derivative bytes, unexpected source-image changes, and absent release gates. Existing app private tenant-storage URLs are not anonymous image sources.

**Do not count the registered-image integration as live or complete.** Still required before release: trusted server-side re-encode/EXIF metadata removal and source-photo ownership/rights verification worker, safe generation into separate public-only media keys, explicit market assignment to real existing properties, real Azure/R2 storage ACL and object deletion/cache acceptance, one controlled real-property pilot, owner content/rights approval and distinct go-live flags. The visual Quixo.Homes website approval remains closed; additional marketing copy is deferred as previously agreed. **No main-branch application source merge, SQL production migration, real public property publication, website feature activation or payment/signup change is authorized by these checks.**

### R4 final visual acceptance — owner approval, 2026-10-26

**OWNER ACCEPTED THE CURRENT PUBLISHED QUIXO.HOMES VISUAL DESIGN.** After reviewing the photographic Sri Lanka/Brunei public proofreading website, the owner said **“honestly it look and feel good. of course a website should have more content, we will discuss that later.. you can go ahead and take this as approved.”** Treat this as **final acceptance of the current look-and-feel and visual proof-of-concept**: shared brand, approved lowercase Quixo wordmark, residential/commercial seeker-first visual presentation, two country previews, illustrative imagery and responsive layouts. No need for further speculative visual redesign or repeated sign-off on that design.

**Explicitly deferred:** Expansion/rewrite of website copy and sections until a **later owner discussion**. Do **not** invent or publish additional country/legal/marketing claims under this visual approval. Preserve existing review-only notices and pages as approved.

**Scope boundary:** This closes **R4 visual-design approval only**, **not** regional SaaS/public marketplace launch or production content, photograph licensing/rights, privacy/legal localization, SEO indexing, custom-domain readiness, tenant/property data release, owner signup, search API, viewing enquiries, Stripe billing or Azure scaling. The already published static example site may remain available for proofreading with all real-data/live-transaction gates OFF. Formal data publication must derive only from explicitly owner-approved properties and selected images in the authenticated app; see [public-listing projection boundary](QUIXO-PUBLIC-LISTING-PROJECTION-BOUNDARY.md).

**Canonical next independent workstream:** Safely plan and validate the authenticated-app-to-public-listing/image-projection architecture (publication state, allowlisted fields, asset consent, revocation, tenant isolation, security tests). Technical discovery/design can proceed without modifying live property visibility; implementation and any publication of real records require **separate explicit approval**. Website content enhancement is intentionally **PARKED** until the owner resumes that discussion.

**Decision:** R4 WEBSITE VISUAL DESIGN = **APPROVED/CLOSED**; R4 STATIC PROOFREADING HOST = **PUBLISHED**; CONTENT EXPANSION = **DEFERRED**; PUBLIC LISTING/ENQUIRY/SIGNUP/BILLING LAUNCH = **NOT APPROVED**.

### R4 approved photographic proofreading update and future app-property projection — 2026-10-26

The owner approved using the supplied Quixo.Homes mockup photographs on the publicly accessible **static proofreading** website, and separately clarified that **the final live imagery must come from properties registered in the authenticated KH Rentals application**. The latter is a **future publication architecture**, not authorization to publish current properties or connect the site to private data. Record the mandatory owner-authorized, allowlisted listing and approved-image projection, explicit default-private publish/unpublish action, revocation/takedown semantics and no raw property/tenant/document exposure in [QUIXO-PUBLIC-LISTING-PROJECTION-BOUNDARY.md](QUIXO-PUBLIC-LISTING-PROJECTION-BOUNDARY.md).

**LIVE STATIC REVIEW UPDATE:** [PR #429](https://github.com/WasanthaK/khrental/pull/429) merged as `68f964ea11eecded4917631928015abfb8c9e164`, adding six small WebP illustrative review assets taken from the owner's approved mockups, property/gallery cards for both LK and BN and the public homepage, photographic hero styles, an approved branded favicon, and a stronger browser/image test. This is a public photo/layout review, **not** real marketplace inventory; example prices/locations are illustrative and real search, enquiries, new signup and payments remain disabled. Preserve `noindex,nofollow` and `robots.txt`. The small preview crops are not final production-quality property photographs.

**Acceptance:** [PR verification #40248899041](https://github.com/WasanthaK/khrental/actions/runs/40248899041) **SUCCESS** at exact source head `50e1d08e2e310c95f4c277961b634c02f22ebd7c`: all six WebPs decoded, 44/44 local Chromium checks over 11 static pages × four viewports, no live actions. Application verify job green without an application deployment. [Azure Static Web Apps publication #40249126138](https://github.com/WasanthaK/khrental/actions/runs/40249126138) **SUCCESS**; host `https://mango-grass-0314c0100.3.azurestaticapps.net/` and stylesheet checked by workflow on live site. **Live Azure country-route and individual WebP HTTP checks, owner visual proofreading, final photo rights/quality, and legal/locale signoff remain OPEN**; do not mislabel as production marketplace acceptance. No public signup flags enabled, no real app-property-photo projection deployed, and no Stripe/SQL/replca change.

**Next:** Obtain owner proofreading feedback on deployed hero, cards and property pages, make bounded website adjustments; separately design/approve secure app-property publication workflow and full media/visibility acceptance for an owner-selected real-property pilot before any public listing can exist.

### R4 owner-approved public proofreading publication — 2026-10-25

**OWNER AUTHORIZED** the approved Quixo.Homes logo SVG in the public GitHub repository, explicitly authorized pushing a STATIC website for online proofreading and **replacing the previous basic homepage**. This does **not** authorize general registration, real rental inventory, viewing enquiries, live payments, country-specific subscription pricing, paid launches, or Azure replica scaling.

**PUBLISHED STATIC MARKETING REVIEW:** [PR #428](https://github.com/WasanthaK/khrental/pull/428) was merged on exact approved head `f00aff313e674a93f60798698590a318fed4c50d` via `d152d03b1b7d318365f0c961be9231c8e134e09c`. The new country-neutral `marketing/index.html` replaced the basic site; ten preview pages at `/lk/` and `/bn/` plus corrected original Quixo wordmark SVG, shared styles, preview notices and `robots.txt` are public. The existing customer sign-in origin remains `https://app.quixo.homes/login`; real property data, private owner/tenant assets, mockup photos, forms and live signup, listing, viewing and payment actions were **not included**. Every page has `noindex,nofollow` for proofreading. Public website target is the confirmed Azure Static Web Apps hostname [mango-grass-0314c0100.3.azurestaticapps.net](https://mango-grass-0314c0100.3.azurestaticapps.net/); **custom quixo.homes DNS/live binding was not independently verified in this release**.

**PREPUBLICATION PROOF:** [PR browser run #40212392187](https://github.com/WasanthaK/khrental/actions/runs/40212392187) `QUIXO_R4_PUBLIC_REVIEW_BROWSER=PASS checked=44 pages=11 viewports=4 liveActions=0` on 320, 390, 768 and 1280px; app authorization/build verified. [Azure marketing publication run #40212577096](https://github.com/WasanthaK/khrental/actions/runs/40212577096) **SUCCESS**, with confirmed `https://mango-grass-0314c0100.3.azurestaticapps.net/` HTTP root and stylesheet verification. Source tests (44 cases) and root Azure smoke are distinct; **live Azure country-path HTTP acceptance / owner proofreading remains OPEN**. This release is a *publicly accessible static proofread*, not the regional SaaS/marketplace launch.

**WORKFLOW SCOPE CORRECTION:** New test-only `scripts/verify-r4-public-review-browser.mjs` was not initially excluded from the `deploy-container-apps.yml` main-push paths, so app build/deploy workflow [#40212577105](https://github.com/WasanthaK/khrental/actions/runs/40212577105) was unexpectedly triggered alongside static marketing (no app source code was changed). Added explicit ignored-path protection in main commit `80f3bcc58744829cf9ee4159019a80fca0cfd8f7` for subsequent edits. The unintended application deployment [#40212577105](https://github.com/WasanthaK/khrental/actions/runs/40212577105) subsequently **COMPLETED SUCCESSFULLY** on unchanged application source at image/serving SHA `d152d03b1b7d318365f0c961be9231c8e134e09c`. Azure reported latest serving revision `***-app--0000377` Ready, `GET /api/mssql/health` `{"ok":true,"provider":"mssql","connection":"ready"}`, and expected browser runtime configuration. **This was an actual application redeployment and was not part of the desired static-only release**, though existing startup/SQL health verification succeeded. The explicit paths-ignore guard in commit `80f3bcc58744829cf9ee4159019a80fca0cfd8f7` prevents the test-only script from retriggering app deployment in future; preserve this boundary.

**NEXT:** Owner to proofread live static pages with exact URLs and report layout/copy changes. Repair only identified defects in shared site source. Verify actual Azure country paths and real content/imagery rights/accessibility/country language/legal statements before SEO indexing or marketplace activation. Keep all five R3 public signup/seeker switches OFF, current single-replica scaling constraint, subscription/tax MoR release gates and R2 deferral intact.

### Approved R4/R5 website and initial-market direction — 2026-10-25

**Owner decision: initial Quixo.Homes country marketing websites are Sri Lanka (ISO 3166-1 alpha-2 `LK`) and Brunei Darussalam (`BN`) — in that stated order.** The regional product target is **individual landlords managing 1–10 independently rentable dwellings**, not large enterprise portfolios by default. These are the first two market *website builds*, **not a claim that paid services, merchant/tax clearance or public regional launches are authorized**. Do not mistake Brunei's two-letter code `BN` for `BR` (Brazil).

**Approved technical architecture:** one shared Quixo.Homes frontend codebase and component/design system, one shared authenticated application at `app.quixo.homes`, and country-localized public marketing experiences. Proposed canonical marketing routes `quixo.homes/lk` and `quixo.homes/bn` (paths are design targets, not verified existing deployments); do not fork or independently deploy separate websites for each country unless a separately demonstrated local regulation or residency restriction later requires an architectural exception.

**Localization and release controls:**
- Reuse shared templates for localized copy, property terminology, address fields, relevant legal/tenant terminology, national contact information, SEO and accessible language/region choice. Brunei and Sri Lanka must each have explicit locale/country configurations; no automatic IP-only redirect or country inference as a price/tax authority. Support country switch and region-specific search metadata/hreflang once deployed.
- Currency display targets are **LKR** (Sri Lanka) and **BND** (Brunei). **No country-specific SaaS price amount has been approved**. Existing **US$5 per independently rentable dwelling/month**, monthly-only, no trial, Stripe Product/Price as authority remains canonical baseline until a separately approved market-pricing decision. Do not equate displayed currency conversion with intentional regional price differentiation.
- Store/resolve the property market separately from organization billing/tax jurisdiction and customer payment currency. Do not derive subscription eligibility or legal tax treatment from URL prefix, browser IP or a user-controlled property-country selector. The server must authorize prices, tenant/organization scope, inventory quantity and capabilities.
- Billing/MoR, product eligibility, tax handling and local regulations for **both LK and BN** are still **OPEN external verification requirements** before accepting money, claiming tax handling or launching a paid region. Existing Brunei/Sri Lanka tenant/rental records must not be silently migrated or repurposed.
- Build country-specific *public marketing* pages first with accurate pending-service disclosures and signup/checkout CTAs gated or non-transactional until the independently approved R3/public activation and R4/Stripe release gates. Keep five R3 public signup/seeker flags OFF and preserve accepted single-ACA-replica limit. No added cloud infrastructure, live Stripe price/charge, invitation or new production account is authorized by the website decision alone.

**Immediate implementation order:** inspect existing marketing page/source and deployment/URL routing; define a shared LK/BN country data contract; build common page template with localized variants and SEO metadata; validate both routes and responsive/accessibility content; only then separately seek regional pricing and B02 tax/MoR approval, and eventually controlled country publication. Do not spawn parallel country-code forks.

**Implementation checkpoint — draft source only (2026-10-25):** Existing marketing source is the independent static Azure Static Web Apps site under `marketing/index.html` and `marketing/styles.css`. Production marketing deployment workflow `.github/workflows/deploy-quixo-homes-marketing.yml` auto-publishes changes to `marketing/**` pushed to `main`; do **not merge preview pages until country-publication approval**. Safe branch [`r4/lk-bn-marketing-drafts-20261025`](https://github.com/WasanthaK/khrental/tree/r4/lk-bn-marketing-drafts-20261025) contains one shared generator/data contract `marketing/country-pages.mjs`, standalone static preview pages `marketing/lk/index.html` and `marketing/bn/index.html`, and read-only generator parity verification `scripts/verify-quixo-country-pages.mjs`. Both previews reuse `/styles.css`, are `noindex,nofollow`, contain non-transactional enquiry CTAs only, are English draft copy, and do not show unapproved country prices or regional signup. 21/21 static source-level checks passed via read-only GitHub inspection; executable Node parity test, mobile/browser review, SEO review, deployment and public endpoint acceptance have **not** yet run. Main marketing and app runtime remain unchanged. **Next:** review page drafts/content and run Node parity check locally without paid GitHub Actions; only after market copy/CTA/SEO and country readiness review is complete, explicitly authorize merge and publication. Keep R3 rollout flags OFF and Stripe charges/products untouched. Next R4 pricing discussion should evaluate *1–10-unit landlord affordability* in each of LK/BN independently of dwelling capital value; do not invent country price amounts.

**Country draft generator parity and initial pricing research (2026-10-25):** Re-ran `marketing/country-pages.mjs` generator from the exact GitHub branch source and compared each `/lk/index.html` and `/bn/index.html` byte-for-byte: **BOTH PASS**, with canonical URLs, noindex draft SEO, shared CSS, existing-customer sign-in and no active paid signup/checkout CTA. This is source/template validation **not a live mobile/browser test or deployment**. Additional [LK/BN market-pricing research](https://github.com/WasanthaK/khrental/blob/r4/lk-bn-marketing-drafts-20261025/docs/QUIXO-LK-BN-MARKET-PRICING-RESEARCH.md) on the same isolated preview branch records current advertised Sri Lankan comparable offers (Neski Mini LKR 999 for up to 10, RentGuard Standard LKR 1,700 for up to 10, Highriser promotional per-active-contract LKR 765), weaker direct Brunei SaaS pricing evidence, and open Stripe, privacy and market-affordability work. **No LK/BN price selected.** Preserve the owner-approved US$5 unit baseline, monthly-only/no-trial and Stripe Product/Price authority. Need real responsive/accessibility preview, local content/language review and explicit marketing publication authorization before merging `marketing/**`, because that main-path change triggers production Azure Static Web App deployment. Country website build approval does not imply paid regional launch.

### Master progress and exit criteria — historical 2026-10-24 baseline

The controlling 2026-10-27 dashboard above supplies the latest status and queue, including completed private approval, deployed single-listing safeguard and accepted direct-public-access audit. Retain the detailed baseline below as historical evidence; its former next-work statements are superseded.

| Canonical track | Latest independently grounded status | Release exit / next detailed fix |
| --- | --- | --- |
| **P0 original KH Rentals release, C01/C04** | **CLOSED**. Phase 0-3 engineering, regulated production schema and owner-approved exceptional direct-SQL operating policy are recorded. The controlled 2026-10-23 demo invoice date display correction is accepted. | Preserve authorization/tenant, existing signed assets and audit provenance. No blanket compatibility removal. |
| **P0 C03 existing Evia agreement audit** | **ADMINISTRATIVELY CLOSED — OWNER ACCEPTANCE WITH EXPLICIT LIVE-EVIDENCE WAIVER (2026-10-24)**. Agreement #47FDEA13 signed PDF with both signatures was retrieved; the owner can see the historic audit in Evia. PRs #358/#359/#360 merged scoped recovery and provider-audit capture. **Local recovery, immutable retention and live authorized/foreign-tenant denial were not independently proven; historical HTTP 404 remains an observed limitation, not a PASS.** | No more C03-only implementation or repeat signing to satisfy this waived release checklist item. Preserve audit and signed PDF; reopen only for a demonstrated production-critical business/security defect, or address the missing proof during an already authorized normal operational retrieval. **This waiver is not a claim that the audit has been archived.** |
| **P0 C02 existing SendGrid invoice evidence** | **CLOSED BY EXPLICIT OWNER WAIVER — 2026-10-24.** Invoice 26101901 was received with readable PDF (mailbox receipt PASS). The owner explicitly waived the *specific requirement to independently correlate this historic SendGrid provider message/event ID with the invoice issue/delivery ledger*. Existing sender/ledger paths do not retain a matching provider ID; actual correlation remains **UNVERIFIED**, not PASS. | **C02 release-checklist evidence exception ACCEPTED by owner; proceed to C05** without another email, invoice, provider replay, ledger alteration, or diagnostic workstream. Waiver is limited to historic correlation proof; it does not waive delivery correctness, tenant isolation or C05 final release approval. |
| **P0 C05 release decision** | **CLOSED — EXPLICIT RELEASE OWNER APPROVE (2026-10-24); R1 CLOSED.** Administrator approved the KH Rentals original business release after accepting the recorded C03 historic audit and C02 invoice provider-correlation evidence waivers. Existing scoped test/production evidence is preserved and is not upgraded to blanket live verification. The owner reserves the right to reopen if required. | **R1 exit accepted by owner.** The owner then expressly **deferred R2** on 2026-10-24. **R3 B04 registration is the next active milestone** in the canonical plan. Keep all existing feature flags and controlled rollout permissions unchanged. |
| **Invoice Designer I01/I03** | **CLOSED for verified migration and default-OFF source gates**. 2026-10-22 strict 9/9 schema and master settings UI gating passed. | Retain `VITE_INVOICE_MASTER_SETTINGS_ENABLED` OFF absent separate approval. Do not backfill or edit existing issued financial records. |
| **Invoice Designer I02 / R2** | **DEFERRED BY OWNER TO A LATER STAGE — 2026-10-24; NOT COMPLETED, NOT CANCELLED.** Existing R2 immutable primitive and disposable SQL crash/negative tests passed. Controlled demo invoice 26102301 PDF/date accepted, but real tenant R2/SQL publication, original-byte readback, scoped retrieval and delivery correlation remain unaccepted. Issue #355 retains the bounded pilot history. | **PARKED — not a prerequisite or active workstream for R3–R5.** Return only when owner reschedules it, after the current Quixo.Homes program priorities. Preserve the original one-demo-tenant/test-mailbox constraints; `INVOICE_IMMUTABLE_ARCHIVE_ENABLED` and invoice-master settings remain OFF; no new invoice, email, archive apply or blanket rollout. |
| **Quixo.Homes B01/B03** | **APPROVED commercial policy**, not full billing implementation: USD **$5 per independently rentable dwelling/month**, monthly only, **no trial**, Stripe is Product/Price authority. Eight B03 charging rules approved, including next-invoice collection of midcycle addition proration and 7-day renewal grace. | Implement only after original release priority gates or approved independent work package. |
| **Quixo.Homes B02** | **OPEN**. Stripe Managed Payments merchant-of-record eligibility, jurisdiction/tax scope and account identity reconciliation unaccepted. | Verify actual Stripe account and regional tax/MoR eligibility before paid launch; no live prices, charges or unsupported tax claims. |
| **Quixo.Homes B04 seeker identity / R3** | **CONDITIONALLY ACCEPTED BY OWNER — EXISTING SINGLE-REPLICA SCOPE ONLY (2026-10-25).** Governed 11/11 production SQL migration evidence; verified SendGrid delivery, consumed email challenge, tenantless `authenticated`/`seeker` identity, login/session, gated `/seeker` landing, and live server-bound context `200 verified=true eligible=true`. The same seeker was denied business properties without a tenant (`403 TENANT_CONTEXT_REQUIRED`) and a forged unassigned tenant (`403 TENANT_NOT_RESOLVED`). Owner-reported live `/app` check: signup/landing rollout flags all five OFF, runtime SQL `SELECT/INSERT/UPDATE/DELETE=yes`. Exact 16-request shared Azure SQL limiter test from **two independent Node processes on one running ACA replica** PASSED: 5 admitted, 11 denied, exact synthetic HMAC bucket cleanup. A subsequent read-only production challenge ledger query for the preapproved mailbox returned `issued=1`, `accepted=1`, `consumed=1`, `redeemable=0`, `ttl_mismatch=0`: **PASS**. [Diagnostic PR #426](https://github.com/WasanthaK/khrental/pull/426) merged after CI green; see [#388](https://github.com/WasanthaK/khrental/issues/388). | **Owner-approved conditional R3 exit for the present one-replica topology, not a general signup launch.** The post-pilot ledger is PASSED, as is the two-independent-process concurrency test. **NOT TESTED / retained mandatory pre-scale gate:** simultaneous shared SQL limiter enforcement on two *distinct* ACA replicas. Must independently pass before raising replica count or claiming multi-replica support; no added paid capacity authorized merely for the test. General signup and seeker pilot gates remain OFF until a separate explicit rollout authorization. The unverified live expired-token/replay HTTP-negative proof and the historical verify-page ambiguous error remain documented, not promoted to PASS. Source plus disposable SQL tests already deny expired/revoked/replayed/simultaneous redemptions; do not pretend they independently proved an expired-token HTTP attempt in production. The historical browser error following token consumption has no established initial-response cause. All five rollout switches last confirmed OFF; no general public registration, R4 or deferred R2. |
| **Quixo.Homes B04 organization + B05 paid SaaS** | **OPEN / not launch-ready**. Owner billing-pending organization, isolated ownership provisioning, Stripe Checkout, webhook ledger, quantity reconciliation and paid entitlements pending. Sandbox Stripe objects are not live subscription proof. | Only verified organizational ownership and Stripe paid confirmation enable paid management; never conflate landlord rent or tenant invoices with $5 SaaS. |
| **P3–P7 marketplace, regions, pilot and expansion** | **OPEN; owner selected Sri Lanka (LK) then Brunei (BN) as the first two country-specific Quixo.Homes website builds** using one shared frontend/application architecture; this is not approval of paid regional launch. Public listing projection and seeker enquiries need separate authorization from private landlord records. | Build shared localized marketing variants under proposed `/lk` and `/bn` routes; local SaaS prices, Stripe/tax eligibility and legal compliance remain unapproved. Marketplace/public-search data contract, controlled regional pilot and explicit publication decision still required. |

### R3 owner conditional acceptance decision — 2026-10-25

**Decision: APPROVED, SINGLE-REPLICA SCOPE ONLY.** When offered the two explicit options—hold R3 until physical distinct-replica acceptance, or conditionally accept the existing one-replica scope and enforce real cross-replica proof before scaling—the owner replied **“yes”** to the recommended *limited acceptance*. Treat this as a signed-off conditional R3 acceptance, not a blanket claim of complete cross-replica/production signup readiness.

**Precisely accepted evidence:** one existing mailbox received verification email, one challenge sent/consumed with 30-minute TTL, no redeemable challenge on read-only postpilot check, tenantless seeker account session and dedicated landing, live business API denial without/with forged tenant, full runtime SQL rights, physical shared SQL 16 concurrent transactions through 2 independent processes **on the same one ACA replica**, exact 5 admitted / 11 denied and synthetic row cleanup. These facts are immutable pass evidence for the tested paths.

**Explicit exclusions / mandatory holds:**
- Distinct physical two-replica Azure SQL limiter proof is **NOT TESTED** and stays a mandatory *pre-scaling* release gate; do not increase replica count, enable autoscaling beyond the accepted one-replica deployment, or claim distributed multi-replica readiness without a new explicit operator-approved verification and any associated cost approval.
- This decision **does not enable public signup**. The five signup/landing flags remain OFF based on the last owner terminal check; general public release, additional signup emails and unrestricted registrations require a separately scoped rollout authorization.
- A 30-minute TTL and replay/expired-token denial are supported by source and disposable SQL negative tests; the production aggregate is evidence of the original consumed row, **not** a live expired-token HTTP negative acceptance. The earlier ambiguous verify-page error remains an unresolved UX observation.
- Do not alter existing app/tenant/account, invoice, Evia, Stripe, permissions, SQL tier or runtime environment solely to record this decision. Original R1 remains owner-approved closed, R2 remains deferred. R4 commercial/paid-organization development is separately sequenced and not itself a payment/charging permission.

**Disposition:** `R3_SINGLE_REPLICA_CONDITIONAL_ACCEPTANCE=APPROVED`; `R3_TWO_DISTINCT_REPLICAS=NOT_TESTED_MANDATORY_BEFORE_SCALE`; `R3_PUBLIC_SIGNUP=OFF_UNTIL_SEPARATE_APPROVAL`. Supporting evidence: [R3 B04 issue #388](https://github.com/WasanthaK/khrental/issues/388). 

### R3 controlling live pilot and SQL concurrency checkpoint — 2026-10-25

This is the latest R3 acceptance evidence and supersedes the **historical open/blocked statements below** where they describe already-completed steps. Do not repeat the live single-mailbox signup, the successful real two-process SQL race or earlier invoice/Evia work merely to fill older checkboxes.

- **LIVE controlled one-mailbox outcome:** Approved existing recipient received SendGrid verification mail. Diagnostic showed one valid tenantless global seeker app/auth identity, accepted challenge/token consumed and two sessions. The account subsequently signed in and displayed the standalone *Your seeker account* page, with no tenant membership granted. One browser redemption 400 after a consumed challenge is consistent with an already-used link, but its initial root cause has not been independently isolated; successful signup must not be mislabeled a clean first-try verification UX.
- **LIVE bearer-bound authorization:** GET `/api/platform/auth/seeker-context` gave `200 verified=true eligible=true`. Using that exact account's live bearer, a property SELECT from `/api/platform/query` without tenant yielded `403 TENANT_CONTEXT_REQUIRED`; supplying a forged/unassigned tenant yielded `403 TENANT_NOT_RESOLVED`. This proves these tested boundaries, **not** a complete negative census of all business endpoints.
- **LIVE Azure SQL permission/atomicity:** Owner's read-only serving-app principal check: table exists, `SELECT/INSERT/UPDATE/DELETE=yes`. Earlier synthetic race had one rejected worker (not accepted) despite persisted count=5 and cleanup. Focused error-classification-only PR [#426](https://github.com/WasanthaK/khrental/pull/426) merged as `24f627b19f702308e94b8e9daf84a683c51caf44` after exact-head [authorization/build run #40184703944](https://github.com/WasanthaK/khrental/actions/runs/40184703944) SUCCESS (PR deployment correctly skipped). Owner confirmed later Azure deployment green. One subsequent real `/app` execution of existing `scripts/r3-b04-limiter-single-replica-race.mjs`: `R3_SQL_LIMITER_READONLY_PREFLIGHT=PASS`, `R3_SQL_EXACT_SYNTHETIC_BUCKET_CLEANUP=PASS`, `R3_SQL_TWO_INDEPENDENT_PROCESSES=PASS admitted=5 denied=11`, `R3_SQL_PHYSICAL_LIMITER_CROSS_REPLICA=NOT_YET_TESTED`. **The on-database 16-transaction two-independent-process gate is CLOSED.** Neither distinct ACA replicas nor the root cause of the superseded failed run is proven.
- **Verification one-use/expiry/replay:** Current production application source issues links with SQL `DATEADD(minute,30,SYSUTCDATETIME())`. Redemption is an atomic SERIALIZABLE `UPDLOCK,HOLDLOCK` transaction that denies absent/consumed/revoked/expired/unaccepted challenges; the existing isolated disposable SQL test `verifyPublicSignupRedemptionAgainstDisposableSql` asserts expired, revoked, unsent, replay, concurrent double redemption and rollback. Do **not** create another production account/email to repeat that covered disposable proof. **Live production ledger reconciliation now PASS:** user ran a parameterized read-only query through the serving app principal on the single approved pilot mailbox: `R3_PILOT_LEDGER=PASS`, counts `issued=1`, `accepted=1`, `consumed=1`, `redeemable=0`, `ttl_mismatch=0`. This establishes one accepted and consumed challenge, no currently redeemable challenges, and exact 30-minute lifetime on that recorded row. It does **not** independently prove fresh expired-token/replay HTTP negative results in production; those are established by source and disposable SQL acceptance, with live replay 400 observed after original consumption.
- **Rollout state:** In the same production app terminal as the tests, owner printed `R3_ALL_FIVE_FLAGS_OFF=true`. The synthetic test requires three signup switches to remain OFF. This is a point-in-time check, not authorization to enable general signup. Preserve the existing paid-resource/cost and one-recipient pilot fences.

**R3 conditional release disposition (OWNER APPROVED 2026-10-25):** Owner explicitly answered **“yes”** to accepting R3 on a **single-ACA-replica-only conditional basis**, after receiving the precise 5/11 synthetic SQL acceptance and production one-use ledger result. This is a *bounded release/evidence exception for this deployment topology*, **not** full multi-replica certification or permission to activate public registration. Preserve the existing one-replica deployment and costs; all five signup/seeker flags were last confirmed OFF and must remain OFF absent a separate release instruction. Before any additional ACA replica, scaling policy or multi-replica claim, require actual two-distinct-replica live concurrent limiter admission proof and fresh deployment/topology verification; obtain separate explicit infrastructure/cost authorization if it requires spend. Never claim an actual live production expired-token HTTP rejection from the isolated disposable SQL tests; historical post-consumption verify-page error remains unrootcaused. **Conditional R3 acceptance is recorded; no new R3 synthetic/user/email testing required within the approved one-replica scope.** R4 development/commercial work is a distinct next canonical milestone, not authorized payment activation by this acceptance. R2 remains deferred.

### R3 managed ingress production acceptance — 2026-10-25

- **GREEN — gate closed by live evidence, not source CI alone:** [PR #423](https://github.com/WasanthaK/khrental/pull/423) merged after green authorization/build tests; [production Azure acceptance #40160143371](https://github.com/WasanthaK/khrental/actions/runs/40160143371) **SUCCESS**. Azure reports the legal managed HTTP ingress transport value `Auto` with capital A. Previous probes/validations rejected dynamic socket peers, HTTP2/default hypotheses or strict lowercase enum; do not repeat them. Final implementation trusts only the rightmost Microsoft-documented ACA-appended XFF and ACA-overwritten HTTPS scheme, guarded by independently verified Azure-owned HTTP topology, without a broad `trust proxy=true` or an invalid fixed Envoy-IP allowlist.
- **Physical production verification:** all 12 Azure ingress/rollout predicate checks TRUE; `R3_ACA_MANAGED_HTTP_INGRESS_TOPOLOGY=PASS`, `R3_ACA_CUSTOM_NATIVE_SOURCE_PARITY=PASS`, `R3_ACA_MANAGED_INGRESS_ASSERTED_READY_DISABLED=PASS`. The existing serving app was Ready with `PUBLIC_SIGNUP_INGRESS_MODE=azure-container-apps-http`. Both custom/native `POST /api/public-signup/challenge` and `/redeem` returned `404 PUBLIC_SIGNUP_DISABLED` and **all five signup/seeker rollout flags remained OFF**. No accounts, emails, SQL writes, role elevation, Stripe charges, paid resources or SQL tier changes.
- **R3 sequential next:** fix only actual physical Azure SQL shared-limiter acceptance blocker (earlier app-console sessions and test-only DELETE preflight failed; SQL permission grant bits remain UNKNOWN). Avoid extra test-only permissions or free-tier changes; prefer read-only diagnosis or non-destructive approach consistent with the free SQL offer. Then one controlled existing-mailbox live challenge/30-minute redemption and foreign-org/session negative acceptance. No owner action needed for technical SQL issue; receiving mailbox choice only at canary.

### R3 physical progress and explicit blockers — 2026-10-24

- **PASSED independently:** one-shot [Azure ingress attestation #40112095296](https://github.com/WasanthaK/khrental/actions/runs/40112095296) recorded actual socket peers for native/custom hosts and prevented spoofed leftmost forwarded IP from becoming the rightmost ingress-added IP. Temporary credential/env were removed and Ready verified. *This does not automatically authorize a broad proxy trust range*: narrow production allowlist validation is still open.
- **PASSED independently, no recipient required:** [PR #415](https://github.com/WasanthaK/khrental/pull/415) merged after CI green. [Production signed-out boundary run #40121120392](https://github.com/WasanthaK/khrental/actions/runs/40121120392) **SUCCESS** confirmed Azure Ready, custom/native build fingerprint parity and all five public/signup/seeker flags literally OFF. Both origins gave `404 PUBLIC_SIGNUP_DISABLED` on empty-body challenge/redeem and `401 AUTH_CONTEXT_REQUIRED` on anonymous seeker-context GET despite forged XFF and tenant selector. No signup, SQL mutation, email or customer data. This proves *only the signed-out/default-OFF negative boundary*.
- **BLOCKED — SQL physical limiter, not a product-code verdict:** [production limiter run #40114552350](https://github.com/WasanthaK/khrental/actions/runs/40114552350) RED with one existing replica: one of two interactive Azure exec sessions failed; persisted count/cleanup not accepted. [corrected test #40117185973](https://github.com/WasanthaK/khrental/actions/runs/40117185973) RED on a **read-only preflight before new writes**. Live [SQL permission probe #40120214859](https://github.com/WasanthaK/khrental/actions/runs/40120214859) reached Ready revision `0000361` but RED because its Azure exec transport returned no acceptance marker; no actual SELECT/INSERT/UPDATE/DELETE grant bits were observed. Runtime limiter code requires SELECT/INSERT/UPDATE, whereas test-only exact-row cleanup additionally demands DELETE. **Whether DELETE is absent remains UNVERIFIED.** Do not widen the app principal, create/scale paid SQL resources, or repeatedly write test buckets to fix a diagnostic.
- **BLOCKED — recipient-dependent canary, no new email host needed:** select one existing receiving inbox only when the bounded production pilot is ready; live SendGrid receipt, one-use/expiry/replay, authenticated tenantless session, and other-organization access denials remain OPEN. No general public launch before full release-go/no-go.
- **Cost boundary:** preserve Azure SQL free-offer architecture where applicable and existing single Azure Container Apps replica; verify Azure billing setting separately rather than claiming it is free without checking. No automatic upgrade, add-on DB, additional replica, Redis, or other paid service to pass a test.

### R3 configured sender and rate limiter prerequisite — 2026-10-24

- Owner corrected Namecheap's four SendGrid CNAME/TXT records. Authenticated read-only SendGrid API showed `quixo.homes` domain validation **1 valid domain** after the correction (previously 0). A dedicated Single Sender Verification item is not needed when the authenticated domain authorizes the From address.
- [PR #408](https://github.com/WasanthaK/khrental/pull/408) passed source build/authorization checks and merged. Its [existing Production-credential readiness run #40109837769](https://github.com/WasanthaK/khrental/actions/runs/40109837769) **SUCCESS**: independently reconfirmed SendGrid authenticated-domain status before changing Azure; reused the existing SendGrid API key via the Azure secret reference; configured `PUBLIC_SIGNUP_SENDER_EMAIL=noreply@quixo.homes`, `PUBLIC_SIGNUP_SENDER_NAME=Quixo.Homes` and `PUBLIC_SIGNUP_VERIFICATION_ORIGIN=https://app.quixo.homes`; created and persisted a random 256-bit SQL bucket-HMAC secret with the reference `public-signup-throttle-secret`. Subsequent workflow executions preserve that secret (not a rotating per-replica value).
- Production job explicitly set and verified `PUBLIC_SIGNUP_ENABLED=false`, `PUBLIC_SIGNUP_PILOT_APPROVED=false`, `PUBLIC_SEEKER_CONTEXT_ENABLED=false`, `VITE_PUBLIC_SIGNUP_UI_ENABLED=false`, `VITE_PUBLIC_SEEKER_LANDING_ENABLED=false`, verified latest Azure Ready revision and native Azure build endpoint 200. **The normal rental invoice sender `contact@quixo.online` was preserved**. No outgoing mail, new user, tenant membership, Stripe payment, SQL DDL, public enablement or alteration of existing agreements/invoices occurred.
- **R3 NOT COMPLETE:** ingress socket-peer trust is still not independently established, and neither cross-replica limiter behavior nor the single-mailbox 30-minute redemption/session/tenant-isolation pilot has been exercised. These are the immediate sequential acceptance items before live public registration. The earlier intermittent custom-host MSSQL HTTP 503 is not misrepresented as this SendGrid prerequisite failing; SendGrid sender configuration PASS does not waive runtime health evidence for canary.

### R3 integrated application release evidence — 2026-10-24

- [PR #403](https://github.com/WasanthaK/khrental/pull/403), merged to main `001a41c9666aa9d7c0b87581281a994692fd493d`: the existing challenge/SendGrid/SQL limiter/Ingress/redemption services and browser entry/verification pages were connected behind **server- and client-default-OFF** gates. PR-head authorization/build, browser smoke and disposable two-tenant SQL CI passed. [Main deployment #40099235097](https://github.com/WasanthaK/khrental/actions/runs/40099235097) confirmed Azure Ready revision `0000350`, matching public SHA and live MSSQL readiness.
- [PR #404](https://github.com/WasanthaK/khrental/pull/404), merged to main `b41a62caae986baddca91a87d012f2b5e2429309`: the existing login result is `result.data` and cannot use the previously undefined `data` variable when seeker landing is enabled; verification and signup screens are isolated from tenant/storage initialization, a signed-in session is not replaced during redemption, the flagged seeker registration link is separate from legacy renter signup, and startup browser config now exposes **still OFF** `VITE_PUBLIC_SIGNUP_UI_ENABLED` and `VITE_PUBLIC_SEEKER_LANDING_ENABLED`. PR-head authorization/build, browser smoke and two-tenant SQL acceptance all **SUCCESS**.
- [Main deployment #40100855296](https://github.com/WasanthaK/khrental/actions/runs/40100855296) **SUCCESS**: Azure latest revision `0000351` is Ready; public `/build-info.json` exactly matches merge SHA `b41a62caae986baddca91a87d012f2b5e2429309`; `/api/mssql/health` returned `connection: ready`; runtime config/startup checks passed. This proves the **integration release**, not public account acceptance.
- Existing [`app.quixo.homes` domain binding #39937214688](https://github.com/WasanthaK/khrental/actions/runs/39937214688) already **SUCCESS**, with actual verified Azure CNAME/TXT ownership, SNI HTTPS cert binding, public HTTPS API/MSSQL health and build fingerprint on **2026-10-23**. Do **not** repeat custom domain setup as a missing R3 prerequisite.
- **One R3 pilot gate remains OPEN:** observed trusted Azure socket-peer mapping to the rightmost ingress-added client IP (no spoofable proxy identity), verified authorized SendGrid sender on `@quixo.homes` (legacy invoice sender `@quixo.online` does not satisfy this), controlled `https://app.quixo.homes` verification origin, actual two-replica SQL limiter, one-use/expired/replayed 30-minute email verification, safe tenantless login/session and foreign-organization denials. Verified origin TLS is not proof of SendGrid sender approval or of backend peer identity. No live verification email, customer account, new Azure paid resource, production schema write, Stripe charge, public flag enablement or business-tenant grant was performed in these releases.
- **Canonical next action:** execute the **already-defined R3 controlled operational readiness and single-mailbox canary** when these actual physical prerequisites are evidenced and the scoped pilot is authorized. If provider/ingress access is unavailable, state the external blocker rather than invent a code-only substitute, repeat verified SQL/domain gates, or advance R4. R3 remains **OPEN**.

### Owner disposition — original KH Rentals release

On **2026-10-24**, the administrator directed closure of the repeated C03 audit-recovery acceptance loop. **C03 is CLOSED BY OWNER DISPOSITION WITH LIVE-EVIDENCE WAIVER, not technically verified.** The signed agreement remains intact; the historical local audit 404 and absence of proven retained-audit readback are preserved as explicit facts. This decision does **not** waive C02, C05, tenant isolation, billing correctness, or any unapproved live operations.

**Operating priority:** deliver program outcomes. Only a demonstrated outage, authorization exposure, data loss/corruption, or a blocked core business journey can interrupt the milestone sequence. No standalone diagnostic, hardening, cosmetic, re-architecture, migration-repeat, or B04 infrastructure workstream may displace it.

### Program delivery milestones — original sequence and identifiers

The current 2026-10-27 dashboard and queue at the top incorporate later owner-approved website/property work and R3 conditional acceptance. Preserve the original identifiers below; historical R3-active statements do not restart completed acceptance, and later R4 website/property packages do not certify paid organizations.

1. **R1 — KH Rentals original business release (CLOSED / OWNER APPROVED 2026-10-24).** C01/C04 already closed; C03 and C02 narrowly owner-waived; C05 final release decision explicitly **APPROVE**. Historical unverifiable items remain documented, without being relabeled as technical PASS. This decision accepts the R1 release milestone; no production switch, new customer communication or downstream feature flag is activated by recording it.
2. **R3 — Quixo.Homes safe registration (B04; NEXT ACTIVE MILESTONE).** Starting from the completed 11/11 database foundation, mount and accept the existing public seeker flow with trusted ingress, verified sender, distributed rate limiting, safe one-use verification, browser/session/cross-tenant controls and bounded canary. No automatic KH Rentals membership. Public signup remains OFF until established release criteria are met.
3. **R4 — Quixo.Homes paying organizations (B01/B02/B03/B05).** Provision isolated billing-pending owner organizations and verified ownership; decide Stripe Managed Payments/MoR/tax eligibility for actual launch jurisdictions; then build Checkout, durable webhook ledger, monthly **$5 per independently rentable dwelling**, no trial, server-owned quantity reconciliation, entitlement enforcement and failure/grace handling. **Exit is verified sandbox-to-approved-live payment lifecycle, not catalog or database plumbing.**
4. **R5 — Marketplace and regional expansion (B06/B07/P3–P7).** Separate public listing/search/enquiry projections from private tenant data, validate regional legal/tax and jurisdiction policy, run a controlled end-to-end pilot, then approve staged regional launch. No generic promises of country readiness.
5. **R2 — Invoice Designer controlled archive (I02; OWNER-DEFERRED BACKLOG).** Not cancelled or completed; postponed to a later owner-scheduled stage, outside the R3–R5 critical path. If later resumed, retain the one-demo-tenant/test-mailbox acceptance boundaries and default-OFF flags. Do not open R2 while R3 is active.

**Owner sequence update — 2026-10-24:** R1/C05 is APPROVED and closed. The owner explicitly requested **skip R2 for a later stage**; therefore **R2 is parked, incomplete**, and **R3 is the only active next milestone**. This is a work-order change, not permission to activate signup, transact payments, or revise acceptance thresholds. Earlier statements to proceed immediately to R2 are superseded. No retrospective R1 work without owner reopening or a genuine production-critical incident.

### R1 evidence and release decision — 2026-10-24

The single bounded C02 evidence review inspected the existing invoice delivery route, provider sender and master checkpoint, with **no actual invoice, email, signing or production SQL mutation**:

- **Controlled invoice #26101901:** Owner-confirmed mailbox receipt and readable PDF, **PASS as receipt only**; the existing accepted email is not resent.
- **Existing source path:** `src/api/platform/billingReminderEmail.js` returns `{ provider: 'twilio-sendgrid', accepted: true }` and does not extract SendGrid `x-message-id`. `src/api/platform/billingRouter.js` records `invoice_email_attempted` and a terminal delivery event but persists only `metadata: { provider, result: outcome }`. The shared `src/api/email/sendGridDelivery.js` supports `providerMessageId` for another email path; this does **not** prove that the invoice path captured it. Historical records cannot be retroactively correlated from this source alone.
- **External evidence route:** The connected n8n tunnel returned *tunnel-client has not been seen for 300 seconds* on the read-only lookup; no authenticated production SQL or SendGrid activity/event data was returned. Therefore no message/event ID or invoice-specific historic correlation was independently verified. This is an **evidence/access blocker**, not an observed failed delivery and not authorization for a new repair branch.
- **C02 disposition (superseded by owner instruction on 2026-10-24):** **CLOSED BY OWNER WAIVER FOR THIS SPECIFIC HISTORIC CORRELATION EVIDENCE ONLY**. The code-level absence of retained provider message ID and inaccessible historic provider/SQL corroboration remain documented; no technical correlation PASS is asserted. Do not send another message, reissue an invoice, change historical ledger records, or open a diagnostic project to reverse the explicit waiver.

**C05 dated final owner release acceptance (2026-10-24):**

| Original KH Rentals business release criterion | Current evidence | C05 classification |
| --- | --- | --- |
| Original core business and schema controls (C01/C04) | Previously accepted, controlled invoice-date display correction accepted | **PASS for recorded scope** |
| Historic signed agreement / C03 audit | Existing signed PDF and owner-visible Evia audit; administrator explicitly closed recovery acceptance with live-evidence waiver | **OWNER-WAIVED**, not proof of recovered local audit |
| Controlled invoice mailbox + readable attachment | Existing invoice #26101901 receipt confirmed by owner | **PASS for mailbox receipt** |
| Exact invoice-to-SendGrid message/event and billing lifecycle ledger | Invoice email path does not persist message ID; live provider/ledger records unavailable | **OWNER-WAIVED 2026-10-24**, technical correlation unverified |
| Other authenticated real business journeys and release-owner acceptance | Prior automated and targeted production evidence exists; exact scope and unverified live paths remain as historically documented | **OWNER ACCEPTED FOR R1 RELEASE 2026-10-24**, not blanket technical verification |
| Optional Invoice Designer archive and Quixo.Homes growth | Separate downstream milestones, disabled/controlled rollout | **OUTSIDE R1 release approval** |

**FINAL C05 RELEASE DECISION — 2026-10-24: APPROVE, explicitly stated by the administrator.** The owner accepted the documented limited evidence and the already approved C02/C03 exceptions. **R1 is CLOSED BY OWNER APPROVAL.** This approval is the release governance decision, not an assertion that every end-to-end path was freshly tested, nor a command to activate launch flags or send mail. The administrator reserves the right to **reopen R1 only if required**. **Subsequent owner instruction defers R2 to a later stage and makes R3 the sole next active milestone.** Do not loop back to R1/R2 while advancing existing R3 acceptance.

### Completion ledger and hard restrictions

- **Completed**: core schema verified, original C01/C04 policy, controlled PDF/date regression, B04 dual schema governed apply + strict 11/11 + app-visible metadata.
- **Administratively closed with explicit owner evidence waiver**: C03 historic Evia audit recovery acceptance. Its independent live proof remains unverified, and no audit existence in KH Rentals storage is asserted.
- **Owner-waived, not technically verified**: C02 historic provider/ledger event correlation for existing invoice 26101901; approved 2026-10-24. No change to existing issued invoice or email.
- **Owner release decision completed**: C05 **APPROVE** (2026-10-24); **R1 CLOSED** under the stated release exception record. Owner reserves right to reopen.
- **Deferred but not cancelled**: R2 I02 controlled live archive proof (owner rescheduling pending; parked outside R3–R5).
- **Current active milestone**: R3 B04 public seeker registration, existing acceptance criteria and controlled canary; not complete or public yet.
- **Not completed**: B04 public signup, B02 MoR, B05 subscriptions, marketplace and regional launch.
- **Flags remain OFF**: public seeker signup API/UX, general immutable invoice archiving, invoice-master settings UI and dormant Evia canary unless an already separately authorized narrow pilot explicitly permits them.
- **No silent production writes**: avoid issuing/resending invoices, changing renter emails or legal issuer details, re-signing agreements, replaying historic artifacts, creating Stripe live customers/charges, or granting tenant roles while doing source/diagnostic work.
- Record each completion in **this master document first**, with supporting detailed issue/doc references; bounded issues (#355 I02, #377/#383/#388 B04, #375 Stripe B05) are supporting work packages, not parallel competing canonical plans.

---

**Status date:** 2026-10-20  
**Last verified behavior-changing application baseline:** `c2cedf0ae4787f688297d949d42f5f9a8acca484` (production deployment [#38874383888](https://github.com/WasanthaK/khrental/actions/runs/38874383888); Azure Ready revision `0000303`, exact public build SHA, MSSQL ready)  
**Latest verified serving release-hardening SHA (tests/docs/contract only):** `0edeb80eb91840857a4d758d32360acbfa2fb231`, [main deployment #38899514979](https://github.com/WasanthaK/khrental/actions/runs/38899514979), Azure Ready revision `0000307`, exact public SHA, MSSQL ready; 568/568 authorization regression tests and build green.  
**P0.1 completion production proof:** `b6af12bdd0ecefe870e8297c984a985cffa98dd7`  
**Purpose:** This file is the single source of truth for what we work on next. It must be updated after every completed production change. Documentation-only commits may produce a newer build fingerprint without changing application behavior.

**Controlling 2026-10-20 release status:** Production main deployment [#39201496936](https://github.com/WasanthaK/khrental/actions/runs/39201496936), SHA 3d4dcb10b49562c462815890debd74104c7ae823 passed build, authorization and Azure deployment/readiness validation on October 19. The dated 2026-10-16 serving-SHA entries elsewhere in this file are historical. See the new final section below for the active acceptance decision and the seven-migration evidence reconciliation.

## Operating rules

1. **One active work item at a time.** Do not start the next item until the current item passes its exit criteria.
2. A new bug interrupts the plan only if it is production-critical: outage, security exposure, data loss/corruption, or a core business flow completely blocked.
3. Every fix follows the same sequence: reproduce -> evidence/root cause -> narrow change -> automated checks -> PR -> production deploy -> runtime proof -> update this file.
4. **No production schema DDL in web-container startup.** The web runtime identity remains restricted. Schema changes use an isolated privileged migration path.
5. **No repo-wide compatibility rewrite.** `platformClient` removal continues one business domain at a time.
6. A green deployment alone is insufficient. Production is considered deployed only when the latest Azure revision is Ready, the public FQDN serves the exact Git SHA, and MSSQL health is Ready.
7. Do not mix cleanup with a business-flow repair. Fix and verify the business flow first; cleanup belongs in a separate PR.
8. **Authentication design priority is Security -> User Experience -> Durability.** A convenience change must not weaken identity ownership, authorization, credential safety, lifecycle clarity, or durable persisted state.
9. Authentication, invitation, recovery, onboarding, membership, session or password changes must read and preserve `docs/AUTHENTICATION-LIFECYCLE.md` before implementation.
10. Every credential transition has exactly one UI owner and one backend authority. Competing legacy and current flows are a release blocker, not cosmetic debt.

---

## Current verified baseline

### Production/deployment

- [x] Deployment verification prevents a green result while Azure continues serving an older Ready revision. (#81)
- [x] Runtime DDL was removed from web-container startup. (#82)
- [x] Production database migration work is isolated from web startup. (#84-#91)
- [x] Legacy tenant membership diagnostic reports `remaining_missing_count: 0`.
- [x] Normal production deploy now explicitly owns `/bin/sh scripts/start-container.sh`. (#97)
- [x] Deployment verification checks the Azure command/args state before accepting a revision. (#97)
- [x] Temporary startup recovery/backfill workflow has been retired. (#98)
- [x] Final normal production deployment after recovery-workflow removal passed authorization tests, build, immutable image deploy, Azure revision readiness, startup-command verification, exact public SHA verification, MSSQL health, and runtime-config verification. Run `35564526487`, SHA `b6af12bdd0ecefe870e8297c984a985cffa98dd7`.
- [x] Bootstrap platform-owner access is recoverable even while the dedicated `platform_admins` production migration path remains unavailable. PR #100, SHA `fc3cf044937a3683673ec01d7d2b465f1c70b1d7`, production run `35595451678`; authorization tests/build passed, revision `khrental-app--0000103` became Ready, startup remained deterministic, exact public SHA matched, and MSSQL health was Ready.
- [x] A Platform Administrator who also has tenant membership is no longer forced out of the tenant workspace. PR #101, SHA `0f4ad15563df30c76f431d03b16c6985245d24ed`, production run `35602332768`; authorization tests/build passed, revision `khrental-app--0000105` became Ready, startup remained deterministic, exact public SHA matched, and MSSQL health was Ready.
- [x] Tenant-switch notifications no longer block top-right page actions. PR #102, SHA `190e0d412d702aed6b11f2546872c167d5808ea8`, production run `35616577333`; authorization tests/build passed, revision `khrental-app--0000111` became Ready, public build fingerprint matched exactly, and MSSQL health returned Ready. Browser verification passed on 2026-09-22.
- [x] P0.3 provider observability deployed through PR #103, behavior SHA `6ce7d95096b2868cdf27f8d5628eb1e68b963f7e`, production run `35673793484`; authorization tests/build passed, revision `khrental-app--0000113` became Ready, startup remained `/bin/sh scripts/start-container.sh`, public build fingerprint matched exactly, MSSQL health returned Ready, and server-side SendGrid configuration reported configured.
- [x] Controlled production invitation reached the configured provider/mailbox path on 2026-09-22; SendGrid accepted the request and the test message arrived in the controlled mailbox (Junk). This proved delivery while also exposing a separate invitation-lifecycle refresh defect.
- [x] PR #105, SHA `1a7269d866c662125d0e35966e8bcae94fc68c23`, corrected stale/unknown invitation lifecycle presentation: canonical status always loads, pending state refreshes on focus/visibility and every 30 seconds, and invitation-status responses are non-cacheable.
- [x] PR #106 finalized P0.3 invitation lifecycle/privacy hardening as behavior SHA `8ae3a2a84e65363f48f6991c8f5bb7542c1f967b`: invitation-only observable email delivery, canonical no-cache status client, shared Send/Resend semantics, Team/Tenant lifecycle parity, unambiguous Tenant-added wording, accepted-date display, client log hardening, redemption/status regression coverage, and the final physical acceptance stories.
- [x] Production run `35725686513` passed for SHA `8ae3a2a84e65363f48f6991c8f5bb7542c1f967b`: authorization/lifecycle tests and build passed, immutable image deployed, `khrental-app--0000116` became Ready, startup remained `/bin/sh scripts/start-container.sh`, `/api/health` reported email configured, `/api/mssql/health` returned `{"ok":true,"provider":"mssql","connection":"ready"}`, and public `/build-info.json` matched the exact behavior SHA.
- [x] Production acceptance on 2026-09-24 exposed that opening an invitation in an already-authenticated browser could be swallowed by the generic public-route redirect. PR #117 removed that route-level conflict and deployed behavior SHA `6d55e63b468e3fb95983cbbd7b038753e53027ca`.
- [x] Acceptance then exposed that successful invitation setup could replace an existing Tenant Admin browser session, leaving the original admin tab unauthenticated/stale. PR #118 preserved only a valid different-user browser session and deployed behavior SHA `498557f996dcd8378c14e43b373f1af4cffce64b`.
- [x] Console evidence then showed the invited account itself receiving `/api/platform/auth/sign-in` 401. PR #119 removed the redundant second password-login step: invitation redemption verifies the persisted credential, issues the session server-side, and only preserves an existing session after server validation. Behavior SHA `c2d353929eeec15f79a102568c2cc7aad08e5a57`, production revision `khrental-app--0000120` Ready.
- [x] The failed physical account proved `accepted_at` is not sufficient evidence of registration. PR #121 introduced `setup_incomplete` and structural auth-link validation so accepted/partial accounts are no longer falsely projected as Registered.
- [x] PR #122 added a manual-only Container Apps revision diagnostic/restart workflow after Azure revision activation exceeded the verifier window. No application behavior changed. Retry evidence later proved revision activation could complete after the original verifier timeout.
- [x] PR #123 made the business rule explicit: **Registered means a structurally valid auth linkage plus verified account access**. Invitation redemption writes the non-secret `invitation_registration_verified` marker only after the submitted credential passes the same verifier used by normal sign-in; a successful real login also qualifies through `last_login_at`. Incomplete claimed accounts show **Setup Incomplete / Account Recovery Required** and cannot be unsafely re-invited.
- [x] Production run `35985439144` passed for behavior SHA `1ac6f4d2eb43f43641220a6e19b5f8cd9f312e13`: authorization/regression tests and production build passed; R2 write/read validation passed; revision `khrental-app--0000124` became Ready; startup remained `/bin/sh scripts/start-container.sh`; `/api/health` was healthy; `/api/mssql/health` returned `{"ok":true,"provider":"mssql","connection":"ready"}`; public `/build-info.json` matched the exact SHA; expected browser MSSQL/Evia runtime configuration was verified.
- [x] Azure SQL free-limit exhaustion temporarily paused production on 2026-09-25; after billing continuation was enabled, `/api/mssql/health` returned `200` / `connection: ready` and revision `khrental-app--0000126` was healthy. This infrastructure event is separate from P0.3 auth behavior.
- [x] Fresh production acceptance with `wweerakoone+100@gmail.com` exposed a second credential owner: `WelcomeGuide` globally treated any `?token=` as invitation onboarding and called protected `/api/platform/auth/update-user`, producing 401 before the secure invitation flow owned the credential transition. This is an authentication architecture defect, not a database outage.
- [x] PR #124 corrected the architecture: `AcceptInvite` is the sole invitation credential owner; `/accept-invite` and `/reset-password` are isolated from the authenticated app shell; `WelcomeGuide` is authenticated-only and no longer treats URL tokens as invitation state. Production run `36111540458` passed authorization/regression tests, production build, R2 validation, immutable deployment and runtime verification for behavior SHA `cfea12e7846460f85e9a1e6cf99c6956c179a99e`; revision `khrental-app--0000127` became Ready, `/api/mssql/health` returned ready and the public build fingerprint matched exactly.
- [x] Fresh physical acceptance using `wweerakoone+101@gmail.com` passed on 2026-09-25: invitation setup completed once, the app opened directly, logout succeeded, normal login with the same credential succeeded, the user entered the correct Rentee workspace, and the Tenant Admin surface refreshed to **Registered**.
- [x] Phase 1 renter property/unit schema prerequisite is now applied in production. PR #142 / serving SHA `0a9e6d3d451d19aaca5a9d754903b6d12cc2ad86` added real SQL Server 2022 execution proof and corrected canonical backfill shape. Production migration run `36946616128` used the exact serving image from Ready revision `khrental-app--0000143`, applied `20260926_01_add_rentee_property_unit_associations`, verified the column/check-constraint/JSON state, recorded the migration ledger entry, and completed successfully on 2026-10-02. Business-flow persistence acceptance remains separate and must still prove create/edit/reload behavior before Phase 1 association work is closed.

### Tenant/rentee data model

- [x] One global `app_users` identity per email remains the canonical identity model.
- [x] Organization access is represented through `tenant_memberships` rather than duplicate identities. (#73-#75)
- [x] Tenant directory uses the canonical MSSQL renter path. (#72-#75)
- [x] Tenant create response contract returns the renter identity expected by the UI. (#80)
- [x] Tenant onboarding, invitations, and shared storage have started moving off the compatibility client. (#77-#79)
- [x] Invitation-card feedback and simulation behavior were corrected. (#83)
- [x] Controlled production core smoke test completed successfully through all 12 P0.2 checks on 2026-09-22.

### Known unresolved or insufficiently verified areas

- [x] Core tenant/rentee production smoke test completed. P0.2 is complete.
- [x] P0.3 core fresh-registration acceptance passed on behavior SHA `cfea12e7846460f85e9a1e6cf99c6956c179a99e`: a never-invited renter completed secure setup, entered as Rentee, logged out, logged back in normally with the same password, and the admin surface showed Registered.
- [x] P0.3 physical acceptance completed with the documented US-INV-08 exact-log-correlation waiver; the waived observability item remains explicitly not claimed as PASS.
- [x] Damaged production test account `+99` physically verified as **Setup Incomplete / Account Recovery Required** after PR #125.
- [x] Password-reset flow passed a fresh end-to-end production regression from a logged-out/private browser on 2026-09-26.
- [x] Agreement generation/signing lifecycle is production-accepted through PRs #153, #156-#160: secure agreement-bound callbacks, partial-signature progress, completed signed-document recovery/retention, and signed-document viewing were physically verified on 2026-10-05.
- [ ] Remaining compatibility-client usage has not yet been migrated domain-by-domain.

---

# Execution sequence

## Phase 0 - Production stabilization

**Goal:** Make production deployment, database state, and observability predictable before more product refactoring.

### P0.1 - Make startup ownership permanent — **COMPLETE**

Completed through PRs **#97** and **#98**.

Exit criteria:

- [x] Normal deployment succeeds without the recovery workflow.
- [x] Azure command/args state is deterministic: `/bin/sh scripts/start-container.sh`.
- [x] Public FQDN serves the exact deployed SHA.
- [x] `/api/mssql/health` reports Ready.
- [x] Recovery workflow is removed.

Evidence:

- PR #97: normal deployment explicitly sets and verifies the startup command.
- PR #97 production run `35563887278`: green.
- PR #98: temporary recovery/backfill workflow removed.
- PR #98 final production run `35564526487`: green.
- P0.1 completion proof SHA: `b6af12bdd0ecefe870e8297c984a985cffa98dd7`.

### P0.2 - Production core smoke test — **COMPLETE**

**Goal:** Verify the current production system as a business workflow before making more changes.

1. [x] Tenant Admin can log in to the production tenant workspace. — Passed 2026-09-21 in a logged-out production browser session using the normal Tenant Admin account.
2. [x] Tenants directory loads the expected current-organization renters. — Passed 2026-09-21; the Tenant Admin confirmed the production renter directory contents were correct.
3. [x] Create a brand-new tenant identity with an intentionally unique test email. — Passed 2026-09-21; the Tenant Admin confirmed the production create operation completed successfully.
4. [x] Verify the new tenant immediately appears in the Tenants directory and remains visible after reload. — Passed 2026-09-21.
5. [x] Verify create-or-attach behavior for a global identity that already exists but is not yet a renter in the current organization. — Passed 2026-09-21 using a controlled two-organization test; the second save reused the existing global identity and attached it to KH Rentals without a duplicate-email error.
6. [x] Plain **Save Tenant** persists the tenant without attempting an invitation. — Passed 2026-09-21; the Tenant Admin confirmed the saved tenant persisted and no invitation was attempted automatically.
7. [x] **Save & Invite** persists the tenant and attempts the secure invitation flow. — Passed 2026-09-21; the Tenant Admin confirmed the tenant persisted and the invitation flow was attempted.
8. [x] Tenant card **Send real email / Send Real Invitation** produces explicit success or visible error feedback. — Passed 2026-09-22; the Tenant Admin confirmed the action produced explicit feedback rather than failing silently.
9. [x] Team directory still loads correctly after the membership/data corrections. — Passed 2026-09-22 by production browser confirmation.
10. [x] Property and property-unit directories used by tenant onboarding still load. — Passed 2026-09-22 by production browser confirmation.
11. [x] Public `/build-info.json` matches the current live deployed SHA at the time of the smoke test. — Passed 2026-09-22 with `{"buildSha":"190e0d412d702aed6b11f2546872c167d5808ea8"}`.
12. [x] `/api/mssql/health` still reports Ready after the smoke-test operations. — Passed 2026-09-22 with `{"ok":true,"provider":"mssql","connection":"ready"}`.

P0.2 production baseline: PR #102 / SHA `190e0d412d702aed6b11f2546872c167d5808ea8`, deployment run `35616577333`, revision `khrental-app--0000111` Ready, deterministic startup `/bin/sh scripts/start-container.sh`, exact public build fingerprint verified, MSSQL Ready.

Exit criteria: **COMPLETE — all 12 P0.2 checks passed.**

### P0.3 - Invitation/email observability — **COMPLETE WITH DOCUMENTED US-INV-08 OBSERVABILITY WAIVER**

Scope:

- Add a clear Send/Resend Invitation action where appropriate.
- Show canonical invitation state/date.
- Add structured server-side success/failure logging for `/api/send-email`.
- Capture SendGrid `x-message-id` when available without logging email body, tokens, or secrets.
- Keep tenant and team invitation lifecycle semantics consistent through send, resend, redemption and registered state.
- Enforce one owner for credential bootstrap and isolate invitation/recovery routes from the authenticated application shell.

Implementation and verification evidence:

- [x] Normal tenant/team action is explicit **Send Invitation / Resend Invitation** and registered accounts no longer expose an invitation action.
- [x] `Save & Invite`, tenant-card send/resend and team-card send/resend use the same secure invitation authority and observable server email-delivery path.
- [x] Canonical invitation status is projected from invitation state plus the actual authentication account. `setup_incomplete` is used when setup was attempted but the account is not proven login-capable.
- [x] **Registered is no longer inferred from `accepted_at` or `app_users.auth_id` alone.** It requires matching `app_users`/`auth_users` linkage, usable credential structure, and either a verified invitation credential marker or successful-login timestamp.
- [x] Successful redemption persists `app_users.auth_id` and `user_invitations.accepted_at` transactionally, then verifies the persisted credential with the normal sign-in verifier before marking invitation registration verified.
- [x] Fresh/stale-session invitation redemption can adopt the server-issued session directly without a second password-login call; a valid different signed-in browser session may be preserved without preventing redemption.
- [x] Incomplete claimed accounts show **Setup Incomplete / Account Recovery Required** and invitation resend is disabled to avoid overwriting a potentially shared global credential.
- [x] Tenant cards distinguish **Tenant added** from invitation lifecycle and show created/expiry/accepted dates where applicable; Team cards use the same lifecycle semantics.
- [x] Tenant details no longer intentionally suppress the canonical status lookup; valid accessible users should not remain **Unknown** after the lookup completes.
- [x] Pending status refreshes quietly every 30 seconds and when the admin browser regains focus/visibility; canonical status requests and responses are explicitly non-cacheable.
- [x] `/api/send-email` uses structured allow-listed success/failure logs and captures SendGrid `x-message-id` when present.
- [x] Invitation delivery uses a dedicated `/api/send-email` client with no EmailJS fallback and no recipient/subject/body console logging.
- [x] Invitation client telemetry excludes recipient email, subject, email body, invitation token/link, reset token, password and API secrets.
- [x] SendGrid rejection handling does not read or log the raw provider response body.
- [x] Regression coverage includes lifecycle derivation, structural auth linkage, verified registration access, credential round-trip, redemption persistence, canonical action labels, session preservation/adoption, setup-incomplete recovery behavior, focus/visibility/pending refresh, no-cache status reads, provider message ID, rejection-body suppression, log-field allow-listing, Team/Tenant parity and the dedicated observable email path.
- [x] Controlled production invitation email reached the test mailbox, proving the provider/mailbox path.
- [x] PRs #117, #118 and #119 corrected route/session/redemption defects found during the physical acceptance run.
- [x] PR #121 stopped accepted/partial registrations from being falsely labelled Registered.
- [x] PR #122 added manual Container Apps revision diagnostics after Azure activation outlasted the normal verifier; later retry evidence proved slow activation rather than an application startup crash.
- [x] PR #123 merged behavior SHA `1ac6f4d2eb43f43641220a6e19b5f8cd9f312e13`, requiring verified account access for Registered and making incomplete claimed accounts recovery-only.
- [x] Production run `35985439144` certified `khrental-app--0000124` Ready for behavior SHA `1ac6f4d2eb43f43641220a6e19b5f8cd9f312e13`; startup, health, MSSQL, public build SHA, R2 and browser runtime configuration all passed.
- [x] US-INV-01 passed physically: plain Save Tenant persisted the renter as Not Invited, showed Send Invitation, produced no invitation dates and sent no email.
- [x] US-INV-02/provider delivery passed physically: controlled production invitation reached SendGrid and the controlled mailbox.
- [x] Fresh `+100` acceptance proved the route-level architecture still allowed the legacy `WelcomeGuide` to compete with `AcceptInvite`; browser evidence was `/api/platform/auth/update-user` -> 401 while opening the invitation flow.
- [x] Root cause is documented in `docs/AUTHENTICATION-LIFECYCLE.md`: `AcceptInvite` is the sole invitation credential owner; `WelcomeGuide` is authenticated-only and must never infer invitation state from URL tokens; `/accept-invite` and `/reset-password` are isolated from the normal app shell.
- [x] PR #124 merged and deployed the isolated credential-flow correction. Production run `36111540458` passed automated authorization/regression tests, build, R2 validation and runtime checks; revision `khrental-app--0000127` is Ready and serves SHA `cfea12e7846460f85e9a1e6cf99c6956c179a99e` with MSSQL ready.
- [x] US-INV-04 core acceptance passed with fresh `+101`: clean invitation setup, direct authenticated entry, logout, normal login with the same created password, correct Rentee workspace, and admin status **Registered**.
- [x] US-INV-03 passed physically with controlled `+102`: Resend superseded the older invitation; the older link was rejected and only the newest link remained usable.
- [x] US-INV-05 passed physically: after durable renter re-login was proven, the Tenant Admin reloaded both the Tenants card/list and tenant details and confirmed **Registered** remained durable with no Send/Resend invitation action.
- [x] US-INV-06 passed physically with controlled `+102`: after account setup, reopening the accepted invitation was rejected as already used/unavailable and could not start account setup again.
- [x] US-INV-07 passed physically with controlled `+103`: the Team-member flow was exercised through initial send, pending/resend, newest-invitation account setup and Team refresh, completing the required canonical lifecycle parity check.
- [ ] US-INV-08 exact structured-log correlation — **WAIVED / DEFERRED 2026-09-26 by operator direction; not claimed as PASS.** SendGrid provider evidence confirmed the controlled `+105` invitation was Delivered / SMTP 250. A 24-hour centralized production-log privacy scan found zero sensitive-pattern matches, but exact structured-event correlation remained unavailable through the Azure logging path.
- [x] US-INV-09 passed physically: the Tenant Administrator deliberately compared and reloaded available Not Invited, Invitation Pending and Registered card/details surfaces; canonical states agreed, valid records did not remain Unknown, and Registered records exposed no Send/Resend action.
- [x] Damaged `+99` recovery projection passed after PR #125: historical accepted-invitation evidence now outranks a newer expired invitation, unsafe re-invitation is blocked, and production physically shows **Setup Incomplete / Account Recovery Required**. Run `36153613672`, SHA `2b0d77dda30761a032b289282050191eacf8246e`, revision `khrental-app--0000128` Ready.

Exit criteria:

- [x] Production evidence shows an invitation request reached the email provider/mailbox path.
- [x] Credential bootstrap has one owner: invitation route isolation prevents tenant/app-shell/legacy onboarding from competing with `AcceptInvite`.
- [x] A freshly invited tenant can complete setup, log out, and log back in with the created credential.
- [x] Production acceptance is sufficient to proceed by explicit operator waiver of the remaining US-INV-08 structured-log correlation; the waived story remains documented as not passed.
- [x] Damaged `+99` is correctly projected as recovery-required and unsafe resend is unavailable.
- [x] 24-hour production privacy scan found zero sensitive-pattern matches; exact delivery-event correlation is deferred under the documented US-INV-08 waiver.

### P0.4 - Password reset regression — **COMPLETE**

Scope:

- Reproduce password reset from request through reset link to successful password change.
- Verify the reset link does not incorrectly require an already-authenticated tenant context.
- Verify MSSQL connectivity and redirect behavior.
- Verify `/reset-password` remains an isolated anonymous credential route under the canonical authentication lifecycle design.

Verification evidence:
- [x] Physical production regression completed 2026-09-26 from a clean logged-out/private browser.
- [x] Reset request returned the expected non-enumerating success behavior and the recovery email arrived.
- [x] Reset link opened the isolated `/reset-password` recovery flow without authenticated tenant context.
- [x] New password redemption completed successfully and the user could return to normal authentication with the new credential.
- [x] Backend redemption changes the credential, marks the token used, revokes other outstanding reset tokens, and revokes all existing auth sessions in the same SERIALIZABLE transaction.
- [x] Existing automated coverage verifies the reset endpoints are anonymous credential endpoints and the browser recovery route is isolated independently of its token query.

Exit criteria: **COMPLETE — clean end-to-end password reset passed from a logged-out production browser session on 2026-09-26.**

---

## Phase 1 - Tenant/rentee workflow integrity — **COMPLETE**

**Goal:** Treat Tenants as the renter/lessee workflow and Team as the staff/contractor workflow.

Work in this order:

1. Verify create, edit, list, attach-existing-identity, invite, resend, and deactivate/reactivate behavior.
2. Verify same-organization role conflicts are explicit rather than appearing as duplicate-email errors.
3. Verify property/unit associations survive create and edit.
4. Verify tenant detail screens use canonical renter data rather than legacy fallbacks where practical.
5. Add regression tests for every production bug discovered during the smoke test.

Exit criteria:

- [x] No renter can be saved successfully and then disappear from the current organization's Tenants directory.
- [x] Existing global identities attach to organizations without duplicate `app_users` rows.
- [x] Tenant Admin cannot create platform-admin identities through tenant workflows.
- [x] Tenant and Team onboarding paths are clearly separated.

---

## Phase 2 - Agreement generation and digital signing — **COMPLETE**

**Goal:** Satisfy the business requirement: generate the agreement, place landlord/tenant signatures correctly, retain the signed document, and advance agreement lifecycle state.

Work in this order:

1. Reproduce the current signature-placement failure with a real generated agreement.
2. Compare current Evia implementation with the previously working marker/AutoStamp behavior (`For Landlord:` / `For Tenant:`).
3. Choose the supported placement mechanism from evidence; do not change Evia versions merely for cleanup.
4. Verify landlord signing, tenant signing, callbacks/webhooks, signed-document retrieval/storage, and agreement status transitions.
5. Add an automated regression fixture around signature marker/location handling where feasible.

Exit criteria: both signatures consistently appear in the intended agreement locations and the fully signed document is retained and linked to the agreement lifecycle.

Production acceptance:
- [x] Secure agreement-bound Evia callback path restored and verified.
- [x] Individual signer completion is persisted and the progress counter reflects completed signers.
- [x] Fully signed agreement transitions to the completed/signed lifecycle state.
- [x] Completed signed PDF is recoverable and retained in KH Rentals tenant-scoped storage.
- [x] Production browser physically opened the retained signed document after PR #160 on 2026-10-05.
- [x] Deployment run `37280211507` served exact SHA `c66ff3d51684645e6e482291a025fa47aecef2c9` from Ready revision `khrental-app--0000161`; MSSQL health returned ready.
- [x] Evia webhook and Evia V2 integration workflows were green on the same merge SHA.

Result: **COMPLETE — Phase 2 exit criteria satisfied.**

---

## Phase 3 - Document/storage domain cleanup — **COMPLETE**

**Goal:** Continue Stage 2 compatibility-client removal without destabilizing signing.

- [x] Review `DocumentService` / agreement document storage.
- [x] Route agreement document storage through explicit KH Rentals storage APIs.
- [x] Preserve tenant-scoped R2 paths and cross-tenant protections.
- [x] Remove only the compatibility dependency for this domain.

Exit criteria: agreement/document storage no longer depends on the compatibility storage shape and signing behavior remains unchanged.

Production acceptance:
- [x] PR #161 migrated `DocumentService` agreement/document upload/list/download and the legacy agreement attached-signed-document write to explicit tenant-scoped storage APIs.
- [x] PR #161 bound direct `/storage/:bucket/...` delivery to the tenant encoded in the object path and active membership.
- [x] PR #162 corrected the storage-route regex startup defect and added `node --check server.js` to the deployment verifier.
- [x] Production browser acceptance confirmed both a normal agreement document and the retained signed agreement open successfully through the tenant-bound storage route.
- [x] PR #163 migrated the remaining active `downloadSignedDocument()` fallback in `eviaSignServiceLegacy.js` off `platformClient.storage` without changing Evia retrieval/status/OAuth behavior.
- [x] Production deployment run `37289196435` served exact SHA `6f345bd78a23f67612d17301ca406a86d42cf7e9` from Ready revision `khrental-app--0000164`; MSSQL health returned ready and the public build fingerprint matched exactly.
- [x] Final source inventory shows no remaining `platformClient.storage` usage in `DocumentService.js`, `agreementService.js` or the active Evia signed-document fallback.

Result: **COMPLETE — Phase 3 exit criteria satisfied.**

---

## Phase 4 - Remaining compatibility-client removal — **ACTIVE**

Before changing code:

- [x] Inventory remaining `platformClient` / `platformClientCore` consumers.
- [x] Group completed storage compatibility consumers by business domain.
- [x] Remove storage compatibility façade and the major PropertyDetails/AgreementList read fallbacks in bounded production-verified slices.
- [ ] Complete remaining non-storage compatibility contracts in consolidated domain packages, with per-operation authority tests and one PR/deployment per accepted package.

Completed bounded domains include billing/payment proof storage, utilities/meter evidence, maintenance media, Evia diagnostic uploads, application storage initialization, bucket tooling, shared storage façade, PropertyContext/PropertyList/PropertyDetails reads, AgreementList/detail reads, and multiple dead agreement/invoice compatibility helpers.

Current active domain: **consolidated compatibility acceptance and closure
decision**, including disposable two-tenant SQL evidence and an explicit list
of still-live/blocked or owner-approved deferred contracts. For operational
efficiency, group related maintenance/notification and contract acceptance
tasks per PR, but preserve exact-head CI, Azure served-SHA and MSSQL
verification after every runtime merge. Doc/test/workflow-only merges no
longer require a new Azure serving revision.

Remaining work is concentrated in narrower, higher-risk areas: live agreement/property/property-unit fallbacks, agreement-template operations, invoice list/create/update compatibility paths, app-user/auth compatibility, and final repository-wide inventory/closure. These require explicit authority/behavior parity before removal.

Do **not** perform a repo-wide rewrite.

---

## Phase 5 - Product regression and release hardening

After the core flows above are stable, run focused regression passes for Platform Admin, properties/units, billing/invoices/receipts, maintenance lifecycle, notifications/email, agreement cancellation/deletion, and authorization boundaries.

---

# Parked backlog - do not interrupt the active phase

- General UI/terminology cleanup.
- Large-scale refactoring.
- Repo-wide compatibility-client removal.
- Performance optimization without a measured production problem.
- New feature work unrelated to the active phase.
- Optional architecture improvements that do not fix a verified business problem.
- Repair the dedicated privileged production migration executor, then apply/reconcile `platform_admins` and `tenancy_billing_adjustments` through the managed migration ledger. The current bootstrap-owner fallback does not replace this future schema work.

---

# Change-control template

```text
Active item:
Problem/evidence:
Scope:
Out of scope:
PR:
CI result:
Production revision/SHA:
Runtime proof:
Result:
Next item:
```

## Recently merged items — production evidence reconciliation

```text
PR #208: remove dead databaseUtils SQL RPC compatibility surface.
Merge SHA: 10673672531621b6273bac3938e96ab9e82d0c66.
CI/deployment: production workflow #590 reported green by operator; exact Azure Ready serving revision, public build SHA, and MSSQL/runtime evidence not independently captured in this audit.
Result: MERGED — production acceptance evidence pending.

PR #209: remove unused generic databaseService compatibility facade.
PR-head CI: workflow #591, run 37882986704, verify job successful; deploy skipped on PR.
Merge SHA: 14f57e3fb0d7681d65a6badd5a6760ba6475f143.
Production deployment: operator reported green; exact Azure Ready serving revision, public build SHA, and MSSQL/runtime evidence not independently captured.
Result: MERGED — production acceptance evidence pending.
```

## Recently merged Phase 4 slice

```text
PR #210: removed unused platform-backed fetchData export from src/utils/dataUtils.js; preserved active conversion helpers.
Exact PR-head CI: workflow #593 (run 37884803418), verify job successful; PR deploy skipped.
Merge SHA: 4f84a1fe0275b81dd219b7ce1b0037d19b5e0aaa.
Production deployment: operator reported green; independent Azure Ready revision, exact public serving SHA, and MSSQL/runtime evidence not captured.
Result: MERGED — formal production acceptance evidence pending.
```

## Recently merged Phase 4 items — PRs #211–#213

```text
PR #211: removed obsolete PostgreSQL timestamp exec_sql RPC repair script, preserving active MSSQL tooling.
PR-head CI: workflow #596 (run 37886032242) passed.
Merge SHA: fd3fd0cafc7d223a932aab6c1eeb79cf7b87591a.
Production: operator reported green; independent Azure Ready/serving SHA/MSSQL runtime proof remains pending.
Result: MERGED — production evidence pending.

PR #212: removed obsolete PostgreSQL database setup exec_sql RPC script, preserving MSSQL migration entry points.
PR-head CI: workflow #598 (run 37887222838) passed.
Merge SHA: 10e9aa57eef1b64d6bbce44178bee2d519d0de9d.
Production: operator reported green; independent Azure Ready/serving SHA/MSSQL runtime proof remains pending.
Result: MERGED — production evidence pending.

PR #213: removed unused PostgreSQL notifications-table recreation RPC script; live notificationService preserved.
PR-head CI: workflow #600 (run 37891045911) passed.
Merge SHA: 0c97a31347aa2b7ddb76705c7b18f36830316c91.
Production: operator reported green; independent Azure Ready/serving SHA/MSSQL runtime proof remains pending.
Result: MERGED — production evidence pending.
```

## Current ## Recently merged Phase 4 item — PR #214

```text
PR #214: removed unused src/config/platformClient.js forwarding shim while preserving active platformClient service and script-local shim.
PR-head CI: workflow #602 (run 37894412141) passed.
Merge SHA: 662f274445194ef7d37568bf4b90ee2904b2581b.
Production deployment: operator reported green; independent latest Azure Ready revision, exact public serving SHA and MSSQL/runtime proof remain outstanding.
Result: MERGED — formal production acceptance evidence pending.
```

## Current active item

```text
Active item: Phase 4 - closure-readiness audit and remaining compatibility operation/authority inventory.
Problem/evidence: Dead wrappers and scripts were removed in PRs #208–#214, but live invoice, agreement/template, app-user/auth, utilities/maintenance, notifications, and privileged migration tooling still include platformClient compatibility operations. src/db/runMigration.js still calls exec_sql RPC while src/db/executeSql.js uses direct MSSQL.
Scope: docs/PHASE4-CLOSURE-READINESS.md records completed merge evidence, unresolved production attestations, remaining live compatibility domains, Phase 4 closure gates and a contract-first next slice.
Out of scope: runtime code deletion, production DB migrations or DDL, auth, billing, property and document writes.
Result: PR #215 merged (SHA 523bedb51c862518cdd024ebe128bd717de5767e); Phase 4 NOT ready to close.
Next item: inventory and decide migration-executor authority/exec_sql callers before any further live compatibility removal; obtain exact-SHA Azure/MSSQL release evidence or a documented waiver.
```

## Phase 4 migration authority clarification

The governed production schema-write path already exists: `.github/workflows/run-production-db-migrations.yml`, `scripts/run-production-migrations.mjs`, and the dedicated `khrental-db-migrator` job, as specified in `docs/PRODUCTION-MIGRATION-EXECUTOR.md`. This documents the authority model, **not** proof that the privileged job is provisioned or able to apply.

Legacy `src/db/runMigration.js` uses `exec_sql` RPC, `src/db/executeSql.js` uses direct MSSQL batch execution, and `src/components/admin/SqlMigration.jsx` contains browser-side PostgreSQL DDL. They must not substitute for the governed production migration workflow.

See `docs/PHASE4-MIGRATION-AUTHORITY.md` for the entrypoint classification and next inspect-only route/caller census. No production SQL writes are authorized by this plan update.

## Phase 4 SQL entrypoint caller audit and bounded orphan cleanup

```text
PR #216: migration-authority review and canonical control-plane decision.
PR-head CI: workflow #606, run 37908391425, passed.
Merge SHA: 7f758aa4786e86138ae1c8ab9d75ec5d4f995b2b.
Result: MERGED — docs-only; no production schema execution.

Current active item: remove orphaned browser-side legacy PostgreSQL SqlMigration component.
Evidence: indexed repository code search for SqlMigration found only src/components/admin/SqlMigration.jsx; no imports, route or navigation consumers were found. UI component includes PostgreSQL CREATE FUNCTION DDL and exec_sql RPC logic.
Scope: delete only src/components/admin/SqlMigration.jsx, add CI regression guard preserving governed production migrations and existing npm migration commands.
Out of scope: src/db/runMigration.js (explicit npm migrate command with existing regression guards), src/db/executeSql.js, managed production migrations, active application functionality, SQL grants/DDL.
Result: ACTIVE — phase-4-remove-orphan-browser-sql-migration pending CI/review.
Next: validate exact-head CI, safely merge, verify deployment, then inventory remaining legacy SQL scripts before any further deletion.
```

## Phase 4 legacy SQL command audit — PR #218

```text
PR #217: removed orphaned browser SQL migration component.
CI: workflow #608 (run 37910489699) succeeded.
Merge SHA: f6e5ae2f2fad524fc913fb29611008ef7e410c89.
Production: operator reported green; independent Ready revision, serving SHA and MSSQL health not available.
Result: MERGED — formal production attestation pending.

Current active item: retire an unreferenced property-association migration launcher.
Evidence: src/scripts/run_migration.js only imports src/scripts/migrate_property_associations.js and has no indexed repository import or npm script. The underlying migration script remains directly documented by src/README_PROPERTY_ASSOCIATIONS.md. External manual invocation cannot be ruled out by repository search.
Scope: delete only src/scripts/run_migration.js, add CI guard; preserve underlying migration and every registered SQL command.
Out of scope: governed production migration workflow, DDL, credentials, billing, auth, or runtime code.
Result: ACTIVE — phase-4-remove-orphan-property-migration-wrapper, awaiting CI and review.
Next: require exact-head CI, authorized merge, and independent production acceptance evidence.
```

## Phase 4 invoice contract-parity audit — PR #219

```text
PR #218: removed orphan property-association migration wrapper; underlying script and registered commands preserved.
PR-head CI: workflow #610 (run 37912429093) passed.
Merge SHA: 0c75021d8759defdc323663bfe501bae1b9df6a9.
Production: operator reported green; independent Azure Ready serving revision, exact SHA and MSSQL/runtime proof pending.
Result: MERGED — production attestation outstanding.

Active item: Phase 4 - invoice MSSQL/compatibility contract inventory before live-code changes.
Evidence: src/services/invoiceService.js contains MSSQL-first invoice list/create/update and generic fallbacks. server.js mounts billing mutation guards rejecting generic and MSSQL compatibility writes; paymentService still references legacy create/update helpers. Dashboard and utility-reading compatibility reads have consumers.
Scope: docs/PHASE4-INVOICE-CONTRACT-PARITY.md documents callers, guard semantics, read parity requirements, tenant authorization, write protection, atomicity/idempotency and test-first next slice.
Out of scope: runtime changes, invoice/payment state mutations, schema/DDL, authentication, live agreement/property operations.
Result: ACTIVE — documentation PR #219 pending exact-head CI/review.
Next item: bounded invoice mutation fail-closed contract tests and consumer audit, preserving governed billing lifecycle.
```

## Phase 4 invoice failure isolation — coordinated runtime batch

```text
PR #219: invoice MSSQL/compatibility contract review, documentation only.
PR-head CI: workflow #612 (run 37916538295) successful.
Merge SHA: 17b32f229514ce5ac2dc7d09c27cce8b3f0dd0e5.
Result: MERGED — documentation, no production database changes.

Active item: invoice fail-closed compatibility changes.
Problem: invoiceService.listInvoices silently retried on the generic platform transport after an MSSQL failure, even authorization/tenant errors. createInvoiceRecord and updateInvoiceRecord retried prohibited invoice writes after MSSQL errors, conflicting with dedicated billing lifecycle API guards.
Scope: on MSSQL list error return the original {data:null,error}; block legacy create/update exports with a 409 BILLING_LIFECYCLE_REQUIRED contract; preserve read compatibility when MSSQL mode is disabled and preserve dedicated billing/payment endpoints. Add CI tests for the contract and server-side mutation guards.
Out of scope: utility readings, dashboard data joins, invoice monetary calculations, agreement/billing schema, MSSQL writes and production migrations. Remaining compatibility read paths require explicit MSSQL parity and tenant-scoped tests.
Result: ACTIVE — branch phase-4-invoice-fail-closed-batch, exact-head CI and review pending.
Next: verify authorized invoice creation and payment work through /api/billing; then inventory each remaining read path for bounded contract migration. Production Azure Ready revision, exact serving SHA and MSSQL health remain separate release acceptance gates.
```

## Phase 4 invoice dashboard read-correctness batch

```text
PR #220: fail closed on invoice API failures and reject prohibited legacy invoice writes.
PR-head CI: workflow #614 (run 37916828117) succeeded.
Merge SHA: 4daeb053f871ae66fa5c6d46efac4ab1c5a53230.
Production: independent exact Ready revision, public serving SHA and MSSQL health not yet established.
Result: MERGED — production evidence pending.

Current active item: invoice dashboard summary completeness and pending-count consistency.
Evidence: getInvoiceSummaryByProperty formerly fetched only the first 1000 invoices per property and treated that truncated page as a complete financial total; getPropertiesWithPendingReadings reran one separate count query per property, showing zero if one failed.
Scope: page invoice summaries to completion through existing authorized listInvoices contract, propagate page errors rather than render partial totals, and count pending readings from the initial authorized result set. Add CI regression guards.
Limitations: utility_readings compatibility query remains and might itself require pagination or endpoint parity; this batch does not prove >1000 pending readings can be returned by the underlying compatibility API. Exact tenant and end-to-end browser behavior require further acceptance.
Out of scope: invoice creation, money/status mutations, tenant authorization policy, MSSQL schema or migration, utility calculations.
Result: ACTIVE — branch phase-4-invoice-dashboard-read-correctness, awaiting exact-head CI and review.
Next: confirm dashboard accuracy and tenant isolation; migrate utility reading data retrieval through an explicit scoped API contract in a separate bounded slice.
```

## Phase 4 pending utility-reading dashboard pagination — PR #222

```text
PR #221: invoice summary pagination/completeness and consistent pending-reading counts.
CI #616 (run 37938380079) passed; merge SHA 161f8d8a7dbbc5fc1f363e2517ba8cd3942b7fa6.
Production: operator confirmed green; independent exact Azure Ready revision, serving build SHA, MSSQL and browser tenant-fixture proof remain outstanding.
Result: MERGED — production attestation pending.

Active item: tenant-scoped pending utility-reading dashboard query correctness.
Problem/evidence: getPropertiesWithPendingReadings used nonexistent MSSQL utility_readings.property_id rather than propertyid; fetched an unpaginated list that could silently undercount. Dashboard catch logged errors without clearing stale pending data.
Scope: use the existing central platform query with tenant/property authorization, canonical propertyid, stable id-ordered pagination and bounded error handling; aggregate same authorized reading set; surface errors and clear stale UI data; expand CI regression checks.
Out of scope: new authority, dedicated utility-reading endpoints, invoice/payment writes, billing calculation changes, schema/DDL, auth changes.
Result: ACTIVE — branch phase-4-pending-readings-tenant-scoped-pagination awaiting CI/review.
Next: check exact-head CI, merge if green, verify deployment. Then audit remaining utility invoice generation/reporting read parity and browser tenant isolation with executable integration tests.
```

## Phase 4 utility-billing isolation contract tests — PR #223

```text
PR #222: corrected pending utility-reading propertyid schema, stable pagination and dashboard error handling.
PR-head CI: workflow #618 (run 37943041249) passed.
Merge SHA: f5a99a3166e367dc7361f72c037634d47df37eca.
Production: operator confirmed deployment green; Azure Ready revision, exact serving SHA, MSSQL and cross-tenant integration tests remain independently unverified.
Result: MERGED — formal production acceptance evidence pending.

Active item: utility-reading and monthly-billing tenant-isolation contract tests.
Scope: add runnable authorization tests verifying a rentee's utility-reading owner filter, rejection of unauthorized utility-reading updates, invoice/payment lifecycle mutation guards, and invariant contracts for tenant-scoped pending-reading pagination and monthly billing locking/linkage. Register in test:authorization.
Out of scope: live billing mutation/API behavior, database schema and grants, migrations, claim of end-to-end MSSQL multi-tenant acceptance.
Result: ACTIVE — branch phase-4-utility-billing-isolation-contract-tests pending CI.
Next: execute these tests, review CI, then add database-backed tenant A/tenant B integration proof in separate gated slice before retiring other live utility compatibility.
```

## Phase 4 two-tenant SQL Server billing acceptance — PR #224

```text
PR #223: utility-reading, invoice mutation and monthly billing isolation contract regressions.
CI #620 (run 37947974509) green; merge SHA f36e5c9d9d5a5d48968de1b4ce224388e23bfe67.
Result: MERGED — independent production Ready revision/SHA/MSSQL attestations outstanding.

Active item: disposable database-backed two-tenant monthly billing acceptance.
Scope: isolated Docker SQL Server database with two distinct tenants, rentees, properties,
active agreements and pending utility readings; run the REAL generateMonthlyInvoicesForTenant
code, verify one draft invoice per agreement/period, rent/utility totals, linked reading,
invoice components and lifecycle event. Assert tenant A cannot consume tenant B's readings
or create B invoices, wrong-tenant invoice retrieval is absent, repeat runs skip duplicates.
Run as a separate GitHub-hosted CI job on relevant PR paths and manually via
npm run test:billing:sqlserver. Disposable Docker fixture only; cleanup even on failure.
No production database credentials or DDL authority invoked.
Result: ACTIVE — branch phase-4-billing-two-tenant-sqlserver-acceptance, awaiting CI.
Remaining: full multi-tenant HTTP authorization and browser E2E, payment lifecycle integration,
Azure Ready revision/serving SHA and MSSQL runtime attestation. Do not mark Phase 4 closed
on source or fixture proof alone.
```

## Phase 4 authenticated HTTP tenant isolation — PR #225

```text
PR #224: disposable real SQL Server two-tenant monthly billing acceptance.
Exact PR-head CI #622 (run 37948822932) and SQL Server acceptance #1 (run 37948823099) passed.
Merge SHA: e7a338ac0102a58e46a7e8b6ee8bf86729a9b403.
Production: operator reported GREEN; independent Azure Ready serving revision, exact SHA and production MSSQL health pending.

Active item: authenticated HTTP-level tenant isolation on the existing disposable SQL Server fixture.
Scope: add real bearer sessions mapped to tenant-member rentees; run Express session, tenant context, platform query and MSSQL invoice routes on loopback. Validate valid tenant selection; foreign requested tenant rejected; anonymous query denied; forbidden cross-property reading returns empty; own reading accessible; cross-tenant invoice 404; direct invoice PUT 409 BILLING_LIFECYCLE_REQUIRED. Keep real SQL fixtures and lifecycle assertions intact. Include required permission bundle migration.
CI discovery: first HTTP SQL Server run #2 (37951992553) failed on legitimate same-tenant selection (403 TENANT_ACCESS_DENIED) because SQL Server UUID case differed from the client UUID header. Corrective scope: normalize UUID string casing solely for membership/legacy-tenant comparisons in src/api/tenant/context.js, preserving active membership verification and foreign-tenant denial; add uppercase-header regression in the disposable HTTP suite. No authorization widening beyond UUID textual equivalence.
Out of scope: production credentials, browser E2E, payment status changes, Azure deployment attestation.
Result: ACTIVE — branch phase-4-authenticated-http-tenant-isolation, pending disposable SQL and standard CI.
Next: gated CI verification, merge if successful, production attestation and browser-level tenant isolation.
```

## Phase 4 browser-protected billing boundary — PR #226

```text
PR #225: authenticated HTTP tenant-isolation and UUID normalization accepted.
PR-head CI #627 (37952454218), SQL Server + HTTP #5 (37952454277) passed.
Merge SHA: 4c28dae031d7824ea027d2b7173659c56eb021d3.
Production deployment reported GREEN by operator; independent Azure Ready revision,
exact external serving SHA and production MSSQL health remain outstanding.

Active browser slice: built frontend Puppeteer headless smoke, no credentials.
Verify protected admin invoice/utility and renter invoice/utility routes redirect
unauthenticated users to login/unauthorized, without rendering billing controls.
Run in dedicated GitHub-hosted CI; no production data or browser accounts.
Result: ACTIVE, PR #226 pending browser CI.
Not covered: authenticated two-tenant browser navigation, billing UI totals,
successful payment flows, production browser session, public build fingerprint.
Next: credentialed isolated-browser fixture and Azure production attestation.
```

## Phase 4 authenticated renter browser proof — PR #227

```text
PR #226: anonymous browser billing-route protection; CI #629 and browser acceptance #1 green.
Merge SHA: 5e4b22783d9ddbfff21b4ad098be78b1f2d1886a.
Production deployment reported GREEN by operator; independent serving Azure revision/SHA and production MSSQL health outstanding.

Active item: extend the disposable SQL Server billing/HTTP acceptance to mount the real
Vite React application behind the existing authenticated fixture API on localhost.
Use two independent real bearer sessions, start headless Chromium for each and validate
that renter utility history is accessible without login/unauthorized redirect or
cross-tenant property labels. No production traffic, browser credentials, or dev bypass.
This supplements existing real SQL invoice generation and HTTP cross-tenant assertions.
Result: ACTIVE — PR #227 requires SQL browser acceptance and regular build CI green.
Remaining: authenticated full invoice/UI arithmetic, tenant switching (multi-membership),
payment UI and production Azure/MSSQL attestations.
```

## Phase 4 renter invoice browser data acceptance — PR #228

```text
PR #227: authenticated renter utility-history browser against disposable SQL.
Standard CI #631 (run 37958320315) and SQL+browser #6 (run 37958320378) green.
Merge SHA 23f911bec1f411a6e3e8c4ecffd6eea1b8d99e61.
Production revision/serving SHA and MSSQL health independently unverified.

Active: extend two-tenant SQL-backed authenticated browser checks to /rentee/invoices.
Monthly generation correctly produces draft invoices; after verifying draft lifecycle,
the disposable fixture alone sets its two invoices to renter-visible pending state.
Check actual My Invoices page, each tenant's property label and numeric amount,
and absence of other tenant's property label. Preserve SQL and HTTP isolation checks.
No production billing mutation, schema migration or test credential outside Docker fixture.
Result: PR #228 requires standard CI and real disposable SQL+browser acceptance.
Remaining: account/payment interaction and actual multi-membership tenant switching,
Azure external build SHA, Ready revision and production MSSQL runtime attestation.
```

## Phase 4 renter invoice browser data acceptance — PR #228

```text
PR #227: authenticated renter utility-history browser acceptance merged as
SHA 23f911bec1f411a6e3e8c4ecffd6eea1b8d99e61.

PR #228: exact-head build CI #634 (run 38216343608), disposable two-tenant
SQL Server browser acceptance #9 (run 38216343572), and protected browser
smoke #3 (run 38216343500) all passed at head
bcb49a1fd5550f3df3babf4812920f60b194d7ef.
Merge SHA: 82b439e0d9b0dae93a24c38c17f7f0d58710b556.
Result: MERGED — two different authenticated renters see their own invoice
property label and amount, while prior tenant-scoped SQL/HTTP assertions remain.
Production Azure Ready revision, exact external serving SHA and live MSSQL
health remain unverified, so deployment acceptance and Phase 4 closure remain open.

ACTIVE next item: disposable authenticated renter invoice-account/payment
read and non-mutating browser interaction acceptance. Verify tenant A/B own
invoice account/receipt view, outstanding arithmetic and foreign invoice
denial through existing dedicated billing routes. Preserve blocked direct
invoice writes; do not submit payment proofs, create payments, change
invoice status, access production credentials, or change production SQL.
Follow with actual multi-membership tenant switching and production
Azure/MSSQL attestation in separately gated slices.
```

## Phase 4 renter account/receipt read acceptance — PR #229

```text
PR #229: added disposable SQL Server + authenticated Chromium tests for
renter invoice account, verified and pending payments, outstanding balances,
receipt visibility, foreign-invoice denial, anonymous denial and read-only
browser interaction. No production payment mutations.
Exact PR-head b2b8e1d416d6bed5c7734ae0e863b12980a5c8a1:
build/authorization CI run 38222696044 GREEN;
disposable SQL+browser acceptance run 38222696018 GREEN.
Merge SHA: e9288cef802f4b82db57f93a2c635eab7320a40d.
Result: MERGED — production Ready revision/public exact serving SHA/MSSQL
health still require independent verification.

ACTIVE next item: authenticated multi-membership tenant switching in
disposable SQL/browser acceptance. Use one global app user with two
active tenant memberships and separate tenant-owned invoices/properties.
Prove switch A -> B -> A changes scoped browser invoice and account/receipt
data, preserves single global identity, rejects unentitled tenant selection,
and prevents stale cross-tenant data in a mounted browser session.
No production account changes, migrations, writes or privilege widening.
Follow with production release attestation and Phase 4 closure review.
```

## Phase 4 authenticated multi-membership switching — PR #230

```text
PR #230: accepted a single global renter identity with two active tenant
memberships, A -> B -> A browser switching, invoices, payments, receipts,
foreign-tenant denial and stale-view isolation. Profile resolution now uses
the authenticated server context, not a different tenant's app-user row.
Exact-head build/authorization run 38225084235 GREEN and disposable
SQL Server + browser run 38225084192 GREEN at
8f31c5dc2d39016a686f0d05f8f3e3db7e68bab2.
Merge SHA: e7f3b9aaa1d3cd04a5b2f8b8a87491a9eeecd154.
Production run 38225640159 SUCCESS: latest Azure revision 0000233
Ready, public build-info SHA exactly e7f3b9aaa1d3cd04a5b2f8b8a87491a9eeecd154,
live /api/mssql/health returned ok:true, connection:ready, and
runtime/startup configuration checks passed.
Result: MERGED + PRODUCTION ATTESTED for this exact SHA. This evidence
does not retrospectively prove each earlier historical serving revision.

ACTIVE next item: migrate just the renter invoice list read from the
generic platform-client query to an explicit tenant-scoped billing GET.
The server derives the current renter from the authenticated global
identity and the active tenant from a verified membership, hides drafts,
preserves property label/amount presentation, and fails closed.
Continue to use the dedicated invoice-account/receipt lifecycle API.
Run anonymous/foreign-user/other-tenant, same-tenant other-renter,
draft-hiding and A -> B -> A disposable SQL + real-browser acceptance.
Do not alter payment writes, invoice generation, status transitions,
schema, production credentials or cross-domain compatibility operations.
PR/CI/production proof are still required before declaring this slice done.
```

## Phase 4 dedicated renter invoice list — PR #231

```text
PR #231 migrated only the renter invoice listing screen to
GET /api/billing/rentee/invoices, with authenticated server-owned renter
identity, verified active tenant membership, status=draft exclusion, and
tenant-scoped property labels. Invoice account/receipts retain their
existing dedicated lifecycle read contract. No payment writes or DDL.
Earlier compatibility-source assertion was updated to enforce this new
explicit billing contract.

Exact PR-head e378af819d766da9be37a587a60a38c5df7fd4f6:
standard build/authorization run 38227354564 GREEN;
disposable SQL Server + authenticated two-tenant/browser acceptance
run 38227354696 GREEN; protected browser smoke run 38227354749 GREEN.
Merge SHA: d24041af61e23f15edfd31e17e2a7b1c2c5db1b4.
Status: MERGED. Production serving revision, exact external fingerprint,
runtime configuration and live MSSQL health for this change PENDING.
Do not claim deployment attested solely from PR-head CI.

ACTIVE release gate: verify a post-merge production workflow reports its
latest Azure revision Ready, exact deployed main-commit SHA publicly served,
and live MSSQL connection Ready. Only then accept this slice.

NEXT bounded Phase 4 task (not yet active until release gate passes):
inventory one remaining compatibility-domain operation and prove
MSSQL API authority/contract parity before changing application runtime.
Prioritize remaining agreement-template or invoice-management read path,
and keep core billing/payment mutations strictly under lifecycle APIs.
Phase 4 as a whole remains OPEN until the wider canonical inventory is
discharged, regardless of this one successful invoice-list migration.
```

## Phase 4 agreement-template authoritative transport hardening

```text
ACTIVE bounded slice (proposal): when MSSQL mode is enabled, agreement-template
get/list/create/update/delete must treat the scoped MSSQL API as authoritative.
403/401/409/5xx must not trigger platformClient table fallback. For unchanged
UI behavior, missing/schema-unavailable get returns null, list returns [];
schema-unavailable mutations fail with a descriptive error; every other
MSSQL error propagates to the caller. The compatibility table path remains
available only when MSSQL mode is explicitly disabled.

Risk and acceptance: no widening of privileges, no new database migration,
no agreement-signing changes, no write retries. Regression tests exercise
actual five service function bodies under unsuccessful and successful MSSQL
requests, assert no generic-table calls after authoritative failure, and
retain the prior non-MSSQL path behavior. Exact-head CI, merge and production
Azure Ready/SHA/MSSQL verification are required before recording completion.

Next after this slice: inventory live agreement-template endpoints and
remaining agreement/property compatibility operations and select one
bounded contract-first migration. Phase 4 remains OPEN.
```

## Phase 4 authoritative agreement DELETE (bounded follow-on)

```text
PR #232: agreement-template get/list/create/update/delete fail closed when
MSSQL mode is enabled. Exact-head test/build workflow 38230100641 GREEN.
Merge SHA 6558e9410889b20527cbbb9fae4811506029c759.
Production merge-SHA workflow 38230264800 must independently confirm
Azure latest Ready revision/public exact SHA/MSSQL health; do not
declare production release accepted while this workflow is running.

ACTIVE independent slice: fail closed only deleteAgreement() when the
authoritative DELETE /api/mssql/agreements/:id fails. It must never
retry against platformClient table deletion after 401/403/404/409/5xx.
Legacy compatibility deletion remains available solely with MSSQL
explicitly disabled. No agreement schema/migration, signing-state,
cancellation workflow, permission broadening or production data writes.
Contract tests exercise actual service implementation and one-delete
semantics, including API success/failure and disabled-MSSQL behavior.

Follow-up: finish authoritative transport/route inventory and verify
agreement create/sign/updates and external signatures separately.
Phase 4 remains OPEN. This delete hardening is not proof of overall
agreement lifecycle parity.
```

## Phase 4 authoritative agreement creation — next bounded gate

```text
PR #233 agreement DELETE fail-closed: authorization/build workflow 38230968660
passed on head 274a14640c1abed2ccfac18e9a71ba28071d7a78;
merged as e5d68d6d8f166f4e6fb1a14f1c658233c7efd79f.
Production workflow 38231239449 succeeded: Azure revision 0000236 Ready,
public exact SHA e5d68d6d8f166f4e6fb1a14f1c658233c7efd79f served,
live /api/mssql/health connection ready and startup/browser runtime valid.

ACTIVE bounded change: saveAgreement new-record creation must execute a
single authoritative POST /api/mssql/agreements when MSSQL mode is enabled.
After a failed, ambiguous or empty success response, never retry the same
creation through platformClient agreement upsert. Existing agreement updates,
Evia signing and document-generation behavior remain separately governed and
unchanged. Explicit disabled-MSSQL mode retains the legacy creation path.
Tests exercise the real service saveAgreement body with injectable transports,
including success, 401/403/404/409/5xx, no result, legacy mode and unchanged
existing-agreement delegation. No schema, auth, billing or production-data
changes. CI/merge/production release gates still required.

NEXT: contract-first review and individual hardening of agreement updates
and signature transitions, preserving Evia webhook authority and refusing
secondary side effects after ambiguous MSSQL writes. Do not batch these
with the new-agreement-creation slice. Phase 4 remains OPEN.
```

## Phase 4 authoritative agreement update — bounded follow-on

```text
PR #234 new-agreement single-write acceptance: CI run 38232900230
GREEN at exact head 1b4cd2e572a5f48081ffbd83ea083e82c6ec19d1.
Merge SHA: 4d90f378ce5d3f1fc1adeaf7af6757d3f0bbd0f5.
Production workflow 38233055711 is a separate pending release gate:
Ready Azure revision, exact public SHA and live MSSQL connection must pass
before release acceptance.

ACTIVE independent update slice: when MSSQL mode is enabled, the existing
agreement updater must use one authoritative PUT /api/mssql/agreements/:id.
Any 401/403/404/409/500/503 or ambiguous result must not trigger a secondary
platformClient update. Retain generic table path only with MSSQL explicitly
disabled. All template, signing/webhook, invoice, document and tenant roles
remain untouched; no real agreement records are mutated in acceptance.
Exact service-body regression covers success, failures, empty result and
disabled-MSSQL compatibility.

NEXT: inspect Evia signing and property/unit status side effects as a
separate contract-authority slice. Do not claim signing complete or
remove a fallback before separately proving webhook lifecycle invariants.
Phase 4 remains OPEN.
```

## Phase 4 manual signing authority — single transport, no fallback

```text
PR #235 (agreement update fail-closed): exact-head CI run 38233284859
GREEN at 057faa50c3095e88450de490a36015b245167e64;
merged as 3a1c0ea5e48e8dbef873352b8ceb7a261d72c86e.
Its separate production workflow 38234629958 must prove Ready revision,
exact public commit SHA and live MSSQL connectivity; PR CI is not
production attestation.

ACTIVE isolated manual-signing slice: AgreementDetails invokes
markAgreementAsSigned. Under MSSQL mode it must use only one
POST /api/mssql/agreements/:id/sign. On denial, conflict, failed or
ambiguous transport, no legacy updateAgreementData, property status,
unit status or renter association side effects are permitted. Existing
manual-sign server authority (admin guard) and tenant-bound SQL
transaction are unchanged; non-MSSQL compatibility mode retains its
existing behavior. Source-contract and injected service-body tests
prove fail-closed HTTP 401/403/404/409/500/503 outcomes and absent
secondary side effects. No live sign requests or database mutations
are performed by this acceptance.

IMPORTANT: manual admin signing is NOT Evia webhook completion.
Evia's authenticated callback signature checks, completed-document
retention, webhook event de-duplication and terminal state changes
remain untouched and require their own separate review/acceptance.
Never conflate these authorities or grant signing privilege via this PR.

Next: assess whether manual sign should be available for
Evia-managed agreements, and prove server-side signing state
preconditions, replay/idempotency and side-effect invariants against
a disposable SQL Server fixture. Do not change webhook authority or
statuses as an incidental consequence of fail-closed hardening.
Phase 4 remains OPEN.
```

## Phase 4 server-authoritative manual-signing transitions — next active slice

```text
PR #236: the client now fails closed after an authoritative manual sign
API failure, without secondary agreement/property/unit/renter updates.
Exact-head CI run 38234889222 GREEN at
570f65f5a17e39d5d99b41e2646c22114a253a77;
merged SHA 7bb36019c2a4360cdf26d0777b047a1b9d62156c.
Production run 38235488928 SUCCESS: Azure revision 0000239
Ready, public exact deployed SHA 7bb36019c2a4360cdf26d0777b047a1b9d62156c,
live /api/mssql/health MSSQL connection ready and browser runtime config OK.

ACTIVE bounded change: the server-side manual admin sign transaction must
lock its tenant-scoped agreement before evaluating eligibility. Manual sign
is allowed only from canonical pending/pending_signature states and only
when no Evia request/document/signature flow owns the agreement. Repeated
manual sign of an already-signed non-Evia record is a read-only success:
no signeddate rewrite or property/unit/renter association replay.
Foreign tenant returns 404, invalid or terminal state and Evia-managed
records return explicit 409. SQL transaction protects agreement status
and all related property, unit and renter-association updates; a failure
of any related update rolls the agreement state back. UI sign action
uses the same central eligibility predicate. No migrations, credential
changes, billing mutations or Evia webhook behavior changes.

PROOF GATES: pure state-policy tests; real disposable SQL Server tests for
tenant A/B isolation, rejected states, Evia guards, rollback by induced
property-update failure, replay and concurrent requests. Require exact PR
head build/authorization + disposable SQL acceptance GREEN before merge;
production Ready revision/public exact SHA/live MSSQL separately required.

RISK / NEXT: the transactional manual-sign route is distinct from Evia
webhook completion and retained-document authority. Later slices must
review Evia webhook idempotency and manual-versus-Evia authority policies
independently, as well as the legacy global app_users tenant_id versus
multi-membership renter assignment concern. Phase 4 remains OPEN.
```

## Phase 4 Evia processed-delivery replay gate

```text
PR #237: tenant-locked manual signing state guards, Evia exclusion,
transactional property/unit/user updates, read-only replay and concurrent
SQL signing proof. CI build/authorization run 38237086761 GREEN;
disposable two-tenant SQL Server acceptance run 38237086698 GREEN;
renter SQL workflow run 38237086598 GREEN at exact head
847cbefefe88441d0c9b89d72b56cecceb9648f2.
Merge SHA b067a873d68f51e97cbf7deba324a95d5329c91a.
Production workflow 38237267065 SUCCESS: latest Azure revision 0000240
Ready, public exact build SHA b067a873d68f51e97cbf7deba324a95d5329c91a
and live MSSQL health connection ready.

ACTIVE bounded Evia webhook slice: after authenticated HMAC/callback-token
verification and tenant/RequestId-bound agreement resolution, check existing
processed deliveryId before recording another webhook event or mutating
signatory/completion state. Same tenant+request+deliveryId with processed=1
is a read-only acknowledgement for non-completion events; completed
agreements are read-only duplicates ONLY when signed status, completed
signature status and locally retained signed document are present.
A previously processed completion missing its retained local document
must still be retryable for document retrieval. No deliveryId or unprocessed
events remain retryable. Tests cover pure duplicate policy and actual
disposable SQL Server idempotency, tenant isolation, event count and
timestamp preservation. Authentication/verification remains unchanged.

LIMITATION / follow-on: this slice suppresses SEQUENTIAL processed
re-delivery. It does not create a uniqueness lock for simultaneous
unprocessed deliveries or change out-of-order terminal state authority.
Plan independent concurrency/idempotent terminal transition review and
document-retention recovery proof after this slice. No production webhook
replay, external Evia requests, migrations, SQL modifications or document
writes are executed for acceptance.
```

## Phase 4 concurrent Evia delivery claim — bounded follow-on

```text
PR #238: sequential processed webhook delivery replays were guarded
before event insertion and signatory/terminal state mutations, preserving
signed-document recovery. Exact PR-head webhook suite 38238773743,
build/authorization 38238773538, and isolated two-tenant SQL Server
38238773516 all GREEN; merge SHA f86731f89c0774f808569c521842748232a83e37.
Production release 38238945271 SUCCESS: Azure revision 0000241 Ready,
public exact SHA f86731f89c0774f808569c521842748232a83e37 and live MSSQL
connection Ready. Evia webhook security setup 38238945145 SUCCESS.

ACTIVE bounded follow-on: concurrent callbacks with the same
tenant_id/request_id/deliveryId must acquire one atomic SQL Server
application-lock-protected event claim before any signatory/status/document
side effects. A second in-flight delivery receives retryable 503, not
a false processed acknowledgement. Successful processing marks the claimed
existing webhook event processed, so later replays are read-only.
An abandoned unprocessed event may be reclaimed only after a 15-minute
lease; the claim is renewed atomically without appending another event.
Use the existing webhook_events table and transactional sp_getapplock;
no migration or release-time DDL required. Missing deliveryId events
retain legacy processing semantics, explicitly OUTSIDE this guarantee.
Processed completion missing an archived signed document retains a
recoverable retry path, including guarding concurrent recovery attempts.

PROOF: dedicated webhook unit/source contracts and disposable Docker SQL
Server two-tenant concurrent Promise.all claims, single event insertion,
retryable in-flight state, processed replay, stale-event takeover and
cross-tenant independence. Production callbacks/agreements and external
Evia documents are not modified by acceptance.

LIMITATION: bounded leases do not prevent concurrent effects if an active
worker exceeds the lease without renewing it. This slice does not alter
out-of-order terminal authority, signed-document archival idempotency, or
legacy deliveries missing a deliveryId. Those need separate production-safe
proofs and policy review before Phase 4 closure.
CI exact-head build/authorization, dedicated Evia suite and SQL+browser
acceptance must be green before merge; then Azure Ready/public SHA/live
MSSQL attestation must pass. Phase 4 remains OPEN.
```

## Phase 4 Evia terminal order and completion protection — bounded slice

```text
PR #239: concurrent Evia delivery claims serialized by SQL application
locks for tenant/request/delivery with retryable in-flight response,
processed replay, and stale lease recovery. Exact-head Evia webhook
test run 38240567886 GREEN, build/authorization run 38240567884 GREEN,
and disposable two-tenant SQL Server run 38240568071 GREEN.
Merge SHA ce1ea66d694acde96a20277a9868ad4dcbdbd74f.
Production run 38240778054 SUCCESS: Azure revision 0000242 Ready,
exact public serving SHA ce1ea66d694acde96a20277a9868ad4dcbdbd74f
and live MSSQL connection ready; webhook security setup run 38240778082
also GREEN.

ACTIVE bounded Evia terminal-order slice: authenticated, scoped Evia
cancellation/rejection/completion deliveries must not reverse previously
finalized signed/completed or cancelled/rejected agreement states.
Previously finalized state makes a delayed conflicting event an
audited, processed, read-only acknowledgement. An already signed
agreement with a missing locally retained signed document may still
handle a completion callback for document recovery; signed timestamps
remain preserved. A stale signatory-completed callback must not turn
completed signature_status back into in_progress. SQL UPDATE must use a
live-state predicate and OUTPUT check, not only a stale JS read, to
prevent a concurrent terminal winner from being overwritten.
Keep existing HMAC/callback verification and tenant/request scoping.
No schema/migration, production webhook injections, payment or signing
state changes in tests. Real disposable two-tenant SQL Server proof
covers signed -> late rejected/cancelled/signer, cancelled -> late
completed, valid pending -> rejected -> late completed, audit rows,
timestamps, signed document and tenant isolation.

IMPORTANT: This policy applies a first-terminal-event-wins model,
except for completed-PDF recovery. It does not fully serialize
different delivery IDs or enforce ordering by provider eventTime.
A concurrent completion may archive a document before losing the
conditional final-state update. Document archival coordination,
inconsistent terminal repairs and long-running claim heartbeat
remain independent follow-ups. Do not claim Phase 4 closed.
Required merge gates: exact head build/authorization, dedicated
Evia webhook tests, and real disposable SQL Server acceptance.
Production Azure Ready/public SHA/MSSQL verification is separate.
```

## Phase 4 cross-delivery Evia signed-document archive coordination

```text
PR #240 terminal-order policy: exact-head Evia webhook test run 38256428300,
build/authorization run 38256428016 and disposable two-tenant SQL run
38256428035 all GREEN. Merge SHA 73edebb0c6df27b7daf06ffa46bb226cc12fe819.
Production workflow 38256654156 SUCCESS: Azure revision 0000243 Ready,
public SHA 73edebb0c6df27b7daf06ffa46bb226cc12fe819 exact,
MSSQL live connection Ready; Evia security run 38256654188 GREEN.

ACTIVE bounded slice: when two Evia completion deliveries with DIFFERENT
deliveryIds reference the same tenant-bound agreement without an archived
signed document, obtain a SQL Server transaction-owned exclusive
application lock keyed by tenantId+agreementId BEFORE external Evia document
retrieval or storage. Re-read the tenant/request-scoped current agreement
while the lock is held. Keep the lock through the final guarded completion
SQL update and processed-webhook event update; second worker must not
archive again if the first has retained the local signed PDF.
If busy, return retryable 503, without acknowledging a completed delivery,
and expire this worker's own pending delivery claim for prompt retry.
A failed/aborted archive always releases the SQL lock by transaction
rollback; no schema DDL, extra privileges, role changes, production SQL
or live callbacks are involved in acceptance.

PROOF: dedicated source contract tests and disposable SQL Server proof
of two same-agreement different-delivery concurrent closures, one winner,
retryable 503 contender, fresh agreement URL visible on subsequent retry,
foreign-tenant/request denial and lock release after exceptions.
Remaining risks: SQL application transaction/connection held during external
document download/upload; long-running archive can consume connection pool
capacity. Distinct delivery IDs still have independent webhook event rows.
Out-of-order callback state is separately guarded by PR #240 and remains
subject to conditional SQL updates. The 15-minute delivery lease and
legacy callback without deliveryId are unchanged. Production monitoring
of connection-pool pressure and retry counts is a follow-up.
Exact-head CI build/authorization, Evia tests and disposable SQL+browser
must be green before merge; production release verification remains separate.
Phase 4 remains OPEN.
```

## Phase 4 Evia archive capacity and pool backpressure — active bounded slice

```text
PR #241: agreement-scoped SQL application lock coordinates signed-document
archive of distinct delivery IDs through the final agreement URL/status
update. Exact-head build/authorization run 38293584003 GREEN, dedicated
Evia suite run 38293584029 GREEN, disposable two-tenant SQL Server run
38293584201 GREEN; merged SHA 1e7baa0d5917ea037cb40855299d7564d43a2986.
Production workflow 38293781215 SUCCESS: Azure latest revision 0000244
Ready, public exact build SHA 1e7baa0d5917ea037cb40855299d7564d43a2986,
live MSSQL health connection ready. Evia security 38293781229 SUCCESS.

ACTIVE bounded follow-on: admission-limit simultaneous Evia PDF archiving
operations per application replica BEFORE holding a SQL transaction-owned
agreement archival lock across slow external PDF operations. Default limit
2; EVIA_ARCHIVE_MAX_CONCURRENT permits an explicit positive-integer tuning
value, capped to configured MSSQL_POOL_MAX - 2 where pool capacity permits,
so concurrent billing, authorization and callback SQL reads retain room.
Saturation returns HTTP 503 (EVIA_ARCHIVE_CAPACITY_EXCEEDED), does not
attempt SQL lock acquisition, and makes this delivery's unprocessed
webhook-event claim immediately retryable just like existing lock contention.
Finally clauses release admission slots after success or failure; duration,
capacity rejection, and >=30-second slow archives are logged without user
data. Cross-replica transaction-owned SQL locking remains authoritative.

ACCEPTANCE: dedicated Evia tests cover limit configuration, concurrent
admissions, 503 under pressure, success/failure slot release, and webhook
retry policy. Disposable SQL Server acceptance checks a held archive and
over-capacity denial cannot exhaust an additional pool connection, that
other SQL queries can still proceed, and that a retry works after release.
No DB DDL, live webhook injection, credential change, billing mutation or
production signed-document operation in these tests.

LIMITATIONS / NEXT: admission control is per Node replica rather than a
global distributed queue. The SQL transaction still remains open during
external PDF retrieval and R2 upload; it must not be timed out independently
of the ongoing upload because that would lose fencing. Investigate durable
short-transaction archive leases and immutable staged paths in a future
separate design slice, plus connection pool/load soak evidence. A fixed
15-minute per-delivery retry lease, legacy payloads lacking deliveryId,
and document retention/recovery authority remain separately governed.
Require exact-head build/authorization, Evia and SQL acceptance green
before merge, then production Azure Ready/public exact SHA/MSSQL proof.
Phase 4 remains OPEN.
```

## Phase 4 Evia immutable archive staging precondition — bounded preparation

```text
PR #242 archive pool backpressure: exact-head build/authorization
workflow 38310719490 GREEN, dedicated Evia workflow 38310719400 GREEN,
and disposable two-tenant SQL Server workflow 38310719452 GREEN.
Merged as 1c70123204f89047dbf66faa20120db43165cfe4.
Production workflow 38310894009 SUCCESS: latest Azure revision 0000245
Ready, public exact serving SHA 1c70123204f89047dbf66faa20120db43165cfe4,
live MSSQL connection ready, Evia security configuration 38310894013 GREEN.
Archive admission default of two per replica is now production-accepted.

ACTIVE bounded preparation (non-runtime): support optional immutable,
attempt-scoped staging paths for both completed Evia inline webhook PDFs
and Evia API-retrieved signed PDFs and audit trails. Each attempt is
identified by a fresh opaque UUID; one attempt stages under
tenants/{tenant}/agreements/{agreement}/signed/staged/{attempt}/{file}.
Identifiers are validated and the public URL shape remains storage-relative.
When no archive attempt is specified, previous production document paths,
uploads and returned URLs MUST stay exactly unchanged. The live webhook
continues using existing cross-replica SQL application lock and existing
per-replica admission guard; staged paths are NOT yet activated in runtime.
No SQL migration, new secrets, webhook authority or production files are
changed by this preparatory slice.

Proof: unit tests for two distinct attempts staging same named PDF and
audit trail without collision, successful API download staging, invalid
identifiers, backward-compatible default paths and unchanged webhook
locking. DESIGN ONLY protocol and future fences are documented in
docs/EVIA-ARCHIVE-LEASE-DESIGN.md. Exact-head build/authorization,
dedicated Evia tests and disposable SQL/browser acceptance must be green
before merge, followed by exact merge-SHA production release evidence.

NEXT AFTER ACCEPTANCE: implement a durable, tenant-scoped, fenced archive
lease with short claim/commit transactions, a live lease-token check
at promotion, worker crash takeover, and safe staged-object cleanup
policy. Until all these pass real two-tenant SQL race proofs, retain
the existing long-held SQL lock and archive capacity limit. Phase 4
remains OPEN and legacy compatible clients remain to be audited.
```

## Phase 4 fenced Evia archive lease core — dormant SQL acceptance

```text
PR #243 immutable stage contract: exact-head build/authorization run
38312502397 GREEN, Evia suite 38312502354 GREEN, disposable two-tenant
SQL acceptance 38312502346 GREEN at 92c7c55e2e85b2e992f2b58477921d9e5542e112.
Merge SHA 6619404650d7b1d46ddaa1807c5d310a6935698a.
Production run 38312722143 SUCCESS: Azure latest revision 0000246 Ready,
public build SHA 6619404650d7b1d46ddaa1807c5d310a6935698a exact,
live /api/mssql/health connection ready, Evia security configuration
workflow 38312722223 green.

ACTIVE bounded follow-on: independently implement a DORMANT durable,
tenant-scoped and Evia request-scoped archive-lease module using reserved
webhook_events event_type 'evia.archive.lease.v1' (no schema change) and
a transaction-owned app lock held only during SQL claim/renew/finalize.
Each claim generates a fresh UUID attempt token and uses the SQL Server
clock + updatedat for 15-minute expiry. A new worker may reclaim an
expired token; stale workers must fail renewal and final publication.
Final publication accepts only the current attempt's immutable signed
PDF staging URL and verifies live tenant, Evia request and terminal
agreement guards before atomically updating signed URL/status and
marking the reserved lease event processed. Missing/other-tenant
agreements fail closed. Existing signed document wins without another
upload. SQL rollback must restore agreement and lease on failure.

Critically, this slice IS NOT A LIVE WEBHOOK SWITCH. Existing Evia HMAC,
delivery claims/events, manual signing, cross-replica archiveLock.js,
archiveCapacity.js, document storage and callback completion workflow
remain unchanged. Disposable Docker SQL Server acceptance must prove
two concurrent claims, tenant isolation, expiry takeover, stale-token
fencing, disjoint stage paths, one winning URL, stable replay, and
transactional rollback. Unit tests validate stage URL and IDs. No
production SQL DDL or live PDF writes; exact-head CI gates before merge
and separate Ready/public SHA/MSSQL attestation afterwards.

NEXT: integrated short-transaction lease + verified callback + immutable
storage and signatory/audit status consistency, long-operation heartbeat,
crash and post-commit recovery, orphan cleanup. Review remaining live
compatibility-client removals before Phase 4 closure. The dormant core
alone DOES NOT satisfy migration or production runtime safety.
```

## Phase 4 dormant Evia fenced staging orchestration — bounded slice

```text
PR #244 dormant SQL archive lease core: build/authorization workflow
38314351787 GREEN, dedicated Evia tests 38314351775 GREEN, disposable
two-tenant SQL acceptance 38314351778 GREEN at exact-head SHA
8c55b032372dd387b77f1d93ebe2facf1b52dc6f. Merged SHA
e4a264b028b5b9dfc80fa63018bbc5683c642d18.
Production release workflow 38314498863 SUCCESS: Azure revision
0000247 Ready, public exact serving SHA
e4a264b028b5b9dfc80fa63018bbc5683c642d18, MSSQL live connection
ready. Evia main-branch tests 38314498940 GREEN and Evia security
workflow 38314499101 GREEN. The lease module is deployed but DORMANT.

ACTIVE bounded change: prepare an independent, unreferenced Evia
archiveCoordinator.js composing acquire/renew/finalize lease operations.
An attempt holding a fresh fenced UUID uses that EXACT token as the
immutable PDF and audit staging path. Both verified inline-document
storage and authenticated Evia API fallback are supported. Heartbeat
renews during slow external work; failed ownership renewal aborts
cooperative staging and always prevents final SQL publication even if
a storage driver ignores cancellation. After uploads, drain the
heartbeat and renew once again before SQL publication. No signed PDF
means fail closed. Busy claim returns retryable; already complete is
read only. Verified tenant/agreement/request identity cannot be
overridden by retrieval options.

Acceptance: dedicated Evia tests for busy/complete, controlled slow
staging and heartbeat, expired-owner fencing, failure/no-signed-PDF,
inline/API fallback, attempt token continuity and unchanged live
webhook. Real disposable two-tenant SQL test with blocked mock
external upload proves another worker returns busy, SQL remains
queryable, final publication is owner-fenced with immutable signed
PDF and audit pair, completion replay is read-only and foreign
tenant cannot publish.

IMPORTANT: this is STILL NOT A LIVE CALLBACK SWITCH. Actual webhook
HMAC/callback-token authorization, signatory metadata and provider
delivery-event bookkeeping are unchanged. Existing live archiveLock
and archiveCapacity remain authoritative. Before any live activation,
verify event audit, signatory completion, long-work expiry/cancellation,
post-commit acknowledgement, staged cleanup and real two-tenant
storage race recovery. No production SQL DDL, callback replay,
agreement mutation, billing write or external PDF upload in
acceptance. Require exact PR-head build/authorization, Evia tests
and disposable SQL/browser green before merge, followed by separate
Azure Ready/exact SHA/MSSQL release proof. Phase 4 remains OPEN.
```

## Phase 4 dormant verified Evia delivery accounting and HTTP recovery

```text
PR #245 dormant fenced staging coordinator exact-head acceptance:
build and authorization #38316076456 GREEN, Evia test #38316076503
GREEN, disposable two-tenant SQL Server acceptance #38316076476
GREEN, head 1fe5572ea22410ef007a7e5ca2dc7e354913b8b8.
Merged SHA b85e93a2f789d9e77104654c69c2e63a04f3b756.
Production deploy #38316295570 SUCCESS: Azure ready revision 0000248,
public exact serving SHA b85e93a2f789d9e77104654c69c2e63a04f3b756,
live MSSQL connection ready. Main-branch Evia tests #38316295555
and security configuration #38316295567 GREEN.

ACTIVE bounded follow-on: extend only the DORMANT Evia archive lease
and coordinator to optionally accept a verified, tenant/request-scoped
webhook_events completion event ID. The winner atomically completes its
archive lease, signs the agreement, updates only its stored signer
metadata (existing signed-at dates preserved) and marks the verified
source delivery processed within ONE SQL transaction. Scoped event
must be completion and must not be the reserved lease row.
An authenticated new completion event delivered AFTER a successful
commit but failed HTTP reply can acknowledge the already-retained
signed agreement using a separate tenant/request/lease-processed
short transaction, WITHOUT another PDF upload or agreement timestamp
mutation. Already-processed replay is idempotent. Foreign tenant,
foreign request, non-completion, invalid event ID and pending
unpublished document all fail closed.

Disposable two-tenant SQL Server integration proofs cover atomic
source-event+lease+agreement completion, two signatories, preserved
historic dates, negative tenant/request and event-type cases,
new-delivery lost-HTTP-ack recovery, replay timestamp stability
and no false acknowledgement for unpublished PDF. Unit contract
tests cover signer metadata, coordinator delivery propagation and
live webhook disconnection. No schema DDL, live callback,
manual-signing/billing update or storage upload from tests.

Critical: this remains a DORMANT PREPARATION PR; the existing live
HMAC/callback-token handler, event logging, agreement archive SQL lock
and concurrency guard are unchanged. Before live activation prove
verified callback integration, signer completion parity, audit trail
discovery and safe orphan cleanup with crash/race SQL+storage tests.
Require exact-head build/authorization, Evia and disposable SQL/browser
green before merge; verify Azure Ready/exact public SHA/MSSQL after.
Phase 4 remains OPEN.
```

## Phase 4 default-off Evia fenced webhook canary — bounded gate

```text
PR #246 dormant verified delivery accounting exact-head acceptance:
build/authorization #38319730497 GREEN, Evia tests #38319730373
GREEN, disposable two-tenant SQL Server #38319730439 GREEN at
c4ed5df408bc901c6091e23a9e630cd23f7b128e. Merged SHA
652a4b61b19ba52750699f67836eaedabd08772f.
Production release #38319901574 SUCCESS: Azure revision 0000249
Ready, public serving exact SHA
652a4b61b19ba52750699f67836eaedabd08772f, live MSSQL connected.
Evia main tests #38319901573 and webhook security #38319901582 GREEN.
These accepted improvements remain DORMANT by default.

ACTIVE bounded gate: connect the verified Evia webhook processor to
the prepared short-transaction fenced lease coordinator behind an
EXPLICIT DEFAULT-OFF, PER-TENANT AND PER-AGREEMENT CANARY:
EVIA_FENCED_ARCHIVE_MODE='canary', plus UUID allowlists for both
EVIA_FENCED_ARCHIVE_CANARY_TENANTS and
EVIA_FENCED_ARCHIVE_CANARY_AGREEMENTS.
Only callback-token-verified tenant-and-agreement-bound completion
requests with a provider deliveryId, no recipient-specific signatory
details, no existing retained signed document, and no conflicting
terminal state can enter. HMAC-only (unscoped) and all non-canary
requests keep the existing verified callback implementation.
The canary routes an already-claimed verified delivery to SQL-fenced
agreement lease, immutable per-attempt signed PDF and audit trail,
ownership-checked renewal and atomic signer/event/pointer completion.
Missing either PDF or audit trail, busy lease, or failure returns
retryable 503, with the unprocessed provider event claim immediately
eligible for retry. Completed publication/recovery may return 200.
Capacity admission is retained; the old agreement SQL lock is not
mixed with the new canary path.

ACCEPTANCE: dedicated Evia unit tests prove off-by-default,
exact allowlist and cryptographic scoped route requirement, no
selection on nonterminal/partial/signer-specific events, claim
ordering, fail-closed document-pair requirement, and unchanged
legacy path. Disposable two-tenant SQL Server acceptance uses
verified-scope simulator and fake immutable object storage:
busy->retry, source provider claim, signed+audit publication,
lease+delivery processed, signer completion, read-only replay,
unchanged dates and denied foreign tenant. No live Evia provider
requests, production SQL schema, signed records or payment writes.

DO NOT ENABLE CANARY IN AZURE IN THIS SLICE. Operator review is
required after full callback-token end-to-end, delayed/crash
storage-race, audit-trail access and orphan stage cleanup proof.
The feature is a preparedness gate not blanket live migration.
Exact-head build/authorization, Evia and real disposable SQL/browser
CI must all be GREEN before merge; production acceptance separately
requires Azure Ready/exact public SHA/live MSSQL. Phase 4 OPEN.
```

## Phase 4 Evia expired-worker storage race and read-only orphan triage

```text
PR #247 default-off callback canary: exact-head build and authorization
workflow #38321632557 GREEN, dedicated Evia tests #38321632595 GREEN,
and disposable two-tenant SQL Server acceptance #38321632586 GREEN
on PR head a26066db4752b2c3890af3ce42ffa25c341713e0.
Merged SHA 945a556e99cae93b8782cd48812161bb3e3ffc71.
Main production workflow #38321788228 SUCCESS: Azure revision
0000250 Ready, public exact build SHA
945a556e99cae93b8782cd48812161bb3e3ffc71, live MSSQL health
connection ready; main Evia tests #38321788268 and webhook security
#38321788344 GREEN. The canary remains OFF by default and no
production allowlists were changed.

ACTIVE independent Phase 4 slice: require real disposable SQL Server
and mocked immutable storage proof for a stalled external upload
from worker A, SQL lease expiry and takeover by worker B, successful
signed PDF + audit publication by B, and delayed A upload completion.
B must be authoritative; A's renewed/finalized SQL attempt must be
rejected as EVIA_ARCHIVE_LEASE_FENCED. Both attempts' staged keys
must stay disjoint, B's signed/completion timestamps and audit URL
unchanged, A delivery pending until validated read-only HTTP-ack
recovery. Prove SQL queries can run while storage is blocked, tenant
isolation, and no automatic storage deletion.

Introduce read-only scoped staging-object triage to identify
potential orphan candidates for human review; never auto delete.
At least 30 days of observed age, valid tenant/agreement/attempt
path, matching authoritative lease and agreement snapshot, and
no winning PDF/audit reference or active matching attempt must
all be proven before calling it a *manual review candidate*.
Bad/missing metadata and younger files remain protected; all
results set mayDelete=false. Overwritten lease event history
is insufficient for safe automatic cleanup, so no purge API or
deletion job is authorized. No live Evia callback, production
storage, payment mutation, schema DDL or canary activation.

REQUIRED exact-head gates: build/authorization, Evia document tests,
disposable two-tenant SQL Server/browser proof; after green merge,
separate Azure revision Ready/public merge SHA/MSSQL acceptance.
Remain blocked on append-only orphan attempt history, audit-trail
access policy and actual authenticated HTTP crash-recovery proof
before any canary activation. Phase 4 remains OPEN.
```

## Phase 4 Evia fenced audit access and immutable attempt history

```text
PR #248 late-worker race and no-delete orphan triage: exact-head
build/authorization #38322894696 GREEN, Evia suite #38322894674
GREEN, disposable two-tenant SQL Server #38322894680 GREEN.
Merged SHA 866dd470d323e3240b57a72b2a4edca9aac33984.
Production workflow #38323031674 SUCCESS: Azure revision 0000251
Ready, public serving exact SHA 866dd470d323e3240b57a72b2a4edca9aac33984
and MSSQL live connection ready. Main Evia #38323031731 and
security configuration #38323031815 GREEN. Canary remains OFF.

ACTIVE independent slice: preserve durable evidence of EVERY newly
claimed archive attempt including takeover, using a reserved
evia.archive.attempt.v1 row INSERTED in the same short SQL transaction
as the existing mutable archive lease claim. Append an immutable
evia.archive.publication.v1 evidence row in the transaction publishing
the winning signed PDF + audit trail, processed provider delivery and
completed agreement. Restrict provider delivery lookup to exclude
all reserved archive internal event types. No new schema/table or
privilege; application-level append-only rows do not constitute
database-enforced WORM retention.

Audit-trail access: add fail-closed validation for staged
audit_trail.pdf objects on existing authenticated tenant storage
route, after tenant context resolution and before object download.
Require same-tenant active admin with agreements.manage and a
completed/signed agreement whose canonical local PDF and processed
Evia archive lease agree exactly with the requested staged audit URL
and attempt UUID. Ordinary signed PDF/legacy file routes remain
unchanged. Staff and rentees are denied pending explicit audit
disclosure policy review. Do not expose new public links.

Acceptance: dedicated Evia tests validate role+scope+lease-published
audit URL checks, malformed/foreign/unpublished/old attempt denial,
and guarded server route ordering. Disposable SQL acceptance proves
A's claim remains in immutable history after B takes over, only B
publishes, publication evidence and authoritative URLs agree,
provider delivery event remains separate, and canary's expected
new history cardinality is preserved.

No production canary environment changes, new SQL migration,
actual Evia callbacks, payment/tenant agreement writes, or storage
deletion. Require exact PR-head build/authorization, Evia and
disposable SQL/browser CI GREEN before merge, then release Ready,
public exact SHA and live MSSQL proof. Security follow-ups:
real signed-in download HTTP acceptance, broader historic audit
policy and tenant storage deletion privilege review. Phase 4 OPEN.
```

## Phase 4 Evia staged archive evidence retention — bounded follow-on

PR #249 merged as `232b70403d570986e5c2a06479ee77687090e54b`.
Production run #38324419524 SUCCESS, Azure revision 0000252 Ready,
public build exact merge SHA and live MSSQL connected. The audit access
and attempt/publication records are released; the default-off canary remains OFF.

ACTIVE independent retention guard: prevent the general documents storage
API from deleting a documents bucket, fenced Evia staged agreement records,
or ancestor folders that could recursively erase those records. Enforce at
both local and R2 storage drivers, not only the tenant router; retain unrelated
object behavior. No cleanup, schema change, production canary activation,
external Evia callback, or new delete authority. Add fail-closed tests to
the authorization suite. This guard is an interim safeguard, NOT a complete
retention/immutability or object-lock policy. Alternate R2 credentials and
privileged administrators remain outside this application-level protection.

Next acceptance gate: exact PR-head authorization/build, Evia and disposable
SQL/browser CI, followed by independently verified production revision,
public SHA and MSSQL. Separate pending work remains: authenticated cookie/
bearer audit download HTTP acceptance, historic audit naming/disclosure,
crash recovery, and wider deletion-authority inventory. Phase 4 OPEN.

## Phase 4 Evia authenticated audit-download HTTP acceptance

PR #250 merge `37258033ba8e80e4392be99e26dc0e8ee5f5a927` is production-accepted:
workflow #38330107457 SUCCESS, Azure revision 0000253 Ready, exact public
merge SHA and live MSSQL ready. The archive canary remains OFF.

ACTIVE bounded testability/HTTP slice: mount the production storage delivery
middleware chain through one shared Express router. The default dependencies
remain SQL-backed bearer/cookie session authentication, tenant middleware,
lease publication validation, and real storage. Test-only injection permits
isolated HTTP requests with synthetic sessions, tenants, publication snapshots
and fake object bytes, proving 401/403 before storage and successful
cookie/bearer delivery. No real identities, provider calls, database writes,
storage deletes, canary environment changes, or altered authorization policy.
The synthetic credential middleware in this acceptance test is NOT proof of
the real SQL token verifier; full end-to-end SQL-backed session HTTP tests
remain a separate prerequisite. The historic audit document naming and wider
read/delete authority inventory remain unresolved. Phase 4 OPEN.

Acceptance: exact-head authorization/build, Evia HTTP tests and disposable
SQL/browser gates, then independent Azure Ready/exact public SHA/live MSSQL
proof. Do not merge until CI is green or activate the canary.

## Phase 4 real SQL-session Evia audit HTTP acceptance — bounded follow-on

PR #251 merged at `4bec1611ae1137ddedcfdd1c35842623df260de3`.
Post-merge Azure Ready/public exact-SHA/MSSQL acceptance must be captured
separately from green verification CI before this release gate closes.

ACTIVE TEST-ONLY: extend the existing disposable Docker SQL Server two-tenant
billing/browser harness with real hashed bearer and storage-cookie sessions,
real tenant memberships, the real /storage audit middleware and SQL publication
lookup. Only the final storage-byte responder is simulated. Prove invalid and
revoked tokens deny, renters and staff cannot read, foreign tenant is denied,
absent/unprocessed/wrong-attempt publication is denied before any bytes are
served, and a properly authorized local administrator can read using both
carriers. Disposable fixture SQL writes are allowed only in the test database.
No production data, canary activation, object deletion, schema change or
broadened disclosure policy. Historic audit naming/retention still pending.

Require exact-head build and authorization, Evia, disposable SQL and browser
acceptance green before merge, then Azure revision Ready/public exact SHA/live
MSSQL. Phase 4 OPEN; canary OFF.

## Phase 4 fenced archive crash-recovery acceptance — test-only slice

PR #252 merged at `6abb2c5a21a265c47838f38e300a8f67ffadccaf`.
Production Azure readiness, public SHA and live MSSQL verification remains a
separate mandatory release gate.

ACTIVE: introduce deterministic crash-window regression tests of the dormant
fenced coordinator. Reproduce a signed-PDF upload followed by failure before
its audit-trail partner, ensure no publication, then simulate lease expiry
and successful takeover into a distinct immutable attempt namespace. Prove
the old worker cannot renew, the partial bytes are not automatically deleted,
and replay of a committed publication neither stages nor finalizes again.
This test uses mocked storage/lease boundaries; it does NOT replace the
existing disposable SQL takeover proof or establish full process-crash
recovery across real storage. SQL-backed and end-to-end storage acceptance
remain separate requirements before canary activation.

No production canary flag, live Evia request, object deletion, additional
publication authority or database schema changes. Require exact-head
authorization/build and Evia tests before merge and independent deployment
verification afterwards. Phase 4 OPEN; canary OFF.

## Phase 4 historic Evia audit-trail disclosure — bounded access slice

PR #253 merge `0236b7360f07754e1ae7969acc5e4a0ad3fa58d4`
production accepted: workflow #38347047466 green, Azure revision
0000256 Ready, exact public SHA and live MSSQL ready.

ACTIVE: Protect the legacy stable audit URL
`tenants/{tenant UUID}/agreements/{agreement UUID}/signed/audit_trail.pdf`
using the same authenticated tenant storage route. Require an active
tenant administrator with agreement-management permission, tenant-scoped
completed signed agreement and a locally retained stable signed PDF.
Keep ordinary signed-PDF delivery and fenced lease-backed audit handling
unchanged. A legacy stable audit has no fenced publication ledger; this
does not prove historical file authenticity and is an access restriction,
not a retroactive signing-evidence guarantee.

Add authorization tests and execute the existing build and Evia gates.
Remaining storage upload overwrite paths, historic filename variations,
broad storage deletion privileges and durable object lock require separate
review. Do not activate the Evia canary or delete evidence. Phase 4 OPEN.

## Phase 4 generic storage upload protection — bounded slice

PR #254 merge `f37784c107273892291910b3cbf3022ef2ede6d1`
production accepted on Azure revision 0000257, public exact SHA, live
MSSQL ready, deployment workflow #38350572904 successful.

ACTIVE: reject generic authenticated tenant storage uploads into the
tenant/UUID/agreements/UUID/signed namespace, including legacy signed PDFs,
historic audit_trail.pdf and staged immutable attempt evidence. The guard
runs after tenant path scoping and before calling either storage driver.
The internal Evia document writer is deliberately unchanged. This protects
the generic API from overwriting signing evidence, but is NOT storage
object-lock or provider-wide immutability: internal writer permissions,
alternate R2 credentials and other storage paths need distinct review.
No canary activation, object deletion, DDL, or public new endpoint.
Run exact PR-head authorization/build, Evia and appropriate SQL/browser
acceptance before merge. Phase 4 OPEN; canary OFF.


## Phase 4 compatibility closure and migration-authority census — current active slice

PR #255 merged as `3b04f611709ee4ffa9280aa7fe051d9debc21b4b`.
Its production release is pending independent Ready/exact-SHA/MSSQL verification.

ACTIVE inspection-only slice: reconcile the current compatibility inventory in
`docs/PHASE4-COMPATIBILITY-CLOSURE-MATRIX.md`, distinguishing the governed
production migration workflow, the legacy `npm run migrate` SQL-RPC script,
already-removed browser SQL migration UI, and live invoice, agreement and
auth/utility consumers. Add startup/migration authority regression checks,
with no SQL execution, runtime behavior change or production canary activation.
The original Phase 4 goal remains outstanding: safely retire remaining live
compatibility paths one bounded domain at a time. Phase 5 remains downstream.

## Phase 4 legacy invoice read ownership — active bounded slice

PR #256 merged as `d4898551c9b26f4a80b189f71db5595854589c65`.
Production run #38355539021 passed: Azure revision 0000259 Ready,
exact public SHA and live MSSQL ready.

ACTIVE: restrict legacy MSSQL invoice list and detail reads for renter
identities to their own invoice records. Apply SQL owner and draft predicates
before pagination; do not filter only the returned page. Detail lookup must
return 404 for another renter's same-tenant invoice. Preserve administrator
reads, tenant SQL scope and dedicated billing lifecycle mutations.
No invoice amount/status changes, compatibility fallback enablement, schema
changes or Evia canary activation.

Follow with disposable two-tenant SQL-backed HTTP acceptance before this
release is considered sufficient for broader invoice contract migrations.
Phase 4 remains OPEN.

## Phase 4 invoice list query parity — bounded active slice

PR #257 merged at `0a1c25c03534260f3c09bd2e88e2b526971773a4`.
Its post-merge Azure Ready/exact SHA/MSSQL acceptance is a separate release gate.

ACTIVE: carry explicit status arrays and allowed sort fields through the
existing MSSQL invoice list path. SQL applies owner/draft/tenant predicates
before pagination and always includes an immutable ID tie-breaker for stable
page boundaries. An empty status array must not widen a filtered request.
Do not widen sorting beyond an allowlist, modify invoice money/status,
change mutation authorization, or enable the Evia canary.
Require exact-head build and disposable SQL/renter acceptance and production
verification prior to treating this behavior change as accepted.
Phase 4 remains OPEN.

## Phase 4 pending-invoice dashboard read transport — bounded slice

PR #258 merged as `7840b8acee13f635b27217ee9c4b5cf9c08390ee`.
Azure Ready/exact public SHA/live MSSQL evidence is still a separate
production release gate until the post-merge workflow finishes.

ACTIVE: replace ONLY `getPropertiesWithPendingReadings`' compatibility-client
queries with explicit authenticated `/api/platform/query` read requests,
retaining the existing backend tenant, renter and staff authorization policy,
same pending_invoice/invoice_id-null filters, stable ID ordering, bounded
pagination, and grouped pending-reading counts. Explicitly reject unavailable
database/schema responses instead of presenting a false zero-count dashboard.
No new backend authority, money/status mutations, SQL DDL, or Evia canary
activation. Preserve remaining live utility-reading projections for separate
contract and browser acceptance. Phase 4 OPEN.

## Phase 4 legacy utility invoicing UI containment — bounded slice

PR #259 merged at `c151cf2f8b9e05fa7459753bfa48c1549275695f`.
Post-merge build/deployment and Evia workflows succeeded; the independent
Azure Ready/exact public SHA/live MSSQL acceptance remains a release gate.

ACTIVE: make the routed `/dashboard/utilities/invoicing` screen read-only.
Remove its mock `INV-${Date.now()}` invoice ID, selected-reading invoice
action, and direct `markAsInvoiced` call. Retain review/filter display
and show a permission-gated link to the established monthly invoice generator.
Show read failures explicitly rather than presenting an empty success state.
Preserve existing monthly invoice authority, server authorization,
tenant/tenancy isolation and transactional utility-reading linkage.
Do not migrate `fetchReadingsForInvoice` in the same slice. Do not change
billing money/status, server endpoints, schema, or the Evia canary.
Run PR-head authorization tests/build and independent production acceptance.
Phase 4 remains OPEN.

## Phase 4 utility invoice preview read migration — bounded slice

PR #260 merged as `9ffe0a3ee0942222c450082fe7dc99679e287744`.
Azure revision 0000263 was Ready; public build SHA matched this merge and live
MSSQL health was ready. The legacy mock-invoice action is contained.

ACTIVE: migrate ONLY `fetchReadingsForInvoice` to an explicit authenticated,
tenant-scoped read-only `/api/platform/query` transport. The routed review
screen continues to show pending, unlinked utility readings with optional
reading-month/year filters, property/rentee filters, stable paginated IDs,
tenant/assigned-property authorization, and clear failures for unavailable
database/schema. Display persisted calculated charges without inventing zero
amounts or re-billing readings from property rate fallbacks. The preview
is not the generator's full eligibility determination: governed monthly
billing independently applies tenancy and prior-service-period rules.
No `utility_billing` table dependency or schema change is introduced.
The existing `markAsInvoiced` legacy helper remains for separate caller
census/retirement rather than being invoked by this screen.
No invoice/reading writes, billing amount changes, permission expansions,
or Evia canary enablement. Require exact-head CI, disposable two-tenant
SQL/browser acceptance and post-merge Azure Ready/public SHA/MSSQL evidence.
Phase 4 OPEN.

## Phase 4 retire dead utility invoicing helpers — bounded slice

PR #261 merged as `5f8b433bcf610b5fe34c41b65a9a1223408259b4`.
Azure revision 0000264 Ready, exact public SHA, live MSSQL ready and
post-merge Evia green are verified.

ACTIVE: retire only `utilityBillingService.markAsInvoiced`, which no
longer has application callers after the routed mock-invoice UI was
contained, and the unused `discoverValidStatusValues` + `READING_STATUS`
fallback from the formerly compatible `fetchReadingsForInvoice` path.
Preserve the live approval/rejection paths, their constraint discovery,
the read-only invoice preview and the server-governed monthly billing
generator. Update regression tests and caller inventory. No SQL schema,
monetary amount, payment/status mutation, authority expansion or Evia
canary activation. Require PR-head authorization/build, Evia and any
required disposable SQL acceptance; verify production Ready/public
SHA/MSSQL independently after merge. Phase 4 OPEN.

## Phase 4 utility review mutation authority audit — next gate

PR #262 merged as `1945ef06020af3f1bb93c7a283a44759466efc5e`.
Deployment workflow `38489769099` completed successfully, revision
`0000265` became Ready, public build SHA matched, and live MSSQL health
was Ready. Mark the removed unused helper slice production-accepted.

ACTIVE: classify two routed utility-review mutation entry points:
`UtilityBillingReview.jsx` and `staff/UtilityReadingsReview.jsx`.
Both still have client-side compatibility updates and divergent status,
amount and failure-handling behavior; one still attempts
`utility_billing` insert. Source-backed audit:
`docs/PHASE4-UTILITY-REVIEW-AUTHORITY-AUDIT.md`.

This audit is document/test-only. The next behavior-changing slice
must introduce one governed server utility-reading review transition
with tenant/property authorization and atomic status, charge and
timestamp changes; prove two-tenant SQL/browser flows first. Never
create invoices or link readings outside monthly billing, widen
permissions, enable Evia canary or apply production DDL as a side effect.
Phase 4 remains OPEN, Phase 5 pending.

## Phase 4 governed utility review API — bounded backend-first slice

PR #263 audit merged as `e401842058d0a4cdf1ef99034c7620c5ce77dd0a`.
PR #263's post-merge production proof is a separate acceptance gate.

ACTIVE: introduce `POST /api/utility-reviews/readings/:readingId/approve`
and `.../reject` as tenant-authenticated, `UTILITIES_REVIEW`-permissioned,
assigned-property-scoped and SERIALIZABLE/MSSQL-row-locked review transitions.
Only pending unlinked readings can be reviewed; approval requires an explicit
configured property rate and stores amount/status/billing metadata atomically;
rejection requires a reason and updates review fields atomically. No
`utility_billing` writes, hard-coded pricing defaults, or invoice ID linkage.

This is backend-first: the two competing routed review UIs are NOT yet
migrated or deactivated. They remain an independent release blocker.
Require exact-head CI plus disposable two-tenant SQL transition/rollback/
concurrency and browser acceptance before wiring clients or treating this
as a completed behavior change. No production DDL or Evia canary changes.
Phase 4 OPEN.

## Phase 4 — pending utility meter correction authority

PR #264 is production accepted on merge `c3c594b1b93c8de24d77feb8b9e323e01525fa99`
(Azure Ready revision `0000267`, exact public SHA and live MSSQL Ready;
workflow `38509575288`).

Active bounded follow-on: migrate the primary review screen's pending
meter corrections away from client-side read-then-write into the
`PUT /api/utility-reviews/readings/:readingId/value` transactional API.
Require tenant and `UTILITIES_REVIEW` permission; assigned-property
scope for staff; pending, unlinked billing state; explicit original
reading values for stale-write detection; exact four-decimal meter
precision. Change only previous/current readings and updated timestamp,
never billing amount, status, or invoice linkage.

Release gates: exact-head authorization/build; disposable two-tenant SQL
permission, amount, concurrency and stale-write proof; existing browser
acceptance; Evia regression; independent production SHA/MSSQL verification
after merge. No DDL or canary changes. Phase 4 remains ACTIVE.

## Phase 4 — live invoice dashboard read integrity (bounded slice)

After PR #268, the remaining live invoice read surface was audited.
`InvoiceManagementDashboard.jsx` calls `getInvoiceSummaryByProperty`
(paginated authorized invoice reads) and `getPropertiesWithPendingReadings`
(scoped utility preview). The summary view retained stale financial figures
after read failures or cleared property selection, and its month/year date
filters used midnight on the final calendar day. A bounded client change
clears stale/in-flight values, rejects superseded results, distinguishes
unavailable from genuine zero totals, and includes the full last day
for MSSQL `createdat <= toDate` selection.

Do not change tenant authorization, invoice amounts, payment status,
the governed billing writer, Evia canary, SQL schema, or production DDL.
Gate on exact-head authorization/build tests and production Ready/serving
SHA/MSSQL evidence. Phase 4 OPEN; Phase 5 still pending.

## Phase 4 consolidated authenticated acceptance and routed business-browser follow-on — 2026-10-15

PR #281 has merged as `2a283aa24cb3bcbac53186b15065bb9e12eccf22` from verified PR-head `ad357f5bc52bbda75e26fd3d4d22ab52af97b968`. Build/authorization, disposable two-tenant SQL Server acceptance and Evia webhook tests all succeeded on the exact head. The test package adds real-session HTTP maintenance and notification ownership/tenant-denial assertions. It does **not** prove end-to-end browser workflows, production object upload, email delivery or full lifecycle correctness. Confirm independently that its post-merge Azure Ready revision serves the exact SHA and reports MSSQL healthy.

Current next Phase 4 domain: **routed renter browser acceptance**, in one disposable two-tenant SQL fixture. Exercise actual logged-in React maintenance list/detail and agreement screens for both tenants plus denied foreign request navigation. Retain existing invoice/receipt browser evidence. Do not mutate production identity, invoices, maintenance, email, Evia signature or database DDL. Broader invitation/resend, signed-document, payment verification, staff maintenance transitions and final compatibility caller census remain release blockers before Phase 5. Keep the Evia fenced canary OFF.

## Phase 4 — post-PR #283 renter receipt browser gate — 2026-10-15

PR #283 merged as `5aaf9c569ac8503c600efc75ceeb5d7bdb305516` after passing exact-head authorization/build, two-tenant disposable SQL and Evia CI. It covers governed payment proof, reject/resubmit, partial/full verification, receipt/ledger creation, replay refusal and tenant isolation through real session-backed HTTP requests. Do **not** mistake this evidence for successful email issuance, actual R2 proof upload, live bank verification, or user-interface settlement approval.

The next bounded test-only acceptance gate reuses the very same SQL/Puppeteer fixture and authenticated renter sessions to verify that both tenant portals display **their own** issued receipts after full settlement, never foreign receipts, and that opening the account panel does not mutate invoices/payments/receipts/events. Also assert a second renter within one organization cannot read or submit proof for another renter's invoice. Preserve PR #283's existing partial settlement/ledger tests, do not rerun Azure rollout on a test-only main merge, and keep Phase 4 ACTIVE until controlled full business workflows and compatibility/privileged migration signoff pass.

## Phase 4 — assigned staff maintenance HTTP acceptance (active, 2026-10-15)

Merged PR #285 (`251ff536b3b84a5c917c18791c3d6afc41fa69bb`) completed actual renter receipt browser isolation on both disposable SQL tenants. The next **test-only** package exercises the existing maintenance lifecycle with real SQL-backed bearer sessions: renter creation with active tenancy, property-scoped manager assignment, assigned-only worker start and completion, internal/public comment visibility, tenant-local image metadata, foreign tenant/property denial, replay/closed state denial, and durable lifecycle event ledger. The disposable SQL fixture adds the existing staff-property-assignment migration to test explicit property grants.

No production schema, notification delivery, object storage bytes or Evia authority changes. Tests use only synthetic tenant/actor data. The current maintenance router records lifecycle events but does not itself guarantee an in-app notification or outbound email/SMS; these require separate product acceptance. Keep Phase 4 active until actual staff/browser interactions, invitations, signing, R2 payment files, compatibility caller census and migration executor proof are resolved. PR-head authorization/build, disposable SQL and Evia checks must all be green before merge.

## Phase 4 — actual assigned-staff maintenance browser gate, 2026-10-15

PR #286 merged at `bc61165ec5d6bb5fd75ac9d56d185f0dec674d61`, with exact-head authorization/build, disposable two-tenant SQL and Evia green. Its post-merge Evia test also passed. The real-session maintenance HTTP proof covers renter create, scoped manager assignment, assigned worker state transitions, internal/public comments, image metadata and closed/replay denials. The separate current gate exercises the **actual staff React detail page**: logged-in assigned worker clicks Start Work and completes through the required notes dialog, SQL ledger records the two transitions, and a foreign organization's worker cannot view the request by URL. It reuses the same SQL/Puppeteer fixture, without duplicate containers, new workflows, runtime changes or Azure rollout. Notifications, actual storage image bytes, manager assignment selection, invitations and signed document journeys, final compatibility census and production migration executor remain outstanding; Phase 4 remains open.

## Phase 4 — governed staff assignment picker, 2026-10-15

PR #287 merged as `3adeda8b4019a7b1ea2097ab4db00ae4a0df94aa`: the assigned worker's real React Start Work/Complete flow, build, disposable two-tenant SQL and Evia tests all passed. Its post-merge Evia run #38628116983 is green. The next package updates the manager assignment picker from legacy role-name filtering to a request-, property- and tenant-scoped eligible worker endpoint using canonical membership permission bundles. The same permission predicate governs actual assignments, including denial of finance and read-only identities. The real manager assignment form must select a permitted worker and persist one assignment event on disposable SQL. This change affects production runtime and therefore requires normal exact-head CI and post-merge deployment verification.

Full Phase 4 closure still requires controlled invitation/signing, actual storage upload, lifecycle notification evidence, compatibility caller census, and operational migration authority confirmation. Phase 5 stays pending.

## Phase 4 — durable maintenance in-app notification delivery, 2026-10-15

PR #288 merged as `f3a1c30178d4a8059824e8caead57c33e79c0d6d` and the production deployment #38630468740 confirmed Ready Azure revision `0000285`, exact public serving SHA and live MSSQL connectivity.

The next package adds **in-app notification records atomically with maintenance lifecycle events** for request creation (authorized managers of that property), assignment, work started, completed and cancelled (renter/assigned worker). Active tenant membership is checked again within the transaction; foreign and unassigned-property users are not notified. The existing real-session two-tenant SQL fixture verifies recipient visibility through /api/notifications/me, self-only mark-as-read, replay denial and no cross-tenant leakage. No new SQL schema, external service, payment or Evia authority changes are introduced.

This does **not** prove a visible inbox in the React application or provider-backed email/SMS delivery. The existing notification service's legacy email/SMS placeholders are not accepted evidence of sending. UI presentation, external delivery, file bytes, invitation/signing and migration-executor operational verification remain Phase 4 blockers. Phase 5 is pending.

## Phase 4 — notification inbox user experience and read-state acceptance, 2026-10-15

PR #289 merged as `1597e645bae1226c9a65266398f651842c07b00d` after authorization/build and disposable two-tenant SQL acceptance passed. It persists maintenance notifications atomically with their lifecycle event, scopes recipients to active organization membership, and verifies self-only inbox access and read-state. Its production deployment must still be independently confirmed.

The current UI acceptance package exposes a self-only Notifications page in both staff and renter workspaces. It shows readable event labels, unread/read status, refresh and safe links to the corresponding maintenance request (navigation is never authority); no generic user-ID or tenant-ID query is exposed. Tenant switching clears old organization content. The existing disposable SQL/Puppeteer fixture proves routed renter/manager pages, mark-as-read persistence and foreign-organization isolation. Treat CI and production rollout as separate gates. Email/SMS/desktop push is NOT delivered by this UI and is not accepted as complete external notification support.

Other Phase 4 blockers: real object bytes, invitation and signing journeys, compatibility caller inventory and production migration-executor proof. Phase 5 still pending.

## Phase 4 canonical closure execution lock — 2026-10-16

**Status: Phase 4 ACTIVE / NOT READY TO CLOSE; Phase 5 GATED.** This entry supersedes *earlier historical “next package” or “active slice” prose* elsewhere in this document for determining the single current work item. No additional Package D, opportunistic UI fixes, new CI workflow, new migration mechanism, or compatibility-code removal is authorized merely because the operational gate is delayed. A separate production-critical security/outage/data-loss defect may interrupt under operating rule 2, with evidence.

### Verified completed evidence

- PR #310 merged at `0ec26289ebd42816bc6ad348396266494cb19622`, repairing the shallow Git checkout ancestry check in the **existing** production read-only migration workflow. The first subsequent automatic read-only production plan [#38860310178](https://github.com/WasanthaK/khrental/actions/runs/38860310178) passed, including Ready revision/public SHA ancestry and a real read-only in-container SQL plan on `khrentals.database.windows.net/khrentalsdb`. Five migrations are `APPLIED` with checksums; `20261006_01_repair_auth_store_runtime_columns` is `SATISFIED_UNTRACKED` with inspected auth schema and index present; **zero `PENDING`**. The run explicitly reported **no database modification**.
- Dedicated isolated `khrental-db-migrator` was provisioned previously ([#36498501746](https://github.com/WasanthaK/khrental/actions/runs/36498501746)) and executed governed production migrations successfully in [#36946616128](https://github.com/WasanthaK/khrental/actions/runs/36946616128), [#37323211091](https://github.com/WasanthaK/khrental/actions/runs/37323211091), and [#37454655068](https://github.com/WasanthaK/khrental/actions/runs/37454655068). These historical executions are not evidence of a fresh all-six strict verification.
- PR #311 (shared invoice Property Selector multi-select correction) merged as `c2cedf0ae4787f688297d949d42f5f9a8acca484`. Its [production deployment #38874383888](https://github.com/WasanthaK/khrental/actions/runs/38874383888) passed authorization/build, deployed Azure Ready revision `0000303`, verified public `/build-info.json` at the **exact merge SHA**, and received `{"ok":true,"provider":"mssql","connection":"ready"}`. The deployment gate is **CLOSED**. This UI correction was *not* the next canonical closure priority and must not be used to justify additional detours.
- Existing Package C source/caller census remains classified as **live / fail-closed legacy / unresolved dynamic or manual** in `docs/PHASE4-COMPATIBILITY-CLOSURE-MATRIX.md`. Earlier historical audit descriptions and dated subpackages do not override that disposition. Do not infer that absence of indexed imports proves an export safe to delete.

### Exactly one ACTIVE item: governed production migration ledger reconciliation

**Owner/authority:** Production release operator, using the *existing* protected GitHub Actions workflow with Production environment approval; no browser SQL RPC, unprivileged application runtime, or alternate dispatch pathway.

1. With current serving SHA `c2cedf0ae4787f688297d949d42f5f9a8acca484`, run the existing **Run production database migrations** workflow in **plan / all**, and retain the actual run URL/output for `khrentals.database.windows.net/khrentalsdb`. The successful automatic plan #38860310178 is prior to the latest application deployment and is the reference baseline, **not** a substitute for this new deployment's fresh plan.
2. Only if it again reports the same five `APPLIED` entries with matching checksums, the one auth-store `SATISFIED_UNTRACKED` and **no `PENDING` / checksum mismatch**, obtain separate explicit operator approval to run **apply / all** with the exact `APPLY-PRODUCTION` confirmation. The existing workflow's privileged `apply` branch also requires exact serving SHA, a preprovisioned dedicated job and SQL authority. The runner verifies satisfied schema and records its ledger row without replaying SQL *only if inspection remains satisfied*. If inspection differs or a pending schema change appears, **STOP**; the general `apply` code is able to run DDL.
3. After authorized reconciliation, run the *existing* **Verify production database migration executor** workflow with `VERIFY-MIGRATION-EXECUTOR`; retain the real execution ID, all six `LEDGERED / SCHEMA_OK` results, matching checksums, distinct managed executor identity, SQL grant/network evidence and green completion. A green migration unit/CI test or `plan` is not this strict production verifier.

**Execution blocker:** The current connected GitHub tools do not expose a `workflow_dispatch` action; Work-mode browser credits were unavailable at the last check. This is an **operator execution-access blocker**, not a database defect. Do not create a second migration workflow, change trigger/confirmation rules, redeploy the same code solely to trigger apply, or falsely claim completion.

### Subsequent existing closure gates — sequential, not parallel feature work

Only after strict migration verification, collect explicit operator-controlled SendGrid **invoice mailbox delivery** evidence, then an approved **Evia signer → callback/webhook → immutable archived signed PDF + audit → authorized browser retrieval** (fenced canary OFF unless separately authorized), then disposition unresolved live/dynamic/manual compatibility and obtain the final tenant/billing/agreement production sign-off under `docs/PHASE4-CONSOLIDATED-ACCEPTANCE.md`. Earlier Phase 2 historical signing completion remains valid as its own acceptance, but does not replace this later hardened workflow's provider-backed evidence.

**Exit decision:** Keep Phase 4 open and Phase 5 gated until these existing acceptance items have retained artifacts and explicit sign-off. Scope is frozen; no opportunistic new feature/UI/cleanup PRs while waiting for the privileged operator step.

## Phase 4 owner-held external acceptance; independent closure disposition — 2026-10-16

**Latest controlling execution instruction (supersedes the preceding sequential ACTIVE step only as to scheduling):** The release owner will perform the real controlled SendGrid invoice-mailbox test and real Evia signatory/archive test separately when available. **PARKED / OWNER-HELD is not PASS, WAIVED or permission to close Phase 4.** Do not request Gmail credentials or broad personal mailbox permissions; the owner can independently confirm receipt and supply redacted provider/event evidence. Keep the fenced Evia canary OFF unless expressly authorized for a controlled test.

**One ACTIVE independent work item:** complete and record the existing Package C compatibility/manual-tool caller disposition and final release-readiness evidence register, using `docs/PHASE4-COMPATIBILITY-CLOSURE-MATRIX.md` and `docs/PHASE4-CONSOLIDATED-ACCEPTANCE.md`. This limited scheduling exception allows independent review while provider checks are parked; it does **not** authorize a new migration workflow, runtime compatibility rewrite, unrelated UI work, deletion of unknown exports, production SQL, sending invoices, or an Evia request.

**Reconciled evidence:**
- Live serving behavior remains the confirmed [deploy #38874383888](https://github.com/WasanthaK/khrental/actions/runs/38874383888), Azure Ready revision `0000303`, SHA `c2cedf0ae4787f688297d949d42f5f9a8acca484`, MSSQL ready. Subsequent main changes to this point affect canonical documentation, not application behavior.
- Fresh [plan #38877959860](https://github.com/WasanthaK/khrental/actions/runs/38877959860) and later [plan #38880543731](https://github.com/WasanthaK/khrental/actions/runs/38880543731) both passed against revision `0000303`: five `APPLIED`, one `SATISFIED_UNTRACKED`, zero `PENDING`, no database modification. Both are specifically **plan** jobs, not `apply` or strict verification.
- The operator reports that the protected migration `apply` and strict verifier are green. **Provisional / evidence awaiting reconciliation:** the connected GitHub Actions run list available during this review has not exposed the newer apply/strict-verifier run URLs or the six per-migration `LEDGERED / SCHEMA_OK` log lines. Do not silently upgrade this report to independently confirmed migration closure or automatically repeat the privileged `apply`.

**Independent technical disposition:**
- Retain live tenant-, payment-, agreement-, identity-, maintenance-, utility- and notification-scoped clients where governed contracts and existing tests are documented. No broad `platformClient` removal.
- Keep dormant fail-closed invoice/identity compatibility exports and historical manual SQL scripts inventoried. `npm run migrate` uses blocked `exec_sql`, while `execute-sql` and named `migrate:*` scripts execute direct SQL without the governed checksum ledger; none is approved production migration authority. Historical/manual/dynamic callers are **unresolved**. No deletion or blanket risk acceptance based on indexed search.
- Reuse existing authorization/build, Evia contract, disposable two-tenant SQL/HTTP/browser and deployment proof; do not create duplicate workflows or demand reruns without a reason.
- Any release-critical tenant isolation, payment mutation, signed-document immutability, identity boundary or privileged authority failure remains a **hard blocker**; no accepted deferral is granted here.

**Release decision:** Phase 4 **ACTIVE / SIGN-OFF BLOCKED**; Phase 5 **GATED**. Independent static/caller disposition can complete now, but a documented risk-owner decision on unknown operational callers, verified strict migration execution, owner-controlled external delivery/signing receipts and final production business/workflow sign-off remain required. The release owner can return to the parked external acceptance without losing the completed independent review. Do not open a new enhancement package in its place.

## Phase 5 parallel development authorization — 2026-10-16

**Current instruction:** The release owner authorized proceeding with Phase 5 **development and regression hardening** while personally deferring the controlled Phase 4 SendGrid and Evia acceptance. This changes **development scheduling only**. Phase 4 remains **OPEN**, and the **production release / final Phase 5 sign-off remains gated** by the independent external and migration-evidence criteria in `PHASE4-CONSOLIDATED-ACCEPTANCE.md`. This explicitly supersedes older sequential prose that barred *starting development* until Phase 4 closed; it does not waive any release acceptance condition.

**Single ACTIVE Phase 5 item:** First bounded regression group: property and property-unit authorization and existing property-details tenant directory behavior. Add explicit renter ownership/read-only and staff assigned-property/no-mutation checks, require admin record filters on unit updates/deletes, and include existing `tests/property-details-directory.test.js` in the existing `npm run test:authorization` gate. Verify the normal authorization/build checks on the exact PR head; **no second regression runner or broad test-framework change**. Test/docs only, so Azure runtime redeployment is unnecessary.

**Next Phase 5 scope after green:** Continue the canonical Product Admin → properties/units → billing/invoices/receipts → maintenance → notifications/email → agreement cancel/delete → authorization regression sequence in bounded batches, reusing existing tests, and correcting only demonstrated release-critical defects. External provider checks stay owner-held; no customer mail, production SQL, Evia canary, changed financial records or Phase 4 closure by implication.

## Phase 5 source regression complete — release-evidence handoff (2026-10-16)

**Latest controlling status; supersedes the preceding Phase 5 ACTIVE first-regression instruction:** The owner-authorized Phase 5 Product Admin, property/unit, billing/payments/receipts, maintenance/notifications, agreement/signed-document, and final cross-domain **source-level regression scope is now complete**. PRs [#314](https://github.com/WasanthaK/khrental/pull/314), [#315](https://github.com/WasanthaK/khrental/pull/315), [#316](https://github.com/WasanthaK/khrental/pull/316), [#317](https://github.com/WasanthaK/khrental/pull/317), [#318](https://github.com/WasanthaK/khrental/pull/318), and [#319](https://github.com/WasanthaK/khrental/pull/319) are merged.

**Latest operational proof:** GitHub [main deployment #38899514979](https://github.com/WasanthaK/khrental/actions/runs/38899514979) succeeded: full `npm run test:authorization` **568 passed / zero failed**, build green, deterministic startup verified, Azure Ready revision `0000307`, public build fingerprint SHA `0edeb80eb91840857a4d758d32360acbfa2fb231` and live MSSQL connection ready. The prior PR #319 check [#38899371734](https://github.com/WasanthaK/khrental/actions/runs/38899371734) skipped deploy, **but the subsequent main push did deploy**. Do not mislabel `0000303` as currently serving.

**One ACTIVE item now: release-owner acceptance/evidence reconciliation, no new feature scope.** The detailed current checklist is **in the existing authoritative** `docs/PHASE4-CONSOLIDATED-ACCEPTANCE.md` under *Phase 5 regression consolidation and production release acceptance checklist*. Resolve independently: (1) operator-reported production migration `apply` plus all-six strict job/log proof; (2) owner-held controlled invoice SendGrid receipt; (3) owner-held real fenced Evia signer/callback/signed PDF and audit acceptance; (4) manual/dynamic compatibility caller risk decision; (5) final production business/security sign-off. Source-level CI green and deployed health alone are insufficient. No new migration workflow, extra test framework, generic SQL execution, external user email, unapproved Evia canary or automatic Phase 4 closure.

**Decision:** Phase 5 **DEVELOPMENT / SOURCE REGRESSION GREEN**; Phase 4 **OPEN**; combined **PRODUCTION RELEASE SIGN-OFF BLOCKED** until the acceptance checklist is evidenced and approved. Phase 5 source work may be called engineering-complete within its tested scope, not acceptance-complete.

## Maintenance rule for this document

After each merged production change:

1. Mark the completed checkbox/exit criteria.
2. Record the PR and deployed SHA in the completed-item block.
3. Move exactly one next item into **ACTIVE** status.
4. Add newly discovered non-critical work to the parked backlog or a future phase instead of starting it immediately.


## SaaS backlog decision — Tenant-branded Invoice Designer (approved 2026-10-18)

**Status: APPROVED FUTURE SaaS CAPABILITY / PARKED — not current release scope.** The release owner approved a configurable Invoice Designer direction while prioritizing the professional default invoice PDF in PR #332. This is a product/architecture decision only; no SaaS template editor, configuration persistence or production migration has been implemented.

### Tenant-branding scope
- Each SaaS tenant/property-management business is the issuer and owner of its invoice branding; KH Rentals is the software platform, not automatically the invoice issuer.
- Begin with curated, printable templates (Modern, Classic, Minimal, Corporate), rather than arbitrary HTML, free-form drag-and-drop layout or untrusted user scripts.
- Authorized business administrators can configure issuer business/legal name, logo, contact address, phone, email, website, applicable tax registration identifiers, primary colors and approved footer/terms. Property-level overrides may be supported by explicit policy.
- Allow approved show/hide of optional fields, labels, paper format, date/currency format and approved payment instructions. Never allow template configuration to alter ledger totals, line items, tax calculations, recipient ownership, invoice authorization or issuance timestamps.
- Keep country/jurisdiction-specific legal requirements and tax computation as a separately validated capability; no tax compliance is implied by a customizable tax-ID label.
- Preview using synthetic invoice data; provide accessible PDF/print validation and controlled asset handling.

### Immutable financial-document contract (mandatory before SaaS release)
- On issuance, snapshot issuer identity, configured template ID/version, optional field values, bank recipient and the complete issued billing data; generate and retain the exact PDF bytes under the correct tenant/invoice ownership with a content hash and audit record.
- Resend and historical download must use the exact retained issued PDF rather than render again from mutable templates or modified business profiles. Any subsequent change is a separately governed corrected invoice, not an unnoticed rewrite.
- Tenant and property permissions apply both to configuration and PDF retrieval, with full audit trail for branding changes and resends, bounded file types/size for logo uploads and no publicly enumerable invoice URLs.
- Missing banking details must remain explicitly missing; never substitute today's live property bank account into a historical invoice.

**Implementation sequence:** (1) complete/accept PR #332 default PDF polish; (2) approved issuer identity and branding configuration plus tenant-owned logo; (3) curated templates and preview; (4) immutable PDF archive + version/hash/resend consistency; (5) optional broader invoice design controls as demand demonstrates. Do not treat this parked SaaS capability as a Phase 4 acceptance waiver or as authorization to change production financial records.

## Canonical release gate — reconciled 2026-10-20 (controlling update)

**Status:** Phase 0–3 COMPLETE; Phase 4 OPEN for operational and external acceptance;
Phase 5 source/regression development COMPLETE but overall production release NOT APPROVED.
The single active work item is **release-owner acceptance/evidence reconciliation**.
This section supersedes previous 2026-10-16 statements that production migration
apply and strict verification lacked independently retrievable evidence.

### Seven-migration production gate — VERIFIED COMPLETE for its exact baseline

- [Authorized production apply #39185870984](https://github.com/WasanthaK/khrental/actions/runs/39185870984)
  was successful October 19, with Production confirmation APPLY-PRODUCTION
  and migration upper bound 20261018_01_invoice_payment_references.
  Job 117848083384 used the isolated executor khrental-db-migrator-ivffmmn.
  Its logs show adoption of the already-satisfied auth-store repair
  20261006_01_repair_auth_store_runtime_columns without SQL replay, plus
  application and verification of invoice payment references. Earlier
  five migrations were already ledgered.
- [Independent strict production verifier #39186676663](https://github.com/WasanthaK/khrental/actions/runs/39186676663)
  succeeded October 19. Job 117850452655, dedicated execution
  khrental-db-migrator-4mr0tpa, checked the dedicated identity and
  retained all seven LEDGERED / SCHEMA_OK inspection results.
- [Latest verified main deployment #39201496936](https://github.com/WasanthaK/khrental/actions/runs/39201496936)
  succeeded for SHA 3d4dcb10b49562c462815890debd74104c7ae823
  with the normal authorization, build, Azure and public-build gates.

**Decision:** seven-migration apply/strict evidence gate PASSED for the
production baseline ending 20261018_01_invoice_payment_references.
Do **not** rerun production apply to recreate proof.

### Invoice enhancement — draft only, not production release evidence

- [Default professional PDF PR #332](https://github.com/WasanthaK/khrental/pull/332)
  is merged. The follow-up [readiness PR #338](https://github.com/WasanthaK/khrental/pull/338),
  [issuer-schema PR #339](https://github.com/WasanthaK/khrental/pull/339),
  [admin controls PR #340](https://github.com/WasanthaK/khrental/pull/340),
  and [snapshot/archive PR #341](https://github.com/WasanthaK/khrental/pull/341)
  remain unmerged drafts. PR #340 builds on #339 and #341 builds on #340.
- [Draft appleserv run #39372706676](https://github.com/WasanthaK/khrental/actions/runs/39372706676)
  is green at commit f38b35dd60ea285f191fe0ca1cd03f315b0000e6,
  including the isolated invoice snapshot tests and disposable SQL Server proof.
  This is not permission to activate live invoice issuance.
- Proposed migrations 20261019_01_invoice_master_data and
  20261020_01_immutable_invoice_pdf_archive are **not evidenced as
  applied to production**. They require separate, future governed
  application and verification if this invoice release is approved.
  SaaS tenant-branded template customization remains PARKED.

### Outstanding acceptance, in order of owner action

1. **Controlled invoice Gmail receipt — OWNER-CONFIRMED / PROVIDER TRACE OPEN.**
   On 2026-10-20 the release owner supplied screenshots and explicitly
   confirmed the invoice was deliberately issued to a test renter whose
   Gmail mailbox they control, not an actual customer. Gmail displays
   a sender labeled "Kubeira Property Admin", the subject
   "KH Rentals invoice for 2027-02", and a readable PDF attachment.
   Gmail's message details show an authenticated signing domain
   `quixo.online`, a mailing subdomain `em3798.quixo.online`, and TLS.
   The PDF displays reference 26101901, total LKR 23,340.00 and two pages.
   **Controlled mailbox receipt and PDF readability: PASS (owner attested).**
   Recipient address, raw headers, screenshots, bank account details and
   invoice bytes are deliberately not committed to this public repository.
   **Still OPEN:** authoritative invoice issue/delivery event correlation
   with the SendGrid message ID and provider status. Gmail domain details
   alone do not prove a particular SendGrid delivery event.
   No second test invoice or email is needed merely to record this evidence.
2. **Real Evia signer/callback/signed PDF — OWNER-HELD.** Separately
   approve a fenced test, verify callback, exact signed PDF bytes and audit
   and both allowed/denied retrieval. Canary remains OFF until approved.
3. **Legacy/manual caller disposition — OWNER DECISION OPEN.**
   Inventory and static checks are complete, but unknown operator and
   dynamic usage requires an explicit risk decision. No legacy SQL script,
   generic execution RPC or direct SQL command is an authorized alternative
   production migration process.
4. **Final controlled tenant/billing/maintenance/agreement acceptance and
   dated security/business sign-off — OPEN.** Accept or reject with evidence.
   Engineering CI and a green deployment do not imply a release approval.

The earlier checklist is a historical record, not a reason to run migration
apply again. This documentation-only change does not merge feature PRs,
apply DDL, deploy a build, send invoices or start Evia signing.


## Canonical work lock — reconciled release priorities, 2026-10-21

**Supersedes the dated Phase 4/5 "active slice" instructions above.**
Original canonical engineering and Phase 5 source regression are complete.
The existing database **7/7** was applied and strictly verified October 19:
[#39185870984](https://github.com/WasanthaK/khrental/actions/runs/39185870984),
[#39186676663](https://github.com/WasanthaK/khrental/actions/runs/39186676663).
The controlled invoice **26101901** arrived in the owner's Gmail with a readable
PDF; Evia agreement **#47FDEA13** was displayed Completed with both signatories
Signed; secure invitation was independently accepted. These functional tests
must not be repeated solely to produce another checklist tick.

The deployed production app is Azure Ready `0000318` serving merge
`b2b9d66cbb7b098e9c5c52202fd7775af278318a`, MSSQL ready.
[Read-only production plan #39582049166](https://github.com/WasanthaK/khrental/actions/runs/39582049166)
attempt 2 showed **7 APPLIED / 2 PENDING** with no SQL mutation.
The two new migrations belong to the separately authorized Invoice Designer,
whose real financial-document release still requires governed schema and R2
acceptance. Do not silently fold it into the original Phase 4 closeout.

**Exactly one active independent task: C01 canonical evidence reconciliation**
in `docs/PHASE4-CONSOLIDATED-ACCEPTANCE.md`. Then work C02 existing SendGrid
event-to-ledger evidence; C03 existing Evia callback/audit/PDF retrieval
evidence; C04 owner operational risk disposition; C05 final dated release
decision. C02/C03 are *correlations on prior successful tests* rather than
new live actions. I01–I03 remain separate Invoice Designer rollout gates.
No new application scope or Production mutation is authorized by this note.

## C04 owner-approved practical SQL operating decision — 2026-10-21

**C04 CLOSED as an operating-policy decision**, not as a claim of exhaustive
unknown-caller discovery or fresh database permission verification. The owner
agreed to four proportionate rules: (1) normal production schema changes use
the existing governed GitHub/Azure migrator, (2) application credentials do not
have unrestricted database-administrator privileges, (3) explicitly authorized
administrators may use direct SQL for exceptional production maintenance or
recovery, with the activity recorded, and (4) historical SQL commands remain
available for development and disposable tests. No new emergency framework or
approval bureaucracy for every database operation is required.

Runtime `exec_sql` remains blocked and no database privileges or SQL schema
were changed by this decision. The authoritative wording is in
`docs/PHASE4-CONSOLIDATED-ACCEPTANCE.md`.
C01 was merged in [PR #342](https://github.com/WasanthaK/khrental/pull/342);
C02 remains provider/ledger evidence-only; C03 remains signed-document/audit
retention evidence-only after the signed-audit viewer merge
[PR #327](https://github.com/WasanthaK/khrental/pull/327).
**C05 final canonical release approval remains open.**


## Controlling checkpoint — 2026-10-22: migration eight/nine applied

**Supersedes the October 21 `7 APPLIED / 2 PENDING` and Ready `0000318`
baseline above.** Production currently serves Ready revision `0000321`
(commit `e42ad6e0a59e3d5cb26e66ee2a0d2f27fa2f6649`, [deploy #39721498237](https://github.com/WasanthaK/khrental/actions/runs/39721498237)).
Owner-approved migration apply [#39751158286](https://github.com/WasanthaK/khrental/actions/runs/39751158286)
reports migrations 8/9 **applied and verified by the dedicated apply
executor**; prior seven were skipped. Independent read-only **strict 9/9
verification PASSED** on 2026-10-22 in [#39762736411](https://github.com/WasanthaK/khrental/actions/runs/39762736411)
under dedicated execution `khrental-db-migrator-0xj607n`: all nine
`LEDGERED / SCHEMA_OK` proofs retained; executor identity/grant checks pass.
**I01 CLOSED.** Do not reapply or repeat verification merely for evidence.

I03 invoice master settings safeguard is merged and live in
[PR #348](https://github.com/WasanthaK/khrental/pull/348):
`VITE_INVOICE_MASTER_SETTINGS_ENABLED` default OFF, with separate future
approval needed for enabling Settings/Property/Unit invoice master forms.
I02 R2 acceptance and `INVOICE_IMMUTABLE_ARCHIVE_ENABLED` activation remain
OPEN/OFF. C01 and C04 are CLOSED; C02 existing SendGrid correlation,
C03 existing Evia archive retrieval, and C05 final original canonical
release owner decision remain OPEN. Audit viewer fixes from
[PR #347](https://github.com/WasanthaK/khrental/pull/347) are in production,
but the actual historic audit PDF remains unproven.

The authoritative up-to-date register is
`docs/PHASE4-CONSOLIDATED-ACCEPTANCE.md`. This entry is evidence-only and
does not grant fresh production write, archive, mail or signing authority.


## Invoice date correction production accepted 2026-10-23

[PR #356](https://github.com/WasanthaK/khrental/pull/356) is deployed as
`2b5a769c51c47d613affd80d37d3360982ab1690` through successful
[workflow #39915623317](https://github.com/WasanthaK/khrental/actions/runs/39915623317).
The workflow proved Ready revision **0000324**, an exact public build SHA,
and MSSQL connection ready. PR regression and disposable two-tenant SQL
billing acceptance passed; main verification/build also passed.

Authenticated browser acceptance on existing demo invoice **26102301**
confirmed the issue date **October 23, 2026** and due date **March 1, 2027**
now match its previously validated PDF. A fresh downloaded text account
summary contains those same dates. No invoice was reissued or email resent
for this verification. **Date display correction CLOSED.**

Evidence reconciliation [PR #357](https://github.com/WasanthaK/khrental/pull/357)
is merged. C03 now has successful authenticated signed-agreement retrieval
with both signatures visible; its local signing audit still returns HTTP
404. The owner confirms that audit trails exist in Evia. The next bounded
repair is independent retrieval/retention of the existing provider audit,
with agreement/request association and authorization preserved, without
re-signing. C02 provider/ledger correlation, C03 complete audit evidence,
I02 real invoice archive acceptance and C05 release decision remain OPEN.
General invoice archive activation and invoice-master UI activation remain OFF.


## Audit recovery deployment and acceptance checkpoint 2026-10-23

[PR #358](https://github.com/WasanthaK/khrental/pull/358) passed all four PR
checks and deployed as `e46a42b8911bbd8989f904c5539a6ba2ee27184f` in
[workflow #39919876580](https://github.com/WasanthaK/khrental/actions/runs/39919876580).
The verifier proved Ready revision **0000325**, matching public build SHA,
and live MSSQL connectivity. The recovery action is visible on the existing
agreement audit error. **Deployment PASS; live audit recovery NOT YET PASS.**

The authenticated browser pilot on agreement **#47FDEA13** stopped before
provider/storage activity with **Evia Sign authentication is required**.
The client unnecessarily demanded a separate browser signing session,
although recovery already supports the configured server-side Evia
integration key. A narrow follow-up removes that client prerequisite and
adds a regression proving server-key exchange and one expired-token retry.
Its build and nine recovery tests pass locally; CI/deployment and live
existing-audit retrieval remain pending. No re-signing, email, agreement
status change or signed-PDF overwrite occurred during the failed attempt.
C03 remains open until real existing provider audit retrieval/access is proven.

## Quixo.Homes Stripe-only SaaS billing canonical decision — 2026-10-23

**New product/architecture decision; supersedes any implicit earlier SaaS trial or internally managed tier proposal, but does not waive original Phase 4/5 acceptance.** Owner-approved SaaS price is **USD $5 per independently rentable dwelling per month**, **monthly only**, **no free trial**. Quixo.Homes B2B SaaS products, prices, invoices, subscription management and tax/payment configuration are managed in **Stripe**, not an application-side plan/pricing console. Rental seekers remain free; landlord/tenant rent invoices are a separate business/issuer domain.

Authoritative new specification: [QUIXO-HOMES-STRIPE-SAAS-BILLING.md](QUIXO-HOMES-STRIPE-SAAS-BILLING.md). Decision gate **B01 CLOSED**. Stripe Managed Payments merchant-of-record eligibility, supported country tax coverage, dwelling counting/proration and organization self-service signup remain **B02–B04 OPEN**. Test-mode catalog/integration and pilot acceptance are **B05–B07 NOT STARTED/BLOCKED**, respectively. Current Stripe connector exposes Quixo, Inc. in test mode, but this document creates no Stripe objects and does not demonstrate Managed Payments eligibility. Do not create live prices or charges from this plan alone.

**Critical signup correction:** existing public sign-up defaults new renter registration into the fixed `kh-rentals` tenant; that behavior is incompatible with public rental seekers and cross-region SaaS organization creation. Redesign global identity, seeker account, new organization membership and verified tenancy invitations before opening regional public signup. Stripe-billed dwelling quantities must be reconciled from server-verified inventory, not customer-edited freely in Stripe's portal.

**Existing release fences remain intact:** C02 existing SendGrid event correlation, C03 automatic Evia signing audit acceptance, C05 final original release approval and I02 controlled immutable invoice archive remain independently open. No Stripe live writes, signed-PDF alterations, SQL migration, email send or existing tenant membership mutation is authorized by this planning entry.

### Stripe B02/B03 feasibility follow-on — 2026-10-23

The **read-only** [B02/B03 evidence and proposal](QUIXO-STRIPE-B02-B03-READINESS.md) is now the active Stripe workstream review. The connected Quixo, Inc. account is US-based/standard/corporation **in test mode**, with `charges_enabled=false`, `payouts_enabled=false`, and `details_submitted=false` as observed. Stripe Managed Payments acceptance/tax jurisdictions **are not yet approved**, so **B02 remains OPEN**. The billable dwelling model, proration/downgrade, zero units, cancellation and grace policies are written as **recommendations only** and await owner decision; **B03 remains OPEN**. Paid rollout and any Stripe object/charge creation remain unauthorized by this documentation.

### B03 dwelling billing policy approval — 2026-10-23

Owner confirmed the eight previously summarized proposed rules: **1 standalone residential house = 1 dwelling; 12 independently rentable apartments = 12 not 13; managed vacant and unpublished units remain billable; mid-cycle additions are prorated; reductions take effect on the next renewal; failed renewals receive a 7-day grace period before restricting new paid-management operations; cancellation preserves records and historical renter access**. Existing USD 5/month/dwelling, no-trial and Stripe-only Product/Price decisions remain intact. [B03 governing decision](QUIXO-STRIPE-B02-B03-READINESS.md#b03-owner-confirmation--approved-dwelling-charging-rules-2026-10-23).

**Gate distinction:** Core B03 commercial policy **APPROVED**, but operational details (zero-dwelling signup, exact proration invoicing, archival controls, reactivation) and technical Stripe acceptance **OPEN**. B02 account/Managed Payments acceptance remains OPEN. Do not create Stripe products, prices, subscriptions, charges or enable entitlement enforcement solely because of policy sign-off. B04 seeker/operator signup redesign can proceed at the architecture/test-design level independent of Stripe account activation.


### B04 public account and owner signup architecture — 2026-10-23

A bounded, **design-only** [B04 signup architecture](QUIXO-HOMES-B04-SIGNUP-ARCHITECTURE.md) records the distinct public rental seeker, subscription-owning organization and verified existing-tenant journeys. Current `/auth/sign-up` still creates a `rentee` linked to legacy `kh-rentals`, while current SQL `app_users.tenant_id` is nullable and many tenant routes still use legacy fallback. **No public marketplace registration is accepted as ready.** B04 design is documented; S1 caller/security audit, approved schema and explicit no-membership authorization proof come first. No code, migrations, customer signup, features or production changes were executed as part of the design review.

### B04 S1 public signup caller audit and fail-closed claim defense — 2026-10-23

The first bounded B04 work package documents [the server/browser signup and invitation caller map](QUIXO-B04-S1-SIGNUP-CALLER-AUDIT.md). The secure invitation router runs before the legacy platform signup handler, but its **preflight alone was not enough**: the shared `ensureAuthRecord()` helper still allowed an existing unclaimed app-user identity to be attached to a new credential by email. This slice adds default-deny claim checking inside the helper and tests, keeping the existing admin invite compatibility path separate and documenting it for later removal.

**B04 remains OPEN.** The current public registration still auto-creates a `rentee` in legacy `kh-rentals`, so it is **not regional seeker signup**. Full transactional identity creation, email ownership proof, zero-membership authorization and organization self-provisioning remain independent follow-ons. Do not enable public marketplace signup, create live Stripe objects, or treat this security patch as B02/B04 rollout acceptance.

### B04 S2a no-membership business-route boundaries — 2026-10-23

[Global identity persistence contract and S2a safety gate](QUIXO-B04-S2-GLOBAL-IDENTITY-DATA-CONTRACT.md) has been added for the Quixo.Homes public seeker/organization onboarding workstream. Existing schema already permits `app_users.tenant_id = NULL` with no `tenant_memberships`, but the public registration path still auto-attaches fresh identities to `kh-rentals`. No public seeker signup has been activated.

S2a adds a **requireUser + requireTenant** boundary for the existing generic platform query/RPC and platform storage routes and tests that a global account with zero active memberships resolves to no tenant, cannot request a foreign tenant and cannot enter generic tenant APIs. Public credential and identity context endpoints remain independent of tenant membership. **The existing `legacy-user-tenant` fallback remains an explicitly open security/migration concern** and must be addressed with an inventory and two-tenant tests before claiming full regional signup isolation. B04 S2b–S4 still OPEN; the changes do not authorize live Stripe objects, SQL/user record migrations, emails or activation of any regional signup feature.


### B04 S2b revoked-membership legacy fallback containment — 2026-10-23

[Revocation-aware legacy tenant and proposed verified registration model](QUIXO-B04-S2B-REGISTRATION-AND-LEGACY-ACCESS.md) follows S2a. A preexisting `app_users.tenant_id` must **not** restore business access when a user has any recorded `tenant_memberships` history but no currently active membership, including revoked/inactive memberships or inactive organizations. The tenant resolver now checks **any** recorded membership status before permitting legacy compatibility and defaults to no fallback without explicit evidence. Users with no membership rows may temporarily retain legacy access; the read-only aggregate reconciliation and backfill/removal remain OPEN. New public seeker signup remains disabled. The recommended separate pending email-verification ledger and atomic post-verification identity transaction are **design only**, not a migration or public signup activation. Two-tenant physical acceptance and CI/Ready deployment proof are required to mark runtime complete.

### B04 S2b historical identity reconciliation — 2026-10-23

The next B04 release adds `scripts/audit-identity-memberships-readonly.mjs` and a narrowly scoped Production OIDC diagnostic workflow `.github/workflows/audit-production-identity-memberships.yml`. It executes **only aggregate SQL SELECT queries** inside the exact Ready Azure Container App revision and outputs no emails, names, GUIDs, credentials or account rows. Counts include legacy tenant pointers with no membership history, pointers with revoked/inactive history, stale pointers, mismatched auth links and tenantless global profiles. Authorization regression tests enforce the read-only and privacy contracts.

**Status until actual workflow output:** audit tool implemented, aggregate results **NOT YET VERIFIED**. This audit does not backfill or delete memberships, remove the remaining legacy fallback, send customer email, create seeker accounts, change Stripe billing or activate public signup. Any production reconciliation/migration must be a separately accepted gated action with supporting evidence. See [S2b legacy access contract](QUIXO-B04-S2B-REGISTRATION-AND-LEGACY-ACCESS.md).


### B04 S2b legacy fallback retirement after actual SQL reconciliation — 2026-10-23

[Production aggregate-only audit #39970659512](https://github.com/WasanthaK/khrental/actions/runs/39970659512) **PASSED** on Azure Ready revision `0000333` (build SHA `7cbdc610ae8a21d65e2fbafe22e7e0d0e7517da2`). Observed: 19 `app_users` with a legacy tenant pointer; **zero** of those lacked any membership history; **zero** had historical membership but no active membership; **zero** had a stale pointer without matching active membership. Global tenantless/no-membership profiles: **1**. Three auth-link inconsistency aggregates were all zero. No PII was returned.

As a result the `legacy-user-tenant` fallback and historical-membership exception are removed in the next bounded PR; **an active tenant membership becomes mandatory for business tenant resolution**. This release changes code and tests only, not user records. The audit counts are a point-in-time production snapshot, not proof that every login, account claim, dedicated route, or regional signup is ready. Full B04 global email verification, race-safe identity creation and no-membership session UI remain OPEN.


### Canonical work advance — B04 S3a pending verification foundation (2026-10-23)

**Latest B04 completed security evidence:** the aggregate-only membership audit [#39970659512](https://github.com/WasanthaK/khrental/actions/runs/39970659512) returned 0 legacy-only, inactive-history-only, stale-pointer and mismatched auth-link cases. PR [#373](https://github.com/WasanthaK/khrental/pull/373) **merged**, retiring legacy tenant fallback for business authority. PR #374 is a separately tracked read-only audit reporting fix and is **not** assumed merged. Global seeker signup remains disabled.

**One active next work item: B04 S3 — verified global identity registration.** First narrowly scoped S3a foundation stages [hash-only verification challenge SQL and token contract](QUIXO-B04-S3A-PENDING-VERIFICATION-LEDGER.md). The separate pending ledger migration is **not applied** to production; S3b redemption transaction, SendGrid delivery and S3c safe no-membership UX are **not implemented**. No live public signup or organization self-registration activation. Do not treat a local test pass or PR as Azure Ready production verification.

**Stripe B01–B07 (parallel, release-gated):** B01 commercial policy closed ($5/dwelling/month, no trial); B03 eight core rules approved; mid-cycle dwelling additions prorated from activation and the adjustment collected on the **next regular invoice** (not an immediate one-off payment), removal from next renewal, 7-day failed-renewal grace and auditable admin comp approved. Stripe **test-only** account `acct_1UTgcdQ4sARuLNQa` ("Quixo Homes sandbox") has Product `prod_VUjs23Auy0fWYE`, recurring Price `price_1UTkOuQ4sARuLNQaJnbZ03Hs`, tax code `txcd_10103001`, complimentary coupon fixtures `d1GbfhZM` and `atRDz5AU`, and limited customer portal `bpc_1UTku3Q4sARuLNQanUojlMVj`. **B02** Managed Payments/tax acceptance and account ID reconciliation with the originally owner-identified `acct_1UTgcELiLhw7y1tf` remain OPEN. **B05** secure Checkout, webhook, tenant-scoped subscription and quantity enforcement NOT COMPLETE. No live Stripe resources or charges.

**Approved pricing presentation:** Stripe-branded pricing information may be shown on Quixo.Homes, but a plain embeddable pricing-table purchase button must **not** directly grant a subscription or allow customer-selected unit quantities. The authenticated Quixo onboarding backend must create an organization-bound Stripe Checkout Session with a **server-derived** dwelling quantity, verified subscription ownership and webhook-confirmed payment. Merchant eligibility must be established separately for Managed Payments. Do not conflate SaaS invoice/coupons with landlord rent and deposits.

**Other release fences unchanged:** I02 immutable rent invoice archive, Evia audit and Phase 4 controlled acceptance stay governed independently. Do not repeat provider actions solely for evidence already accepted, invent production migration evidence or activate default-off pilots.


## One-property pilot preparation — verified continuation and deployment decision, 2026-10-27

The GitHub browser is authenticated as WasanthaK. The prior sign-in dependency is resolved. Existing private-controls enable [#40510702814](https://github.com/WasanthaK/khrental/actions/runs/40510702814) and shutdown [#40511599533](https://github.com/WasanthaK/khrental/actions/runs/40511599533) both succeeded against serving build `2760ad031f5cc92dcfc4d80e0bb9eccbf1694fe7`. Anonymous listing/media remain OFF. An observed startup SQL timeout cleared; live MSSQL health returned ready and authenticated selected-property access resumed.

Selected third-floor SOLACE RESIDENCE private listing settings show LK, blank public headline/location overrides and opt-out unselected. A fresh registered-image derivative, description “Exterior of the apartment building”, was prepared and previewed privately. It remains withheld / awaiting review; no fresh approval, withdrawal or anonymous publication was performed. The earlier completed private approval/withdrawal acceptance remains closed.

**Immediate prerequisite now ready for owner deployment decision:** [PR #436](https://github.com/WasanthaK/khrental/pull/436), exact head `0294bc7e51fc8159271559dd5372a5a784ba7e76`, adds the missing administrator-only opaque listing ID and server eligibility/public-field preview. [R4 #40511847591](https://github.com/WasanthaK/khrental/actions/runs/40511847591) passed API authorization/projection, native image and disposable two-tenant SQL checks; [application #40511847501](https://github.com/WasanthaK/khrental/actions/runs/40511847501) verification passed and PR deployment was skipped. PR is ready for review, **unmerged and not deployed**.

Automatic approval review rejected the requested merge because main code changes trigger production deployment and the current pilot-preparation instruction did not explicitly authorize that merge/deployment. No alternate merge route or bypass was attempted. Ask the owner to approve merging/deploying this concrete private-preview package; this is separate from public pilot activation. After deployment approval and successful rollout, read the exact live public ID/projection/eligibility and complete the remaining pilot readiness/review. No public activation decision is requested from incomplete private preview evidence.

Both LK and BN marketing search sources retain `data-public-listing-enabled="false"`. R1 closed, R3 single-replica conditional acceptance and deferred invoice archive R2 remain unchanged.


## PR #436 owner-authorized merge — deployment not accepted, 2026-10-27

Owner explicitly instructed “merge” after the concrete merge/deployment approval request. [PR #436](https://github.com/WasanthaK/khrental/pull/436) merged as `f631e7902a4fdae736a47ed6207271c503d81db9`. This supersedes the earlier pending-merge/automatic-approval rejection checkpoint; no approval bypass occurred. Exact PR-head build/authorization and R4 API/native-image/disposable two-tenant SQL checks passed. Main-branch verification also passed.

**Deployment remains unaccepted:** [run #40515503895](https://github.com/WasanthaK/khrental/actions/runs/40515503895), deploy job `122228878869`, built/pushed the image and passed R2 object validation/configuration, but final revision readiness step failed after 30 attempts. Recorded Azure result: latest revision `0000390`, latest ready `0000389`; new revision Provisioned, Activating, one replica, trafficWeight 0. Its console-log request connected but the inspected output did not establish a startup root cause. The system-log request itself rejected revision-scoped system-log parameters; that diagnostic error is not the application failure cause.

Independent public build-info read still returned prior build `2760ad031f5cc92dcfc4d80e0bb9eccbf1694fe7`. Do not claim the new private preview is live or enable pilot controls with the new SHA until actual serving/readiness evidence passes. Existing public listing gates were not enabled by this merge.

Existing [read-only revision diagnostic #40517299900](https://github.com/WasanthaK/khrental/actions/runs/40517299900), job `122234189706`, was dispatched with `restart_latest=false`; queued at the latest inspection. No restart, traffic shift, scaling, SQL migration or speculative source correction was performed. **Next dependency:** inspect this diagnostic, identify the startup/readiness cause, complete the authorized deployment and record matching build/SQL acceptance; then resume the private listing preview. Original R1 remains closed, R3 single-replica condition and deferred invoice R2 remain unchanged.
