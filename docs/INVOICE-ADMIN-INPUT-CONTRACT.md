# Invoice administrator input contract — dependent on PR #339

This is a *pure validator and test preparation* for the missing Property
Information fields and optional issuer settings. It does **not** add runtime
routes, persistence, or editable production screens, and is not approval to
modify existing invoice issuance.

Normal management is by the tenant owner's organization. An external property
manager is exceptional and requires documented contact details. The legal
invoice issuer is separate from the manager, property owner, and verified
bank beneficiary. Do not guess any of these based on tenant names.

UI destination: Property Information → Billing and Management, reusing existing
property address/bank name/branch/account. Only add beneficiary name and an
optional billing contact; separate company issuer identity belongs in Settings.
Unit-specific beneficiary remains with Unit Information.

Required before enabling writes: implement scoped administrator-only endpoints,
transactional field-change audit, verified migration deployment, and tests
proving renter/staff/cross-tenant denial. Do not add beneficiary to unrestricted
generic property updates. A subsequent PDF release must use immutable issuance
snapshots, not current mutable company or property details.

All illustrative names in unit tests are synthetic; never seed production data.
