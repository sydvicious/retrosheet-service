# Run support: Ryan vs the rest of the rotation, with venue control

_Generated 2026-08-15 by `npm run research:ryan1987`. Do not edit by hand._

> The consolidated test. t_stat is a Welch two-sample t against the rest of the rotation. Read the ALL row as the pre-specified comparison; the venue rows are a post-hoc split prompted by the Astrodome's park effect, so their p-values deserve a multiple-comparison discount.

| venue | ryan_starts | ryan_support | other_starts | others_support | difference | t_stat | pct_ryan_starts_le1 | pct_other_starts_le1 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ALL | 34 | 3.35 | 128 | 4.22 | -0.87 | -1.63 | 32.4 | 17.2 |
| Astrodome | 17 | 2.88 | 64 | 4.53 | -1.65 | -2.43 | 47.1 | 10.9 |
| Road | 17 | 3.82 | 64 | 3.91 | -0.08 | -0.10 | 17.6 | 23.4 |


<details><summary>SQL</summary>

```sql
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
FROM s ORDER BY venue
```

</details>
