# App-only property country and photo correction

This release contains ISO country selection on property create/edit, server validation,
and current-origin delivery of trusted tenant-owned legacy property photographs.
It excludes PR #430's public catalog, media processor/reviews, listing preferences,
marketing changes, and all publication switches. Keep #430 draft.

## Release gates

- Exact-head application authorization/build and disposable production-migration SQL CI must pass.
- Record current serving build/revision before rollout.
- Use production migration workflow plan, then apply through
  `20261026_02_property_iso_country` using the existing privileged migration executor.
  Preserve its checksum, identity and serving-revision checks. Do not substitute
  runtime SQL permissions or run the unregistered public-listing migration.
- Prefer schema before application traffic where the approved privileged connection
  supports it. The existing container executor may require the new revision to be
  serving first. In that path, do not perform property create/edit acceptance until
  migration apply/verification is complete; country saves will fail closed while
  the column is absent. Do not report that interval as acceptance.
- Merge/deploy only this app release. No public flags or marketing deployments.
- Verify matching build SHA, healthy serving revision, migration ledger/checksum,
  249 ISO codes and trusted country FK before functional acceptance.

## One-property authenticated acceptance

Use one of the owner's authorized demo properties. Read and record its current values.
Verify existing country is shown as unassigned, then explicitly select and save the
verified country. Reload to prove persistence. Check create form rejects no country,
without submitting an unnecessary new property. Verify the property photo's source
renders from the current app's `/storage/images/tenants/.../properties/...` route and
has nonzero image dimensions. If it still fails, inspect the returned status/object
availability; do not re-upload, delete, make storage public, or claim restoration.
Confirm a signed-out photo request remains denied and no inventory appears publicly.

## Rollback and remaining work

Restore the previously recorded app revision if necessary. Retain the additive
country column/reference table and assigned values; do not drop data. Country NULL
remains allowed at the SQL boundary for legacy rows/old-revision compatibility;
new app registrations require it in the authenticated mutation authority.

Public photo derivatives, rights/privacy controls, opt-out and country-market
projection remain in #430 for their separate controlled pilot and release.
