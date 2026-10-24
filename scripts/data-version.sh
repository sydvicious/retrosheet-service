#!/usr/bin/env bash
# Copyright (c) 2026 Syd Polk
# SPDX-License-Identifier: BSD-3-Clause
#
# Print the identity of a Retrosheet data directory, for RETROSHEET_VERSION:
# "<clone commit>+gl:<hash of the downloaded game logs>". The loader records it
# in schema_meta.data_version on a full load and update.sh compares it to decide
# whether a reload is needed.
#
# The game-log hash covers the names and contents of gamelog/gl<year>.txt in a
# fixed order, so an added, removed, or corrected season all change it. Those
# files come from retrosheet.org (scripts/fetch-data.sh), not from the clone.
#
# Prints nothing when the directory is not a git clone; the loader then records
# no version and the next update.sh reloads.
#
# Usage: scripts/data-version.sh [data-dir] [commit]
#   data-dir  default: $RETROSHEET_DIR or ./.data
#   commit    use this clone commit instead of the directory's HEAD — for a tree
#             extracted with `git archive`, which has no .git (verify-incremental.sh)
set -euo pipefail

DATA_DIR="${1:-${RETROSHEET_DIR:-./.data}}"
COMMIT="${2:-}"

sha256() { if command -v sha256sum >/dev/null 2>&1; then sha256sum; else shasum -a 256; fi; }

if [ -n "$COMMIT" ]; then
  commit="$COMMIT"
elif ! commit="$(git -C "$DATA_DIR" rev-parse HEAD 2>/dev/null)"; then
  exit 0
fi
gamelogs="$(cd "$DATA_DIR" && find gamelog -maxdepth 1 -name 'gl[0-9]*.txt' 2>/dev/null | LC_ALL=C sort \
  | while read -r f; do echo "$f"; cat "$f"; done | sha256 | cut -c1-16)"
echo "${commit}+gl:${gamelogs}"
