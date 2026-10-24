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
# have, into gamelog/ (alongside the postseason GL*.TXT). Every year is asked
# for on every run, conditionally: a year we already have is downloaded only if
# retrosheet.org has a newer file (If-Modified-Since against the unzipped
# file's mtime, which is set to the zip's server date), so a corrected season
# is picked up and an unchanged one costs one small request. A year the server
# doesn't have yet (404, e.g. the season just played) is skipped until it does.
if [ -d "$DATA_DIR/seasons" ]; then
  GLDIR="$DATA_DIR/gamelog"
  mkdir -p "$GLDIR"
  years="$(ls "$DATA_DIR/seasons" | grep -E '^[0-9]{4}$' | sort)"
  total="$(echo "$years" | grep -c .)"
  if [ "$total" -gt 0 ]; then
    # Fail loudly: without these the game logs (and managers of record) would
    # silently go missing from the load.
    for tool in curl unzip; do
      if ! command -v "$tool" >/dev/null 2>&1; then
        echo "$tool is required to fetch the Retrosheet game logs — install it and re-run." >&2
        exit 1
      fi
    done
    echo "Checking $total game-log year(s) against retrosheet.org ($GLDIR) …"
    fetched=0
    missing=0
    i=0
    for y in $years; do
      i=$((i + 1))
      txt="$GLDIR/gl${y}.txt"
      zip="$GLDIR/gl${y}.zip"
      url="https://www.retrosheet.org/gamelogs/gl${y}.zip"
      # -z: only download when newer than this file (no-op when it doesn't exist).
      # -R: give the zip the server's Last-Modified time, copied to the txt below.
      if [ -f "$txt" ]; then
        rc=0; curl -fsSL -R -z "$txt" "$url" -o "$zip" 2>/dev/null || rc=$?
      else
        rc=0; curl -fsSL -R "$url" -o "$zip" 2>/dev/null || rc=$?
      fi
      if [ "$rc" -ne 0 ]; then
        rm -f "$zip"
        if [ -f "$txt" ]; then
          echo "  … [$i/$total] gl${y} — not reachable, keeping the current file"
        else
          missing=$((missing + 1))
          echo "  … [$i/$total] gl${y} — not available, skipped"
        fi
        continue
      fi
      if [ ! -f "$zip" ]; then
        continue   # 304 Not Modified: curl wrote nothing
      fi
      unzip -oq "$zip" -d "$GLDIR"
      if [ ! -f "$txt" ]; then
        echo "gl${y}.zip did not contain gl${y}.txt — check $GLDIR." >&2
        exit 1
      fi
      touch -r "$zip" "$txt"
      rm -f "$zip"
      fetched=$((fetched + 1))
      echo "  … [$i/$total] gl${y}"
    done
    echo "Game logs: $fetched new or updated, $missing not yet published, $((total - fetched - missing)) unchanged."
  fi
fi
