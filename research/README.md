<!-- Copyright (c) 2026 Syd Polk -->
<!-- SPDX-License-Identifier: BSD-3-Clause -->

# Research

Studies built on the Retrosheet mart. Each lives in its own subdirectory with
query modules, a runner that regenerates markdown tables, and a hand-written
findings document.

| Study | Question |
| --- | --- |
| [ryan1987](ryan1987/) | Was Nolan Ryan's 1987 workload an early preview of "third time through the order" usage, and what turned a league-leading ERA into 8–16? |
| [hof-sightings](hof-sightings/) | Which Hall of Famers have I seen — as players or managers — and when did I first see each one? |

> This file is intended to become the root README when research moves to its own
> repository. See "Future — split research projects into their own repo" in the
> project plan.

## Conventions

### Regular season only, unless a study says otherwise

No All-Star games, no postseason. The predicate is:

```sql
WHERE game_type IS NULL OR game_type = 'regular'
```

**Why it matters more than it looks.** Postseason usage is not a scaled-down
version of regular-season usage — it is systematically different, and different
in *era-dependent* ways. Modern postseason hooks are shorter, but before
divisional play starters often went longer and appeared in relief. Ryan is the
example: his entire 1969 postseason was relief work, including a seven-inning
relief outing in the NLCS. Mixing that into a workload study biases precisely the
variable being measured.

This is not hypothetical. The first version of the ryan1987 study omitted the
filter, and Ryan's 1986 line read 32 starts and a 3.37 ERA — the real figures are
30 and 3.34, with two NLCS starts folded in. Applying the filter made every
season's ERA match its published value.

Effects elsewhere were small but real: 1987 NL reliever innings fell from 5748.3
to 5690.0, and NL starts-with-a-lead from 729 to 721. Houston missed the 1987
postseason, so no Ryan-specific 1987 number moved.

### League scope

Most studies cover **AA / NL / AL only** — but not all, so do not bake the
assumption into shared helpers. State the scope in each study's README and make
it visible in the query.

### Which database

Research runs against **Plex**, which is production:

```
postgres://retrosheet:retrosheet@plex:5432/retrosheet
```

Requires Tailscale on the machine running the query. Runners honour a
`DATABASE_URL` override. The service and ETL keep their localhost default —
develop the service locally, do research against Plex. Every generated file
records which database produced it.

### Generated vs hand-written

Numbered `.md` files are generated; edit the query module instead. `FINDINGS.md`
is interpretation and is never regenerated. Every table a study cites should be
reproducible by re-running the script.

## Schema traps

Properties of the mart, not of any one study. All of these fail **silently** —
they return plausible answers rather than errors.

### `game_type` encodes the regular season two different ways

NULL for regular-season games from 1908–2022, but the literal `'regular'` from
2023 onward. So `game_type = 'regular'` silently matches nothing before 2023, and
`game_type IS NULL` silently drops 7,289 modern games. Always accept both.
Postseason values: `worldseries`, `lcs`, `divisionseries`, `wildcard`, `playoff`,
`championship`; plus `allstar`.

### `teams.league` is multi-valued

Semicolon-joined when a franchise changed leagues without changing `team_id`.
Among modern clubs that is exactly two — `HOU` = `'NL;AL'` (2013) and `MIL` =
`'AL;NL'` (1998) — so `WHERE league = 'NL'` quietly drops the Astros from any
pre-2013 NL baseline and the Brewers from any post-1998 one. Eight Negro League
clubs use the form too; Chicago American Giants carries four (`NN1;NSL;NN2;NAL`).

### Franchise continuity is not `team_id` continuity

The 1880s–90s AA→NL moves are modelled as *separate team ids*, not as a
multi-valued league:

| Franchise | AA | NL |
| --- | --- | --- |
| Dodgers | `BR3` 1884–89 | `BRO` 1890–1957 → `LAN` |
| Reds | `CN2` 1882–89 | `CIN` 1890– |
| Cardinals | `SL4` 1882–91 | `SLN` 1892– |
| Pirates | `PT1` 1882–86 | `PIT` 1887– |

League filters are fine here; franchise-history queries keyed on `team_id` lose
the AA years without complaint. Milwaukee is messier: `ML3` (AA), `MLA` (AL 1901,
became the Browns), `MLN` (Braves), `MIL` (Brewers).

### `teams.league` is NULL for 78 rows

All-Star squads (`ALS`, `NLS`) and barnstorming teams (Satchel Paige All-Stars,
Bob Feller All-Stars). An inner join on league discards them silently.

**Better approach for league membership:** derive it per team-season from
`schedule.home_league` / `visitor_league` rather than from `teams.league`, which
conflates "which league" with "league history".

### `runs` and `earned_runs` sit on different bases

`pitching_daily.runs` counts runs that scored while the pitcher was on the mound.
`earned_runs` counts runs officially *charged* to him, which by rule includes
runners he left on base who scored against a reliever. Never mix them in one
rate: league-wide in 1987 this makes relievers look about 1.3 runs per nine
better than they were, and starters correspondingly worse.

### Counting batters faced from play-by-play

A plate appearance completes on a play whose `event_code` is `< 4` or `> 13`.
Codes 4–13 are baserunning-only events (SB, CS, PO, WP, PB, balk, other advance,
foul error). This rule reproduces `pitching_daily.batters_faced` and `.outs`
exactly across all 27 of Ryan's seasons — worth re-validating that way in any
study that splits at the play level.

Related: when bucketing plays by batter sequence, runs that score on
baserunning-only plays must still be attributed to the batter at the plate, or
they vanish from the totals.

### Earned runs cannot be split within a game

Separating earned from unearned runs *within* a start needs full inning
reconstruction, which the mart does not support. Studies needing bucket-level ERA
should compute RA/9 exactly and scale by the season's charged-ER/runs ratio,
labelling it as such. Since the ratio is a per-season constant, it cannot create
or hide a within-season split.
