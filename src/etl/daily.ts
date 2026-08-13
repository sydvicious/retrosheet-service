// Copyright (c) 2026 Syd Polk
// SPDX-License-Identifier: BSD-3-Clause
//
// Phase 4 loader: derive per-player-per-game "daily" stat lines by AGGREGATING
// the already-loaded play table (plus earned_runs / game / lineup_start) purely
// in SQL. No new parsing — these tables are recomputed on every load, after the
// play table is filled, inside the same transaction as everything else.
//
// Scope: batting and pitching. Fielding (PO/A/E per position) is out of scope —
// it needs the parsed fielder sequence, which the play table does not persist.
//
// Notes on a couple of derivations:
//  * Batting `runs` = runs the player scored, as the batter (batter_dest = 4) or
//    as a baserunner whose id (base{n}_before) reaches home (run{n}_dest = 4).
//  * `stolen_bases` / `caught_stealing` are attributed to the runner on the
//    origin base of each SB/CS token in the event string (CS includes POCS; an
//    error in the token negates the caught stealing). This relies on correct
//    base-runner state, which gameState.ts now maintains for implicit steals.
//  * Pitching `runs` counts runs that scored while the pitcher was on the mound
//    (inherited-runner responsibility is a known refinement); `earned_runs` is
//    authoritative, from Retrosheet's data,er records.
import type { PoolClient } from "pg";
import type { LoadProgress } from "./events.js";

export interface DailyCounts {
  batting_daily: number;
  pitching_daily: number;
}

// A completed plate appearance: a batter-outcome event (not a pure baserunning
// event like SB/CS/WP/PB/BK/DI). Codes: 2 out, 3 K, 14 BB, 15 IBB, 16 HBP,
// 17 interference, 18 error, 19 fielder's choice, 20-23 hits (hit_value > 0).
const PA_FILTER =
  "(event_code IN (2,3,14,15,16,17,18,19) OR hit_value > 0)";

const BATTING_SQL = `
INSERT INTO batting_daily (
  game_id, player_id, team, game_date, side,
  plate_appearances, at_bats, runs, hits, doubles, triples, home_runs, rbi,
  walks, intentional_walks, strikeouts, hit_by_pitch, sac_hits, sac_flies,
  gidp, stolen_bases, caught_stealing, total_bases)
-- Two passes over play (down from ~15 scans): a batter-role pass and a
-- runner-role pass, joined at the end. FULL OUTER JOIN so pinch-runners who
-- never batted (runner only) and batters who never reached base (batter only)
-- both get a row.
WITH
-- Pass 1 — batter role, grouped by (game, batter). Includes runs the batter
-- scored himself (batter_dest = 4); baserunner runs are added in pass 2.
batter AS (
  SELECT
    game_id, batter_id AS player_id, half AS side,
    count(*) FILTER (WHERE ${PA_FILTER})            AS pa,
    count(*) FILTER (WHERE at_bat)                  AS ab,
    count(*) FILTER (WHERE hit_value > 0)           AS h,
    count(*) FILTER (WHERE hit_value = 2)           AS doubles,
    count(*) FILTER (WHERE hit_value = 3)           AS triples,
    count(*) FILTER (WHERE hit_value = 4)           AS hr,
    COALESCE(sum(rbi), 0)                           AS rbi,
    count(*) FILTER (WHERE event_code IN (14,15))   AS bb,
    count(*) FILTER (WHERE event_code = 15)         AS ibb,
    count(*) FILTER (WHERE event_code = 3)          AS so,
    count(*) FILTER (WHERE event_code = 16)         AS hbp,
    count(*) FILTER (WHERE sac_hit)                 AS sh,
    count(*) FILTER (WHERE sac_fly)                 AS sf,
    count(*) FILTER (WHERE double_play)             AS gidp,
    COALESCE(sum(hit_value), 0)                     AS tb,
    count(*) FILTER (WHERE batter_dest = 4)         AS batter_runs
  FROM play
  GROUP BY game_id, batter_id, half
),
-- Pass 2 — runner role. Unpivot each play's three baserunners once (a LATERAL
-- over the bases), then credit runs scored (dest = 4), stolen bases, and caught
-- stealing to the runner on the origin base. CS matches POCS; a parenthetical
-- error (e.g. CS2(2E6)) negates the CS.
runner AS (
  SELECT game_id, player_id, side,
         count(*) FILTER (WHERE dest = 4) AS runner_runs,
         count(*) FILTER (WHERE is_sb)    AS sb,
         count(*) FILTER (WHERE is_cs)    AS cs
  FROM (
    SELECT p.game_id, p.half AS side, u.player_id, u.dest, u.is_sb, u.is_cs
    FROM play p
    CROSS JOIN LATERAL (VALUES
      (p.base1_before, p.run1_dest, p.event ~ 'SB2', p.event ~ 'CS2(?!\\([^)]*E)'),
      (p.base2_before, p.run2_dest, p.event ~ 'SB3', p.event ~ 'CS3(?!\\([^)]*E)'),
      (p.base3_before, p.run3_dest, p.event ~ 'SBH', p.event ~ 'CSH(?!\\([^)]*E)')
    ) AS u(player_id, dest, is_sb, is_cs)
    WHERE u.player_id IS NOT NULL
  ) s
  GROUP BY game_id, player_id, side
)
SELECT
  COALESCE(b.game_id, r.game_id) AS game_id,
  COALESCE(b.player_id, r.player_id) AS player_id,
  CASE WHEN COALESCE(b.side, r.side) = 0 THEN g.visitor_team ELSE g.home_team END AS team,
  g.game_date, COALESCE(b.side, r.side) AS side,
  COALESCE(b.pa, 0), COALESCE(b.ab, 0),
  COALESCE(b.batter_runs, 0) + COALESCE(r.runner_runs, 0),
  COALESCE(b.h, 0), COALESCE(b.doubles, 0), COALESCE(b.triples, 0), COALESCE(b.hr, 0),
  COALESCE(b.rbi, 0), COALESCE(b.bb, 0), COALESCE(b.ibb, 0), COALESCE(b.so, 0),
  COALESCE(b.hbp, 0), COALESCE(b.sh, 0), COALESCE(b.sf, 0), COALESCE(b.gidp, 0),
  COALESCE(r.sb, 0), COALESCE(r.cs, 0), COALESCE(b.tb, 0)
FROM batter b
FULL OUTER JOIN runner r ON r.game_id = b.game_id AND r.player_id = b.player_id
JOIN game g ON g.game_id = COALESCE(b.game_id, r.game_id)
`;

