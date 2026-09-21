// Copyright (c) 2026 Syd Polk
// SPDX-License-Identifier: BSD-3-Clause
//
// ETL entry point. Pure TypeScript — no Chadwick, no native tools. Runs
// identically on macOS, Linux, and in the loader container.
//
// Modes:
//   default            Hot data refresh: ensure the schema exists, then TRUNCATE
//                      + reload every table inside ONE transaction. Readers see
//                      old data until commit, then new data — the running API
//                      keeps serving and needs no restart.
//   --recreate         Drop and recreate the schema first (use when the table
//                      DEFINITIONS in sql/schema.sql changed; the API must be
//                      restarted afterward to expose structural changes).
//   --check            Load nothing. Exit 0 if the database is fully loaded at
//                      this code's SCHEMA_VERSION and ETL_VERSION from
//                      RETROSHEET_VERSION, or EXIT_NEEDS_LOAD if anything differs
//                      (empty, unversioned, another schema or ETL version, other
//                      data). scripts/update.sh uses this to reload only when
//                      needed.
//
// A recreate is ALSO forced automatically — even in the default hot-refresh mode —
// when the schema version stamped in the database differs from this code's
// SCHEMA_VERSION (src/etl/schemaVersion.ts). That makes a plain data refresh safe
// after a structural schema change: it won't silently load into stale tables. When
// that happens the API/mcp still need a restart to re-introspect (scripts/update.sh
// does this).
//
// Env:
//   SEASONS=2023,2024  Limit event loading to these seasons (default: all).
//   RECREATE=1         Same as --recreate.
//   RETROSHEET_VERSION Identity of the Retrosheet data being loaded (clone
//                      commit + game-log hash, from scripts/update.sh). Recorded
//                      in schema_meta on a full load; compared by --check.
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import type { Pool } from "pg";
import { loadConfig } from "../config.js";
import { makePool, applySchemaFile } from "../db.js";
import { SCHEMA_VERSION, ETL_VERSION } from "./schemaVersion.js";
import {
  loadPeople, loadTeams, loadBallparks, loadCoaches, loadEjections, loadRelatives,
} from "./reference.js";
import { loadRosters, loadSchedules } from "./seasons.js";
import { loadEvents, type LoadProgress } from "./events.js";
import { eventFiles, seasonYears } from "./paths.js";
import { loadDaily } from "./daily.js";
import { loadGameLogs } from "./gamelog.js";

/** "123 seasons - 1900; 1903; 1905-2025": the seasons that have event files. */
function describeSeasons(root: string): string {
  const years = seasonYears(root).filter((y) => eventFiles(root, y).length).map(Number);
  const ranges: string[] = [];
  for (let i = 0; i < years.length; i++) {
    const start = years[i]!;
    while (i + 1 < years.length && years[i + 1] === years[i]! + 1) i++;
    ranges.push(years[i] === start ? `${start}` : `${start}-${years[i]}`);
  }
  return `${years.length} seasons - ${ranges.join("; ")}`;
}

/** --check exit code: the database must be (re)loaded by this code. */
const EXIT_NEEDS_LOAD = 10;

const schemaSqlPath = fileURLToPath(new URL("../../sql/schema.sql", import.meta.url));

const ALL_TABLES = [
  "people", "teams", "ballparks", "coaches", "ejections", "relatives",
  "roster", "schedule", "game", "game_info", "lineup_start", "substitution",
  "comment", "earned_runs", "game_adjustment", "play",
  "batting_daily", "pitching_daily", "fielding_daily", "game_log",
];

