// Copyright (c) 2026 Syd Polk
// SPDX-License-Identifier: BSD-3-Clause
//
// The partial ("--replace") load: which seasons and which whole tables to
// reload, and the SQL that clears them first. Pure, so the argument parsing,
// the season predicate, and the delete order are tested without a database;
// run.ts executes the statements inside the load transaction.

/** What a partial load replaces; the shape scripts/data-changes.sh prints. */
export interface ReplacePlan {
  /** Whole seasons to reload: four-digit years, sorted, deduped. */
  seasons: string[];
  /** Event files to replace, relative to the data dir (`seasons/<year>/<file>.EV?`). */
  files: string[];
  /** Game ids to delete before loading `files`: the games their old versions held. */
  games: string[];
  /** Roster team-years to replace, as "<year>:<TEAM>". */
  rosters: string[];
  /** Seasons whose schedule to replace. */
  schedules: string[];
  /** Reload the reference tables (people, teams, …) whole. */
  reference: boolean;
  /** Reload game_log whole. */
  gamelog: boolean;
}

const list = (value: string): string[] => value.split(",").map((s) => s.trim()).filter(Boolean);
const sorted = (xs: string[]): string[] => [...new Set(xs)].sort();

function validated(values: string[], re: RegExp, what: string): string[] {
  for (const v of values) {
    if (!re.test(v)) throw new Error(`--replace: bad ${what} "${v}"`);
  }
  return sorted(values);
}

/**
 * Parse `--replace seasons=1987 files=seasons/1909/1909DET.EVA games=DET190904140
 * rosters=2019:BAL schedules=2019 reference=0 gamelog=1`: the words after
 * --replace that look like key=value, in any order, each optional. Returns
 * undefined when --replace is absent; throws on a malformed value or an unknown
 * key. Values are validated here so the SQL built from them can inline them:
 * seasons and schedules are four digits, a file is one name inside a season
 * directory ending in .EVN/.EVA/.EVE/.EVR, a game id is a team code plus a date and
 * game number, a roster is "<year>:<team code>".
 */
export function parseReplaceArgs(argv: readonly string[]): ReplacePlan | undefined {
  const at = argv.indexOf("--replace");
  if (at < 0) return undefined;
  const plan: ReplacePlan = {
    seasons: [], files: [], games: [], rosters: [], schedules: [], reference: false, gamelog: false,
  };
  for (const word of argv.slice(at + 1)) {
    const eq = word.indexOf("=");
    if (eq < 0) break; // next flag, not ours
    const key = word.slice(0, eq);
    const value = word.slice(eq + 1);
    switch (key) {
      case "seasons": plan.seasons = validated(list(value), /^\d{4}$/, "season (expected four digits)"); break;
      case "files": plan.files = validated(list(value), /^seasons\/\d{4}\/[A-Za-z0-9_.-]+\.EV[NAER]$/i, "file"); break;
      case "games": plan.games = validated(list(value), /^[A-Z0-9]{3}\d{9}$/, "game id"); break;
      case "rosters": plan.rosters = validated(list(value), /^\d{4}:[A-Za-z0-9-]+$/, "roster (expected year:TEAM)"); break;
      case "schedules": plan.schedules = validated(list(value), /^\d{4}$/, "schedule (expected four digits)"); break;
      case "reference": plan.reference = value === "1"; break;
      case "gamelog": plan.gamelog = value === "1"; break;
      default: throw new Error(`--replace: unknown key "${key}"`);
    }
  }
  return plan;
}

/**
 * The seasons whose event files a file-level replace reads to find each
 * replaced game's first copy (events.ts firstCopies): the changed files'
 * seasons, and the year in each game id, since a copy kept in an unchanged
 * file belongs to its own season.
 */
