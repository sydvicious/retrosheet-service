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
    expect(p.seasons).toEqual([]); // one event file is a file-level change, not a season
    expect(p.eventFiles).toEqual(["seasons/1987/1987BAL.EVA"]);
    expect(p.reference).toBe(true);
    expect(p.gamelog).toBe(false);
  });
  it("includes the postseason game logs from the diff", () => {
    const p = planChanges(`${A}+gl:${gl}`, `${B}+gl:${gl}`, ["gamelog/GLWS.TXT"]);
    expect(p.gamelog).toBe(true);
  });
});

describe("describeChanges", () => {
  const base = {
    full: false, seasons: [] as string[], eventFiles: [] as string[], oldEventFiles: [] as string[],
    rosters: [] as string[], schedules: [] as string[], reference: false, gamelog: false,
  };
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
  const base = {
    full: false, seasons: [] as string[], eventFiles: [] as string[], oldEventFiles: [] as string[],
    rosters: [] as string[], schedules: [] as string[], reference: false, gamelog: false,
  };
  it("prints key=value lines for a script to read", () => {
    expect(formatChanges({ ...base, seasons: ["1987", "2019"], gamelog: true }))
      .toBe("seasons=1987,2019\nreference=0\ngamelog=1");
  });
  it("prints just full for a full reload", () => {
    expect(formatChanges({ ...base, full: true })).toBe("full");
  });
});

// ---- Phase 5: file-level classification -------------------------------------
import { classifyChanges, type ChangeEntry } from "../../src/etl/dataChanges.js";

const e = (status: string, path: string): ChangeEntry => ({ status, path });

describe("classifyChanges (file level)", () => {
  it("replaces a modified event file: load it, and delete the games its old version held", () => {
    const c = classifyChanges([e("M", "seasons/1909/1909DET.EVA")]);
    expect(c.seasons).toEqual([]);
    expect(c.eventFiles).toEqual(["seasons/1909/1909DET.EVA"]);
    expect(c.oldEventFiles).toEqual(["seasons/1909/1909DET.EVA"]);
  });
  it("loads an added event file with nothing to delete, and deletes a removed one with nothing to load", () => {
    const c = classifyChanges([e("A", "seasons/2026/2026BAL.EVA"), e("D", "seasons/1943/1943CLE.EVA")]);
    expect(c.eventFiles).toEqual(["seasons/2026/2026BAL.EVA"]);
    expect(c.oldEventFiles).toEqual(["seasons/1943/1943CLE.EVA"]);
    expect(c.seasons).toEqual([]);
  });
  it("accepts .EVN, .EVA, .EVE and .EVR (Negro Leagues) in any case, as paths.ts reads them", () => {
    const c = classifyChanges([e("M", "seasons/1990/1990CHN.EVN"), e("M", "seasons/1990/1990als.eve"), e("M", "seasons/1935/1935.EVR")]);
    expect(c.eventFiles).toEqual(["seasons/1935/1935.EVR", "seasons/1990/1990CHN.EVN", "seasons/1990/1990als.eve"]);
  });
  it("replaces a roster file as its team-year, whatever happened to the file", () => {
    const c = classifyChanges([e("M", "seasons/2019/BAL2019.ROS"), e("D", "seasons/2019/ANA2019.ROS"), e("A", "seasons/1871/BS1-1871.ROS")]);
    expect(c.rosters).toEqual(["1871:BS1-", "2019:ANA", "2019:BAL"].sort());
  });
  it("replaces a season's schedule when its schedule file changed", () => {
    expect(classifyChanges([e("M", "seasons/2019/2019schedule.csv")]).schedules).toEqual(["2019"]);
  });
  it("ignores files the loader does not read, even inside a season", () => {
    const c = classifyChanges([e("M", "seasons/2019/2019.EBA"), e("M", "seasons/2019/2019.txt"), e("M", "README.md")]);
    expect(c.seasons).toEqual([]);
    expect(c.eventFiles).toEqual([]);
    expect(c.rosters).toEqual([]);
    expect(c.schedules).toEqual([]);
  });
  it("falls back to the whole season for a status it does not understand", () => {
    const c = classifyChanges([e("R100", "seasons/1920/1920CHN.EVN"), e("M", "seasons/1920/1920BSN.EVN")]);
    expect(c.seasons).toEqual(["1920"]);
    expect(c.eventFiles).toEqual([]);
    expect(c.oldEventFiles).toEqual([]);
  });
  it("falls back to the whole season when more than maxFilesPerSeason event files changed", () => {
    const many = Array.from({ length: 11 }, (_, i) => e("M", `seasons/1987/1987T${i}.EVA`));
    expect(classifyChanges(many).seasons).toEqual(["1987"]);
    expect(classifyChanges(many, { maxFilesPerSeason: 11 }).seasons).toEqual([]);
    expect(classifyChanges(many, { maxFilesPerSeason: 11 }).eventFiles.length).toBe(11);
  });
  it("still flags reference data and the clone's game logs", () => {
    const c = classifyChanges([e("M", "reference/biofile.csv"), e("A", "gamelog/GLWS.TXT")]);
    expect(c.reference).toBe(true);
    expect(c.gamelog).toBe(true);
  });
  it("keeps a whole-season fallback from swallowing other seasons' file-level changes", () => {
    const c = classifyChanges([e("R100", "seasons/1920/x.EVN"), e("M", "seasons/1909/1909DET.EVA")]);
    expect(c.seasons).toEqual(["1920"]);
    expect(c.eventFiles).toEqual(["seasons/1909/1909DET.EVA"]);
  });
});

describe("planChanges / formatChanges / describeChanges at file level", () => {
  const gl = "0123456789abcdef";
  const entries = [e("M", "seasons/1909/1909DET.EVA"), e("D", "seasons/1943/1943CLE.EVA"), e("M", "seasons/2019/BAL2019.ROS"), e("M", "seasons/2019/2019schedule.csv")];
  it("carries the file-level sets through planChanges", () => {
    const p = planChanges(`${A}+gl:${gl}`, `${B}+gl:${gl}`, entries);
    expect(p.full).toBe(false);
    expect(p.eventFiles).toEqual(["seasons/1909/1909DET.EVA"]);
    expect(p.oldEventFiles).toEqual(["seasons/1909/1909DET.EVA", "seasons/1943/1943CLE.EVA"]);
    expect(p.rosters).toEqual(["2019:BAL"]);
    expect(p.schedules).toEqual(["2019"]);
  });
  it("prints the extra keys for the shell", () => {
    const p = planChanges(`${A}+gl:${gl}`, `${B}+gl:${gl}`, entries);
    expect(formatChanges(p)).toBe([
      "seasons=",
      "files=seasons/1909/1909DET.EVA",
      "oldfiles=seasons/1909/1909DET.EVA,seasons/1943/1943CLE.EVA",
      "rosters=2019:BAL",
      "schedules=2019",
      "reference=0",
      "gamelog=0",
    ].join("\n"));
  });
  it("describes file-level changes in words", () => {
    const p = planChanges(`${A}+gl:${gl}`, `${B}+gl:${gl}`, entries);
    expect(describeChanges(p)).toBe("2 event files (seasons 1909, 1943); roster BAL 2019; schedule 2019");
  });
  it("still accepts bare paths as modified files", () => {
    const p = planChanges(`${A}+gl:${gl}`, `${B}+gl:${gl}`, ["seasons/1909/1909DET.EVA"]);
    expect(p.eventFiles).toEqual(["seasons/1909/1909DET.EVA"]);
    expect(p.oldEventFiles).toEqual(["seasons/1909/1909DET.EVA"]);
  });
});
