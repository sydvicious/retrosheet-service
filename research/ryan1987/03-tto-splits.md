# First 18 batters faced vs rest of start, by season

_Generated 2026-08-15 from `plex:5432/retrosheet` by `npm run research:ryan1987`. Do not edit by hand._

> bf_idx counts completed plate appearances; runs/outs from baserunning-only plays (wild pitches, steals) are attributed to the batter at the plate rather than dropped. ERA columns are RA/9 scaled by the season's charged-ER/runs ratio. Because that ratio is a constant per season, it cannot create or hide a first-18-vs-rest gap; it only puts the numbers on a familiar scale. era_full reproduces Ryan's published season ERA to within ~0.02 as a check.

| season | gs | ip_first18 | runs_first18 | era_first18 | ip_after18 | runs_after18 | era_after18 | era_full | pct_ip_after18 | third_time_penalty |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1968 | 18 | 80.3 | 18 | 2.16 | 45.3 | 21 | 4.46 | 2.99 | 36.1 | 2.30 |
| 1969 | 10 | 40.7 | 14 | 3.02 | 16.0 | 12 | 6.57 | 4.02 | 28.2 | 3.56 |
| 1970 | 19 | 78.7 | 29 | 2.81 | 44.7 | 22 | 3.76 | 3.15 | 36.2 | 0.94 |
| 1971 | 26 | 92.7 | 35 | 3.12 | 54.7 | 32 | 4.84 | 3.76 | 37.1 | 1.72 |
| 1972 | 39 | 166.3 | 49 | 2.55 | 117.7 | 26 | 1.91 | 2.28 | 41.4 | -0.64 |
| 1973 | 39 | 168.7 | 48 | 2.45 | 155.7 | 58 | 3.20 | 2.81 | 48.0 | 0.76 |
| 1974 | 41 | 169.7 | 59 | 2.86 | 161.7 | 56 | 2.85 | 2.86 | 48.8 | -0.01 |
| 1975 | 28 | 114.7 | 40 | 2.91 | 83.3 | 42 | 4.20 | 3.45 | 42.1 | 1.29 |
| 1976 | 39 | 158.0 | 59 | 3.36 | 126.3 | 47 | 3.35 | 3.36 | 44.4 | -0.01 |
| 1977 | 37 | 154.3 | 62 | 3.14 | 145.0 | 44 | 2.37 | 2.77 | 48.4 | -0.77 |
| 1978 | 31 | 129.7 | 50 | 3.37 | 105.3 | 50 | 4.14 | 3.71 | 44.8 | 0.78 |
| 1979 | 34 | 134.0 | 56 | 3.61 | 88.7 | 35 | 3.41 | 3.53 | 39.8 | -0.20 |
| 1980 | 35 | 152.0 | 57 | 3.21 | 82.0 | 38 | 3.96 | 3.47 | 35.0 | 0.76 |
| 1981 | 21 | 93.7 | 26 | 2.15 | 55.3 | 6 | 0.84 | 1.66 | 37.1 | -1.31 |
| 1982 | 35 | 150.0 | 56 | 3.11 | 100.3 | 39 | 3.24 | 3.16 | 40.1 | 0.13 |
| 1983 | 29 | 131.0 | 32 | 2.10 | 65.3 | 36 | 4.74 | 2.98 | 33.3 | 2.64 |
| 1984 | 30 | 120.7 | 52 | 3.12 | 63.0 | 25 | 2.88 | 3.04 | 34.3 | -0.25 |
| 1985 | 35 | 148.3 | 49 | 2.80 | 83.7 | 55 | 5.58 | 3.80 | 36.1 | 2.77 |
| 1986 | 30 | 128.0 | 43 | 3.07 | 50.0 | 22 | 4.02 | 3.33 | 28.1 | 0.95 |
| 1987 | 34 | 147.7 | 46 | 2.57 | 63.7 | 25 | 3.24 | 2.77 | 30.1 | 0.67 |
| 1988 | 33 | 140.7 | 56 | 3.14 | 80.0 | 42 | 4.15 | 3.51 | 36.3 | 1.00 |
| 1989 | 32 | 141.3 | 49 | 2.98 | 98.0 | 40 | 3.51 | 3.20 | 40.9 | 0.53 |
| 1990 | 30 | 132.3 | 59 | 3.91 | 71.7 | 21 | 2.57 | 3.44 | 35.1 | -1.34 |
| 1991 | 27 | 118.7 | 40 | 3.03 | 54.3 | 16 | 2.65 | 2.91 | 31.4 | -0.38 |
| 1992 | 27 | 109.7 | 42 | 3.25 | 47.7 | 27 | 4.80 | 3.72 | 30.3 | 1.56 |
| 1993 | 13 | 49.7 | 31 | 4.60 | 16.7 | 13 | 5.74 | 4.88 | 25.1 | 1.15 |


