# retrosheet-service

A self-hostable **GraphQL API over the [Retrosheet](https://www.retrosheet.org)
historical baseball data**, backed by PostgreSQL. Point it at the Retrosheet
data, run the loader to build a queryable Postgres mart, and query it over
GraphQL (PostGraphile) with filtering, ordering, pagination, and relations out
of the box.

Runs identically on macOS and Linux via Docker Compose. Node 22 + TypeScript.

## Status

Built in phases:

- **Phase 0 — running skeleton** ✅ Postgres + PostGraphile via Docker Compose.
- **Phase 1 — reference data** ✅ people, teams, ballparks, coaches, ejections,
  relatives, rosters, schedules.
- **Phase 2 — game / lineup / substitution / comment data** ✅ 201,874 games with
  metadata, starting lineups, substitutions, comments, earned runs, adjustments,
  and verbatim `game_info` — parsed clean-room from the event files.
- **Phase 6 — MCP server** ✅ read-only tools over the mart (stdio + streamable
  HTTP) so Claude can query the data. (See *MCP server* below.)
- **Phase 3 — play-by-play events** ✅ clean-room parser + game replay → the
  `play` table (event type, outs, RBIs, base state, pitcher, runner
  destinations). Against the Chadwick oracle, every scored field matches on all
  25,665 plays in the golden fixtures (`npm run validate:plays`). Replayed final scores match the Retrosheet game
  logs in every game (`npm run validate:scores`). Ongoing refinement via those
  and `npm run audit:plays`.
- **Phase 4 — daily stat lines** ✅ per-player-per-game **batting**, **pitching**,
  and **fielding** lines (`batting_daily`, `pitching_daily`, `fielding_daily`).
  Batting/pitching are aggregated in pure SQL from the `play` table; fielding
  (PO/A/E/DP/TP/PB/XI per position, innings, GS) is derived in the game replay,
  which tracks the full defensive alignment. Exposed over GraphQL and via the
  `player_stats` / `player_game_log` MCP tools. Fielding-credit parity vs the
  Chadwick oracle is scored by `npm run validate:fielding`: putouts, assists and
  errors match on all 25,665 fixture plays.
- **Phase 5 — web front-end** ⏳

## Design notes

- **Pure-TypeScript ETL, no Chadwick at runtime.** Deployed installations need
  no external baseball tools. The Retrosheet event parser is a **clean-room**
  implementation built solely from Retrosheet's published format spec. (The
  Chadwick tools are used only on a dev machine, as a black-box oracle, to
  generate golden test fixtures — never read as source; they are GPL.)
- **The database is a regenerable mart.** `sql/schema.sql` is idempotent; the
  loader ensures it, then **truncates + reloads every table inside one
  transaction**. So "update to a new Retrosheet release" is a hot refresh — the
  running API keeps serving and needs no restart (see *Update an existing
  installation*).
- **Querying:** the auto-generated API exposes a rich `filter` argument
  (ranges, `in`/`notIn`, string `includesInsensitive`/`startsWith`/`like`,
  `isNull`, and `and`/`or`/`not`) via the connection-filter plugin, plus
  `condition` (equality), `orderBy`, pagination, and FK relations. `condition`/
  `orderBy` are offered on **indexed columns**; the dataset is small so we index
  generously (`sql/schema.sql`). `filter` works on any column.
- License: **BSD 3-Clause** (see `LICENSE`).

## Prerequisites

The Docker path runs everything in containers, so a deployment host needs only
**Docker (engine running)**, **git**, and **curl** + **unzip** (to fetch the
Retrosheet game logs) — no Node, Postgres, or Chadwick on the host. macOS ships
curl and unzip; minimal Linux installs may lack them, and
`scripts/setup-linux.sh` installs both.

### Docker engine on macOS — Colima (no Docker Desktop required)

