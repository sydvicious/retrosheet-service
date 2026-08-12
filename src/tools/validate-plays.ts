// Copyright (c) 2026 Syd Polk
// SPDX-License-Identifier: BSD-3-Clause
//
// DEV-ONLY refinement harness. Reads the golden play fixtures produced by
// scripts/make-fixtures.sh (Chadwick oracle output), runs our clean-room parser
// on each EVENT_TX, and reports per-field parity plus sample mismatches — the
// dashboard for iterating the parser toward Chadwick parity.
//
//   RETROSHEET_DIR=… scripts/make-fixtures.sh   # generate goldens (once)
//   npm run validate:plays                       # score parity
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "csv-parse/sync";
import { parseEvent, type ParsedPlay } from "../parse/playString.js";

const dir = fileURLToPath(new URL("../../test/fixtures/plays", import.meta.url));

type Row = Record<string, string>;
const truthy = (s: string): boolean => s === "T" || s === "t" || s === "1";
const num = (s: string): number => Number(s || "0");

interface FieldCheck {
  name: string;
  ours: (p: ParsedPlay) => number | boolean;
  theirs: (r: Row) => number | boolean;
}

const CHECKS: FieldCheck[] = [
  { name: "eventCode", ours: (p) => p.eventCode, theirs: (r) => num(r.EVENT_CD ?? "") },
  { name: "hitValue", ours: (p) => p.hitValue, theirs: (r) => num(r.H_CD ?? "") },
  { name: "atBat", ours: (p) => p.atBat, theirs: (r) => truthy(r.AB_FL ?? "") },
  { name: "sacFly", ours: (p) => p.sacFly, theirs: (r) => truthy(r.SF_FL ?? "") },
  { name: "sacHit", ours: (p) => p.sacHit, theirs: (r) => truthy(r.SH_FL ?? "") },
  { name: "doublePlay", ours: (p) => p.doublePlay, theirs: (r) => truthy(r.DP_FL ?? "") },
  { name: "triplePlay", ours: (p) => p.triplePlay, theirs: (r) => truthy(r.TP_FL ?? "") },
  { name: "outsOnPlay", ours: (p) => p.outsOnPlay, theirs: (r) => num(r.EVENT_OUTS_CT ?? "") },
  { name: "rbi", ours: (p) => p.rbi, theirs: (r) => num(r.RBI_CT ?? "") },
  { name: "wildPitch", ours: (p) => p.wildPitch, theirs: (r) => truthy(r.WP_FL ?? "") },
  { name: "passedBall", ours: (p) => p.passedBall, theirs: (r) => truthy(r.PB_FL ?? "") },
];

function main(): void {
  if (!existsSync(dir)) {
    console.error(`No fixtures at ${dir}. Run: RETROSHEET_DIR=… scripts/make-fixtures.sh`);
    process.exit(1);
  }
  const files = readdirSync(dir).filter((f) => f.endsWith(".csv"));
  if (files.length === 0) {
    console.error(`No .csv fixtures in ${dir}. Run scripts/make-fixtures.sh`);
    process.exit(1);
  }

  const matched = new Map<string, number>();
  const total = new Map<string, number>();
  const samples = new Map<string, string[]>();
  for (const c of CHECKS) {
    matched.set(c.name, 0);
    total.set(c.name, 0);
    samples.set(c.name, []);
  }

  let plays = 0;
  for (const file of files) {
    const rows = parse(readFileSync(join(dir, file)), { columns: true, skip_empty_lines: true }) as Row[];
    for (const r of rows) {
      const ev = (r.EVENT_TX ?? "").trim();
      if (ev === "" || ev === "NP") continue;
      plays++;
      const parsed = parseEvent(ev);
      for (const c of CHECKS) {
        total.set(c.name, (total.get(c.name) ?? 0) + 1);
        const a = c.ours(parsed);
        const b = c.theirs(r);
        if (a === b) {
          matched.set(c.name, (matched.get(c.name) ?? 0) + 1);
        } else {
          const s = samples.get(c.name)!;
          if (s.length < 6) s.push(`  ${ev.padEnd(28)} ours=${String(a)} chadwick=${String(b)}`);
        }
      }
    }
  }

  console.log(`\nParity over ${plays.toLocaleString()} plays from ${files.length} fixture file(s):\n`);
  for (const c of CHECKS) {
    const m = matched.get(c.name) ?? 0;
    const t = total.get(c.name) ?? 0;
    const pct = t ? ((m / t) * 100).toFixed(2) : "n/a";
    console.log(`  ${c.name.padEnd(12)} ${pct.padStart(6)}%   (${m}/${t})`);
  }
  console.log("\nSample mismatches:");
  for (const c of CHECKS) {
    const s = samples.get(c.name)!;
    if (s.length === 0) continue;
    console.log(`\n${c.name}:`);
    for (const line of s) console.log(line);
  }
}

main();
