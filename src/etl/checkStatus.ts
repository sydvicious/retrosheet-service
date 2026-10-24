// Copyright (c) 2026 Syd Polk
// SPDX-License-Identifier: BSD-3-Clause
//
// The `--check` decision: compare what the database says it holds (its
// schema_meta row) with this code's versions and the data on disk. Pure, so
// the outcomes can be tested without a database; run.ts supplies the row and
// maps the result to an exit code for scripts/update.sh.

/** The schema_meta row, or undefined when the database has no versioned schema. */
export interface SchemaMeta {
  version?: number | null;
  etl_version?: number | null;
  data_version?: string | null;
}

export interface CodeVersions {
  schemaVersion: number;
  etlVersion: number;
}

/**
 * current      — fully loaded at this code's versions from this data; nothing to do.
 * empty        — no versioned schema: a first load, nothing to lose.
 * changed      — the schema or the ETL differs from what loaded the database,
 *                or no full load has finished at this schema: only a full
 *                reload can fix it.
 * data-changed — schema and ETL match but the Retrosheet data differs: a
 *                partial reload of what changed is possible (replace.ts).
 * unknown      — nothing to compare the data against: the database recorded no
 *                data version (a bare or partial load) or none was supplied.
 * loading      — another load holds the load lock (run.ts); schema_meta says
 *                nothing reliable until it finishes.
 */
export type CheckStatus = "current" | "empty" | "changed" | "data-changed" | "unknown" | "loading";

export const EXIT_CODES: Record<CheckStatus, number> = {
  current: 0,
  changed: 10,
  empty: 11,
  unknown: 12,
  "data-changed": 13,
  loading: 14,
};

export interface CheckResult {
  status: CheckStatus;
  exitCode: number;
  message: string;
}

export function checkStatus(
  meta: SchemaMeta | undefined,
  dataVersion: string | undefined,
  code: CodeVersions,
  loadRunning = false,
): CheckResult {
  const result = (status: CheckStatus, message: string): CheckResult =>
    ({ status, exitCode: EXIT_CODES[status], message });

  if (loadRunning) {
    return result("loading", "Another load is running on this database. Wait for it to finish, then check again.");
  }
  if (!meta) {
    return result("empty", "Database has no versioned schema — a first load is needed.");
  }
  if (meta.version !== code.schemaVersion) {
    return result("changed",
      `Database is schema v${meta.version ?? 0}, code is v${code.schemaVersion} — a reload is needed.`);
  }
  // The ETL version is stamped only when a full load commits; the schema
  // version is stamped before the load starts.
  if (meta.etl_version == null) {
    return result("changed",
      `Database is schema v${code.schemaVersion}, but no full load has finished at it: one failed or was ` +
        `stopped, or loaded only some seasons (SEASONS=). A reload is needed.`);
  }
  if (meta.etl_version !== code.etlVersion) {
    return result("changed",
      `Database was loaded by ETL v${meta.etl_version ?? 0}, code is v${code.etlVersion} — a reload is needed.`);
  }
  if (!dataVersion) {
    return result("unknown", "RETROSHEET_VERSION is not set, so the data can't be compared.");
  }
  if (meta.data_version == null) {
    return result("unknown",
      `Database recorded no Retrosheet data version (a bare or partial load), so the data can't be compared; data dir is ${dataVersion}.`);
  }
  if (meta.data_version !== dataVersion) {
    return result("data-changed",
      `Database holds Retrosheet data ${meta.data_version}, data dir is ${dataVersion} — the changed data needs reloading.`);
  }
  return result("current",
    `Database is current (schema v${code.schemaVersion}, ETL v${code.etlVersion}, Retrosheet data ${dataVersion}) — no load needed.`);
}
