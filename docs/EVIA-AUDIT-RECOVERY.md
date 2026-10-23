# Recover an existing Evia signing audit

Use this action when a completed historic agreement already has a locally
retained signed PDF, its signing audit is missing from KH Rentals, and the
audit exists in Evia. This does not initiate signing or resend invitations.

An active tenant administrator opens View Signing Audit, then chooses
Recover existing audit from Evia on the document error. A successful recovery reloads the
protected viewer so the audit can be inspected and downloaded.

Recovery uses the deployment's existing server-side Evia integration key;
it does not require a browser signing session. The key stays on the server.
The server reads the agreement under the active tenant and uses its stored
Evia request reference. Caller-supplied provider IDs and storage paths are
not accepted. Recovery downloads only the request's single audit_trail.pdf,
requires PDF bytes, conditionally creates the scoped object, and checks exact
readback. Existing valid audits are reused. Storage errors, ambiguous or
missing provider audits, invalid PDFs and conflicting retained bytes fail
without overwriting the signed agreement or audit. Structured server logs
record the actor, tenant, agreement and whether recovery created an object;
credentials and PDF contents are not logged.

This route is restricted to historic stable signed-document paths. Fenced
staged archives continue to require their existing publication protocol.
It does not update agreement status, signature rows, SQL manifests or
invoice archive flags. No schema migration is required.

Release validation must separately prove recovery of the existing provider
audit for the controlled agreement, authorized PDF retrieval and denial for
unauthorized users. Passing fixture tests is not live provider acceptance.
