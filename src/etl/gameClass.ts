// Copyright (c) 2026 Syd Polk
// SPDX-License-Identifier: BSD-3-Clause
//
// Two derived classifications of a game, filled by the loader into
// game.season_phase and game.league_group so queries can cut the mart along two
// independent axes: regular season / postseason / All-Star / exhibition, and
// Negro Leagues / non-Negro major leagues / other.
//
// Why derived: Retrosheet's `gametype` record is absent from 192,586 games
// (every AL/NL regular-season game before 2023), and the Negro Leagues files
// type 1,379 of their games `regular`, so neither `game_type` nor the teams'
// league alone separates these. The event file a game came from (game.source_file)
// is the reliable signal, with `gametype` and the home team's league filling in.
//
// Pure functions, tested in test/etl/gameClass.test.ts.
import { readRows, cell } from "./csv.js";
import { referenceFile } from "./paths.js";

export type SeasonPhase = "regular" | "postseason" | "allstar" | "exhibition";
export type LeagueGroup = "negro" | "nonnegro" | "other";

// Retrosheet gametype → phase. `playoff` is a pennant tiebreaker (1946, 1948,
// 1951, 1959, 1962, 1978, …), which the official record counts as regular season.
const GAMETYPE_PHASE: Record<string, SeasonPhase> = {
  regular: "regular",
  playoff: "regular",
  worldseries: "postseason",
  lcs: "postseason",
  divisionseries: "postseason",
  wildcard: "postseason",
  championship: "postseason",
  allstar: "allstar",
  exhibition: "exhibition",
};

// File names without the leading year: the AL/NL postseason and All-Star files.
const POSTSEASON_FILE = /^\d{4}(WS|ALCS|NLCS|ALD\d|NLD\d|ALW\w|NLW\w)\.EVE$/i;
const ALLSTAR_FILE = /^\d{4}AS\.EVE$/i;
// A team's home-game file: <year><TEAM>.EVN / .EVA — regular season by construction.
const TEAM_FILE = /^\d{4}[A-Z0-9]{2,3}\.EV[NA]$/i;

/**
 * The phase of a game from its `gametype` record, or from the file it is in
 * when the record is absent or unknown. Null when neither says: an untyped game
 * in a mixed file such as 1939.EVR, where a guess would be wrong often enough
 * to matter.
 */
export function seasonPhase(gametype: string | undefined, sourceFile: string): SeasonPhase | null {
  const typed = GAMETYPE_PHASE[(gametype ?? "").trim().toLowerCase()];
  if (typed) return typed;
  if (POSTSEASON_FILE.test(sourceFile)) return "postseason";
  if (ALLSTAR_FILE.test(sourceFile)) return "allstar";
  if (TEAM_FILE.test(sourceFile)) return "regular";
  return null;
}

/** League codes in reference/teams.csv that are Negro leagues. */
export const NEGRO_LEAGUE_CODES = new Set(["NN1", "NN2", "NNL", "NAL", "ECL", "ANL", "NSL", "EW"]);
/** League codes that are not classed as major leagues. */
const OTHER_LEAGUE_CODES = new Set(["NA"]);

/**
 * negro for every game in a Negro Leagues file (.EVR) and for a game hosted by
 * a Negro league team anywhere; other when the home team's league is the
 * National Association; nonnegro otherwise, which covers the AL, NL, AA, UA,
 * PL and FL files and the all-star squads that have no league row. `homeLeague`
 * is the teams.csv LEAGUE value for the home team, possibly several codes
 * separated by ';' for a franchise that changed leagues.
 */
export function leagueGroup(sourceFile: string, homeLeague: string | null | undefined): LeagueGroup {
  if (/\.EVR$/i.test(sourceFile)) return "negro";
  const codes = (homeLeague ?? "").split(";").map((c) => c.trim().toUpperCase()).filter(Boolean);
  if (codes.some((c) => NEGRO_LEAGUE_CODES.has(c))) return "negro";
  if (codes.length && codes.every((c) => OTHER_LEAGUE_CODES.has(c))) return "other";
  return "nonnegro";
}

/** team id → LEAGUE from reference/teams.csv (header skipped), for leagueGroup(). */
export function readTeamLeagues(root: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const raw of readRows(referenceFile(root, "teams.csv")).slice(1)) {
    const team = cell(raw, 0);
    if (team) map.set(team, cell(raw, 1) ?? "");
  }
  return map;
}
