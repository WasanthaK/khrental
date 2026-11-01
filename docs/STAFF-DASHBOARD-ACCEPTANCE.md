# Staff dashboard correction — 1 November 2026

Production evidence: owner reported GET /api/mssql/properties?pageSize=500 returning 403 after demo staff setup. Shared property lists now use central platform queries with existing tenant and property-assignment authorization. Dashboard skips the full legacy user directory for actors without Team-management permission. No server access guard changes.

Local targeted regression: 42 tests pass, covering property assignment isolation, empty scopes, normalization and error propagation. Production deployment and staff browser acceptance remain open. Platform-admin status probing and remaining detail-page legacy reads require follow-up; this patch does not establish complete staff acceptance.

Canonical #459 / Item 1 remains OPEN. Item 2 remains deferred. No session tokens are recorded.
