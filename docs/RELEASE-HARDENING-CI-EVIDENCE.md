# KH Rentals Release-Hardening CI Evidence

**Status date:** 2026-09-23  
**Draft PR:** #116  
**Branch:** `phase-5-release-hardening`

## Previously validated behavior head

Behavior head `01cf8eaaef3761ce507a613940dab05c748ff450` passed:

- full `npm run test:authorization` suite, including `tests/release-hardening.test.js`;
- production `npm run build`;
- Evia V2 OAuth/signing integration workflow;
- Evia webhook workflow.

## Current behavior head under exact-head validation

Behavior head `4259e4880bab39e0da7b67676f0a250a6a733cfd` additionally aligns storage bucket mutation authorization with the canonical tenant administrator role check (`isAdminRole({ user, membership })`) and regression-locks that boundary. Because the code changed after the previous green run, this head and its user-authored documentation descendant must pass the same full CI/build/Evia gates before the candidate is considered implementation-validated.

The PR deployment job must remain skipped while the release-hardening PR is draft and blocked by the P0.3 physical acceptance gate.

## Release rule

This CI evidence is implementation proof only. It does not mark P0.4 or Phases 1–5 production-complete. P0.3 US-INV-01 through US-INV-09 must pass first. After any later authorized merge/deployment, the physical stories in `docs/RELEASE-HARDENING-ACCEPTANCE-STORIES.md` and production runtime proof remain required.
