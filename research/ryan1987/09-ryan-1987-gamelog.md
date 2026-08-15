# Ryan 1987 start-by-start log with bullpen aftermath

_Generated 2026-08-15 from `plex:5432/retrosheet` by `npm run research:ryan1987`. Do not edit by hand._

> pen_ip includes extra innings, so it can exceed the innings Ryan left behind.

| game_date | opponent | bf | ip | r | er | so | bb | pen_ip | pen_runs | decision |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1987-04-08 | vs LAN | 30 | 7.0 | 3 | 3 | 10 | 1 | 2.0 | 0 | W |
| 1987-04-13 | at LAN | 27 | 6.0 | 3 | 3 | 9 | 5 | 2.0 | 1 | L |
| 1987-04-18 | at CIN | 16 | 4.7 | 1 | 1 | 6 | 2 | 3.3 | 7 | L |
| 1987-04-25 | vs CIN | 29 | 8.0 | 0 | 0 | 11 | 2 | 2.0 | 3 | - |
| 1987-05-01 | at ATL | 26 | 6.7 | 2 | 1 | 4 | 3 | 2.3 | 2 | W |
| 1987-05-06 | at PHI | 24 | 5.7 | 2 | 2 | 7 | 3 | 3.0 | 0 | - |
| 1987-05-11 | vs PHI | 26 | 7.0 | 3 | 2 | 7 | 0 | 2.0 | 4 | - |
| 1987-05-16 | vs CHN | 25 | 6.0 | 2 | 2 | 9 | 2 | 3.0 | 0 | L |
| 1987-05-22 | vs SLN | 31 | 6.7 | 2 | 3 | 11 | 6 | 2.3 | 5 | L |
| 1987-05-27 | vs PIT | 23 | 6.0 | 2 | 2 | 7 | 3 | 3.0 | 0 | - |
| 1987-06-02 | at CHN | 13 | 2.0 | 4 | 5 | 3 | 1 | 6.0 | 9 | L |
| 1987-06-07 | vs SFN | 25 | 7.0 | 0 | 0 | 12 | 0 | 2.0 | 0 | W |
| 1987-06-12 | at LAN | 27 | 7.7 | 1 | 0 | 11 | 0 | 1.3 | 0 | W |
| 1987-06-17 | vs CIN | 24 | 5.0 | 3 | 3 | 2 | 2 | 4.0 | 6 | L |
| 1987-06-23 | at SDN | 24 | 6.0 | 4 | 3 | 4 | 2 | 2.0 | 0 | L |
| 1987-06-28 | at SFN | 28 | 5.0 | 8 | 6 | 11 | 3 | 3.0 | 0 | L |
| 1987-07-03 | at PHI | 31 | 7.0 | 2 | 2 | 10 | 3 | 1.0 | 0 | L |
| 1987-07-08 | vs MON | 28 | 7.0 | 1 | 1 | 9 | 3 | 2.0 | 0 | L |
| 1987-07-19 | vs PHI | 13 | 2.3 | 1 | 1 | 3 | 4 | 6.7 | 4 | L |
| 1987-07-24 | at NYN | 22 | 5.0 | 2 | 2 | 2 | 4 | 3.0 | 3 | L |
| 1987-07-29 | at ATL | 26 | 5.3 | 3 | 1 | 5 | 4 | 2.7 | 2 | L |
| 1987-08-03 | vs SFN | 27 | 7.0 | 3 | 2 | 12 | 1 | 6.0 | 0 | - |
| 1987-08-08 | at SDN | 22 | 6.0 | 1 | 1 | 6 | 1 | 3.3 | 3 | - |
| 1987-08-13 | at SFN | 26 | 6.3 | 3 | 3 | 10 | 2 | 4.3 | 4 | - |
| 1987-08-18 | vs SLN | 26 | 7.0 | 0 | 0 | 9 | 2 | 2.0 | 0 | W |
| 1987-08-23 | at CHN | 19 | 5.3 | 0 | 1 | 7 | 1 | 3.7 | 2 | - |
| 1987-08-29 | at PIT | 27 | 6.0 | 2 | 2 | 7 | 6 | 2.0 | 6 | L |
| 1987-09-04 | vs PIT | 26 | 7.0 | 0 | 0 | 6 | 5 | 2.0 | 0 | W |
| 1987-09-09 | vs SFN | 33 | 8.0 | 2 | 2 | 16 | 2 | 1.0 | 0 | W |
| 1987-09-14 | at LAN | 30 | 6.7 | 1 | 1 | 9 | 2 | 2.3 | 0 | W |
| 1987-09-19 | vs SDN | 33 | 9.0 | 1 | 1 | 11 | 1 | 5.0 | 1 | - |
| 1987-09-24 | at ATL | 29 | 6.0 | 3 | 3 | 5 | 7 | 2.7 | 6 | - |
| 1987-09-29 | vs LAN | 28 | 7.0 | 4 | 4 | 9 | 3 | 2.0 | 2 | L |
| 1987-10-04 | vs CIN | 29 | 7.0 | 2 | 2 | 10 | 1 | 2.0 | 0 | L |


<details><summary>SQL</summary>

```sql
WITH reg AS (SELECT game_id FROM game WHERE game_type IS NULL OR game_type = 'regular'), starts AS (
  SELECT pd.game_id, pd.game_date, pd.team, pd.outs, pd.batters_faced,
         pd.runs, pd.earned_runs, pd.strikeouts, pd.walks, pd.won, pd.lost
  FROM pitching_daily pd JOIN reg ON reg.game_id = pd.game_id
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
ORDER BY s.game_date
```

</details>
