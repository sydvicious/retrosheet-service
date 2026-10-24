// Copyright (c) 2026 Syd Polk
// SPDX-License-Identifier: BSD-3-Clause
import { describe, it, expect } from "vitest";
import {
  parseDataVersion,
  classifyPaths,
  planChanges,
  describeChanges,
  formatChanges,
} from "../../src/etl/dataChanges.js";

const A = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const B = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

describe("parseDataVersion", () => {
  it("splits the clone commit from the game-log hash", () => {
    expect(parseDataVersion(`${A}+gl:0123456789abcdef`)).toEqual({
      commit: A,
      gamelogHash: "0123456789abcdef",
    });
  });
  it("returns undefined for an empty or malformed string", () => {
    expect(parseDataVersion("")).toBeUndefined();
    expect(parseDataVersion(undefined)).toBeUndefined();
    expect(parseDataVersion("not-a-version")).toBeUndefined();
    expect(parseDataVersion(`${A}+gl:`)).toBeUndefined();
  });
});

describe("classifyPaths", () => {
  it("maps a season directory to its year, whatever the file", () => {
    const c = classifyPaths([
      "seasons/1987/1987BAL.EVA",
      "seasons/1987/1987.EBA",
      "seasons/2019/BAL2019.ROS",
      "seasons/2019/2019schedule.csv",
    ]);
    expect(c.seasons).toEqual(["1987", "2019"]);
    expect(c.reference).toBe(false);
    expect(c.gamelog).toBe(false);
  });
  it("accepts any four-digit year, not a known range", () => {
    expect(classifyPaths(["seasons/1871/1871BS1.EVA"]).seasons).toEqual(["1871"]);
    expect(classifyPaths(["seasons/2026/2026BAL.EVA"]).seasons).toEqual(["2026"]);
  });
  it("treats an added, removed, or new file in a season the same way", () => {
    // git diff --name-only lists deleted and added paths alike.
    expect(classifyPaths(["seasons/1920/1920CHN.EVN"]).seasons).toEqual(["1920"]);
  });
  it("flags reference data and the postseason game logs", () => {
    const c = classifyPaths(["reference/biofile.csv", "gamelog/GLWS.TXT"]);
    expect(c.seasons).toEqual([]);
    expect(c.reference).toBe(true);
    expect(c.gamelog).toBe(true);
  });
  it("ignores paths the loader never reads", () => {
    const c = classifyPaths(["README.md", "boxscores/1987.EBA", "seasons/README", "seasons/notayear/x"]);
    expect(c.seasons).toEqual([]);
    expect(c.reference).toBe(false);
    expect(c.gamelog).toBe(false);
  });
  it("sorts and dedupes seasons", () => {
    const c = classifyPaths(["seasons/2001/a", "seasons/1999/b", "seasons/2001/c"]);
    expect(c.seasons).toEqual(["1999", "2001"]);
  });
});

describe("planChanges", () => {
  const gl = "0123456789abcdef";
  it("is full when either version is unknown", () => {
    expect(planChanges(undefined, `${B}+gl:${gl}`, []).full).toBe(true);
    expect(planChanges(`${A}+gl:${gl}`, "", []).full).toBe(true);
  });
  it("is empty when nothing differs", () => {
    const p = planChanges(`${A}+gl:${gl}`, `${A}+gl:${gl}`, []);
    expect(p.full).toBe(false);
    expect(p.seasons).toEqual([]);
    expect(p.reference).toBe(false);
    expect(p.gamelog).toBe(false);
  });
  it("marks the game logs when only their hash moved", () => {
    const p = planChanges(`${A}+gl:${gl}`, `${A}+gl:fedcba9876543210`, []);
    expect(p.full).toBe(false);
    expect(p.gamelog).toBe(true);
    expect(p.seasons).toEqual([]);
  });
  it("combines the diff's classification with the game-log hash", () => {
    const p = planChanges(`${A}+gl:${gl}`, `${B}+gl:${gl}`, ["seasons/1987/1987BAL.EVA", "reference/biofile.csv"]);
    expect(p.full).toBe(false);
    expect(p.seasons).toEqual(["1987"]);
    expect(p.reference).toBe(true);
    expect(p.gamelog).toBe(false);
  });
  it("includes the postseason game logs from the diff", () => {
    const p = planChanges(`${A}+gl:${gl}`, `${B}+gl:${gl}`, ["gamelog/GLWS.TXT"]);
    expect(p.gamelog).toBe(true);
  });
});

describe("describeChanges", () => {
  const base = { full: false, seasons: [] as string[], reference: false, gamelog: false };
  it("lists seasons, reference data and game logs in one sentence", () => {
    expect(describeChanges({ ...base, seasons: ["1987", "2019"], gamelog: true }))
      .toBe("seasons 1987, 2019; game logs");
    expect(describeChanges({ ...base, reference: true })).toBe("reference data");
    expect(describeChanges({ ...base, seasons: ["2026"], reference: true, gamelog: true }))
      .toBe("season 2026; reference data; game logs");
  });
  it("says so when nothing changed or everything must reload", () => {
    expect(describeChanges(base)).toBe("nothing");
    expect(describeChanges({ ...base, full: true })).toBe("everything (full reload)");
  });
});

describe("formatChanges", () => {
  const base = { full: false, seasons: [] as string[], reference: false, gamelog: false };
  it("prints key=value lines for a script to read", () => {
    expect(formatChanges({ ...base, seasons: ["1987", "2019"], gamelog: true }))
      .toBe("seasons=1987,2019\nreference=0\ngamelog=1");
  });
  it("prints just full for a full reload", () => {
    expect(formatChanges({ ...base, full: true })).toBe("full");
  });
});
