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

const LEAGUES = new Map([["PTC", "NN2;NAL"], ["HOM", "NN2"], ["BAL", "AL"]]);
const col = (row: (string | null)[], name: string): string | null => row[GAME_COLS.indexOf(name)]!;

describe("gameRow", () => {
  it("records the event file the game came from, so .EVR games can be told apart", () => {
    const [g] = parseEventFile(EVR);
    const row = gameRow(g!, "1935.EVR", LEAGUES);
    expect(GAME_COLS).toContain("source_file");
    expect(col(row, "source_file")).toBe("1935.EVR");
    expect(col(row, "game_type")).toBe("regular");
    expect(row.length).toBe(GAME_COLS.length);
  });
  it("derives season_phase and league_group: a Negro Leagues regular-season game", () => {
    const [g] = parseEventFile(EVR);
    const row = gameRow(g!, "1935.EVR", LEAGUES);
    expect(col(row, "season_phase")).toBe("regular");
    expect(col(row, "league_group")).toBe("negro");
  });
  it("derives them for an untyped AL home game: regular, nonnegro", () => {
    const text = EVR.replace("PTC193507140", "BAL198704060").replace("info,visteam,HOM", "info,visteam,CLE")
      .replace("info,hometeam,PTC", "info,hometeam,BAL").replace("info,gametype,regular\n", "");
    const [g] = parseEventFile(text);
    const row = gameRow(g!, "1987BAL.EVA", LEAGUES);
    expect(col(row, "game_type")).toBeNull();
    expect(col(row, "season_phase")).toBe("regular");
    expect(col(row, "league_group")).toBe("nonnegro");
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
