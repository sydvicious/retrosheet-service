// Copyright (c) 2026 Syd Polk
// SPDX-License-Identifier: BSD-3-Clause
import { describe, it, expect } from "vitest";
import {
  parseReplaceArgs,
  seasonGamePredicate,
  seasonDeleteStatements,
  REFERENCE_TABLES,
} from "../../src/etl/replace.js";
import { battingSql, pitchingSql } from "../../src/etl/daily.js";

describe("parseReplaceArgs", () => {
  it("reads the key=value words after --replace, as data-changes.sh prints them", () => {
    expect(parseReplaceArgs(["--replace", "seasons=1987,2019", "reference=0", "gamelog=1"])).toMatchObject({
      seasons: ["1987", "2019"],
      reference: false,
      gamelog: true,
    });
  });
  it("defaults each kind to nothing", () => {
    expect(parseReplaceArgs(["--replace", "reference=1"])).toMatchObject({ seasons: [], reference: true, gamelog: false });
    expect(parseReplaceArgs(["--replace", "seasons="])).toMatchObject({ seasons: [], reference: false, gamelog: false });
  });
  it("returns undefined without --replace", () => {
    expect(parseReplaceArgs(["--check"])).toBeUndefined();
    expect(parseReplaceArgs([])).toBeUndefined();
  });
  it("rejects a season that is not four digits, and unknown words", () => {
    expect(() => parseReplaceArgs(["--replace", "seasons=87"])).toThrow(/season/);
    expect(() => parseReplaceArgs(["--replace", "seasons=1987;DROP"])).toThrow(/season/);
    expect(() => parseReplaceArgs(["--replace", "bogus=1"])).toThrow(/bogus/);
  });
  it("sorts and dedupes seasons", () => {
    expect(parseReplaceArgs(["--replace", "seasons=2001,1999,2001"])?.seasons).toEqual(["1999", "2001"]);
  });
});

describe("seasonGamePredicate", () => {
  it("is a date-range test on game, one range per season", () => {
    const p = seasonGamePredicate(["1987"]);
    expect(p).toBe("(game_date >= '1987-01-01' AND game_date < '1988-01-01')");
  });
  it("ORs several seasons", () => {
    const p = seasonGamePredicate(["1987", "2019"]);
    expect(p).toBe(
      "(game_date >= '1987-01-01' AND game_date < '1988-01-01') OR (game_date >= '2019-01-01' AND game_date < '2020-01-01')",
    );
  });
  it("is FALSE for no seasons, so a caller cannot delete everything by accident", () => {
    expect(seasonGamePredicate([])).toBe("FALSE");
  });
});

describe("seasonDeleteStatements", () => {
  const stmts = seasonDeleteStatements(["1987"]);
  it("deletes the children of game before game itself", () => {
    const tables = stmts.map((s) => /^DELETE FROM (\w+)/.exec(s)![1]);
    expect(tables.indexOf("game")).toBe(tables.length - 1 - 2); // game, then roster, schedule
    for (const child of ["play", "game_info", "lineup_start", "substitution", "comment",
      "earned_runs", "game_adjustment", "fielding_daily", "batting_daily", "pitching_daily"]) {
      expect(tables.indexOf(child)).toBeLessThan(tables.indexOf("game"));
    }
  });
  it("selects child rows through game by the season predicate", () => {
    const play = stmts.find((s) => s.startsWith("DELETE FROM play"))!;
    expect(play).toContain("game_id IN (SELECT game_id FROM game WHERE (game_date >= '1987-01-01'");
  });
  it("deletes roster and schedule by their own year or date", () => {
    expect(stmts.find((s) => s.startsWith("DELETE FROM roster"))).toContain("year IN (1987)");
    expect(stmts.find((s) => s.startsWith("DELETE FROM schedule"))).toContain("game_date >= '1987-01-01'");
  });
});

describe("REFERENCE_TABLES", () => {
  it("is the closed set the reference loaders fill, people last so coaches' FK is satisfied on reload order", () => {
    expect(REFERENCE_TABLES).toEqual(["people", "teams", "ballparks", "coaches", "ejections", "relatives"]);
  });
});

