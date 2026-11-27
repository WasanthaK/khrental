# Copilot assignment — finish Sri Lanka R5

## Start here

Work in `WasanthaK/khrental` from current `main`. The [45-row checklist](R5-LK-CLOSURE.md) owns scope, pass conditions and status. This handoff supplies the execution order. Read the [engineering rules](../PROJECT_RULES.md) and [fixture boundaries](R5-SELF-HANDOFF-20261115.md#execution-and-safety-boundaries). Keep accepted evidence and existing deferrals. Use existing credentials only through their authorized environment.

**Start row 01 now. At the same time, assemble the single commercial decision packet below.** Use one review for seven commercial inputs, then one final release decision after the evidence exists. The row numbers stay stable. Implementation can proceed using labeled sandbox examples while final commercial values are pending.

## Bootstrap and continuity

1. Fetch main, create an isolated branch or worktree from it and inspect open PRs linked to the same row. Resume matching work. In a GitHub-assigned Copilot branch, use that branch and sync it to current main. Use Node 22 and `npm ci`. For source changes run focused tests followed by `npm run lint`, `npm run test:authorization` and `npm run build`, as in [repository CI](../.github/workflows/deploy-container-apps.yml).
2. Read the linked artifact for the exact assertion before writing a test. If it already proves the row at its required layer, update the row with the link and take the next ready row. One run can close several rows. A successful harness PR only proves the checks it actually ran.
3. At kickoff, check access to Actions, an existing authorized release operator for protected workflows, the platform-admin sandbox role, two fixture organizations, the deployed browser and a controlled recipient mailbox. Use repository CI/OIDC and existing scoped identities. Keep role grants, environment protection and the production concurrency group intact. If an operator is needed, put the **reviewed commit, workflow, exact inputs and expected evidence** together in the PR. An authorized release operator can handle dispatch and merge. Only route this to the owner when no delegate has the required access.
4. For a deployed change, wait for reviewed code, the required checks and the correct serving build. For a harness-only change, run the merged harness against the verified serving build. Check the Actions run list before dispatch and retain the returned run ID. Dispatch once, monitor to conclusion, inspect the summary and cleanup. If dispatch is unavailable, queue those inputs for the operator and continue another ready row. Never create a fresh fixture merely because a run is slow to appear. Investigate a failed run and its cleanup before attempting a new run.
5. For each completed row edit its state in the checklist and append the immutable evidence link in the same row. Include tested SHA, environment, the observed business result and relevant isolation/cleanup. Record a redacted decision reference for a human-signed row. On handoff, leave the completed IDs, open count, pending run/PR, next ready row and any external dependency together. A later Copilot session can resume from that record.

GitHub cloud-agent PRs can require a writer to release Actions workflows and a maintainer to merge. The dispatch in the paid-inventory workflow runs only on main and uses the Production environment. Use an already-authorized operator or available approved integration for those steps. Ordinary engineering permissions may differ in an IDE session. [GitHub workflow approvals](https://docs.github.com/en/copilot/how-tos/use-copilot-agents/cloud-agent/use-cloud-agent-on-github) · [GitHub cloud-agent limits](https://docs.github.com/en/enterprise-cloud@latest/copilot/concepts/security-governance-and-network-settings/risks-and-mitigations)

## Work queue

The primary ID column assigns every row exactly once. Follow the checklist dependencies for closure. While a workflow runs or a decision is outstanding, take an independent ready row. Serialize deployed mutations using the existing workflow controls.

| Batch | Primary IDs | Execution instructions |
|---|---|---|
| A. Paid recovery and isolation | 01–07 | Start with the [paid inventory harness](../scripts/verify-deployed-paid-inventory.mjs), [quantity recovery](../src/api/managementBilling/recoveryQuantity.js), [publication routes](../src/api/managementBilling/router.js), [recovery SQL checks](../scripts/test-management-recovery-sql.mjs) and [worker](../src/api/managementBilling/recoveryWorker.js). For 02 exercise authorized platform-admin sandbox publication manually or through its authorized admin surface. For 03–07 use the existing SQL and signed-event fixtures, verify the relevant denial, scoped record counts, replay and audit against each exact checklist row. Preserve the existing worker scope. |
| B. Cessation and inventory screens | 08–13 | After 01, reuse the paid cessation harness for the approved/unsettled settlement and actual inventory change. Rows 10–13 can start independently. Use the [management billing browser suite](../scripts/verify-management-billing-browser.mjs) as the entry point for stock preparation, import, restoration and split. Capture the deployed screen and persisted outcome. Share row 10 evidence with 26 and 28. |
| C. Write enforcement | 14–18 | Reconcile existing coverage with the [deployed enforcement workflow](../.github/workflows/verify-deployed-http-enforcement.yml) and [management billing SQL suite](../scripts/test-management-billing-sql.mjs). For 14 use fixtures with confirmed dates. For 15–17 capture permitted and denied writes and database state for the named routes. After 01–17 close, use the existing release controls for 18, one fixture scope, rollback and independent health verification. |
| D. Rental QA | 19–28 | Use the [public browser checks](../scripts/verify-live-public-browser.mjs), [reservation harness](../scripts/verify-deployed-reservation-http.mjs) and [layout suite](../scripts/test-r5-layout-browser.mjs). Capture each of the five stock states separately. Use retained short-expiry evidence plus the matching rendered renter outcome for 24. For 25 use an authorized QA inbox and correlate the actual receipt to the send. An in-app notification is insufficient. For 26–28 capture the desktop, mobile and keyboard result with the specified dependencies. |
| E. Country billing before decisions | 30, 32, 33 | Work from the [pricing screen](../src/pages/ManagementPricing.jsx), [pricing contract](../src/api/managementBilling/contract.js), [issuer administration](../src/api/managementBilling/issuerAdministration.js) and existing migrations. Implement 30 using a labeled synthetic base fee. Exercise effective-dated issuer and collector/account assignments in sandbox. Verify historical invoice readback, platform-admin authority and continued support for existing billing records. Keep the actual LK base fee unset until approved. |
| F. One commercial review | 29, 34, 36, 38, 40–42 | Prepare the packet below while A–E run. First reuse existing signed records and provider references. Have the relevant role supply any missing evidence. Give the owner one consolidated packet of the remaining decisions, candidate wording and missing references. Record each valid response as it arrives. |
| G. Complete against approved inputs | 31, 35, 37, 39, 43 | Publish the actual dated LK sandbox price after 29/30. Apply the approved tax treatment after 34. Verify reactivation after 36. Match the sandbox purchase and disclosures after 31/32/33/35/38. After 42, use the [existing privacy request runbook](QUIXO-STRIPE-B02-B03-READINESS.md#cm025-prepared-request-handling-runbook-operational-proof-pending) with a controlled identity and the approved retention exceptions. Copilot can prepare the code, tests, invoice reconciliation and request fixture before review. |
| H. One release review and execution | 44, 45 | After 01–43 close, give the release owner one evidence summary and the activation instruction below. A signed go plus explicit authorization to execute the exact scope in the same reply suffices for both decisions. A release operator performs row 45 and records readback. A hold leaves the release open. |

### First engineering change

In the existing paid sandbox harness, use a fresh two-dwelling fixture and call the normal cessation service. Wrap its fixture Stripe client so the successful response from the **set_schedule_phases** write for the 2→1 schedule is discarded once after Stripe has applied it. Record the original command/key, remote schedule and initial stock. Before retry, verify SQL still shows the pending command and both managed dwellings. Retry under the original command after the supported recovery interval. Assert a single intended schedule change, one effective cessation, one recovery audit and stable exact retry. Use the existing protected-account comparison and teardown.

Add a named `cessation-response-loss` case only if the current harness still lacks equivalent coverage. Wire it into the workflow choice, shell and script allowlists, dispatch path and summary assertions. Add a check for each claimed result. Start with `node --check scripts/verify-deployed-paid-inventory.mjs`. When the reviewed scenario is available on main, the authorized operator can use the following from Bash. The operation ID belongs to this attempt. Keep it with the run record.

```bash
set -euo pipefail
repo=WasanthaK/khrental
workflow=verify-deployed-paid-inventory.yml
gh run list --repo "$repo" --workflow "$workflow" --branch main --event workflow_dispatch --limit 5
build_sha=$(curl -fsS https://app.quixo.homes/build-info.json | jq -er '.buildSha')
operation_id=$(node -p "require('node:crypto').randomUUID()")
echo "Row 01 fixture $operation_id, serving build $build_sha"
gh workflow run "$workflow" --repo "$repo" --ref main \
  -f expected_build="$build_sha" -f operation_id="$operation_id" \
  -f scenario=cessation-response-loss -f confirmation=VERIFY-PAID-INVENTORY
```

Record the run URL from dispatch or identify it in the manual run list by commit, time and the fixture in its evidence. Watch that run through cleanup. Keep this ID for diagnosis and use a fresh ID for any genuinely new fixture attempt. If the current workflow already has an equivalent case, use its published scenario name.

## Commercial decision packet — send once

Copilot prepares the actual wording, options and facts from the [country decision record](R5-LK-COMMERCIAL-READINESS-20261116.md). Reuse the approved 2% above LKR 25,000, vacant base-only rule, per-dwelling half-up rounding and initial Quixo Inc. (USA) issuer. Pre-fill from reliable records. Clearly mark proposals. Approvals made by finance, the merchant account holder or the privacy owner can satisfy their own rows. Route only unresolved choices to Wasantha. Where a decision blocks engineering, start the unaffected work immediately and apply that decision when received.

| Row | Ready-to-return answer | What Copilot prepares |
|---|---|---|
| 29 | Monthly base fee **Rs ___ per managed dwelling**. Pricing effective date **___** or named country admin to set it at publication. | Show one vacant and one Rs 100,000 rent example using the selected fee. |
| 34 | LK platform fee tax instructions approved by **role/reference ___**, effective **___**. For VAT and withholding record applicability, basis, rate or amount where applicable, and invoice/settlement treatment. | A short rule sheet for the adviser to correct or approve. Every figure must trace to the signed treatment. |
| 36 | Approve the proposed before/after-expiry terms, or supply replacement wording **___**. | Show the existing proposal for reusing paid capacity, accrued overdue balances, treatment of an inactive gap, and payment before resuming paid access. |
| 38 | Approve the attached correction, credit, refund and cancellation wording, or list edits **___**. | Quote the proposed customer wording, support owner and auditable correction path. Identify the price version, effective date and notice the sandbox purchase will display. |
| 40 | Live merchant capability and payout approval **internal reference ___**, or outstanding provider decision **___**. | Pre-fill draft US issuer and requested LK collection currency. Have the merchant account owner verify the exact live account and payout route. Keep bank details and identity documents outside GitHub. |
| 41 | LK privacy facts and notice approved by **role/reference ___**, corrections **___**. | Prepare a facts sheet and any notice diff covering controller, purposes, contact, providers, locations and transfers. |
| 42 | Retention/holds/backup schedule approved by **role/reference ___**, exceptions **___**. | Prepare the data-category table and proposed controlled request for 43. Use approved periods; leave unsupported periods visibly unresolved. |

**Access exceptions, only if actually missing.** In the same packet include the exact sandbox workflow/environment requiring its authorized operator (row 01), the authorized sandbox platform admin (02/31/32/33), a controlled mailbox holder for one redacted receipt (25), or an existing test account and permitted sign-in method (26). Prefer a delegate or a pre-existing authorized QA account. Ask for a reference or a named holder, never a password, token or MFA code in the tracker. An owner can nominate a delegate for the receipt and routine run approvals. A later external provider refusal or mandatory access approval may require follow-up. Track it once rather than repeatedly requesting the same action.

## Final release reply — after rows 01–43

Copilot supplies the 43 evidence links or an indexed checklist, tested SHA/serving revision, approved LK issuer, price version/currency, collector and redacted account reference, deployment scope, effective time, verification steps and named rollback owner. Only then present one reply for the release owner:

> **GO / HOLD** for the attached Sri Lanka release scope. If GO, **authorize row 45 activation: yes / no**. Approved scope and time: ___. Release operator: ___. Rollback owner: ___. Decision reference: ___.

A go with activation authorized lets the operator execute once and verify the actual result. A go without activation authority leaves 45 pending. A material change to account, price, entity or scope requires fresh authorization for the changed release.

## Assignment text

> Execute docs/R5-COPILOT-HANDOFF.md against current main. Begin row 01 and assemble the commercial decision packet in parallel. Continue through ready rows without routine questions. Use docs/R5-LK-CLOSURE.md for the exact finish conditions and status. Consolidate missing human inputs, retain evidence and cleanup, and leave live activation for the scoped final go.
