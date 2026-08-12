// Copyright (c) 2026 Syd Polk
// SPDX-License-Identifier: BSD-3-Clause
//
// Phase 2 loader: parse each season's event (.EV*) files and load their
// *structure* — one row per game plus lineup, substitution, comment, earned-run,
// adjustment, and verbatim game_info rows. No play-by-play interpretation yet.
//
// Processing is per-file: parse one file, COPY its rows (game first, then the
// FK-dependent children), then move on — so memory stays bounded regardless of
// how much history is loaded.
import { readFileSync } from "node:fs";
import type { PoolClient } from "pg";
import { copyRows } from "../db.js";
import { seasonYears, eventFiles } from "./paths.js";
import { parseEventFile, type ParsedGame } from "../parse/eventFile.js";
import { slashDateToIso, toIntOrNull } from "../parse/dates.js";

export interface EventCounts {
  game: number;
  game_info: number;
  lineup_start: number;
  substitution: number;
  comment: number;
  earned_runs: number;
  game_adjustment: number;
}

// info keys promoted to typed columns on `game`. Every info key is ALSO stored
// verbatim in game_info, so promotion is lossless even for unexpected formats.
const GAME_COLS = [
  "game_id", "game_date", "game_number", "game_type", "visitor_team", "home_team",
  "site", "start_time", "day_night", "innings", "tiebreaker", "use_dh",
  "home_team_bats_first", "pitches", "ump_home", "ump_1b", "ump_2b", "ump_3b",
  "ump_lf", "ump_rf", "field_cond", "precip", "sky", "temp", "wind_dir",
  "wind_speed", "time_of_game", "attendance", "winning_pitcher", "losing_pitcher",
  "save_pitcher", "gwrbi", "how_scored", "official_scorer", "scorer", "translator",
  "inputter", "input_time", "edit_time", "input_prog_vers",
];

/** Retrosheet uses "(none)" and "" for absent id-valued fields. */
function idOrNull(v: string | undefined): string | null {
  if (v === undefined) return null;
  const t = v.trim();
  return t === "" || t === "(none)" ? null : t;
}

function boolOrNull(v: string | undefined): string | null {
  if (v === undefined) return null;
  const t = v.trim().toLowerCase();
  if (t === "true" || t === "t" || t === "1") return "t";
  if (t === "false" || t === "f" || t === "0") return "f";
  return null;
}

function num(n: number | null): string | null {
  return n === null ? null : String(n);
}

function gameRow(g: ParsedGame): (string | null)[] {
  const info = new Map<string, string>();
  for (const [k, v] of g.info) info.set(k, v); // last value wins
  const get = (k: string): string | undefined => info.get(k);
  return [
    g.gameId,
    slashDateToIso(get("date")),
    toIntOrNull(get("number")) === null ? null : String(toIntOrNull(get("number"))),
    get("gametype") ?? null,
    get("visteam") ?? null,
    get("hometeam") ?? null,
    idOrNull(get("site")),
    get("starttime") ?? null,
    get("daynight") ?? null,
    toIntOrNull(get("innings")),
    get("tiebreaker") ?? null,
    boolOrNull(get("usedh")),
    boolOrNull(get("htbf")),
    get("pitches") ?? null,
    idOrNull(get("umphome")),
    idOrNull(get("ump1b")),
    idOrNull(get("ump2b")),
    idOrNull(get("ump3b")),
    idOrNull(get("umplf")),
    idOrNull(get("umprf")),
    get("fieldcond") ?? null,
    get("precip") ?? null,
    get("sky") ?? null,
    toIntOrNull(get("temp")),
    get("winddir") ?? null,
    toIntOrNull(get("windspeed")),
    toIntOrNull(get("timeofgame")),
    toIntOrNull(get("attendance")),
    idOrNull(get("wp")),
    idOrNull(get("lp")),
    idOrNull(get("save")),
    idOrNull(get("gwrbi")),
    get("howscored") ?? null,
    idOrNull(get("oscorer")),
    idOrNull(get("scorer")),
    idOrNull(get("translator")),
    idOrNull(get("inputter")),
    get("inputtime") ?? null,
    get("edittime") ?? null,
    get("inputprogvers") ?? null,
  ];
}

export async function loadEvents(
  client: PoolClient,
  root: string,
  seasons?: Set<string>,
): Promise<EventCounts> {
  const counts: EventCounts = {
    game: 0, game_info: 0, lineup_start: 0, substitution: 0,
    comment: 0, earned_runs: 0, game_adjustment: 0,
  };

  const years = seasonYears(root).filter((y) => !seasons || seasons.has(y));

  for (const year of years) {
    for (const file of eventFiles(root, year)) {
      const games = parseEventFile(readFileSync(file, "utf8"));

      const gameRows: (string | null)[][] = [];
      const infoRows: (string | null)[][] = [];
      const startRows: (string | null)[][] = [];
      const subRows: (string | null)[][] = [];
      const comRows: (string | null)[][] = [];
      const erRows: (string | null)[][] = [];
      const adjRows: (string | null)[][] = [];

      for (const g of games) {
        if (g.gameId === "") continue;
        gameRows.push(gameRow(g));
        for (const [k, v] of g.info) infoRows.push([g.gameId, k, v]);
        for (const s of g.starts) {
          startRows.push([g.gameId, s.playerId, s.playerName, num(s.side), num(s.battingOrder), num(s.fieldingPosition)]);
        }
        for (const s of g.subs) {
          subRows.push([g.gameId, String(s.seq), s.playerId, s.playerName, num(s.side), num(s.battingOrder), num(s.fieldingPosition)]);
        }
        for (const c of g.comments) comRows.push([g.gameId, String(c.seq), c.text]);
        for (const d of g.data) {
          if (d.kind === "er") erRows.push([g.gameId, d.playerId, toIntOrNull(d.value)]);
        }
        for (const a of g.adjustments) {
          adjRows.push([g.gameId, String(a.seq), a.type, a.field1, a.field2]);
        }
      }

      // game first (children FK game_id), then children.
      counts.game += await copyRows(client, "game", GAME_COLS, gameRows);
      if (infoRows.length) counts.game_info += await copyRows(client, "game_info", ["game_id", "key", "value"], infoRows);
      if (startRows.length) counts.lineup_start += await copyRows(client, "lineup_start", ["game_id", "player_id", "player_name", "side", "batting_order", "fielding_position"], startRows);
      if (subRows.length) counts.substitution += await copyRows(client, "substitution", ["game_id", "seq", "player_id", "player_name", "side", "batting_order", "fielding_position"], subRows);
      if (comRows.length) counts.comment += await copyRows(client, "comment", ["game_id", "seq", "text"], comRows);
      if (erRows.length) counts.earned_runs += await copyRows(client, "earned_runs", ["game_id", "player_id", "earned_runs"], erRows);
      if (adjRows.length) counts.game_adjustment += await copyRows(client, "game_adjustment", ["game_id", "seq", "adj_type", "field1", "field2"], adjRows);
    }
  }

  return counts;
}
