# Ryan workload by season (starts only)

_Generated 2026-08-15 from `plex:5432/retrosheet` by `npm run research:ryan1987`. Do not edit by hand._

> Batters faced per start is the workload proxy. Pitch counts are not usable: Retrosheet pitch sequences only begin in 1988, and a pitch estimator calibrated on 1988-93 cannot be back-applied across the enormous 1972-76 Angels workloads or the changeup Ryan added in 1981, both of which move pitches-per-PA.

| season | gs | bf_in_starts | bf_per_start | ip_per_start | w | l | era |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1993 | 13 | 290 | 22.31 | 5.10 | 5 | 5 | 4.88 |
| 1969 | 10 | 238 | 23.80 | 5.67 | 7 | 3 | 3.38 |
| 1986 | 32 | 780 | 24.38 | 6.00 | 12 | 9 | 3.38 |
| 1992 | 27 | 674 | 24.96 | 5.83 | 5 | 9 | 3.72 |
| 1991 | 27 | 682 | 25.26 | 6.41 | 12 | 6 | 2.91 |
| 1984 | 30 | 760 | 25.33 | 6.12 | 12 | 11 | 3.04 |
| 1987 | 34 | 873 | 25.68 | 6.22 | 8 | 16 | 2.77 |
| 1971 | 26 | 681 | 26.19 | 5.67 | 10 | 14 | 3.97 |
| 1979 | 36 | 976 | 27.11 | 6.44 | 16 | 14 | 3.61 |
| 1990 | 30 | 818 | 27.27 | 6.80 | 13 | 9 | 3.44 |
| 1983 | 29 | 804 | 27.72 | 6.77 | 14 | 9 | 2.98 |
| 1980 | 37 | 1037 | 28.03 | 6.68 | 11 | 10 | 3.46 |
| 1970 | 19 | 533 | 28.05 | 6.49 | 7 | 11 | 3.42 |
| 1985 | 35 | 983 | 28.09 | 6.63 | 10 | 12 | 3.75 |
| 1988 | 33 | 930 | 28.18 | 6.69 | 12 | 11 | 3.51 |
| 1981 | 23 | 661 | 28.74 | 7.14 | 12 | 6 | 1.69 |
| 1968 | 18 | 520 | 28.89 | 6.98 | 6 | 9 | 3.09 |
| 1972 | 39 | 1154 | 29.59 | 7.28 | 19 | 16 | 2.28 |
| 1982 | 35 | 1050 | 30.00 | 7.15 | 16 | 12 | 3.16 |
| 1976 | 39 | 1195 | 30.64 | 7.29 | 17 | 18 | 3.36 |
| 1975 | 28 | 863 | 30.82 | 7.07 | 14 | 12 | 3.45 |
| 1989 | 32 | 988 | 30.88 | 7.48 | 17 | 10 | 3.17 |
| 1978 | 31 | 1008 | 32.52 | 7.58 | 10 | 13 | 3.71 |
| 1974 | 41 | 1384 | 33.76 | 8.08 | 22 | 16 | 2.89 |
| 1977 | 37 | 1272 | 34.38 | 8.09 | 19 | 16 | 2.77 |
| 1973 | 39 | 1344 | 34.46 | 8.32 | 21 | 16 | 2.90 |


<details><summary>SQL</summary>

```sql
SELECT EXTRACT(YEAR FROM game_date)::int AS season,
       COUNT(*) FILTER (WHERE games_started) AS gs,
       SUM(batters_faced) FILTER (WHERE games_started) AS bf_in_starts,
       ROUND(SUM(batters_faced) FILTER (WHERE games_started)::numeric
             / NULLIF(COUNT(*) FILTER (WHERE games_started), 0), 2) AS bf_per_start,
       ROUND(SUM(outs) FILTER (WHERE games_started)::numeric / 3.0
             / NULLIF(COUNT(*) FILTER (WHERE games_started), 0), 2) AS ip_per_start,
       COUNT(*) FILTER (WHERE won) AS w,
       COUNT(*) FILTER (WHERE lost) AS l,
       ROUND(9.0 * SUM(earned_runs) / NULLIF(SUM(outs) / 3.0, 0), 2) AS era
FROM pitching_daily
WHERE player_id = 'ryann001'
GROUP BY 1
HAVING COUNT(*) FILTER (WHERE games_started) >= 10
ORDER BY bf_per_start
```

</details>
