# Opposing-starter handedness and what the platoon shift was worth

_Generated 2026-08-15 by `npm run research:ryan1987`. Do not edit by hand._

> Ryan's Astrodome turns fell against left-handers 47% of the time against 28% for the rest of the rotation, while on the road the mix is identical — which is why Houston's left-handed platoon bats sat behind him at home. The second table prices it: with only a 0.35-run home gap between facing LHP and RHP, a 19-point shift in mix buys about 0.07 runs a game, roughly 4% of the 1.65-run shortfall.

| venue | group_ | games | vs_lhp | pct_vs_lhp | hou_runs_vs_lhp | hou_runs_vs_rhp |
| --- | --- | --- | --- | --- | --- | --- |
| Astrodome | Other HOU starts | 64 | 18 | 28.1 | 4.28 | 4.63 |
| Astrodome | Ryan starts | 17 | 8 | 47.1 | 3.50 | 2.33 |
| Road | Other HOU starts | 64 | 23 | 35.9 | 3.26 | 4.27 |
| Road | Ryan starts | 17 | 6 | 35.3 | 2.33 | 4.64 |


<details><summary>SQL</summary>

```sql
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
FROM j GROUP BY 1, 2 ORDER BY 1, 2
```

</details>
