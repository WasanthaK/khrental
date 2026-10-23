# Quixo.Homes B04 — Public accounts and organization signup design

**Prepared:** 2026-10-23  
**Status:** ARCHITECTURE PROPOSAL / NOT IMPLEMENTED / NOT PRODUCTION-ACCEPTED  
**Scope:** Allow global rental-seeker accounts, subscription-owning property-management organizations, and verified tenancy invitation accounts to coexist safely. This is a design handoff, not a code/deployment approval.

## Problem, grounded in current source

The public Quixo.Homes website serves **people searching for rentals** as well as **owners/managers**. A rental seeker is not an existing renter of an organization. A prospective owner must not gain paid SaaS access before a paid Stripe subscription. A person may hold all three relationships under a single global identity.

The existing public `POST /api/platform/auth/sign-up` in `src/api/platform/router.js` calls `ensureAuthRecord()` with role/user_type `rentee`. New emails are assigned to the hardcoded active `kh-rentals` tenant and given a membership; existing, unclaimed `app_users` rows are linked **based on email** without invitation proof. This behavior is incompatible with general-public signup and creates account-claim/security risk if exposed as the marketplace on-ramp.

The fresh SQL schema `migrations/20260913_00_create_fresh_mssql_schema.sql` already declares `app_users.tenant_id` **nullable** and organization associations separately in `tenant_memberships`. But tenant-aware handlers still include legacy `app_users.tenant_id` fallback paths. Supporting zero-membership global users requires a deliberate authorization audit of these callers; nullability is **not** sufficient proof that current sessions and routes are safe for seekers.

The canonical `docs/AUTHENTICATION-LIFECYCLE.md` requires a single credential owner, safe invitation redemption, never claiming an invited or legacy app-user identity based on email only, secure password recovery, and role/tenant resolution from server-side membership.

## Target domain model

| Concept | Authority | What it does **not** imply |
| --- | --- | --- |
| Global identity | `auth_users` + one `app_users` per normalized email | No automatic tenant membership, ownership, or rental contract |
| Rental seeker profile | Global identity plus seeker preference/contact data (proposal) | No authenticated access to a landlord's internal units, agreements or billing |
| Property-management organization | `tenants` plus verified `tenant_memberships` and settings | No right to use subscription-gated operations without verified entitlement |
| Existing renter/tenant | Valid server-issued invitation/tenancy relationship and scoped membership | No implicit global access to other landlords |
| Stripe SaaS subscription | Stripe customer/subscription item for **one organization** | No product/catalog definition in Quixo.Homes; no cross-org entitlement |
| Public rental listing | Approved publication projection with public-only fields and state | No private property row, contact notes, bank account, contract, documents or tenant information exposed |

**Global account != member of every organization.** Membership and permissions always derive from authoritative server-side relationships; cookies, query parameters and client role fields cannot grant extra memberships.

## Three independent journeys

### J1. Someone looking for a rental (free)

1. Public `quixo.homes` browsing/searching can happen **without an account** where legally and operationally appropriate.
2. A person creates an account on `app.quixo.homes` specifically for saved searches, enquiry or applications. Require validated email ownership using an expiring single-use server-issued verification claim before granting actions that need a verified contact address.
3. Registration creates or securely links **only the global identity**; no `kh-rentals` tenant and no `tenant_memberships` row. Use a new explicit seeker state/type only after auditing current role assumptions.
4. User enters a **seeker-only workspace** with no landlord internal APIs. An enquiry creates a scoped public-lead record through a separate permission boundary, not a tenancy or agreement.
5. If the seeker later accepts a real landlord invitation, reuse the same verified identity without credential reset or automatic role overwrite; grant only the explicitly authorized relationship.

### J2. Owner/property manager (paid)

1. Owner establishes and verifies a global identity. An account with multiple organizations must select the intended organization explicitly.
2. Owner requests creation of an organization with validated business metadata, safe unique slug and auditable owner association. The backend transaction creates one isolated `tenants` record, its settings and membership; **no self-supplied global administrator role**.
3. New organization state is **billing-pending**. Owner may perform narrowly permitted onboarding actions and specify initial dwellings to compute subscription quantity, but **no free trial** or full paid management features are granted.
4. Server counts billable dwellings according to owner-approved B03 rules and creates an authenticated, organization-bound Stripe Checkout session using the centrally configured Stripe Price ID. No browser-provided subscription customer ID, price ID or quantity is accepted as authority.
5. Only verified Stripe subscription/invoice confirmation with matching organization/customer/quantity activates the billable entitlement. Checkout success redirects are not fulfillment evidence.
6. On first entitlement, enable paid tenant-scoped workflows. Preserve pending organizations and their onboarding data if a payment fails or the owner abandons Checkout.

### J3. Existing tenant of an owner