export function copySeasons(files: readonly string[], gameIds: readonly string[]): string[] {
  const years = [
    ...files.map((f) => /^seasons\/(\d{4})\//.exec(f)?.[1]),
    ...gameIds.map((id) => id.slice(3, 7)),
  ];
  return sorted(years.filter((y): y is string => !!y && /^\d{4}$/.test(y)));
}

/** Season and team of a roster file path (`seasons/2019/BAL2019.ROS` → 2019, BAL). */
export function rosterTeamYear(path: string): { year: string; team: string } | undefined {
  const m = /^seasons\/(\d{4})\/(.+?)(\d{4})\.ROS$/i.exec(path);
  if (!m || m[3] !== m[1]) return undefined;
  return { year: m[1]!, team: m[2]! };
}

/**
 * SQL predicate on game.game_date selecting the games of these seasons. A
 * baseball season sits inside its calendar year, and game_date is the event
 * file's date record. FALSE for no seasons, so nothing matches by accident.
 * Seasons are validated to four digits by parseReplaceArgs, so the literals
 * are safe to inline.
 */
export function seasonGamePredicate(seasons: readonly string[]): string {
  if (seasons.length === 0) return "FALSE";
  return seasons
    .map((y) => `(game_date >= '${y}-01-01' AND game_date < '${Number(y) + 1}-01-01')`)
    .join(" OR ");
}

/** Tables with a game_id foreign key into game, deleted before game itself. */
export const GAME_CHILD_TABLES = [
  "game_info", "lineup_start", "substitution", "comment", "earned_runs",
  "game_adjustment", "play", "fielding_daily", "batting_daily", "pitching_daily",
] as const;

/**
 * DELETE statements that clear these seasons, in an order the foreign keys
 * allow: children of game (through game by the season predicate), then game,
 * then roster (by year) and schedule (by date).
 */
export function seasonDeleteStatements(seasons: readonly string[]): string[] {
  const pred = seasonGamePredicate(seasons);
  const games = `game_id IN (SELECT game_id FROM game WHERE ${pred})`;
  const years = seasons.length ? seasons.map(Number).join(", ") : "NULL";
  return [
    ...GAME_CHILD_TABLES.map((t) => `DELETE FROM ${t} WHERE ${games}`),
    `DELETE FROM game WHERE ${pred}`,
    `DELETE FROM roster WHERE year IN (${years})`,
    `DELETE FROM schedule WHERE ${pred}`,
  ];
}

/**
 * DELETE statements that clear the games listed in the `replaced_games` temp
 * table (one game_id column), which the caller fills first: children of game,
 * then game. Used by the file-level replace, where the set is a list of ids
 * rather than a date range.
 */
export function gameDeleteStatements(): string[] {
  const games = "game_id IN (SELECT game_id FROM replaced_games)";
  return [
    ...GAME_CHILD_TABLES.map((t) => `DELETE FROM ${t} WHERE ${games}`),
    `DELETE FROM game WHERE ${games}`,
  ];
}

/** DELETE the roster rows of these team-years ("<year>:<TEAM>", validated by parseReplaceArgs). */
export function rosterDeleteStatement(rosters: readonly string[]): string {
  const pairs = rosters.map((r) => {
    const [year, team] = r.split(":") as [string, string];
    return `(${Number(year)}, '${team}')`;
  });
  return `DELETE FROM roster WHERE (year, team) IN (${pairs.length ? pairs.join(", ") : "(NULL, NULL)"})`;
}

/** DELETE the schedule rows of these seasons. */
export function scheduleDeleteStatement(seasons: readonly string[]): string {
  return `DELETE FROM schedule WHERE ${seasonGamePredicate(seasons)}`;
}

/**
 * The reference tables, a closed set: coaches.player_id references people and
 * nothing outside this list references any of them, so they are emptied and
 * reloaded together. Listed in load order (people first).
 */
export const REFERENCE_TABLES = ["people", "teams", "ballparks", "coaches", "ejections", "relatives"] as const;

/**
 * Empty the reference tables for a reload. DELETE, not TRUNCATE: TRUNCATE
 * locks a table against reads until the commit, while readers see the deleted
 * rows until then. Reverse load order, so coaches go before the people they
 * reference.
 */
export function referenceDeleteStatements(): string[] {
  return [...REFERENCE_TABLES].reverse().map((t) => `DELETE FROM ${t}`);
}
