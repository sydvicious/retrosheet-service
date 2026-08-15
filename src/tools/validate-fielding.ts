// Copyright (c) 2026 Syd Polk
// SPDX-License-Identifier: BSD-3-Clause
//
// DEV-ONLY refinement harness for FIELDING credits. Reads the golden play
// fixtures (Chadwick `cwevent` output — oracle, source never read), runs our
// clean-room fielding parser on each EVENT_TX, and scores per-position
// putout/assist/error parity vs the oracle's PO*/ASS*/ERR* fielder columns.
//
//   RETROSHEET_DIR=… scripts/make-fixtures.sh   # (re)generate goldens
//   npm run validate:fielding                    # score parity
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "csv-parse/sync";
import { parseEvent } from "../parse/playString.js";

const dir = fileURLToPath(new URL("../../test/fixtures/plays", import.meta.url));
type Row = Record<string, string>;

/** Multiset of fielder positions, as a sorted comparable string, e.g. "3,6". */
function bag(positions: number[]): string {
  return [...positions].sort((a, b) => a - b).join(",");
}

function oursBags(ev: string): { po: string; a: string; e: string } {
  const po: number[] = [], a: number[] = [], e: number[] = [];
  for (const c of parseEvent(ev).fielding) {
    for (let i = 0; i < c.po; i++) po.push(c.position);
    for (let i = 0; i < c.assist; i++) a.push(c.position);
    for (let i = 0; i < c.error; i++) e.push(c.position);
  }
  return { po: bag(po), a: bag(a), e: bag(e) };
}

function theirsBags(r: Row): { po: string; a: string; e: string } {
  const cols = (names: string[]): number[] =>
    names.map((n) => Number(r[n] ?? "0")).filter((v) => v > 0);
  return {
    po: bag(cols(["PO1_FLD_CD", "PO2_FLD_CD", "PO3_FLD_CD"])),
    a: bag(cols(["ASS1_FLD_CD", "ASS2_FLD_CD", "ASS3_FLD_CD", "ASS4_FLD_CD", "ASS5_FLD_CD"])),
    e: bag(cols(["ERR1_FLD_CD", "ERR2_FLD_CD", "ERR3_FLD_CD"])),
  };
}

function main(): void {
  if (!existsSync(dir)) {
    console.error(`No fixtures at ${dir}. Run: RETROSHEET_DIR=… scripts/make-fixtures.sh`);
    process.exit(1);
  }
  const files = readdirSync(dir).filter((f) => f.endsWith(".csv"));
  const kinds = ["putouts", "assists", "errors", "all"] as const;
  const matched: Record<string, number> = { putouts: 0, assists: 0, errors: 0, all: 0 };
  const samples: Record<string, string[]> = { putouts: [], assists: [], errors: [], all: [] };
  let plays = 0;

  for (const file of files) {
    const rows = parse(readFileSync(join(dir, file)), { columns: true, skip_empty_lines: true }) as Row[];
    for (const r of rows) {
      const ev = (r.EVENT_TX ?? "").trim();
      if (ev === "" || ev === "NP") continue;
      plays++;
      const ours = oursBags(ev), theirs = theirsBags(r);
      const ok = { putouts: ours.po === theirs.po, assists: ours.a === theirs.a, errors: ours.e === theirs.e };
      const all = ok.putouts && ok.assists && ok.errors;
      for (const k of ["putouts", "assists", "errors"] as const) {
        if (ok[k]) matched[k] = (matched[k] ?? 0) + 1;
        else if (samples[k]!.length < 8) {
          const f = k === "putouts" ? "po" : k === "assists" ? "a" : "e";
          samples[k]!.push(`  ${ev.padEnd(30)} ours=[${ours[f]}] chadwick=[${theirs[f]}]`);
        }
      }
      if (all) matched.all = (matched.all ?? 0) + 1;
    }
  }

  console.log(`\nFielding parity over ${plays.toLocaleString()} plays from ${files.length} fixture file(s):\n`);
  for (const k of kinds) {
    const pct = plays ? ((matched[k]! / plays) * 100).toFixed(2) : "n/a";
    console.log(`  ${k.padEnd(9)} ${pct.padStart(6)}%   (${matched[k]}/${plays})`);
  }
  for (const k of ["putouts", "assists", "errors"] as const) {
    if (!samples[k]!.length) continue;
    console.log(`\nSample ${k} mismatches:`);
    for (const line of samples[k]!) console.log(line);
  }
}

main();
