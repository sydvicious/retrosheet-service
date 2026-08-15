# Run support by decision — separating the bullpen from the offense

_Generated 2026-08-15 by `npm run research:ryan1987`. Do not edit by hand._

> The decisive split. All four of Ryan's blown leads became no-decisions rather than losses, so the bullpen cannot account for any of his 16 defeats; it only denied him wins. The loss column belongs to the offense.

| decision | games | avg_ip | avg_runs_ryan_allowed | avg_hou_runs_scored | games_ryan_allowed_le2 | games_hou_scored_le2 |
| --- | --- | --- | --- | --- | --- | --- |
| Loss | 16 | 5.50 | 2.75 | 1.69 | 9 | 13 |
| No decision | 10 | 6.63 | 1.80 | 4.20 | 6 | 2 |
| Win | 8 | 7.13 | 1.13 | 5.63 | 7 | 1 |


<details><summary>SQL</summary>

```sql
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
GROUP BY 1 ORDER BY 1
```

</details>
