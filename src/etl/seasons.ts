// Copyright (c) 2026 Syd Polk
// SPDX-License-Identifier: BSD-3-Clause
//
// Per-season loaders for the already-CSV data: rosters (*.ROS) and schedules
// (<year>schedule.csv). Rows are streamed across all seasons — or only the
// given ones, for a partial load — into a single COPY per table.
import type { PoolClient } from "pg";
import { copyRows } from "../db.js";
import { readRows, cell } from "./csv.js";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { seasonYears, rosterFiles, scheduleFile, seasonDir } from "./paths.js";
import { parseRosterRow } from "../parse/roster.js";
import { compactDateToIso, toIntOrNull } from "../parse/dates.js";

function* rosterFileRows(file: string, year: string): Generator<(string | null)[]> {
  for (const raw of readRows(file)) {
    const e = parseRosterRow(raw);
    if (!e) continue;
    yield [
      year, e.team, e.playerId, e.lastName, e.firstName,
      e.bats, e.throws, e.position,
    ];
  }
}

function* rosterRowStream(root: string, seasons?: Set<string>): Generator<(string | null)[]> {
  for (const year of seasonYears(root)) {
    if (seasons && !seasons.has(year)) continue;
    for (const file of rosterFiles(root, year)) yield* rosterFileRows(file, year);
  }
}

const ROSTER_COLS = ["year", "team", "player_id", "last_name", "first_name", "bats", "throws", "position"];

/**
 * Load the roster files of these team-years ("<year>:<TEAM>", the file being
 * seasons/<year>/<TEAM><year>.ROS). A missing file (the roster was removed
 * upstream) loads nothing; the caller has already deleted the rows.
 */
export async function loadRosterTeamYears(client: PoolClient, root: string, pairs: readonly string[]): Promise<number> {
  function* rows(): Generator<(string | null)[]> {
    for (const pair of pairs) {
      const [year, team] = pair.split(":") as [string, string];
      const file = join(seasonDir(root, year), `${team}${year}.ROS`);
      if (existsSync(file)) yield* rosterFileRows(file, year);
    }
  }
  return copyRows(client, "roster", ROSTER_COLS, rows());
}

export async function loadRosters(client: PoolClient, root: string, seasons?: Set<string>): Promise<number> {
  return copyRows(client, "roster", ROSTER_COLS, rosterRowStream(root, seasons));
}

function* scheduleRowStream(root: string, seasons?: Set<string>): Generator<(string | null)[]> {
  for (const year of seasonYears(root)) {
    if (seasons && !seasons.has(year)) continue;
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

export async function loadSchedules(client: PoolClient, root: string, seasons?: Set<string>): Promise<number> {
  return copyRows(
    client,
    "schedule",
    [
      "game_date", "game_number", "day_of_week", "visitor_team", "visitor_league",
      "visitor_game_number", "home_team", "home_league", "home_game_number",
      "day_night", "site", "postponed", "makeup",
    ],
    scheduleRowStream(root, seasons),
  );
}
