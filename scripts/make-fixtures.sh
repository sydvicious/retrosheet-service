#!/usr/bin/env bash
# Copyright (c) 2026 Syd Polk
# SPDX-License-Identifier: BSD-3-Clause
#
# DEV-ONLY. Generate golden play fixtures by running the Chadwick `cwevent`
# BINARY as a BLACK-BOX ORACLE (its output only — its source is never read; it
# is GPL). Output goes to test/fixtures/plays/ which is GITIGNORED, because the
# rows contain Retrosheet event strings (Retrosheet data is not committed).
#
# The validation harness (npm run validate:plays) diffs our clean-room parser
# against these goldens to measure parity as the parser is refined.
#
# Usage: RETROSHEET_DIR=/path/to/retrosheet scripts/make-fixtures.sh
set -euo pipefail

: "${RETROSHEET_DIR:?set RETROSHEET_DIR to a Retrosheet clone}"
command -v cwevent >/dev/null 2>&1 || {
  echo "cwevent (Chadwick) not found. This script is dev-machine only." >&2
  exit 1
}

OUT="test/fixtures/plays"
mkdir -p "$OUT"
KEEP="GAME_ID,EVENT_TX,EVENT_CD,H_CD,AB_FL,SH_FL,SF_FL,DP_FL,TP_FL,EVENT_OUTS_CT,RBI_CT,WP_FL,PB_FL"

# Curated sample spanning eras and rules (DH/no-DH, dead-ball to modern).
SAMPLES=("2024 SFN" "1998 SLN" "1975 CIN" "1927 NYA")

for s in "${SAMPLES[@]}"; do
  year="${s% *}"
  team="${s#* }"
  evfile="$(ls "$RETROSHEET_DIR/seasons/$year/${year}${team}".EV[NA] 2>/dev/null | head -1 || true)"
  if [ -z "$evfile" ]; then
    echo "skip $year $team (no event file found)" >&2
    continue
  fi
  ( cd "$(dirname "$evfile")" && cwevent -n -f 0-96 -x 0-62 -y "$year" "$(basename "$evfile")" ) 2>/dev/null \
    | python3 scripts/_reduce_csv.py "$KEEP" > "$OUT/${year}-${team}.csv"
  rows="$(($(wc -l < "$OUT/${year}-${team}.csv") - 1))"
  echo "wrote $OUT/${year}-${team}.csv ($rows plays)"
done
