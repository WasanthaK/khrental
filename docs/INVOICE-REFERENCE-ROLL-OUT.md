# Invoice payment references — safe two-stage production release

Status: **preparation only**. Neither PR is approval to apply production schema.

## Required order

1. Review and merge this **schema-only** PR while the serving KH Rentals app still
   runs the existing invoice code. It adds only the new reference table, index,
   and billing timezone column; old invoice URLs/amounts are not modified.
2. Observe the automatic **read-only** production migration plan on main.
   Verify the migration ledger, checksum, and all prior pending migrations.
   The production migration executor must be verified as a separate privileged
   identity, not the serving application's identity. No firewall opening or
   DDL privilege escalation for the serving app.
3. Obtain explicit operator approval **separately** for production
   `20261018_01_invoice_payment_references` migration apply, using the
   canonical protected workflow `Run production database migrations`,
   target `20261018_01_invoice_payment_references`, confirmation
   `APPLY-PRODUCTION`. The selected `through` target includes earlier
   unapplied migrations; do not approve until their effects are reviewed.
4. Run read-only post-apply verification of the ledger, table, unique index,
   timezone column and runtime DB health; ensure the old app continues to
   load invoices.
5. Only after schema verification, merge the **application PR #334** to
   release eight-digit `YYMMDDNN` bank references. Verify a disposable
   two-tenant billing suite and browser rendering against the released
   commit. Never issue a real invoice merely for a smoke test.
6. Confirm renter/staff invoice account, PDF and controlled email share the
   reference. Existing issued invoices remain unchanged; an audited
   payment-instructions supplement is a separate change and requires
   its own acceptance/authorization.

## Stop conditions

- Do not merge PR #334 before the production schema and ledger are verified.
  The new invoice read query requires `invoice_payment_references` to exist.
- Do not run `apply` or change Azure SQL grants as part of CI or review.
- Do not infer the dedicated migrator job exists or is privileged from source.
- If schema preflight reports missing earlier migrations or checksum drift,
  stop and obtain a separately reviewed migration plan.
- If the application rollout fails, rollback to the previous app image; do
  not delete the reference table or modify issued invoices during rollback.
- Do not send live email, alter bank account settings, or issue production
  invoices as release checks.

## Reference contract

The new reference is 8 numeric digits `YYMMDDNN`, sequence 01–99 per
tenant-local calendar day; tenant-unique in SQL and issued immutably. The
invoice UUID remains authoritative internally. Tenants without an explicitly
configured billing timezone use UTC in the application; the migrated KH
Rentals organization uses Asia/Colombo. Existing invoices do not receive
new references silently.
