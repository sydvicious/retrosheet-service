// Copyright (c) 2026 Syd Polk
// SPDX-License-Identifier: BSD-3-Clause
//
// Loaders for the already-CSV Retrosheet reference tables. Each reads a
// reference/<file>.csv, maps columns (parsing dates/ints), and bulk-loads via
// COPY. Header row is dropped with slice(1).
import type { PoolClient } from "pg";
import { copyRows } from "../db.js";
import { readRows, cell } from "./csv.js";
import { referenceFile } from "./paths.js";
import { usDateToIso, toIntOrNull } from "../parse/dates.js";

export async function loadPeople(client: PoolClient, root: string): Promise<number> {
  const rows = readRows(referenceFile(root, "biofile.csv")).slice(1);
  const mapped = rows.map((r) => [
    cell(r, 0), // player_id
    cell(r, 1), // last_name
    cell(r, 2), // first_name
    cell(r, 3), // nickname
    usDateToIso(cell(r, 4)), // birth_date
    cell(r, 5), cell(r, 6), cell(r, 7), // birth city/state/country
    usDateToIso(cell(r, 8)), // play_debut
    usDateToIso(cell(r, 9)), // play_last_game
    usDateToIso(cell(r, 10)), // mgr_debut
    usDateToIso(cell(r, 11)), // mgr_last_game
    usDateToIso(cell(r, 12)), // coach_debut
    usDateToIso(cell(r, 13)), // coach_last_game
    usDateToIso(cell(r, 14)), // ump_debut
    usDateToIso(cell(r, 15)), // ump_last_game
    usDateToIso(cell(r, 16)), // death_date
    cell(r, 17), cell(r, 18), cell(r, 19), // death city/state/country
    cell(r, 20), // bats
    cell(r, 21), // throws
    cell(r, 22), // height (e.g. "6-05" — text)
    toIntOrNull(cell(r, 23)), // weight
    cell(r, 24), cell(r, 25), cell(r, 26), cell(r, 27), cell(r, 28), // cemetery + note
    cell(r, 29), // birth_name
    cell(r, 30), // name_chg
    cell(r, 31), // bat_chg
    cell(r, 32), // hof
  ]);
  return copyRows(
    client,
    "people",
    [
      "player_id", "last_name", "first_name", "nickname", "birth_date",
      "birth_city", "birth_state", "birth_country", "play_debut", "play_last_game",
      "mgr_debut", "mgr_last_game", "coach_debut", "coach_last_game", "ump_debut",
      "ump_last_game", "death_date", "death_city", "death_state", "death_country",
      "bats", "throws", "height", "weight", "cemetery", "ceme_city", "ceme_state",
      "ceme_country", "ceme_note", "birth_name", "name_chg", "bat_chg", "hof",
    ],
    mapped,
  );
}

export async function loadTeams(client: PoolClient, root: string): Promise<number> {
  const rows = readRows(referenceFile(root, "teams.csv")).slice(1);
  const mapped = rows.map((r) => [
    cell(r, 0), cell(r, 1), cell(r, 2), cell(r, 3),
    toIntOrNull(cell(r, 4)), toIntOrNull(cell(r, 5)),
  ]);
  return copyRows(
    client,
    "teams",
    ["team_id", "league", "city", "nickname", "first_year", "last_year"],
    mapped,
  );
}

export async function loadBallparks(client: PoolClient, root: string): Promise<number> {
  const rows = readRows(referenceFile(root, "ballparks.csv")).slice(1);
  const mapped = rows.map((r) => [
    cell(r, 0), cell(r, 1), cell(r, 2), cell(r, 3), cell(r, 4),
    usDateToIso(cell(r, 5)), usDateToIso(cell(r, 6)),
    cell(r, 7), cell(r, 8),
  ]);
  return copyRows(
    client,
    "ballparks",
    ["park_id", "name", "aka", "city", "state", "start_date", "end_date", "league", "notes"],
    mapped,
  );
}

export async function loadCoaches(client: PoolClient, root: string): Promise<number> {
  const rows = readRows(referenceFile(root, "coaches.csv")).slice(1);
  const mapped = rows.map((r) => [
    cell(r, 0), toIntOrNull(cell(r, 1)), cell(r, 2), cell(r, 3),
    usDateToIso(cell(r, 4)), usDateToIso(cell(r, 5)),
  ]);
  return copyRows(
    client,
    "coaches",
    ["player_id", "year", "team", "role", "start_date", "end_date"],
    mapped,
  );
}

export async function loadEjections(client: PoolClient, root: string): Promise<number> {
  const rows = readRows(referenceFile(root, "ejections.csv")).slice(1);
  const mapped = rows.map((r) => [
    cell(r, 0), usDateToIso(cell(r, 1)), cell(r, 2), cell(r, 3), cell(r, 4),
    cell(r, 5), cell(r, 6), cell(r, 7), cell(r, 8), toIntOrNull(cell(r, 9)), cell(r, 10),
  ]);
  return copyRows(
    client,
    "ejections",
    [
      "game_id", "ejection_date", "dh", "ejectee_id", "ejectee_name",
      "team", "job", "umpire_id", "umpire_name", "inning", "reason",
    ],
    mapped,
  );
}

export async function loadRelatives(client: PoolClient, root: string): Promise<number> {
  const rows = readRows(referenceFile(root, "relatives.csv")).slice(1);
  const mapped = rows.map((r) => [cell(r, 0), cell(r, 1), cell(r, 2)]);
  return copyRows(
    client,
    "relatives",
    ["player_id_1", "relation", "player_id_2"],
    mapped,
  );
}