**One command.** `./scripts/setup-macos.sh` installs Homebrew (if missing, which
also brings the Xcode Command Line Tools → git), then git and the Docker packages
below, wires the CLI plugins, and starts Colima. On a **bare Mac** (nothing
installed yet) you can bootstrap it remotely — no clone needed first:

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/sydvicious/retrosheet-service/main/scripts/setup-macos.sh)"
```

The manual steps follow for reference.

`brew install docker` installs only the CLI *client*; macOS still needs a Linux
VM to run the Docker *engine*. On a headless Mac server the clean,
GUI-free route is **[Colima](https://github.com/abiosoft/colima)**:

**Homebrew packages** for a deployment host (the Docker path needs only these):

| package | why |
|---|---|
| `git` | clone/update this repo and the Retrosheet data (often already present via Xcode CLT) |
| `colima` | the Linux VM that runs the Docker engine (no Docker Desktop) |
| `docker` | the Docker CLI client |
| `docker-buildx` | image builds — Compose v2 `build` needs buildx ≥ 0.17 |
| `docker-compose` | the Compose v2 plugin (`docker compose …`) |

Dev machine only (for the native workflow and parser validation), additionally:
`node` (Node 22), and `chadwick` — used **only** as a black-box oracle to
generate golden fixtures (`scripts/make-fixtures.sh`); never a runtime dependency.

```bash
# CLI client + Compose v2 & Buildx plugins + the Colima-backed engine.
# (Buildx is required to build images — Compose v2 `build` needs buildx >= 0.17.)
brew install git colima docker docker-buildx docker-compose

# Let Docker find the plugins (Homebrew prints these caveats too)
mkdir -p ~/.docker/cli-plugins
ln -sfn "$(brew --prefix)/opt/docker-compose/bin/docker-compose" ~/.docker/cli-plugins/docker-compose
ln -sfn "$(brew --prefix)/opt/docker-buildx/bin/docker-buildx" ~/.docker/cli-plugins/docker-buildx

# Start the engine VM (a small resource bump helps image builds + Postgres)
colima start --cpu 4 --memory 4 --disk 60

# Keep it running across reboots (good for an always-on server)
brew services start colima

# Verify
docker info >/dev/null 2>&1 && echo "engine OK"
docker compose version
docker buildx version   # needs >= 0.17
```

Colima only serves Docker while its VM is up (`colima status` / `colima stop`);
`brew services start colima` keeps it up on a server. **Docker Desktop**
(`brew install --cask docker`) is a fine alternative — it bundles the engine and
Compose — but it's a GUI app you must keep running.

On **Linux**, run `./scripts/setup-linux.sh` (installs git, curl, tmux, unzip,
Docker Engine, and the Compose/Buildx plugins; no VM involved), or bootstrap a bare host remotely:

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/sydvicious/retrosheet-service/main/scripts/setup-linux.sh)"
```

It uses `sudo` as needed. Or do the equivalent by hand via your distro package
manager / `get.docker.com`.

## Install from scratch (Docker — Mac or Linux)

Prerequisites: **Docker** (engine running), **git**, **curl**, and **unzip** —
see *Prerequisites* above. Nothing else is needed on the host; Node, Postgres, and the parser all run
in containers.

```bash
# 1. Clone this repo and enter it.
git clone https://github.com/sydvicious/retrosheet-service.git
cd retrosheet-service

# 2. Get the Retrosheet source data (clones into ./.data; a few minutes).
#    Already have a clone? Skip this and use RETROSHEET_DIR in step 4 instead.
./scripts/fetch-data.sh

# 3. Bring up Postgres.
docker compose up -d db

# 4. Populate the database (one-shot loader). The play-by-play load takes
#    several minutes and prints a per-season heartbeat so you can see progress.
docker compose run --rm loader
#    …or from an existing Retrosheet clone instead of ./.data:
#    RETROSHEET_DIR=/path/to/retrosheet docker compose run --rm loader

# 5. Bring up the GraphQL API and the MCP server.
docker compose up -d api mcp
```

Endpoints (replace `localhost` with the host name, e.g. `warehouse`):

- **GraphQL / GraphiQL** — http://localhost:5050/ (port 5050, not 5000 — on macOS
  the AirPlay Receiver in Control Center listens on 5000)
- **MCP** (streamable HTTP) — http://localhost:5051/mcp

## Update an existing installation

First check out the code you want. `update.sh` does **not** touch the service
repo's git; it builds from the working tree as-is. Then:

```bash
git pull   # or check out the desired revision — you manage the service repo's git
./scripts/update.sh
```

