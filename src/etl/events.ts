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
import { createHash, type Hash } from "node:crypto";
import { basename } from "node:path";
import type { PoolClient } from "pg";
import { copyRows } from "../db.js";
import { seasonYears, eventFiles } from "./paths.js";
import { parseEventFile, parseCsvLine, type ParsedGame } from "../parse/eventFile.js";
import { replayGame } from "../parse/gameState.js";
import { slashDateToIso, toIntOrNull } from "../parse/dates.js";
import { seasonPhase, leagueGroup } from "./gameClass.js";
import { GAP_COLS, repeatedGameRows } from "./gaps.js";

export interface EventCounts {
  game: number;
  game_info: number;
  lineup_start: number;
  substitution: number;
  comment: number;
  earned_runs: number;
  game_adjustment: number;
  play: number;
  fielding_daily: number;
}

const FIELDING_COLS = [
  "game_id", "player_id", "team", "game_date", "position", "side",
  "games", "games_started", "outs", "po", "a", "e", "dp", "tp", "pb", "xi",
];

const PLAY_COLS = [
  "game_id", "play_seq", "inning", "half", "batter_id", "pitcher_id",
  "outs_before", "balls", "strikes", "pitch_seq", "event", "event_code",
  "event_name", "hit_value", "at_bat", "sac_fly", "sac_hit", "double_play",
  "triple_play", "wild_pitch", "passed_ball", "outs_on_play", "rbi",
  "runs_on_play", "away_score_before", "home_score_before", "base1_before",
  "base2_before", "base3_before", "batter_dest", "run1_dest", "run2_dest",
  "run3_dest",
];

function b(v: boolean): string {
  return v ? "true" : "false";
}

