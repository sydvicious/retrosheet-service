<!-- Copyright (c) 2026 Syd Polk -->
<!-- SPDX-License-Identifier: BSD-3-Clause -->

# Nolan Ryan, 1987 — a study in early hooks

Was Ryan's 8–16 record in 1987 the result of being pulled around 100 pitches
because of his back, with the Houston bullpen giving away what he left behind —
an accidental preview of modern "third time through the order" usage?

## Running it

```bash
npm run research:ryan1987
```

Rewrites every numbered `.md` file in this directory. Those files are generated —
edit [`queries.ts`](queries.ts) instead. [`FINDINGS.md`](FINDINGS.md) is the
hand-written interpretation and is not regenerated.

**This defaults to Plex, not localhost.** Plex is production for this project,
and research should run against it so results do not depend on whether Docker
happens to be up on a laptop. The service and the ETL still default to localhost
— that split is deliberate: **develop the service locally, do research against
Plex.** Reaching Plex requires Tailscale to be running on whatever machine you
run this from.

To point somewhere else — a local checkout of the data, or a test schema:

```bash
DATABASE_URL=postgres://retrosheet:retrosheet@localhost:5432/retrosheet npm run research:ryan1987
```

`PG_SCHEMA` is honoured as usual. Every generated file records the database it
came from in its header line, so a table can always be traced to its source.
When this study was first run, Plex and the local mart were verified identical
(15,999,097 play rows, matching season lines).

## Files

| File | Contents |
| --- | --- |
| [FINDINGS.md](FINDINGS.md) | Narrative answer to the research questions |
| [queries.ts](queries.ts) | The analysis queries, with data-model notes |
| [run.ts](run.ts) | Runner that renders each query to markdown |
| `01-workload-by-season.md` | Batters faced per start, every season |
| `02-workload-when-effective.md` | Workload restricted to starts he was cruising in |
| `03-tto-splits.md` | First 18 batters vs the rest of the start |
| `04-bullpen-1987.md` | NL / Houston / behind-Ryan relief comparison |
| `05-bequeathed-runners-1987.md` | Runs charged to Ryan that relievers allowed |
| `06-lead-holding-1987.md` | Leads held after the starter departs |
| `07-run-support-1987.md` | Run support, split by venue |
| `08-park-run-environment-1987.md` | 1987 NL run environment by park |
| `09-ryan-1987-gamelog.md` | Start-by-start log |
| `10-support-by-decision-1987.md` | Run support by W/L/ND — separates bullpen from offense |
| `11-run-support-by-starter-1987.md` | Support per Houston starter, plus opposing-starter quality |
| `12-offense-1986-vs-1987.md` | Houston's offense across both years in league context |
| `13-support-ryan-vs-rotation.md` | Ryan vs the rest of the rotation, with venue control |
| `14-support-mechanism-checks.md` | Catcher / opposition / lineup tests for the home gap |
| `15-which-regulars-sat.md` | Which regulars missed Ryan's Astrodome starts |
| `16-platoon-effect-astrodome.md` | Opposing-hand mix and what the platoon shift was worth |
| `17-where-the-home-gap-lives.md` | The test that refutes the platoon explanation |

## Method notes

**Batters faced, not pitches.** Retrosheet pitch sequences begin in 1988, so
1987 has no pitch counts. A pitch estimator calibrated on 1988–93 was considered
and rejected: it cannot be back-applied across the 1972–76 Angels workloads, and
the changeup Ryan added in 1981 moves pitches per plate appearance. Batters faced
is used as the workload proxy throughout.

**A "batter faced"** is a play whose `event_code` is `< 4` or `> 13`. Codes 4–13
are baserunning-only events that do not complete a plate appearance. This rule
reproduces `pitching_daily.batters_faced` and `.outs` exactly across all 27 of
Ryan's seasons, which is the validation that the play-level splits rest on.

**Runs vs earned runs are on different bases.** `pitching_daily.runs` counts runs
that scored while the pitcher was on the mound; `earned_runs` counts runs
officially *charged* to him, which by rule includes runners he left behind who
scored against a reliever. Never mix them in one rate — league-wide in 1987 this
makes relievers look 1.3 runs better than they were. Bullpen comparisons here use
runs allowed while pitching (RA/9).

**Bucket-level ERA is scaled, not reconstructed.** Splitting earned from unearned
runs within a start needs full inning reconstruction, which this mart does not
support. The `era_*` columns are RA/9 multiplied by the season's charged-ER/runs
ratio. Since that ratio is a per-season constant it cannot manufacture or conceal
a first-18-vs-rest gap. As a check, `era_full` reproduces Ryan's published season
ERA to within about 0.02.

**Houston's league.** `teams.league` for HOU is `'NL;AL'` because of the 2013
switch, so `WHERE league = 'NL'` silently drops the Astros from any 1987 league
baseline. The 1987 NL is enumerated explicitly.
