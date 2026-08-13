#!/usr/bin/env bash
# Copyright (c) 2026 Syd Polk
# SPDX-License-Identifier: BSD-3-Clause
#
# Convenience: bring up Postgres and populate it via the loader container.
# Honors RETROSHEET_DIR (defaults to ./.data, which fetch-data.sh populates).
set -euo pipefail

: "${RETROSHEET_DIR:=./.data}"
export RETROSHEET_DIR

if [ ! -d "$RETROSHEET_DIR" ]; then
  echo "RETROSHEET_DIR ($RETROSHEET_DIR) not found; fetching into ./.data ..."
  ./scripts/fetch-data.sh ./.data
  export RETROSHEET_DIR=./.data
fi

docker compose up -d db
docker compose run --rm loader
echo "Loaded. Start the API with:  docker compose up -d api"
