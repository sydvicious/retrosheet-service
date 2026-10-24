// Copyright (c) 2026 Syd Polk
// SPDX-License-Identifier: BSD-3-Clause
import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { gameRow, GAME_COLS } from "../../src/etl/events.js";
import { eventFiles } from "../../src/etl/paths.js";
import { parseEventFile } from "../../src/parse/eventFile.js";

const EVR = [
  "id,PTC193507140",
  "version,2",
  "info,visteam,HOM",
  "info,hometeam,PTC",
  "info,date,1935/07/14",
  "info,number,0",
  "info,gametype,regular",
  "start,x,\"X\",0,1,2",
  "play,1,0,x,00,,K",
].join("\n");

describe("gameRow", () => {
  it("records the event file the game came from, so .EVR games can be told apart", () => {
    const [g] = parseEventFile(EVR);
    const row = gameRow(g!, "1935.EVR");
    expect(GAME_COLS).toContain("source_file");
    expect(row[GAME_COLS.indexOf("source_file")]).toBe("1935.EVR");
    expect(row[GAME_COLS.indexOf("game_type")]).toBe("regular");
    expect(row.length).toBe(GAME_COLS.length);
  });
});

describe("eventFiles", () => {
  it("lists .EVN, .EVA, .EVE and .EVR files of a season, and nothing else", () => {
    const root = mkdtempSync(join(tmpdir(), "rs-"));
    const dir = join(root, "seasons", "1935");
    mkdirSync(dir, { recursive: true });
    for (const n of ["1935.EVR", "1935BOS.EVA", "1935BRO.EVN", "1935WS.EVE", "1935.EBA", "BOS1935.ROS", "1935schedule.csv"]) {
      writeFileSync(join(dir, n), "");
    }
    expect(eventFiles(root, "1935").map((f) => f.split("/").pop())).toEqual(
      ["1935.EVR", "1935BOS.EVA", "1935BRO.EVN", "1935WS.EVE"],
    );
  });
});
