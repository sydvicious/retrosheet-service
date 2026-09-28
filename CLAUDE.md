# retrosheet-service — instructions for Claude

## What this is
A self-hostable **GraphQL API over the Retrosheet historical baseball data**,
backed by PostgreSQL. Three pieces:
1. A Postgres database populated from the Retrosheet source data (with a loader
   that recreates/updates it from new releases).
2. A PostGraphile GraphQL endpoint to query it.
3. A read-only MCP server over the same database.

The repo also holds `research/`, studies run against the database.

Runs on macOS and Linux via Docker Compose (dev on Mac; production is the Linux
box `warehouse`). Node 22 + TypeScript throughout.

## Hard constraints (do not violate)
* **No Chadwick dependency at runtime.** Deployed installations have no Chadwick
  tools. The ETL is pure TypeScript. Chadwick binaries are used **only on a dev
  machine, only for validation** (generating golden fixtures with
  `scripts/make-fixtures.sh`).
* **Clean-room parser.** The Retrosheet event parser is implemented **solely
  from Retrosheet's published format specification**. **Never read Chadwick
  source code** (GPL). Running the Chadwick binaries as a black-box oracle is
  fine; reading their source is not.
* **No GPL anywhere in the repo.** Project license is **BSD 3-Clause**.
* **No commits/pushes/PRs from Claude.** Syd reviews all changes and does all git
  operations himself.

## Copyright header convention
* New source/text files get a header:
  `// Copyright (c) 2026 Syd Polk` and `// SPDX-License-Identifier: BSD-3-Clause`
  (comment syntax appropriate to the file type).
* When modifying a file with an existing notice in an earlier year, append the
  current year: `Copyright (c) 2026, 2027 Syd Polk` (skipping years is fine).

## Data source
Retrosheet data is **not committed** (large, separately copyrighted). Point
`RETROSHEET_DIR` at a local clone of `github.com/chadwickbureau/retrosheet`
(`scripts/fetch-data.sh` clones/updates into `./.data`). The regular-season
game logs are not in that clone; the same script downloads them from
retrosheet.org into `./.data/gamelog`, beside the postseason logs the clone
ships. Retrosheet's terms of use require attribution — see README.

## Testing philosophy
Unit-test the parser's logic boundary (`src/parse/*`) with hand-authored cases
written from the Retrosheet spec (`npm test`). The test suite has zero Chadwick
dependency and needs no Retrosheet data. Tests land with fixes even when red —
never skip/disable/mute to go green. The repo has no CI; tests are run by hand.

The golden fixtures are **not committed** (`test/fixtures/plays/` is gitignored
because the rows contain Retrosheet event strings). They exist only on a dev
machine and feed the dev-only validation tools, not the test suite:
* `npm run validate:plays` and `npm run validate:fielding` compare the parser
  with the Chadwick goldens.
* `npm run validate:scores` compares replayed final scores with the game logs.
* `npm run audit:plays` reports plays the parser does not fully understand.

`validate:scores` and `audit:plays` need the Retrosheet data but no Chadwick.
Run all four tools after a change to `src/parse/*`.

## Documentation
Keep the documentation accurate. When a figure or statement turns out to be
stale, correct it in the same change. README's **Known problems** section lists
the current open problems; update it when one is fixed or found.
