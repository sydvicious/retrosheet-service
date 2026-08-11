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
- **Phase 2 — game/lineup/substitution/comment data** ⏳
- **Phase 3 — play-by-play events** ⏳
- **Phase 4 — daily stat lines** ⏳

## Design notes

- **Pure-TypeScript ETL, no Chadwick at runtime.** Deployed installations need
  no external baseball tools. The Retrosheet event parser is a **clean-room**
  implementation built solely from Retrosheet's published format spec. (The
  Chadwick tools are used only on a dev machine, as a black-box oracle, to
  generate golden test fixtures — never read as source; they are GPL.)
- **The database is a regenerable mart.** `sql/schema.sql` is applied wholesale
  by the loader; "update to a new Retrosheet release" = refresh the source data
  and reload.
- License: **BSD 3-Clause** (see `LICENSE`).

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

## Quickstart (native, on this Mac dev machine)

```bash
npm install
cp .env.example .env          # set RETROSHEET_DIR to your local clone
docker compose up -d db       # or point DATABASE_URL at any Postgres
npm run etl                   # populate
npm run dev                   # serve GraphQL at http://localhost:5050/
```

## Development

```bash
npm run typecheck   # tsc, no emit
npm test            # vitest — parser unit tests against golden fixtures
npm run build       # tsc -> dist/
```

## Retrosheet terms of use

> The information used here was obtained free of charge from and is copyrighted
> by Retrosheet. Interested parties may contact Retrosheet at
> [www.retrosheet.org](https://www.retrosheet.org).

This project ships **no** Retrosheet data; you supply it at load time.
