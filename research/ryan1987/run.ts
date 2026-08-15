// Copyright (c) 2026 Syd Polk
// SPDX-License-Identifier: BSD-3-Clause
//
// Runs the Ryan 1987 analysis queries and writes one markdown file per
// analysis into this directory.
//
//   npm run research:ryan1987
//
// Honours DATABASE_URL / PG_SCHEMA the same way the service does.
import { writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { makePool } from "../../src/db.js";
import { loadConfig } from "../../src/config.js";
import { analyses } from "./queries.js";

const outDir = dirname(fileURLToPath(import.meta.url));

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
  const pool = makePool(cfg.databaseUrl, cfg.schema);
  const generated = new Date().toISOString().slice(0, 10);
  try {
    for (const a of analyses) {
      const res = await pool.query(a.sql);
      const rows = res.rows as Record<string, unknown>[];
      const body = [
        `# ${a.title}`,
        "",
        `_Generated ${generated} by \`npm run research:ryan1987\`. Do not edit by hand._`,
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
