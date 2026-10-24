#!/usr/bin/env bash
# Copyright (c) 2026 Syd Polk
# SPDX-License-Identifier: BSD-3-Clause
#
# What changed between the Retrosheet data the database was loaded from and the
# data on disk now. Prints key=value lines for update.sh, or `full` when the
# answer is "reload everything":
#
#   seasons=1987                         whole seasons to reload
#   files=seasons/1909/1909DET.EVA       event files to replace (added or modified)
#   oldfiles=seasons/1909/1909DET.EVA    event files whose old games must go (modified or removed)
#   games=DET190904140,DET190904150      those old games' ids, read from git here
#   rosters=2019:BAL                     roster team-years to replace
#   schedules=2019                       season schedules to replace
#   reference=0
#   gamelog=1
#   describe=1 event file (season 1909); game logs
#
# The file-level keys appear only when non-empty. update.sh passes every line
# but `describe` and `oldfiles` straight to the loader's --replace.
#
# Usage: scripts/data-changes.sh <old data version> <new data version>
#   (versions as scripts/data-version.sh prints them; the old one comes from
#    the database via `node dist/etl/run.js --data-version`)
#
# The git work happens here on the host: the old clone commit is fetched into
# the shallow clone by hash (GitHub serves any reachable commit), the two trees
# are diffed (name-status, renames shown as delete + add so each side is a plain
# file), and each modified or removed event file's old `id,` records are read
# with `git show` to list the games to delete. The classification happens in the
# loader container, which has Node (src/etl/dataChanges.ts, tested). A fetch
# that fails means the old tree is unavailable, so the result is `full`.
#
# Honors RETROSHEET_DIR (default ./.data). Run from the repo directory.
set -euo pipefail

: "${RETROSHEET_DIR:=./.data}"
export RETROSHEET_DIR

OLD="${1:-}"
NEW="${2:-}"

classify() {
  # stdin: `git diff --name-status` lines.
  docker compose run --rm -T loader node dist/etl/dataChangesCli.js "$OLD" "$NEW"
}

# Append games=<ids> for the oldfiles= line in the classifier's output: the
# `id,` records of each file's old version. A file whose old version can't be
# read makes the whole result `full` rather than leave its games behind.
with_old_games() {
  local out oldfiles ids=""
  out="$(cat)"
  oldfiles="$(printf '%s\n' "$out" | sed -n 's/^oldfiles=//p')"
  if [ -n "$oldfiles" ]; then
    local f
    for f in $(printf '%s' "$oldfiles" | tr ',' ' '); do
      local these
      if ! these="$(git -C "$RETROSHEET_DIR" show "${old_commit}:${f}" 2>/dev/null | grep '^id,' | cut -d, -f2 | tr -d '\r' | paste -sd, -)"; then
        echo "Could not read ${f} at ${old_commit:0:12}; the change set is unknown." >&2
        echo "full"
        echo "describe=everything (full reload)"
        return 0
      fi
      ids="${ids:+$ids,}$these"
    done
  fi
  printf '%s\n' "$out" | sed '/^describe=/d'
  [ -n "$ids" ] && echo "games=$ids"
  printf '%s\n' "$out" | sed -n '/^describe=/p'
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

git -C "$RETROSHEET_DIR" diff --name-status --no-renames "$old_commit" "$new_commit" | classify | with_old_games
