// Copyright (c) 2026 Syd Polk
// SPDX-License-Identifier: BSD-3-Clause
//
// DEV-ONLY validation harness (Chadwick-free, no database). Replays the real
// event files, totals the runs the replay scored for each side, and compares
// them with the final score published in the Retrosheet game logs. The game
// logs are a separate Retrosheet download, so they are independent of the
// parser: a run the replay invents or drops shows up here as a mismatch.
//
// A matching final says the run totals per side are right. It does not check
// the score before each play, RBI, or any other play-level column.
//
// Exits 1 when any game disagrees, so it can gate a parser change.
//
//   RETROSHEET_DIR=… npm run validate:scores              # all seasons
//   RETROSHEET_DIR=… SEASONS=2024,1975 npm run validate:scores
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { loadConfig } from "../config.js";
import { seasonYears, eventFiles } from "../etl/paths.js";
import { parseEventFile } from "../parse/eventFile.js";
import { replayGame } from "../parse/gameState.js";

const SAMPLE_CAP = 25;

interface Final {
  visitor: number;
  home: number;
}

/**
 * Final scores by game id from every game-log file. Field positions and the
 * game id (home team + date + game number) mirror src/etl/gamelog.ts.
 */
function readGameLogFinals(root: string): Map<string, Final> {
  const finals = new Map<string, Final>();
  const dir = join(root, "gamelog");
  if (!existsSync(dir)) return finals;
  const files = readdirSync(dir).filter((n) => /\.txt$/i.test(n)).sort();
  for (const file of files) {
    for (const line of readFileSync(join(dir, file), "utf8").split(/\r?\n/)) {
      if (line.trim() === "") continue;
      const f = line.split(",").map((s) => s.replace(/^"(.*)"$/, "$1"));
      if (f.length < 93) continue;
      const date = (f[0] ?? "").trim();
      const home = (f[6] ?? "").trim();
      const num = (f[1] ?? "0").trim();
      const visitor = Number((f[9] ?? "").trim());
      const homeScore = Number((f[10] ?? "").trim());
      if (date === "" || home === "") continue;
      if (!Number.isInteger(visitor) || !Number.isInteger(homeScore)) continue;
      const gameId = `${home}${date}${num}`;
      if (!finals.has(gameId)) finals.set(gameId, { visitor, home: homeScore });
    }
  }
  return finals;
}

function main(): void {
  const cfg = loadConfig();
  const finals = readGameLogFinals(cfg.retrosheetDir);
  if (finals.size === 0) {
    console.error(`No game logs under ${join(cfg.retrosheetDir, "gamelog")}. Run: scripts/fetch-data.sh`);
    process.exit(1);
  }
  const wanted = (process.env.SEASONS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const years = seasonYears(cfg.retrosheetDir).filter((y) => wanted.length === 0 || wanted.includes(y));
  if (years.length === 0) {
    console.error(`No seasons found under ${join(cfg.retrosheetDir, "seasons")}.`);
    process.exit(1);
  }

  const byDecade = new Map<string, { games: number; mismatched: number }>();
  const samples: string[] = [];
  const noGameLog: string[] = [];
  let games = 0;
  let mismatched = 0;

  for (const year of years) {
    for (const file of eventFiles(cfg.retrosheetDir, year)) {
      for (const g of parseEventFile(readFileSync(file, "utf8"))) {
        if (!g.gameId) continue;
        const want = finals.get(g.gameId);
        if (!want) {
          noGameLog.push(g.gameId);
          continue;
        }
        const got: [number, number] = [0, 0];
        for (const p of replayGame(g).plays) {
          if (p.half === 1) got[1] += p.runsOnPlay;
          else got[0] += p.runsOnPlay;
        }
        games++;
        const decade = `${year.slice(0, 3)}0s`;
        const d = byDecade.get(decade) ?? { games: 0, mismatched: 0 };
        d.games++;
        if (got[0] !== want.visitor || got[1] !== want.home) {
          mismatched++;
          d.mismatched++;
          if (samples.length < SAMPLE_CAP) {
            samples.push(`  ${g.gameId}  replay ${got[0]}-${got[1]}  game log ${want.visitor}-${want.home}`);
          }
        }
        byDecade.set(decade, d);
      }
    }
  }

  const pct = (n: number, of: number): string => (of ? ((n / of) * 100).toFixed(2) : "0.00");
  console.log(`\nFinal-score check over ${games.toLocaleString()} games (${years.length} season(s)):\n`);
  console.log(`  matched     ${(games - mismatched).toLocaleString().padStart(9)}`);
  console.log(`  mismatched  ${mismatched.toLocaleString().padStart(9)}   (${pct(mismatched, games)}%)`);
  console.log(`  no game log ${noGameLog.length.toLocaleString().padStart(9)}`);

  console.log(`\nBy decade:`);
  for (const [decade, d] of [...byDecade.entries()].sort()) {
    console.log(`  ${decade}  ${d.games.toLocaleString().padStart(7)} games  ` +
      `${d.mismatched.toLocaleString().padStart(6)} mismatched  (${pct(d.mismatched, d.games)}%)`);
  }

  if (samples.length) {
    console.log(`\nSample mismatches (visitor-home):`);
    for (const s of samples) console.log(s);
  }
  if (noGameLog.length) {
    console.log(`\nGames with no game log row:`);
    for (const id of noGameLog.slice(0, SAMPLE_CAP)) console.log(`  ${id}`);
  }

  if (mismatched > 0) process.exit(1);
}

main();
