// Copyright (c) 2026 Syd Polk
// SPDX-License-Identifier: BSD-3-Clause
//
// Clean-room parser for the Retrosheet PLAY event string (the 7th field of a
// `play` record), implemented from Retrosheet's published event-file format
// specification. NEVER derived from Chadwick source; the Chadwick binaries are
// used only as a black-box oracle to generate golden fixtures for validation.
//
// This is an inherently iterative parser — the event grammar has a long tail of
// rare encodings and era quirks. It is structured so coverage can grow while the
// golden-fixture diff (see scripts/make-fixtures.sh + the validation harness)
// tracks parity against Chadwick.
//
// Structure of an event string:  <events>[.<advances>]
//   <events>   one or more sub-events joined by '+', each `<basic>[/<mod>...]`
//   <advances> ';'-separated runner advances like  3-H  1X2(64)  B-1(E4)
//
// Retrosheet EVENT_CD values (documented codes) used for classification.
export const EVENT_CD = {
  unknown: 0,
  noPlay: 1,
  genericOut: 2,
  strikeout: 3,
  stolenBase: 4,
  defensiveIndifference: 5,
  caughtStealing: 6,
  pickoffError: 7,
  pickoff: 8,
  wildPitch: 9,
  passedBall: 10,
  balk: 11,
  otherAdvance: 12,
  foulError: 13,
  walk: 14,
  intentionalWalk: 15,
  hitByPitch: 16,
  interference: 17,
  error: 18,
  fieldersChoice: 19,
  single: 20,
  double: 21,
  triple: 22,
  homeRun: 23,
} as const;

export interface Advance {
  from: string; // 'B' (batter) | '1' | '2' | '3'
  to: string; // '1' | '2' | '3' | 'H'
  out: boolean; // true when the runner was put out (encoded with 'X')
  params: string[]; // parenthetical annotations, e.g. 'E4', 'NR', '64', 'WP'
}

export interface SubEvent {
  basic: string; // e.g. 'S8', '36(1)1', 'K', 'W', 'SB2'
  modifiers: string[]; // tokens after '/', e.g. ['GDP','G3']
}

export interface ParsedPlay {
  raw: string;
  events: SubEvent[];
  advances: Advance[];
  eventCode: number;
  eventName: string;
  hitValue: number; // 0 none, 1 single, 2 double, 3 triple, 4 home run
  atBat: boolean;
  sacFly: boolean;
  sacHit: boolean;
  doublePlay: boolean;
  triplePlay: boolean;
  wildPitch: boolean;
  passedBall: boolean;
  outsOnPlay: number;
  rbi: number;
  batterReached: boolean;
}

/** Split on a delimiter char, but not when inside parentheses. */
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
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out;
}

/** Strip cosmetic annotations that don't change the meaning: ! ? # */
function stripAnnotations(s: string): string {
  return s.replace(/[!?#]/g, "");
}

function parseAdvance(token: string): Advance | null {
  // token like '3-H', '1X2(64)', 'B-1(E4)', '2-H(NR)'
  const m = /^([B123])([-X])([123H])(.*)$/.exec(token);
  if (!m) return null;
  const [, from = "", sep = "", to = "", rest = ""] = m;
  const params: string[] = [];
  const re = /\(([^)]*)\)/g;
  let g: RegExpExecArray | null;
  while ((g = re.exec(rest)) !== null) params.push(g[1] ?? "");
  return { from, to, out: sep === "X", params };
}

/**
 * Tokenize a fielder-sequence out basic (e.g. "63", "36(1)1", "5(2)", "6(B)5(3)")
 * into putouts. A "(base)" marks a runner (or batter, "(B)") retired; a bare
 * trailing fielder run is the batter retired at first. Force outs like "5(2)"
 * retire only the marked runner — the batter is safe.
 */
function fielderOuts(basic: string): { outs: number; batterOut: boolean } {
  const segs: { base: string | null }[] = [];
  const re = /(\d+)(?:\(([B123])\))?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(basic)) !== null) {
    if (m[0] === "") {
      re.lastIndex++;
      continue;
    }
    segs.push({ base: m[2] ?? null });
  }
  let outs = 0;
  let batterOut = false;
  for (let i = 0; i < segs.length; i++) {
    const seg = segs[i]!;
    if (seg.base !== null) {
      outs += 1;
      if (seg.base === "B") batterOut = true;
    } else if (i === segs.length - 1) {
      // bare trailing fielder run = batter putout at first
      outs += 1;
      batterOut = true;
    }
  }
  return { outs, batterOut };
}