// Decide whether the database must be dropped + recreated because its stored
// schema version differs from this code's SCHEMA_VERSION. Returns false for a
// brand-new (empty) database — there the normal ensure-schema path builds it from
// scratch and stamps the version.
async function schemaVersionMismatch(pool: Pool, schema: string): Promise<boolean> {
  const { rows } = await pool.query(
    `SELECT to_regclass($1) IS NOT NULL AS has_meta,
            to_regclass($2) IS NOT NULL AS has_core`,
    [`${schema}.schema_meta`, `${schema}.people`],
  );
  const hasMeta = rows[0]?.has_meta as boolean;
  const hasCore = rows[0]?.has_core as boolean;

  if (!hasMeta) {
    if (!hasCore) return false; // fresh, empty DB — nothing to recreate
    console.warn(
      "Schema is present but unversioned (built before schema versioning) — " +
        "forcing full database rebuild",
    );
    return true;
  }

  const dbVersion: number =
    (await pool.query(`SELECT version FROM ${schema}.schema_meta LIMIT 1`))
      .rows[0]?.version ?? 0;
  if (dbVersion !== SCHEMA_VERSION) {
    console.warn(
      `Schema version mismatch: database is v${dbVersion}, code is v${SCHEMA_VERSION} — ` +
        "forcing full database rebuild",
    );
    return true;
  }
  return false;
}

// --check: is the database already a full load of this data by this schema and
// this parser/loader?
// Unlike schemaVersionMismatch(), an empty database counts as needing a load.
async function isCurrent(pool: Pool, schema: string, dataVersion: string | undefined): Promise<boolean> {
  const { rows } = await pool.query(
    `SELECT to_regclass($1) IS NOT NULL AS has_meta`, [`${schema}.schema_meta`],
  );
  if (!rows[0]?.has_meta) {
    console.log("Database has no versioned schema — a load is needed.");
    return false;
  }
  const { version, data_version: loaded, etl_version: etlVersion } =
    (await pool.query(`SELECT * FROM ${schema}.schema_meta LIMIT 1`)).rows[0] ?? {};
  if (version !== SCHEMA_VERSION) {
    console.log(`Database is schema v${version ?? 0}, code is v${SCHEMA_VERSION} — a load is needed.`);
    return false;
  }
  if (etlVersion !== ETL_VERSION) {
    console.log(`Database was loaded by ETL v${etlVersion ?? 0}, code is v${ETL_VERSION} — a load is needed.`);
    return false;
  }
  if (!dataVersion) {
    console.log("RETROSHEET_VERSION is not set, so the data can't be compared — a load is needed.");
    return false;
  }
  if (loaded !== dataVersion) {
    console.log(`Database holds Retrosheet data ${loaded ?? "(unknown)"}, data dir is ${dataVersion} — a load is needed.`);
    return false;
  }
  console.log(
    `Database is current (schema v${SCHEMA_VERSION}, ETL v${ETL_VERSION}, Retrosheet data ${dataVersion}) — no load needed.`,
  );
  return true;
}