<details><summary>SQL</summary>

```sql
WITH reg AS (SELECT game_id FROM game WHERE game_type IS NULL OR game_type = 'regular'), starts AS (
  SELECT pd.game_id FROM pitching_daily pd JOIN reg ON reg.game_id = pd.game_id
  WHERE pd.player_id = 'ryann001' AND pd.games_started
), allp AS (
  SELECT g.game_id, EXTRACT(YEAR FROM g.game_date)::int AS season, p.play_seq,
         p.outs_on_play, p.runs_on_play,
         (p.event_code < 4 OR p.event_code > 13) AS completes_pa,
         SUM(CASE WHEN (p.event_code < 4 OR p.event_code > 13) THEN 1 ELSE 0 END)
           OVER (PARTITION BY p.game_id ORDER BY p.play_seq
                 ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS bf_running
  FROM play p
  JOIN game g ON g.game_id = p.game_id
  JOIN starts s ON s.game_id = p.game_id
  WHERE p.pitcher_id = 'ryann001'
), idx AS (
  SELECT season, game_id, outs_on_play, runs_on_play,
         bf_running + CASE WHEN completes_pa THEN 0 ELSE 1 END AS bf_idx
  FROM allp
), agg AS (
  SELECT season, COUNT(DISTINCT game_id) AS gs,
    SUM(outs_on_play) FILTER (WHERE bf_idx <= 18) AS o18,
    SUM(runs_on_play) FILTER (WHERE bf_idx <= 18) AS r18,
    SUM(outs_on_play) AS o_all, SUM(runs_on_play) AS r_all
  FROM idx GROUP BY season
), ratio AS (SELECT EXTRACT(YEAR FROM game_date)::int AS season,
         SUM(earned_runs)::numeric / NULLIF(SUM(runs), 0) AS er_r
  FROM pitching_daily WHERE player_id = 'ryann001' GROUP BY 1)
SELECT a.season, a.gs,
  ROUND(a.o18 / 3.0, 1) AS ip_first18, a.r18 AS runs_first18,
  ROUND(9.0 * a.r18 * r.er_r / NULLIF(a.o18 / 3.0, 0), 2) AS era_first18,
  ROUND((a.o_all - a.o18) / 3.0, 1) AS ip_after18, (a.r_all - a.r18) AS runs_after18,
  ROUND(9.0 * (a.r_all - a.r18) * r.er_r / NULLIF((a.o_all - a.o18) / 3.0, 0), 2) AS era_after18,
  ROUND(9.0 * a.r_all * r.er_r / NULLIF(a.o_all / 3.0, 0), 2) AS era_full,
  ROUND(100.0 * (a.o_all - a.o18) / NULLIF(a.o_all, 0), 1) AS pct_ip_after18,
  ROUND(9.0 * (a.r_all - a.r18) * r.er_r / NULLIF((a.o_all - a.o18) / 3.0, 0)
      - 9.0 * a.r18 * r.er_r / NULLIF(a.o18 / 3.0, 0), 2) AS third_time_penalty
FROM agg a JOIN ratio r ON r.season = a.season
WHERE a.gs >= 10 ORDER BY a.season
```

</details>
