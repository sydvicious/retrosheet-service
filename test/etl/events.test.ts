// Copyright (c) 2026 Syd Polk
// SPDX-License-Identifier: BSD-3-Clause
import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  gameRow, GAME_COLS, firstCopies, onlyGames, gameIdsInEventFile, gameCopiesInEventFile,
} from "../../src/etl/events.js";
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

// A game copy: its id and a hash of its records. Copies with the same hash are
// the same game; tests name the hashes after what they stand for.
const copy = (id: string, hash = id): readonly [string, string] => [id, hash];

describe("firstCopies", () => {
  it("loads every game from its file when no id repeats", () => {
    const { load, skipped, repeats } = firstCopies([
      ["seasons/1937/1937.EVR", [copy("CBN193705020"), copy("CBN193705030")]],
      ["seasons/1937/1937CHN.EVN", [copy("CHN193704200")]],
    ]);
    expect(load).toEqual(new Map([
      ["seasons/1937/1937.EVR", new Set(["CBN193705020", "CBN193705030"])],
      ["seasons/1937/1937CHN.EVN", new Set(["CHN193704200"])],
    ]));
    expect(skipped).toEqual(new Map());
    expect(repeats).toEqual([]);
  });

  it("keeps the copy in the earlier file when two files hold a game", () => {
    const { load, skipped, repeats } = firstCopies([
      ["seasons/1937/1937.EVR", [copy("CBN193705020")]],
      ["seasons/1937/1937NGL.EVR", [copy("CBN193705020"), copy("HOM193705090")]],
    ]);
    expect(load.get("seasons/1937/1937.EVR")).toEqual(new Set(["CBN193705020"]));
    expect(load.get("seasons/1937/1937NGL.EVR")).toEqual(new Set(["HOM193705090"]));
    expect(skipped).toEqual(new Map([["seasons/1937/1937NGL.EVR", 1]]));
    expect(repeats).toEqual([]);
  });

  it("keeps the first of two copies inside one file", () => {
    const { load, skipped } = firstCopies([
      ["seasons/1935/1935.EVR", [copy("PRG193512012"), copy("PIR193512020"), copy("PRG193512012")]],
    ]);
    expect(load.get("seasons/1935/1935.EVR")).toEqual(new Set(["PRG193512012", "PIR193512020"]));
    expect(skipped).toEqual(new Map([["seasons/1935/1935.EVR", 1]]));
  });

  it("reports a repeated id whose skipped copies differ from the one that loads", () => {
    const { repeats } = firstCopies([
      ["seasons/1935/1935.EVR", [copy("PRG193512012", "nine innings"), copy("PRG193512012", "five innings")]],
      ["seasons/1935/1935NGL.EVR", [copy("PRG193512012", "nine innings"), copy("PRG193512012", "five innings")]],
    ]);
    expect(repeats).toEqual([
      { gameId: "PRG193512012", kept: "seasons/1935/1935.EVR", differing: ["seasons/1935/1935.EVR", "seasons/1935/1935NGL.EVR"] },
    ]);
  });

  it("follows the order the files are given in", () => {
    const { load } = firstCopies([
      ["seasons/1937/1937NGL.EVR", [copy("CBN193705020")]],
      ["seasons/1937/1937.EVR", [copy("CBN193705020")]],
    ]);
    expect(load.get("seasons/1937/1937NGL.EVR")).toEqual(new Set(["CBN193705020"]));
    expect(load.get("seasons/1937/1937.EVR")).toEqual(new Set());
  });

  it("skips games already loaded by an earlier call that shares the seen map", () => {
    const seen = new Map();
    firstCopies([["seasons/1937/1937.EVR", [copy("CBN193705020", "a")]]], seen);
    const { load, skipped, repeats } = firstCopies(
      [["seasons/1938/1938.EVR", [copy("CBN193705020", "b"), copy("HOM193805010")]]], seen,
    );
    expect(load.get("seasons/1938/1938.EVR")).toEqual(new Set(["HOM193805010"]));
    expect(skipped).toEqual(new Map([["seasons/1938/1938.EVR", 1]]));
    expect(repeats).toEqual([{ gameId: "CBN193705020", kept: "seasons/1937/1937.EVR", differing: ["seasons/1938/1938.EVR"] }]);
  });
});

describe("onlyGames", () => {
  it("keeps just the listed games, and drops files left with none", () => {
    const load = new Map([
      ["seasons/1937/1937.EVR", new Set(["CBN193705020", "CBN193705030"])],
      ["seasons/1937/1937CHN.EVN", new Set(["CHN193704200"])],
    ]);
    expect(onlyGames(load, new Set(["CBN193705030", "NYA193704200"]))).toEqual(new Map([
      ["seasons/1937/1937.EVR", new Set(["CBN193705030"])],
    ]));
  });
});

describe("gameIdsInEventFile", () => {
  it("reads each id the way the parser does, so the loader's filter never drops a game", () => {
    const dir = mkdtempSync(join(tmpdir(), "ids-"));
    const file = join(dir, "1937.EVR");
    const text = ["id,CBN193705020", "info,visteam,HOM", "id,\"CBN193705030\"", "id, HOM193705090 ,", ""].join("\r\n");
    writeFileSync(file, text);
    expect(gameIdsInEventFile(file)).toEqual(parseEventFile(text).map((g) => g.gameId));
  });
});

describe("gameCopiesInEventFile", () => {
  const write = (name: string, lines: string[], eol = "\n"): string => {
    const file = join(mkdtempSync(join(tmpdir(), "copies-")), name);
    writeFileSync(file, lines.join(eol));
    return file;
  };
  const game = (id: string, winner: string): string[] => [`id,${id}`, "info,visteam,PIR", `info,wp,${winner}`];

  it("gives each game its id and the same hash for the same records", () => {
    const a = gameCopiesInEventFile(write("1935.EVR", [...game("PRG193512012", "grifr101"), ...game("PRG193512012", "paigs101")]));
    const b = gameCopiesInEventFile(write("1935NGL.EVR", [...game("PRG193512012", "grifr101"), ""], "\r\n"));
    expect(a.map(([id]) => id)).toEqual(["PRG193512012", "PRG193512012"]);
    expect(a[0]![1]).not.toEqual(a[1]![1]);
    expect(b[0]![1]).toEqual(a[0]![1]);
  });
});