It refreshes the Retrosheet data, rebuilds the images, and brings up `db`,
`api`, and `mcp` on them. It **reloads the database only when it has to**: when
the code's schema version differs from the database's, when the code's ETL
version (the parser/loader logic that turns Retrosheet files into rows) differs
from the one that did the last load, or when the Retrosheet data differs from
what was loaded. The data's version is the clone's commit plus a hash of the
game logs `fetch-data.sh` downloads separately; each full load records it in
`schema_meta.data_version` and the ETL version in `schema_meta.etl_version`.
Both versions live in `src/etl/schemaVersion.ts`.

- **Data or ETL changed, schema didn't:** the reload runs in one transaction. The
  services keep serving the old data until it commits, then the new data.
- **Schema changed:** the loader drops and rebuilds the schema first, so **the
  API and MCP are unavailable during the load**. The script recreates them
  afterwards so they see the new tables.
- **Neither changed:** no load; the services are just brought up on the new
  images.

A compose-only change (e.g. Postgres settings) needs no script:
`docker compose up -d db api mcp`.

A load prints an elapsed-time heartbeat every few seconds (`… [123s] events
1994: 3.9M plays loaded`), so you can tell it's alive and spot a stall
immediately. **On a remote host, run it inside `tmux`/`screen`** so a dropped SSH
session can't abort the multi-minute load:

```bash
tmux new -s retro './scripts/update.sh'   # reattach later: tmux attach -t retro
```

For a quick test load, limit seasons. A partial load records no data version, so
the next `update.sh` does a full reload:

```bash
SEASONS=2023,2024 docker compose run --rm loader
```

## Quickstart (native, on this Mac dev machine)

```bash
npm install
cp .env.example .env          # set RETROSHEET_DIR to your local clone
docker compose up -d db       # or point DATABASE_URL at any Postgres
npm run etl                   # populate
npm run dev                   # serve GraphQL at http://localhost:5050/
```

## MCP server

