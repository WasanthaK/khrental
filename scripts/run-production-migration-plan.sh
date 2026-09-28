#!/bin/sh
set -eu

# This executable is intentionally plan-only. The production web identity must
# never be used to apply DDL migrations.
export MSSQL_MIGRATION_USE_MANAGED_IDENTITY=true
exec node /app/scripts/run-production-migrations.mjs --mode=plan --through=all
