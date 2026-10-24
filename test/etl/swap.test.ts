// Copyright (c) 2026 Syd Polk
// SPDX-License-Identifier: BSD-3-Clause
import { describe, it, expect } from "vitest";
import { loadSchemas, prepareStatements, swapStatements, cleanupStatements } from "../../src/etl/swap.js";

describe("loadSchemas", () => {
  it("names the side schemas after the live one", () => {
    expect(loadSchemas("retrosheet")).toEqual({
      live: "retrosheet",
      next: "retrosheet_next",
      old: "retrosheet_old",
    });
  });
});

describe("prepareStatements", () => {
  it("clears what a stopped load left behind, then creates the schema to load into", () => {
    expect(prepareStatements(loadSchemas("retrosheet"))).toEqual([
      "DROP SCHEMA IF EXISTS retrosheet_next CASCADE",
      "DROP SCHEMA IF EXISTS retrosheet_old CASCADE",
      "CREATE SCHEMA retrosheet_next",
    ]);
  });
  it("never touches the live schema", () => {
    for (const stmt of prepareStatements(loadSchemas("retrosheet"))) {
      expect(stmt).not.toMatch(/\bretrosheet\b(?!_)/);
    }
  });
});

describe("swapStatements", () => {
  it("moves the live schema aside before the loaded one takes its name", () => {
    expect(swapStatements(loadSchemas("retrosheet"), true)).toEqual([
      "ALTER SCHEMA retrosheet RENAME TO retrosheet_old",
      "ALTER SCHEMA retrosheet_next RENAME TO retrosheet",
    ]);
  });
  it("only renames the loaded schema when there is no live one yet", () => {
    expect(swapStatements(loadSchemas("retrosheet"), false)).toEqual([
      "ALTER SCHEMA retrosheet_next RENAME TO retrosheet",
    ]);
  });
});

describe("cleanupStatements", () => {
  it("drops the replaced schema and nothing else", () => {
    expect(cleanupStatements(loadSchemas("retrosheet"))).toEqual([
      "DROP SCHEMA IF EXISTS retrosheet_old CASCADE",
    ]);
  });
});