async function main(): Promise<void> {
  const cfg = loadConfig();
  const dataVersion = process.env.RETROSHEET_VERSION?.trim() || undefined;
  if (process.argv.includes("--check")) {
    const pool = makePool(cfg.databaseUrl);
    try {
      if (!(await isCurrent(pool, cfg.schema, dataVersion))) process.exitCode = EXIT_NEEDS_LOAD;
    } finally {
      await pool.end();
    }
    return;
  }
  const explicitRecreate = process.argv.includes("--recreate") || process.env.RECREATE === "1";
  const seasonsEnv = process.env.SEASONS?.split(",").map((s) => s.trim()).filter(Boolean);
  const seasons = seasonsEnv && seasonsEnv.length ? new Set(seasonsEnv) : undefined;
  const started = Date.now();

  if (!existsSync(cfg.retrosheetDir)) {
    throw new Error(
      `RETROSHEET_DIR does not exist: ${cfg.retrosheetDir}\n` +
        `Set RETROSHEET_DIR to a Retrosheet clone, or run scripts/fetch-data.sh.`,
    );
  }

  const pool = makePool(cfg.databaseUrl);
  try {
    // Force a full recreate when the code's SCHEMA_VERSION differs from what's
    // stamped in the DB, even without --recreate. This keeps a plain load (the
    // fast hot-refresh path) safe after a structural schema change: without it, the
    // idempotent CREATE ... IF NOT EXISTS schema would leave old table shapes in
    // place and the reload would load into them silently.
    const recreate = explicitRecreate || await schemaVersionMismatch(pool, cfg.schema);

    if (recreate) {
      console.log("Recreating schema …");
      await pool.query(`DROP SCHEMA IF EXISTS ${cfg.schema} CASCADE`);
    }
    console.log("Ensuring schema …");
    await applySchemaFile(pool, schemaSqlPath);
    // Stamp the current structural version so a later load can detect a mismatch.
    await pool.query(
      `INSERT INTO ${cfg.schema}.schema_meta (singleton, version) VALUES (true, $1)
         ON CONFLICT (singleton) DO UPDATE SET version = EXCLUDED.version, applied_at = now()`,
      [SCHEMA_VERSION],
    );
    console.log(`Schema ready (version ${SCHEMA_VERSION}). Reloading data …`);

    const counts: Record<string, number> = {};
    // Heartbeat clock: a line every 5s with elapsed time + live play count, so a
    // stall is obvious in seconds rather than after the whole load.
    const progress: LoadProgress = { plays: 0, label: "preparing", detail: "" };
    const ticker = setInterval(() => {
      const s = ((Date.now() - started) / 1000).toFixed(0);
      // Phases loading plays show the running count; other phases (daily
      // aggregation, commit) set `detail` so the line reflects real work.
      const seasonInfo = progress.seasonsTotal
        ? ` (${progress.seasonsDone}/${progress.seasonsTotal} seasons finished)`
        : "";
      const status = progress.detail || `${progress.plays.toLocaleString()} plays loaded${seasonInfo}`;
      console.log(`  … [${s}s] ${progress.label}: ${status}`);
    }, 5000);
    ticker.unref();

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`SET search_path TO ${cfg.schema}`);
      // Atomic swap: everything below is invisible to readers until COMMIT.
      await client.query(`TRUNCATE ${ALL_TABLES.join(", ")} RESTART IDENTITY CASCADE`);

      const root = cfg.retrosheetDir;
      progress.label = "reference/rosters/schedules";
      console.log("Loading reference, rosters, schedules …");
      // People first — coaches.player_id references it.
      counts.people = await loadPeople(client, root);
      counts.teams = await loadTeams(client, root);
      counts.ballparks = await loadBallparks(client, root);
      counts.coaches = await loadCoaches(client, root);
      counts.ejections = await loadEjections(client, root);
      counts.relatives = await loadRelatives(client, root);
      counts.roster = await loadRosters(client, root);
      counts.schedule = await loadSchedules(client, root);

      progress.label = "events (play-by-play)";
      console.log(
        seasons
          ? `Loading events + play-by-play for seasons: ${[...seasons].sort().join(", ")} …`
          : `Loading events + play-by-play (${describeSeasons(root)}) …`,
      );
      const eventCounts = await loadEvents(client, root, seasons, progress);
      Object.assign(counts, eventCounts);

      // Game logs (manager of record + game-level summary). Not season-filtered:
      // loads whatever game-log files are present in the data dir.
      progress.label = "game logs (managers)";
      progress.detail = "parsing + loading game logs …";
      console.log("Loading game logs (managers) …");
      counts.game_log = await loadGameLogs(client, root);
      progress.detail = "";

      // Phase 4: derive daily stat lines from the freshly-loaded play table
      // (pure SQL aggregation, same transaction).
      progress.label = "daily stat lines";
      console.log("Aggregating daily stat lines from plays …");
      const dailyCounts = await loadDaily(client, progress);
      Object.assign(counts, dailyCounts);

      // Record which data this is and which ETL produced it, in the same
      // transaction, so a failed load never claims it. A partial (SEASONS=) load
      // isn't the whole clone, so it records neither.
      await client.query(
        "UPDATE schema_meta SET data_version = $1, etl_version = $2, loaded_at = now()",
        [seasons ? null : dataVersion ?? null, seasons ? null : ETL_VERSION],
      );

      progress.label = "committing";
      progress.detail = "flushing the transaction …";
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      clearInterval(ticker);
      client.release();
    }

    console.log("\nLoaded rows:");
    for (const [table, n] of Object.entries(counts)) {
      console.log(`  ${table.padEnd(16)} ${n.toLocaleString()}`);
    }
    console.log(`\nDone in ${((Date.now() - started) / 1000).toFixed(1)}s.`);
  } finally {
    await pool.end();
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
