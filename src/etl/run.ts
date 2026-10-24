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
//   --replace seasons=1987 files=seasons/1909/1909DET.EVA games=DET190904140
//             rosters=2019:BAL schedules=2019 reference=0 gamelog=1
//                      Partial reload (Phases 2 and 5 of "Incremental
//                      updates.md"): in ONE transaction, delete the listed
//                      seasons' rows and reload them; delete the listed games
//                      plus the games the listed event files now hold, and load
//                      those files; replace the listed roster team-years and
//                      season schedules; re-aggregate daily lines for every
//                      reloaded game; reload the reference tables and/or
//                      game_log whole when asked. Takes the key=value lines
//                      scripts/data-changes.sh prints (it reads `games` from
//                      the files' old versions).
//                      Refused unless the database is a full load by this
//                      schema and ETL version with a recorded data version.
//                      Needs RETROSHEET_VERSION (the new data's version).
//   --recreate         Drop and recreate the schema first (use when the table
//                      DEFINITIONS in sql/schema.sql changed; the API must be
//                      restarted afterward to expose structural changes).
//   --data-version     Load nothing. Print the Retrosheet data version the
//                      database was loaded from (schema_meta.data_version), or
//                      an empty line if none is recorded.
//   --check            Load nothing. Exit 0 if the database is fully loaded at
//                      this code's SCHEMA_VERSION and ETL_VERSION from
//                      RETROSHEET_VERSION; 10 if the schema or ETL differs
//                      (full reload); 11 if the database has no versioned
//                      schema; 12 if the data can't be compared; 13 if only the
//                      data differs (partial reload possible) — checkStatus.ts
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
import { checkStatus, type SchemaMeta } from "./checkStatus.js";
import {
  parseReplaceArgs, seasonDeleteStatements, seasonGamePredicate, gameDeleteStatements,
  rosterDeleteStatement, scheduleDeleteStatement, REFERENCE_TABLES, type ReplacePlan,
} from "./replace.js";
import { join } from "node:path";
import {
  loadPeople, loadTeams, loadBallparks, loadCoaches, loadEjections, loadRelatives,
} from "./reference.js";
import { loadRosters, loadSchedules, loadRosterTeamYears } from "./seasons.js";
import { loadEvents, type LoadProgress, loadEventFiles, gameIdsInEventFile } from "./events.js";
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
// this parser/loader? Reads the schema_meta row and leaves the decision to
// checkStatus(); prints its message and returns its exit code.
async function checkCurrent(pool: Pool, schema: string, dataVersion: string | undefined): Promise<number> {
  const meta = await readSchemaMeta(pool, schema);
  const result = checkStatus(meta, dataVersion, { schemaVersion: SCHEMA_VERSION, etlVersion: ETL_VERSION });
  console.log(result.message);
  return result.exitCode;
}

/** The schema_meta row, or undefined when the database has no versioned schema. */
async function readSchemaMeta(pool: Pool, schema: string): Promise<SchemaMeta | undefined> {
  const { rows } = await pool.query(
    `SELECT to_regclass($1) IS NOT NULL AS has_meta`, [`${schema}.schema_meta`],
  );
  if (!rows[0]?.has_meta) return undefined;
  return (await pool.query(`SELECT * FROM ${schema}.schema_meta LIMIT 1`)).rows[0] as SchemaMeta | undefined;
}

// Heartbeat clock: a line every 5s with elapsed time + live play count, so a
// stall is obvious in seconds rather than after the whole load. Phases loading
// plays show the running count; other phases (daily aggregation, commit) set
// `detail` so the line reflects real work.
function startTicker(progress: LoadProgress, started: number): NodeJS.Timeout {
  const ticker = setInterval(() => {
    const s = ((Date.now() - started) / 1000).toFixed(0);
    const seasonInfo = progress.seasonsTotal
      ? ` (${progress.seasonsDone}/${progress.seasonsTotal} seasons finished)`
      : "";
    const status = progress.detail || `${progress.plays.toLocaleString()} plays loaded${seasonInfo}`;
    console.log(`  … [${s}s] ${progress.label}: ${status}`);
  }, 5000);
  ticker.unref();
  return ticker;
}

