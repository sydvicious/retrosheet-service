// Copyright (c) 2026 Syd Polk
// SPDX-License-Identifier: BSD-3-Clause
//
// Analysis queries for the Nolan Ryan 1987 study. Each entry is rendered to a
// markdown file by run.ts. Queries are self-contained so they can also be
// pasted into psql or the MCP query_sql tool.
//
// Data-model notes that these queries depend on (learned the hard way):
//
//  * A "batter faced" is a play whose event_code is < 4 or > 13. Codes 4..13
//    are baserunning-only events (SB, CS, PO, WP, PB, balk, other advance,
//    foul error) that do NOT complete a plate appearance. This rule reproduces
//    pitching_daily.batters_faced and .outs exactly for all 27 Ryan seasons.
//
//  * pitching_daily.runs = runs that scored while the pitcher was on the mound.
//    pitching_daily.earned_runs = runs officially CHARGED to him, which by rule
//    includes runners he left on base who scored against a reliever. The two
//    columns therefore sit on different bases; never mix them in one rate.
//
//  * Houston's teams.league is 'NL;AL' because of the 2013 league switch, so
//    `WHERE league = 'NL'` silently drops the Astros. The 1987 NL is enumerated
//    explicitly below.

export interface Analysis {
  slug: string;
  title: string;
  note: string;
  sql: string;
}

const NL87 = `SELECT unnest(ARRAY['ATL','CHN','CIN','HOU','LAN','MON','NYN','PHI','PIT','SDN','SFN','SLN']) AS team`;

/** Runs the season ER/R ratio as a constant multiplier to convert RA/9 to an ERA scale. */
const ER_RATIO = `SELECT EXTRACT(YEAR FROM game_date)::int AS season,
         SUM(earned_runs)::numeric / NULLIF(SUM(runs), 0) AS er_r
  FROM pitching_daily WHERE player_id = 'ryann001' GROUP BY 1`;

