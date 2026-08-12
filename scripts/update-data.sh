#!/usr/bin/env bash
# Copyright (c) 2026 Syd Polk
# SPDX-License-Identifier: BSD-3-Clause
#
# Update the Retrosheet DATA and hot-reload the database WITHOUT restarting the
# stack. Pulls the latest Retrosheet data, then the loader truncates + reloads
# every table in a single transaction — readers see old data until commit, then
# new data — so db/api/mcp keep serving throughout.
#
# For a CODE update (new version of this service), use update-service.sh instead.
# Run from the repo directory. Honors RETROSHEET_DIR (default ./data).
set -euo pipefail

: "${RETROSHEET_DIR:=./data}"
export RETROSHEET_DIR

echo "==> Updating Retrosheet source data ($RETROSHEET_DIR) …"
./scripts/fetch-data.sh "$RETROSHEET_DIR"

echo "==> Hot-reloading the database (no restart) …"
docker compose run --rm loader

echo "Data refreshed — the services served fresh data with no restart."
