# retrosheet-service — instructions for Claude

## What this is
A self-hostable **GraphQL API over the Retrosheet historical baseball data**,
backed by PostgreSQL. Two pieces:
1. A Postgres database populated from the Retrosheet source data (with a loader
   that recreates/updates it from new releases).
2. A PostGraphile GraphQL endpoint to query it.

Runs on macOS and Linux via Docker Compose (dev on Mac → Plex server → a Linux
PC later). Node 22 + TypeScript throughout.

## Hard constraints (do not violate)
* **No Chadwick dependency at runtime.** Deployed installations have no Chadwick
  tools. The ETL is pure TypeScript. Chadwick binaries are used **only on a dev
  machine, only for validation** (generating golden test fixtures).
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
(`scripts/fetch-data.sh` clones/updates into `./data`). Retrosheet's terms of
use require attribution — see README.

## Testing philosophy
Unit-test the parser's logic boundary (`src/parse/*`) against committed golden
fixtures; the test suite and CI have zero Chadwick dependency. Tests land with
fixes even when red — never skip/disable/mute to go green.
