# Workload conditional on pitching well

_Generated 2026-08-15 from `plex:5432/retrosheet` by `npm run research:ryan1987`. Do not edit by hand._

> Raw BF/start conflates 'pulled while cruising' with 'knocked out'. This restricts to starts where Ryan allowed <= 2 runs, and counts how often he was removed before facing 27 batters (i.e. before a third time through the order) despite pitching well.

| season | gs | bf_per_start_all | starts_le2r | bf_per_start_le2r | ip_per_start_le2r | cruising_pulled_early | pct_cruising_pulled_early |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1968 | 18 | 28.89 | 11 | 28.91 | 7.48 | 3 | 27.3 |
| 1969 | 10 | 23.80 | 5 | 25.80 | 6.53 | 3 | 60.0 |
| 1970 | 19 | 28.05 | 11 | 29.82 | 7.27 | 3 | 27.3 |
| 1971 | 26 | 26.19 | 14 | 29.36 | 6.86 | 4 | 28.6 |
| 1972 | 39 | 29.59 | 28 | 31.04 | 7.90 | 5 | 17.9 |
| 1973 | 39 | 34.46 | 23 | 34.78 | 8.77 | 1 | 4.3 |
| 1974 | 41 | 33.76 | 21 | 34.52 | 8.81 | 1 | 4.8 |
| 1975 | 28 | 30.82 | 13 | 30.38 | 7.87 | 2 | 15.4 |
| 1976 | 39 | 30.64 | 18 | 30.00 | 7.81 | 4 | 22.2 |
| 1977 | 37 | 34.38 | 16 | 32.81 | 8.33 | 3 | 18.8 |
| 1978 | 31 | 32.52 | 11 | 32.45 | 8.42 | 2 | 18.2 |
| 1979 | 36 | 27.11 | 17 | 28.41 | 7.43 | 4 | 23.5 |
| 1980 | 37 | 28.03 | 17 | 28.94 | 7.33 | 4 | 23.5 |
| 1981 | 23 | 28.74 | 16 | 28.63 | 7.50 | 4 | 25.0 |
| 1982 | 35 | 30.00 | 18 | 30.67 | 7.74 | 4 | 22.2 |
| 1983 | 29 | 27.72 | 16 | 28.19 | 7.44 | 3 | 18.8 |
| 1984 | 30 | 25.33 | 15 | 25.13 | 6.47 | 6 | 40.0 |
| 1985 | 35 | 28.09 | 14 | 26.29 | 6.74 | 6 | 42.9 |
| 1986 | 32 | 24.38 | 19 | 24.37 | 6.46 | 12 | 63.2 |
| 1987 | 34 | 25.68 | 22 | 25.68 | 6.44 | 12 | 54.5 |
| 1988 | 33 | 28.18 | 16 | 27.63 | 7.21 | 4 | 25.0 |
| 1989 | 32 | 30.88 | 15 | 30.47 | 8.02 | 1 | 6.7 |
| 1990 | 30 | 27.27 | 14 | 27.29 | 7.52 | 4 | 28.6 |
| 1991 | 27 | 25.26 | 15 | 24.87 | 6.67 | 8 | 53.3 |
| 1992 | 27 | 24.96 | 15 | 25.87 | 6.51 | 6 | 40.0 |
| 1993 | 13 | 22.31 | 6 | 24.17 | 6.44 | 5 | 83.3 |


<details><summary>SQL</summary>

```sql
WITH s AS (
  SELECT EXTRACT(YEAR FROM game_date)::int AS season, batters_faced, runs, outs
  FROM pitching_daily WHERE player_id = 'ryann001' AND games_started
)
SELECT season,
  COUNT(*) AS gs,
  ROUND(AVG(batters_faced), 2) AS bf_per_start_all,
  COUNT(*) FILTER (WHERE runs <= 2) AS starts_le2r,
  ROUND(AVG(batters_faced) FILTER (WHERE runs <= 2), 2) AS bf_per_start_le2r,
  ROUND(AVG(outs / 3.0) FILTER (WHERE runs <= 2), 2) AS ip_per_start_le2r,
  COUNT(*) FILTER (WHERE runs <= 2 AND batters_faced < 27) AS cruising_pulled_early,
  ROUND(100.0 * COUNT(*) FILTER (WHERE runs <= 2 AND batters_faced < 27)
        / NULLIF(COUNT(*) FILTER (WHERE runs <= 2), 0), 1) AS pct_cruising_pulled_early
FROM s GROUP BY season HAVING COUNT(*) >= 10 ORDER BY season
```

</details>
