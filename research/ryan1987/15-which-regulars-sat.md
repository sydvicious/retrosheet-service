# Which regulars sat out Ryan's Astrodome starts

_Generated 2026-08-15 from `plex:5432/retrosheet` by `npm run research:ryan1987`. Do not edit by hand._

> Start rate for each of Houston's eight regulars in Ryan's 17 home games versus the other 64. The four biggest gaps are Reynolds, Hatcher, Walling and Cruz; three of those four bat left-handed, which points at platooning rather than rest — see analysis 16.

| player | bats | total_starts | started_ryan_home | missed_ryan_home | pct_ryan_home | pct_other_home | pct_ryan_road |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Gordon Craig Reynolds | L | 108 | 9 | 8 | 52.9 | 70.3 | 76.5 |
| William Augustus Hatcher | R | 139 | 12 | 5 | 70.6 | 81.3 | 94.1 |
| Dennis Martin Walling | L | 86 | 8 | 9 | 47.1 | 56.3 | 52.9 |
| Jose (Dilan) Cruz | L | 89 | 8 | 9 | 47.1 | 56.3 | 58.8 |
| Glenn Earle Davis | R | 150 | 15 | 2 | 88.2 | 93.8 | 88.2 |
| William Donald Doran | B | 162 | 17 | 0 | 100.0 | 100.0 | 100.0 |
| Kevin Charles Bass | B | 154 | 17 | 0 | 100.0 | 96.9 | 88.2 |
| Alan Dean Ashby | B | 105 | 12 | 5 | 70.6 | 67.2 | 58.8 |


<details><summary>SQL</summary>

```sql
WITH ryan AS (
  SELECT game_id FROM pitching_daily
  WHERE player_id = 'ryann001' AND games_started
    AND game_date BETWEEN '1987-01-01' AND '1987-12-31'
), hou_g AS (
  SELECT g.game_id, CASE WHEN g.home_team = 'HOU' THEN 1 ELSE 0 END AS side,
         (g.home_team = 'HOU') AS at_home, (r.game_id IS NOT NULL) AS is_ryan
  FROM game g LEFT JOIN ryan r ON r.game_id = g.game_id
  WHERE (g.home_team = 'HOU' OR g.visitor_team = 'HOU')
    AND g.game_date BETWEEN '1987-01-01' AND '1987-12-31'
), lineups AS (
  SELECT h.game_id, h.at_home, h.is_ryan, ls.player_id
  FROM hou_g h JOIN lineup_start ls ON ls.game_id = h.game_id AND ls.side = h.side
  WHERE ls.fielding_position BETWEEN 2 AND 9
), regulars AS (
  SELECT player_id, COUNT(*) AS total_starts FROM lineups GROUP BY 1 ORDER BY 2 DESC LIMIT 8
)
SELECT p.first_name || ' ' || p.last_name AS player, p.bats, reg.total_starts,
  COUNT(*) FILTER (WHERE l.at_home AND l.is_ryan) AS started_ryan_home,
  17 - COUNT(*) FILTER (WHERE l.at_home AND l.is_ryan) AS missed_ryan_home,
  ROUND(100.0 * COUNT(*) FILTER (WHERE l.at_home AND l.is_ryan) / 17, 1) AS pct_ryan_home,
  ROUND(100.0 * COUNT(*) FILTER (WHERE l.at_home AND NOT l.is_ryan) / 64, 1) AS pct_other_home,
  ROUND(100.0 * COUNT(*) FILTER (WHERE NOT l.at_home AND l.is_ryan) / 17, 1) AS pct_ryan_road
FROM regulars reg
JOIN lineups l ON l.player_id = reg.player_id
JOIN people p ON p.player_id = reg.player_id
GROUP BY 1, 2, 3
ORDER BY 100.0 * COUNT(*) FILTER (WHERE l.at_home AND NOT l.is_ryan) / 64
       - 100.0 * COUNT(*) FILTER (WHERE l.at_home AND l.is_ryan) / 17 DESC
```

</details>
