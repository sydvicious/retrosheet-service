// Copyright (c) 2026 Syd Polk
// SPDX-License-Identifier: BSD-3-Clause
//
// Per-season loaders for the already-CSV data: rosters (*.ROS) and schedules
// (<year>schedule.csv). Rows are streamed across all seasons into a single COPY
// per table.
import type { PoolClient } from "pg";
import { copyRows } from "../db.js";
import { readRows, cell } from "./csv.js";
import { seasonYears, rosterFiles, scheduleFile } from "./paths.js";
import { parseRosterRow } from "../parse/roster.js";
import { compactDateToIso, toIntOrNull } from "../parse/dates.js";

function* rosterRowStream(root: string): Generator<(string | null)[]> {
  for (const year of seasonYears(root)) {
    for (const file of rosterFiles(root, year)) {
      for (const raw of readRows(file)) {
        const e = parseRosterRow(raw);
        if (!e) continue;
        yield [
          year, e.team, e.playerId, e.lastName, e.firstName,
          e.bats, e.throws, e.position,
        ];
      }
    }
  }
}

export async function loadRosters(client: PoolClient, root: string): Promise<number> {
  return copyRows(
    client,
    "roster",
    ["year", "team", "player_id", "last_name", "first_name", "bats", "throws", "position"],
    rosterRowStream(root),
  );
}

function* scheduleRowStream(root: string): Generator<(string | null)[]> {
  for (const year of seasonYears(root)) {
    const file = scheduleFile(root, year);
    if (!file) continue;
    for (const raw of readRows(file)) {
      const gameDate = compactDateToIso(cell(raw, 0));
      if (!gameDate) continue; // skips header row and any malformed line
      yield [
        gameDate,
        toIntOrNull(cell(raw, 1)), // game_number
        cell(raw, 2), // day_of_week
        cell(raw, 3), // visitor_team
        cell(raw, 4), // visitor_league
        toIntOrNull(cell(raw, 5)), // visitor_game_number
        cell(raw, 6), // home_team
        cell(raw, 7), // home_league
        toIntOrNull(cell(raw, 8)), // home_game_number
        cell(raw, 9), // day_night
        cell(raw, 10), // site
        cell(raw, 11), // postponed
        cell(raw, 12), // makeup
      ];
    }
  }
}

export async function loadSchedules(client: PoolClient, root: string): Promise<number> {
  return copyRows(
    client,
    "schedule",
    [
      "game_date", "game_number", "day_of_week", "visitor_team", "visitor_league",
      "visitor_game_number", "home_team", "home_league", "home_game_number",
      "day_night", "site", "postponed", "makeup",
    ],
    scheduleRowStream(root),
  );
}