const PITCHING_SQL = `
INSERT INTO pitching_daily (
  game_id, player_id, team, game_date, side, games_started,
  outs, batters_faced, hits, home_runs, runs, earned_runs,
  walks, intentional_walks, strikeouts, hit_by_pitch, wild_pitches, balks,
  won, lost, saved)
WITH
pitch AS (
  SELECT
    game_id, pitcher_id AS player_id, (1 - half) AS side,
    COALESCE(sum(outs_on_play), 0)                 AS outs,
    count(*) FILTER (WHERE ${PA_FILTER})            AS bfp,
    count(*) FILTER (WHERE hit_value > 0)           AS h,
    count(*) FILTER (WHERE hit_value = 4)           AS hr,
    COALESCE(sum(runs_on_play), 0)                  AS r,
    count(*) FILTER (WHERE event_code IN (14,15))   AS bb,
    count(*) FILTER (WHERE event_code = 15)         AS ibb,
    count(*) FILTER (WHERE event_code = 3)          AS so,
    count(*) FILTER (WHERE event_code = 16)         AS hbp,
    count(*) FILTER (WHERE wild_pitch)              AS wp,
    count(*) FILTER (WHERE event_code = 11)         AS bk
  FROM play
  WHERE pitcher_id IS NOT NULL
  GROUP BY game_id, pitcher_id, half
),
er AS (
  SELECT game_id, player_id, sum(earned_runs)::int AS er
  FROM earned_runs WHERE player_id IS NOT NULL GROUP BY game_id, player_id
),
gs AS (
  SELECT DISTINCT game_id, player_id FROM lineup_start WHERE fielding_position = 1
)
SELECT
  pt.game_id, pt.player_id,
  CASE WHEN pt.side = 0 THEN g.visitor_team ELSE g.home_team END AS team,
  g.game_date, pt.side,
  (gs.player_id IS NOT NULL) AS games_started,
  pt.outs, pt.bfp, pt.h, pt.hr, pt.r, er.er,
  pt.bb, pt.ibb, pt.so, pt.hbp, pt.wp, pt.bk,
  COALESCE(g.winning_pitcher = pt.player_id, false) AS won,
  COALESCE(g.losing_pitcher  = pt.player_id, false) AS lost,
  COALESCE(g.save_pitcher    = pt.player_id, false) AS saved
FROM pitch pt
JOIN game g ON g.game_id = pt.game_id
LEFT JOIN er ON er.game_id = pt.game_id AND er.player_id = pt.player_id
LEFT JOIN gs ON gs.game_id = pt.game_id AND gs.player_id = pt.player_id
`;

/** Populate batting_daily and pitching_daily from the loaded play table. */
export async function loadDaily(client: PoolClient, progress?: LoadProgress): Promise<DailyCounts> {
  if (progress) progress.detail = "aggregating batting_daily …";
  const bat = await client.query(BATTING_SQL);
  if (progress) progress.detail = "aggregating pitching_daily …";
  const pit = await client.query(PITCHING_SQL);
  return {
    batting_daily: bat.rowCount ?? 0,
    pitching_daily: pit.rowCount ?? 0,
  };
}
