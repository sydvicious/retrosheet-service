<!-- Copyright (c) 2026 Syd Polk -->
<!-- SPDX-License-Identifier: BSD-3-Clause -->

# Incremental updates

# Summary

When a new Retrosheet release changes some seasons, reload only those seasons
(and the small tables that changed) instead of every season. Schema and ETL
changes keep the full reload.

# Rationale

Every data change today reloads all 155 seasons, several minutes with the
services unavailable for the schema case. Retrosheet releases usually touch a
handful of seasons, so most of that work recomputes rows that did not change.
The loaded clone commit is now recorded in the database, which makes the
changed seasons knowable from a `git diff`. The game logs are the one input with
no history, but they feed a single small table that can simply be reloaded
whole, so they need no bootstrapping.

# Phases

- **Phase 1 — Know what changed.**
  - `fetch-data.sh` re-downloads an existing game-log year when retrosheet.org
    has a newer file (conditional GET). Fixes the Known problem that corrected
    game logs are never picked up.
  - `scripts/data-changes.sh <old version> <new version>`: fetches the old
    clone commit into the shallow clone, diffs, and prints the changed seasons
    and whether reference data, postseason game logs, or the downloaded game
    logs changed; prints `full` when it cannot tell.
  - Loader: `--data-version` prints the version recorded in `schema_meta`.
  - Added seasons count as changed seasons: the new year each fall, and the
    older seasons Retrosheet keeps adding. A new game-log year is downloaded
    as soon as retrosheet.org publishes it.
  - Tests for the path classification and the version-string parsing,
    including an added season, a removed season, and a new file in an
    existing season.
- **Phase 2 — Partial reload in the loader.**
  - `--replace seasons=1987,1988 reference gamelog`: in one transaction, delete
    those seasons' rows (game and children, roster, schedule, daily lines),
    re-COPY them, re-aggregate daily lines for those games only; truncate and
    reload the reference tables and/or `game_log` when asked.
  - Record the new data version in the same transaction.
  - A season with no rows yet (newly added) takes the same path: nothing to
    delete, everything loaded.
  - Refuse a partial load when the database's recorded version is unknown.
  - Tests for the season predicate and the per-season daily SQL.
