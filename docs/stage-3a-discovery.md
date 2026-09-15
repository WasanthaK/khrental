# Stage 3A Discovery — Secure Onboarding and Tenancy Activation

## Status

Discovery baseline for the first Stage 3 vertical slice. No production behavior is changed by this document.

## Executive finding

Stage 3A must begin with **secure invitation redemption**, before deposit/checklist or broader tenancy UI work.

The current system has multiple invitation/account-setup paths, but none provides a server-authoritative single-use invitation claim. More importantly, the public signup endpoint can attach a new credential to an existing unclaimed `app_users` row based on email alone. That makes secure invitation redemption a security boundary, not merely a UX improvement.

After invitations are secured, the next 3A task is to make the agreement relationship (`renteeid -> propertyid -> unitid`) the authoritative tenancy relationship used by the rentee portal.

---

## Current onboarding paths

### A. `invitationService.js` direct-email path

Current behavior:

1. Existing `app_users` row is marked invited.
2. Client calls `resetPasswordForEmail`, but the current local MSSQL endpoint is only a success stub and does not issue a recovery token.
3. Client creates a link like:
   `/accept-invite?email=...&user_id=...&name=...&type=invite`
4. Email copy says the invitation expires in 24 hours.
5. No server-issued nonce/token, token hash, expiry record, revocation record or accepted-at record backs this URL.

Result: the email claim and expiry text are not enforced by the server.

### B. `AcceptInvite.jsx`

The page accepts `email` and `user_id` URL parameters as an invitation path. It then calls public `auth.signUp` and later calls the generic app-user link method.

The client supplies identity hints, but the server signup implementation ultimately searches `app_users` by email.

### C. `setup-account.jsx`

A second legacy invitation page accepts a `token` and verifies it with `src/utils/tokenUtils.js`.

That token implementation is only base64-encoded JSON containing an expiry timestamp. It has no signature/MAC and no server-held redemption state. The same page then performs public signup and generic app-user linking.

### D. `/api/platform/auth/sign-up`

`ensureAuthRecord()` currently:

1. searches `auth_users` by email;
2. if no auth record exists, searches `app_users` by email;
3. if an app-user exists and has no `auth_id`, updates that row with the newly generated auth ID;
4. creates the auth credential.

The public sign-up route forces the auth role to `rentee`, but it does **not** require proof that the caller was invited to claim an existing app-user row.

Therefore normal self-registration and invitation acceptance are currently conflated.

### E. `/api/platform/auth/invite`

The existing admin invite endpoint calls `ensureAuthRecord()` immediately with a random password. It therefore creates an auth credential before the invitee accepts anything and does not provide a usable invitation redemption claim.

### F. Password reset

`/api/platform/auth/reset-password` currently returns `{ sent: true }` but does not create or send a recovery token. It cannot be used as the invitation security mechanism.

---

## Security consequences

The current behavior creates these risks:

1. **Existing-user account claim by email** — public signup can bind credentials to an unclaimed app-user record without proving an invitation.
2. **No single-use invitation** — there is no accepted/redeemed state to prevent replay.
3. **No server-enforced expiry** — direct invitation email claims a 24-hour expiry that does not exist in persisted state.
4. **No revocation** — resend/cancel cannot reliably invalidate an earlier direct link.
5. **Client-trusted identity data** — legacy pages carry app-user ID/email/role hints in the browser URL or browser-decodable token.
6. **Duplicate invitation implementations** — `/accept-invite`, `/setup-account`, client invitation service and `/auth/invite` represent overlapping, inconsistent flows.
7. **Role ambiguity** — some legacy client paths pass role/user type during signup, while the current public sign-up endpoint forces `rentee`.

---

## Existing auth primitives we should reuse

The local MSSQL auth layer already provides the correct server-side cryptographic style:

- Node `crypto`;
- opaque random bearer tokens;
- SHA-256 token hashes in the database;
- explicit `expires_at`;
- revocation (`revoked_at`);
- server-side password hashing with scrypt.

Invitation tokens should follow the same pattern rather than using browser token utilities or JWT-like client secrets.

---

## Stage 3A.1 target design — invitation ledger

### Proposed table: `dbo.user_invitations`

Minimum persisted fields:

- `id UNIQUEIDENTIFIER` primary key
- `tenant_id UNIQUEIDENTIFIER NOT NULL`
- `app_user_id UNIQUEIDENTIFIER NOT NULL`
- `email NVARCHAR(320) NOT NULL`
- `intended_role NVARCHAR(100) NOT NULL`
- `user_type NVARCHAR(64) NOT NULL`
- `token_hash CHAR(64) NOT NULL UNIQUE`
- `expires_at DATETIME2 NOT NULL`
- `accepted_at DATETIME2 NULL`
- `revoked_at DATETIME2 NULL`
- `created_by UNIQUEIDENTIFIER NULL`
- `createdat DATETIME2 NOT NULL`
- `updatedat DATETIME2 NOT NULL`

Foreign keys should bind tenant/app-user and preserve appropriate audit semantics for the creator.

### Token

- generate at least 32 random bytes with Node `crypto.randomBytes`;
- encode as base64url for the URL;
- store only SHA-256 hash in SQL;
- raw token exists only long enough to build/send the invite link;
- do not log raw invitation URLs/tokens.

### Invitation creation/resend

Authenticated administrator only:

1. identify the existing target app-user by ID within `req.tenantId`;
2. derive intended role/user type from server-side app-user/membership state rather than client authority;
3. reject already-linked accounts unless explicitly using a future recovery flow;
4. revoke any still-active invitation for that tenant/app-user;
5. create new token hash with 24-hour expiry;
6. send or return the secure invite URL for delivery;
7. update invitation UI status from the invitation ledger, not only `app_users.invited`.

