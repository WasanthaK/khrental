# KH Rentals Authentication Lifecycle

## Personal rental activity and workspace lookup — 31 October 2026

One verified account may manage property and search for a rental. Explicit Find a place opens personal rental activity; List/manage my property returns to the selected authorized workspace or deliberate owner setup. Keep the workspace selection intact while personal API calls omit tenant/development headers and cookies. The legacy default tenantless signup/session-adoption certification remains strict and separate from explicit personal-rental certification.

Personal rental authority comes from a live bearer session, reciprocal auth/application identity, matching normalized email and global role, active account and durable verified-email metadata. Recheck persisted session, verification and reciprocal identity inside the SQL transaction. Personal enquiry, viewing, application and offer history is scoped by the authenticated actor ID; organization membership grants no access to another person's activity. Business inbox/actions still require an active administrator membership in the target workspace. Revoking workspace membership does not erase independent personal rental access; disabling the global account, revoking its session or removing email proof denies it. Agreement conversion retains existing target-workspace membership conflict checks and never overwrites an administrator role.

An unavailable or malformed workspace lookup is different from a verified zero-membership result. Show a retry state, preserve the account/draft, and do not display or autosave new-workspace setup while context is unavailable. Retry refreshes authoritative context before offering existing-workspace navigation or unfinished setup. URL purpose is navigation, never an access grant. This correction needs exact-head regression, rendered desktop/mobile review and live verification; fresh password login and live unfinished-owner recovery retain their separate acceptance status.

---


## Durable owner continuation implementation — 31 October 2026

Use the existing auth record's bounded owner_onboarding draft (name, LK/BN country, UUID request ID) as resumable business/form state. Store initial owner purpose only during successful new-account redemption; a signed-in owner may then save their own draft through the reciprocal server identity. Use an atomic JSON-field update so unrelated verification and credential metadata are preserved. Serialize browser draft saves and preserve different-account changes before any workspace command.

Fresh authenticated context validates this draft. It may suggest workspace setup for an account without memberships. First-property continuation additionally requires the actually selected active administrator membership, workspace provenance matching this authenticated actor/request and a real property-existence query. Existing properties complete that step. An unresolved/different workspace, revoked membership or malformed draft cannot select a tenant or manufacture access. Workspace creation retains the draft in the existing transaction; permission and durable email-proof checks remain authoritative.

Ordinary sign-in resumes this server-projected next task, while explicit selected-property continuation and established administrative/membership destinations are retained. Per-tab storage is only a fallback, and the UI reports saved/unsaved draft state. Owner links retain purpose/country. This is the implementation contract for the current bounded correction; source preparation and automated fixtures do not close live owner/first-property acceptance or the broader dual-purpose journey.

---

## Fundamental customer-purpose contract — 31 October 2026

