# Run support behind Ryan, split by venue

_Generated 2026-08-15 from `plex:5432/retrosheet` by `npm run research:ryan1987`. Do not edit by hand._

> The Astrodome was a severe pitcher's park, so raw run support must not be compared to the NL average. The controlled comparison is Houston's own scoring in Ryan's starts versus its other games at the same venue. Note the split leaves only 17 games per cell.

| venue | ryan_starts | hou_runs_ryan_starts | other_games | hou_runs_other_starts |
| --- | --- | --- | --- | --- |
| Astrodome | 17 | 2.88 | 64 | 4.53 |
| Road | 17 | 3.82 | 64 | 3.91 |
| TOTAL | 34 | 3.35 | 128 | 4.22 |


<details><summary>SQL</summary>

```sql
WITH nl87 AS (SELECT unnest(ARRAY['ATL','CHN','CIN','HOU','LAN','MON','NYN','PHI','PIT','SDN','SFN','SLN']) AS team),
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
FROM hou
```

</details>
