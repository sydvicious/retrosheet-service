#!/usr/bin/env bash
# Copyright (c) 2026 Syd Polk
# SPDX-License-Identifier: BSD-3-Clause
#
# Fetch or update the Retrosheet source data. Clones the Chadwick-maintained
# Retrosheet repository (a new release = a git pull). The data is NOT committed
# to this repo — it is separately copyrighted by Retrosheet.
#
# Usage: scripts/fetch-data.sh [target-dir]   (default: ./.data)
set -euo pipefail

DATA_DIR="${1:-./.data}"
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

# Regular-season game logs (per-game manager of record + game summary). These are
# a separate Retrosheet download, not in the repo; fetch one per season year we
# have, into gamelog/ (alongside the postseason GL*.TXT). Incremental — existing
# years are skipped, so only new years are downloaded on later runs.
if [ -d "$DATA_DIR/seasons" ] && command -v curl >/dev/null 2>&1; then
  GLDIR="$DATA_DIR/gamelog"
  mkdir -p "$GLDIR"
  fetched=0
  for y in $(ls "$DATA_DIR/seasons" | grep -E '^[0-9]{4}$' | sort); do
    ls "$GLDIR"/gl"${y}".txt >/dev/null 2>&1 && continue
    if curl -fsSL "https://www.retrosheet.org/gamelogs/gl${y}.zip" -o "$GLDIR/gl${y}.zip" 2>/dev/null; then
      command -v unzip >/dev/null 2>&1 && unzip -oq "$GLDIR/gl${y}.zip" -d "$GLDIR"
      rm -f "$GLDIR/gl${y}.zip"
      fetched=$((fetched + 1))
    fi
  done
  if [ "$fetched" -gt 0 ]; then
    echo "Fetched $fetched new game-log year(s) into $GLDIR"
  fi
fi
