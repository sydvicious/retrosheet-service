// Copyright (c) 2026 Syd Polk
// SPDX-License-Identifier: BSD-3-Clause
import { readFileSync } from "node:fs";
import { parse } from "csv-parse/sync";

/** Read a CSV file into an array of string arrays (no header interpretation). */
export function readRows(path: string): string[][] {
  const buf = readFileSync(path);
  return parse(buf, {
    columns: false,
    skip_empty_lines: true,
    relax_column_count: true,
    bom: true,
  }) as string[][];
}

/** Safe indexed access into a row: missing cells read as "" (→ SQL NULL on load). */
export function cell(row: string[], i: number): string {
  return row[i] ?? "";
}
