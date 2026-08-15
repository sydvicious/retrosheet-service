# Leads held after the starter departs: Ryan vs the 1987 NL

_Generated 2026-08-15 from `plex:5432/retrosheet` by `npm run research:ryan1987`. Do not edit by hand._

> For every 1987 NL start, the score when the starting pitcher threw his last pitch, versus the final result. This is the cleanest measure of what the bullpen cost Ryan.

| group_ | exits_with_lead | leads_held | pct_leads_held | exits_tied | pct_tied_won |
| --- | --- | --- | --- | --- | --- |
| All other NL starters | 721 | 625 | 86.7 | 200 | 47.5 |
| Other HOU starters | 52 | 43 | 82.7 | 12 | 66.7 |
| Ryan 1987 | 12 | 8 | 66.7 | 3 | 33.3 |


<details><summary>SQL</summary>

```sql
WITH nl87 AS (SELECT unnest(ARRAY['ATL','CHN','CIN','HOU','LAN','MON','NYN','PHI','PIT','SDN','SFN','SLN']) AS team), reg AS (SELECT game_id FROM game WHERE game_type IS NULL OR game_type = 'regular'),
st AS (
  SELECT pd.game_id, pd.player_id, pd.team
  FROM pitching_daily pd JOIN nl87 n ON n.team = pd.team
  JOIN reg ON reg.game_id = pd.game_id
  WHERE pd.games_started AND pd.game_date BETWEEN '1987-01-01' AND '1987-12-31'
),
lastp AS (
  SELECT st.game_id, st.player_id, st.team, MAX(p.play_seq) AS last_seq
  FROM st JOIN play p ON p.game_id = st.game_id AND p.pitcher_id = st.player_id
  GROUP BY 1, 2, 3
),
fin AS (
  SELECT p.game_id,
    MAX(p.away_score_before + CASE WHEN p.half = 0 THEN p.runs_on_play ELSE 0 END) AS away_f,
    MAX(p.home_score_before + CASE WHEN p.half = 1 THEN p.runs_on_play ELSE 0 END) AS home_f
  FROM play p GROUP BY 1
),
exitsc AS (
  SELECT l.*, f.away_f, f.home_f,
    COALESCE((SELECT p2.away_score_before FROM play p2
              WHERE p2.game_id = l.game_id AND p2.play_seq > l.last_seq
              ORDER BY p2.play_seq LIMIT 1), f.away_f) AS away_e,
    COALESCE((SELECT p2.home_score_before FROM play p2
              WHERE p2.game_id = l.game_id AND p2.play_seq > l.last_seq
              ORDER BY p2.play_seq LIMIT 1), f.home_f) AS home_e
  FROM lastp l JOIN fin f ON f.game_id = l.game_id
),
sided AS (
  SELECT e.*,
    CASE WHEN g.home_team = e.team THEN e.home_e ELSE e.away_e END AS mine_e,
    CASE WHEN g.home_team = e.team THEN e.away_e ELSE e.home_e END AS opp_e,
    CASE WHEN g.home_team = e.team THEN e.home_f ELSE e.away_f END AS mine_f,
    CASE WHEN g.home_team = e.team THEN e.away_f ELSE e.home_f END AS opp_f
  FROM exitsc e JOIN game g ON g.game_id = e.game_id
)
SELECT CASE WHEN player_id = 'ryann001' THEN 'Ryan 1987'
            WHEN team = 'HOU' THEN 'Other HOU starters'
            ELSE 'All other NL starters' END AS group_,
  COUNT(*) FILTER (WHERE mine_e > opp_e) AS exits_with_lead,
  COUNT(*) FILTER (WHERE mine_e > opp_e AND mine_f > opp_f) AS leads_held,
  ROUND(100.0 * COUNT(*) FILTER (WHERE mine_e > opp_e AND mine_f > opp_f)
        / NULLIF(COUNT(*) FILTER (WHERE mine_e > opp_e), 0), 1) AS pct_leads_held,
  COUNT(*) FILTER (WHERE mine_e = opp_e) AS exits_tied,
  ROUND(100.0 * COUNT(*) FILTER (WHERE mine_e = opp_e AND mine_f > opp_f)
        / NULLIF(COUNT(*) FILTER (WHERE mine_e = opp_e), 0), 1) AS pct_tied_won
FROM sided GROUP BY 1 ORDER BY 1
```

</details>
