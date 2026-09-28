// Copyright (c) 2026 Syd Polk
// SPDX-License-Identifier: BSD-3-Clause
//
// Hand-authored cases from the Retrosheet event spec (Chadwick-free). The bulk
// parity check against the Chadwick oracle lives in the dev-only harness
// (npm run validate:plays); these lock in behavior for CI.
import { describe, it, expect } from "vitest";
import { parseEvent, isRetired, runnersRetiredInBasic, EVENT_CD } from "../../src/parse/playString.js";

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

  it("an error on the fielding play leaves the batter safe at first, no out", () => {
    // 4E1: second baseman fields it, the pitcher covering first muffs it. No
    // explicit B-1 — the batter still reaches.
    const p = parseEvent("4E1/G4");
    expect(p.batterReached).toBe(true);
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

describe("parseEvent — fielding credits", () => {
  // Compact view: { position: "po-assist-error" }.
  const field = (ev: string): Record<number, string> => {
    const out: Record<number, string> = {};
    for (const c of parseEvent(ev).fielding) out[c.position] = `${c.po}-${c.assist}-${c.error}`;
    return out;
  };

  it("groundout 6-3: assist to short, putout to first", () => {
    expect(field("63/G6")).toEqual({ 6: "0-1-0", 3: "1-0-0" });
  });

  it("unassisted flyout: putout to the fielder, no assist", () => {
    expect(field("8/F")).toEqual({ 8: "1-0-0" });
  });

  it("6-4-3 double play credits both assists and both putouts", () => {
    expect(field("64(1)3/GDP")).toEqual({ 6: "0-1-0", 4: "1-1-0", 3: "1-0-0" });
  });

  it("a hit produces no fielding credit (the digit is location)", () => {
    expect(field("S8")).toEqual({});
  });

  it("strikeout is a putout for the catcher", () => {
    expect(field("K")).toEqual({ 2: "1-0-0" });
  });

  it("dropped third strike thrown out: catcher assist, first-base putout", () => {
    expect(field("K.BX1(23)")).toEqual({ 2: "0-1-0", 3: "1-0-0" });
  });

  it("plain error charges the fielder and records no putout", () => {
    expect(field("E6")).toEqual({ 6: "0-0-1" });
  });

  it("error on the throw to first: assist to the fielder, error on the receiver, no putout", () => {
    expect(field("4E1/G4")).toEqual({ 4: "0-1-0", 1: "0-0-1" });
  });

  it("caught stealing: catcher assist, tag putout", () => {
    expect(field("CS2(26)")).toEqual({ 2: "0-1-0", 6: "1-0-0" });
  });

  it("pickoff: assist and putout from the parenthetical fielders", () => {
    expect(field("PO1(13)")).toEqual({ 1: "0-1-0", 3: "1-0-0" });
  });

  it("runner thrown out on the bases after a hit is credited from the advance", () => {
    expect(field("S8.2X3(65)")).toEqual({ 6: "0-1-0", 5: "1-0-0" });
  });

  it("an error in an advance parenthetical charges that fielder", () => {
    expect(field("D7.2-H(E5)")).toEqual({ 5: "0-0-1" });
  });

  it("passed ball is charged to the catcher", () => {
    const c = parseEvent("PB.2-3").fielding.find((x) => x.position === 2);
    expect(c).toMatchObject({ position: 2, pb: 1, po: 0, assist: 0, error: 0 });
  });

  it("catcher's interference is both an error and an interference on the catcher", () => {
    const c = parseEvent("C/E2.B-1").fielding.find((x) => x.position === 2);
    expect(c).toMatchObject({ position: 2, error: 1, xi: 1, po: 0, assist: 0 });
  });
});

describe("isRetired — an error negates an 'X' advance", () => {
  const adv = (event: string, from: string) => parseEvent(event).advances.find((a) => a.from === from)!;

  it("a plain 'X' advance retires the runner", () => {
    expect(isRetired(adv("S8.2X3(65)", "2"))).toBe(true);
  });

  it("a '-' advance never retires the runner", () => {
    expect(isRetired(adv("S8.2-3", "2"))).toBe(false);
  });

  it("an error in the fielder sequence leaves the runner safe", () => {
    expect(isRetired(adv("FC6.1X2(6E4)", "1"))).toBe(false);
    expect(parseEvent("FC6.1X2(6E4)").outsOnPlay).toBe(0);
  });

  it("a dropped third strike with an error leaves the batter safe", () => {
    const p = parseEvent("K.BX1(2E3)");
    expect(isRetired(adv("K.BX1(2E3)", "B"))).toBe(false);
    expect(p.batterReached).toBe(true);
    expect(p.outsOnPlay).toBe(0);
  });

  it("an error followed by a clean putout sequence is still an out", () => {
    const p = parseEvent("D7.1-H;BXH(E4)(32)");
    expect(isRetired(adv("D7.1-H;BXH(E4)(32)", "B"))).toBe(true);
    expect(p.batterReached).toBe(false);
    expect(p.outsOnPlay).toBe(1);
  });
});

describe("isRetired — putout sequence carrying a throw modifier", () => {
  // KCA200607040, bottom 3rd: the runner from first was thrown out at home
  // 7-4-3-2; the separate E7 did not make him safe.
  it("1XH(7432/TH)(E7) is an out and two runs score", () => {
    const p = parseEvent("S7/L7S+.3-H;2-H;1XH(7432/TH)(E7)");
    expect(isRetired(p.advances.find((a) => a.from === "1")!)).toBe(true);
    expect(p.outsOnPlay).toBe(1);
  });
});

describe("runnersRetiredInBasic", () => {
  it("names the runner retired on a force out", () => {
    expect(runnersRetiredInBasic(parseEvent("64(1)/FO/G6").events)).toEqual(["1"]);
    expect(runnersRetiredInBasic(parseEvent("5(2)/FO/G56").events)).toEqual(["2"]);
  });

  it("names the runner, not the batter, on a double play", () => {
    expect(runnersRetiredInBasic(parseEvent("64(1)3/GDP").events)).toEqual(["1"]);
    expect(runnersRetiredInBasic(parseEvent("8(B)84(2)/LDP").events)).toEqual(["2"]);
  });

  it("is empty for plays with no marked runner", () => {
    expect(runnersRetiredInBasic(parseEvent("63/G6").events)).toEqual([]);
    expect(runnersRetiredInBasic(parseEvent("CS2(26)").events)).toEqual([]);
  });
});

describe("parseEvent — ground-rule double with a fielder digit", () => {
  it("DGR7 is a double, like a bare DGR", () => {
    for (const ev of ["DGR", "DGR7/F7LD+", "DGR9/L9LD"]) {
      const p = parseEvent(ev);
      expect(p.eventCode).toBe(EVENT_CD.double);
      expect(p.hitValue).toBe(2);
      expect(p.atBat).toBe(true);
      expect(p.batterReached).toBe(true);
      expect(p.outsOnPlay).toBe(0);
    }
  });

  it("counts RBI for runners driven in", () => {
    expect(parseEvent("DGR7/G5L.3-H;1-3").rbi).toBe(1);
  });
});

describe("parseEvent — NDP / NTP modifiers", () => {
  it("/NDP is not a double play", () => {
    expect(parseEvent("2(B)/FL/NDP.1X2(1363)").doublePlay).toBe(false);
    expect(parseEvent("9/AP/NDP.1X2(9243)").doublePlay).toBe(false);
  });

  it("/NTP is not a triple play", () => {
    expect(parseEvent("8/F8/NTP").triplePlay).toBe(false);
  });

  it("the double- and triple-play family still counts", () => {
    for (const ev of ["64(1)3/GDP", "8(B)84(2)/LDP", "9(B)93(1)/FDP", "K+CS2(26)/DP"]) {
      expect(parseEvent(ev).doublePlay).toBe(true);
    }
    expect(parseEvent("5(2)4(1)3/GTP").triplePlay).toBe(true);
    expect(parseEvent("1(B)16(2)63(1)/LTP").triplePlay).toBe(true);
  });
});

describe("parseEvent — wild pitch / passed ball flagged on an advance", () => {
  it("(PB) on an advance is a passed ball charged to the catcher", () => {
    for (const ev of ["SB2.1-2(PB)", "K+SB2.1-2(PB)", "SB2.3-H(PB)(NR)"]) {
      const p = parseEvent(ev);
      expect(p.passedBall).toBe(true);
      expect(p.wildPitch).toBe(false);
      expect(p.fielding.find((c) => c.position === 2)).toMatchObject({ pb: 1 });
    }
  });

  it("(WP) on an advance is a wild pitch", () => {
    const p = parseEvent("SBH.3-H(WP)");
    expect(p.wildPitch).toBe(true);
    expect(p.passedBall).toBe(false);
    expect(p.eventCode).toBe(EVENT_CD.stolenBase);
  });

  it("an advance without the flag is neither", () => {
    const p = parseEvent("SB2.1-3(E2/TH)");
    expect(p.wildPitch).toBe(false);
    expect(p.passedBall).toBe(false);
  });
});

describe("parseEvent — no RBI on a strikeout", () => {
  it("a run scoring on a strikeout with a wild pitch or passed ball is not an RBI", () => {
    expect(parseEvent("K+WP.3-H;B-1").rbi).toBe(0);
    expect(parseEvent("K+PB.3-H(UR);2-3;B-1").rbi).toBe(0);
  });

  it("other batter events still drive runs in", () => {
    expect(parseEvent("S8.3-H").rbi).toBe(1);
    expect(parseEvent("9/SF.3-H").rbi).toBe(1);
    expect(parseEvent("W.3-H;2-3;1-2").rbi).toBe(1);
  });
});

describe("parseEvent — fielding credits: strikeouts naming fielders", () => {
  const field = (ev: string): Record<number, string> =>
    Object.fromEntries(parseEvent(ev).fielding.map((c) => [c.position, `${c.po}-${c.assist}-${c.error}`]));

  it("a bare strikeout is a putout to the catcher", () => {
    expect(field("K")).toEqual({ 2: "1-0-0" });
  });

  it("K23 (dropped third strike): catcher assist, first baseman putout", () => {
    expect(field("K23")).toEqual({ 2: "0-1-0", 3: "1-0-0" });
    expect(parseEvent("K23").outsOnPlay).toBe(1);
  });

  it("a strikeout naming one fielder credits that fielder", () => {
    expect(field("K1")).toEqual({ 1: "1-0-0" });
    expect(field("K4")).toEqual({ 4: "1-0-0" });
  });

  it("a strikeout where the batter reaches credits no putout", () => {
    expect(field("K.B-1")).toEqual({});
  });
});

describe("parseEvent — fielding credits: a fielder who handles the ball twice", () => {
  const field = (ev: string): Record<number, string> =>
    Object.fromEntries(parseEvent(ev).fielding.map((c) => [c.position, `${c.po}-${c.assist}-${c.error}`]));

  it("the putout fielder also gets an assist when he threw earlier", () => {
    expect(field("343/G3L.2-3;1-2")).toEqual({ 3: "1-1-0", 4: "0-1-0" });
    expect(field("313/G3S")).toEqual({ 1: "0-1-0", 3: "1-1-0" });
  });

  it("a rundown gives each fielder one assist", () => {
    expect(field("CSH(262)")).toEqual({ 2: "1-1-0", 6: "0-1-0" });
    expect(field("CSH(2525)")).toEqual({ 2: "0-1-0", 5: "1-1-0" });
    expect(field("POCS2(1361)")).toEqual({ 1: "1-1-0", 3: "0-1-0", 6: "0-1-0" });
    expect(field("FC4.3XH(425151);B-3")).toEqual({ 1: "1-1-0", 2: "0-1-0", 4: "0-1-0", 5: "0-1-0" });
  });

  it("a relay after a putout assists the second out", () => {
    expect(field("3(1)63/GDP/G3")).toEqual({ 3: "2-1-0", 6: "0-1-0" });
    expect(field("43(B)63(1)/GDP")).toEqual({ 3: "2-1-0", 4: "0-1-0", 6: "0-1-0" });
  });

  it("an unassisted double play earns no assist", () => {
    expect(field("3(B)3(1)/LDP")).toEqual({ 3: "2-0-0" });
  });

  it("ordinary plays are unchanged", () => {
    expect(field("63/G6")).toEqual({ 3: "1-0-0", 6: "0-1-0" });
    expect(field("64(1)3/GDP")).toEqual({ 3: "1-0-0", 4: "1-1-0", 6: "0-1-0" });
    expect(field("8/F8")).toEqual({ 8: "1-0-0" });
  });
});

describe("parseEvent — fielding credits: unknown fielders", () => {
  it("99 credits nobody, with or without a runner marker", () => {
    expect(parseEvent("99").fielding).toEqual([]);
    expect(parseEvent("99(1)/FO").fielding).toEqual([]);
    expect(parseEvent("99(1)/FO").outsOnPlay).toBe(1);
  });
});
