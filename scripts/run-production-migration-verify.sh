#!/bin/sh
set -eu

# Strictly read-only: require a separate executor identity, do not modify DDL
# or reconcile/mint any migration ledger records.
if [ "${MSSQL_MIGRATION_DEDICATED_EXECUTOR:-}" != "true" ]; then
  echo "Dedicated migration executor marker is required for verification." >&2
  exit 1
fi

export MSSQL_MIGRATION_USE_MANAGED_IDENTITY=true
exec node /app/scripts/run-production-migrations.mjs --mode=verify --through=all
