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