describe("daily SQL builders", () => {
  it("aggregate the whole play table when given no predicate", () => {
    expect(battingSql()).not.toMatch(/FROM play\s+WHERE/);
    expect(pitchingSql()).toMatch(/FROM play\s+WHERE pitcher_id IS NOT NULL\s+GROUP BY/);
  });
  it("restrict every pass over play to the given games", () => {
    const where = "game_id IN (SELECT game_id FROM game WHERE (game_date >= '1987-01-01' AND game_date < '1988-01-01'))";
    const bat = battingSql(where);
    // The batting statement reads play twice (batter pass, runner pass).
    expect(bat.match(/FROM play/g)?.length).toBe(2);
    expect(bat.match(/game_date >= '1987-01-01'/g)?.length).toBe(2);
    const pit = pitchingSql(where);
    expect(pit.match(/FROM play/g)?.length).toBe(1);
    expect(pit).toMatch(/WHERE pitcher_id IS NOT NULL AND game_id IN/);
  });
});

// ---- File-level replace ------------------------------------------------------
import {
  gameDeleteStatements,
  rosterDeleteStatement,
  scheduleDeleteStatement,
  rosterTeamYear,
} from "../../src/etl/replace.js";

describe("parseReplaceArgs (file level)", () => {
  it("reads files, oldfiles-derived games, rosters and schedules", () => {
    const p = parseReplaceArgs([
      "--replace", "seasons=", "files=seasons/1909/1909DET.EVA,seasons/2026/2026BAL.EVA",
      "games=DET190904140,DET190904150", "rosters=2019:BAL,2019:ANA", "schedules=2019", "reference=0", "gamelog=0",
    ]);
    expect(p).toEqual({
      seasons: [], reference: false, gamelog: false,
      files: ["seasons/1909/1909DET.EVA", "seasons/2026/2026BAL.EVA"],
      games: ["DET190904140", "DET190904150"],
      rosters: ["2019:ANA", "2019:BAL"],
      schedules: ["2019"],
    });
  });
  it("defaults the file-level sets to empty", () => {
    expect(parseReplaceArgs(["--replace", "seasons=1987"])).toEqual({
      seasons: ["1987"], reference: false, gamelog: false, files: [], games: [], rosters: [], schedules: [],
    });
  });
  it("accepts every event file kind the loader reads, .EVR included", () => {
    expect(parseReplaceArgs(["--replace", "files=seasons/1935/1935.EVR"])?.files).toEqual(["seasons/1935/1935.EVR"]);
  });
  it("rejects a file path outside a season directory or with a parent reference", () => {
    expect(() => parseReplaceArgs(["--replace", "files=reference/x.EVA"])).toThrow(/file/);
    expect(() => parseReplaceArgs(["--replace", "files=seasons/1987/../../etc"])).toThrow(/file/);
    expect(() => parseReplaceArgs(["--replace", "files=seasons/1987/1987BAL.ROS"])).toThrow(/file/);
  });
  it("rejects a malformed game id, roster or schedule", () => {
    expect(() => parseReplaceArgs(["--replace", "games=DET1909'"])).toThrow(/game/);
    expect(() => parseReplaceArgs(["--replace", "rosters=BAL2019"])).toThrow(/roster/);
    expect(() => parseReplaceArgs(["--replace", "schedules=19"])).toThrow(/schedule/);
  });
});

describe("gameDeleteStatements", () => {
  const stmts = gameDeleteStatements();
  it("deletes through the replaced_games temp table, children before game", () => {
    const tables = stmts.map((s) => /^DELETE FROM (\w+)/.exec(s)![1]);
    expect(tables[tables.length - 1]).toBe("game");
    expect(tables).toContain("play");
    expect(tables).toContain("batting_daily");
    for (const s of stmts) expect(s).toContain("game_id IN (SELECT game_id FROM replaced_games)");
  });
});

describe("rosterDeleteStatement / scheduleDeleteStatement", () => {
  it("deletes roster rows by (year, team) pairs", () => {
    expect(rosterDeleteStatement(["2019:BAL", "1871:BS1"])).toBe(
      "DELETE FROM roster WHERE (year, team) IN ((2019, 'BAL'), (1871, 'BS1'))",
    );
  });
  it("deletes a season's schedule rows by date range", () => {
    expect(scheduleDeleteStatement(["2019"])).toBe(
      "DELETE FROM schedule WHERE (game_date >= '2019-01-01' AND game_date < '2020-01-01')",
    );
  });
});

describe("rosterTeamYear", () => {
  it("splits a roster file path into its season and team", () => {
    expect(rosterTeamYear("seasons/2019/BAL2019.ROS")).toEqual({ year: "2019", team: "BAL" });
    expect(rosterTeamYear("seasons/1871/BS1-1871.ROS")).toEqual({ year: "1871", team: "BS1-" });
  });
  it("returns undefined for anything else", () => {
    expect(rosterTeamYear("seasons/2019/2019BAL.EVA")).toBeUndefined();
  });
});