1. Existing landlord/admin sends an invitation from their own verified organization scope.
2. An unclaimed tenant identity may be linked **only through a valid invitation token and the canonical server-side redemption transaction**, not a public registration email match.
3. A user who already has seeker or other organization credentials signs in and explicitly accepts a new scoped invitation; do not allow redemption to overwrite the user's password or steal another browser session.
4. Old `AcceptInvite` and password-reset behavior must continue to pass current security/registration lifecycle tests.

## Auth and tenancy security migration path

**Safety before convenience.** Do not switch the public `/register` link to new behavior, and do not put a marketplace registration button live, until the public account-claim and legacy tenant attachment assumptions are addressed and tested.

1. **S1 — Read-only caller audit:** Inventory `ensureAuthRecord`, `findAppUserByEmail`, `/auth/sign-up`, `/auth/invite`, `createTenantMembership`, `readRequestedTenantId`, `selectActiveMembership`, `getPostLoginPath`, global auth session serialization, `/register`, and `/accept-invite` routes, plus any mobile/account recovery callers. Record existing-user/unclaimed-row behavior; classify protected API assumptions before changing it.
2. **S2 — Domain and persistence contract:** Decide whether to preserve `app_users` as one-global-identity profile with nullable `tenant_id`; define approved seeker profile storage, email-verification ledger and `billing-pending` organization status, with governed migration and rollback before implementing. Avoid creating duplicate auth tables or new broad anonymous access paths.
3. **S3 — Identity-only signup:** A new service contract for global registration uses an atomic, email-verified (or equivalent verified-auth) identity claim and no tenant membership; explicitly reject attempted claims of existing unlinked/invited app users and give generic recovery/invitation guidance. Rate-limit attempts and prevent email enumeration. Browser state contains no privileged tenant ID/role.
4. **S4 — No-membership authorization:** Create a separate safe seeker session projection and route boundary. Tenant API calls must still require active, currently verified membership; no legacy `app_users.tenant_id` fallback may be used as privilege for seekers. Test context switching, revoked membership, reuse of cookies, mixed tenancy/owner roles and no-membership sessions.
5. **S5 — Organization provisioning:** Authenticated owner creates only their new organization and own owner membership through a governed backend transaction; fail on slug collisions, duplicate request/replay, unauthorized platform-admin assignment or partial data. Return a billing-pending screen, **not** a paid dashboard.
6. **S6 — Stripe checkout coordination:** After B02 Managed Payments acceptance and relevant Stripe test configuration, add backend Checkout/Customer Portal bootstrap and verified Stripe webhooks. Only then activate paid features. B03 server-verified dwelling count applies across all organizations.
7. **S7 — Public-marketplace entry points:** Expose renter-facing registration, enquiry and saved-search screens on marketing-to-app handoff when protected/public listing boundary is proven. No private tenant-owned tables may be readable from unauthenticated public endpoints.
8. **S8 — Two-organization and invite regression:** Reuse owner/seeker identity across multiple memberships; handle owner and existing-renter switch, old invitation links, recovery, no-membership redirect and webhook/billing-pending states. Perform normal PR → CI → Azure Ready revision → physical acceptance before public signup enablement.

## Required acceptance cases

- Fresh seeker (no previous account) can register without gaining **any** existing tenant membership, admin role, tenant data or paid access; searching public listings does not require paid signup.
- Existing unclaimed `app_users` email **cannot be claimed with generic public sign-up**. Expired/revoked/accepted invitations remain protected against replay and credential takeover.
- New owner creates one isolated billing-pending organization; cannot create arbitrary `platform_admin` status or assign other orgs; no trial entitlements.
- Verified subscription payment activates only the matching organization; cross-tenant Stripe IDs and Checkout redirect alone do not grant privileges.
- One global identity can have a seeker profile, become a tenant by valid invite, and administer a separately subscribed organization without duplicate password state.
- Existing invitation, login/logout, reset-password, register state and mixed browser sessions do not regress. Nonmembers get safe no-access/seeker routes rather than login redirect loops.
- On payment failure/cancellation, historical financial/tenancy artifacts are retained; owner-approved B03 grace policy governs paid feature restrictions.
- Public listing search exposes no private information, document URLs, bank details, identities, addresses not authorized for publication, invoice PDFs or unapproved images.

## B04 gate and operational boundaries

**Design documented; B04 implementation/physical acceptance still OPEN.** S1 current-caller audit and S2 schema decisions can proceed without Stripe account activation, but no public signup product launch, database migrations, live billing, customer email campaigns, tenant membership mutation, or feature-flag enablement is authorized by this design alone.

Dependencies: [AUTHENTICATION-LIFECYCLE.md](AUTHENTICATION-LIFECYCLE.md), [QUIXO-HOMES-STRIPE-SAAS-BILLING.md](QUIXO-HOMES-STRIPE-SAAS-BILLING.md), [QUIXO-STRIPE-B02-B03-READINESS.md](QUIXO-STRIPE-B02-B03-READINESS.md), and the existing original C02/C03/C05 and invoice I02 release fences.
