#!/usr/bin/env bash
# Crea una BD temporal, aplica el shim + migraciones + pruebas RLS.
set -euo pipefail
DB=${DB:-aula_test}
PSQL="psql -v ON_ERROR_STOP=1 -q -h ${PGHOST:-/tmp/pg} -p ${PGPORT:-54322} -U postgres"
$PSQL -d postgres -c "drop database if exists $DB" -c "create database $DB"
$PSQL -d postgres -c "do \$\$ begin if not exists (select 1 from pg_roles where rolname='authenticated') then null; end if; end \$\$" >/dev/null
DIR=$(cd "$(dirname "$0")" && pwd)
# los roles son globales: crearlos solo si no existen
if [ "$($PSQL -d postgres -tAc "select 1 from pg_roles where rolname='authenticated'")" = "1" ]; then
  sed '/^create role/d' "$DIR/shim_supabase.sql" | $PSQL -d $DB
else
  $PSQL -d $DB -f "$DIR/shim_supabase.sql"
fi
for f in "$DIR"/../migrations/*.sql; do echo "→ $(basename "$f")"; $PSQL -d $DB -f "$f"; done
$PSQL -d $DB -f "$DIR/rls_test.sql"
$PSQL -d $DB -f "$DIR/rls_international_test.sql"
[ "${GEN_TYPES:-0}" = "1" ] && python3 "$DIR/../../scripts/gen-db-types.py" "host=${PGHOST:-/tmp/pg} port=${PGPORT:-54322} user=postgres dbname=$DB"