// info keys promoted to typed columns on `game`, plus three derived columns:
// source_file, the event file the game came from (e.g. "1935.EVR"); and
// season_phase / league_group from gameClass.ts, so queries can cut the mart by
// regular season vs postseason and Negro Leagues vs non-Negro majors without
// knowing Retrosheet's file conventions. Every info key is ALSO stored verbatim
// in game_info, so promotion is lossless even for unexpected formats.
export const GAME_COLS = [
  "game_id", "source_file", "season_phase", "league_group",
  "game_date", "game_number", "game_type", "visitor_team", "home_team",
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

/**
 * The `game` row for a parsed game. `sourceFile` is the event file's basename;
 * `teamLeagues` maps team id → LEAGUE from reference/teams.csv (readTeamLeagues).
 */
export function gameRow(g: ParsedGame, sourceFile: string, teamLeagues: ReadonlyMap<string, string>): (string | null)[] {
  const info = new Map<string, string>();
  for (const [k, v] of g.info) info.set(k, v); // last value wins
  const get = (k: string): string | undefined => info.get(k);
  const home = get("hometeam")?.trim();
  return [
    g.gameId,
    sourceFile,
    seasonPhase(get("gametype"), sourceFile),
    leagueGroup(sourceFile, home ? teamLeagues.get(home) : undefined),
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

export interface LoadProgress {
  plays: number;
  label: string;
  // When set, the heartbeat prints this instead of the (frozen) play count —
  // used by phases that aren't loading plays (e.g. the daily aggregation).
  detail?: string;
  // Seasons with event files: finished so far / to load. Set while loading events.
  seasonsDone?: number;
  seasonsTotal?: number;
}

const emptyCounts = (): EventCounts => ({
  game: 0, game_info: 0, lineup_start: 0, substitution: 0,
  comment: 0, earned_runs: 0, game_adjustment: 0, play: 0, fielding_daily: 0,
});

/**
 * The game ids an event file holds (its `id,` records), in file order, without
 * a full parse. Read as parseEventFile reads them, so they match its gameIds.
 */
export function gameIdsInEventFile(file: string): string[] {
  return gameCopiesInEventFile(file).map(([id]) => id);
}

/**
 * Each game in an event file as [id, hash of its records]: two copies of a
 * game hash alike when their records are the same, whatever the line endings
 * or blank lines (which the parser skips).
 */
export function gameCopiesInEventFile(file: string): [string, string][] {
  const copies: [string, string][] = [];
  let id: string | undefined;
  let hash: Hash | undefined;
  const finish = (): void => {
    if (id !== undefined) copies.push([id, hash!.digest("hex")]);
  };
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    if (line.startsWith("id,")) {
      finish();
      id = (parseCsvLine(line)[1] ?? "").trim();
      hash = createHash("sha1");
    }
    if (hash && line !== "") hash.update(line + "\n");
  }
  finish();
  return copies;
}

/** For each event file, the games whose copy there is the one to load. */
export type GameCopies = Map<string, Set<string>>;

/** A game id with skipped copies that differ from the one that loads: the files holding each. */
export interface RepeatedGame {
  gameId: string;
  kept: string;
  differing: string[];
}

/** Where the copy of a game that loads came from, and a hash of its records. */
export type SeenCopies = Map<string, { file: string; hash: string }>;

/**
 * Which copy of each game loads when an id appears more than once: the first,
 * taking the files in the order given and each file's games in file order.
 * Retrosheet releases have repeated games, both in a second file (August 2026:
 * 1913NGL.EVR beside 1913.EVR, and so on) and twice in one file, and upstream
 * fixed them by keeping the first copy. Each copy comes as [id, hash of its
 * records]; `seen` carries the copies already loaded across calls. Returns the
 * games each file loads, how many copies each file skips, and the ids whose
 * skipped copies differ from the one that loads (a game lost, not a duplicate).
 */
export function firstCopies(
  copiesByFile: Iterable<readonly [string, readonly (readonly [string, string])[]]>,
  seen: SeenCopies = new Map(),
): { load: GameCopies; skipped: Map<string, number>; repeats: RepeatedGame[] } {
  const load: GameCopies = new Map();
  const skipped = new Map<string, number>();
  const differing = new Map<string, RepeatedGame>();
  for (const [file, copies] of copiesByFile) {
    const mine = new Set<string>();
    for (const [id, hash] of copies) {
      const kept = seen.get(id);
      if (!kept) {
        seen.set(id, { file, hash });
        mine.add(id);
        continue;
      }
      skipped.set(file, (skipped.get(file) ?? 0) + 1);
      if (hash !== kept.hash) {
        const repeat = differing.get(id) ?? { gameId: id, kept: kept.file, differing: [] };
        repeat.differing.push(file);
        differing.set(id, repeat);
      }
    }
    load.set(file, mine);
  }
  return { load, skipped, repeats: [...differing.values()] };
}

/** `load` cut down to the given games, without the files left with none. */
export function onlyGames(load: GameCopies, games: ReadonlySet<string>): GameCopies {
  const out: GameCopies = new Map();
  for (const [file, ids] of load) {
    const kept = new Set([...ids].filter((id) => games.has(id)));
    if (kept.size) out.set(file, kept);
  }
  return out;
}

/** The first copies among these files, in order, with the copies skipped logged. */
export function firstCopiesIn(
  files: readonly string[],
  seen?: SeenCopies,
): { load: GameCopies; repeats: RepeatedGame[] } {
  const { load, skipped, repeats } = firstCopies(files.map((f) => [f, gameCopiesInEventFile(f)] as const), seen);
  for (const [file, n] of skipped) {
    console.warn(`  ${basename(file)}: skipped ${n} repeated game${n === 1 ? "" : "s"} (an earlier copy loads)`);
  }
  for (const r of repeats) {
    console.warn(`  ${r.gameId}: the copy in ${basename(r.kept)} loads; ${r.differing.length} that differ from it are skipped`);
  }
  return { load, repeats };
}

/**
 * Every season with event files, or only the given ones. Records the repeated
 * games it finds in data_gap; a partial load clears the seasons' first.
 */
export async function loadEvents(
  client: PoolClient,
  root: string,
  teamLeagues: ReadonlyMap<string, string>,
  seasons?: Set<string>,
  progress?: LoadProgress,
): Promise<EventCounts> {
  const counts = emptyCounts();
  const years = seasonYears(root)
    .filter((y) => (!seasons || seasons.has(y)) && eventFiles(root, y).length);
  if (progress) {
    progress.seasonsDone = 0;
    progress.seasonsTotal = years.length;
  }
  const seen: SeenCopies = new Map();
  for (const year of years) {
    const files = eventFiles(root, year);
    const { load, repeats } = firstCopiesIn(files, seen);
    if (repeats.length) await copyRows(client, "data_gap", GAP_COLS, repeatedGameRows(repeats));
    await loadEventFiles(client, files, teamLeagues, load, counts, progress);
    if (progress) progress.seasonsDone = (progress.seasonsDone ?? 0) + 1;
  }
  return counts;
}

/**
 * Load these event files (absolute paths), one at a time, adding to `counts`.
 * Only the games `load` names for a file load from it, each once. The
 * file-level replace (run.ts) calls this directly with the files holding the
 * replaced games' first copies.
 */
export async function loadEventFiles(
  client: PoolClient,
  files: readonly string[],
  teamLeagues: ReadonlyMap<string, string>,
  load: GameCopies,
  counts: EventCounts = emptyCounts(),
  progress?: LoadProgress,
): Promise<EventCounts> {
  for (const file of files) {
      const wanted = new Set(load.get(file));
      const games = parseEventFile(readFileSync(file, "utf8"))
        .filter((g) => wanted.delete(g.gameId));

      const gameRows: (string | null)[][] = [];
      const infoRows: (string | null)[][] = [];
      const startRows: (string | null)[][] = [];
      const subRows: (string | null)[][] = [];
      const comRows: (string | null)[][] = [];
      const erRows: (string | null)[][] = [];
      const adjRows: (string | null)[][] = [];
      const playRows: (string | null)[][] = [];
      const fieldingRows: (string | null)[][] = [];

      const sourceFile = basename(file);
      for (const g of games) {
        if (g.gameId === "") continue;
        gameRows.push(gameRow(g, sourceFile, teamLeagues));
        const info = new Map(g.info);
        const visteam = info.get("visteam") ?? null;
        const hometeam = info.get("hometeam") ?? null;
        const gameDate = slashDateToIso(info.get("date"));
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
        const replay = replayGame(g);
        for (const r of replay.plays) {
          playRows.push([
            r.gameId, String(r.playSeq), num(r.inning), num(r.half), r.batterId, r.pitcherId,
            num(r.outsBefore), num(r.balls), num(r.strikes), r.pitchSeq, r.event, num(r.eventCode),
            r.eventName, num(r.hitValue), b(r.atBat), b(r.sacFly), b(r.sacHit), b(r.doublePlay),
            b(r.triplePlay), b(r.wildPitch), b(r.passedBall), num(r.outsOnPlay), num(r.rbi),
            num(r.runsOnPlay), num(r.awayScoreBefore), num(r.homeScoreBefore), r.base1Before,
            r.base2Before, r.base3Before, num(r.batterDest), num(r.run1Dest), num(r.run2Dest),
            num(r.run3Dest),
          ]);
        }
        for (const fl of replay.fielding) {
          fieldingRows.push([
            g.gameId, fl.playerId, fl.side === 0 ? visteam : hometeam, gameDate,
            num(fl.position), num(fl.side), num(fl.games), b(fl.gamesStarted), num(fl.outs),
            num(fl.po), num(fl.a), num(fl.e), num(fl.dp), num(fl.tp), num(fl.pb), num(fl.xi),
          ]);
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
      if (playRows.length) counts.play += await copyRows(client, "play", PLAY_COLS, playRows);
      if (fieldingRows.length) counts.fielding_daily += await copyRows(client, "fielding_daily", FIELDING_COLS, fieldingRows);

      // Update shared progress after each file so the heartbeat clock advances.
      if (progress) {
        progress.plays = counts.play;
        progress.label = `events ${basename(file)}`;
      }
  }
  return counts;
}
