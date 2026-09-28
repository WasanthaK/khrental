#!/bin/sh
set -eu

# This executable is reserved for the isolated production migration job.
# The serving web Container App never sets MSSQL_MIGRATION_DEDICATED_EXECUTOR.
if [ "${MSSQL_MIGRATION_DEDICATED_EXECUTOR:-}" != "true" ]; then
  echo "Dedicated migration executor marker is required." >&2
  exit 1
fi

through="${MIGRATION_THROUGH:-all}"
export MSSQL_MIGRATION_USE_MANAGED_IDENTITY=true
exec node /app/scripts/run-production-migrations.mjs --mode=apply --through="$through"
