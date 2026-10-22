# KH Rentals — Customer Invoice Designer release gates

Status: **development validation green before customer acceptance**, not production-approved.  
Applies to stacked PRs #338, #339, #340, #341 and #344.

## Scope and existing evidence

The Invoice Designer includes four curated templates, tenant logo and issuer
configuration, safe synthetic PDF preview, issuer/beneficiary master-data
controls, issue-time snapshot, deterministic PDF, atomic R2 conditional create,
SQL write-once archive manifest, renter/staff-authorized original-document
download and exact-byte email resend. The feature is off until explicitly
enabled with `INVOICE_IMMUTABLE_ARCHIVE_ENABLED=true`.

Passing source/unit tests or the disposable SQL Server 2022 proof do not
substitute for validation of a real storage account, live sender, deployment or
business sign-off. A historical invoice without a committed PDF archive must
not claim that an original issued PDF exists.

## Required, ordered delivery gates

1. **Engineering review:** preserve the dependency chain: #339 schema,
   #340 validation/admin settings, #341 snapshot renderer, #344 customer
   designer and archive integration. #338 is a separate foundation change.
   Reconcile every stacked diff onto current `main`, including subsequently
   merged invoice changes; do not assume a branch is conflict-free against
   `main` because its PR can merge into its older feature base.
2. **Build and test:** run the dedicated appleserv Invoice Designer workflow on
   the *final* integration commit, including `npm run build`,
   `npm run test:invoice-master`, authorization tests, immutable archive
   tests and disposable two-migration SQL Server 2022 acceptance.
   Complete any remaining authenticated HTTP/browser coverage before activation.
3. **Governed schema apply:** with the flag **off**, record the exact source
   SHA, SQL migration checksums, verified database target and rollback/read-only
   recovery plan. Run the dedicated executor in `--mode=preflight` (read-only).
   Obtain explicit owner approval before `--mode=apply`. The new eighth
   migration is `20261019_01_invoice_master_data`; the ninth is
   `20261020_01_immutable_invoice_pdf_archive`. Never modify already-issued
   invoice records or backfill archived PDFs.
4. **Migration proof:** after authorized apply, run isolated
   `--mode=verify` and require **9/9** schema and ledger verification on the
   approved production database. No app API silently creates these tables.
5. **Private R2 proof:** verify configured durable R2 storage and credentials;
   test the `If-None-Match: *` conditional object PUT, exact-byte readback,
   duplicate-create refusal, cross-tenant read rejection, integrity mismatch,
   and interrupted-write reconciliation. No generic storage path may serve or
   modify a committed invoice.
6. **Controlled customer journey:** in an explicitly approved isolated test
   tenant, verify staff can enter legal issuer and payment beneficiary, upload
   PNG, select each template and preview synthetic PDF; then issue **one
   authorized test invoice**, inspect its archived PDF, verify email attachment
   hash, retrieve it as the assigned renter, change tenant branding, and
   verify the original PDF and staff resend bytes are identical. Also test
   denial to a foreign tenant, unassigned staff and anonymous users.
7. **Rollout gate:** only after all previous checks pass, approve enabling the
   archive feature flag for the controlled deployment; verify serving commit,
   database revision, R2 health, provider trace, then obtain owner business
   acceptance. Do not enable the flag prematurely, even when CI is green.

## Stop and recovery rules

- **Do not issue** if issuer identity, party authority, beneficiary, line
  totals, required schema or durable archive storage is invalid.
- **Do not email** unless archived bytes were read back and verified against
  the committed manifest. Unknown delivery is *not* proof of failure and
  must not trigger automatic duplicate email sends.
- **Do not re-render** an issued invoice for customer download or resend.
- **Do not overwrite or delete** an archived PDF, change an existing issued
  invoice to force success, or infer an archive from an old invoice record.
- On uncertain state, leave the flag disabled and reconcile SQL, object-store
  and delivery evidence before any further invoice action.

## Human acceptance evidence to record

Exact commit and PR chain; migration preflight/apply/verify execution links;
R2 conditional-write proof and SHA-256 comparison; test invoice and tenant
identifiers held only in the authorized test environment; successful scoped
staff/renter UI screenshots; provider event correlation; approval and
production serving-fingerprint check.

