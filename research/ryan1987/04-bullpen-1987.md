# 1987 relief pitching: NL baseline vs Houston vs Houston behind Ryan

_Generated 2026-08-15 from `plex:5432/retrosheet` by `npm run research:ryan1987`. Do not edit by hand._

> Uses runs allowed while pitching (RA/9), not ERA. Reliever ERA is misleading here because inherited runners who score are charged to the departed starter, which flatters relievers and penalises starters.

| group_ | ip | runs_allowed | ra9 |
| --- | --- | --- | --- |
| NL relievers (all 12 teams) | 5690.0 | 3181 | 5.03 |
| HOU relievers (all games) | 432.0 | 246 | 5.13 |
| HOU relievers (Ryan starts) | 97.0 | 70 | 6.49 |
| HOU relievers (non-Ryan starts) | 335.0 | 176 | 4.73 |


<details><summary>SQL</summary>

```sql
WITH nl87 AS (SELECT unnest(ARRAY['ATL','CHN','CIN','HOU','LAN','MON','NYN','PHI','PIT','SDN','SFN','SLN']) AS team), reg AS (SELECT game_id FROM game WHERE game_type IS NULL OR game_type = 'regular'),
pd87 AS (
  SELECT pd.* FROM pitching_daily pd JOIN nl87 n ON n.team = pd.team
  JOIN reg ON reg.game_id = pd.game_id
  WHERE pd.game_date BETWEEN '1987-01-01' AND '1987-12-31'
),
ryan_games AS (
  SELECT game_id FROM pitching_daily
  WHERE player_id = 'ryann001' AND games_started
    AND game_date BETWEEN '1987-01-01' AND '1987-12-31'
)
SELECT 'NL relievers (all 12 teams)' AS group_, ROUND(SUM(outs) / 3.0, 1) AS ip,
       SUM(runs) AS runs_allowed, ROUND(9.0 * SUM(runs) / NULLIF(SUM(outs) / 3.0, 0), 2) AS ra9
FROM pd87 WHERE NOT games_started
UNION ALL
SELECT 'HOU relievers (all games)', ROUND(SUM(outs) / 3.0, 1), SUM(runs),
       ROUND(9.0 * SUM(runs) / NULLIF(SUM(outs) / 3.0, 0), 2)
FROM pd87 WHERE NOT games_started AND team = 'HOU'
UNION ALL
SELECT 'HOU relievers (Ryan starts)', ROUND(SUM(outs) / 3.0, 1), SUM(runs),
       ROUND(9.0 * SUM(runs) / NULLIF(SUM(outs) / 3.0, 0), 2)
FROM pd87 WHERE NOT games_started AND team = 'HOU' AND game_id IN (SELECT game_id FROM ryan_games)
UNION ALL
SELECT 'HOU relievers (non-Ryan starts)', ROUND(SUM(outs) / 3.0, 1), SUM(runs),
       ROUND(9.0 * SUM(runs) / NULLIF(SUM(outs) / 3.0, 0), 2)
FROM pd87 WHERE NOT games_started AND team = 'HOU' AND game_id NOT IN (SELECT game_id FROM ryan_games)
```

</details>
