# Runs charged to Ryan in 1987 that his relievers actually allowed

_Generated 2026-08-15 from `plex:5432/retrosheet` by `npm run research:ryan1987`. Do not edit by hand._

> Identifies runners on base when Ryan left each start, then follows those exact runner ids through the remaining plays of that half-inning to see whether they scored. Where charged_er exceeds runs_during, the difference is an inherited runner the bullpen let in that still counts against Ryan's ERA.

| game_date | bf | ip | runs_during | runners_left_on | pen_scored_his_runners | charged_r | charged_er |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1987-04-08 | 30 | 7.0 | 3 | 1 | 0 | 3 | 3 |
| 1987-04-13 | 27 | 6.0 | 3 | 1 | 0 | 3 | 3 |
| 1987-04-18 | 16 | 4.7 | 1 | 1 | 0 | 1 | 1 |
| 1987-04-25 | 29 | 8.0 | 0 | 2 | 0 | 0 | 0 |
| 1987-05-01 | 26 | 6.7 | 2 | 2 | 0 | 2 | 1 |
| 1987-05-06 | 24 | 5.7 | 2 | 1 | 0 | 2 | 2 |
| 1987-05-11 | 26 | 7.0 | 3 | 0 | 0 | 3 | 2 |
| 1987-05-16 | 25 | 6.0 | 2 | 0 | 0 | 2 | 2 |
| 1987-05-22 | 31 | 6.7 | 2 | 3 | 1 | 2 | 3 |
| 1987-05-27 | 23 | 6.0 | 2 | 0 | 0 | 2 | 2 |
| 1987-06-02 | 13 | 2.0 | 4 | 1 | 1 | 4 | 5 |
| 1987-06-07 | 25 | 7.0 | 0 | 1 | 0 | 0 | 0 |
| 1987-06-12 | 27 | 7.7 | 1 | 1 | 0 | 1 | 0 |
| 1987-06-17 | 24 | 5.0 | 3 | 2 | 0 | 3 | 3 |
| 1987-06-23 | 24 | 6.0 | 4 | 0 | 0 | 4 | 3 |
| 1987-06-28 | 28 | 5.0 | 8 | 0 | 0 | 8 | 6 |
| 1987-07-03 | 31 | 7.0 | 2 | 0 | 0 | 2 | 2 |
| 1987-07-08 | 28 | 7.0 | 1 | 1 | 0 | 1 | 1 |
| 1987-07-19 | 13 | 2.3 | 1 | 2 | 1 | 1 | 1 |
| 1987-07-24 | 22 | 5.0 | 2 | 2 | 0 | 2 | 2 |
| 1987-07-29 | 26 | 5.3 | 3 | 3 | 1 | 3 | 1 |
| 1987-08-03 | 27 | 7.0 | 3 | 0 | 0 | 3 | 2 |
| 1987-08-08 | 22 | 6.0 | 1 | 0 | 0 | 1 | 1 |
| 1987-08-13 | 26 | 6.3 | 3 | 1 | 1 | 3 | 3 |
| 1987-08-18 | 26 | 7.0 | 0 | 1 | 0 | 0 | 0 |
| 1987-08-23 | 19 | 5.3 | 0 | 1 | 1 | 0 | 1 |
| 1987-08-29 | 27 | 6.0 | 2 | 2 | 0 | 2 | 2 |
| 1987-09-04 | 26 | 7.0 | 0 | 2 | 0 | 0 | 0 |
| 1987-09-09 | 33 | 8.0 | 2 | 0 | 0 | 2 | 2 |
| 1987-09-14 | 30 | 6.7 | 1 | 2 | 0 | 1 | 1 |
| 1987-09-19 | 33 | 9.0 | 1 | 0 | 0 | 1 | 1 |
| 1987-09-24 | 29 | 6.0 | 3 | 1 | 0 | 3 | 3 |
| 1987-09-29 | 28 | 7.0 | 4 | 1 | 0 | 4 | 4 |
| 1987-10-04 | 29 | 7.0 | 2 | 2 | 0 | 2 | 2 |


<details><summary>SQL</summary>

```sql
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
ORDER BY st.game_date
```

</details>
