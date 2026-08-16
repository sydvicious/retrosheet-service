// Copyright (c) 2026 Syd Polk
// SPDX-License-Identifier: BSD-3-Clause
//
// SQL for the blown-leads study. Edit here, not in the generated .md files.

// ---------------------------------------------------------------------------
// Runs scored on a play, re-derived from the raw Retrosheet event string.
//
// The mart's play.runs_on_play disagrees with the official final score in 13%
// of games (see 03-data-quality.md), in both directions, which is fatal for a
// study that turns on the exact score after every play. This expression counts
// runs straight from the event text instead, per the Retrosheet spec:
//
//   * "<runner>-H" is an advance to home = a run. An advance ending in an out
//     is written with X ("2XH"), so it does not match.
//   * A home run scores the batter, who gets no explicit "B-H" token.
//   * "SBH" is a steal of home — a run, but only when the scorer did not also
//     write the advance out: "SBH;SB2" scores one, and so does
//     "SBH;SB2.3-H(UR)", where the "3-H" IS the steal of home.
//
// Markers on an advance — (UR), (TUR), (NR), (E4), (RBI) — qualify the run,
// they don't cancel it, so they are deliberately ignored here.
//
// Validated against game_log's final scores: 98.8% of games agree, vs 86.7%
// for play.runs_on_play.
// ---------------------------------------------------------------------------
export const RUNS = `
  ( (length(regexp_replace(p.event, '[B123]-H', '@', 'g'))
     - length(regexp_replace(regexp_replace(p.event, '[B123]-H', '@', 'g'), '@', '', 'g')))
    + CASE WHEN split_part(p.event, '.', 1) ~ '^(HR|H)([^A-Za-z]|$)' AND p.event !~ 'B-H'
           THEN 1 ELSE 0 END
    + greatest(0,
        (length(regexp_replace(p.event, 'SBH', '@', 'g'))
         - length(regexp_replace(regexp_replace(p.event, 'SBH', '@', 'g'), '@', '', 'g')))
        - CASE WHEN p.event ~ '3-H' THEN 1 ELSE 0 END)
  )`;

// Candidate games, then the running score after every play.
//
// The prefilter is Syd's, and it is lossless for this question: if a team led
// by 11+ and the trailing team drew level, the trailing team finished with at
// least as many runs as the leader had at the peak (>= 11), and the leader
// finished with at least that peak too. So both final scores must be >= 11.
// It cuts the replay from 201,874 games to ~660.
//
// Candidates come from game_log, whose final scores are Retrosheet's own and
// are authoritative here; only the in-game trajectory is reconstructed.
const TRAJECTORY = `
  WITH cand AS (
    SELECT gl.game_id
    FROM retrosheet.game_log gl
    JOIN retrosheet.game g USING (game_id)
    WHERE gl.visitor_score >= 11 AND gl.home_score >= 11),
  running AS (
    SELECT p.game_id, p.play_seq, p.inning, p.half,
           sum(CASE WHEN p.half = 0 THEN ${RUNS} ELSE 0 END) OVER w AS vis,
           sum(CASE WHEN p.half = 1 THEN ${RUNS} ELSE 0 END) OVER w AS home
    FROM retrosheet.play p
    WHERE p.game_id IN (SELECT game_id FROM cand)
    WINDOW w AS (PARTITION BY p.game_id ORDER BY p.play_seq ROWS UNBOUNDED PRECEDING)),
  traj AS (
    SELECT r.*, vis - home AS vlead, home - vis AS hlead,
           max(vis - home) OVER w AS peak_v, max(home - vis) OVER w AS peak_h
    FROM running r
    WINDOW w AS (PARTITION BY r.game_id ORDER BY r.play_seq ROWS UNBOUNDED PRECEDING))
`;

// The study's definition, stated once: a lead of THRESHOLD+ runs that the
// leading team later gave up entirely — the trailing team drew level or went
// ahead. Whether the leader then recovered to win is reported, not filtered on.
const blown = (threshold: number) => `
  bool_or(peak_v >= ${threshold} AND vlead <= 0) OR bool_or(peak_h >= ${threshold} AND hlead <= 0)`;

