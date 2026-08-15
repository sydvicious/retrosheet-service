# Where the Astrodome shortfall actually lives, by opposing hand

_Generated 2026-08-15 from `plex:5432/retrosheet` by `npm run research:ryan1987`. Do not edit by hand._

> The test that refutes the platoon explanation. If sitting left-handed bats against left-handers caused the home shortfall, the gap would sit in the LHP row. It does not: against left-handers Houston was only 0.78 runs light (t = -0.71, not significant), while against right-handers — with the regular lineup intact and no platooning in play — they were 2.30 runs light (t = -2.54). The shortfall is concentrated exactly where the lineup was strongest.

| opposing_hand | ryan_games | ryan_support | other_games | others_support | difference | t_stat |
| --- | --- | --- | --- | --- | --- | --- |
| L | 8 | 3.50 | 18 | 4.28 | -0.78 | -0.71 |
| R | 9 | 2.33 | 46 | 4.63 | -2.30 | -2.54 |


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
    AND (g.game_type IS NULL OR g.game_type = 'regular')
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
FROM j WHERE at_home GROUP BY 1 ORDER BY 1
```

</details>
