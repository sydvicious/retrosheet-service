// Copyright (c) 2026 Syd Polk
// SPDX-License-Identifier: BSD-3-Clause
import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { seasonPhase, leagueGroup, readTeamLeagues } from "../../src/etl/gameClass.js";

describe("seasonPhase", () => {
  it("maps Retrosheet's gametype values", () => {
    expect(seasonPhase("regular", "1987BAL.EVA")).toBe("regular");
    expect(seasonPhase("worldseries", "1987WS.EVE")).toBe("postseason");
    expect(seasonPhase("lcs", "1987ALCS.EVE")).toBe("postseason");
    expect(seasonPhase("divisionseries", "1995ALD1.EVE")).toBe("postseason");
    expect(seasonPhase("wildcard", "2012ALWC.EVE")).toBe("postseason");
    expect(seasonPhase("championship", "1935.EVR")).toBe("postseason");
    expect(seasonPhase("allstar", "1987AS.EVE")).toBe("allstar");
    expect(seasonPhase("exhibition", "1935.EVR")).toBe("exhibition");
  });
  it("counts a pennant tiebreaker (gametype playoff) as regular season, as the official record does", () => {
    expect(seasonPhase("playoff", "1951NY1.EVN")).toBe("regular");
  });
  it("ignores case and surrounding whitespace in gametype", () => {
    expect(seasonPhase(" WorldSeries ", "1987WS.EVE")).toBe("postseason");
  });
  it("infers the phase from the file name when gametype is absent", () => {
    expect(seasonPhase(undefined, "1987BAL.EVA")).toBe("regular");
    expect(seasonPhase(undefined, "1987CHN.EVN")).toBe("regular");
    expect(seasonPhase("", "1987WS.EVE")).toBe("postseason");
    expect(seasonPhase(undefined, "1969NLCS.EVE")).toBe("postseason");
    expect(seasonPhase(undefined, "2020ALW3.EVE")).toBe("postseason");
    expect(seasonPhase(undefined, "1933AS.EVE")).toBe("allstar");
  });
  it("is null for an untyped game in a mixed file, rather than a guess", () => {
    expect(seasonPhase(undefined, "1939.EVR")).toBeNull();
    expect(seasonPhase(undefined, "1900.EVE")).toBeNull();
  });
  it("falls back to the file name for a gametype it does not know", () => {
    expect(seasonPhase("something-new", "1987BAL.EVA")).toBe("regular");
    expect(seasonPhase("something-new", "1939.EVR")).toBeNull();
  });
});

describe("leagueGroup", () => {
  it("is negro for every game in a .EVR file, whatever the teams", () => {
    expect(leagueGroup("1935.EVR", "NN2")).toBe("negro");
    expect(leagueGroup("1935.EVR", "")).toBe("negro");      // barnstorming club with no league
    expect(leagueGroup("1935.EVR", "AL")).toBe("negro");    // an exhibition against AL all-stars
  });
  it("is nonnegro for the AL/NL files and the postseason files", () => {
    expect(leagueGroup("1987BAL.EVA", "AL")).toBe("nonnegro");
    expect(leagueGroup("1987CHN.EVN", "NL")).toBe("nonnegro");
    expect(leagueGroup("1987WS.EVE", "NL")).toBe("nonnegro");
    expect(leagueGroup("1998MIL.EVN", "AL;NL")).toBe("nonnegro");
    expect(leagueGroup("1987AS.EVE", "")).toBe("nonnegro");   // all-star squads have no league row
    expect(leagueGroup("1914BLF.EVN", "FL")).toBe("nonnegro"); // the other recognized major leagues
  });
  it("is negro when a Negro league team hosts a game outside a .EVR file", () => {
    expect(leagueGroup("1935PTC.EVN", "NN2;NAL")).toBe("negro");
  });
  it("is other for the National Association, which is not classed as a major league", () => {
    expect(leagueGroup("1871BS1.EVE", "NA")).toBe("other");
  });
  it("treats a missing league as nonnegro only outside .EVR files", () => {
    expect(leagueGroup("1987BAL.EVA", undefined)).toBe("nonnegro");
    expect(leagueGroup("1987BAL.EVA", null)).toBe("nonnegro");
  });
});

describe("readTeamLeagues", () => {
  it("maps team id to league from reference/teams.csv, skipping the header", () => {
    const root = mkdtempSync(join(tmpdir(), "rs-"));
    mkdirSync(join(root, "reference"));
    writeFileSync(join(root, "reference", "teams.csv"), [
      "TEAM,LEAGUE,CITY,NICKNAME,FIRST,LAST",
      "ACY,ECL,Atlantic City,Bacharach Giants,1916,1929",
      "AGS,,Augie Galan,All Stars,1944,1944",
      "BAL,AL,Baltimore,Orioles,1954,2025",
    ].join("\n") + "\n");
    const m = readTeamLeagues(root);
    expect(m.get("ACY")).toBe("ECL");
    expect(m.get("AGS")).toBe("");
    expect(m.get("BAL")).toBe("AL");
    expect(m.has("TEAM")).toBe(false);
  });
});