// Every game in which an 11+ run lead was surrendered, with the shape of the
// collapse: where the lead peaked, where it vanished, how it ended.
export const BLOWN_LEADS = `${TRAJECTORY},
  peak AS (
    SELECT DISTINCT ON (game_id) game_id, inning AS peak_inning,
           vis AS peak_vis, home AS peak_home, greatest(vlead, hlead) AS lead
    FROM traj t
    WHERE greatest(vlead, hlead)
        = (SELECT max(greatest(vlead, hlead)) FROM traj t2 WHERE t2.game_id = t.game_id)
    ORDER BY game_id, play_seq),
  evened AS (
    SELECT DISTINCT ON (game_id) game_id, inning AS tie_inning, vis AS tie_vis, home AS tie_home
    FROM traj
    WHERE (peak_v >= 11 AND vlead <= 0) OR (peak_h >= 11 AND hlead <= 0)
    ORDER BY game_id, play_seq),
  fin AS (
    SELECT game_id, max(vis) AS derived_vis, max(home) AS derived_home, max(inning) AS innings
    FROM traj GROUP BY game_id),
  blown AS (
    SELECT game_id,
           bool_or(peak_v >= 11 AND vlead <= 0) AS vis_blew,
           bool_or(peak_h >= 11 AND hlead <= 0) AS home_blew
    FROM traj GROUP BY game_id
    HAVING ${blown(11)})
  SELECT g.game_id, g.game_date::text AS game_date, g.visitor_team, g.home_team,
         vt.city || ' ' || vt.nickname AS visitor_name,
         ht.city || ' ' || ht.nickname AS home_name,
         b.vis_blew, b.home_blew, pk.lead, pk.peak_inning, pk.peak_vis, pk.peak_home,
         e.tie_inning, e.tie_vis, e.tie_home,
         gl.visitor_score, gl.home_score, f.innings, g.attendance,
         (f.derived_vis = gl.visitor_score AND f.derived_home = gl.home_score) AS score_verified
  FROM blown b
  JOIN peak pk USING (game_id)
  JOIN evened e USING (game_id)
  JOIN fin f USING (game_id)
  JOIN retrosheet.game g USING (game_id)
  JOIN retrosheet.game_log gl USING (game_id)
  LEFT JOIN retrosheet.teams vt ON vt.team_id = g.visitor_team
  LEFT JOIN retrosheet.teams ht ON ht.team_id = g.home_team
  ORDER BY g.game_date`;

// One rung down: 10-run leads given up entirely. Also the safety net — a game
// whose reconstruction is a run light would land here instead of in the main
// table, so this list is checked by hand for anything that belongs above.
export const NEAR_MISSES = `${TRAJECTORY},
  fin AS (
    SELECT game_id, max(vis) AS derived_vis, max(home) AS derived_home FROM traj GROUP BY game_id),
  agg AS (
    SELECT game_id, max(peak_v) AS peak_v, max(peak_h) AS peak_h,
           bool_or(peak_v >= 10 AND vlead <= 0) AS vis_blew,
           bool_or(peak_h >= 10 AND hlead <= 0) AS home_blew
    FROM traj GROUP BY game_id
    HAVING (${blown(10)}) AND NOT (${blown(11)}))
  SELECT g.game_id, g.game_date::text AS game_date, g.visitor_team, g.home_team,
         a.vis_blew, a.home_blew, greatest(a.peak_v, a.peak_h) AS lead,
         gl.visitor_score, gl.home_score,
         (f.derived_vis = gl.visitor_score AND f.derived_home = gl.home_score) AS score_verified
  FROM agg a
  JOIN fin f USING (game_id)
  JOIN retrosheet.game g USING (game_id)
  JOIN retrosheet.game_log gl USING (game_id)
  ORDER BY g.game_date`;

