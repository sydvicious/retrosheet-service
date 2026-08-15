// Copyright (c) 2026 Syd Polk
// SPDX-License-Identifier: BSD-3-Clause
//
// Loader for Retrosheet game-log files (the 161-field, comma-separated format).
// One row per game with the manager of record and other game-level summary the
// event files don't carry. Reads every *.txt / *.TXT in RETROSHEET_DIR/gamelog/
// (regular-season logs fetched by scripts/fetch-data.sh, plus the postseason
// GL*.TXT that ship with the data). Deduped by game_id.
//
// Field positions (0-indexed) used, per the Retrosheet game-log spec:
//   0 date(YYYYMMDD)  1 game#  3 vis team  6 home team  9/10 vis/home score
//   16 park  17 attendance  18 time(min)
//   89/90 vis mgr id/name   91/92 home mgr id/name
//   93 WP id  95 LP id  97 SAVE id   101 vis starter id  103 home starter id
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { PoolClient } from "pg";
import { copyRows } from "../db.js";
import { compactDateToIso, toIntOrNull } from "../parse/dates.js";

const GL_COLS = [
  "game_id", "game_date", "game_number", "visitor_team", "home_team",
  "visitor_score", "home_score", "park_id", "attendance", "time_of_game_min",
  "visitor_manager_id", "visitor_manager_name", "home_manager_id", "home_manager_name",
  "winning_pitcher_id", "losing_pitcher_id", "save_pitcher_id",
  "visitor_starter_id", "home_starter_id",
];

// The fields we read contain no internal commas, so a plain split is safe.
function fields(line: string): string[] {
  return line.split(",").map((s) => s.replace(/^"(.*)"$/, "$1"));
}
function idOrNull(v: string | undefined): string | null {
  const t = (v ?? "").trim();
  return t === "" || t === "(none)" ? null : t;
}
function textOrNull(v: string | undefined): string | null {
  const t = (v ?? "").trim();
  return t === "" ? null : t;
}

export async function loadGameLogs(client: PoolClient, root: string): Promise<number> {
  const dir = join(root, "gamelog");
  if (!existsSync(dir)) return 0;
  const files = readdirSync(dir)
    .filter((n) => /\.txt$/i.test(n))
    .map((n) => join(dir, n))
    .sort();

  const seen = new Set<string>();
  const rows: (string | null)[][] = [];
  for (const file of files) {
    for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
      if (line.trim() === "") continue;
      const f = fields(line);
      if (f.length < 93) continue; // needs at least through the manager fields
      const date = (f[0] ?? "").trim();
      const home = (f[6] ?? "").trim();
      const num = (f[1] ?? "0").trim();
      if (date === "" || home === "") continue;
      const gameId = `${home}${date}${num}`;
      if (seen.has(gameId)) continue;
      seen.add(gameId);
      rows.push([
        gameId, compactDateToIso(date), toIntOrNull(num), textOrNull(f[3]), home,
        toIntOrNull(f[9]), toIntOrNull(f[10]), idOrNull(f[16]), toIntOrNull(f[17]), toIntOrNull(f[18]),
        idOrNull(f[89]), textOrNull(f[90]), idOrNull(f[91]), textOrNull(f[92]),
        idOrNull(f[93]), idOrNull(f[95]), idOrNull(f[97]), idOrNull(f[101]), idOrNull(f[103]),
      ]);
    }
  }
  if (rows.length === 0) return 0;
  return copyRows(client, "game_log", GL_COLS, rows);
}
