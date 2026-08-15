// Copyright (c) 2026 Syd Polk
// SPDX-License-Identifier: BSD-3-Clause
//
// Replays a parsed game to produce one enriched row per play: the raw play plus
// the game context that isn't in the play record itself — outs before, score
// before, who's on each base, the current pitcher — and each runner's
// destination. Runner advances in Retrosheet event strings are explicit; forced
// advances (e.g. a bases-loaded walk) are inferred here.
//
// Base-runner ids are tracked best-effort; pinch-runner identity swaps are not
// yet resolved by lineup slot (a known refinement, validated later against the
// Chadwick oracle).
import { parseEvent, type SubEvent } from "./playString.js";
import type { ParsedGame } from "./eventFile.js";

export interface PlayRow {
  gameId: string;
  playSeq: number;
  inning: number;
  half: number; // 0 visiting bats, 1 home bats
  batterId: string;
  pitcherId: string | null;
  outsBefore: number;
  balls: number | null;
  strikes: number | null;
  pitchSeq: string;
  event: string;
  eventCode: number;
  eventName: string;
  hitValue: number;
  atBat: boolean;
  sacFly: boolean;
  sacHit: boolean;
  doublePlay: boolean;
  triplePlay: boolean;
  wildPitch: boolean;
  passedBall: boolean;
  outsOnPlay: number;
  rbi: number;
  runsOnPlay: number;
  awayScoreBefore: number;
  homeScoreBefore: number;
  base1Before: string | null;
  base2Before: string | null;
  base3Before: string | null;
  batterDest: number; // 0 = out/none, 1-3 = base, 4 = scored
  run1Dest: number;
  run2Dest: number;
  run3Dest: number;
}

/** One player's fielding line at one position in a game (see fielding_daily). */
export interface FieldingLine {
  playerId: string;
  position: number; // 1-9
  side: number; // fielding side: 0 = visiting, 1 = home
  games: number; // 1
  gamesStarted: boolean;
  outs: number; // defensive outs recorded while stationed (innings = outs/3)
  po: number;
  a: number;
  e: number;
  dp: number;
  tp: number;
  pb: number;
  xi: number;
}

export interface ReplayResult {
  plays: PlayRow[];
  fielding: FieldingLine[];
}

function baseNum(to: string): number {
  return to === "H" ? 4 : Number(to);
}

// Base a runner started on for a steal/caught-stealing/pickoff-CS of a target.
const STEAL_ORIGIN: Record<string, string> = { "2": "1", "3": "2", H: "3" };

/**
 * Runner movements that Retrosheet encodes IMPLICITLY inside a running-event
 * basic (the base is baked into the token instead of written as an explicit
 * `.from-to` advance):
 *   SB2  → runner on 1 steals 2       SBH  → runner on 3 steals home (scores)
 *   CS2  → runner on 1 caught stealing 2 (out)
 *   POCS2→ runner on 1 picked off / caught stealing 2 (out)
 *   PO1  → runner on 1 picked off (out; here the base is the ORIGIN, not a target)
 * An error in the token's parenthetical (e.g. `CS2(2E6)`, `PO1(E1)`) negates the
 * out — the runner is safe. Multi-steals arrive as one basic (`SB3;SB2`), so
 * every token in every sub-event is scanned. These are only DEFAULTS: an
 * explicit advance (the `.` part, e.g. `SB2.1-3(E2/TH)`) always wins, so the
 * caller merges these under, never over, the explicit advances.
 */
function impliedRunningAdvances(events: SubEvent[]): { from: string; to: string; out: boolean }[] {
  const moves: { from: string; to: string; out: boolean }[] = [];
  const re = /(POCS|SB|CS|PO)([123H])(?:\(([^)]*)\))?/g;
  for (const e of events) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(e.basic)) !== null) {
      const [, kind = "", base = "", paren = ""] = m;
      const hasError = /E/.test(paren);
      if (kind === "SB") {
        const from = STEAL_ORIGIN[base];
        if (from) moves.push({ from, to: base, out: false });
      } else if (kind === "CS" || kind === "POCS") {
        const from = STEAL_ORIGIN[base];
        if (from) moves.push({ from, to: base, out: !hasError });
      } else if (kind === "PO" && base !== "H") {
        // base is the origin; the runner is retired in place (error → safe, stays).
        moves.push({ from: base, to: base, out: !hasError });
      }
    }
  }
  return moves;
}

