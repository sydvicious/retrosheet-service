# Run support by Houston starter, with opposing-starter quality

_Generated 2026-08-15 by `npm run research:ryan1987`. Do not edit by hand._

> Ryan got the least support of the five Houston starters. The last column tests the one mechanism that would make that systematic rather than luck — an ace drawing the other team's ace — by averaging the season ERA of the opposing starter (150+ outs required to qualify). Higher ERA means weaker opposition. Compare the spread of the support column against se: if the five means scatter no more than sampling error predicts, there is no real difference to explain.

| starter | gs | hou_runs_per_start | sd | se | pct_starts_le2_support | avg_opposing_starter_era |
| --- | --- | --- | --- | --- | --- | --- |
| Lynn Nolan Ryan | 34 | 3.35 | 2.74 | 0.47 | 47.1 | 4.28 |
| Michael Warren Scott | 36 | 3.75 | 2.87 | 0.48 | 36.1 | 4.23 |
| Robert Wesley Knepper | 31 | 4.19 | 2.59 | 0.46 | 35.5 | 4.11 |
| Danny Wayne Darwin | 30 | 4.47 | 2.86 | 0.52 | 30.0 | 4.19 |
| James Joseph Deshaies | 25 | 4.64 | 2.78 | 0.56 | 24.0 | 4.28 |


<details><summary>SQL</summary>

```sql
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
GROUP BY 1 HAVING COUNT(*) >= 5 ORDER BY hou_runs_per_start
```

</details>
