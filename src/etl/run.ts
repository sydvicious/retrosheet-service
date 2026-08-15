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
//
// A recreate is ALSO forced automatically — even in the default hot-refresh mode —
// when the schema version stamped in the database differs from this code's
// SCHEMA_VERSION (src/etl/schemaVersion.ts). That makes a plain data refresh safe
// after a structural schema change: it won't silently load into stale tables. When
// that happens the API/mcp still need a restart to re-introspect (update-service.sh
// does this; update-data.sh does not — prefer update-service.sh for code changes).
//
// Env:
//   SEASONS=2023,2024  Limit event loading to these seasons (default: all).
//   RECREATE=1         Same as --recreate.
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import type { Pool } from "pg";
import { loadConfig } from "../config.js";
import { makePool, applySchemaFile } from "../db.js";
import { SCHEMA_VERSION } from "./schemaVersion.js";
import {
  loadPeople, loadTeams, loadBallparks, loadCoaches, loadEjections, loadRelatives,
} from "./reference.js";
import { loadRosters, loadSchedules } from "./seasons.js";
import { loadEvents } from "./events.js";
import { loadDaily } from "./daily.js";
import { loadGameLogs } from "./gamelog.js";

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
        "forcing a full recreate.",
    );
    return true;
  }

  const dbVersion: number =
    (await pool.query(`SELECT version FROM ${schema}.schema_meta LIMIT 1`))
      .rows[0]?.version ?? 0;
  if (dbVersion !== SCHEMA_VERSION) {
    console.warn(
      `Schema version mismatch: database is v${dbVersion}, code is v${SCHEMA_VERSION} — ` +
        "forcing a full recreate so the new table definitions take effect.",
    );
    return true;
  }
  return false;
}

async function main(): Promise<void> {
  const cfg = loadConfig();
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
    // stamped in the DB, even without --recreate. This keeps update-data.sh (the
    // fast hot-refresh path) safe after a structural schema change: without it, the
    // idempotent CREATE ... IF NOT EXISTS schema would leave old table shapes in
    // place and the reload would load into them silently.
    const recreate = explicitRecreate || await schemaVersionMismatch(pool, cfg.schema);

    if (recreate) {
      console.log("Recreating schema (drop + create) …");
      await pool.query(`DROP SCHEMA IF EXISTS ${cfg.schema} CASCADE`);
    }
    console.log("Ensuring schema (creates any missing tables/indexes; drops nothing) …");
    await applySchemaFile(pool, schemaSqlPath);
    // Stamp the current structural version so a later load can detect a mismatch.
    await pool.query(
      `INSERT INTO ${cfg.schema}.schema_meta (singleton, version) VALUES (true, $1)
         ON CONFLICT (singleton) DO UPDATE SET version = EXCLUDED.version, applied_at = now()`,
      [SCHEMA_VERSION],
    );
    console.log(`Schema ready (version ${SCHEMA_VERSION}). Reloading data in one transaction …`);

    const counts: Record<string, number> = {};
    // Heartbeat clock: a line every 5s with elapsed time + live play count, so a
    // stall is obvious in seconds rather than after the whole load.
    const progress = { plays: 0, label: "preparing", detail: "" };
    const ticker = setInterval(() => {
      const s = ((Date.now() - started) / 1000).toFixed(0);
      // Phases loading plays show the running count; other phases (daily
      // aggregation, commit) set `detail` so the line reflects real work.
      const status = progress.detail || `${progress.plays.toLocaleString()} plays loaded`;
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
          : "Loading events + play-by-play (the long part; ~150 seasons) …",
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