## I03 — pre-migration invoice-master UI rollout guard

While production is still at **7/9** managed schema migrations, Invoice
Designer profile and property/unit beneficiary forms must not query new SQL
columns. The **default-off** build flag `VITE_INVOICE_MASTER_SETTINGS_ENABLED`
gates all three customer UI entry points: Settings > Invoice Designer,
Property > Invoice Billing and Unit > Invoice Billing.

The default is OFF unless the Vite build is explicitly supplied the string
`true`. This is an **application UI visibility safeguard only**, not
a server endpoint authorization change or permission to use an unmigrated
production database. The existing authenticated backend authorization stays
in force and the invoice archive remains gated independently by
`INVOICE_IMMUTABLE_ARCHIVE_ENABLED`.

After separately authorized migrations eight/nine and strict **9/9**
verification, approve the master-settings UI rollout, build/deploy with the
flag set, then verify the controlled customer journey while the immutable
invoice archive flag remains OFF until its independent acceptance gates pass.
Do not treat hiding the Settings form as evidence that migrations were applied.

## I02 — controlled immutable archive tenant-scope safety gate

**No automatic activation.** An application-wide
`INVOICE_IMMUTABLE_ARCHIVE_ENABLED=true` alone is insufficient for a safe
controlled production tenant trial. The new server-side
`INVOICE_IMMUTABLE_ARCHIVE_CANARY_TENANTS` must contain one or more
explicit, comma-separated **tenant UUIDs**. Empty values, wildcards and
malformed allowlists fail closed; an incorrect entry invalidates the entire
list. Both checks are enforced on account archive availability, issued-PDF
retrieval, first issuance, and delivery/retry/resend attachment construction.
The existing permissions and SQL/R2 archive safeguards still apply.

The feature remains OFF in production. Only after the separately approved
R2 acceptance and test-tenant authorization may an operator configure the
controlled tenant allowlist and enable the feature flag; this deliberately
does not constitute global rollout. Broad availability must be separately
reviewed and implemented. Existing tenants not allowlisted continue using
their existing invoice path.

As of 2026-10-22, governed migration apply
[#39751158286](https://github.com/WasanthaK/khrental/actions/runs/39751158286)
and independent strict 9/9 check
[#39762736411](https://github.com/WasanthaK/khrental/actions/runs/39762736411)
both passed. Existing production R2 deployment probe confirms **generic**
write/read and cleanup in
[#39721498237](https://github.com/WasanthaK/khrental/actions/runs/39721498237).
This does **not** prove the invoice archive's real conditional PUT or its
read/duplicate/crash recovery behavior against R2; that remains I02 acceptance.
No synthetic R2 object is created by this source change.

## I02 — production synthetic R2 conditional-PDF proof (2026-10-22)

**PASS — live R2 conditional-create primitive, not full invoice activation.**
The owner explicitly approved one disposable synthetic PDF probe. A dedicated,
one-shot Production GitHub Actions run
[#39772830467](https://github.com/WasanthaK/khrental/actions/runs/39772830467)
used the existing R2 driver to write a single PDF under the dedicated
`invoices/_healthchecks/i02-conditional-invoice-pdf/` namespace.

The run independently verified that `If-None-Match: *` created the object,
returned the exact PDF bytes and SHA-256 with `application/pdf`, rejected
an identical retry and a changed-payload overwrite with HTTP **412**, and
retained unchanged original bytes. Cleanup deleted **only** its unique
synthetic object and a subsequent GET returned HTTP **404**. The job passed.

This probe did **not** use the canonical
`tenants/{tenantId}/invoices/{invoiceId}/issued/sha256-{digest}.pdf`
archive namespace, insert SQL ledger rows, send mail, create/modify a customer
invoice, or enable either rollout flag. It proves the underlying signed R2
conditional storage primitive under real credentials; application archive
publication, SQL write-once evidence, crash recovery, authorized/denied
cross-tenant retrieval, and exact-byte customer journey **still require
separate I02 acceptance**. The probe-only branch and workflow must not be
rerun as implicit authority for additional production objects.