// The denominator: how often an 11-run lead is held at all. This is the one
// query that cannot use the both-teams-11+ prefilter — a lead that is never
// surrendered leaves the losing team well under 11 — so it replays all 16M
// plays and takes ~40s.
export const POPULATION = `
  WITH running AS (
    SELECT p.game_id,
           sum(CASE WHEN p.half = 0 THEN ${RUNS} ELSE 0 END) OVER w AS vis,
           sum(CASE WHEN p.half = 1 THEN ${RUNS} ELSE 0 END) OVER w AS home
    FROM retrosheet.play p
    WINDOW w AS (PARTITION BY p.game_id ORDER BY p.play_seq ROWS UNBOUNDED PRECEDING)),
  peak AS (SELECT game_id, max(greatest(vis - home, home - vis)) AS lead FROM running GROUP BY game_id)
  SELECT count(*) AS games,
         count(*) FILTER (WHERE lead >= 10) AS led_by_10,
         count(*) FILTER (WHERE lead >= 11) AS led_by_11
  FROM peak`;

// --- data quality ----------------------------------------------------------

// Agreement with game_log's final scores, the mart's stored run column against
// the re-derived one. This is the evidence for using the derived count.
export const RUN_DERIVATION_CHECK = `
  WITH per_play AS (
    SELECT p.game_id, p.half, p.runs_on_play AS stored, ${RUNS} AS derived
    FROM retrosheet.play p),
  per_game AS (
    SELECT game_id,
           sum(stored)  FILTER (WHERE half = 0) AS sv, sum(stored)  FILTER (WHERE half = 1) AS sh,
           sum(derived) FILTER (WHERE half = 0) AS dv, sum(derived) FILTER (WHERE half = 1) AS dh
    FROM per_play GROUP BY game_id)
  SELECT count(*) AS games,
         count(*) FILTER (WHERE sv = gl.visitor_score AND sh = gl.home_score) AS stored_match,
         count(*) FILTER (WHERE dv = gl.visitor_score AND dh = gl.home_score) AS derived_match
  FROM per_game JOIN retrosheet.game_log gl USING (game_id)`;

// Bug class 1 — a run credited on a force out that has no advance section at
// all, so no runner was written as reaching home.
export const PHANTOM_RUN_PLAYS = `
  SELECT count(*) AS plays, count(DISTINCT p.game_id) AS games
  FROM retrosheet.play p
  WHERE p.runs_on_play > 0 AND p.event LIKE '%/FO%' AND position('.' in p.event) = 0`;

// Bug class 2 — fewer runs credited than there are advances to home in the
// event string (typically a second run marked (UR) on the same play).
export const DROPPED_RUN_PLAYS = `
  WITH t AS (
    SELECT p.game_id, p.runs_on_play,
           (length(p.event) - length(replace(p.event, '-H', ''))) / 2 AS home_advances
    FROM retrosheet.play p
    WHERE p.event NOT LIKE '%HR%' AND p.event NOT LIKE '%SBH%')
  SELECT count(*) AS plays, count(DISTINCT game_id) AS games
  FROM t WHERE home_advances > runs_on_play`;

// What the study cannot see: games with a game log but no play-by-play.
export const COVERAGE = `
  SELECT count(*) AS candidates,
         count(*) FILTER (WHERE g.game_id IS NULL) AS without_pbp,
         min(gl.game_date) FILTER (WHERE g.game_id IS NULL)::text AS earliest_gap,
         max(gl.game_date) FILTER (WHERE g.game_id IS NULL)::text AS latest_gap
  FROM retrosheet.game_log gl
  LEFT JOIN retrosheet.game g USING (game_id)
  WHERE gl.visitor_score >= 11 AND gl.home_score >= 11`;

export const COVERAGE_BY_DECADE = `
  SELECT (extract(year FROM gl.game_date)::int / 10) * 10 AS decade,
         count(*) AS candidates,
         count(*) FILTER (WHERE g.game_id IS NULL) AS without_pbp
  FROM retrosheet.game_log gl
  LEFT JOIN retrosheet.game g USING (game_id)
  WHERE gl.visitor_score >= 11 AND gl.home_score >= 11
  GROUP BY 1 HAVING count(*) FILTER (WHERE g.game_id IS NULL) > 0
  ORDER BY 1`;
