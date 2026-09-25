# KH Rentals Authentication Lifecycle

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
