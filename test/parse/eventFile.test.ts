// Copyright (c) 2026 Syd Polk
// SPDX-License-Identifier: BSD-3-Clause
import { describe, it, expect } from "vitest";
import { parseCsvLine, parseEventFile } from "../../src/parse/eventFile.js";

describe("parseCsvLine", () => {
  it("splits a plain record", () => {
    expect(parseCsvLine("info,visteam,SDN")).toEqual(["info", "visteam", "SDN"]);
  });
  it("keeps commas inside quoted fields", () => {
    expect(parseCsvLine('com,"text, with comma"')).toEqual(["com", "text, with comma"]);
  });
  it("unquotes names and handles escaped quotes", () => {
    expect(parseCsvLine('start,bogax001,"Xander Bogaerts",0,1,4')).toEqual([
      "start", "bogax001", "Xander Bogaerts", "0", "1", "4",
    ]);
    expect(parseCsvLine('com,"He said ""hi"""')).toEqual(["com", 'He said "hi"']);
  });
  it("yields a trailing empty field for a trailing comma", () => {
    expect(parseCsvLine("info,save,")).toEqual(["info", "save", ""]);
  });
});

const SAMPLE = [
  "id,SFN202404050",
  "version,2",
  "info,visteam,SDN",
  "info,hometeam,SFN",
  "info,date,2024/04/05",
  "info,usedh,true",
  'start,bogax001,"Xander Bogaerts",0,1,4',
  'start,hickj002,"Jordan Hicks",1,0,1',
  "play,1,0,bogax001,02,CFX,D7/L7LD",
  'com,"a comment, with comma"',
  'sub,matsy001,"Yuki Matsui",0,0,1',
  "radj,volpa001,2",
  "data,er,ceasd001,2",
  "id,SFN202404060",
  "info,visteam,SDN",
  "info,hometeam,SFN",
  'start,lee-j001,"Jung Hoo Lee",1,1,8',
].join("\n");

describe("parseEventFile", () => {
  const games = parseEventFile(SAMPLE);

  it("splits into games on id records", () => {
    expect(games.map((g) => g.gameId)).toEqual(["SFN202404050", "SFN202404060"]);
  });

  it("captures info verbatim and in order", () => {
    expect(games[0]!.info).toEqual([
      ["visteam", "SDN"],
      ["hometeam", "SFN"],
      ["date", "2024/04/05"],
      ["usedh", "true"],
    ]);
  });

  it("parses starts with side / batting order / fielding position", () => {
    const g = games[0]!;
    expect(g.starts).toHaveLength(2);
    expect(g.starts[0]).toEqual({
      playerId: "bogax001",
      playerName: "Xander Bogaerts",
      side: 0,
      battingOrder: 1,
      fieldingPosition: 4,
    });
    expect(g.starts[1]).toMatchObject({ playerId: "hickj002", side: 1, battingOrder: 0, fieldingPosition: 1 });
  });

  it("parses subs, comments, data(er) and adjustments; ignores play/version", () => {
    const g = games[0]!;
    expect(g.subs).toHaveLength(1);
    expect(g.subs[0]).toMatchObject({ playerId: "matsy001", side: 0, fieldingPosition: 1 });
    expect(g.comments.map((c) => c.text)).toEqual(["a comment, with comma"]);
    expect(g.data).toEqual([{ kind: "er", playerId: "ceasd001", value: "2" }]);
    expect(g.adjustments).toEqual([{ seq: expect.any(Number), type: "radj", field1: "volpa001", field2: "2" }]);
  });

  it("starts a fresh record stream per game", () => {
    expect(games[1]!.starts).toHaveLength(1);
    expect(games[1]!.starts[0]!.playerId).toBe("lee-j001");
  });
});
