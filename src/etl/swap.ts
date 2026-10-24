// Copyright (c) 2026 Syd Polk
// SPDX-License-Identifier: BSD-3-Clause
//
// The full load builds the mart in a side schema and renames it into place, so
// the running API and MCP keep reading the live schema for the whole load:
//
//   prepare   drop leftovers of a stopped load, create <schema>_next
//   load      apply sql/schema.sql and load every table into <schema>_next
//   swap      <schema> → <schema>_old, <schema>_next → <schema>
//
// all in ONE transaction, so a failed or stopped load leaves the live schema
// as it was and nothing behind. A rename locks no table, so queries running at
// the commit finish on the old tables and later ones find the new. Cleanup,
// after the commit, drops <schema>_old once those queries are done.

export interface LoadSchemas {
  live: string;
  next: string;
  old: string;
}

export function loadSchemas(schema: string): LoadSchemas {
  return { live: schema, next: `${schema}_next`, old: `${schema}_old` };
}

/** Clear what a stopped load or a failed cleanup left, and create the schema to load into. */
export function prepareStatements(s: LoadSchemas): string[] {
  return [
    `DROP SCHEMA IF EXISTS ${s.next} CASCADE`,
    `DROP SCHEMA IF EXISTS ${s.old} CASCADE`,
    `CREATE SCHEMA ${s.next}`,
  ];
}

/** Put the loaded schema in place of the live one; liveExists is false on a first load. */
export function swapStatements(s: LoadSchemas, liveExists: boolean): string[] {
  return [
    ...(liveExists ? [`ALTER SCHEMA ${s.live} RENAME TO ${s.old}`] : []),
    `ALTER SCHEMA ${s.next} RENAME TO ${s.live}`,
  ];
}

/** Drop the replaced schema, after the swap has committed. */
export function cleanupStatements(s: LoadSchemas): string[] {
  return [`DROP SCHEMA IF EXISTS ${s.old} CASCADE`];
}
