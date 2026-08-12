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
- **Phase 3 — play-by-play events** ⏳
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
  running API keeps serving and needs no restart (see *Updating the data*).
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

`brew install docker` installs only the CLI *client*; macOS still needs a Linux
VM to run the Docker *engine*. On a headless box (e.g. a Plex server) the clean,
GUI-free route is **[Colima](https://github.com/abiosoft/colima)**:

```bash
# CLI client + Compose v2 & Buildx plugins + the Colima-backed engine.
# (Buildx is required to build images — Compose v2 `build` needs buildx >= 0.17.)
brew install colima docker docker-buildx docker-compose

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
Compose — but it's a GUI app you must keep running. On **Linux**, install Docker
Engine from your distro / `get.docker.com`; no VM involved.

## Quickstart (Docker — works on Mac or Linux)

```bash
# 1. Get the Retrosheet source data (clones into ./data, or set RETROSHEET_DIR).
./scripts/fetch-data.sh

# 2. Bring up Postgres.
docker compose up -d db

# 3. Populate the database (one-shot loader container).
docker compose run --rm loader

# 4. Bring up the GraphQL API.
docker compose up -d api
```

Then open **http://localhost:5050/** for GraphiQL, or POST GraphQL to
**http://localhost:5050/graphql**. (Port 5050, not 5000 — on macOS the AirPlay
Receiver in Control Center listens on 5000.)

To load from an existing local clone instead of `./data`:

```bash
RETROSHEET_DIR=/path/to/retrosheet docker compose run --rm loader
```

## Updating the data

**Routine update (a new Retrosheet release) — no restart.** The loader refreshes
data in place: it truncates and reloads every table inside a single transaction,
so readers see the old data until commit and the new data after. The running
`api` keeps serving throughout (queries briefly block during the reload, then
return fresh data). One command does the git pull + reload:

```bash
./scripts/refresh.sh
```

**Structural rebuild — after the table definitions change.** When `sql/schema.sql`
itself changes (new columns/tables between versions of *this* software), drop and
recreate the schema, then restart the API so PostGraphile re-introspects:

```bash
RECREATE=1 docker compose run --rm loader   # or: npm run etl -- --recreate
docker compose restart api
```

Load only some seasons (handy for testing) with `SEASONS`:

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

## Retrosheet terms of use

> The information used here was obtained free of charge from and is copyrighted
> by Retrosheet. Interested parties may contact Retrosheet at
> [www.retrosheet.org](https://www.retrosheet.org).

This project ships **no** Retrosheet data; you supply it at load time.
