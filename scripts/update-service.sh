#!/usr/bin/env bash
# Copyright (c) 2026 Syd Polk
# SPDX-License-Identifier: BSD-3-Clause
#
# Update this SERVICE to the latest code AND the latest Retrosheet data, in a
# single reload. Pulls new code, refreshes the Retrosheet data, rebuilds the
# image, does one full recreate load (reparses all play-by-play), and recreates
# the services so PostGraphile re-introspects the schema.
#
# For a Retrosheet-data-only refresh (no code change), use update-data.sh instead
# — it's faster and needs no restart. Skip the data refresh here by setting
# SKIP_DATA=1 (e.g. a pure code change on a slow/off-line box).
#
# Run from the repo directory. On a REMOTE host, run this inside tmux or screen so
# a dropped SSH connection can't abort the multi-minute load:
#   tmux new -s retro './scripts/update-service.sh'   (reattach: tmux attach -t retro)
# The loader prints an elapsed-time heartbeat every few seconds so you can tell
# it is alive.
set -euo pipefail

echo "==> Pulling the latest code …"
git pull --ff-only

if [ "${SKIP_DATA:-0}" = "1" ]; then
  echo "==> Skipping Retrosheet data refresh (SKIP_DATA=1)."
else
  : "${RETROSHEET_DIR:=./data}"
  export RETROSHEET_DIR
  echo "==> Refreshing Retrosheet data ($RETROSHEET_DIR) …"
  ./scripts/fetch-data.sh "$RETROSHEET_DIR"
fi

echo "==> Rebuilding the image (no cache, so new code can't be masked by a stale layer) …"
docker compose build --no-cache --pull

echo "==> Ensuring Postgres is up …"
docker compose up -d db

echo "==> Full recreate load (reparses all play-by-play; several minutes) …"
RECREATE=1 docker compose run --rm loader

echo "==> Recreating services so the API re-introspects the schema …"
docker compose up -d --force-recreate api mcp

echo "Service updated and reloaded."
