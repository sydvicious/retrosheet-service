// Copyright (c) 2026 Syd Polk
// SPDX-License-Identifier: BSD-3-Clause
//
// Hand-authored replay cases (Chadwick-free). These focus on base-running that
// Retrosheet encodes IMPLICITLY inside the event basic — stolen bases, caught
// stealing, and pickoffs — where the runner destination is not written as an
// explicit `.from-to` advance. Regression guard for the fix that advances (or
// retires) those runners so the `play` table's base state stays correct. The
// bulk event-level parity check lives in the dev-only harness
// (npm run validate:plays); this locks base-running behavior in for CI.
import { describe, it, expect } from "vitest";
import { replayGame, type PlayRow } from "../../src/parse/gameState.js";
import type { ParsedGame, PlayRecord } from "../../src/parse/eventFile.js";

/** Build a minimal one-inning (visitor batting) game from a list of events. */
function game(events: string[]): PlayRow[] {
  const plays: PlayRecord[] = events.map((event, i) => ({
    seq: i + 1,
    inning: 1,
    half: 0,
    batterId: `bat${String(i).padStart(2, "0")}`,
    count: "??",
    pitches: "",
    event,
  }));
  const g: ParsedGame = {
    gameId: "TST202401010",
    info: [],
    // Fielding pitchers so pitcherId is populated (side 1 pitches when half=0).
    starts: [
      { playerId: "pit_home", playerName: "H", side: 1, battingOrder: 0, fieldingPosition: 1 },
      { playerId: "pit_away", playerName: "A", side: 0, battingOrder: 0, fieldingPosition: 1 },
    ],
    subs: [],
    plays,
    comments: [],
    data: [],
    adjustments: [],
  };
  return replayGame(g).plays;
}

describe("replayGame — implicit stolen-base advances", () => {
  it("SB2 advances the runner from first to second", () => {
    const rows = game(["S8", "SB2"]);
    const sb = rows[1]!;
    expect(sb.eventCode).toBe(4); // stolenBase
    expect(sb.base1Before).toBe("bat00"); // the single's batter is on first
    expect(sb.run1Dest).toBe(2);
    expect(sb.batterDest).toBe(0); // batter stays at the plate on a steal
    expect(sb.outsOnPlay).toBe(0);
  });

  it("leaves the stealer on second for the following play", () => {
    const rows = game(["S8", "SB2", "S8"]);
    // Third play: a runner is now on second (the earlier stealer).
    expect(rows[2]!.base2Before).toBe("bat00");
  });

  it("SBH scores the runner from third (no RBI)", () => {
    const rows = game(["T9", "SBH"]);
    const sbh = rows[1]!;
    expect(sbh.base3Before).toBe("bat00");
    expect(sbh.run3Dest).toBe(4);
    expect(sbh.runsOnPlay).toBe(1);
    expect(sbh.rbi).toBe(0);
  });

  it("double steal (SB3;SB2) advances both runners", () => {
    // Two singles put runners on second (bat00, forced up) and first (bat01).
    const rows = game(["S8", "S8", "SB3;SB2"]);
    const ds = rows[2]!;
    expect(ds.base1Before).toBe("bat01");
    expect(ds.base2Before).toBe("bat00");
    expect(ds.run1Dest).toBe(2); // first -> second
    expect(ds.run2Dest).toBe(3); // second -> third
  });

  it("steal bundled with a strikeout (K+SB2) still advances the runner", () => {
    const rows = game(["S8", "K+SB2"]);
    const k = rows[1]!;
    expect(k.eventCode).toBe(3); // primary is the strikeout
    expect(k.outsOnPlay).toBe(1); // the batter is out
    expect(k.run1Dest).toBe(2); // the runner still steals second
  });

  it("an explicit advance overrides the implicit steal destination", () => {
    // SB2 with a throwing error sending the runner to third: explicit wins.
    const rows = game(["S8", "SB2.1-3(E2/TH)"]);
    expect(rows[1]!.run1Dest).toBe(3);
  });

  it("defensive indifference advances the runner (explicit advance, no steal)", () => {
    // DI is always written with an explicit advance in the data; the runner must
    // still advance even though it isn't a stolen base.
    const rows = game(["S8", "DI.1-2"]);
    expect(rows[1]!.eventCode).toBe(5); // defensiveIndifference
    expect(rows[1]!.base1Before).toBe("bat00");
    expect(rows[1]!.run1Dest).toBe(2);
  });
});

describe("replayGame — fielding lines", () => {
  it("attributes putouts/assists and innings to the stationed fielders", () => {
    const homeStarts = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((pos) => ({
      playerId: `h${pos}`, playerName: "", side: 1, battingOrder: pos, fieldingPosition: pos,
    }));
    const g: ParsedGame = {
      gameId: "TST202401010",
      info: [],
      starts: [...homeStarts, { playerId: "vP", playerName: "", side: 0, battingOrder: 0, fieldingPosition: 1 }],
      subs: [],
      plays: [
        { seq: 1, inning: 1, half: 0, batterId: "v1", count: "??", pitches: "", event: "63/G6" },
        { seq: 2, inning: 1, half: 0, batterId: "v2", count: "??", pitches: "", event: "K" },
      ],
      comments: [], data: [], adjustments: [],
    };
    const { fielding } = replayGame(g);
    const at = (player: string): (typeof fielding)[number] | undefined => fielding.find((f) => f.playerId === player);
    // 6-3 groundout: assist to short, putout to first.
    expect(at("h6")).toMatchObject({ position: 6, a: 1, po: 0, gamesStarted: true });
    expect(at("h3")).toMatchObject({ position: 3, po: 1, a: 0 });
    // Strikeout: putout to the catcher.
    expect(at("h2")).toMatchObject({ position: 2, po: 1 });
    // Innings-at-position: both outs logged for every stationed fielder.
    expect(at("h8")).toMatchObject({ position: 8, outs: 2, po: 0, a: 0 });
    expect(at("h6")!.outs).toBe(2);
  });
});

describe("replayGame — caught stealing / pickoffs remove the runner", () => {
  it("CS2 retires the runner from first", () => {
    const rows = game(["S8", "CS2(26)"]);
    const cs = rows[1]!;
    expect(cs.eventCode).toBe(6); // caughtStealing
    expect(cs.run1Dest).toBe(0); // out
    expect(cs.outsOnPlay).toBe(1);
    // Base is empty on the next play.
    expect(game(["S8", "CS2(26)", "S8"])[2]!.base1Before).toBeNull();
  });

  it("an error negates the caught stealing (runner safe)", () => {
    const rows = game(["S8", "CS2(2E6)"]);
    const cs = rows[1]!;
    expect(cs.run1Dest).toBe(2); // reached second on the error
    expect(cs.outsOnPlay).toBe(0);
  });

  it("PO1 picks the runner off first", () => {
    const rows = game(["S8", "PO1(13)"]);
    const po = rows[1]!;
    expect(po.run1Dest).toBe(0);
    expect(po.outsOnPlay).toBe(1);
  });

  it("POCS2 retires the runner who was on first", () => {
    const rows = game(["S8", "POCS2(136)"]);
    const po = rows[1]!;
    expect(po.base1Before).toBe("bat00");
    expect(po.run1Dest).toBe(0);
    expect(po.outsOnPlay).toBe(1);
  });

  it("a pickoff error keeps the runner safe with an explicit advance", () => {
    const rows = game(["S8", "PO1(E1).1-2"]);
    const po = rows[1]!;
    expect(po.run1Dest).toBe(2); // safe, advanced to second
    expect(po.outsOnPlay).toBe(0);
  });
});
