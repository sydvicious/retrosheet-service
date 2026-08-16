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
| [blown-11-run-leads](blown-11-run-leads/) | Which games did somebody blow an 11-run lead, and how many of them was I at? |

> This file is intended to become the root README when research moves to its own
> repository. See "Future — split research projects into their own repo" in the
> project plan.

## Ideas — not yet started

### Best and worst starts through N games

**Question.** For every current franchise, what are its best and worst records
through N games (N = 10, 20, 25, 40, 50, 81, …), and how does that change as the
window of eligible seasons narrows? Then the same question league-wide: the best
and worst starts in each league's history, and overall.

**Where it came from.** The **2015 Astros**, who started very hot — Syd has been
building these lists by hand ever since, one franchise at a time.

**The framings to support (the point of the study is the comparison between
them), each as a filter on eligible seasons:**

* all seasons in franchise history;
* since 1900;
* the divisional era (1969– );
* since the franchise last **changed cities** (per-franchise cut, e.g. `WS1`→`MIN`
  1961, `BRO`→`LAN` 1958, `SE1`→`MIL` 1970);
* since the franchise last **changed divisions** (1969 / 1994 realignment / 1998
  expansion / `HOU` NL→AL 2013 — a different cut per club again);
* since the franchise last changed leagues (`HOU` 2013, `MIL` 1998).

The per-franchise cut dates are the real work here: they are not derivable from
`teams` (see the schema traps below) and want a small committed table of
franchise eras — `(franchise, team_id, first_season, last_season, city, league,
division)` — that the study owns. That table is also what makes "current
franchise" mean anything, since the answer must roll `WS1`/`MIN` and
`BRO`/`LAN` into one line.

