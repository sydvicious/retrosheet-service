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
import { parseEvent } from "./playString.js";
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

function baseNum(to: string): number {
  return to === "H" ? 4 : Number(to);
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

export function replayGame(game: ParsedGame): PlayRow[] {
  const rows: PlayRow[] = [];
  const bases: (string | null)[] = [null, null, null, null]; // index 1..3 used
  const pitchers: (string | null)[] = [null, null]; // by team side (0 visitor, 1 home)
  const score: [number, number] = [0, 0];

  // Starting pitchers.
  for (const s of game.starts) {
    if (s.fieldingPosition === 1 && s.side !== null) pitchers[s.side] = s.playerId;
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
      if (item.fieldingPosition === 1 && item.side !== null) pitchers[item.side] = item.playerId;
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
    const pitcherId = pitchers[fielding] ?? null;
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

  return rows;
}
