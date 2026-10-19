#!/bin/sh
set -eu

# Read-only readiness before an explicitly approved migration apply. This is
# deliberately not equivalent to strict post-apply acceptance.
if [ "${MSSQL_MIGRATION_DEDICATED_EXECUTOR:-}" != "true" ]; then
  echo "Dedicated migration executor marker is required for preflight." >&2
  exit 1
fi

export MSSQL_MIGRATION_USE_MANAGED_IDENTITY=true
exec node /app/scripts/run-production-migrations.mjs --mode=preflight --through=all
