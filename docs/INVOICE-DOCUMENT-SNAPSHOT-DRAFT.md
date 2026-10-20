# Draft invoice document snapshot and A4 renderer

This is a **candidate only**, not the production PDF or email attachment path.

The renderer accepts an explicit version 1 **invoice_issued** document
snapshot with verified legal issuer, named renter/property, reconciled charge
amounts, the issued bank beneficiary (or explicitly missing payment details),
and dates/reference. It cannot look up live tenant/property data and does not
guess the issuer, bank account holder or recipient.

The candidate PDF targets one A4 page for ordinary monthly rent/utility
invoices while adding continuation pages when needed. It returns a SHA-256
of the exact PDF bytes and a separate hash of the normalized snapshot.
These hashes are evidence only: **no archive or send is performed**.

## Release blockers (not waived by passing these tests)

1. Approve/deploy/verify the issuer/beneficiary schema and admin data entry
   from dependent draft PRs #339 and #340.
2. Within the existing governed issue transaction, build the canonical
   invoice snapshot from authorized, verified issuer and property/unit
   beneficiary records, preserving the full issued line items and totals.
3. Persist issued PDF **bytes** and hash under tenant/invoice immutable
   storage ownership; create an auditable archive ledger and ensure recovery
   across DB and object-storage failure boundaries.
4. Resend and historical downloads must read the archived issued bytes,
   not regenerate from current business information. Enforce ownership and
   no publicly enumerable URLs.
5. Run true API + SQL Server + storage integration, including cross-tenant
   rejection and exact resend byte-equality proof. Authorize a separate
   production cutover only after that acceptance.

Legacy invoices are not backfilled or recomputed by this candidate.


## Candidate exact-byte archive read contract (not connected to runtime)

The new \`issuedInvoiceArchiveCandidate.js\` prepares a document descriptor
from the authoritative issued snapshot and PDF bytes. Its path is scoped by
tenant and invoice and includes a SHA-256 PDF fingerprint. It has no storage
writes and cannot send mail.

A separate read helper requires a caller-supplied committed ledger manifest
with the exact tenant ID, invoice ID, canonical archive path, PDF hash, snapshot
hash and byte length. It obtains bytes **only** from the stored object and
rejects missing, changed, truncated or mismatched content. It does not
re-render PDFs from current mutable organization or property data. The
helper does not grant authorization on its own; the future route must first
verify tenant membership, invoice/property ownership and the actual ledger.

The \`committed\` state is **not** established by this draft helper. Content-
addressed file paths alone are not write-once storage: ordinary storage upload
can overwrite them. Production still needs a fenced, transactional SQL ledger,
write-once/conditional object creation, archive reconciliation after crashes,
object retention controls and exact-attachment byte-equality tests.
