// Copyright (c) 2026 Syd Polk
// SPDX-License-Identifier: BSD-3-Clause
//
// The data_gap table: what the loaded data is missing, recorded by the load
// that produced it, so every installation's list matches its own data. Two
// kinds are measured from the loaded tables at the end of every load
// (computedGapStatements). The third, repeated_game, only a load can see: a
// game id whose copies in the event files differ, of which only the first
// loads (events.ts firstCopies). A load records those for the seasons it reads.
import { basename, dirname } from "node:path";
import type { RepeatedGame } from "./events.js";

export const GAP_COLS = ["kind", "season", "league_group", "game_id", "percent", "detail"];

/** Rows for the repeated games a load found, each in the season of the copy that loads. */
export function repeatedGameRows(repeats: readonly RepeatedGame[]): (string | null)[][] {
  return repeats.map(({ gameId, kept, differing }) => [
    "repeated_game",
    basename(dirname(kept)),
    null,
    gameId,
    null,
    `The copy in ${basename(kept)} loads; ${differing.length} ` +
      (differing.length === 1 ? "copy that differs from it is skipped" : "copies that differ from it are skipped") +
      ` (${differing.map((f) => basename(f)).join(", ")})`,
  ]);
}

/** Clear the repeated games recorded for seasons a partial load reads again. */
export function repeatedGameDeleteStatements(seasons: readonly string[]): string[] {
  if (!seasons.length) return [];
  return [`DELETE FROM data_gap WHERE kind = 'repeated_game' AND season IN (${seasons.join(", ")})`];
}

/**
 * Measure the gaps the loaded tables show, replacing the last measurement:
 *   putout_share  putouts as a share of outs recorded, per decade and league
 *                 group, where they fall short (an out with no fielder named,
 *                 Retrosheet's `99`, credits no putout)
 *   no_game_log   games with no game_log row, whose final score can't be
 *                 checked; Negro Leagues games are left out, since Retrosheet
 *                 publishes no Negro Leagues game logs
 */
export function computedGapStatements(): string[] {
  return [
    "DELETE FROM data_gap WHERE kind IN ('putout_share', 'no_game_log')",
    `INSERT INTO data_gap (kind, season, league_group, percent, detail)
     SELECT 'putout_share', p.decade, p.league_group, round(100.0 * f.po / p.outs, 1),
            format('Putouts are %s%% of outs recorded in the %ss (%s of %s)',
                   round(100.0 * f.po / p.outs, 1), p.decade,
                   to_char(f.po, 'FM999,999,999'), to_char(p.outs, 'FM999,999,999'))
       FROM (SELECT (extract(year FROM g.game_date)::int / 10) * 10 AS decade, g.league_group,
                    sum(pl.outs_on_play) AS outs
               FROM play pl JOIN game g ON g.game_id = pl.game_id
              GROUP BY 1, 2) p
       JOIN (SELECT (extract(year FROM g.game_date)::int / 10) * 10 AS decade, g.league_group,
                    sum(fd.po) AS po
               FROM fielding_daily fd JOIN game g ON g.game_id = fd.game_id
              GROUP BY 1, 2) f
         ON f.decade = p.decade AND f.league_group IS NOT DISTINCT FROM p.league_group
      WHERE f.po < p.outs`,
    `INSERT INTO data_gap (kind, season, league_group, game_id, detail)
     SELECT 'no_game_log', extract(year FROM g.game_date)::int, g.league_group, g.game_id,
            'No game-log row, so the final score cannot be checked'
       FROM game g
      WHERE g.league_group IS DISTINCT FROM 'negro'
        AND NOT EXISTS (SELECT 1 FROM game_log gl WHERE gl.game_id = g.game_id)`,
  ];
}