- **Phase 3 — Wire it into `update.sh`.**
  - A data-only change computes the change set, shows it ("reload seasons
    1987, 1988 and the game logs"), and asks; `y` runs the partial load.
  - Schema or ETL change, an unknown version, or a diff that cannot be made:
    full reload, asked as today. `--force` stays a full reload.
- **Phase 4 — Prove it and document it.**
  - A dev-only `npm run verify:incremental`: full load at an older clone
    commit, move to a newer one, partial load, then compare with a fresh full
    load at the newer commit by per-table row counts and per-season checksums.
  - README: update section, Known problems entry removed, To do entry removed.
- **Phase 5 — Reload only the changed event files.**
  - A changed `.EV*` file reloads only the games in it: the games in the old
    version are deleted, the games in the new version are loaded, and daily
    lines are re-aggregated for just those games.
  - A changed `.ROS` file replaces that team-year's roster rows; a changed
    schedule file still replaces the season's schedule.
  - The host lists the old file's game ids from `git show <old>:<path>`; the
    loader parses the new file as it does today.
  - Phase 2's season reload stays as the fallback and as what `SEASONS=` uses.

# Design Decisions

- **Season is the unit of reload**, because every per-game table hangs off
  `game_id` and every game sits in one `seasons/<year>/` directory. Any changed
  path under a season directory marks the whole season, even files the loader
  does not read; the cost of a season is seconds.
- **The diff runs on the host, in `update.sh`**, not in the loader. The loader
  image has no git and the data is mounted read-only. The host passes the
  change set to the loader as arguments.
- **Game logs reload whole, never per season.** They feed only `game_log`,
  about 200,000 rows that load in seconds. Detecting "any game log changed" is
  enough, and the existing blob hash in the data version already says that.
- **No local git repo for the game logs.** Per-season granularity is what a
  repo would buy, and the point above makes it unnecessary. Conditional
  downloads give the change signal; the hash gives the identity.
- **Reference tables reload whole** when anything under `reference/` changed.
  They are small and `coaches` has a foreign key into `people`, so a partial
  update is not worth the care.
- **The old commit is fetched by hash, not by deepening the clone.** GitHub
  serves `git fetch origin <sha>` for any reachable commit, and a diff needs
  only the two trees. If the fetch fails, the script says so and falls back to
  a full reload.
- **The data-version format stays** `<clone commit>+gl:<game-log hash>`. Both
  halves are already recorded on warehouse; nothing has to be rewritten.
- **Partial loads are refused on an unknown recorded version.** With nothing to
  diff against, only a full load is sound. `update.sh` already asks in that case.
- **One transaction per partial load, same as today**, so the API keeps
  serving the old rows until the commit and a failure leaves nothing half-done.
- **File-level reload comes after season-level, not instead of it.** The season
  path is simpler to get right and to verify, and the file path reuses its
  delete-then-load shape with a narrower game set. Season reload remains the
  fallback whenever a file's old game ids cannot be read.

# Background

The loader (`src/etl/run.ts`) truncates every table and re-COPYs everything in
one transaction, then aggregates `batting_daily` and `pitching_daily` from the
whole `play` table in SQL. `fielding_daily` is produced per game by the replay.
`SEASONS=` exists but is a test mode: it still truncates everything and records
no data version.

Inputs are two: the Chadwick Bureau clone (`seasons/<year>/` event, roster and
schedule files; `reference/`; five postseason game logs under `gamelog/`), and
155 regular-season game logs downloaded per year from retrosheet.org into the
clone's `gamelog/` directory, untracked. `fetch-data.sh` downloads a year only
when its file is missing, so corrections upstream are never fetched. On
2026-10-23 the 1987 zip on retrosheet.org was two days newer than the local copy.

`scripts/data-version.sh` computes `<clone commit>+gl:<hash of all game-log
files>`; `load.sh` and `update.sh` pass it to the loader, which records it in
`schema_meta.data_version`. Warehouse holds
`ee82e50…+gl:1d46b610ff1d4346` as of 2026-10-23. The clone is `--depth 1`.

Upstream commits are frequent and small: the six most recent (August 2026)
are single fixes such as "Remove duplicated games" and "Add missing obligatory
NP record before a sub record".

# Detailed discussions

## Classifying a diff

`git diff --name-only <old> <new>` in the data directory, then:

| Path | Effect |
|---|---|
| `seasons/<year>/…` | season `<year>` reloads |
| `reference/…` | reference tables reload |
| `gamelog/…` | `game_log` reloads (postseason files; the regular-season files are untracked and covered by the hash) |
| anything else | ignored |

The "anything else" bucket is documentation, box-score files outside season
directories, and repository housekeeping. The loader reads only the three
classes above, so a change elsewhere cannot alter a loaded row. The
classification is a pure function of a path list and gets unit tests, including
a season directory being removed (its rows are deleted, nothing is loaded) and
a season being added (nothing to delete, everything loaded).

Within a season directory, the loader reads `.EV*`, `.ROS`, and
`<year>schedule.csv`. Box-score files (`.EB*`) are not read. Filtering by
extension would avoid a reload when only box scores changed; the plan does not
do this, because a season reload is cheap and the filter would have to track
every future file the loader learns to read. It is a one-line refinement later.

## New seasons and new files

Three kinds of addition arrive, and the season path handles all of them with
no special casing because "reload season X" does not care whether X has rows:

- **The new season each fall.** `seasons/2026/` appears in the clone with its
  event, roster and schedule files. The diff lists it under a new year, the
  classifier marks the season changed, the delete finds nothing, the load
  inserts it.
- **Older seasons added later.** Retrosheet keeps publishing earlier years and
  Negro Leagues seasons. Same path; the year is simply lower.
- **New files in an existing season.** A team's event file added to a year
  that already has others. The season path reloads the whole season. The
  Phase 5 file path sees a file with no old version, has no ids to delete, and
  loads it.

The game logs follow a season's appearance one step behind. `fetch-data.sh`
downloads `gl<year>.zip` for every year under `seasons/`, so a new season
directory makes the script try its game log on every run; retrosheet.org
answers 404 until the file is published (2026 today), then 200, and the hash
moves. Postseason game logs ship in the clone and come through the diff.

`seasonYears()` reads the season directories at load time, so the loader needs
no list of known seasons anywhere. The one place a fixed list could creep in is
the classifier, which must accept any four-digit directory name, not a range.
The tests cover an added season, a removed season, and a new file in an
existing season.

## The game-log hash and the second half of the version

The hash covers names and contents of every `gl<year>.txt` in a fixed order.
It changes when any year is added, removed, or corrected. For reload purposes
that is all that is needed, because `game_log` is reloaded whole. The
`data-changes.sh` script compares the `gl:` halves of the two version strings;
any difference means `gamelog` is in the change set.

The hash is computed over the files as they are on disk after `fetch-data.sh`
runs, so Phase 1's conditional download is what makes the hash move at all for
an existing year. Without it the hash only changes when a new year appears.

## Conditional downloads

`curl -z <file> -o <file> <url>` sends `If-Modified-Since` with the file's
mtime and writes nothing on a 304. retrosheet.org returns `Last-Modified` and an
`ETag`, so this works and costs one small request per year, 155 in all, with
no payload when nothing changed. The zip is downloaded, not the text file, so
the comparison file has to be the zip's mtime or a stamp file written at unzip
time; the simplest is to keep each zip's `Last-Modified` in a small
`gamelog/.stamps` file, or to `touch -r` the unzipped text file to the zip's
server date and compare against that. The plan uses the `touch -r` route: no
extra files, and the text file's mtime becomes meaningful.

A year whose zip does not exist on the server, 404 today for 2026, is skipped
as now.

## Fetching the old commit into a shallow clone

After `git pull --ff-only` in a `--depth 1` clone, the previous HEAD is gone
from local history. `git fetch --depth 1 origin <old sha>` retrieves exactly
that commit and its tree; GitHub allows fetching reachable commits by hash.
`git diff --name-only <old> <new>` then compares the two trees without needing
any history between them. The old commit is read from the first half of the
recorded data version, which the loader prints via `--data-version`.

If the fetch fails (no network, a commit no longer reachable after a
force-push upstream), `data-changes.sh` prints `full` and `update.sh` offers
the full reload exactly as it does today.

## Deleting and reloading a season

A season's rows are found through `game`: `game_id IN (SELECT game_id FROM game
WHERE game_date >= '<year>-01-01' AND game_date < '<year+1>-01-01')`. Baseball
seasons sit inside a calendar year, and `game_date` comes from the event file's
`date` record. The tables to delete in order are the children of `game`
(`game_info`, `lineup_start`, `substitution`, `comment`, `earned_runs`,
`game_adjustment`, `play`, `fielding_daily`, `batting_daily`, `pitching_daily`),
then `game` itself; `roster` and `schedule` by their `year` column. All the
child tables have a `game_id` index, so the deletes are index scans.

The reload then runs the existing per-season loaders with a season filter:
`loadEvents` already takes a `Set` of seasons; `loadRosters` and
`loadSchedules` iterate `seasonYears(root)` and need the same filter added.
The daily aggregation needs a predicate on `play.game_id`; the two SQL
statements get an optional `WHERE game_id IN (…)` built from the same season
subquery. Over one season the aggregation is small; the 256 MB `work_mem` in
the compose file was sized for the whole table and is more than enough.

`game_log` rows for the season are left alone; they are reloaded only when the
game-log half changed, and then as a whole table.

## What a partial load records

The new data version, in the same transaction as the deletes and COPYs, exactly
as a full load does. If the transaction fails, the old version stays and the
next `update.sh` sees the same change set again.

A partial load must start from a known version. If `schema_meta.data_version`
is NULL, the loader refuses `--replace` with a message, and `update.sh` never
gets there because the check already classified the database as unknown.

## Interaction with the check

`--check` keeps its four outcomes. "Changed" splits in two for the script:
when only the data differs (schema and ETL match), `update.sh` runs
`data-changes.sh` and offers the partial load; when schema or ETL differ, the
full reload as today. The loader does not need to know about the diff; it gets
either no arguments (full) or `--replace …` (partial).

The prompt text names the change set, so a run reads as:

```
Database holds Retrosheet data ee82e50…, data dir is 3f1c9a2… — a reload is needed.
Changed: seasons 1987, 2019; game logs.
Reload those? [y/N]
```

`--force` keeps meaning a full reload. A `--force-partial` is not planned;
`SEASONS=` remains for test loads.

## Verification

The proof is a comparison against the thing being replaced. `npm run
verify:incremental` (dev-only, needs the data and Docker, like the other
validate tools):

1. In the data directory, fetch two upstream commits A (older) and B (newer),
   check out A, full load, confirm the recorded version.
2. Check out B, run `fetch-data.sh`, run `data-changes.sh`, partial load.
3. Snapshot: per-table row counts and, per season, an `md5(string_agg(row::text
   ORDER BY …))` over each per-game table.
4. Full load at B into the same database, snapshot again, diff the snapshots.

Zero differences is the pass. The two snapshots must agree on `game_log` too,
which exercises the whole-table path. A good first pair is `ee82e50` against
its parent or grandparent, since those upstream commits removed duplicated
games and added a record to a season file, exactly the shapes the diff has to
handle.

The identity columns (`id bigint GENERATED ALWAYS AS IDENTITY`) will differ
between a partial and a full load, so the checksums exclude them.

## Phase 5: the changed-files path

An event file holds one team's home games for one season (`1987BAL.EVA`), so a
typical upstream fix touches one or two files out of a season's thirty-odd. The
unit of reload becomes the set of games in the changed files.

**Which games to delete.** The games in the old version of the file, not the
new one: a game removed upstream (the "Remove duplicated games" commits) is in
the old file only. Every game in an event file begins with an `id,<game_id>`
record, so the host gets the old ids without a parser:

```bash
git show <old>:seasons/1987/1987BAL.EVA | grep '^id,' | cut -d, -f2
```

The host passes those ids to the loader along with the file paths. The loader
deletes the union of the old ids and the ids it parses from the new files, in
the same child-tables-then-`game` order as a season delete, then loads the new
files with the existing per-file loop in `loadEvents`, which already works a
file at a time.

**Daily lines.** The aggregation predicate becomes `game_id IN (<the ids>)`
instead of a date range. The two SQL statements take the predicate as a
parameter either way, so this is the same code path with a different list.

**Rosters and schedules.** A `.ROS` file is one team-year, so a changed roster
file replaces the rows for that `(year, team)`. The schedule file is one per
season and keeps replacing the whole season's schedule rows. Neither touches
game rows.

**Classification.** The diff classifier from Phase 1 grows a per-file level
under each season: event files, roster files, the schedule file, and other
files (box scores, ignored). A season whose directory was added or removed
whole falls back to the season path. So does any file whose old content cannot
be read, for instance a rename git reports as a delete plus an add.

**Verification.** The Phase 4 harness compares a partial load against a full
load at the same commit; it does not care which partial path produced the rows.
The upstream pair chosen there, duplicated games removed and a record added to
one file, exercises exactly this path.

**Limits.** A change to `reference/` or the game logs is still whole-table.
Within a file, games are not diffed individually; a one-character fix to one
game reloads the file's eighty or so games, which takes well under a second.

## Things deliberately not done

- **Per-season game logs**, by local repo or per-year hashes. See the design
  decision; revisit only if `game_log` grows a derived table worth protecting.
- **Migrations for schema or ETL changes.** Decided 2026-10-23: a schema change
  almost always comes with an ETL change, and an ETL change means the rows
  themselves are different, so a full reload is the honest answer.
- **Extension filtering within a season.** Noted above as a one-line refinement.
- **Parallel season loads.** A season is seconds; the full load's bottleneck is
  the daily aggregation over all plays, which the partial path avoids entirely.
- **Per-game diffs within a file.** Phase 5 reloads a changed file's games
  together; splitting finer buys nothing measurable.

# References

- Retrosheet data clone: https://github.com/chadwickbureau/retrosheet
- Regular-season game logs: https://www.retrosheet.org/gamelogs/gl<year>.zip
  (server sends `Last-Modified` and `ETag`; 404 for a season not yet published)
- Existing pieces this builds on: `scripts/data-version.sh`,
  `scripts/update.sh`, `src/etl/checkStatus.ts`, `src/etl/run.ts`,
  `src/etl/daily.ts`, `sql/schema.sql`
- README *Known problems*, "Corrected game logs are never picked up"
  (2026-10-23), and *To do*, "Reload only the seasons that changed"