function printCounts(counts: Record<string, number>, started: number): void {
  console.log("\nLoaded rows:");
  for (const [table, n] of Object.entries(counts)) {
    console.log(`  ${table.padEnd(16)} ${n.toLocaleString()}`);
  }
  console.log(`\nDone in ${((Date.now() - started) / 1000).toFixed(1)}s.`);
}

// --replace: the partial load. Same transaction discipline as the full load —
// readers see the old rows until COMMIT, and a failure leaves them untouched.
async function replaceLoad(
  cfg: ReturnType<typeof loadConfig>,
  plan: ReplacePlan,
  dataVersion: string | undefined,
): Promise<void> {
  const started = Date.now();
  if (!dataVersion) {
    throw new Error("--replace needs RETROSHEET_VERSION (scripts/data-version.sh) to record what was loaded.");
  }
  const pool = makePool(cfg.databaseUrl);
  try {
    // A partial load only makes sense on a database that is a full load by this
    // schema and ETL, from a known data version; anything else needs the full load.
    const meta = await readSchemaMeta(pool, cfg.schema);
    const refuse = (why: string): never => {
      throw new Error(`--replace refused: ${why}. Run a full load instead.`);
    };
    if (!meta) throw new Error("--replace refused: the database has no versioned schema. Run a full load instead.");
    if (meta.version !== SCHEMA_VERSION) refuse(`database is schema v${meta.version ?? 0}, code is v${SCHEMA_VERSION}`);
    if (meta.etl_version !== ETL_VERSION) refuse(`database was loaded by ETL v${meta.etl_version ?? 0}, code is v${ETL_VERSION}`);
    if (meta.data_version == null) refuse("the database recorded no data version (a bare or partial load)");

    const what = [
      plan.seasons.length ? `seasons ${plan.seasons.join(", ")}` : "",
      plan.files.length ? `${plan.files.length} event file(s)` : "",
      plan.games.length && !plan.files.length ? `${plan.games.length} removed game(s)` : "",
      plan.rosters.length ? `rosters ${plan.rosters.join(", ")}` : "",
      plan.schedules.length ? `schedules ${plan.schedules.join(", ")}` : "",
      plan.reference ? "reference data" : "",
      plan.gamelog ? "game logs" : "",
    ].filter(Boolean).join("; ") || "nothing";
    console.log(`Replacing ${what} (from ${meta.data_version} to ${dataVersion}) …`);

    const counts: Record<string, number> = {};
    const progress: LoadProgress = { plays: 0, label: "preparing", detail: "" };
    const ticker = startTicker(progress, started);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`SET search_path TO ${cfg.schema}`);
      const root = cfg.retrosheetDir;

      if (plan.seasons.length) {
        const seasons = new Set(plan.seasons);
        progress.label = "deleting seasons";
        progress.detail = "deleting the seasons' rows …";
        for (const stmt of seasonDeleteStatements(plan.seasons)) {
          await client.query(stmt);
        }
        progress.detail = "";
        progress.label = "rosters/schedules";
        counts.roster = await loadRosters(client, root, seasons);
        counts.schedule = await loadSchedules(client, root, seasons);
        progress.label = "events (play-by-play)";
        Object.assign(counts, await loadEvents(client, root, seasons, progress));
        progress.label = "daily stat lines";
        const where = `game_id IN (SELECT game_id FROM game WHERE ${seasonGamePredicate(plan.seasons)})`;
        Object.assign(counts, await loadDaily(client, progress, where));
      }

      // File level: the games to replace are the ones the files' old versions
      // held (plan.games, read by the host from git) plus the ones the new
      // files hold now. Collected in a temp table so the deletes and the daily
      // predicate share one list without inlining thousands of ids.
      if (plan.files.length || plan.games.length) {
        const files = plan.files.map((f) => join(root, f)).filter((f) => existsSync(f));
        const ids = new Set(plan.games);
        for (const f of files) for (const id of gameIdsInEventFile(f)) ids.add(id);
        progress.label = "deleting games";
        progress.detail = `deleting ${ids.size} games' rows …`;
        await client.query("CREATE TEMP TABLE replaced_games (game_id text PRIMARY KEY) ON COMMIT DROP");
        if (ids.size) {
          await client.query("INSERT INTO replaced_games SELECT unnest($1::text[])", [[...ids]]);
        }
        for (const stmt of gameDeleteStatements()) {
          await client.query(stmt);
        }
        progress.detail = "";
        progress.label = "events (changed files)";
        Object.assign(counts, await loadEventFiles(client, files, undefined, progress));
        progress.label = "daily stat lines";
        Object.assign(counts, await loadDaily(client, progress, "game_id IN (SELECT game_id FROM replaced_games)"));
      }

      if (plan.rosters.length) {
        progress.label = "rosters";
        await client.query(rosterDeleteStatement(plan.rosters));
        counts.roster = (counts.roster ?? 0) + await loadRosterTeamYears(client, root, plan.rosters);
      }

      if (plan.schedules.length) {
        progress.label = "schedules";
        await client.query(scheduleDeleteStatement(plan.schedules));
        counts.schedule = (counts.schedule ?? 0) + await loadSchedules(client, root, new Set(plan.schedules));
      }

      if (plan.reference) {
        progress.label = "reference";
        progress.detail = "reloading the reference tables …";
        await client.query(`TRUNCATE ${REFERENCE_TABLES.join(", ")} RESTART IDENTITY`);
        counts.people = await loadPeople(client, root);
        counts.teams = await loadTeams(client, root);
        counts.ballparks = await loadBallparks(client, root);
        counts.coaches = await loadCoaches(client, root);
        counts.ejections = await loadEjections(client, root);
        counts.relatives = await loadRelatives(client, root);
        progress.detail = "";
      }

      if (plan.gamelog) {
        progress.label = "game logs (managers)";
        progress.detail = "reloading game_log …";
        await client.query("TRUNCATE game_log RESTART IDENTITY");
        counts.game_log = await loadGameLogs(client, root);
        progress.detail = "";
      }

      await client.query(
        "UPDATE schema_meta SET data_version = $1, etl_version = $2, loaded_at = now()",
        [dataVersion, ETL_VERSION],
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
    printCounts(counts, started);
  } finally {
    await pool.end();
  }
}

async function main(): Promise<void> {
  const cfg = loadConfig();
  const dataVersion = process.env.RETROSHEET_VERSION?.trim() || undefined;
  if (process.argv.includes("--data-version")) {
    const pool = makePool(cfg.databaseUrl);
    try {
      const { rows } = await pool.query(
        `SELECT to_regclass($1) IS NOT NULL AS has_meta`, [`${cfg.schema}.schema_meta`],
      );
      const stored = rows[0]?.has_meta
        ? (await pool.query(`SELECT data_version FROM ${cfg.schema}.schema_meta LIMIT 1`)).rows[0]?.data_version
        : null;
      console.log(stored ?? "");
    } finally {
      await pool.end();
    }
    return;
  }
  if (process.argv.includes("--check")) {
    const pool = makePool(cfg.databaseUrl);
    try {
      process.exitCode = await checkCurrent(pool, cfg.schema, dataVersion);
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

  const replace = parseReplaceArgs(process.argv);
  if (replace) {
    await replaceLoad(cfg, replace, dataVersion);
    return;
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
    const progress: LoadProgress = { plays: 0, label: "preparing", detail: "" };
    const ticker = startTicker(progress, started);

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

    printCounts(counts, started);
  } finally {
    await pool.end();
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