export const analyses: Analysis[] = [
  {
    slug: "01-workload-by-season",
    title: "Ryan workload by season (starts only)",
    note:
      "Batters faced per start is the workload proxy. Pitch counts are not usable: " +
      "Retrosheet pitch sequences only begin in 1988, and a pitch estimator calibrated " +
      "on 1988-93 cannot be back-applied across the enormous 1972-76 Angels workloads or " +
      "the changeup Ryan added in 1981, both of which move pitches-per-PA.",
    sql: `
SELECT EXTRACT(YEAR FROM game_date)::int AS season,
       COUNT(*) FILTER (WHERE games_started) AS gs,
       SUM(batters_faced) FILTER (WHERE games_started) AS bf_in_starts,
       ROUND(SUM(batters_faced) FILTER (WHERE games_started)::numeric
             / NULLIF(COUNT(*) FILTER (WHERE games_started), 0), 2) AS bf_per_start,
       ROUND(SUM(outs) FILTER (WHERE games_started)::numeric / 3.0
             / NULLIF(COUNT(*) FILTER (WHERE games_started), 0), 2) AS ip_per_start,
       COUNT(*) FILTER (WHERE won) AS w,
       COUNT(*) FILTER (WHERE lost) AS l,
       ROUND(9.0 * SUM(earned_runs) / NULLIF(SUM(outs) / 3.0, 0), 2) AS era
FROM pitching_daily
WHERE player_id = 'ryann001'
GROUP BY 1
HAVING COUNT(*) FILTER (WHERE games_started) >= 10
ORDER BY bf_per_start`,
  },
  {
    slug: "02-workload-when-effective",
    title: "Workload conditional on pitching well",
    note:
      "Raw BF/start conflates 'pulled while cruising' with 'knocked out'. This " +
      "restricts to starts where Ryan allowed <= 2 runs, and counts how often he was " +
      "removed before facing 27 batters (i.e. before a third time through the order) " +
      "despite pitching well.",
    sql: `
WITH s AS (
  SELECT EXTRACT(YEAR FROM game_date)::int AS season, batters_faced, runs, outs
  FROM pitching_daily WHERE player_id = 'ryann001' AND games_started
)
SELECT season,
  COUNT(*) AS gs,
  ROUND(AVG(batters_faced), 2) AS bf_per_start_all,
  COUNT(*) FILTER (WHERE runs <= 2) AS starts_le2r,
  ROUND(AVG(batters_faced) FILTER (WHERE runs <= 2), 2) AS bf_per_start_le2r,
  ROUND(AVG(outs / 3.0) FILTER (WHERE runs <= 2), 2) AS ip_per_start_le2r,
  COUNT(*) FILTER (WHERE runs <= 2 AND batters_faced < 27) AS cruising_pulled_early,
  ROUND(100.0 * COUNT(*) FILTER (WHERE runs <= 2 AND batters_faced < 27)
        / NULLIF(COUNT(*) FILTER (WHERE runs <= 2), 0), 1) AS pct_cruising_pulled_early
FROM s GROUP BY season HAVING COUNT(*) >= 10 ORDER BY season`,
  },
  {
    slug: "03-tto-splits",
    title: "First 18 batters faced vs rest of start, by season",
    note:
      "bf_idx counts completed plate appearances; runs/outs from baserunning-only plays " +
      "(wild pitches, steals) are attributed to the batter at the plate rather than dropped. " +
      "ERA columns are RA/9 scaled by the season's charged-ER/runs ratio. Because that ratio " +
      "is a constant per season, it cannot create or hide a first-18-vs-rest gap; it only puts " +
      "the numbers on a familiar scale. era_full reproduces Ryan's published season ERA to " +
      "within ~0.02 as a check.",
    sql: `
WITH starts AS (
  SELECT game_id FROM pitching_daily WHERE player_id = 'ryann001' AND games_started
), allp AS (
  SELECT g.game_id, EXTRACT(YEAR FROM g.game_date)::int AS season, p.play_seq,
         p.outs_on_play, p.runs_on_play,
         (p.event_code < 4 OR p.event_code > 13) AS completes_pa,
         SUM(CASE WHEN (p.event_code < 4 OR p.event_code > 13) THEN 1 ELSE 0 END)
           OVER (PARTITION BY p.game_id ORDER BY p.play_seq
                 ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS bf_running
  FROM play p
  JOIN game g ON g.game_id = p.game_id
  JOIN starts s ON s.game_id = p.game_id
  WHERE p.pitcher_id = 'ryann001'
), idx AS (
  SELECT season, game_id, outs_on_play, runs_on_play,
         bf_running + CASE WHEN completes_pa THEN 0 ELSE 1 END AS bf_idx
  FROM allp
), agg AS (
  SELECT season, COUNT(DISTINCT game_id) AS gs,
    SUM(outs_on_play) FILTER (WHERE bf_idx <= 18) AS o18,
    SUM(runs_on_play) FILTER (WHERE bf_idx <= 18) AS r18,
    SUM(outs_on_play) AS o_all, SUM(runs_on_play) AS r_all
  FROM idx GROUP BY season
), ratio AS (${ER_RATIO})
SELECT a.season, a.gs,
  ROUND(a.o18 / 3.0, 1) AS ip_first18, a.r18 AS runs_first18,
  ROUND(9.0 * a.r18 * r.er_r / NULLIF(a.o18 / 3.0, 0), 2) AS era_first18,
  ROUND((a.o_all - a.o18) / 3.0, 1) AS ip_after18, (a.r_all - a.r18) AS runs_after18,
  ROUND(9.0 * (a.r_all - a.r18) * r.er_r / NULLIF((a.o_all - a.o18) / 3.0, 0), 2) AS era_after18,
  ROUND(9.0 * a.r_all * r.er_r / NULLIF(a.o_all / 3.0, 0), 2) AS era_full,
  ROUND(100.0 * (a.o_all - a.o18) / NULLIF(a.o_all, 0), 1) AS pct_ip_after18,
  ROUND(9.0 * (a.r_all - a.r18) * r.er_r / NULLIF((a.o_all - a.o18) / 3.0, 0)
      - 9.0 * a.r18 * r.er_r / NULLIF(a.o18 / 3.0, 0), 2) AS third_time_penalty
FROM agg a JOIN ratio r ON r.season = a.season
WHERE a.gs >= 10 ORDER BY a.season`,
  },
  {
    slug: "04-bullpen-1987",
    title: "1987 relief pitching: NL baseline vs Houston vs Houston behind Ryan",
    note:
      "Uses runs allowed while pitching (RA/9), not ERA. Reliever ERA is misleading here " +
      "because inherited runners who score are charged to the departed starter, which " +
      "flatters relievers and penalises starters.",
    sql: `
WITH nl87 AS (${NL87}),
pd87 AS (
  SELECT pd.* FROM pitching_daily pd JOIN nl87 n ON n.team = pd.team
  WHERE pd.game_date BETWEEN '1987-01-01' AND '1987-12-31'
),
ryan_games AS (
  SELECT game_id FROM pitching_daily
  WHERE player_id = 'ryann001' AND games_started
    AND game_date BETWEEN '1987-01-01' AND '1987-12-31'
)
SELECT 'NL relievers (all 12 teams)' AS group_, ROUND(SUM(outs) / 3.0, 1) AS ip,
       SUM(runs) AS runs_allowed, ROUND(9.0 * SUM(runs) / NULLIF(SUM(outs) / 3.0, 0), 2) AS ra9
FROM pd87 WHERE NOT games_started
UNION ALL
SELECT 'HOU relievers (all games)', ROUND(SUM(outs) / 3.0, 1), SUM(runs),
       ROUND(9.0 * SUM(runs) / NULLIF(SUM(outs) / 3.0, 0), 2)
FROM pd87 WHERE NOT games_started AND team = 'HOU'
UNION ALL
SELECT 'HOU relievers (Ryan starts)', ROUND(SUM(outs) / 3.0, 1), SUM(runs),
       ROUND(9.0 * SUM(runs) / NULLIF(SUM(outs) / 3.0, 0), 2)
FROM pd87 WHERE NOT games_started AND team = 'HOU' AND game_id IN (SELECT game_id FROM ryan_games)
UNION ALL
SELECT 'HOU relievers (non-Ryan starts)', ROUND(SUM(outs) / 3.0, 1), SUM(runs),
       ROUND(9.0 * SUM(runs) / NULLIF(SUM(outs) / 3.0, 0), 2)
FROM pd87 WHERE NOT games_started AND team = 'HOU' AND game_id NOT IN (SELECT game_id FROM ryan_games)`,
  },
  {
    slug: "05-bequeathed-runners-1987",
    title: "Runs charged to Ryan in 1987 that his relievers actually allowed",
    note:
      "Identifies runners on base when Ryan left each start, then follows those exact " +
      "runner ids through the remaining plays of that half-inning to see whether they scored. " +
      "Where charged_er exceeds runs_during, the difference is an inherited runner the bullpen " +
      "let in that still counts against Ryan's ERA.",
    sql: `
WITH st AS (
  SELECT game_id, game_date FROM pitching_daily
  WHERE player_id = 'ryann001' AND games_started
    AND game_date BETWEEN '1987-01-01' AND '1987-12-31'
), last AS (
  SELECT p.game_id, MAX(p.play_seq) AS last_seq
  FROM play p JOIN st ON st.game_id = p.game_id
  WHERE p.pitcher_id = 'ryann001' GROUP BY 1
), lp AS (
  SELECT p.* FROM play p JOIN last l ON l.game_id = p.game_id AND l.last_seq = p.play_seq
), bequeathed AS (
  SELECT lp.game_id, lp.inning, lp.half, r.rid
  FROM lp CROSS JOIN LATERAL (VALUES
      (lp.base1_before, lp.run1_dest), (lp.base2_before, lp.run2_dest),
      (lp.base3_before, lp.run3_dest), (lp.batter_id,    lp.batter_dest)
  ) AS r(rid, dest)
  WHERE r.rid IS NOT NULL AND r.rid <> '' AND r.dest BETWEEN 1 AND 3
), scored AS (
  SELECT b.game_id, COUNT(*) AS bequeathed_scored
  FROM bequeathed b
  JOIN last l ON l.game_id = b.game_id
  JOIN play p ON p.game_id = b.game_id AND p.play_seq > l.last_seq
             AND p.inning = b.inning AND p.half = b.half
  CROSS JOIN LATERAL (VALUES (p.base1_before, p.run1_dest), (p.base2_before, p.run2_dest),
                             (p.base3_before, p.run3_dest)) AS q(rid, dest)
  WHERE q.rid = b.rid AND q.dest >= 4
  GROUP BY 1
), during AS (
  SELECT p.game_id, SUM(p.runs_on_play) AS runs_during
  FROM play p JOIN st ON st.game_id = p.game_id
  WHERE p.pitcher_id = 'ryann001' GROUP BY 1
), left_on AS (
  SELECT game_id, COUNT(*) AS runners_left FROM bequeathed GROUP BY 1
)
SELECT st.game_date::date AS game_date, pd.batters_faced AS bf,
       ROUND(pd.outs / 3.0, 1) AS ip, d.runs_during,
       COALESCE(lo.runners_left, 0) AS runners_left_on,
       COALESCE(s.bequeathed_scored, 0) AS pen_scored_his_runners,
       pd.runs AS charged_r, pd.earned_runs AS charged_er
FROM st
JOIN pitching_daily pd ON pd.game_id = st.game_id AND pd.player_id = 'ryann001'
JOIN during d ON d.game_id = st.game_id
LEFT JOIN scored s ON s.game_id = st.game_id
LEFT JOIN left_on lo ON lo.game_id = st.game_id
ORDER BY st.game_date`,
  },
  {
    slug: "06-lead-holding-1987",
    title: "Leads held after the starter departs: Ryan vs the 1987 NL",
    note:
      "For every 1987 NL start, the score when the starting pitcher threw his last pitch, " +
      "versus the final result. This is the cleanest measure of what the bullpen cost Ryan.",
    sql: `
WITH nl87 AS (${NL87}),
st AS (
  SELECT pd.game_id, pd.player_id, pd.team
  FROM pitching_daily pd JOIN nl87 n ON n.team = pd.team
  WHERE pd.games_started AND pd.game_date BETWEEN '1987-01-01' AND '1987-12-31'
),
lastp AS (
  SELECT st.game_id, st.player_id, st.team, MAX(p.play_seq) AS last_seq
  FROM st JOIN play p ON p.game_id = st.game_id AND p.pitcher_id = st.player_id
  GROUP BY 1, 2, 3
),
fin AS (
  SELECT p.game_id,
    MAX(p.away_score_before + CASE WHEN p.half = 0 THEN p.runs_on_play ELSE 0 END) AS away_f,
    MAX(p.home_score_before + CASE WHEN p.half = 1 THEN p.runs_on_play ELSE 0 END) AS home_f
  FROM play p GROUP BY 1
),
exitsc AS (
  SELECT l.*, f.away_f, f.home_f,
    COALESCE((SELECT p2.away_score_before FROM play p2
              WHERE p2.game_id = l.game_id AND p2.play_seq > l.last_seq
              ORDER BY p2.play_seq LIMIT 1), f.away_f) AS away_e,
    COALESCE((SELECT p2.home_score_before FROM play p2
              WHERE p2.game_id = l.game_id AND p2.play_seq > l.last_seq
              ORDER BY p2.play_seq LIMIT 1), f.home_f) AS home_e
  FROM lastp l JOIN fin f ON f.game_id = l.game_id
),
sided AS (
  SELECT e.*,
    CASE WHEN g.home_team = e.team THEN e.home_e ELSE e.away_e END AS mine_e,
    CASE WHEN g.home_team = e.team THEN e.away_e ELSE e.home_e END AS opp_e,
    CASE WHEN g.home_team = e.team THEN e.home_f ELSE e.away_f END AS mine_f,
    CASE WHEN g.home_team = e.team THEN e.away_f ELSE e.home_f END AS opp_f
  FROM exitsc e JOIN game g ON g.game_id = e.game_id
)
SELECT CASE WHEN player_id = 'ryann001' THEN 'Ryan 1987'
            WHEN team = 'HOU' THEN 'Other HOU starters'
            ELSE 'All other NL starters' END AS group_,
  COUNT(*) FILTER (WHERE mine_e > opp_e) AS exits_with_lead,
  COUNT(*) FILTER (WHERE mine_e > opp_e AND mine_f > opp_f) AS leads_held,
  ROUND(100.0 * COUNT(*) FILTER (WHERE mine_e > opp_e AND mine_f > opp_f)
        / NULLIF(COUNT(*) FILTER (WHERE mine_e > opp_e), 0), 1) AS pct_leads_held,
  COUNT(*) FILTER (WHERE mine_e = opp_e) AS exits_tied,
  ROUND(100.0 * COUNT(*) FILTER (WHERE mine_e = opp_e AND mine_f > opp_f)
        / NULLIF(COUNT(*) FILTER (WHERE mine_e = opp_e), 0), 1) AS pct_tied_won
FROM sided GROUP BY 1 ORDER BY 1`,
  },
  {
    slug: "07-run-support-1987",
    title: "Run support behind Ryan, split by venue",
    note:
      "The Astrodome was a severe pitcher's park, so raw run support must not be compared " +
      "to the NL average. The controlled comparison is Houston's own scoring in Ryan's starts " +
      "versus its other games at the same venue. Note the split leaves only 17 games per cell.",
    sql: `
WITH nl87 AS (${NL87}),
ryan AS (
  SELECT game_id FROM pitching_daily
  WHERE player_id = 'ryann001' AND games_started
    AND game_date BETWEEN '1987-01-01' AND '1987-12-31'
),
tg AS (
  SELECT bd.game_id, bd.team, SUM(bd.runs) AS runs
  FROM batting_daily bd JOIN nl87 n ON n.team = bd.team
  WHERE bd.game_date BETWEEN '1987-01-01' AND '1987-12-31' GROUP BY 1, 2
),
hou AS (
  SELECT tg.game_id, tg.runs, (g.home_team = 'HOU') AS at_home,
         (ryan.game_id IS NOT NULL) AS ryan_start
  FROM tg JOIN game g ON g.game_id = tg.game_id
  LEFT JOIN ryan ON ryan.game_id = tg.game_id
  WHERE tg.team = 'HOU'
)
SELECT CASE WHEN at_home THEN 'Astrodome' ELSE 'Road' END AS venue,
       COUNT(*) FILTER (WHERE ryan_start) AS ryan_starts,
       ROUND(AVG(runs) FILTER (WHERE ryan_start), 2) AS hou_runs_ryan_starts,
       COUNT(*) FILTER (WHERE NOT ryan_start) AS other_games,
       ROUND(AVG(runs) FILTER (WHERE NOT ryan_start), 2) AS hou_runs_other_starts
FROM hou GROUP BY 1
UNION ALL
SELECT 'TOTAL', COUNT(*) FILTER (WHERE ryan_start),
       ROUND(AVG(runs) FILTER (WHERE ryan_start), 2),
       COUNT(*) FILTER (WHERE NOT ryan_start),
       ROUND(AVG(runs) FILTER (WHERE NOT ryan_start), 2)
FROM hou`,
  },
  {
    slug: "08-park-run-environment-1987",
    title: "1987 NL run environment by host park",
    note: "Combined runs per game by home park, establishing the Astrodome's severity.",
    sql: `
WITH nl87 AS (${NL87}),
tg AS (
  SELECT bd.game_id, bd.team, SUM(bd.runs) AS runs
  FROM batting_daily bd JOIN nl87 n ON n.team = bd.team
  WHERE bd.game_date BETWEEN '1987-01-01' AND '1987-12-31' GROUP BY 1, 2
),
gt AS (
  SELECT tg.game_id, g.home_team, SUM(tg.runs) AS total_runs, COUNT(*) AS sides
  FROM tg JOIN game g ON g.game_id = tg.game_id GROUP BY 1, 2
)
SELECT home_team AS host_park, COUNT(*) AS games,
       ROUND(AVG(total_runs), 2) AS combined_runs_per_game
FROM gt WHERE sides = 2 GROUP BY 1 ORDER BY 3`,
  },
  {
    slug: "09-ryan-1987-gamelog",
    title: "Ryan 1987 start-by-start log with bullpen aftermath",
    sql: `
WITH starts AS (
  SELECT pd.game_id, pd.game_date, pd.team, pd.outs, pd.batters_faced,
         pd.runs, pd.earned_runs, pd.strikeouts, pd.walks, pd.won, pd.lost
  FROM pitching_daily pd
  WHERE pd.player_id = 'ryann001' AND pd.games_started
    AND pd.game_date BETWEEN '1987-01-01' AND '1987-12-31'
), pen AS (
  SELECT s.game_id, COALESCE(SUM(pd.outs), 0) AS pen_outs, COALESCE(SUM(pd.runs), 0) AS pen_runs
  FROM starts s LEFT JOIN pitching_daily pd
    ON pd.game_id = s.game_id AND pd.team = s.team AND pd.player_id <> 'ryann001'
  GROUP BY 1
)
SELECT s.game_date::date AS game_date,
       CASE WHEN g.home_team = s.team THEN 'vs ' || g.visitor_team
            ELSE 'at ' || g.home_team END AS opponent,
       s.batters_faced AS bf, ROUND(s.outs / 3.0, 1) AS ip,
       s.runs AS r, s.earned_runs AS er, s.strikeouts AS so, s.walks AS bb,
       ROUND(pen.pen_outs / 3.0, 1) AS pen_ip, pen.pen_runs,
       CASE WHEN s.won THEN 'W' WHEN s.lost THEN 'L' ELSE '-' END AS decision
FROM starts s
JOIN pen ON pen.game_id = s.game_id
JOIN game g ON g.game_id = s.game_id
ORDER BY s.game_date`,
    note: "pen_ip includes extra innings, so it can exceed the innings Ryan left behind.",
  },
  {
    slug: "10-support-by-decision-1987",
    title: "Run support by decision — separating the bullpen from the offense",
    note:
      "The decisive split. All four of Ryan's blown leads became no-decisions rather than " +
      "losses, so the bullpen cannot account for any of his 16 defeats; it only denied him " +
      "wins. The loss column belongs to the offense.",
    sql: `
WITH st AS (
  SELECT pd.game_id, pd.team, pd.runs AS ryan_r, pd.outs, pd.won, pd.lost
  FROM pitching_daily pd
  WHERE pd.player_id = 'ryann001' AND pd.games_started
    AND pd.game_date BETWEEN '1987-01-01' AND '1987-12-31'
), tg AS (
  SELECT bd.game_id, bd.team, SUM(bd.runs) AS runs FROM batting_daily bd GROUP BY 1, 2
)
SELECT CASE WHEN st.won THEN 'Win' WHEN st.lost THEN 'Loss' ELSE 'No decision' END AS decision,
  COUNT(*) AS games,
  ROUND(AVG(st.outs / 3.0), 2) AS avg_ip,
  ROUND(AVG(st.ryan_r), 2) AS avg_runs_ryan_allowed,
  ROUND(AVG(mine.runs), 2) AS avg_hou_runs_scored,
  COUNT(*) FILTER (WHERE st.ryan_r <= 2) AS games_ryan_allowed_le2,
  COUNT(*) FILTER (WHERE mine.runs <= 2) AS games_hou_scored_le2
FROM st JOIN tg mine ON mine.game_id = st.game_id AND mine.team = st.team
GROUP BY 1 ORDER BY 1`,
  },
  {
    slug: "11-run-support-by-starter-1987",
    title: "Run support by Houston starter, with opposing-starter quality",
    note:
      "Ryan got the least support of the five Houston starters. The last column tests the " +
      "one mechanism that would make that systematic rather than luck — an ace drawing the " +
      "other team's ace — by averaging the season ERA of the opposing starter (150+ outs " +
      "required to qualify). Higher ERA means weaker opposition. Compare the spread of the " +
      "support column against se: if the five means scatter no more than sampling error " +
      "predicts, there is no real difference to explain.",
    sql: `
WITH hou_st AS (
  SELECT pd.game_id, pd.player_id, pd.team FROM pitching_daily pd
  WHERE pd.games_started AND pd.team = 'HOU'
    AND pd.game_date BETWEEN '1987-01-01' AND '1987-12-31'
), tg AS (
  SELECT bd.game_id, bd.team, SUM(bd.runs) AS runs FROM batting_daily bd GROUP BY 1, 2
), opp_st AS (
  SELECT pd.game_id, pd.player_id AS opp_id FROM pitching_daily pd
  WHERE pd.games_started AND pd.team <> 'HOU'
    AND pd.game_date BETWEEN '1987-01-01' AND '1987-12-31'
), season AS (
  SELECT player_id, SUM(outs) AS outs, SUM(earned_runs) AS er
  FROM pitching_daily WHERE game_date BETWEEN '1987-01-01' AND '1987-12-31'
  GROUP BY 1 HAVING SUM(outs) >= 150
), opp_era AS (
  SELECT h.player_id, AVG(9.0 * s.er / (s.outs / 3.0)) AS opp_era, COUNT(*) AS n_qual
  FROM hou_st h JOIN opp_st o ON o.game_id = h.game_id
  JOIN season s ON s.player_id = o.opp_id GROUP BY 1
)
SELECT p.first_name || ' ' || p.last_name AS starter,
  COUNT(*) AS gs,
  ROUND(AVG(mine.runs)::numeric, 2) AS hou_runs_per_start,
  ROUND(STDDEV_SAMP(mine.runs)::numeric, 2) AS sd,
  ROUND((STDDEV_SAMP(mine.runs) / SQRT(COUNT(*)))::numeric, 2) AS se,
  ROUND(100.0 * COUNT(*) FILTER (WHERE mine.runs <= 2) / COUNT(*), 1) AS pct_starts_le2_support,
  ROUND(MAX(oe.opp_era)::numeric, 2) AS avg_opposing_starter_era
FROM hou_st h
JOIN tg mine ON mine.game_id = h.game_id AND mine.team = h.team
JOIN people p ON p.player_id = h.player_id
LEFT JOIN opp_era oe ON oe.player_id = h.player_id
GROUP BY 1 HAVING COUNT(*) >= 5 ORDER BY hou_runs_per_start`,
  },
  {
    slug: "12-offense-1986-vs-1987",
    title: "Houston's offense, 1986 vs 1987, in league context",
    note:
      "Houston's absolute scoring barely moved between 1986 and 1987; the National League's " +
      "did. The apparent collapse is mostly the 1987 league-wide offensive spike moving the " +
      "baseline underneath a static offense, which is why the NL rank falls four places on a " +
      "0.04 run change.",
    sql: `
WITH nl AS (${NL87}),
tg AS (
  SELECT bd.game_id, bd.team, EXTRACT(YEAR FROM bd.game_date)::int AS season, SUM(bd.runs) AS runs
  FROM batting_daily bd JOIN nl n ON n.team = bd.team
  WHERE bd.game_date BETWEEN '1986-01-01' AND '1987-12-31' GROUP BY 1, 2, 3
),
ryan AS (
  SELECT game_id FROM pitching_daily
  WHERE player_id = 'ryann001' AND games_started
    AND game_date BETWEEN '1986-01-01' AND '1987-12-31'
),
team_agg AS (SELECT season, team, AVG(runs) AS rpg FROM tg GROUP BY 1, 2),
ranked AS (SELECT season, team, rpg, RANK() OVER (PARTITION BY season ORDER BY rpg DESC) AS nl_rank FROM team_agg)
SELECT t.season,
  ROUND(AVG(t.runs) FILTER (WHERE t.team = 'HOU')::numeric, 2) AS hou_runs_per_game,
  MAX(rk.nl_rank) AS hou_nl_rank,
  ROUND(AVG(t.runs)::numeric, 2) AS nl_average,
  ROUND((AVG(t.runs) FILTER (WHERE t.team = 'HOU') - AVG(t.runs))::numeric, 2) AS hou_vs_league,
  ROUND(AVG(t.runs) FILTER (WHERE t.team = 'HOU' AND r.game_id IS NOT NULL)::numeric, 2) AS ryan_support,
  ROUND(AVG(t.runs) FILTER (WHERE t.team = 'HOU' AND r.game_id IS NULL)::numeric, 2) AS other_hou_starts
FROM tg t
LEFT JOIN ryan r ON r.game_id = t.game_id AND t.team = 'HOU'
LEFT JOIN ranked rk ON rk.season = t.season AND rk.team = 'HOU'
GROUP BY t.season ORDER BY t.season`,
  },
  {
    slug: "13-support-ryan-vs-rotation",
    title: "Run support: Ryan vs the rest of the rotation, with venue control",
    note:
      "The consolidated test. t_stat is a Welch two-sample t against the rest of the " +
      "rotation. Read the ALL row as the pre-specified comparison; the venue rows are a " +
      "post-hoc split prompted by the Astrodome's park effect, so their p-values deserve a " +
      "multiple-comparison discount.",
    sql: `
WITH ryan AS (
  SELECT game_id FROM pitching_daily
  WHERE player_id = 'ryann001' AND games_started
    AND game_date BETWEEN '1987-01-01' AND '1987-12-31'
), tg AS (
  SELECT bd.game_id, SUM(bd.runs) AS runs FROM batting_daily bd
  WHERE bd.team = 'HOU' AND bd.game_date BETWEEN '1987-01-01' AND '1987-12-31' GROUP BY 1
), g2 AS (
  SELECT tg.game_id, tg.runs, (r.game_id IS NOT NULL) AS is_ryan,
         CASE WHEN g.home_team = 'HOU' THEN 'Astrodome' ELSE 'Road' END AS venue
  FROM tg JOIN game g ON g.game_id = tg.game_id
  LEFT JOIN ryan r ON r.game_id = tg.game_id
), s AS (
  SELECT venue,
    COUNT(*) FILTER (WHERE is_ryan) AS n_r, AVG(runs) FILTER (WHERE is_ryan) AS m_r,
    VAR_SAMP(runs) FILTER (WHERE is_ryan) AS v_r,
    COUNT(*) FILTER (WHERE NOT is_ryan) AS n_o, AVG(runs) FILTER (WHERE NOT is_ryan) AS m_o,
    VAR_SAMP(runs) FILTER (WHERE NOT is_ryan) AS v_o,
    100.0 * COUNT(*) FILTER (WHERE is_ryan AND runs <= 1)
      / NULLIF(COUNT(*) FILTER (WHERE is_ryan), 0) AS pct_le1_r,
    100.0 * COUNT(*) FILTER (WHERE NOT is_ryan AND runs <= 1)
      / NULLIF(COUNT(*) FILTER (WHERE NOT is_ryan), 0) AS pct_le1_o
  FROM g2 GROUP BY venue
  UNION ALL
  SELECT 'ALL', COUNT(*) FILTER (WHERE is_ryan), AVG(runs) FILTER (WHERE is_ryan),
    VAR_SAMP(runs) FILTER (WHERE is_ryan), COUNT(*) FILTER (WHERE NOT is_ryan),
    AVG(runs) FILTER (WHERE NOT is_ryan), VAR_SAMP(runs) FILTER (WHERE NOT is_ryan),
    100.0 * COUNT(*) FILTER (WHERE is_ryan AND runs <= 1)
      / NULLIF(COUNT(*) FILTER (WHERE is_ryan), 0),
    100.0 * COUNT(*) FILTER (WHERE NOT is_ryan AND runs <= 1)
      / NULLIF(COUNT(*) FILTER (WHERE NOT is_ryan), 0)
  FROM g2
)
SELECT venue, n_r AS ryan_starts, ROUND(m_r::numeric, 2) AS ryan_support,
  n_o AS other_starts, ROUND(m_o::numeric, 2) AS others_support,
  ROUND((m_r - m_o)::numeric, 2) AS difference,
  ROUND((m_r - m_o)::numeric / NULLIF(SQRT(v_r / n_r + v_o / n_o)::numeric, 0), 2) AS t_stat,
  ROUND(pct_le1_r::numeric, 1) AS pct_ryan_starts_le1,
  ROUND(pct_le1_o::numeric, 1) AS pct_other_starts_le1
FROM s ORDER BY venue`,
  },
  {
    slug: "14-support-mechanism-checks",
    title: "Mechanism checks for the Astrodome run-support gap",
    note:
      "Three candidate explanations for why Houston scored less behind Ryan at home. A " +
      "personal catcher would change the lineup's bat; a tougher opposing starter would " +
      "suppress scoring; resting regulars on his start days would do both. Only the lineup " +
      "check shows any gap, and roughly 0.46 fewer regulars is worth on the order of 0.05 " +
      "runs a game — far short of the 1.65 it would need to explain.",
    sql: `
WITH ryan AS (
  SELECT game_id FROM pitching_daily
  WHERE player_id = 'ryann001' AND games_started
    AND game_date BETWEEN '1987-01-01' AND '1987-12-31'
), hou_g AS (
  SELECT g.game_id, CASE WHEN g.home_team = 'HOU' THEN 1 ELSE 0 END AS side,
         CASE WHEN g.home_team = 'HOU' THEN 'Astrodome' ELSE 'Road' END AS venue,
         (r.game_id IS NOT NULL) AS is_ryan
  FROM game g LEFT JOIN ryan r ON r.game_id = g.game_id
  WHERE (g.home_team = 'HOU' OR g.visitor_team = 'HOU')
    AND g.game_date BETWEEN '1987-01-01' AND '1987-12-31'
), lineups AS (
  SELECT ls.game_id, ls.player_id, ls.fielding_position
  FROM lineup_start ls JOIN hou_g h ON h.game_id = ls.game_id AND h.side = ls.side
  WHERE ls.fielding_position BETWEEN 2 AND 9
), regulars AS (
  SELECT player_id FROM lineups GROUP BY 1 ORDER BY COUNT(*) DESC LIMIT 8
), reg_per_game AS (
  SELECT l.game_id, COUNT(*) FILTER (WHERE r.player_id IS NOT NULL) AS n_regulars
  FROM lineups l LEFT JOIN regulars r ON r.player_id = l.player_id GROUP BY 1
), ashby AS (
  SELECT game_id, TRUE AS caught_by_ashby FROM lineups
  WHERE fielding_position = 2 AND player_id = 'ashba001'
), opp_st AS (
  SELECT pd.game_id, pd.player_id AS opp_id FROM pitching_daily pd
  WHERE pd.games_started AND pd.team <> 'HOU'
    AND pd.game_date BETWEEN '1987-01-01' AND '1987-12-31'
), season AS (
  SELECT player_id, SUM(outs) AS outs, SUM(earned_runs) AS er
  FROM pitching_daily WHERE game_date BETWEEN '1987-01-01' AND '1987-12-31'
  GROUP BY 1 HAVING SUM(outs) >= 150
), opp_era AS (
  SELECT o.game_id, 9.0 * s.er / (s.outs / 3.0) AS era
  FROM opp_st o JOIN season s ON s.player_id = o.opp_id
)
SELECT h.venue, CASE WHEN h.is_ryan THEN 'Ryan starts' ELSE 'Other HOU starts' END AS group_,
  COUNT(*) AS games,
  ROUND(AVG(rp.n_regulars)::numeric, 2) AS avg_regulars_in_lineup,
  ROUND((100.0 * COUNT(*) FILTER (WHERE a.caught_by_ashby)) / COUNT(*), 1) AS pct_caught_by_ashby,
  ROUND(AVG(oe.era)::numeric, 2) AS avg_opposing_starter_era
FROM hou_g h
LEFT JOIN reg_per_game rp ON rp.game_id = h.game_id
LEFT JOIN ashby a ON a.game_id = h.game_id
LEFT JOIN opp_era oe ON oe.game_id = h.game_id
GROUP BY 1, 2 ORDER BY 1, 2`,
  },
  {
    slug: "15-which-regulars-sat",
    title: "Which regulars sat out Ryan's Astrodome starts",
    note:
      "Start rate for each of Houston's eight regulars in Ryan's 17 home games versus the " +
      "other 64. The four biggest gaps are Reynolds, Hatcher, Walling and Cruz; three of " +
      "those four bat left-handed, which points at platooning rather than rest — see " +
      "analysis 16.",
    sql: `
WITH ryan AS (
  SELECT game_id FROM pitching_daily
  WHERE player_id = 'ryann001' AND games_started
    AND game_date BETWEEN '1987-01-01' AND '1987-12-31'
), hou_g AS (
  SELECT g.game_id, CASE WHEN g.home_team = 'HOU' THEN 1 ELSE 0 END AS side,
         (g.home_team = 'HOU') AS at_home, (r.game_id IS NOT NULL) AS is_ryan
  FROM game g LEFT JOIN ryan r ON r.game_id = g.game_id
  WHERE (g.home_team = 'HOU' OR g.visitor_team = 'HOU')
    AND g.game_date BETWEEN '1987-01-01' AND '1987-12-31'
), lineups AS (
  SELECT h.game_id, h.at_home, h.is_ryan, ls.player_id
  FROM hou_g h JOIN lineup_start ls ON ls.game_id = h.game_id AND ls.side = h.side
  WHERE ls.fielding_position BETWEEN 2 AND 9
), regulars AS (
  SELECT player_id, COUNT(*) AS total_starts FROM lineups GROUP BY 1 ORDER BY 2 DESC LIMIT 8
)
SELECT p.first_name || ' ' || p.last_name AS player, p.bats, reg.total_starts,
  COUNT(*) FILTER (WHERE l.at_home AND l.is_ryan) AS started_ryan_home,
  17 - COUNT(*) FILTER (WHERE l.at_home AND l.is_ryan) AS missed_ryan_home,
  ROUND(100.0 * COUNT(*) FILTER (WHERE l.at_home AND l.is_ryan) / 17, 1) AS pct_ryan_home,
  ROUND(100.0 * COUNT(*) FILTER (WHERE l.at_home AND NOT l.is_ryan) / 64, 1) AS pct_other_home,
  ROUND(100.0 * COUNT(*) FILTER (WHERE NOT l.at_home AND l.is_ryan) / 17, 1) AS pct_ryan_road
FROM regulars reg
JOIN lineups l ON l.player_id = reg.player_id
JOIN people p ON p.player_id = reg.player_id
GROUP BY 1, 2, 3
ORDER BY 100.0 * COUNT(*) FILTER (WHERE l.at_home AND NOT l.is_ryan) / 64
       - 100.0 * COUNT(*) FILTER (WHERE l.at_home AND l.is_ryan) / 17 DESC`,
  },
  {
    slug: "16-platoon-effect-astrodome",
    title: "Opposing-starter handedness and what the platoon shift was worth",
    note:
      "Ryan's Astrodome turns fell against left-handers 47% of the time against 28% for the " +
      "rest of the rotation, while on the road the mix is identical — which is why Houston's " +
      "left-handed platoon bats sat behind him at home. The second table prices it: with only " +
      "a 0.35-run home gap between facing LHP and RHP, a 19-point shift in mix buys about " +
      "0.07 runs a game, roughly 4% of the 1.65-run shortfall.",
    sql: `
WITH ryan AS (
  SELECT game_id FROM pitching_daily
  WHERE player_id = 'ryann001' AND games_started
    AND game_date BETWEEN '1987-01-01' AND '1987-12-31'
), opp_st AS (
  SELECT pd.game_id, pd.player_id AS opp_id FROM pitching_daily pd
  WHERE pd.games_started AND pd.team <> 'HOU'
    AND pd.game_date BETWEEN '1987-01-01' AND '1987-12-31'
), tg AS (
  SELECT bd.game_id, SUM(bd.runs) AS runs FROM batting_daily bd
  WHERE bd.team = 'HOU' AND bd.game_date BETWEEN '1987-01-01' AND '1987-12-31' GROUP BY 1
), j AS (
  SELECT g.game_id, (g.home_team = 'HOU') AS at_home, (r.game_id IS NOT NULL) AS is_ryan,
         p.throws, tg.runs
  FROM game g
  JOIN tg ON tg.game_id = g.game_id
  JOIN opp_st o ON o.game_id = g.game_id
  JOIN people p ON p.player_id = o.opp_id
  LEFT JOIN ryan r ON r.game_id = g.game_id
  WHERE (g.home_team = 'HOU' OR g.visitor_team = 'HOU')
    AND g.game_date BETWEEN '1987-01-01' AND '1987-12-31'
)
SELECT CASE WHEN at_home THEN 'Astrodome' ELSE 'Road' END AS venue,
  CASE WHEN is_ryan THEN 'Ryan starts' ELSE 'Other HOU starts' END AS group_,
  COUNT(*) AS games,
  COUNT(*) FILTER (WHERE throws = 'L') AS vs_lhp,
  ROUND(100.0 * COUNT(*) FILTER (WHERE throws = 'L') / COUNT(*), 1) AS pct_vs_lhp,
  ROUND(AVG(runs) FILTER (WHERE throws = 'L')::numeric, 2) AS hou_runs_vs_lhp,
  ROUND(AVG(runs) FILTER (WHERE throws = 'R')::numeric, 2) AS hou_runs_vs_rhp
FROM j GROUP BY 1, 2 ORDER BY 1, 2`,
  },
  {
    slug: "17-where-the-home-gap-lives",
    title: "Where the Astrodome shortfall actually lives, by opposing hand",
    note:
      "The test that refutes the platoon explanation. If sitting left-handed bats against " +
      "left-handers caused the home shortfall, the gap would sit in the LHP row. It does not: " +
      "against left-handers Houston was only 0.78 runs light (t = -0.71, not significant), " +
      "while against right-handers — with the regular lineup intact and no platooning in " +
      "play — they were 2.30 runs light (t = -2.54). The shortfall is concentrated exactly " +
      "where the lineup was strongest.",
    sql: `
WITH ryan AS (
  SELECT game_id FROM pitching_daily
  WHERE player_id = 'ryann001' AND games_started
    AND game_date BETWEEN '1987-01-01' AND '1987-12-31'
), opp_st AS (
  SELECT pd.game_id, pd.player_id AS opp_id FROM pitching_daily pd
  WHERE pd.games_started AND pd.team <> 'HOU'
    AND pd.game_date BETWEEN '1987-01-01' AND '1987-12-31'
), tg AS (
  SELECT bd.game_id, SUM(bd.runs) AS runs FROM batting_daily bd
  WHERE bd.team = 'HOU' AND bd.game_date BETWEEN '1987-01-01' AND '1987-12-31' GROUP BY 1
), j AS (
  SELECT g.game_id, (g.home_team = 'HOU') AS at_home, (r.game_id IS NOT NULL) AS is_ryan,
         p.throws, tg.runs
  FROM game g
  JOIN tg ON tg.game_id = g.game_id
  JOIN opp_st o ON o.game_id = g.game_id
  JOIN people p ON p.player_id = o.opp_id
  LEFT JOIN ryan r ON r.game_id = g.game_id
  WHERE (g.home_team = 'HOU' OR g.visitor_team = 'HOU')
    AND g.game_date BETWEEN '1987-01-01' AND '1987-12-31'
)
SELECT throws AS opposing_hand,
  COUNT(*) FILTER (WHERE is_ryan) AS ryan_games,
  ROUND(AVG(runs) FILTER (WHERE is_ryan)::numeric, 2) AS ryan_support,
  COUNT(*) FILTER (WHERE NOT is_ryan) AS other_games,
  ROUND(AVG(runs) FILTER (WHERE NOT is_ryan)::numeric, 2) AS others_support,
  ROUND((AVG(runs) FILTER (WHERE is_ryan)
       - AVG(runs) FILTER (WHERE NOT is_ryan))::numeric, 2) AS difference,
  ROUND(((AVG(runs) FILTER (WHERE is_ryan) - AVG(runs) FILTER (WHERE NOT is_ryan))
    / NULLIF(SQRT(VAR_SAMP(runs) FILTER (WHERE is_ryan) / COUNT(*) FILTER (WHERE is_ryan)
           + VAR_SAMP(runs) FILTER (WHERE NOT is_ryan)
             / COUNT(*) FILTER (WHERE NOT is_ryan)), 0))::numeric, 2) AS t_stat
FROM j WHERE at_home GROUP BY 1 ORDER BY 1`,
  },
];
