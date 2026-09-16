# Phase 4 — Tenancy Onboarding & Activation

## Status

Implementation branch: `phase-4-tenancy-onboarding`

This phase starts from the Phase 3 production access model. Administrator / Staff / Tenant portal authorization, staff property assignment scope, secure invitation redemption, and the existing agreement/Evia signing workflow remain authoritative and are reused rather than replaced.

## Grounded tenancy model

The existing `agreements` record is the tenancy spine:

- `tenant_id` — KH Rentals organization boundary
- `renteeid` — tenant/app user
- `propertyid` — property
- `unitid` — optional unit for apartment/unit tenancy
- `startdate`, `enddate`, `rentamount`, `depositamount` — contract terms
- agreement/signature state — existing Evia workflow

Phase 4 adds operational evidence around this spine instead of creating a second tenancy master table.

## Onboarding sequence

1. **Tenant record + secure invitation**
   - tenant/app-user is created using the existing user workflow
   - server-issued invitation is sent using the existing invitation service
   - activation requires the invitation/account to have been accepted and an active tenant membership to exist
2. **Property / unit assignment**
   - stored on the agreement
   - `unitid` must belong to the selected `propertyid`
   - staff may operate only on properties assigned by the Phase 3 property scope model
3. **Confirmation advance / security deposit**
   - `agreements.depositamount` remains the contractual security-deposit requirement
   - actual receipts are recorded in `tenancy_deposit_transactions`
   - confirmation advance and security deposit are distinct transaction types
   - confirmation advance does not silently satisfy the contractual security deposit
4. **Agreement**
   - existing agreement creation and Evia signing remain unchanged
   - signature completion is a prerequisite for activation
5. **Move-in checklist**
   - reusable property `checklistitems` remain the property template
   - Phase 4 creates a tenancy-specific historical snapshot in `tenancy_move_in_checklists` and `tenancy_move_in_checklist_items`
6. **Activation**
   - only `POST /api/tenancies/:agreementId/activate` may transition a tenancy to `active`
   - generic agreement CRUD is blocked from setting `status=active`
   - activation updates the agreement, property/unit occupancy, and lifecycle audit record in one SQL transaction

## Activation gate

The server requires all of the following:

- tenant assigned to the agreement
- property assigned to the agreement
- tenant invitation/account accepted (`auth_id` linked)
- tenant membership active
- agreement signature complete
- contractual security deposit fully received when `depositamount > 0`
- move-in checklist complete
- no conflicting active tenancy for the same unit, or for the same whole property when no unit is used

The UI displays these checks, but server validation is authoritative.

## New persistence

Migration: `migrations/20260916_03_add_tenancy_onboarding.sql`

Adds:

- `agreements.activated_at`
- `agreements.activated_by`
- `tenancy_deposit_transactions`
- `tenancy_move_in_checklists`
- `tenancy_move_in_checklist_items`
- `tenancy_lifecycle_events`
- filtered unique indexes preventing duplicate active occupancy

## API

- `GET /api/tenancies/:agreementId/onboarding`
- `POST /api/tenancies/:agreementId/deposits`
- `POST /api/tenancies/:agreementId/checklist`
- `PATCH /api/tenancies/:agreementId/checklist/items/:itemId`
- `POST /api/tenancies/:agreementId/activate`
- `GET /api/tenancies/me/summary`

The staff onboarding API requires `agreements.manage` and Phase 3 property assignment scope. The tenant summary is restricted to the current tenant user and only returns active agreements.

## UI

Workspace route:

`/dashboard/agreements/:id/onboarding`

Agreement cards expose an **Onboarding** action. The workspace shows invitation state, assignment, payments, agreement/signature state, move-in checklist, readiness checks, and the final activation action.

## Production rollout

The database migration is a release gate and must run before the application version that calls the new tables/endpoints:

```bash
npm run migrate:tenancy-onboarding
```

Then verify:

```bash
npm run test:authorization
npm run build
```

Recommended production smoke test after deployment:

1. open an existing non-active agreement and confirm the onboarding page loads
2. send/resend a tenant invitation and confirm secure redemption still works
3. record a confirmation advance and security deposit and confirm totals stay separate
4. create the move-in checklist and complete its required items
5. confirm activation remains disabled until all server readiness checks pass
6. activate one tenancy and verify agreement `active`, property `rented`, and selected unit `occupied`
7. confirm a second agreement cannot activate against the same unit
8. sign in as the tenant and verify the active tenancy is returned by `/api/tenancies/me/summary`

## Compatibility note

Phase 4 does not delete legacy `associated_property_ids` or older structured-association helpers. They remain available during migration, but newly activated tenancy truth is the active agreement relationship. A later cleanup phase can remove the compatibility fields once production data has been confirmed against the active-agreement projection.
