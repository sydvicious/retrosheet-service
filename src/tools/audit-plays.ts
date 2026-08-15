// Copyright (c) 2026 Syd Polk
// SPDX-License-Identifier: BSD-3-Clause
//
// DEV-ONLY audit harness (Chadwick-free). Replays the real event files and logs
// plays the clean-room parser does NOT fully understand, so parser gaps surface
// as concrete, prioritized work instead of hiding in ~16M plays. It flags:
//
//   unknown_event    — parseEvent classified the event as unknown (code 0)
//   unparsed_advance — a runner-advance token (after '.') the grammar can't read
//   outs_overflow    — replay put > 3 outs in a half-inning (a counting error)
//
// For each sample it also prints any `com` record immediately following the play
// (Retrosheet scorers often explain the odd ones there), which helps diagnosis.
//
//   RETROSHEET_DIR=… npm run audit:plays              # all seasons
//   RETROSHEET_DIR=… SEASONS=2024,1975 npm run audit:plays
import { readFileSync, existsSync } from "node:fs";
import { loadConfig } from "../config.js";
import { seasonYears, eventFiles } from "../etl/paths.js";
import { parseEventFile, type ParsedGame } from "../parse/eventFile.js";
import { parseEvent, EVENT_CD } from "../parse/playString.js";
import { replayGame } from "../parse/gameState.js";

type Category = "unknown_event" | "unparsed_advance" | "outs_overflow";
const CATEGORIES: Category[] = ["unknown_event", "unparsed_advance", "outs_overflow"];
const SAMPLE_CAP = 15;

interface Sample {
  gameId: string;
  event: string;
  detail: string;
  comment?: string;
}

/** Split on a delimiter char but not inside parentheses (mirrors the parser). */
function splitTopLevel(s: string, delim: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const c of s) {
    if (c === "(") depth++;
    else if (c === ")") depth = Math.max(0, depth - 1);
    if (c === delim && depth === 0) {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out;
}

const ADVANCE_RE = /^([B123])([-X])([123H])/;

/** Advance tokens (after the first top-level '.') the grammar cannot parse. */
function unparsedAdvances(event: string): string[] {
  const cleaned = event.replace(/[!?#]/g, "").trim();
  const parts = splitTopLevel(cleaned, ".");
  if (parts.length < 2) return [];
  const advancePart = parts.slice(1).join(".");
  const bad: string[] = [];
  for (const tok of splitTopLevel(advancePart, ";")) {
    const t = tok.trim();
    if (t !== "" && !ADVANCE_RE.test(t)) bad.push(t);
  }
  return bad;
}

/** Comment text(s) recorded immediately after the play at record index `seq`. */
function commentAfter(game: ParsedGame, seq: number): string | undefined {
  const texts = game.comments.filter((c) => c.seq === seq + 1).map((c) => c.text);
  return texts.length ? texts.join(" | ") : undefined;
}

function main(): void {
  const cfg = loadConfig();
  if (!existsSync(cfg.retrosheetDir)) {
    console.error(`RETROSHEET_DIR does not exist: ${cfg.retrosheetDir}`);
    process.exit(1);
  }
  const seasonsEnv = process.env.SEASONS?.split(",").map((s) => s.trim()).filter(Boolean);
  const only = seasonsEnv && seasonsEnv.length ? new Set(seasonsEnv) : undefined;
  const years = seasonYears(cfg.retrosheetDir).filter((y) => !only || only.has(y));

  const counts = new Map<Category, number>(CATEGORIES.map((c) => [c, 0]));
  const samples = new Map<Category, Sample[]>(CATEGORIES.map((c) => [c, []]));
  const unknownEvents = new Map<string, number>(); // event string → frequency
  let plays = 0;
  let games = 0;

  const record = (cat: Category, s: Sample): void => {
    counts.set(cat, (counts.get(cat) ?? 0) + 1);
    const bucket = samples.get(cat)!;
    if (bucket.length < SAMPLE_CAP) bucket.push(s);
  };

  for (const year of years) {
    for (const file of eventFiles(cfg.retrosheetDir, year)) {
      for (const g of parseEventFile(readFileSync(file, "utf8"))) {
        if (!g.gameId) continue;
        games++;
        for (const pr of g.plays) {
          const ev = pr.event.trim();
          if (ev === "" || ev === "NP") continue;
          plays++;
          const parsed = parseEvent(ev);
          if (parsed.eventCode === EVENT_CD.unknown) {
            unknownEvents.set(ev, (unknownEvents.get(ev) ?? 0) + 1);
            record("unknown_event", { gameId: g.gameId, event: ev, detail: "eventCode=0", comment: commentAfter(g, pr.seq) });
          }
          const bad = unparsedAdvances(ev);
          if (bad.length) {
            record("unparsed_advance", { gameId: g.gameId, event: ev, detail: bad.join(","), comment: commentAfter(g, pr.seq) });
          }
        }
        for (const row of replayGame(g).plays) {
          if (row.outsBefore + row.outsOnPlay > 3) {
            record("outs_overflow", {
              gameId: g.gameId, event: row.event,
              detail: `outsBefore=${row.outsBefore} + outsOnPlay=${row.outsOnPlay}`,
            });
          }
        }
      }
    }
  }

  console.log(`\nAudited ${plays.toLocaleString()} plays across ${games.toLocaleString()} games` +
    ` (${years.length} season(s)).\n`);
  for (const cat of CATEGORIES) {
    const n = counts.get(cat) ?? 0;
    const pct = plays ? ((n / plays) * 100).toFixed(3) : "0";
    console.log(`  ${cat.padEnd(18)} ${n.toLocaleString().padStart(10)}   (${pct}%)`);
  }

  if (unknownEvents.size) {
    console.log(`\nMost common unknown event strings:`);
    const top = [...unknownEvents.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20);
    for (const [ev, n] of top) console.log(`  ${String(n).padStart(7)}  ${ev}`);
  }

  for (const cat of CATEGORIES) {
    const bucket = samples.get(cat)!;
    if (!bucket.length) continue;
    console.log(`\nSample ${cat}:`);
    for (const s of bucket) {
      console.log(`  ${s.gameId}  ${s.event.padEnd(30)} ${s.detail}`);
      if (s.comment) console.log(`      com: ${s.comment}`);
    }
  }
}

main();
