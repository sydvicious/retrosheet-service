#!/usr/bin/env bash
# Copyright (c) 2026 Syd Polk
# SPDX-License-Identifier: BSD-3-Clause
#
# Update an installation to the current checkout and the latest Retrosheet data.
# Reloads the database only when it has to:
#
#   1. refresh the Retrosheet data (scripts/fetch-data.sh)
#   2. rebuild the images from the working tree
#   3. ask the loader whether the database is current — same schema version as
#      this code, loaded by the same ETL version (parser/loader logic), AND loaded
#      from the same data (the clone's commit plus a hash of the game logs
#      fetch-data.sh downloads, which aren't in the clone)
#   4. an empty database is loaded without asking. A schema or ETL change, or a
#      database that recorded no data version, needs a full reload: say why and
#      ask. (A schema change drops and rebuilds the schema first, so the API/MCP
#      are unavailable during that load; otherwise the reload is one transaction
#      and they keep serving the old data.)
#   5. a data-only change is narrowed with scripts/data-changes.sh to the
#      seasons, reference data, and game logs that changed, and only those are
#      reloaded (the loader's --replace) after asking. Nothing relevant changed
#      (an upstream docs commit): the new version is just recorded. More than
#      half the seasons changed: offered as a full reload instead.
#      Anything but "y" at a question stops the script with the database and
#      the running services untouched.
#   6. bring up db/api/mcp on the new images (recreating api/mcp after a full
#      reload so PostGraphile re-introspects the schema)
#
# Usage: scripts/update.sh [--force]
#   --force   full reload without checking or asking
#
# Without a terminal on stdin the question can't be asked, so a needed reload
# stops the script; use --force there.
#
# This script does NOT touch the service repo's git — check out / pull the code
# you want yourself first; the build reads the working tree as-is.
#
# Run from the repo directory. Honors RETROSHEET_DIR (default ./.data). On a
# REMOTE host, run it inside tmux or screen so a dropped SSH connection can't
# abort a multi-minute load:
#   tmux new -s retro './scripts/update.sh'   (reattach: tmux attach -t retro)
set -euo pipefail

FORCE=0
case "${1:-}" in
  --force) FORCE=1 ;;
  "") ;;
  *) echo "usage: $0 [--force]" >&2; exit 2 ;;
esac

: "${RETROSHEET_DIR:=./.data}"
export RETROSHEET_DIR

echo "==> Refreshing Retrosheet data ($RETROSHEET_DIR) …"
./scripts/fetch-data.sh "$RETROSHEET_DIR"

# The data's identity (scripts/data-version.sh). Empty when the data dir isn't a
# git clone, which the loader treats as "can't tell" and reloads. Exported so the
# compose file passes it to the loader.
RETROSHEET_VERSION="$(./scripts/data-version.sh "$RETROSHEET_DIR")"
export RETROSHEET_VERSION
echo "    Retrosheet data version: ${RETROSHEET_VERSION:-(not a git clone)}"

echo "==> Rebuilding images …"
# --profile etl so the loader image is rebuilt too.
docker compose --profile etl build --no-cache --pull

echo "==> Ensuring Postgres is up …"
docker compose up -d db

reload() {
  echo "==> Reloading the database …"
  docker compose run --rm loader
  echo "==> Recreating the services …"
  docker compose up -d --force-recreate api mcp
  echo "Updated and reloaded."
}

# Ask a y/N question; anything else stops the script. Without a terminal the
# question can't be asked, so stop and point at --force.
confirm() {
  if [ ! -t 0 ]; then
    echo "A reload is needed. Re-run with --force to reload." >&2
    exit 1
  fi
  read -r -p "$1 [y/N] " answer
  case "$answer" in
    y|Y|yes|YES) ;;
    *) echo "Stopped. Database and services unchanged."; exit 0 ;;
  esac
}

# A data-only change: narrow it to what changed and reload just that.
partial_reload() {
  echo "==> Working out what changed …"
  old_version="$(docker compose run --rm -T loader node dist/etl/run.js --data-version | tail -1)"
  changes="$(./scripts/data-changes.sh "$old_version" "$RETROSHEET_VERSION")"
  seasons=""; reference=0; gamelog=0; describe=""
  while IFS='=' read -r key value; do
    case "$key" in
      seasons) seasons="$value" ;;
      reference) reference="$value" ;;
      gamelog) gamelog="$value" ;;
      describe) describe="$value" ;;
      full) describe="everything (full reload)"; seasons="FULL" ;;
    esac
  done <<<"$changes"

  if [ "$seasons" = "FULL" ]; then
    confirm "The change set is unknown. Reload the whole database?"
    reload
    return
  fi

  changed=0
  if [ -n "$seasons" ]; then changed="$(echo "$seasons" | tr ',' '\n' | grep -c .)"; fi
  total="$(ls "$RETROSHEET_DIR/seasons" 2>/dev/null | grep -Ec '^[0-9]{4}$' || true)"
  if [ "$total" -gt 0 ] && [ $((changed * 2)) -gt "$total" ]; then
    confirm "$changed of $total seasons changed. Reload the whole database?"
    reload
    return
  fi

  if [ "$describe" = "nothing" ]; then
    echo "==> No loaded data changed; recording data version $RETROSHEET_VERSION …"
    docker compose run --rm loader node dist/etl/run.js --replace seasons= reference=0 gamelog=0
    echo "==> Bringing up the services …"
    docker compose up -d db api mcp
    echo "Updated. Database rows unchanged."
    return
  fi

  echo "Changed: $describe."
  confirm "Reload those?"
  echo "==> Reloading $describe …"
  docker compose run --rm loader node dist/etl/run.js --replace "seasons=$seasons" "reference=$reference" "gamelog=$gamelog"
  echo "==> Bringing up the services …"
  docker compose up -d db api mcp
  echo "Updated; reloaded $describe."
}

if [ "$FORCE" -eq 1 ]; then
  reload
  exit 0
fi

echo "==> Checking whether the database is current …"
set +e
docker compose run --rm loader node dist/etl/run.js --check
rc=$?
set -e

case "$rc" in
  0)
    echo "==> Bringing up the services …"
    docker compose up -d db api mcp
    echo "Updated. Database unchanged."
    ;;
  11)
    echo "==> Loading the empty database …"
    reload
    ;;
  10)
    confirm "Reload the database?"
    reload
    ;;
  12)
    confirm "The data can't be compared. Reload the database anyway?"
    reload
    ;;
  13)
    partial_reload
    ;;
  *)
    echo "Database check failed (exit $rc)." >&2
    exit "$rc"
    ;;
esac
