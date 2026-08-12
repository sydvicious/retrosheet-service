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
// Env:
//   SEASONS=2023,2024  Limit event loading to these seasons (default: all).
//   RECREATE=1         Same as --recreate.
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { loadConfig } from "../config.js";
import { makePool, applySchemaFile } from "../db.js";
import {
  loadPeople, loadTeams, loadBallparks, loadCoaches, loadEjections, loadRelatives,
} from "./reference.js";
import { loadRosters, loadSchedules } from "./seasons.js";
import { loadEvents } from "./events.js";

const schemaSqlPath = fileURLToPath(new URL("../../sql/schema.sql", import.meta.url));

const ALL_TABLES = [
  "people", "teams", "ballparks", "coaches", "ejections", "relatives",
  "roster", "schedule", "game", "game_info", "lineup_start", "substitution",
  "comment", "earned_runs", "game_adjustment",
];

async function main(): Promise<void> {
  const cfg = loadConfig();
  const recreate = process.argv.includes("--recreate") || process.env.RECREATE === "1";
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
    if (recreate) {
      console.log("Recreating schema (drop + create) …");
      await pool.query(`DROP SCHEMA IF EXISTS ${cfg.schema} CASCADE`);
    }
    console.log(`Ensuring schema (${schemaSqlPath}) …`);
    await applySchemaFile(pool, schemaSqlPath);

    const counts: Record<string, number> = {};
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`SET search_path TO ${cfg.schema}`);
      // Atomic swap: everything below is invisible to readers until COMMIT.
      await client.query(`TRUNCATE ${ALL_TABLES.join(", ")} RESTART IDENTITY CASCADE`);

      const root = cfg.retrosheetDir;
      // People first — coaches.player_id references it.
      counts.people = await loadPeople(client, root);
      counts.teams = await loadTeams(client, root);
      counts.ballparks = await loadBallparks(client, root);
      counts.coaches = await loadCoaches(client, root);
      counts.ejections = await loadEjections(client, root);
      counts.relatives = await loadRelatives(client, root);
      counts.roster = await loadRosters(client, root);
      counts.schedule = await loadSchedules(client, root);

      if (seasons) console.log(`Loading events for seasons: ${[...seasons].sort().join(", ")}`);
      const eventCounts = await loadEvents(client, root, seasons);
      Object.assign(counts, eventCounts);

      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
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