### Public validation

A public endpoint may accept the raw token and return only safe display data:

- valid / expired / already accepted / revoked;
- name;
- masked or intended email display as appropriate;
- intended user type/role label;
- tenant display name if useful.

The token hash, app-user ID and tenant ID are never accepted back from the browser as authority.

### Redemption

Public redemption receives only:

- invitation token;
- chosen password.

Server transaction/atomic flow must:

1. locate token hash where not expired, accepted or revoked;
2. load the bound tenant/app-user;
3. verify current app-user email still equals invitation email;
4. verify account is not already claimed;
5. create auth credential bound to that exact app-user;
6. ensure the correct tenant membership exists with the intended role;
7. set app-user auth ID / invited state as appropriate;
8. mark invitation accepted exactly once;
9. issue a normal authenticated session.

Concurrent redemption must result in only one successful credential binding.

### Normal self-registration

Public self-registration can remain available for genuinely new renter emails if product policy requires it, but it must **not** claim an existing unlinked app-user row.

Rule:

- new email -> ordinary self-registration path;
- existing app-user without auth -> `INVITATION_REQUIRED` unless a valid invitation is being redeemed;
- existing auth user -> conflict/login path.

This separation closes the account-claim problem without necessarily removing public renter registration.

---

## Stage 3A.1 client convergence

Keep one invitation UX:

- `/accept-invite?token=<opaque-token>`

Replace/remove legacy authority from:

- `email` query parameter;
- `user_id` query parameter;
- browser base64 `tokenUtils.generateToken/verifyToken` invitation usage;
- generic `linkAppUser(authId, appUserId)` during invite acceptance;
- fake password-reset invitation flow.

`setup-account` should either redirect to the canonical `accept-invite` route or be removed once all senders are migrated.

The canonical page should:

1. validate token with server;
2. display safe invite context;
3. collect password/confirmation;
4. redeem token through one server endpoint;
5. persist returned session;
6. redirect by effective role (`rentee` -> rentee portal; staff/admin -> appropriate dashboard).

---

## Stage 3A.2 target — authoritative tenancy relationship

The existing `agreements` table is already the best tenancy spine:

- `renteeid`
- `propertyid`
- `unitid`
- `status`
- `startdate`
- `enddate`
- `rentamount`
- `depositamount`
- signature state/document references.

The central authorization layer already scopes rentee access to property/unit through agreement relationships in several server queries.

However, `RenteePortal.jsx` still derives displayed property/unit associations from browser/session structured associations and legacy `associated_property_ids` before separately loading agreements.

Stage 3A.2 should:

1. add a server endpoint/query for the authenticated rentee's tenancy summary;
2. select the relevant agreement(s) under central authorization;
3. join property and optional unit on the server;
4. return a normalized tenancy projection to the portal;
5. remove sessionStorage/`associated_property_ids` as authoritative portal tenancy input;
6. retain legacy fields only as migration/backward-compatibility data until safely removable.

### Agreement activation rule

Current agreement lifecycle already models signature completion -> active. Stage 3A should make activation explicit and reproducible.

Initial rule to refine during implementation:

- correct rentee/property/unit bound;
- signed/signature-complete where signatures are required;
- required onboarding checklist complete;
- required deposit/advance state satisfied if configured;
- activation performed by an authorized server action;
- status transition and actor/time audited.

Do not let a generic client update to `agreements.status = active` become the final activation authority.

---

## Stage 3A.3 / 3A.4 follow-ons

### Deposit / confirmation advance ledger

The current agreement stores only `depositamount`, which describes the contractual amount but not collection, allocation, refund, deduction or settlement history.

A later 3A migration should introduce an auditable deposit/advance transaction model rather than overloading `depositamount` or invoice notes.

### Move-in checklist instance

Properties have a `checklistitems` definition, but the fresh schema does not currently persist a tenancy-specific move-in checklist instance with item state, notes, photos, actor and completion time.

Stage 3A should snapshot checklist definitions into an agreement/tenancy-bound checklist so later property-template edits do not rewrite historical move-in evidence.

---

## Recommended implementation order

1. **3A.1a — DB migration: invitation ledger**
2. **3A.1b — server invitation create/validate/redeem endpoints**
3. **3A.1c — block public signup from claiming existing app-users**
4. **3A.1d — migrate invitation sender + canonical acceptance page**
5. **3A.1e — invitation security tests**
6. **3A.2 — authenticated tenancy-summary endpoint + rentee portal convergence**
7. **3A.3 — deposit/advance ledger**
8. **3A.4 — move-in checklist instance and activation action**

Each item should be independently reviewable. 3A.1 should ship as a security-focused release before broader tenancy activation changes.

---

## Required negative tests for 3A.1

At minimum:

- public signup cannot claim an existing unlinked app-user email;
- random/unknown invite token rejected;
- expired token rejected;
- revoked token rejected;
- already-accepted token rejected;
- token cannot be reused after successful redemption;
- token bound to one app-user/tenant only;
- changed target email invalidates/rejects stale invitation;
- existing claimed auth account cannot be overwritten;
- resend revokes earlier active token;
- non-admin cannot create/resend invitation;
- cross-tenant admin cannot invite/claim a user from another tenant;
- valid rentee invitation yields rentee membership/session;
- valid staff invitation preserves the server-authoritative intended staff role/membership;
- raw token is not persisted in database or logs.

## Release note

No Stage 3A code should be merged to production until the invitation migration is applied and verified. The migration must be executed with a DDL-capable Azure SQL principal using the same release discipline established during Phase 2.
