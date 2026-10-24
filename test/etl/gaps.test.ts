// Copyright (c) 2026 Syd Polk
// SPDX-License-Identifier: BSD-3-Clause
import { describe, it, expect } from "vitest";
import {
  GAP_COLS, computedGapStatements, repeatedGameRows, repeatedGameDeleteStatements,
} from "../../src/etl/gaps.js";

describe("repeatedGameRows", () => {
  it("makes one row per repeated id, in the season of the copy that loads", () => {
    const rows = repeatedGameRows([
      {
        gameId: "PRG193512012",
        kept: "/data/seasons/1935/1935.EVR",
        differing: ["/data/seasons/1935/1935.EVR", "/data/seasons/1935/1935NGL.EVR"],
      },
      { gameId: "CBN193705020", kept: "/data/seasons/1937/1937.EVR", differing: ["/data/seasons/1937/1937NGL.EVR"] },
    ]);
    expect(GAP_COLS).toEqual(["kind", "season", "league_group", "game_id", "percent", "detail"]);
    expect(rows).toEqual([
      ["repeated_game", "1935", null, "PRG193512012", null,
        "The copy in 1935.EVR loads; 2 copies that differ from it are skipped (1935.EVR, 1935NGL.EVR)"],
      ["repeated_game", "1937", null, "CBN193705020", null,
        "The copy in 1937.EVR loads; 1 copy that differs from it is skipped (1937NGL.EVR)"],
    ]);
  });
});

describe("repeatedGameDeleteStatements", () => {
  it("clears the repeated games recorded for the seasons being read again", () => {
    expect(repeatedGameDeleteStatements(["1935", "1937"])).toEqual([
      "DELETE FROM data_gap WHERE kind = 'repeated_game' AND season IN (1935, 1937)",
    ]);
  });
  it("is nothing when no season is read", () => {
    expect(repeatedGameDeleteStatements([])).toEqual([]);
  });
});

describe("computedGapStatements", () => {
  const [del, ...inserts] = computedGapStatements();

  it("first clears only the kinds it computes, never the repeated games a load records", () => {
    expect(del).toBe("DELETE FROM data_gap WHERE kind IN ('putout_share', 'no_game_log')");
  });
  it("measures putouts against outs by decade and league group, for decades short of every out", () => {
    const putouts = inserts.find((s) => s.includes("'putout_share'"))!;
    expect(putouts).toMatch(/GROUP BY 1, 2/);
    expect(putouts).toMatch(/league_group/);
    expect(putouts).toMatch(/WHERE f\.po < p\.outs/);
    expect(putouts).toMatch(/to_char\(f\.po, 'FM999,999,999'\)/);
  });
  it("lists games with no game-log row, leaving out the Negro Leagues, which have no game logs", () => {
    const logs = inserts.find((s) => s.includes("'no_game_log'"))!;
    expect(logs).toMatch(/NOT EXISTS \(SELECT 1 FROM game_log/);
    expect(logs).toMatch(/league_group IS DISTINCT FROM 'negro'/);
  });
});
