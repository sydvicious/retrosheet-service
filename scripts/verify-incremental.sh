#!/usr/bin/env bash
# Copyright (c) 2026 Syd Polk
# SPDX-License-Identifier: BSD-3-Clause
#
# Prove the partial reload against the thing it replaces: a full load of the
# newer data. Dev-only: needs the built dist, Docker's db service up, a
# Retrosheet clone WITH HISTORY, and the downloaded game logs.
#
#   1. Extract the trees of two upstream commits, A (older) and B (newer), with
#      `git archive` — the clone itself is never checked out or modified — and
#      give both the same game logs.
#   2. Full load of A into a separate database.
#   3. scripts/data-changes.sh between A and B, then the loader's --replace with
#      that change set against B's tree.
#   4. Snapshot: per table, per season, the row count and an order-independent
#      hash of the rows with identity columns removed (each row's MD5 summed as
#      a 60-bit integer, then hashed), so no sort of millions of rows is needed
#      and the result does not depend on ids or physical order.
#   5. Full load of B into the same database; snapshot again; diff.
#
# Zero differences is the pass (exit 0); a difference is printed and exits 1.
#
# Usage: scripts/verify-incremental.sh <clone-with-history> <commit A> <commit B>
#   e.g. scripts/verify-incremental.sh ~/Documents/Baseball/retrosheet/retrosheet HEAD~2 HEAD
#
# Environment:
#   VERIFY_DATABASE_URL  default postgres://retrosheet:retrosheet@localhost:5432/retrosheet_verify
#                        (created if missing, via the compose db service)
#   GAMELOG_DIR          default ./.data/gamelog — the downloaded gl<year>.txt files
#   VERIFY_DIR           default ./.verify — work area (gitignored); cleared on start
#
# Two full loads take a while (about 15 minutes each on an M-series Mac); run it
# in the background or in tmux.
set -euo pipefail