function parseCount(count: string): [number | null, number | null] {
  const m = /^(\d)(\d)$/.exec(count.trim());
  if (!m) return [null, null];
  return [Number(m[1]), Number(m[2])];
}

interface TimelineSub {
  kind: "sub";
  seq: number;
  side: number | null;
  fieldingPosition: number | null;
  playerId: string;
}
interface TimelinePlay {
  kind: "play";
  seq: number;
  inning: number;
  half: number;
  batterId: string;
  count: string;
  pitches: string;
  event: string;
}

export function replayGame(game: ParsedGame): ReplayResult {
  const rows: PlayRow[] = [];
  const bases: (string | null)[] = [null, null, null, null]; // index 1..3 used
  // Full defensive alignment by [side][position 1..9]; position 1 is the pitcher.
  // This is the general game-state scaffolding (who's at each position) that the
  // fielding lines consume and a future full-state project can build on.
  const fielders: (string | null)[][] = [new Array<string | null>(10).fill(null), new Array<string | null>(10).fill(null)];
  const score: [number, number] = [0, 0];

  // Fielding lines, keyed by player|position (a player fields for one side).
  const lines = new Map<string, FieldingLine>();
  const getLine = (side: number, player: string, pos: number): FieldingLine => {
    const key = `${player}|${pos}`;
    let l = lines.get(key);
    if (!l) {
      l = { playerId: player, position: pos, side, games: 1, gamesStarted: false, outs: 0, po: 0, a: 0, e: 0, dp: 0, tp: 0, pb: 0, xi: 0 };
      lines.set(key, l);
    }
    return l;
  };
  const setFielder = (side: number | null, pos: number | null, player: string): void => {
    if (side === null || pos === null || pos < 1 || pos > 9) return; // 10 DH, 11 PH, 12 PR don't field
    fielders[side]![pos] = player;
    getLine(side, player, pos); // records the appearance (games = 1)
  };

  // Starting fielders.
  for (const s of game.starts) {
    setFielder(s.side, s.fieldingPosition, s.playerId);
    if (s.side !== null && s.fieldingPosition !== null && s.fieldingPosition >= 1 && s.fieldingPosition <= 9) {
      getLine(s.side, s.playerId, s.fieldingPosition).gamesStarted = true;
    }
  }

  // Merge subs and plays into one time-ordered stream.
  const timeline: (TimelineSub | TimelinePlay)[] = [];
  for (const s of game.subs) {
    timeline.push({
      kind: "sub", seq: s.seq, side: s.side,
      fieldingPosition: s.fieldingPosition, playerId: s.playerId,
    });
  }
  for (const p of game.plays) {
    timeline.push({
      kind: "play", seq: p.seq, inning: p.inning, half: p.half,
      batterId: p.batterId, count: p.count, pitches: p.pitches, event: p.event,
    });
  }
  timeline.sort((a, b) => a.seq - b.seq);

  let curInning = -1;
  let curHalf = -1;
  let outs = 0;
  let playSeq = 0;

  for (const item of timeline) {
    if (item.kind === "sub") {
      setFielder(item.side, item.fieldingPosition, item.playerId);
      continue;
    }
    const play = item;
    const eventText = play.event.trim();
    if (eventText === "" || eventText === "NP") continue;

    if (play.inning !== curInning || play.half !== curHalf) {
      curInning = play.inning;
      curHalf = play.half;
      outs = 0;
      bases[1] = bases[2] = bases[3] = null;
    }

    const fielding = 1 - play.half;
    const pitcherId = fielders[fielding]![1] ?? null;
    const [balls, strikes] = parseCount(play.count);
    const p = parseEvent(eventText);

    const base1Before = bases[1] ?? null;
    const base2Before = bases[2] ?? null;
    const base3Before = bases[3] ?? null;
    const outsBefore = outs;
    const awayScoreBefore = score[0];
    const homeScoreBefore = score[1];

    // Explicit advances, keyed by origin base ('B','1','2','3').
    const adv = new Map<string, { to: string; out: boolean }>();
    for (const a of p.advances) adv.set(a.from, { to: a.to, out: a.out });
    // Fill in advances left implicit in the running-event basic (SB/CS/PO/POCS)
    // — but never override an explicit advance for the same runner.
    for (const imp of impliedRunningAdvances(p.events)) {
      if (!adv.has(imp.from)) adv.set(imp.from, { to: imp.to, out: imp.out });
    }

    // Batter destination.
    let batterDest = 0;
    const bAdv = adv.get("B");
    if (bAdv) batterDest = bAdv.out ? 0 : baseNum(bAdv.to);
    else if (p.hitValue > 0) batterDest = p.hitValue;
    else if (p.batterReached) batterDest = 1;

    // Runner destinations: explicit, else stay.
    const runnerDest: { 1: number; 2: number; 3: number } = { 1: 0, 2: 0, 3: 0 };
    for (const b of [1, 2, 3] as const) {
      if (bases[b] == null) continue;
      const a = adv.get(String(b));
      runnerDest[b] = a ? (a.out ? 0 : baseNum(a.to)) : b;
    }
    // Forced advances when the batter reaches first (chain up the bases).
    if (batterDest === 1) {
      if (bases[1] != null && !adv.has("1")) {
        runnerDest[1] = 2;
        if (bases[2] != null && !adv.has("2")) {
          runnerDest[2] = 3;
          if (bases[3] != null && !adv.has("3")) runnerDest[3] = 4;
        }
      }
    }

    // Apply movements to a fresh base state; count runs.
    let runs = 0;
    const next: (string | null)[] = [null, null, null, null];
    for (const b of [1, 2, 3] as const) {
      const id = bases[b];
      if (id == null) continue;
      const d = runnerDest[b];
      if (d === 4) runs++;
      else if (d >= 1 && d <= 3) next[d] = id;
    }
    if (batterDest === 4) runs++;
    else if (batterDest >= 1 && batterDest <= 3) next[batterDest] = play.batterId;

    if (play.half === 1) score[1] += runs;
    else score[0] += runs;
    outs += p.outsOnPlay;

    // Fielding: every stationed defender logs the play's outs (innings played),
    // and each parser fielding-credit is attributed to whoever holds that
    // position on the defensive side. DP/TP credit goes to each fielder with a
    // putout or assist on the play.
    for (let pos = 1; pos <= 9; pos++) {
      const pid = fielders[fielding]![pos];
      if (pid) getLine(fielding, pid, pos).outs += p.outsOnPlay;
    }
    for (const fc of p.fielding) {
      const pid = fielders[fielding]![fc.position];
      if (!pid) continue;
      const l = getLine(fielding, pid, fc.position);
      l.po += fc.po;
      l.a += fc.assist;
      l.e += fc.error;
      l.pb += fc.pb;
      l.xi += fc.xi;
      if (fc.po > 0 || fc.assist > 0) {
        if (p.doublePlay) l.dp += 1;
        if (p.triplePlay) l.tp += 1;
      }
    }

    rows.push({
      gameId: game.gameId,
      playSeq: playSeq++,
      inning: play.inning,
      half: play.half,
      batterId: play.batterId,
      pitcherId,
      outsBefore,
      balls,
      strikes,
      pitchSeq: play.pitches,
      event: eventText,
      eventCode: p.eventCode,
      eventName: p.eventName,
      hitValue: p.hitValue,
      atBat: p.atBat,
      sacFly: p.sacFly,
      sacHit: p.sacHit,
      doublePlay: p.doublePlay,
      triplePlay: p.triplePlay,
      wildPitch: p.wildPitch,
      passedBall: p.passedBall,
      outsOnPlay: p.outsOnPlay,
      rbi: p.rbi,
      runsOnPlay: runs,
      awayScoreBefore,
      homeScoreBefore,
      base1Before,
      base2Before,
      base3Before,
      batterDest,
      run1Dest: runnerDest[1] ?? 0,
      run2Dest: runnerDest[2] ?? 0,
      run3Dest: runnerDest[3] ?? 0,
    });

    bases[1] = next[1] ?? null;
    bases[2] = next[2] ?? null;
    bases[3] = next[3] ?? null;
  }

  return { plays: rows, fielding: [...lines.values()] };
}
