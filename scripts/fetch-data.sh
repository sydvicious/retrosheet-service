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
  # Already a clone — update in place (a new Retrosheet release = a fast-forward).
  echo "Updating Retrosheet data in $DATA_DIR ..."
  git -C "$DATA_DIR" pull --ff-only
elif [ -e "$DATA_DIR" ] && [ -n "$(ls -A "$DATA_DIR" 2>/dev/null)" ]; then
  # Exists and non-empty but not a git repo (e.g. an rsync'd copy or a tarball).
  # Don't try to clone over it — just use it as-is.
  echo "$DATA_DIR exists and is non-empty but is not a git clone; using it as-is."
  echo "(To enable in-place updates, remove it and re-run to clone, or point"
  echo " RETROSHEET_DIR at a git clone of $REPO.)"
else
  echo "Cloning Retrosheet data into $DATA_DIR ..."
  git clone --depth 1 "$REPO" "$DATA_DIR"
fi
echo "Retrosheet data ready in $DATA_DIR"
