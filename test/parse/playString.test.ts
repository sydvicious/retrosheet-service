// Copyright (c) 2026 Syd Polk
// SPDX-License-Identifier: BSD-3-Clause
//
// Hand-authored cases from the Retrosheet event spec (Chadwick-free). The bulk
// parity check against the Chadwick oracle lives in the dev-only harness
// (npm run validate:plays); these lock in behavior for CI.
import { describe, it, expect } from "vitest";
import { parseEvent, EVENT_CD } from "../../src/parse/playString.js";

describe("parseEvent — batter events", () => {
  it("single", () => {
    const p = parseEvent("S8");
    expect(p.eventCode).toBe(EVENT_CD.single);
    expect(p.hitValue).toBe(1);
    expect(p.atBat).toBe(true);
    expect(p.batterReached).toBe(true);
    expect(p.outsOnPlay).toBe(0);
  });

  it("single that drives in a run", () => {
    const p = parseEvent("S8/L78.3-H");
    expect(p.hitValue).toBe(1);
    expect(p.rbi).toBe(1);
    expect(p.outsOnPlay).toBe(0);
  });

  it("double", () => {
    const p = parseEvent("D7/L7LD");
    expect(p.eventCode).toBe(EVENT_CD.double);
    expect(p.hitValue).toBe(2);
  });

  it("solo home run scores the batter", () => {
    const p = parseEvent("HR/F9LD");
    expect(p.eventCode).toBe(EVENT_CD.homeRun);
    expect(p.hitValue).toBe(4);
    expect(p.rbi).toBe(1);
  });

  it("three-run home run", () => {
    const p = parseEvent("HR/F.1-H;2-H");
    expect(p.rbi).toBe(3);
  });

  it("strikeout is an at-bat and an out", () => {
    const p = parseEvent("K");
    expect(p.eventCode).toBe(EVENT_CD.strikeout);
    expect(p.atBat).toBe(true);
    expect(p.outsOnPlay).toBe(1);
    expect(p.batterReached).toBe(false);
  });

  it("strikeout reaching on a wild pitch is not an out", () => {
    const p = parseEvent("K+WP.B-1");
    expect(p.eventCode).toBe(EVENT_CD.strikeout);
    expect(p.wildPitch).toBe(true);
    expect(p.batterReached).toBe(true);
    expect(p.outsOnPlay).toBe(0);
  });

  it("dropped third strike, batter thrown out at first, is ONE out", () => {
    // The strikeout and the batter's out at first are the same runner; count once.
    const p = parseEvent("K.BX1(23)");
    expect(p.eventCode).toBe(EVENT_CD.strikeout);
    expect(p.batterReached).toBe(false);
    expect(p.outsOnPlay).toBe(1);
  });

  it("strikeout plus a caught stealing is two outs", () => {
    const p = parseEvent("K+CS2(26)");
    expect(p.eventCode).toBe(EVENT_CD.strikeout);
    expect(p.outsOnPlay).toBe(2);
  });

  it("walk and intentional walk are not at-bats", () => {
    expect(parseEvent("W").atBat).toBe(false);
    expect(parseEvent("W").eventCode).toBe(EVENT_CD.walk);
    expect(parseEvent("IW").eventCode).toBe(EVENT_CD.intentionalWalk);
    expect(parseEvent("HP").eventCode).toBe(EVENT_CD.hitByPitch);
    expect(parseEvent("HP").atBat).toBe(false);
  });
});

describe("parseEvent — outs, double plays, force outs", () => {
  it("routine groundout retires the batter", () => {
    const p = parseEvent("63");
    expect(p.eventCode).toBe(EVENT_CD.genericOut);
    expect(p.outsOnPlay).toBe(1);
    expect(p.batterReached).toBe(false);
  });

  it("ground into double play = 2 outs", () => {
    const p = parseEvent("36(1)1/GDP/G3");
    expect(p.doublePlay).toBe(true);
    expect(p.triplePlay).toBe(false);
    expect(p.outsOnPlay).toBe(2);
  });

  it("force out is one out and the batter is safe", () => {
    const p = parseEvent("5(2)/FO");
    expect(p.doublePlay).toBe(false);
    expect(p.outsOnPlay).toBe(1);
    expect(p.batterReached).toBe(true);
  });

  it("an 'X' advance negated by a fielding error is not an out", () => {
    // Fielder's choice; the runner is marked out at third but safe on the E5.
    const p = parseEvent("FC4/G4.1X3(456E5);B-2");
    expect(p.outsOnPlay).toBe(0);
  });

  it("lined into double play is a DP, not a TP", () => {
    const p = parseEvent("6(B)5(3)/LDP");
    expect(p.doublePlay).toBe(true);
    expect(p.triplePlay).toBe(false);
    expect(p.outsOnPlay).toBe(2);
  });

  it("sac fly: not an at-bat, scores a run, one out", () => {
    const p = parseEvent("8/SF.3-H");
    expect(p.sacFly).toBe(true);
    expect(p.atBat).toBe(false);
    expect(p.rbi).toBe(1);
    expect(p.outsOnPlay).toBe(1);
  });

  it("sacrifice hit (bunt) is not an at-bat", () => {
    const p = parseEvent("23/SH.1-2");
    expect(p.sacHit).toBe(true);
    expect(p.atBat).toBe(false);
  });
});

describe("parseEvent — running events", () => {
  it("stolen base is not a batter event and records no out", () => {
    const p = parseEvent("SB2");
    expect(p.eventCode).toBe(EVENT_CD.stolenBase);
    expect(p.atBat).toBe(false);
    expect(p.outsOnPlay).toBe(0);
  });

  it("caught stealing is one out", () => {
    const p = parseEvent("CS2(26)");
    expect(p.eventCode).toBe(EVENT_CD.caughtStealing);
    expect(p.outsOnPlay).toBe(1);
  });

  it("pickoff-caught-stealing codes as a pickoff and is an out", () => {
    const p = parseEvent("POCS2(236)");
    expect(p.eventCode).toBe(EVENT_CD.pickoff);
    expect(p.outsOnPlay).toBe(1);
  });

  it("a run that scores on a wild pitch earns no RBI", () => {
    const p = parseEvent("WP.3-H");
    expect(p.wildPitch).toBe(true);
    expect(p.rbi).toBe(0);
  });
});

describe("parseEvent — advance parsing", () => {
  it("parses multiple advances with fielders and out flags", () => {
    const p = parseEvent("S8/G6.3-H;2X3(64)");
    expect(p.advances).toHaveLength(2);
    expect(p.advances[0]).toMatchObject({ from: "3", to: "H", out: false });
    expect(p.advances[1]).toMatchObject({ from: "2", to: "3", out: true, params: ["64"] });
  });
});
