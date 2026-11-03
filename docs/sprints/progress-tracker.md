## OAuth audit recovery alternative — 3 November 2026

Independent unauthenticated curl to the documented completed-document list returned HTTP 401 / application/json, while both integration-key exchange URL interpretations returned HTTP 404. This establishes a reachable authentication boundary, not successful OAuth document retrieval.

Human-triggered audit recovery now passes the existing Evia OAuth access token to the already-authorized audit-only backend route. The browser previously sent an empty body and forced the failing integration exchange. Expired tokens use the existing V2 refresh broker; a provider document 401 refreshes and retries once. Application-session rejection, tenant denial, missing documents and outages do not trigger OAuth refresh or fall back to the unavailable exchange. A missing/rejected Evia connection exposes Connect to Evia Sign using the existing authorization flow in a separate tab with no opener; the user then retries recovery. No signature request is created or resent.

PR #490 is merged and deployment #41626677557 succeeded. All five final-head CI workflows passed, including 849 application tests and database archive/replay acceptance. Live OAuth audit retrieval remains OPEN; no successful audit download is claimed. Do not repeat browser login attempts. See [audit recovery details](../EVIA-AUDIT-RECOVERY.md#oauth-audit-recovery-alternative--3-november-2026).

## Evia completed-package audit capture — 3 November 2026

Implemented verified completed-package download and audit-only late/replayed completion handling. Provider ZIP validation and conditional audit retention prevent signed-document overwrites. Local Evia 102/102 tests and build pass; authorization 839 pass with one Chrome-unavailable browser test. PR #489 merged; deployment #41617426391 succeeded at ready revision 0000449 with matching build and MSSQL readiness. CI 840/840 PASS. Fresh +514 live retest FAIL: stored audit HTTP 404 and built-in Evia recovery non-JSON HTTP 404. Independent authenticated curl run #41623929241 reproduced 404 at both origin-relative and Sign-prefixed exchange URLs; neither returned a token, so provider audit retrieval could not proceed. Existing audit acceptance remains OPEN pending a working retrieval route or verified provider package/audit re-delivery. See [audit recovery details](../EVIA-AUDIT-RECOVERY.md#completed-package-implementation--3-november-2026). The full rental lifecycle remains open.

## Agreement replacement and membership identity correction — 3 November 2026

Live demo acceptance found three linked blockers: the new-agreement renter list used legacy default-tenant identity filtering instead of the working membership directory; signing loaded the owner through that same obsolete association; and cancelling an unsigned offer-bound draft left no replacement path. Test4 remains an active member of JEERY’S PLACE. Do not deactivate or duplicate the identity to work around these defects.

The correction reuses the renter directory and fresh authenticated workspace context. Null API data remains null and owner-profile failures are retriable before saving/opening signing. A current accepted reservation may prepare a replacement only when the previous agreement is cancelled with no provider request, signature or activation evidence. The old agreement and links remain; replacement retains the accepted commercial version, dates, amounts, applicant, consent and reservation expiry, and records its predecessor. Expired/withdrawn reservations, revoked access and stale requests remain blocked.

