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
#      this code AND loaded from the same data (the clone's commit plus a hash of
#      the game logs fetch-data.sh downloads, which aren't in the clone)
#   4. if either differs, reload (a schema change drops and rebuilds the schema
#      first, so the API/MCP are unavailable during that load; a data-only change
#      reloads in one transaction and they keep serving the old data)
#   5. bring up db/api/mcp on the new images (recreating api/mcp after a reload
#      so PostGraphile re-introspects the schema)
#
# This script does NOT touch the service repo's git — check out / pull the code
# you want yourself first; the build reads the working tree as-is.
#
# Run from the repo directory. Honors RETROSHEET_DIR (default ./.data). On a
# REMOTE host, run it inside tmux or screen so a dropped SSH connection can't
# abort a multi-minute load:
#   tmux new -s retro './scripts/update.sh'   (reattach: tmux attach -t retro)
set -euo pipefail

: "${RETROSHEET_DIR:=./.data}"
export RETROSHEET_DIR

echo "==> Refreshing Retrosheet data ($RETROSHEET_DIR) …"
./scripts/fetch-data.sh "$RETROSHEET_DIR"

# The data's identity: "<clone commit>+gl:<hash of the downloaded game logs>".
# Empty when the data dir isn't a git clone, which the loader treats as "can't
# tell" and reloads.
sha256() { if command -v sha256sum >/dev/null 2>&1; then sha256sum; else shasum -a 256; fi; }
RETROSHEET_VERSION=""
if commit="$(git -C "$RETROSHEET_DIR" rev-parse HEAD 2>/dev/null)"; then
  # Names and contents, in a fixed order, so an added, removed, or corrected
  # season all change the hash.
  gamelogs="$(cd "$RETROSHEET_DIR" && find gamelog -maxdepth 1 -name 'gl[0-9]*.txt' 2>/dev/null | LC_ALL=C sort \
    | while read -r f; do echo "$f"; cat "$f"; done | sha256 | cut -c1-16)"
  RETROSHEET_VERSION="${commit}+gl:${gamelogs}"
fi
echo "    Retrosheet data version: ${RETROSHEET_VERSION:-(not a git clone)}"

echo "==> Rebuilding all images incl. the loader (the loader is behind the 'etl'"
echo "    profile, which a plain 'docker compose build' would skip) …"
docker compose --profile etl build --no-cache --pull

echo "==> Ensuring Postgres is up …"
docker compose up -d db

echo "==> Checking whether the database is current …"
set +e
docker compose run --rm -e RETROSHEET_VERSION="$RETROSHEET_VERSION" loader node dist/etl/run.js --check
rc=$?
set -e

case "$rc" in
  0)
    echo "==> Bringing up the services …"
    docker compose up -d db api mcp
    echo "Updated. Database unchanged."
    ;;
  10)
    echo "==> Reloading the database (several minutes) …"
    docker compose run --rm -e RETROSHEET_VERSION="$RETROSHEET_VERSION" loader
    echo "==> Recreating the services so the API re-introspects the schema …"
    docker compose up -d --force-recreate api mcp
    echo "Updated and reloaded."
    ;;
  *)
    echo "Database check failed (exit $rc)." >&2
    exit "$rc"
    ;;
esac
