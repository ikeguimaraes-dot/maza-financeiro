#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
test_container="maza-financeiro-test-${RANDOM}-${RANDOM}"
trap 'docker rm -f "$test_container" >/dev/null 2>&1 || true' EXIT
docker run --rm -d --name "$test_container" -e POSTGRES_HOST_AUTH_METHOD=trust postgres:16-alpine >/dev/null
for attempt in {1..30}; do
  if docker exec "$test_container" pg_isready -U postgres >/dev/null 2>&1; then break; fi
  sleep 1
done
docker exec -i "$test_container" psql -U postgres -v ON_ERROR_STOP=1 < tests/sql/fixture-schema.sql >/dev/null
docker exec -i "$test_container" psql -U postgres -v ON_ERROR_STOP=1 < supabase/migrations/20260917235835_financeiro_integridade_acesso.sql >/dev/null
docker exec -i "$test_container" psql -U postgres -v ON_ERROR_STOP=1 < tests/sql/financeiro-integridade.sql >/dev/null
printf '%s\n' 'OK: migration, rollback, substituição, revisão, RLS e identidade de NF-e.'