interface BasicClass {
  code: number;
  hitValue: number;
  batterOut: boolean; // batter recorded out by the basic itself
  batterReached: boolean; // batter safe (hit / error / FC / walk / hbp)
  isBatterEvent: boolean;
}

function classifyBasic(basicRaw: string): BasicClass {
  const basic = basicRaw;
  const running = (code: number): BasicClass => ({
    code, hitValue: 0, batterOut: false, batterReached: false, isBatterEvent: false,
  });

  if (basic === "NP") return running(EVENT_CD.noPlay);
  if (basic.startsWith("SB")) return running(EVENT_CD.stolenBase);
  if (basic.startsWith("POCS")) return running(EVENT_CD.pickoff);
  if (basic.startsWith("CS")) return running(EVENT_CD.caughtStealing);
  if (basic.startsWith("PO")) return running(EVENT_CD.pickoff);
  if (basic.startsWith("WP")) return running(EVENT_CD.wildPitch);
  if (basic.startsWith("PB")) return running(EVENT_CD.passedBall);
  if (basic.startsWith("BK")) return running(EVENT_CD.balk);
  if (basic.startsWith("DI")) return running(EVENT_CD.defensiveIndifference);
  if (basic.startsWith("OA")) return running(EVENT_CD.otherAdvance);
  if (basic.startsWith("FLE")) return running(EVENT_CD.foulError);

  const batter = (code: number, hitValue: number, batterOut: boolean, batterReached: boolean): BasicClass =>
    ({ code, hitValue, batterOut, batterReached, isBatterEvent: true });

  // Hits (check before single-letter ambiguity; SB handled above).
  if (basic === "HR" || basic === "H" || /^HR?\d/.test(basic)) return batter(EVENT_CD.homeRun, 4, false, true);
  if (basic === "DGR") return batter(EVENT_CD.double, 2, false, true);
  if (/^S\d|^S$/.test(basic)) return batter(EVENT_CD.single, 1, false, true);
  if (/^D\d|^D$/.test(basic)) return batter(EVENT_CD.double, 2, false, true);
  if (/^T\d|^T$/.test(basic)) return batter(EVENT_CD.triple, 3, false, true);

  if (basic.startsWith("K")) return batter(EVENT_CD.strikeout, 0, true, false);
  if (basic.startsWith("IW") || basic === "I") return batter(EVENT_CD.intentionalWalk, 0, false, true);
  if (basic.startsWith("W")) return batter(EVENT_CD.walk, 0, false, true);
  if (basic.startsWith("HP")) return batter(EVENT_CD.hitByPitch, 0, false, true);
  if (basic.startsWith("E")) return batter(EVENT_CD.error, 0, false, true);
  if (basic.startsWith("FC")) return batter(EVENT_CD.fieldersChoice, 0, false, true);
  if (basic.startsWith("C") && !/^C\d/.test(basic)) return batter(EVENT_CD.interference, 0, false, true);

  // Fielder-sequence out (starts with a position digit), incl. GDP/GTP putouts.
  if (/^\d/.test(basic)) return batter(EVENT_CD.genericOut, 0, true, false);

  return batter(EVENT_CD.unknown, 0, false, false);
}

const NAME_BY_CODE: Record<number, string> = Object.fromEntries(
  Object.entries(EVENT_CD).map(([k, v]) => [v, k]),
);