if [ $# -ne 3 ]; then
  echo "usage: $0 <clone-with-history> <commit A> <commit B>" >&2
  exit 2
fi
CLONE="$1"
A="$(git -C "$CLONE" rev-parse "$2")"
B="$(git -C "$CLONE" rev-parse "$3")"
: "${VERIFY_DATABASE_URL:=postgres://retrosheet:retrosheet@localhost:5432/retrosheet_verify}"
: "${GAMELOG_DIR:=./.data/gamelog}"
: "${VERIFY_DIR:=./.verify}"
DBNAME="${VERIFY_DATABASE_URL##*/}"

if [ ! -f dist/etl/run.js ]; then
  echo "dist/etl/run.js missing; run npm run build first." >&2
  exit 1
fi
if ! ls "$GAMELOG_DIR"/gl[0-9]*.txt >/dev/null 2>&1; then
  echo "No game logs in $GAMELOG_DIR; run scripts/fetch-data.sh first." >&2
  exit 1
fi

psql_verify() { docker compose exec -T db psql -v ON_ERROR_STOP=1 -U retrosheet -d "$DBNAME" -At "$@"; }

echo "==> Preparing $VERIFY_DIR with the trees of ${A:0:12} and ${B:0:12} …"
rm -rf "$VERIFY_DIR"
for c in "$A" "$B"; do
  mkdir -p "$VERIFY_DIR/$c/gamelog"
  git -C "$CLONE" archive --format=tar "$c" | tar -x -C "$VERIFY_DIR/$c"
  cp -p "$GAMELOG_DIR"/gl[0-9]*.txt "$VERIFY_DIR/$c/gamelog/"
done
VER_A="$(./scripts/data-version.sh "$VERIFY_DIR/$A" "$A")"
VER_B="$(./scripts/data-version.sh "$VERIFY_DIR/$B" "$B")"
echo "    A: $VER_A"
echo "    B: $VER_B"

echo "==> Ensuring database $DBNAME …"
docker compose up -d db >/dev/null
if ! docker compose exec -T db psql -U retrosheet -d postgres -Atc "SELECT 1 FROM pg_database WHERE datname = '$DBNAME'" | grep -q 1; then
  docker compose exec -T db psql -U retrosheet -d postgres -c "CREATE DATABASE $DBNAME" >/dev/null
fi

# Snapshot: one line per (table, season): count and an order-independent hash
# of the rows minus ids. Each row hashes to 60 bits of its MD5; the sum (as
# numeric, so it cannot overflow) is hashed again for a short line.
H="md5(sum(('x' || left(md5(x), 15))::bit(60)::bigint)::text)"
snapshot() {
  {
    for t in game game_info lineup_start substitution comment earned_runs game_adjustment play \
             fielding_daily batting_daily pitching_daily; do
      if [ "$t" = game ]; then
        echo "SELECT '$t', extract(year FROM game_date)::int, count(*), $H FROM (SELECT game_date, (to_jsonb(g) - 'id')::text AS x FROM game g) s GROUP BY 2 ORDER BY 2;"
      else
        echo "SELECT '$t', extract(year FROM g.game_date)::int, count(*), $H FROM (SELECT t.game_id, (to_jsonb(t) - 'id')::text AS x FROM $t t) s JOIN game g ON g.game_id = s.game_id GROUP BY 2 ORDER BY 2;"
      fi
    done
    echo "SELECT 'roster', year, count(*), $H FROM (SELECT year, (to_jsonb(r) - 'id')::text AS x FROM roster r) s GROUP BY 2 ORDER BY 2;"
    echo "SELECT 'schedule', extract(year FROM game_date)::int, count(*), $H FROM (SELECT game_date, (to_jsonb(r) - 'id')::text AS x FROM schedule r) s GROUP BY 2 ORDER BY 2;"
    for t in people teams ballparks coaches ejections relatives game_log; do
      echo "SELECT '$t', 0, count(*), $H FROM (SELECT (to_jsonb(t) - 'id')::text AS x FROM $t t) s;"
    done
    echo "SELECT 'schema_meta', 0, version, data_version || ' etl ' || etl_version FROM schema_meta;"
  } | psql_verify -c "SET search_path TO retrosheet" -f -
}

echo "==> Full load of A …"
RETROSHEET_DIR="$VERIFY_DIR/$A" RETROSHEET_VERSION="$VER_A" DATABASE_URL="$VERIFY_DATABASE_URL" \
  node dist/etl/run.js > "$VERIFY_DIR/load-A.log" 2>&1
tail -1 "$VERIFY_DIR/load-A.log"

echo "==> Change set A → B …"
changes="$(RETROSHEET_DIR="$CLONE" ./scripts/data-changes.sh "$VER_A" "$VER_B")"
echo "$changes" | sed 's/^/    /'
if echo "$changes" | grep -qx full; then
  echo "The change set is unknown (full); pick a pair whose old commit the clone has." >&2
  exit 1
fi
# Every key=value line but describe and oldfiles goes to --replace, as update.sh does.
replace_args=()
while IFS='=' read -r key value; do
  case "$key" in
    describe|oldfiles|"") ;;
    *) replace_args+=("$key=$value") ;;
  esac
done <<<"$changes"

echo "==> Partial load of B (--replace) …"
RETROSHEET_DIR="$VERIFY_DIR/$B" RETROSHEET_VERSION="$VER_B" DATABASE_URL="$VERIFY_DATABASE_URL" \
  node dist/etl/run.js --replace "${replace_args[@]}" > "$VERIFY_DIR/load-partial.log" 2>&1
grep -E "^Replacing|^Done" "$VERIFY_DIR/load-partial.log"
snapshot > "$VERIFY_DIR/partial.txt"

echo "==> Full load of B …"
RETROSHEET_DIR="$VERIFY_DIR/$B" RETROSHEET_VERSION="$VER_B" DATABASE_URL="$VERIFY_DATABASE_URL" \
  node dist/etl/run.js > "$VERIFY_DIR/load-B.log" 2>&1
tail -1 "$VERIFY_DIR/load-B.log"
snapshot > "$VERIFY_DIR/full.txt"

echo "==> Comparing …"
if diff "$VERIFY_DIR/partial.txt" "$VERIFY_DIR/full.txt" > "$VERIFY_DIR/diff.txt"; then
  echo "PASS: partial reload of ${B:0:12} matches a full load ($(grep -c . "$VERIFY_DIR/full.txt") table/season lines)."
else
  echo "FAIL: partial and full loads differ ($VERIFY_DIR/diff.txt):"
  cat "$VERIFY_DIR/diff.txt"
  exit 1
fi
