#!/usr/bin/env bash
# Applies every migration to a throwaway Postgres and asserts the properties
# they exist to create (#35). Run by CI's migration-verify job; runnable
# locally against any disposable database:
#
#   DATABASE_URL=postgres://postgres@localhost:5432/postgres \
#     scripts/ci-verify-migrations.sh
#
# NEVER point this at a real project: it seeds and mutates data.
set -euo pipefail

: "${DATABASE_URL:?set DATABASE_URL to a THROWAWAY postgres database}"

run() { psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q "$@"; }

echo "==> Supabase shim (roles, auth, storage, default privileges)"
run -f supabase/ci/supabase-shim.sql

apply_all() {
  local f
  for f in supabase/migrations/*.sql; do
    echo "    applying $f"
    run -f "$f"
  done
}

echo "==> Applying migrations (first pass)"
apply_all

echo "==> Applying migrations again — the idempotency the convention claims"
apply_all

echo "==> Assertions (seed a tenant, then check what each role can see)"
run -f supabase/ci/assertions.sql

echo "==> OK: migrations apply twice and every assertion held"
