# 1987 NL run environment by host park

_Generated 2026-08-15 by `npm run research:ryan1987`. Do not edit by hand._

> Combined runs per game by home park, establishing the Astrodome's severity.

| host_park | games | combined_runs_per_game |
| --- | --- | --- |
| LAN | 81 | 7.31 |
| HOU | 81 | 7.54 |
| SFN | 84 | 8.52 |
| SDN | 81 | 8.77 |
| SLN | 85 | 8.85 |
| NYN | 81 | 9.26 |
| PHI | 81 | 9.41 |
| PIT | 81 | 9.48 |
| MON | 81 | 9.63 |
| CHN | 80 | 9.79 |
| CIN | 81 | 9.93 |
| ATL | 81 | 10.85 |


<details><summary>SQL</summary>

```sql
WITH nl87 AS (SELECT unnest(ARRAY['ATL','CHN','CIN','HOU','LAN','MON','NYN','PHI','PIT','SDN','SFN','SLN']) AS team),
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
FROM gt WHERE sides = 2 GROUP BY 1 ORDER BY 3
```

</details>