export function parseEvent(rawInput: string): ParsedPlay {
  const raw = rawInput;
  const cleaned = stripAnnotations(rawInput.trim());

  // Split events from advances at the first top-level '.'.
  const dotParts = splitTopLevel(cleaned, ".");
  const eventsPart = dotParts[0] ?? "";
  const advancePart = dotParts.slice(1).join(".");

  const advances: Advance[] = [];
  if (advancePart) {
    for (const tok of splitTopLevel(advancePart, ";")) {
      const a = parseAdvance(tok.trim());
      if (a) advances.push(a);
    }
  }

  const events: SubEvent[] = [];
  for (const evTok of splitTopLevel(eventsPart, "+")) {
    const t = evTok.trim();
    if (t === "") continue;
    const parts = splitTopLevel(t, "/");
    events.push({ basic: parts[0] ?? "", modifiers: parts.slice(1) });
  }

  // Primary event = first batter event if present, else first sub-event.
  const classes = events.map((e) => classifyBasic(e.basic));
  let primaryIdx = classes.findIndex((c) => c.isBatterEvent);
  if (primaryIdx < 0) primaryIdx = 0;
  const primary = classes[primaryIdx] ?? classifyBasic("");
  const primaryEvent = events[primaryIdx];

  const hasMod = (re: RegExp): boolean =>
    events.some((e) => e.modifiers.some((m) => re.test(m)));

  const sacFly = hasMod(/^SF/);
  const sacHit = hasMod(/^SH/);
  // Double/triple play are indicated by a /DP-family or /TP-family modifier
  // (DP, GDP, LDP, FDP, …; TP, GTP, LTP). Force outs (/FO) are NOT double plays.
  const doublePlay = hasMod(/DP$/);
  const triplePlay = hasMod(/TP$/);
  const wildPitch = classes.some((c) => c.code === EVENT_CD.wildPitch);
  const passedBall = classes.some((c) => c.code === EVENT_CD.passedBall);

  // Batter out / reached, from the primary event.
  const primaryFielderOuts =
    primary.code === EVENT_CD.genericOut ? fielderOuts(primaryEvent?.basic ?? "") : null;
  let batterReached = primary.batterReached;
  if (primary.code === EVENT_CD.genericOut) batterReached = !(primaryFielderOuts?.batterOut ?? false);
  else if (primary.code === EVENT_CD.strikeout) batterReached = false;
  const batterAdvance = advances.find((a) => a.from === "B");
  if (batterAdvance) batterReached = !batterAdvance.out;

  // Outs on the play:
  //  - fielder-sequence outs from the primary out basic, OR a strikeout that
  //    retired the batter;
  //  - caught-stealing / pickoff running events (unless negated by an error);
  //  - runners put out on the bases (X advances).
  let outsOnPlay = 0;
  if (primaryFielderOuts) outsOnPlay += primaryFielderOuts.outs;
  // A strikeout retires the batter — but only count it here when the batter isn't
  // separately put out on the bases (e.g. dropped third strike, "K.BX1(23)"),
  // whose out is already tallied from the 'X' advance below. Otherwise the single
  // batter would be counted out twice.
  else if (primary.code === EVENT_CD.strikeout && !batterReached && !batterAdvance?.out) outsOnPlay += 1;
  for (const e of events) {
    const c = classifyBasic(e.basic);
    if (c.code === EVENT_CD.caughtStealing || c.code === EVENT_CD.pickoff) {
      if (!/E/.test(e.basic)) outsOnPlay += 1; // an error negates the out
    }
  }
  // A runner marked out ('X') whose parenthetical carries a fielding error was
  // safe on that error — don't count it as an out.
  outsOnPlay += advances.filter((a) => a.out && !a.params.some((p) => /E/.test(p))).length;

  // RBI: a run counts only when driven in by the batter's action. Exclude runs
  // that score on a non-batter event (WP/PB/SB/PO/OA/BK/DI) or via an error, and
  // any run explicitly flagged no-RBI.
  const primaryIsBatter = primary.isBatterEvent && primary.code !== EVENT_CD.noPlay;
  let rbi = 0;
  for (const a of advances) {
    if (a.to !== "H" || a.out) continue;
    const noRbi = a.params.some((p) => p === "NR" || p === "NORBI");
    const viaErrorOrWp = a.params.some((p) => /^E/.test(p) || p === "WP" || p === "PB" || p === "TH");
    if (noRbi || viaErrorOrWp || !primaryIsBatter) continue;
    rbi += 1;
  }
  // Home run: the batter scores even without an explicit B-H advance.
  if (primary.hitValue === 4 && !advances.some((a) => a.from === "B" && a.to === "H")) {
    rbi += 1;
  }

  const nonAtBatCodes = new Set<number>([
    EVENT_CD.walk, EVENT_CD.intentionalWalk, EVENT_CD.hitByPitch,
    EVENT_CD.interference, EVENT_CD.noPlay,
  ]);
  const atBat = primary.isBatterEvent && !nonAtBatCodes.has(primary.code) && !sacFly && !sacHit;

  return {
    raw,
    events,
    advances,
    eventCode: primary.code,
    eventName: NAME_BY_CODE[primary.code] ?? "unknown",
    hitValue: primary.hitValue,
    atBat,
    sacFly,
    sacHit,
    doublePlay,
    triplePlay,
    wildPitch,
    passedBall,
    outsOnPlay,
    rbi,
    batterReached,
  };
}
