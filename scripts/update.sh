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
#   4. an empty database is loaded without asking. If the schema, the ETL, or
#      the data has changed, say which and ask before reloading; likewise when
#      the database recorded no data version and the data can't be compared.
#      Anything but "y" stops the script with the database and the running
#      services untouched. (A schema change drops and rebuilds the schema first,
#      so the API/MCP are unavailable during that load; a data-only change
#      reloads in one transaction and they keep serving the old data.)
#   5. bring up db/api/mcp on the new images (recreating api/mcp after a reload
#      so PostGraphile re-introspects the schema)
#
# Usage: scripts/update.sh [--force]
#   --force   reload without checking or asking
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
  10|12)
    if [ ! -t 0 ]; then
      echo "A reload is needed. Re-run with --force to reload." >&2
      exit 1
    fi
    if [ "$rc" -eq 10 ]; then
      read -r -p "Reload the database? [y/N] " answer
    else
      read -r -p "The data can't be compared. Reload the database anyway? [y/N] " answer
    fi
    case "$answer" in
      y|Y|yes|YES)
        reload
        ;;
      *)
        echo "Stopped. Database and services unchanged."
        exit 0
        ;;
    esac
    ;;
  *)
    echo "Database check failed (exit $rc)." >&2
    exit "$rc"
    ;;
esac