Release: [PR #488](https://github.com/WasanthaK/khrental/pull/488) merged as `15034e5df0f828b7a575d904175effceef073bc4`. Production deployment 41601135559 succeeded, including latest-revision readiness and public browser build verification. The main verification suite passed 830 tests; focused browser identity/retry, enquiry, replacement-offer, and disposable-SQL tests also passed.

Post-deployment live acceptance: Test4 appears in the agreement renter directory. The cancelled original agreement `1C75A53E-B181-4A55-B055-BC2DAC02C230` remains preserved, and replacement `D13ECCF2-A82A-41DB-9EB7-3AB968440BB0` was created (offer version 4). Its signature request form loads Borris Johnson and Test4 with the landlord/tenant markers; the missing-user-data error is resolved. Replacement template `58196AA9-5AF0-4027-832C-9C8F8FD4B625` is available.

Remaining live acceptance: Evia Sign authentication was open when browser control became unavailable (two tool timeouts). Sending/delivery is not verified and must not be reported complete or blindly retried. Confirm provider state and the generated contract before sending the authorized demo request once. Overall goal remains the complete rental journey before subscription management.

---

# Multi-Tenant Progress Tracker

## Overall Status

- Program status: In progress
- Active sprint: Sprint 06 - Tenant-Scoped Storage
- Last updated: 2026-03-19

## Sprint Summary

| Sprint | Name | Status | Notes |
| --- | --- | --- | --- |
| 00 | Discovery and Design | Completed | Sprint plan, numbered sprint docs, and Docker/container requirements documented. |
| 01 | Schema Foundation and Backfill | Completed | Tenant foundation and backfill migrations executed successfully against local Docker MSSQL; richer legacy-schema validation is still pending. |
| 02 | Backend Tenant Context | Completed | Tenant-context middleware, request-header propagation, auth bootstrap, and endpoint validation completed. |
| 03 | Data Access Isolation | Completed | Repository-level tenant scoping, route enforcement, and invalid tenant-override validation were completed for core MSSQL business flows. |
| 04 | Platform API Hardening | Completed | Generic platform query and RPC protections now enforce tenant scope, reject tenant overrides, and block authenticated raw SQL. |
| 05 | Frontend Tenant Context | Completed | Auth state, tenant switching UX, tenant-scoped app remounting, and major stale-state screen patches are in place. |
| 06 | Tenant-Scoped Storage | In progress | New storage operations now resolve under tenant-scoped paths, block cross-tenant path overrides, and include legacy asset migration tooling. |
| 07 | Tenant Settings and Integrations | Not started | Pending tenant settings implementation. |
| 08 | Hardening, QA, and Release | Not started | Pending end-to-end tenant implementation. |
| 09 | Tenant Admin UI and Federated Auth | In progress | Admin-only tenant CRUD backend routes are in progress; federated auth is still pending. |

## Current Progress Details

### Completed
- Created the numbered sprint documentation set under [docs/sprints](README.md)
- Added Docker/container planning into the sprint documents
- Added container scaffolding:
  - [Dockerfile](../Dockerfile)
  - [docker-compose.yml](../docker-compose.yml)
  - [.dockerignore](../.dockerignore)
  - [.env.docker.example](../.env.docker.example)
  - [docs/docker-setup.md](../docker-setup.md)
- Added Sprint 01 migration groundwork:
  - [src/db/migrations/20260317_01_create_multi_tenant_foundation.sql](../../src/db/migrations/20260317_01_create_multi_tenant_foundation.sql)
  - [src/db/migrations/20260317_02_backfill_default_tenant.sql](../../src/db/migrations/20260317_02_backfill_default_tenant.sql)
- Fixed migration tooling:
  - [src/db/runMigration.js](../../src/db/runMigration.js)
  - [src/db/executeSql.js](../../src/db/executeSql.js)
- Added migration commands in [package.json](../../package.json)
- Started local Docker MSSQL and created the `khrental` database
- Executed Sprint 01 migrations successfully against local MSSQL:
  - [src/db/migrations/20260317_01_create_multi_tenant_foundation.sql](../../src/db/migrations/20260317_01_create_multi_tenant_foundation.sql)
  - [src/db/migrations/20260317_02_backfill_default_tenant.sql](../../src/db/migrations/20260317_02_backfill_default_tenant.sql)
- Validated local Sprint 01 results:
  - `tenants`, `tenant_memberships`, and `tenant_settings` tables exist
  - default tenant row exists with slug `default`
  - one `tenant_settings` row exists for the default tenant
- Started Sprint 02 backend tenant-context implementation:
  - [src/api/tenant/context.js](../../src/api/tenant/context.js)
  - [src/services/requestContext.js](../../src/services/requestContext.js)
  - [src/api/mssql/router.js](../../src/api/mssql/router.js)
  - [src/api/platform/router.js](../../src/api/platform/router.js)
  - [src/services/platformClientCore.js](../../src/services/platformClientCore.js)
  - [src/services/mssqlApiClient.js](../../src/services/mssqlApiClient.js)
- Completed Sprint 02 tenant-context closeout:
  - [src/hooks/useAuth.jsx](../../src/hooks/useAuth.jsx)
  - [src/services/platformClient.js](../../src/services/platformClient.js)
- Documented the backend tenant request contract in [src/api/README.md](../../src/api/README.md)
- Verified the application still builds successfully after Sprint 02 groundwork changes
- Verified tenant-context endpoint behavior end-to-end with local seeded test data:
  - `/api/mssql/me`
  - `/api/platform/auth/context`
- Fixed platform client facade exports so the Node runtime can load the compatibility layer cleanly
- Started Sprint 03 repository and route isolation work:
  - [src/api/mssql/repositories.js](../../src/api/mssql/repositories.js)
  - [src/api/mssql/router.js](../../src/api/mssql/router.js)
- Added tenant-aware repository enforcement for:
  - `app_users`
  - `properties`
  - `property_units`
  - `agreement_templates`
  - `invoices`
  - `agreements`
- Added tenant ownership validation for agreement and invoice writes
- Validated scoped route behavior locally:
  - active-tenant `app-users/lookup` succeeds
  - invalid tenant override is rejected with `TENANT_ACCESS_DENIED`
- Verified the application still builds successfully after Sprint 03 groundwork changes
- Completed core Sprint 04 platform hardening:
  - [src/api/platform/router.js](../../src/api/platform/router.js)
  - [server.js](../../server.js)
- Added tenant-safe enforcement for generic platform actions:
  - automatic tenant filters for tenant-owned reads
  - automatic tenant payload scoping for tenant-owned writes
  - rejection of client-supplied `tenant_id` overrides
  - authenticated runtime block on `exec_sql`
- Validated platform hardening locally:
  - tenant-scoped `/api/platform/query` succeeds for the active tenant
  - tenant override attempts return `TENANT_OVERRIDE_BLOCKED`
  - authenticated `/api/platform/rpc/exec_sql` returns `RPC_BLOCKED`
- Started Sprint 05 frontend tenant-context implementation:
  - [src/hooks/useAuth.jsx](../../src/hooks/useAuth.jsx)
  - [src/components/common/TenantSwitcher.jsx](../../src/components/common/TenantSwitcher.jsx)
  - [src/components/layouts/DashboardLayout.jsx](../../src/components/layouts/DashboardLayout.jsx)
  - [src/components/layouts/RenteePortalLayout.jsx](../../src/components/layouts/RenteePortalLayout.jsx)
  - [src/components/navigation/Header.jsx](../../src/components/navigation/Header.jsx)
- Added frontend tenant-aware auth state:
  - active tenant and membership exposure in `useAuth()`
  - tenant refresh and switch actions
  - explicit no-tenant state for authenticated users without memberships
- Added shared tenant switcher UX:
  - single-tenant badge behavior for minimal UI change
  - multi-tenant selector for membership switching
- Added tenant-scoped app remount behavior in [src/App.jsx](../../src/App.jsx) so route trees and shared providers refresh automatically after tenant switching
- Added tenant-scoped React Query isolation in [src/App.jsx](../../src/App.jsx) so cached query results do not carry over between tenants
- Patched key staff and rentee list/dashboard screens to refetch on active-tenant changes and clear stale local state:
  - [src/pages/PropertyList.jsx](../../src/pages/PropertyList.jsx)
  - [src/pages/InvoiceList.jsx](../../src/pages/InvoiceList.jsx)
  - [src/pages/AgreementList.jsx](../../src/pages/AgreementList.jsx)
  - [src/pages/MaintenanceList.jsx](../../src/pages/MaintenanceList.jsx)
  - [src/pages/rentee/RenteePortal.jsx](../../src/pages/rentee/RenteePortal.jsx)
  - [src/pages/rentee/RenteeInvoices.jsx](../../src/pages/rentee/RenteeInvoices.jsx)
  - [src/pages/rentee/RenteeAgreements.jsx](../../src/pages/rentee/RenteeAgreements.jsx)
  - [src/pages/rentee/RenteeMaintenance.jsx](../../src/pages/rentee/RenteeMaintenance.jsx)
  - [src/pages/rentee/RenteeUtilities.jsx](../../src/pages/rentee/RenteeUtilities.jsx)
- Patched remaining tenant-sensitive detail and utility screens to refresh on active-tenant changes:
  - [src/pages/MaintenanceDetails.jsx](../../src/pages/MaintenanceDetails.jsx)
  - [src/pages/rentee/RenteeMaintenanceDetails.jsx](../../src/pages/rentee/RenteeMaintenanceDetails.jsx)
  - [src/pages/rentee/UtilityHistory.jsx](../../src/pages/rentee/UtilityHistory.jsx)
  - [src/pages/rentee/UtilityReadingForm.jsx](../../src/pages/rentee/UtilityReadingForm.jsx)
- Verified the application still builds successfully after Sprint 05 groundwork changes
- Started Sprint 06 tenant-scoped storage groundwork:
  - [src/api/platform/router.js](../../src/api/platform/router.js)
  - [src/services/platformClientCore.js](../../src/services/platformClientCore.js)
  - [src/services/fileService.js](../../src/services/fileService.js)
- Added tenant-scoped storage enforcement:
  - authenticated storage writes resolve under `tenants/<tenantId>/...`
  - client storage helpers scope relative paths to the active tenant
  - cross-tenant storage path overrides are blocked
  - legacy non-tenant file reads remain available
- Patched direct/manual upload flows to persist public URLs from tenant-scoped upload paths:
  - [src/services/paymentService.js](../../src/services/paymentService.js)
  - [src/pages/rentee/UtilityReadingForm.jsx](../../src/pages/rentee/UtilityReadingForm.jsx)
  - [src/components/utilities/UtilityMeterForm.jsx](../../src/components/utilities/UtilityMeterForm.jsx)
  - [src/pages/RenteeForm.jsx](../../src/pages/RenteeForm.jsx)
  - [src/services/agreementService.js](../../src/services/agreementService.js)
  - [src/services/eviaSignService.js](../../src/services/eviaSignService.js)
  - [src/services/DocumentService.js](../../src/services/DocumentService.js)
- Added tenant-storage validation tooling:
  - [scripts/validate-tenant-storage.mjs](../../scripts/validate-tenant-storage.mjs)
  - [package.json](../../package.json)
- Added legacy asset migration tooling for tenant-prefixed storage adoption:
  - [scripts/migrate-legacy-storage-assets.mjs](../../scripts/migrate-legacy-storage-assets.mjs)
  - [package.json](../../package.json)
- Added dry-run/apply support for legacy asset URL migration across key tenant-owned tables:
  - `maintenance_request_images.image_url`
  - `utility_readings.photourl`
  - `invoices.paymentproofurl`
  - `agreements.signed_document_url`
  - `agreements.pdfurl`
- Extended legacy asset migration coverage for additional tenant-owned asset fields:
  - `app_users.id_copy_url`
  - `app_users.profile_image_url`
  - `properties.images`
- Extended agreement legacy document/signature coverage for:
  - `agreements.documenturl`
  - `agreements.signeddocumenturl`
  - `agreements.signed_document_url`
  - `agreements.signatureurl`
  - `agreements.signature_pdf_url`
  - `agreements.pdfurl`
- Completed a remaining URL-field audit across the MSSQL repository layer and service workflows:
  - main known tenant-owned persisted storage fields are covered by the migration tool
  - `agreements.documenturl` may still contain inline HTML content in some flows and is therefore only migratable when it contains a real file URL
  - `user_profiles.profile_image_url` remains a legacy frontend reference outside the current MSSQL repository-backed tenant migration scope
- Prevented new inline-HTML `documenturl` writes in [src/components/agreements/AgreementFormContainer.jsx](../../src/components/agreements/AgreementFormContainer.jsx) by keeping HTML in `processedcontent` until a real document file URL is generated
- Improved migration reporting in [scripts/migrate-legacy-storage-assets.mjs](../../scripts/migrate-legacy-storage-assets.mjs) so inline HTML payloads are counted separately as `htmlContent`
- Decided that historical inline-HTML `agreements.documenturl` records will remain compatibility-only:
  - existing records are still viewable because [src/components/agreements/AgreementDocument.jsx](../../src/components/agreements/AgreementDocument.jsx) supports inline HTML rendering
  - new records no longer write inline HTML into `documenturl`
  - the migration script reports these rows but does not attempt file-copy conversion
- Removed the active `user_profiles` dependency from dashboard/profile flows:
  - [src/pages/UserProfile.jsx](../../src/pages/UserProfile.jsx) now uses `app_users`
  - [src/components/layouts/DashboardLayout.jsx](../../src/components/layouts/DashboardLayout.jsx) now persists preferred language locally
  - [src/hooks/useAuth.jsx](../../src/hooks/useAuth.jsx) now hydrates stored preferred language for the active user
  - [src/utils/userPreferences.js](../../src/utils/userPreferences.js) centralizes local preference storage
- Hardened the migration script so it skips missing local tables or columns gracefully by checking MSSQL metadata before scanning each target
- Validated apply-mode migration locally with temporary seeded fixtures for `app_users` and `properties.images`:
  - legacy `/storage/...` URLs were detected correctly
  - files were copied into `tenants/<tenantId>/...`
  - MSSQL URLs and JSON-backed property image arrays were rewritten successfully
  - temporary validation fixtures were cleaned up after verification
- Validated tenant-scoped storage behavior locally:
  - uploads are written under the active tenant prefix
  - listing resolves the tenant-scoped directory
  - cross-tenant storage path overrides are rejected with `TENANT_STORAGE_OVERRIDE_BLOCKED`
  - scoped delete cleanup succeeds
- Verified the application still builds successfully after Sprint 06 storage groundwork changes
- Revalidated the legacy asset report after the inline-HTML cleanup; `npm run migrate:tenant-storage-assets` still runs successfully
- Verified `user_profiles` no longer appears in active source references under [src](../../src)
- Hardened Docker/public-route auth behavior during local container testing:
  - removed the duplicate global `PropertyProvider` mount so property bootstrap does not run twice
  - updated [src/contexts/PropertyContext.jsx](../../src/contexts/PropertyContext.jsx) to defer protected property loading until auth has finished and a tenant-backed user context exists
  - routed MSSQL property reads through the shared request-context client so Docker browser sessions send `x-auth-id`, `x-user-email`, and `x-tenant-id` headers consistently
- Hardened Docker dev-bypass behavior for local testing:
  - added client request propagation for a local-only `x-dev-bypass-role` header when no real auth session exists
  - updated [src/api/tenant/context.js](../../src/api/tenant/context.js) to resolve a synthetic local user plus fallback tenant when dev bypass is explicitly enabled
  - short-circuited unauthenticated app-user list fetches in [src/services/appUserRepository.js](../../src/services/appUserRepository.js) so public routes do not spam `/api/mssql/app-users`
  - removed the module-load utility schema probe in [src/services/utilityBillingService.js](../../src/services/utilityBillingService.js) so login/public routes do not trigger background platform RPCs
- Hardened Docker compatibility mode for partial local schemas:
  - updated [src/api/platform/router.js](../../src/api/platform/router.js) so `select` queries against missing MSSQL tables or columns return empty compatibility results instead of surfacing a 500 during local dashboard testing
- Hardened Docker agreement compatibility for sparse local schemas:
  - updated [src/pages/AgreementList.jsx](../../src/pages/AgreementList.jsx) and [src/hooks/useAgreement.js](../../src/hooks/useAgreement.js) to use the shared MSSQL request client so agreement reads include auth and tenant headers
  - updated [src/api/mssql/router.js](../../src/api/mssql/router.js) so missing `agreement_templates` tables return controlled compatibility responses instead of raw 500s
  - extended [src/api/mssql/router.js](../../src/api/mssql/router.js) so missing `agreements` schema also returns controlled empty/read-not-found responses instead of surfacing 500s during local Docker testing
  - updated [src/services/agreementService.js](../../src/services/agreementService.js) so template operations stop cascading into a second failing platform write when the local schema does not include `agreement_templates`
- Added a local MSSQL agreement-template schema migration for Docker test environments:
  - [src/db/migrations/20260317_03_create_agreement_templates.sql](../../src/db/migrations/20260317_03_create_agreement_templates.sql)
- Executed the local Docker agreement-template migration against `khrental-mssql` and verified the template create flow succeeds again through `/api/mssql/agreement-templates`
- Added a local MSSQL agreement workflow schema migration for Docker test environments:
  - [src/db/migrations/20260318_01_create_local_agreement_workflow_schema.sql](../../src/db/migrations/20260318_01_create_local_agreement_workflow_schema.sql)
- Executed the local Docker agreement workflow migration against `khrental-mssql` and verified these list endpoints now read real MSSQL tables without 500s:
  - `/api/mssql/agreements`
  - `/api/mssql/property-units`
  - `/api/mssql/invoices`
- Seeded minimal local agreement test data in Docker MSSQL for interactive verification:
  - one apartment property
  - one unit under that property
  - one rentee user
- Validated the live Docker agreement persistence path end-to-end:
  - agreement create via `/api/mssql/agreements` succeeds
  - agreement update via `/api/mssql/agreements/:id` now persists `title`, `terms`, and `notes`
  - agreement fetch via `/api/mssql/agreements/:id` returns the updated joined agreement payload without server errors
- Decoupled local dev-bypass tooling from `NODE_ENV` so Docker can keep serving the production bundle while still exposing local test shortcuts when `VITE_ENABLE_DEV_BYPASS=true`:
  - added `VITE_ENABLE_DEV_BYPASS` to generated browser env config
  - updated auth/login dev-bypass checks to use the explicit runtime flag instead of `process.env.NODE_ENV`
  - enabled the flag by default in [docker-compose.yml](../../docker-compose.yml) for local container testing
- Added a local MSSQL properties schema augmentation migration for Docker test environments:
  - [src/db/migrations/20260319_01_augment_local_properties_schema.sql](../../src/db/migrations/20260319_01_augment_local_properties_schema.sql)
- Executed the local Docker properties schema migration against `khrental-mssql` and verified `/api/platform/query` now returns rich property rows without 500s when selecting legacy UI fields including:
  - `unitconfiguration`
  - `checklistitems`
  - `description`
  - `squarefeet`
  - `yearbuilt`
  - `availablefrom`
  - `amenities`
  - `electricity_rate`
  - `water_rate`
- Added a local MSSQL property coordinates migration for Docker test environments:
  - [src/db/migrations/20260319_02_add_property_coordinates.sql](../../src/db/migrations/20260319_02_add_property_coordinates.sql)
- Hardened local Docker dev-bypass compatibility for non-GUID identity values:
  - [src/api/mssql/repositories.js](../../src/api/mssql/repositories.js) now returns controlled null results when `app_users/:id` style routes receive a non-`uniqueidentifier` id
  - [src/api/platform/router.js](../../src/api/platform/router.js) now degrades invalid `uniqueidentifier` filters in generic platform select/update/delete/upsert operations to empty compatibility results instead of surfacing a 500
  - [src/components/maintenance/MaintenanceRequestForm.jsx](../../src/components/maintenance/MaintenanceRequestForm.jsx), [src/components/maintenance/MaintenanceRequestList.jsx](../../src/components/maintenance/MaintenanceRequestList.jsx), and [src/components/maintenance/MaintenanceRequestDetails.jsx](../../src/components/maintenance/MaintenanceRequestDetails.jsx) no longer pass dev-bypass auth ids where `app_users.id` values are required
- Started Sprint 09 backend foundation for tenant administration:
  - [src/api/mssql/repositories.js](../../src/api/mssql/repositories.js) now exposes admin-oriented tenant list, get, create, and update helpers with `tenant_settings` hydration
  - [src/api/mssql/router.js](../../src/api/mssql/router.js) now exposes admin-only tenant CRUD endpoints under `/api/mssql/admin/tenants`
  - [src/api/mssql/repositories.js](../../src/api/mssql/repositories.js) now exposes tenant membership list, create, update, and delete helpers with default-tenant synchronization back into `app_users.tenant_id`
  - [src/api/mssql/router.js](../../src/api/mssql/router.js) now exposes admin-only tenant membership endpoints under `/api/mssql/admin/tenants/:tenantId/memberships`
  - [src/api/mssql/repositories.js](../../src/api/mssql/repositories.js) now filters `app_users` create/update payloads against the actual local MSSQL column set, generates ids when the table has no default constraint, and normalizes missing compatibility fields so reduced local schemas no longer 500 on user create/update routes
  - [src/api/mssql/router.js](../../src/api/mssql/router.js) now exposes an admin-only global app-user listing route under `/api/mssql/admin/app-users` so tenant membership assignment can search existing app users without tenant scoping conflicts
  - [src/pages/TenantAdmin.jsx](../../src/pages/TenantAdmin.jsx), [src/services/tenantAdminService.js](../../src/services/tenantAdminService.js), [src/routes.jsx](../../src/routes.jsx), and [src/components/layouts/DashboardLayout.jsx](../../src/components/layouts/DashboardLayout.jsx) now add the first platform-admin tenant management UI for tenant CRUD and membership assignment under `/dashboard/tenant-admin`
  - [src/api/mssql/router.js](../../src/api/mssql/router.js), [src/services/tenantAdminService.js](../../src/services/tenantAdminService.js), and [src/pages/TenantAdmin.jsx](../../src/pages/TenantAdmin.jsx) now support admin-side app-user creation inside the tenant admin flow, so clean local Docker databases no longer need pre-seeded users before membership assignment can begin
- Started a first-pass UI design-system cleanup for the most visible shared surfaces:
  - [src/index.css](../../src/index.css) now defines one consistent set of design tokens, page/panel/auth utility classes, and removes conflicting scaffold-era global styles that were fighting page-level layouts
  - [src/App.css](../../src/App.css) no longer injects the old Vite demo layout constraints into the live application shell
  - [src/components/ui/Button.jsx](../../src/components/ui/Button.jsx), [src/components/ui/FormInput.jsx](../../src/components/ui/FormInput.jsx), and [src/components/ui/FormSelect.jsx](../../src/components/ui/FormSelect.jsx) now align to the shared brand styling instead of older ad hoc control treatments
  - [src/components/layouts/DashboardLayout.jsx](../../src/components/layouts/DashboardLayout.jsx) now uses the same brand shell, navigation states, and surface treatment as the new admin work instead of a separate legacy sidebar visual language
  - [src/pages/Login.jsx](../../src/pages/Login.jsx), [src/pages/Settings.jsx](../../src/pages/Settings.jsx), and [src/pages/TenantAdmin.jsx](../../src/pages/TenantAdmin.jsx) now share the same page hero, panel, and control vocabulary

### In Progress
- Sprint 06 tenant-scoped storage
- Sprint 09 tenant admin backend foundation
- Sprint 09 tenant admin UI
- Shared UI design-system consolidation across remaining legacy pages
- Broad manual regression coverage is still needed across tenant-switch and tenant-storage flows
- Legacy asset migration still needs execution against richer real-world data before Sprint 06 can close

### Blockers / Notes
- The current local Docker database is still a partial baseline and may still be missing other legacy application tables outside the core agreement workflow path
- Direct CLI execution of some frontend service modules is still awkward under raw local Node because parts of the app rely on bundler-resolved extensionless imports; runtime verification should prefer the live Docker app/API path unless those imports are normalized
- Because those tables are absent locally, tenant backfill coverage for legacy rows and seed memberships could not be fully exercised in this validation pass
- Temporary local `app_users` rows and memberships were created only for endpoint validation and cleaned up afterward
- The reduced local `app_users` schema still does not persist `status` or `active`; the API now ignores those unsupported writes and returns compatibility defaults instead of surfacing 500s
- Broader end-to-end validation for property, invoice, and agreement scoping still needs a richer local schema snapshot and sample data
- Any legitimate admin or operational raw-SQL workflows will need a clearly separate non-runtime path rather than the generic authenticated platform API
- Some legacy pages may still have local state assumptions that need targeted regression checks after tenant switching
- Legacy uploaded assets now have migration tooling, but current compatibility still relies on preserved read paths until the script is run against real data
- Some agreement records may still store inline HTML in `documenturl`, but this is now an accepted compatibility-only case rather than an open migration blocker
- UI consistency is improved at the shared shell/login/settings/tenant-admin layer, but other legacy pages still need migration onto the same card, form, and navigation primitives before the app will feel fully unified

### Next Steps
- Run browser-based validation on the new `/dashboard/tenant-admin` screen, especially create-user then create-membership flows and current-user membership edits that change tenant-switch behavior.
- Extend the new design-system pass to remaining high-traffic legacy screens such as `AdminDashboard`, property forms, and rentee-facing entry points.
- Confirm the permission model for platform-admin tenant actions versus tenant-scoped admin settings.
- Decide whether Google and Microsoft sign-in should be mandatory for production rollout or introduced behind a staged feature flag.
- Define the provider callback and redirect strategy for both local Docker and hosted environments before frontend auth work begins.
1. Run the legacy asset migration tooling against richer data and verify copied files plus updated MSSQL references
2. Add broader negative validation for cross-tenant property, invoice, agreement, and storage access in richer multi-tenant data scenarios
3. Import a richer local schema snapshot for deeper end-to-end multi-tenant verification
4. Run full tenant-storage migration and regression checks against richer real-world data

## Update Rules

Update this file when:
- a sprint starts or finishes
- a migration is added, executed, or rolled back
- scope changes materially
- a blocker or major risk is discovered

## Status Values

Use one of these values consistently:
- Not started
- In progress
- Blocked
- Completed
