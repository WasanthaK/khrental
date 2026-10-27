# KH Rentals infrastructure ownership and access handover

Updated 2026-10-27. This is the operational handover for the existing deployment,
not an instruction to recreate infrastructure. Never put passwords, API tokens,
secret values, session cookies or recovery codes in this repository or workflow logs.

## Current disposition

The application and object-storage integrations are working. Cloudflare account
ownership/recovery and current direct-public-access settings are **UNVERIFIED**.
A source runbook, a green object-operation test or a missing password does not
prove ownership or prove that public access is disabled. Public-listing activation
must retain that gap explicitly until resolved.

Business sponsor: Wasantha Weerakoone. This is not proof that a particular
Cloudflare login, mailbox or Cloudflare account is owned by that identity.

## Cloudflare sign-in method — owner report, 2026-10-27

Wasantha Weerakoone confirmed: “Cloudflare is using my GitHub account.”
Use **Continue with GitHub** on the Cloudflare login page with the owner's
linked GitHub identity. A separate Cloudflare password is not the documented
sign-in route. The exact linked GitHub identity has not yet been independently
verified; do not infer it solely from the repository owner name.

This records the owner's reported sign-in method, not a completed login or
verified match to the production R2 account/bucket. Recovery custody, MFA,
backup access and the account/bucket match remain to be verified. GitHub login
also does not supply the separate CLOUDFLARE_R2_AUDIT_TOKEN needed by the audit.
Never record GitHub passwords, tokens, recovery codes or session cookies here.

## Resource and authority register

| Resource | Established reference | Provisioning/configuration authority | Evidence and limitation |
| --- | --- | --- | --- |
| Azure subscription | `3d42a180-fda5-4013-afcc-fdba10266f9b` | Existing Azure account/Entra administration | Referenced by current production workflows; not a new role-assignment audit |
| Azure app | `khrental-prod-rg / khrental-app`, southeastasia | `scripts/bootstrap-azure.sh`; deployment workflow | Runtime deployment #40489759980 passed, build `2760ad031f5cc92dcfc4d80e0bb9eccbf1694fe7`, Ready revision 0000386 |
| GitHub deployment identity | Bootstrap names `khrental-github-deploy`; Production OIDC trust | Azure workload federation with repository Production environment | Workflow uses AZURE_CLIENT_ID/AZURE_TENANT_ID; do not infer Cloudflare authority from Azure OIDC |
| Azure SQL | `khrentals.database.windows.net / khrentalsdb` | Existing governed migration runner and isolated `khrental-db-migrator` job | Runtime MSSQL health passed; migration authority remains governed separately |
| R2 account/bucket | Existing `Production` R2_ACCOUNT_ID and R2_BUCKET secret/variable references; app environment uses these same identifiers | Actual Cloudflare account owner **UNCONFIRMED** | Exact identifiers must be resolved by an authorized operator from the existing configuration, not invented or copied from fixtures |
| R2 object access | GitHub Production credentials; Azure secret references below | Existing bucket-scoped storage credential | Deployment and private-photo tests passed; object access is not bucket-management or login access |
| Marketing site | `quixo-homes-marketing`, `mango-grass-0314c0100.3.azurestaticapps.net` | Existing Azure Static Web Apps deployment | Static illustrative website is separate from real-property activation |
| R2 public-domain audit | Manual `Audit R2 direct public access (read only)` workflow | Separate CLOUDFLARE_R2_AUDIT_TOKEN, if configured and authorized | No live audit acceptance yet; missing/denied access must report BLOCKED |

## Credential custody and purpose

| Configuration name | Custody/reference | Purpose |
| --- | --- | --- |
| AZURE_CLIENT_ID, AZURE_TENANT_ID | GitHub Production environment | Azure OIDC deployment; no stored Azure user password required |
| R2_ACCOUNT_ID, R2_BUCKET | Production secret or variable, matching deployment workflow | Existing physical storage identity; not a Cloudflare dashboard login |
| R2_ACCESS_KEY_ID | Production secret or variable; Azure `r2-access-key-id` secret | S3-compatible object access credential |
| R2_SECRET_ACCESS_KEY | Production secret only; Azure `r2-secret-access-key` secret | S3-compatible request signing; never print/recover into chat |
| CLOUDFLARE_R2_AUDIT_TOKEN | New dedicated Production secret, **not yet verified configured** | Read-only Cloudflare management API audit; no application/browser use |
| Cloudflare login/recovery | **GitHub sign-in**, reported by owner 2026-10-27; exact linked identity and restricted recovery-custody reference unverified | Human sign-in via Continue with GitHub; do not store credentials here |

GitHub workflows can consume stored secrets without returning their values to an
agent. Do not add a workflow to dump secrets, enumerate secret values, or turn
object keys into a dashboard password. The available GitHub connector does not
provide plaintext secret reads or manual workflow dispatch.

## How the existing infrastructure was established

- PR #1 added the app/storage drivers and deployment runbook. Its description
  explicitly says it did not provision Azure/Cloudflare resources.
- `scripts/bootstrap-azure.sh` provisions the Azure environment, app shell,
  managed deployment identity, federation and app-scoped deployment role. It
  does **not** create a Cloudflare account or R2 bucket.
- PR #33 wired the pre-existing R2 bucket and credentials into production.
  PR #34 allowed identifier/key-ID lookup from Production secrets or variables;
  PR #35 moved R2 validation to a Node runner before Azure configuration.
- `.github/workflows/deploy-container-apps.yml` validates object operations,
  sets Azure secret references, configures STORAGE_DRIVER=r2, deploys the
  immutable image and verifies readiness/build/SQL connectivity. It neither
  creates the bucket nor audits its public-domain configuration.
