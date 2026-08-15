# Mechanism checks for the Astrodome run-support gap

_Generated 2026-08-15 from `plex:5432/retrosheet` by `npm run research:ryan1987`. Do not edit by hand._

> Three candidate explanations for why Houston scored less behind Ryan at home. A personal catcher would change the lineup's bat; a tougher opposing starter would suppress scoring; resting regulars on his start days would do both. Only the lineup check shows any gap, and roughly 0.46 fewer regulars is worth on the order of 0.05 runs a game — far short of the 1.65 it would need to explain.

| venue | group_ | games | avg_regulars_in_lineup | pct_caught_by_ashby | avg_opposing_starter_era |
| --- | --- | --- | --- | --- | --- |
| Astrodome | Other HOU starts | 64 | 6.22 | 67.2 | 4.23 |
| Astrodome | Ryan starts | 17 | 5.76 | 70.6 | 4.26 |
| Road | Other HOU starts | 64 | 6.13 | 62.5 | 4.15 |
| Road | Ryan starts | 17 | 6.18 | 58.8 | 4.31 |


<details><summary>SQL</summary>

```sql
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
    AND (g.game_type IS NULL OR g.game_type = 'regular')
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
GROUP BY 1, 2 ORDER BY 1, 2
```

</details>
