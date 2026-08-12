#!/usr/bin/env bash
# Copyright (c) 2026 Syd Polk
# SPDX-License-Identifier: BSD-3-Clause
#
# Update the Retrosheet data and hot-refresh the database WITHOUT restarting the
# stack. The loader runs as a one-shot container against the live `db`, truncating
# and reloading every table inside a single transaction — readers see old data
# until commit, then new data — so the running `api` keeps serving throughout.
#
# Use this for routine data updates (a new Retrosheet release). If the table
# DEFINITIONS in sql/schema.sql changed, use a --recreate load instead and restart
# the api (see README).
set -euo pipefail

: "${RETROSHEET_DIR:=./data}"
export RETROSHEET_DIR

# 1. Refresh the source data in place (git pull if it's a clone; see fetch-data.sh).
./scripts/fetch-data.sh "$RETROSHEET_DIR"

# 2. Hot data refresh — no db/api restart.
docker compose run --rm loader

echo "Refresh complete — the API served fresh data with no restart."