The owner establishes two primary Quixo.Homes entry intentions: **Find a place** and **List/manage my property**. People know their purpose when they choose one; authentication continues that chosen business journey. The controlling stories BJ-01–BJ-08, gap assessment and acceptance requirements are in [Fundamental business journey: preserve the customer's purpose](EXECUTION-PLAN.md#fundamental-business-journey-preserve-the-customers-purpose--31-october-2026).

- First-time owner: select list/manage → register → verify email/establish credentials → set up their property workspace → add the first property → property management.
- Returning unfinished owner: ordinary sign-in recovers the verified account's owner purpose and resumes the next incomplete step, including after logout/browser closure or verification in another browser.
- Existing authorized property manager: list/manage → sign in → existing authorized workspace and properties; make a workspace choice explicit when ambiguous.
- Prospective renter: browse freely → select property → Express your interest → register/sign in when needed → the same property's enquiry.
- A person who both rents and manages property uses one global identity and deliberate purpose-switch actions; effective organization permissions remain membership-derived. Preserve invited-participant and platform-administrator destinations.

Owner intent and resumable progress must be durable account-associated business state. URL context and optional sessionStorage drafts assist immediate continuation but cannot be the only source for ordinary-login recovery. Bind pending context only through verified account establishment; preserve an existing different account and keep its state separate. A selected purpose or editable preference never creates membership, grants a role, proves email verification or authorizes access to another organization. The initial internal seeker classification is not a completed owner experience or a permanent customer-purpose restriction.

Honor a valid explicit task/purpose switch. With no new task, ordinary login resumes unfinished owner setup when applicable or the appropriate established destination. Explain workspace as the account grouping properties, team, agreements and invoices; one workspace supports many properties. Existing managers continue there, with another workspace created only through an explicit action.

Acceptance requires the real owner signup → verification → first-property outcome, interrupted setup recovered via plain login, reload/new-browser persistence, safe different-account handling, existing manager and participant destinations, selected-property renter continuation and usable dual-purpose access. Authentication alone is not owner-onboarding acceptance. Current durable-resumption and dual-purpose gaps remain open; this documentation changes no authentication authority or runtime behavior.

---

## Returning owner entry and workspace terminology — 31 October 2026

Workspace is the customer-facing name for a SaaS tenant: the account grouping properties, team access, agreements and invoices. Explain this during initial setup; one workspace manages many properties. A returning property manager with an active, server-resolved business membership continues in the currently selected workspace and must not be forced into another workspace creation or new-owner verification flow merely to access existing properties. Never switch organizations implicitly.

Owner-intent sign-in/registration may return such a manager to existing properties. Normal owner/staff/tenant login must not depend on the tenantless-seeker certification endpoint; choose presentation from the freshly resolved profile and membership, retaining the backend's independent authorization. An existing business account reaching the seeker landing returns to its normal portal. These are navigation decisions, not proof of membership or permission grants. New global seekers and new owners without a workspace retain verified seeker/owner onboarding, and actual property APIs remain tenant-scoped.

---

## Existing-account owner email verification — 31 October 2026

An existing account must not be sent through new-account signup to verify its email. The signed-in owner setup page owns send/resend through `/api/public-signup/account-challenge`; the backend selects the recipient from a freshly authenticated, reciprocally linked active identity, never from a posted email. Reuse the existing SendGrid sender, verified origin, pre-parser same-origin/8 KB controls and shared SQL email/IP quotas. Preserve pilot-mailbox restrictions where configured. Report actual provider acceptance separately from mailbox delivery; failed/ambiguous submission revokes the pending proof and shows a retryable error.

Reuse the existing hash-only `public_signup_challenges` ledger without a schema change. Existing-account proof uses a separate digest domain bound to the persisted auth row, app/auth IDs, normalized email and current password credential. A signup token cannot redeem as existing-account proof, or vice versa; identity, email or credential changes invalidate a pending link. Resend revokes previous pending proof and has a two-minute cooldown. Never store or log raw tokens or credential material.

The email links to the isolated `/verify-email` entry with token/challenge reference in the fragment only. Capture/scrub once before React/auth initialization. Explicit confirmation through `/api/public-signup/account-redeem` consumes accepted, unexpired, unrevoked proof and sets the existing account's verification metadata atomically. The email link proves mailbox ownership; it does not issue a session, switch an existing browser account, reset a password, change a global role or add memberships. This permits confirmation in a separate email browser without signing it into the application. Owner setup still independently requires authenticated reciprocal identity plus durable consumed proof before workspace creation.

Keep the owner draft (name/country/request ID only) in per-account tab storage, never verification tokens. Same-tab continuation/reload retains the draft; successful setup clears it. Different accounts do not inherit the draft or pending responses. Automated HTTP, actual SQL and rendered browser evidence is required; real mailbox receipt and actual property creation remain separate live acceptance.

---

**Status:** Canonical design for authentication, invitation, recovery and session ownership.  
**Applies to:** tenant/rentee and staff/team account creation, invitation redemption, login, password reset, account recovery and authenticated onboarding.

## Design priorities

Authentication changes are evaluated in this order:

1. **Security** — no account takeover, credential overwrite, cross-tenant escalation, stale-session privilege reuse, token leakage or ambiguous identity ownership.
2. **User experience** — every credential flow has one visible owner, one clear next action and no competing modal/redirect/session behavior.
3. **Durability** — state transitions are persisted atomically where required, are independently observable, survive browser reloads/process restarts, and are proven by end-to-end regression tests.

A change that improves convenience but weakens any of these properties is not acceptable.

---

## Identity model

KH Rentals has one global application identity per email in `app_users`.

Organization access is represented through `tenant_memberships`. A user must not be duplicated in `app_users` merely because the same person belongs to another organization.

Authentication identity is stored in `auth_users` and linked through:

- `app_users.auth_id` -> `auth_users.auth_id`
- `auth_users.app_user_id` -> `app_users.id`
- normalized email equality between both records

A membership proves organization access. It does not prove authentication readiness.

---

## Canonical states

The invitation lifecycle is:

```text
Created
  -> Invited
  -> Invitation Validated
  -> Credential Created
  -> Auth Linked
  -> Credential Verified
  -> Session Issued (when appropriate)
  -> Registered
```

Exceptional states include:

```text
Not Invited
Pending
Expired
Revoked
Setup Incomplete
Account Recovery Required
Registered
```

### Registered

`Registered` means the account is actually usable, not merely that an invitation was accepted.

The minimum evidence is:

- valid `app_users` identity;
- valid `auth_users` identity;
- reciprocal app/auth linkage;
- matching normalized email;
- usable credential structure; and
- proof of account access through either:
  - successful invitation credential verification (`invitation_registration_verified`), or
  - a successful normal login (`last_login_at`).

`accepted_at`, `app_users.auth_id`, or an `auth_users` row alone are insufficient.

### Setup Incomplete / Account Recovery Required

Use this state when setup or claiming has begun but login-capable registration cannot be proven. Historical accepted-invitation evidence remains claim evidence even when a later invitation is newer and expired/revoked or the current auth linkage is missing; the newest invitation row must not erase the fact that the identity was previously claimed. Do not resend an invitation if doing so could overwrite or replace an existing global credential. Recovery must repair the existing identity instead.

---

## Single-owner rule

Every credential transition has exactly one UI owner and one backend authority.

| Transition | UI owner | Backend authority |
| --- | --- | --- |
| Send/resend invitation | Tenant/Team invitation action | secure invitation API |
| Validate invitation token | `AcceptInvite` | `GET /api/platform/auth/invitations/validate` |
| Set initial invited-account password | `AcceptInvite` | `POST /api/platform/auth/invitations/redeem` |
| Create/link invited auth identity | none outside redemption | invitation redemption transaction |
| Verify invited credential | none outside redemption | normal password verifier used by redemption |
| Issue invited session | redemption response | auth session service |
| Normal login | Login page | `POST /api/platform/auth/sign-in` |
| Password reset | Reset Password page | reset-password token endpoints |
| Authenticated forced password change | `WelcomeGuide` only when authenticated and explicitly flagged | `POST /api/platform/auth/update-user` |

No component may infer invitation ownership from a generic `?token=` query parameter.

---

## Route isolation

Credential-bootstrap and recovery routes render outside the normal authenticated application shell.

Canonical isolated routes:

- `/accept-invite`
- `/reset-password`

These routes must not trigger:

- tenant/application initialization;
- navigation registration;
- tenant-specific onboarding guides;
- generic authenticated redirects;
- storage initialization;
- authenticated password-change UI unrelated to the active flow.

### Important distinction: isolation vs anonymity

Route isolation does **not** mean all isolated routes ignore browser sessions.

- `/reset-password` is an anonymous credential-recovery flow and must not inherit Authorization, active tenant, or development-bypass identity.
- `/accept-invite` may inspect an existing session only to determine whether a valid **different** signed-in user should remain signed in. This prevents an invitation opened by an administrator from silently replacing that administrator's session.

The invitation token remains the authority for invitation redemption. An existing browser session never authorizes claiming the invited account.

---

## Invitation redemption transaction

Redemption must preserve the following ordering:

1. Validate token and lifecycle state.
2. Validate invitation still matches the current app identity and organization membership/role intent.
3. Reject if an auth identity already exists for the email/app user.
4. Create the password credential.
5. Create `auth_users` identity.
6. Create membership if genuinely absent and allowed by the invitation model.
7. Link `app_users.auth_id` and mark invitation accepted in the same serialized transaction.
8. Commit.
9. Reload the auth record.
10. Verify the persisted credential with the normal sign-in verifier.
11. If verification fails, perform the narrowly defined one-time credential repair and verify again; fail closed if still unusable.
12. Only after successful verification write `invitation_registration_verified: true`.
13. Issue a session unless a valid different browser session is intentionally being preserved.

No UI should perform a second password login immediately after successful redemption.

---

## Existing browser session behavior

When an invitation link is opened:

### No session / stale session

- Validate invitation.
- Redeem invitation.
- Issue invited-account session.
- Persist that session locally.
- Clear stale active-tenant selection.
- Redirect to the invited user's role destination.

### Valid session for the same invited identity

The invitation may complete normally, subject to the invitation state and backend safeguards.

### Valid session for a different identity

- Do not replace the existing signed-in browser session.
- Redeem the invitation with `establishSession: false`.
- Show explicit success explaining that the invited account was created while the existing signed-in account was preserved.
- Instruct the user to use a private window or sign out before signing in as the invited identity.

This behavior is a UX and safety feature; it must never bypass invitation-token validation.

---

## Password reset and recovery

Password reset operates on an existing authentication identity. It is not a substitute for repairing missing or mismatched app/auth linkage.

A damaged account may require a dedicated recovery path if any of the following are true:

- `app_users.auth_id` is missing or points to the wrong auth identity;
- `auth_users.app_user_id` is missing or mismatched;
- auth email does not match the canonical app email;
- credential material is unusable;
- identity exists in a partial claimed state.

Recovery must never create a second global identity for the same email or overwrite an unrelated credential.

---

## Security requirements

1. Invitation tokens, reset tokens, passwords, credential hashes/salts and email bodies must never be written to application logs.
2. Invitation resend must refuse claimed/incomplete identities when resend could overwrite credential ownership.
3. Public credential endpoints may be anonymous, but all authorization decisions remain server-side.
4. Browser-local session state is never proof of authentication. When session validity matters, confirm it with the server.
5. Tenant selection never grants membership. Membership must be server-resolved.
6. Credential setup endpoints must not inherit unrelated tenant context or authenticated-shell behavior.
7. Database state changes that establish identity ownership must be transactional and concurrency guarded.
8. Failure after partial identity creation must surface as `Setup Incomplete` / recovery, never falsely as `Registered`.

---

## User-experience requirements

1. One credential form per flow. An invited user must not see both invitation password setup and a second generic password-change prompt.
2. Errors must identify the actionable state: invalid/expired invitation, already accepted, account claimed, setup incomplete, or recovery required.
3. Successful invitation setup must either enter the invited account directly or explicitly explain that a different existing browser session was preserved.
4. Admin invitation status must distinguish user creation from invitation delivery, invitation acceptance and verified registration.
5. Reloading or returning to the admin UI must produce the same canonical lifecycle status from the server; client cache is not authoritative.

---

## Durability requirements

1. Auth/invitation lifecycle state is derived from durable database records, not transient browser state.
2. Critical writes use transactions and explicit concurrency checks.
3. Registration status is recalculable after process restart.
4. Automated tests must lock down route isolation, ownership boundaries, credential verification, session preservation/adoption and registration-state derivation.
5. Every production authentication change requires runtime proof plus a physical browser acceptance check for the affected flow.
6. The canonical execution plan must record discovered failures and acceptance evidence before P0.3 can close.

---

## Required acceptance scenarios

### Fresh invited user

1. Create a brand-new app user with no prior auth identity.
2. Send invitation.
3. Open in a clean/private browser.
4. Validate invitation.
5. Set password exactly once.
6. Enter the account through the server-issued session.
7. Log out completely.
8. Log in normally with the same email/password.
9. Confirm tenant context resolves correctly.
10. Confirm admin lifecycle reports `Registered` only after usable account access is proven.

### Invitation opened by an already signed-in administrator

1. Administrator remains signed in.
2. Invitation can still be redeemed.
3. Administrator session is not replaced.
4. Invited account can subsequently sign in independently.

### Damaged/partial account

1. Must not be labelled `Registered` unless login-capable evidence exists.
2. Must not be re-invited if credential ownership may already exist.
3. Must route to recovery with explicit diagnostics.

### Password reset

1. Start logged out.
2. Request reset.
3. Open reset token route without inherited session/tenant context.
4. Set new password.
5. Confirm old sessions are revoked as designed.
6. Perform normal login with new password.

---

## Change expectations

Any future change touching authentication, invitations, user creation, membership, routing, onboarding, session persistence or password handling must:

1. Read this document and `docs/EXECUTION-PLAN.md` first.
2. Identify the lifecycle transition being changed and its single owner.
3. State whether the route is authenticated-shell, isolated bootstrap, or anonymous recovery.
4. Preserve one-global-identity-per-email semantics.
5. Add or update regression coverage before merge.
6. Prove security, UX and durable persisted state independently.
7. Avoid compatibility or cleanup work unless it is necessary to repair the verified flow.


## Public registration browsing and password policy (2026-10-30)

After the public registration endpoint acknowledges a request, return the visitor to public browsing. Preserve a validated selected-property reference when present and show a dismissible email-verification reminder. The reminder stores only that public reference in session storage; it never establishes an identity or authorizes account features. Acknowledgement does not prove email delivery or account creation. Verification remains necessary before authenticated actions.

The owner-approved public signup password minimum is 8 characters, with a 256-character maximum. Use one shared policy for client validation and server redemption, permit spaces, and provide show/hide controls. Reject an invalid password before consuming a verification challenge. Password validation failures must identify the rule; temporary service failures must offer a retry on the current page without clearing the entered password or requiring another email. Never persist or log passwords or verification secrets.

This source change does not establish that the reported production redemption failure is resolved. Live intended-account verification and the agreement-to-tenancy acceptance remain release acceptance requirements under #459.
