// Copyright (c) 2026 Syd Polk
// SPDX-License-Identifier: BSD-3-Clause
//
// ETL entry point. Applies sql/schema.sql (drops + recreates the mart), then
// bulk-loads the Retrosheet data from RETROSHEET_DIR. Pure TypeScript — no
// Chadwick, no native tools. Runs identically on macOS, Linux, and in the
// loader container.
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { loadConfig } from "../config.js";
import { makePool, applySchemaFile } from "../db.js";
import {
  loadPeople, loadTeams, loadBallparks, loadCoaches, loadEjections, loadRelatives,
} from "./reference.js";
import { loadRosters, loadSchedules } from "./seasons.js";

const schemaSqlPath = fileURLToPath(new URL("../../sql/schema.sql", import.meta.url));

async function main(): Promise<void> {
  const cfg = loadConfig();
  const started = Date.now();

  if (!existsSync(cfg.retrosheetDir)) {
    throw new Error(
      `RETROSHEET_DIR does not exist: ${cfg.retrosheetDir}\n` +
        `Set RETROSHEET_DIR to a Retrosheet clone, or run scripts/fetch-data.sh.`,
    );
  }

  const pool = makePool(cfg.databaseUrl);
  try {
    console.log(`Applying schema (${schemaSqlPath}) …`);
    await applySchemaFile(pool, schemaSqlPath);

    const client = await pool.connect();
    try {
      await client.query(`SET search_path TO ${cfg.schema}`);
      const root = cfg.retrosheetDir;

      // People first — coaches.player_id references it.
      const counts: Record<string, number> = {};
      counts.people = await loadPeople(client, root);
      counts.teams = await loadTeams(client, root);
      counts.ballparks = await loadBallparks(client, root);
      counts.coaches = await loadCoaches(client, root);
      counts.ejections = await loadEjections(client, root);
      counts.relatives = await loadRelatives(client, root);
      counts.roster = await loadRosters(client, root);
      counts.schedule = await loadSchedules(client, root);

      console.log("\nLoaded rows:");
      for (const [table, n] of Object.entries(counts)) {
        console.log(`  ${table.padEnd(12)} ${n.toLocaleString()}`);
      }
    } finally {
      client.release();
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