**Most of that table already exists** in the Chadwick Bureau's **Baseball
Databank** (the successor to Sean Lahman's database): `core/Teams.csv` is one
row per team-season with `franchID`, `divID`, `lgID`, `W`/`L`, *and*
`teamIDretro` — which is the join key to this mart — and
`core/TeamsFranchises.csv` names each franchise and flags whether it is still
active. Deriving the cut dates is then a group-by over `franchID` rather than
hand research, and its season `W`/`L` double as an independent check on any
full-season record computed from `game_log`. Caveats: it is **season-level
only**, so through-N-games still has to come from the game logs, and its
franchise groupings are editorial (see the `NAassoc` column linking National
Association clubs).

On licensing — the databank is distributed **CC BY-SA 3.0**, but under *Feist*
(1991) the facts in it are not copyrightable at all; a compilation is protected
only in its original selection and arrangement, and there is no sweat-of-the-brow
right. *NBA v. Motorola & STATS Inc.* (2d Cir. 1997) and *C.B.C. v. MLBAM*
(8th Cir. 2007) point the same way for scores and player statistics
specifically. So **deriving** a franchise-era table from `Teams.csv`, or
cross-checking W/L against it, produces work that is ours and carries no
share-alike obligation; what the license could reach is copying the compilation
wholesale, as arranged, which we have no reason to do. Attribution is a separate
matter and is given regardless — the same posture this project already takes
toward Retrosheet's terms of use. Upstream note: the canonical
`chadwickbureau/baseballdatabank` repo is **gone (404)**; a preserved mirror is
`xorq-labs/baseballdatabank`.

**Ties.** Report both — records **counting ties** (W-L-T, and a winning
percentage on a denominator that includes them) and **ignoring ties** — because
the two orderings disagree, and mostly in the older eras. A tie is
`visitor_score = home_score` in `game_log`. Decide explicitly whether a tie
consumes one of the N games; the natural reading is that it does (N games
*played*), which is another reason the two counts diverge.

Regular-season ties by decade (`game_type` filtered, so the 1907 and 1912 World
Series ties and All-Star ties like 2002's 7–7 are excluded):

| 1870s | 1880s | 1890s | 1900s | 1910s | 1920s | 1930s | 1940s |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 35 | 181 | 192 | 213 | 213 | 64 | 90 | 98 |

| 1950s | 1960s | 1970s | 1980s | 1990s | 2000s | 2010s | 2020s |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 60 | 39 | 13 | 22 | 7 | 5 | 1 | 0 |

The **last regular-season tie in the data is 2016-09-29, Cubs at Pirates 1–1**
(`PIT201609290`) — a rained-out sixth inning in the last week of a season where
it changed nothing, so it was never made up. So ties survived the post-2008
rule change; that one governs the **postseason** (no playoff game can be called
short). The regular-season practice that finally ends them — called games
resumed as suspended games rather than replayed or left tied — is a later
change (2020, from memory; not something this data can confirm). Before 2016
the most recent is 2005-06-30 Houston at Cincinnati 2–2, which matches the
"2000s" recollection this idea started from.

**League-wide cuts.** Best/worst starts through N across all clubs in a season,
across a league's history, and across all of MLB — the same list the franchise
pages produce, sorted globally rather than per club.

**Basis and known traps.**

* Build on **`game_log`**, not the play tables: it is the independent Retrosheet
  download, it carries the official final score, and it does not inherit the
  `runs_on_play` errors documented below. **`game_log` is not regular-season
  only** — postseason and All-Star rows are in there (checked: the 1907 and 1912
  World Series ties, the 2002 and 2025 All-Star games) — and it carries no
  `game_type` of its own, so the regular-season filter means joining to `game`.
  That join does resolve those games correctly (`worldseries`, `allstar`), but
  it must be a `LEFT JOIN` with the usual NULL-means-regular fallback, since
  plenty of old games have a log row and no event file.
* **Franchise continuity is not `team_id` continuity** (see the trap below).
  Every city move is a new `team_id`, which is exactly the seam this study is
  built on.
* **Ordering the first N games** is by `(game_date, game_number)` — doubleheaders
  make the date alone non-unique. Watch for suspended games resumed on a later
  date and for seasons where a club's game count is short (1918, 1972, 1981,
  1994, 1995, 2020): N may exceed the games actually played, and short seasons
  should probably be labelled rather than silently ranked alongside full ones.
* **Forfeits are invisible in the mart, but they are in the source — we drop
  them at load.** Retrosheet's game logs carry a **forfeit-information field**
  (field 15) and a **completion-information field** (field 14, for suspended
  games finished later); the loader keeps neither, and `game_info` has no
  forfeit key either. In the raw `.data/gamelog/gl*.txt`: **142 forfeits** —
  46 `V` (visitor awarded), 67 `H` (home awarded), 29 `T` (declared a tie) —
  and 194 rows with completion info, out of 233,634 games. The scores stored are
  the *score when play stopped*, not the official 9–0, which is why Ten Cent
  Beer Night (1974-06-04, TEX at CLE, forfeit `V`) sits in the tie counts above
  as 5–5 and Disco Demolition game two (1979-07-12, DET at CHA, `V`) as 0–0,
  while the 1995-08-10 Dodgers forfeit reads as an ordinary 2–1 Cardinals win.
  The event files carry the same fact as a comment — `com,"Forfeit=H"` — and
  those **are** loaded, so today the mart can answer this for the 22 covered
  games via `comment.text ILIKE 'Forfeit=%'`.
  **A score-derived W-L is wrong for 102 of the 142:** 74 of the 113 `V`/`H`
  awards have a score that contradicts them (tied, or the forfeit's loser
  ahead), and 28 of the 29 `T` games — `T` is *ruled a no-decision*, so neither
  team gets a W or an L — carry a decisive score and currently read as ordinary
  wins and losses. Forfeits cluster in the 1880s–90s, which is precisely where
  the worst-start lists live. **Fix at the loader, not in the study** — see
  "Forfeits, suspended games, and the official result" in the project plan.

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

### `play.runs_on_play` does not reproduce the final score

Summed per game it disagrees with `game_log`'s official final in **13% of games
(26,875 of 201,870)** — in *both* directions, so the errors don't wash out. Two
parser bugs: a **phantom run** credited on force outs that carry no advance
section (`64(1)/FO`, `5(2)/FO` — 19,646 plays / 18,582 games), and a **dropped
run** on multi-run plays where the second is marked `(UR)`
(`S9/L9M.3-H;2-H(UR);1-3` scores two, the mart records one — 6,092 plays / 5,404
games).

Season and career totals absorb this; anything that needs the score **at a
moment** does not. Re-deriving runs from the raw event string gets agreement to
98.8% — see `RUNS` in [blown-11-run-leads/queries.ts](blown-11-run-leads/queries.ts). In that
study the stored column produced two false positives and, worse, one false
negative. `away_score_before` / `home_score_before` inherit the same error.

Validate any play-level score work against `game_log` finals; the game logs are a
separate Retrosheet download, so the check is independent of the parser.

### `teams` holds one nickname per franchise, the current one

`team_id` is the primary key, so `CLE` is "Guardians" in 1925 as well as 2025 —
historical nicknames aren't in the mart. Fine for identity, wrong for prose;
label it or use the team id when the output is meant to read as history.

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