A read-only [Model Context Protocol](https://modelcontextprotocol.io) server lets
Claude (and other MCP clients) query the mart directly. Tools: `describe_schema`,
`query_sql` (guarded read-only SELECT), `search_people`, `get_person`, `get_team`,
`get_roster`, `find_games`, `get_game`, `player_games`, `player_stats`
(season-by-season batting + pitching + fielding totals with AVG/OBP/SLG, ERA/WHIP,
fielding pct), and `player_game_log` (per-game batting/pitching/fielding lines).

**Remote (streamable HTTP, e.g. over Tailscale) — containerized:**

```bash
docker compose up -d mcp
```

Then add `http://<host>:5051/mcp` as a remote MCP server in your client.

**Local (stdio) — e.g. Claude Desktop / Claude Code:** point the client at the
built entry, with a `DATABASE_URL` for the Postgres mart:

```json
{
  "mcpServers": {
    "retrosheet": {
      "command": "node",
      "args": ["/path/to/retrosheet-service/dist/mcp/index.js"],
      "env": { "DATABASE_URL": "postgres://retrosheet:retrosheet@localhost:5432/retrosheet" }
    }
  }
}
```

Safety: the server only ever reads. `query_sql` runs inside a `READ ONLY`
transaction with a statement timeout and a row cap, and rejects anything that
isn't a `SELECT`/`WITH`.

## Development

```bash
npm run typecheck     # tsc, no emit
npm test              # vitest — hand-authored parser and replay unit tests
npm run build         # tsc -> dist/
npm run mcp           # run the MCP server (stdio); MCP_TRANSPORT=http for HTTP
npm run validate:plays    # dev-only: play-parser parity vs Chadwick goldens
npm run validate:fielding # dev-only: fielding-credit parity vs Chadwick goldens
npm run audit:plays       # dev-only: log plays the parser doesn't fully understand
npm run validate:scores   # dev-only: replayed final scores vs the Retrosheet game logs
```

`audit:plays` replays the real event files (`RETROSHEET_DIR=…`) and reports plays
with unknown event codes, unparseable runner-advance tokens, or impossible
out-counts — surfacing parser gaps as concrete work. It needs no Chadwick and no
database.

`validate:scores` replays the real event files (`RETROSHEET_DIR=…`), totals the
runs scored by each side, and compares them with the final score in the
Retrosheet game logs. It exits non-zero when any game disagrees. `SEASONS=2024,1975`
limits the run. It needs no Chadwick and no database.

## Known problems

As of 2026-09-28. Update this list when a problem is fixed or a new one is found.

**Deployment**

- **`warehouse` still serves data loaded by ETL version 1.** In that data,
  `play.runs_on_play` disagrees with the game-log final in 25,640 of 201,870
  games (12.7%); `away_score_before`, `home_score_before`, and
  `batting_daily.runs` inherit the error. The fixes are ETL version 2. Check
  with `SELECT etl_version FROM schema_meta`; running `./scripts/update.sh` on
  the host reloads.

**Wrong results**

- **Pitching `runs` are charged to the pitcher on the mound when the run
  scores**, not to the pitcher who put the runner on base. `earned_runs` comes
  from Retrosheet's own records and is not affected.
- **Pinch runners keep the identity of the runner they replaced.** A run scored
  by a pinch runner is credited in `batting_daily` to the original runner.

**Not verified**

- **Score before each play.** The final score is checked
  (`npm run validate:scores`); the running score is not. A run credited to the
  wrong play within a half-inning would pass the check.
- **`pitching_daily.batters_faced`** has no independent check.
- **Base state and runner destinations** are not compared with the Chadwick
  oracle; `validate:plays` scores each play string on its own.
- **Chadwick parity rests on four team-seasons** (1927 NYA, 1975 CIN, 1998 SLN,
  2024 SFN), 25,665 of about 16 million plays.

**Data gaps**

- **Early seasons name no fielder on many outs** (Retrosheet's `99`), so
  putouts fall short of outs. Putouts as a share of outs recorded: 82% in the
  1900s, 85% in the 1910s, 93% from the 1920s through the 1940s, 99.3% in the
  1950s, and 99.8% or better from the 1960s on. Fielding totals before 1950
  undercount.
- **Four games have no game-log row**, so their scores cannot be checked:
  `PIT190010150`, `PIT190010160`, `PIT190010170`, `PIT190010180`.

**Maintenance**

- **`src/tools/validate-scores.ts` reads game-log fields itself**, repeating the
  field positions in `src/etl/gamelog.ts`. A change to one needs the same change
  in the other.
- **The tests and validation tools are run by hand.** The repo has no CI
  workflow.

## To do

- **Ansible playbook** — the setup scripts (`scripts/setup-macos.sh`,
  `scripts/setup-linux.sh`) plus *Install from scratch* are the recipe; express
  it declaratively as an Ansible role for reproducible provisioning across hosts
  (e.g. the `warehouse` Linux box): provision host → install Docker → clone →
  load → bring up `db`/`api`/`mcp`.
- **Higher play-by-play parity** — final scores now match the Retrosheet game
  logs in every game (`npm run validate:scores`), and `npm run audit:plays`
  reports no unknown events, unparsed advances, or impossible out-counts. Still
  unverified at play level: score-before, base-runner identity, and
  `pitching_daily.batters_faced`. Remaining work: a game-ordered harness that
  diffs base-runner destinations / pitcher / outs-before against the Chadwick
  oracle at scale, and resolving pinch-runner identity by lineup slot.
- **Phase 5** — the web front-end.
- **Forfeits, suspended games, and the official result** — the loader drops the
  game logs' forfeit and completion fields, so the mart stores the score when
  play stopped and a score-derived win or loss is wrong for forfeited games.
  Load both fields and expose the official result. The measurements are in
  `research/README.md`.
- **Attended-games table** — promote `research/hof-sightings/attended-games.tsv`
  to an `attended_game` table in the mart, so studies join it in the database.
  Two studies already read the file.
- **Split research into its own repository** — the studies only consume the
  mart. Three studies exist now; `research/README.md` is written to become the
  root README of that repository.
- **Reload only the seasons that changed** — investigate. Any data change now
  reloads every season (several minutes). `git diff --name-only` between the recorded
  `schema_meta.data_version` commit and the new one maps changed
  `seasons/<year>/` paths to seasons; per-game tables could be replaced a season
  at a time, while the small reference tables just reload. Open questions: the
  `--depth 1` clone may lack the old commit, and game logs aren't in the clone.

## Retrosheet terms of use

> The information used here was obtained free of charge from and is copyrighted
> by Retrosheet. Interested parties may contact Retrosheet at
> [www.retrosheet.org](https://www.retrosheet.org).

This project ships **no** Retrosheet data; you supply it at load time.
