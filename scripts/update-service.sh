#!/usr/bin/env bash
# Copyright (c) 2026 Syd Polk
# SPDX-License-Identifier: BSD-3-Clause
#
# Update this SERVICE to the latest code and reload. Pulls new code, rebuilds the
# image, does a full recreate load (reparses all play-by-play), and recreates the
# services so PostGraphile re-introspects the schema. Use this when the code or
# schema changed.
#
# For a Retrosheet-data-only refresh (no code change), use update-data.sh — it's
# faster and needs no restart. This uses the Retrosheet data already on disk;
# run update-data.sh first if you also want fresher data.
#
# Run from the repo directory. On a REMOTE host, run this inside tmux or screen so
# a dropped SSH connection can't abort the multi-minute load:
#   tmux new -s retro './scripts/update-service.sh'   (reattach: tmux attach -t retro)
# The loader prints an elapsed-time heartbeat every few seconds so you can tell
# it is alive.
set -euo pipefail

echo "==> Pulling the latest code …"
git pull --ff-only

echo "==> Rebuilding the image …"
docker compose build

echo "==> Ensuring Postgres is up …"
docker compose up -d db

echo "==> Full recreate load (reparses all play-by-play; several minutes) …"
RECREATE=1 docker compose run --rm loader

echo "==> Recreating services so the API re-introspects the schema …"
docker compose up -d --force-recreate api mcp

echo "Service updated and reloaded."
