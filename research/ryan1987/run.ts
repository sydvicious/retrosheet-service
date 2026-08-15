// Copyright (c) 2026 Syd Polk
// SPDX-License-Identifier: BSD-3-Clause
//
// Runs the Ryan 1987 analysis queries and writes one markdown file per
// analysis into this directory.
//
//   npm run research:ryan1987
//
// Defaults to the Plex box, which is production for this project. Reaching it
// requires Tailscale to be up on whatever machine you run this from. Override
// with DATABASE_URL to point somewhere else:
//
//   DATABASE_URL=postgres://retrosheet:retrosheet@localhost:5432/retrosheet \
//     npm run research:ryan1987
//
// PG_SCHEMA is honoured as usual. The database actually used is recorded in
// each generated file, so a table can always be traced to its source.
import { writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { makePool } from "../../src/db.js";
import { loadConfig } from "../../src/config.js";
import { analyses } from "./queries.js";

const outDir = dirname(fileURLToPath(import.meta.url));

/** Production. Deliberately not the service's localhost default — see header. */
const PLEX_DATABASE_URL = "postgres://retrosheet:retrosheet@plex:5432/retrosheet";

/** Host and database only; never let the password reach a log or a file. */
function describeTarget(url: string): string {
  try {
    const u = new URL(url);
    return `${u.hostname}:${u.port || "5432"}${u.pathname}`;
  } catch {
    return "unknown";
  }
}

function cell(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).replace(/\|/g, "\\|");
}

function markdownTable(rows: Record<string, unknown>[]): string {
  const first = rows[0];
  if (!first) return "_No rows returned._\n";
  const cols = Object.keys(first);
  const lines = [
    `| ${cols.join(" | ")} |`,
    `| ${cols.map(() => "---").join(" | ")} |`,
    ...rows.map((r) => `| ${cols.map((c) => cell(r[c])).join(" | ")} |`),
  ];
  return lines.join("\n") + "\n";
}

async function main(): Promise<void> {
  const cfg = loadConfig();
  // loadConfig() falls back to localhost, so read the env var directly to tell
  // "user asked for somewhere else" apart from "nobody said anything".
  const databaseUrl = process.env.DATABASE_URL ?? PLEX_DATABASE_URL;
  const target = describeTarget(databaseUrl);
  const pool = makePool(databaseUrl, cfg.schema);
  const generated = new Date().toISOString().slice(0, 10);
  console.log(`querying ${target}${process.env.DATABASE_URL ? "" : " (default)"}`);
  try {
    for (const a of analyses) {
      const res = await pool.query(a.sql);
      const rows = res.rows as Record<string, unknown>[];
      const body = [
        `# ${a.title}`,
        "",
        `_Generated ${generated} from \`${target}\` by \`npm run research:ryan1987\`. Do not edit by hand._`,
        "",
        ...(a.note ? [`> ${a.note}`, ""] : []),
        markdownTable(rows),
        "",
        "<details><summary>SQL</summary>",
        "",
        "```sql",
        a.sql.trim(),
        "```",
        "",
        "</details>",
        "",
      ].join("\n");
      const path = `${outDir}/${a.slug}.md`;
      await writeFile(path, body, "utf8");
      console.log(`wrote ${a.slug}.md (${rows.length} rows)`);
    }
  } finally {
    await pool.end();
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
