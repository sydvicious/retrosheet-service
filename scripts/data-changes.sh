#!/usr/bin/env bash
# Copyright (c) 2026 Syd Polk
# SPDX-License-Identifier: BSD-3-Clause
#
# What changed between the Retrosheet data the database was loaded from and the
# data on disk now. Prints key=value lines for update.sh, or `full` when the
# answer is "reload everything":
#
#   seasons=1987,2019
#   reference=0
#   gamelog=1
#   describe=seasons 1987, 2019; game logs
#
# Usage: scripts/data-changes.sh <old data version> <new data version>
#   (versions as scripts/data-version.sh prints them; the old one comes from
#    the database via `node dist/etl/run.js --data-version`)
#
# The git work happens here on the host: the old clone commit is fetched into
# the shallow clone by hash (GitHub serves any reachable commit) and the two
# trees are diffed. The classification happens in the loader container, which
# has Node (src/etl/dataChanges.ts, tested). A fetch that fails means the old
# tree is unavailable, so the result is `full`.
#
# Honors RETROSHEET_DIR (default ./.data). Run from the repo directory.
set -euo pipefail

: "${RETROSHEET_DIR:=./.data}"
export RETROSHEET_DIR

OLD="${1:-}"
NEW="${2:-}"

classify() {
  # stdin: changed paths, one per line.
  docker compose run --rm -T loader node dist/etl/dataChangesCli.js "$OLD" "$NEW"
}

old_commit="${OLD%%+gl:*}"
new_commit="${NEW%%+gl:*}"

if [ -z "$OLD" ] || [ -z "$NEW" ] || [ "$old_commit" = "$OLD" ] || [ "$new_commit" = "$NEW" ]; then
  # Unknown or malformed on either side; the classifier reports full.
  classify </dev/null
  exit 0
fi

if [ "$old_commit" = "$new_commit" ]; then
  classify </dev/null
  exit 0
fi

if ! git -C "$RETROSHEET_DIR" cat-file -e "${old_commit}^{commit}" 2>/dev/null; then
  echo "==> Fetching the loaded commit ${old_commit:0:12} into the data clone …" >&2
  if ! git -C "$RETROSHEET_DIR" fetch --quiet --depth 1 origin "$old_commit"; then
    echo "Could not fetch ${old_commit:0:12}; the change set is unknown." >&2
    echo "full"
    echo "describe=everything (full reload)"
    exit 0
  fi
fi

git -C "$RETROSHEET_DIR" diff --name-only "$old_commit" "$new_commit" | classify
