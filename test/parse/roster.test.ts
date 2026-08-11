// Copyright (c) 2026 Syd Polk
// SPDX-License-Identifier: BSD-3-Clause
import { describe, it, expect } from "vitest";
import { parseRosterRow } from "../../src/parse/roster.js";

describe("parseRosterRow", () => {
  it("maps a standard 7-field roster line", () => {
    // adamj003,Adams,Jordyn,R,R,ANA,OF
    expect(parseRosterRow(["adamj003", "Adams", "Jordyn", "R", "R", "ANA", "OF"])).toEqual({
      playerId: "adamj003",
      lastName: "Adams",
      firstName: "Jordyn",
      bats: "R",
      throws: "R",
      team: "ANA",
      position: "OF",
    });
  });

  it("handles switch hitters and pitchers", () => {
    // bailp001,Bailey,Patrick,B,R,SFN,C
    const e = parseRosterRow(["bailp001", "Bailey", "Patrick", "B", "R", "SFN", "C"]);
    expect(e?.bats).toBe("B");
    expect(e?.position).toBe("C");
  });

  it("returns null when the player id is missing", () => {
    expect(parseRosterRow(["", "Nobody", "Nobody", "R", "R", "ANA", "P"])).toBeNull();
    expect(parseRosterRow([])).toBeNull();
  });

  it("tolerates trailing empty fields", () => {
    const e = parseRosterRow(["aviln001", "Avila", "Nick", "R", "R", "SFN"]);
    expect(e?.position).toBe("");
    expect(e?.team).toBe("SFN");
  });
});
