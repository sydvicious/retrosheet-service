// Copyright (c) 2026 Syd Polk
// SPDX-License-Identifier: BSD-3-Clause
import { readFile } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { Pool, type PoolClient } from "pg";
import { from as copyFrom } from "pg-copy-streams";

export function makePool(connectionString: string, searchPath?: string): Pool {
  return new Pool({
    connectionString,
    ...(searchPath ? { options: `-c search_path=${searchPath}` } : {}),
  });
}

/** Apply a full .sql file (multi-statement) in one shot. Used to (re)create the mart. */
export async function applySchemaFile(pool: Pool, path: string): Promise<void> {
  const sql = await readFile(path, "utf8");
  await pool.query(sql);
}

function csvField(v: string | null): string {
  // Empty string and null both map to SQL NULL (COPY ... WITH NULL '').
  if (v === null || v === "") return "";
  if (/[",\r\n]/.test(v)) return '"' + v.replace(/"/g, '""') + '"';
  return v;
}

/**
 * Bulk-load rows into `target` via COPY FROM STDIN. `rows` is streamed, so it
 * scales to large tables. Returns the number of rows written.
 */
export async function copyRows(
  client: PoolClient,
  target: string,
  columns: string[],
  rows: Iterable<(string | null)[]>,
): Promise<number> {
  const cols = columns.map((c) => `"${c}"`).join(", ");
  const sink = client.query(
    copyFrom(`COPY ${target} (${cols}) FROM STDIN WITH (FORMAT csv, NULL '')`),
  );
  let count = 0;
  function* lines(): Generator<string> {
    for (const row of rows) {
      count++;
      yield row.map(csvField).join(",") + "\n";
    }
  }
  await pipeline(Readable.from(lines()), sink);
  return count;
}
