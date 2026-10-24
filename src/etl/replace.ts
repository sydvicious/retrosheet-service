// Copyright (c) 2026 Syd Polk
// SPDX-License-Identifier: BSD-3-Clause
//
// The partial ("--replace") load: which seasons and which whole tables to
// reload, and the SQL that clears them first. Pure, so the argument parsing,
// the season predicate, and the delete order are tested without a database;
// run.ts executes the statements inside the load transaction. Plan: Phase 2 of
// "Incremental updates.md".

/** What a partial load replaces; the shape scripts/data-changes.sh prints. */
export interface ReplacePlan {
  /** Four-digit seasons, sorted, deduped. */
  seasons: string[];
  /** Reload the reference tables (people, teams, …) whole. */
  reference: boolean;
  /** Reload game_log whole. */
  gamelog: boolean;
}

/**
 * Parse `--replace seasons=1987,2019 reference=0 gamelog=1`: the words after
 * --replace that look like key=value, in any order, each optional. Returns
 * undefined when --replace is absent; throws on a malformed season (anything
 * but four digits) or an unknown key.
 */
export function parseReplaceArgs(argv: readonly string[]): ReplacePlan | undefined {
  const at = argv.indexOf("--replace");
  if (at < 0) return undefined;
  const plan: ReplacePlan = { seasons: [], reference: false, gamelog: false };
  for (const word of argv.slice(at + 1)) {
    const eq = word.indexOf("=");
    if (eq < 0) break; // next flag, not ours
    const key = word.slice(0, eq);
    const value = word.slice(eq + 1);
    switch (key) {
      case "seasons": {
        const years = value.split(",").map((s) => s.trim()).filter(Boolean);
        for (const y of years) {
          if (!/^\d{4}$/.test(y)) throw new Error(`--replace: bad season "${y}" (expected four digits)`);
        }
        plan.seasons = [...new Set(years)].sort();
        break;
      }
      case "reference": plan.reference = value === "1"; break;
      case "gamelog": plan.gamelog = value === "1"; break;
      default: throw new Error(`--replace: unknown key "${key}"`);
    }
  }
  return plan;
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
 * The reference tables, a closed set: coaches.player_id references people and
 * nothing outside this list references any of them, so they truncate and
 * reload together. Listed in load order (people first).
 */
export const REFERENCE_TABLES = ["people", "teams", "ballparks", "coaches", "ejections", "relatives"] as const;
