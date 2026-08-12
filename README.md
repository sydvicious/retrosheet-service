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
- **Phase 2 — game / lineup / substitution / comment data** ✅ ~199k games with
  metadata, starting lineups, substitutions, comments, earned runs, adjustments,
  and verbatim `game_info` — parsed clean-room from the event files.
- **Phase 6 — MCP server** ✅ read-only tools over the mart (stdio + streamable
  HTTP) so Claude can query the data. (See *MCP server* below.)
- **Phase 3 — play-by-play events** ✅ clean-room parser (~99.9% parity vs the
  Chadwick oracle) + game replay → the `play` table (event type, outs, RBIs,
  base state, pitcher, runner destinations). Ongoing refinement via
  `npm run validate:plays`.
- **Phase 4 — daily stat lines** ⏳
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
**Docker (engine running)** and **git** — no Node, Postgres, or Chadwick on the
host.

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
VM to run the Docker *engine*. On a headless box (e.g. a Plex server) the clean,
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

On **Linux**, run `./scripts/setup-linux.sh` (installs git + Docker Engine + the
Compose/Buildx plugins; no VM involved), or bootstrap a bare host remotely:

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/sydvicious/retrosheet-service/main/scripts/setup-linux.sh)"
```

It uses `sudo` as needed. Or do the equivalent by hand via your distro package
manager / `get.docker.com`.

## Install from scratch (Docker — Mac or Linux)

Prerequisites: **Docker** (engine running) and **git** — see *Prerequisites*
above. Nothing else is needed on the host; Node, Postgres, and the parser all run
in containers.

```bash
# 1. Clone this repo and enter it.
git clone https://github.com/sydvicious/retrosheet-service.git
cd retrosheet-service

# 2. Get the Retrosheet source data (clones into ./data; a few minutes).
#    Already have a clone? Skip this and use RETROSHEET_DIR in step 4 instead.
./scripts/fetch-data.sh

# 3. Bring up Postgres.
docker compose up -d db

# 4. Populate the database (one-shot loader). The play-by-play load takes
#    several minutes and prints a per-season heartbeat so you can see progress.
docker compose run --rm loader
#    …or from an existing Retrosheet clone instead of ./data:
#    RETROSHEET_DIR=/path/to/retrosheet docker compose run --rm loader

# 5. Bring up the GraphQL API and the MCP server.
docker compose up -d api mcp
```

Endpoints (replace `localhost` with the host name, e.g. `plex`):

- **GraphQL / GraphiQL** — http://localhost:5050/ (port 5050, not 5000 — on macOS
  the AirPlay Receiver in Control Center listens on 5000)
- **MCP** (streamable HTTP) — http://localhost:5051/mcp

## Update an existing installation

Two cases, depending on whether only the **data** changed or the **code** changed.

### A. New Retrosheet data only (no code change) — hot, no restart

`scripts/update-data.sh` pulls the latest Retrosheet data and reloads it in a
single transaction. The running services keep serving throughout — readers see
the old data until the reload commits, then the new data (queries briefly block
during the reload). No restart:

```bash
./scripts/update-data.sh
```

### B. New version of this service (code changed) — rebuild + reload

`scripts/update-service.sh` pulls new code, refreshes the Retrosheet data,
rebuilds the image, does one full recreate load, and recreates the services so
PostGraphile re-introspects the schema — code **and** data in a single load (set
`SKIP_DATA=1` to skip the data refresh):

```bash
./scripts/update-service.sh
```

The load prints an elapsed-time heartbeat every few seconds (`… [123s] events
1994: 3.9M plays loaded`), so you can tell it's alive and spot a stall
immediately. **On a remote host, run it inside `tmux`/`screen`** so a dropped SSH
session can't abort the multi-minute load:

```bash
tmux new -s retro './scripts/update-service.sh'   # reattach later: tmux attach -t retro
```

Equivalent manual steps:

```bash
git pull
docker compose build
RECREATE=1 docker compose run --rm loader
docker compose up -d --force-recreate api mcp
```

The recreate load reparses all play-by-play and takes several minutes (per-season
heartbeat shown). For a quick test load, limit seasons:

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
`get_roster`, `find_games`, `get_game`, `player_games`.

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
npm run typecheck   # tsc, no emit
npm test            # vitest — parser unit tests against golden fixtures
npm run build       # tsc -> dist/
npm run mcp         # run the MCP server (stdio); MCP_TRANSPORT=http for HTTP
```

## To do

- **Ansible playbook** — the setup scripts (`scripts/setup-macos.sh`,
  `scripts/setup-linux.sh`) plus *Install from scratch* are the recipe; express
  it declaratively as an Ansible role for reproducible provisioning across hosts
  (the Plex box, the future Linux PC): provision host → install Docker → clone →
  load → bring up `db`/`api`/`mcp`.
- **Higher play-by-play parity** — a game-ordered harness that diffs base-runner
  destinations / pitcher / outs-before against the Chadwick oracle at scale, and
  resolving pinch-runner identity by lineup slot.
- **Phase 4** — daily stat-line aggregation from `play`; **Phase 5** — the web
  front-end.

## Retrosheet terms of use

> The information used here was obtained free of charge from and is copyrighted
> by Retrosheet. Interested parties may contact Retrosheet at
> [www.retrosheet.org](https://www.retrosheet.org).

This project ships **no** Retrosheet data; you supply it at load time.
