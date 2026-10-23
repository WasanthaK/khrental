# B04 S2b — Production membership reconciliation evidence

**Date:** 2026-10-23  
**Source:** [GitHub workflow #39970659512](https://github.com/WasanthaK/khrental/actions/runs/39970659512) — `Audit production identity memberships (read-only)`  
**Serving revision inspected:** `khrental-app--0000333`  
**Execution:** Azure Production OIDC → exact serving commit and healthy SQL check → `node scripts/audit-identity-memberships-readonly.mjs` inside Container App.  
**Result:** `IDENTITY_MEMBERSHIP_AUDIT_OK`, job succeeded. No individual names, email addresses, IDs, credential records or row-level data exported.

## Aggregate facts

| Metric | Count |
| --- | ---: |
| `legacy_tenant_pointer_count` | 19 |
| `legacy_without_any_membership_count` | 0 |
| `legacy_with_history_but_no_active_membership_count` | 0 |
| `legacy_pointer_without_matching_active_membership_count` | 0 |
| `app_user_auth_id_without_auth_record_count` | 0 |
| `auth_record_without_matching_app_user_link_count` | 0 |
| `same_email_different_auth_id_count` | 0 |
| `tenantless_global_profile_count` | 1 |

## Interpretation and release boundary

In this **single production snapshot**, all 19 profiles with legacy tenant pointers had matching active membership records. The snapshot shows zero legacy-only pointers without a membership, no stale pointers to a different active tenant, and zero broken credential/app-user linkages by the checks above. The result supports **planning** removal of the backward-compatibility `legacy-user-tenant` authorization path, not automatically deploying it.

The zero-membership global profile demonstrates that null-tenant profiles exist; it does **not** establish a completed public-seeker registration journey or prove that account is a seeker. A sample from one point in time cannot rule out future imported data, out-of-band deletes or other unexamined access boundaries.

## Remaining safety gates before disabling legacy fallback

1. Code audit of `getUserForIdentity` userId/email fallback and any source paths still using `app_users.tenant_id` as tenant authority, including tenant-scoped dedicated endpoints.
2. Regression coverage for revoked, suspended and deleted memberships, inactive organizations, multiple memberships and no-membership identity context.
3. Existing renter/staff/admin login, invitation, password reset, tenant switch and agreement/invoice access physical smoke tests. No login loops or wrongful loss of access.
4. Separate SQL migration/backfill plan only if new data is found; **none is justified by these aggregate counts alone**. Keep records and invoices immutable.
5. A bounded PR and post-merge Ready-revision verification before claiming the legacy fallback removed.
6. Public global signup still requires verified-email pending ledger, atomic identity/profile creation and no tenant membership.

## Audit workflow reporting-only defect

The initial successful workflow contained a harmless shell formatting defect: `echo "`$ready_revision`"` attempted shell command substitution, emitting `command not found` while still returning success because subsequent commands succeeded. Correct Markdown rendering uses `printf '`%s`\\n' "$ready_revision"`. The workflow should **not** auto-run merely because its YAML changes: a workflow-only edit does not produce a new matching Container App image, so exact `GITHUB_SHA` runtime checks would reject it. Dispatch is retained for explicit repeat audits.

**Status:** Production aggregate audit COMPLETE. Global self-service signup and broader legacy fallback retirement NOT complete. B02 Stripe Managed Payments remains independent and open.