- `provision-production-db-migration-executor.yml` provisions the isolated
  Azure SQL executor, not Cloudflare access.
- `prepare-quixo-marketing-dns.yml` obtains Azure domain-verification information;
  it is not a Cloudflare DNS/bucket management integration.

The original bucket-creation action, creator and account-owner mailbox are
**not established by these records**. The owner subsequently reported GitHub
sign-in on 2026-10-27, as recorded above; the provisioning records do not verify
that identity. Do not retrospectively label a manual or unknown action as
infrastructure-as-code.

## Access-recovery sequence

1. Preserve the working app and R2 configuration. Do not delete/recreate the
   bucket, rotate working credentials, weaken authentication, or enable public
   bucket access to solve a login problem.
2. Use **Continue with GitHub**, the sign-in method reported by the owner on
   2026-10-27. The owner selects their originally linked GitHub identity and
   completes any secure sign-in/MFA steps. Confirm the exact linked identity;
   do not assume the repository owner name proves the Cloudflare login.
3. If no record exists, the owner uses Cloudflare's normal account recovery
   or support process. The owner completes any password changes, recovery
   codes, MFA and identity checks. No password or code is sent through chat.
4. In the recovered account, compare its account ID and bucket with the
   existing R2_ACCOUNT_ID/R2_BUCKET configuration. A similar display name,
   successful login or matching domain alone is insufficient.
5. Record the owner, original sign-in method, recovery custodian, approved
   password-manager entry reference and review date in a restricted operations
   register. Record references here only where safe for a public repository.
6. With the owner's authorization, establish a business-controlled recovery
   route and backup administrator appropriate to Cloudflare's supported roles.
   This document does not itself grant a new person or agent access.
7. Use a separately scoped **R2 Admin Read only** management token for the
   owning account, narrowing resources where Cloudflare supports it. Store it
   as CLOUDFLARE_R2_AUDIT_TOKEN in GitHub Production. Do not reuse the app's
   object secret or create a global administrator token for this audit.
8. Run the audit below and retain its result. Re-run after relevant access/
   domain changes; automation is manual unless recurring work is separately requested.

## Read-only public-domain audit

`scripts/audit-r2-public-access.mjs` sends only two GET requests to the fixed
Cloudflare REST API origin for the configured account and bucket:

- `.../domains/managed`: inspect the r2.dev public-access boolean.
- `.../domains/custom`: inspect every returned custom-domain enabled boolean.

Redirects are rejected. No bucket/object creation, deletion, access-policy
change, Azure update, app deployment or public-listing activation occurs.
Only redacted status/boolean/count results are emitted; identifiers, domain
names, provider error bodies and tokens are omitted.

The manual workflow is `Audit R2 direct public access (read only)`, branch main.
It first runs credential-free unit tests. The live audit uses GitHub Production,
existing R2_ACCOUNT_ID/R2_BUCKET references, optional R2_JURISDICTION and the
dedicated audit token. A missing credential is not a reason to substitute another
secret. The result is retained in the workflow summary even on failure.

| Result | Meaning | Required disposition |
| --- | --- | --- |
| PASS | Managed r2.dev access false and every custom domain enabled=false in the current provider response | Retain run ID/date and matched configuration; only these two direct exposure mechanisms are proven |
| FAIL | At least one of those access mechanisms is enabled | Investigate affected private bucket before public release; remediation is a separately authorized settings change |
| BLOCKED | Missing/denied token, invalid identifiers, request failure or incomplete provider response | Resolve ownership/access/configuration; do not mark private access verified |
| No result | Audit did not execute or produce retained evidence | Unverified, never an implicit PASS |

This audit does **not** enumerate Workers/proxies, prove CDN cache purge,
verify object deletion/readback, or test country/tenant/listing authorization.
Those require their own existing release evidence. Keep the bucket private:
public listing derivatives are served through the guarded application endpoint.

## Retained verification and open acceptance

- Deployment #40489759980: standard images/documents/invoices write/read
  byte/content-type validation and probe cleanup passed. This test does not
  inspect managed/custom-domain configuration.
- Private-photo pilot: selected Solace image prepared, previewed, approved and
  withdrawn; original retained. Shutdown #40487576537 passed. No public image
  was released by that test.
- Single-listing safeguard #434 deployed; independent LK and BN anonymous
  inventory requests returned 404. Real-property activation remains OFF.
- Owner-reported sign-in method: GitHub, confirmed in conversation 2026-10-27;
  successful login and production account/bucket match remain unverified.
- Open: verified Cloudflare owner/linked GitHub identity/recovery custodians; exact original bucket
  provisioning provenance; successful live public-domain audit; public pilot
  storage/takedown/cache acceptance and separate owner go-live decision.

## Closure checklist

- [ ] Owner and actual Cloudflare account/bucket match verified.
- [ ] Login/recovery and restricted credential-custody references recorded.
- [ ] Backup recovery route verified by owner; no secrets in source/logs.
- [ ] Live direct-public-access audit PASS retained with run/date.
- [ ] Separate Workers/proxy/cache/takedown concerns assessed for the public pilot.
- [ ] Canonical plan records this operational acceptance without reopening completed private tests.

## Official references

- [R2 authentication and permission scopes](https://developers.cloudflare.com/r2/api/tokens/)
- [Independent public bucket access methods](https://developers.cloudflare.com/r2/buckets/public-buckets/)
- [Cloudflare R2 management API](https://developers.cloudflare.com/api/resources/r2/)
