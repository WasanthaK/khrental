# Storage delivery hotfix release note

Fixes HTTP 500 responses for nested authenticated storage URLs by resolving the remaining mounted request path correctly and treating missing/directory objects as 404.

No database migration is required.
