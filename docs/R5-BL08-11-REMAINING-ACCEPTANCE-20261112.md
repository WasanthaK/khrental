# R5 BL08.11 — Remaining deployed provider-recovery acceptance

Status: **OPEN — engineering implementation complete, remaining deployed acceptance pending**.
Tracker: [#611](https://github.com/WasanthaK/khrental/issues/611).
Canonical owner milestone: [#459](https://github.com/WasanthaK/khrental/issues/459).

## Retain accepted evidence; do not rerun

- Existing scoped automatic recovery worker only for the accepted sandbox tenant; 23/23 migrations verified.
- [43216870550](https://github.com/WasanthaK/khrental/actions/runs/43216870550): genuine portal response discarded **after** provider effect; same idempotency key/session, exactly one step/audit/event, unchanged financial state. **PASS**.
- Genuine renewal, failed renewal/recovery within grace, delayed-event reconciliation, duplicate delivery and process restart tests retain their independent acceptance. Do not advance/reuse those clocks or uncertain operation IDs.
- Monthly invoice fix deployed as PR #610 and **manually accepted by owner** on 12 November. [43238563485](https://github.com/WasanthaK/khrental/actions/runs/43238563485) failed **before HTTP checks** because a synthetic property omitted required `country_code`; original enforcement was restored on Ready 0000500. This is a distinct fixture defect, not a demonstrated invoice failure.
- Live charging stays OFF. Evia stays paused. No new real-customer access, automatic pricing publication or broad worker activation.

## Acceptance queue — fresh disposable fixture per operation

| Case | Current evidence | Required proof to close |
| --- | --- | --- |
| Customer creation post-provider response loss | Source/SQL/process tests | Genuine sandbox create; existing original key/request event and customer readback; zero duplicate customer creation; missing evidence holds for review |
| Checkout creation post-provider response loss | Source/SQL/process tests | Exact customer-scoped fully bounded session search, metadata/inventory/price/return origin and item readback, reuse one valid open session; expired/completed terminal without new purchase |
| Portal response loss | **PASS** 43216870550 | None. Do not repeat |
| Invoice preview response loss | Source/SQL/process tests | Original key and identical quantity/proration inputs; 10-minute window; no payable invoice; expiry ends in new-preview action |
| Cessation provider change | Source/SQL/process tests | Original quantity/cancellation step/key, rechecked obligations and authority, provider readback, no duplicate financial mutation; atomic stock and audit update |
| Pricing publication | Source/SQL/process tests | Authorized **platform-scoped manual** sandbox proof: immutable version/hash/lock and original publication key, bounded price listing, no duplicate/unauthorized publication; never tenant-worker dispatched |
| Authenticated roles | Partial prior template-route proof | Admin allowed only tenant-authorized action; staff/renter/stale/revoked admin denied; record before/after read-only snapshots |
| Tenant/resource isolation | Partial prior template-route proof | Two independent sandbox organizations: foreign tenant cannot view/claim/replay/modify another's operation, billing resource, journal, checkout or customer |
| Retry exhaustion and review | Source/process tests | No fresh key/purchase/credit/reversal or fallback to legacy unjournaled route; auditable and safely terminal |

## Execution and evidence contract

1. Read PROJECT_RULES.md and current R5 canonical documents. First inventory existing scripts/workflows and prior evidence. Add only missing harness checks; do not rebuild PR #574.
2. Use sandbox-only credentials already held by the existing secret mechanism. No keys or hosted URLs in artifacts. Preflight Ready image and SHA, service flags and single organization scope, exact actor and resource authority, unique fresh operation ID, and baseline tenant SQL/provider state.
3. Prefer an **inspect-only** run before the first test-mode provider effect. A failed or uncertain provider effect must be inspected and recovered from its original journal/operation ID; never rerun as a new purchase.
4. For each run, record UTC time, SHA/revision, workflow/job/artifact, fixture ID, operation kind, original key, provider event/readback, command/step/audit counts, before/after financial and tenant snapshots, result and explicit limits.
5. Always clean disposable records safely, restore any temporarily changed configuration, check public health, confirm other organizations unchanged; STOP on unclear cleanup.
6. Keep production paid feature enforcement OFF. No production clients presently; that does not authorize real charging or broad activation.
7. Update tracker #611 and canonical R4-R5-DELIVERY status strictly from evidence. No inferred PASS from source tests or API 200 alone.

## Immediate implementation sequence

1. Implement/verify *customer creation* deployed sandbox acceptance (fresh isolated fixture).
2. Implement/verify *Checkout* and *invoice preview* deployed cases with bounded provider-readback and no payable invoice/duplicate purchase.
3. Implement/verify *cessation* with no-charge sandbox changes.
4. Run authenticated role/resource and two-tenant isolation proof.
5. Run platform-only pricing publication proof, if existing sandbox data/authority allow it; otherwise park as an explicit operator gate, not a tenant worker action.
6. Close BL08.11 only after complete durable run evidence. Continue unrelated R5 work independently if provider operations are blocked.
