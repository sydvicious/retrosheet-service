#!/usr/bin/env bash
# Copyright (c) 2026 Syd Polk
# SPDX-License-Identifier: BSD-3-Clause
#
# Fetch or update the Retrosheet source data. Clones the Chadwick-maintained
# Retrosheet repository (a new release = a git pull). The data is NOT committed
# to this repo — it is separately copyrighted by Retrosheet.
#
# Usage: scripts/fetch-data.sh [target-dir]   (default: ./data)
set -euo pipefail

DATA_DIR="${1:-./data}"
REPO="https://github.com/chadwickbureau/retrosheet"

if [ -d "$DATA_DIR/.git" ]; then
  echo "Updating Retrosheet data in $DATA_DIR ..."
  git -C "$DATA_DIR" pull --ff-only
else
  echo "Cloning Retrosheet data into $DATA_DIR ..."
  git clone --depth 1 "$REPO" "$DATA_DIR"
fi
echo "Retrosheet data ready in $DATA_DIR"
