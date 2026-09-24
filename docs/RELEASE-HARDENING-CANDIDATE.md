# KH Rentals — Integrated Release-Hardening Candidate

**Branch:** `phase-5-release-hardening`  
**Production status:** **NOT MERGED / NOT DEPLOYED / NOT PRODUCTION-ACCEPTED**

This branch assembles the prepared work after P0.3 so the code can be validated together before any production rollout.

## Included prepared work

- P0.4 password-reset recovery hardening.
- Phase 1 renter/tenant relationship integrity, including durable property/unit associations and organization-scoped deactivate/reactivate behavior.
- Phase 2 restoration of the proven Evia marker/AutoStamp signature-placement send path while retaining the current OAuth flow.
- Phase 3 agreement/document storage through explicit tenant-scoped KH Rentals storage APIs.
- Phase 4 payment-proof, utility-media, maintenance-media, admin-storage and legacy-Evia storage cleanup.
- Retirement of the obsolete application-facing `platformClient.storage` compatibility shim after domain consumers were removed.
- Aggregate release-hardening regression coverage in `tests/release-hardening.test.js`.
- Storage bucket mutation authorization aligned with the canonical membership-aware administrator role (`isAdminRole`) rather than relying only on the auth-record role.

## Automated gate

The exact candidate head must pass:

- `npm ci`
- `npm run test:authorization`
- `npm run build`
- existing Evia integration workflows where triggered

`tests/release-hardening.test.js` is included in `npm run test:authorization` and protects the final storage/compatibility and canonical-admin boundaries.

### Verified behavior-head evidence

Behavior head `01cf8eaaef3761ce507a613940dab05c748ff450` passed the full authorization/regression suite, production build, Evia V2 integration workflow and Evia webhook workflow on 2026-09-23. The deployment job was correctly skipped because this is a pull-request candidate, not an authorized production rollout.

A subsequent security review aligned storage bucket mutation authorization with the canonical membership-aware administrator definition. The final PR head therefore must pass the complete gate again before the candidate is considered code-ready.

## Physical gate

The physical source of truth is:

- `docs/P0.3-INVITATION-ACCEPTANCE-STORIES.md` for the current production gate.
- `docs/RELEASE-HARDENING-ACCEPTANCE-STORIES.md` for the integrated candidate after P0.3 closes.

No green CI result authorizes merge/deployment while P0.3 remains open.

## Production acceptance rule

After an authorized merge/deploy, production acceptance still requires:

- latest intended Azure revision Ready;
- public `/build-info.json` exactly matching the merged behavior SHA;
- `/api/mssql/health` reporting Ready;
- deterministic startup `/bin/sh scripts/start-container.sh`;
- required physical acceptance stories passing on that exact deployed SHA.
