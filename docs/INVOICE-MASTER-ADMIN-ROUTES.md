# Invoice master administrator API — dependent draft

Prerequisite: draft PR #339 migration must be approved, applied and strictly verified before any app/admin release.

Routes /api/invoice-master require active tenant membership and administrator role.
Normal manager is the tenant organization; outsourced management and alternate issuer require explicit verified details.
Property and unit beneficiaries are independent of manager and issuer; existing bank names and property addresses are reused.
Full-record PUTs, serializable SQL writes and scoped field-change audit rows prevent accidental changes and retain no raw old bank details.
Historical invoices, issued snapshots, UUIDs, bank references and issue flows remain unchanged.

Unit tests and disposable SQL/browser authorization tests still require execution; do not merge or deploy until gates pass.