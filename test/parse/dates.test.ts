// Copyright (c) 2026 Syd Polk
// SPDX-License-Identifier: BSD-3-Clause
import { describe, it, expect } from "vitest";
import {
  usDateToIso,
  compactDateToIso,
  toIntOrNull,
  textOrNull,
} from "../../src/parse/dates.js";

describe("usDateToIso", () => {
  it("parses MM/DD/YYYY", () => {
    expect(usDateToIso("12/27/1981")).toBe("1981-12-27");
    expect(usDateToIso("02/05/1934")).toBe("1934-02-05");
  });
  it("zero-pads single-digit month/day", () => {
    expect(usDateToIso("4/6/2004")).toBe("2004-04-06");
  });
  it("returns null for blank or malformed input", () => {
    expect(usDateToIso("")).toBeNull();
    expect(usDateToIso(null)).toBeNull();
    expect(usDateToIso(undefined)).toBeNull();
    expect(usDateToIso("1981-12-27")).toBeNull();
    expect(usDateToIso("not a date")).toBeNull();
  });
});

describe("compactDateToIso", () => {
  it("parses YYYYMMDD", () => {
    expect(compactDateToIso("20240320")).toBe("2024-03-20");
  });
  it("returns null for blank or malformed input", () => {
    expect(compactDateToIso("")).toBeNull();
    expect(compactDateToIso("2024-03-20")).toBeNull();
    expect(compactDateToIso("Date")).toBeNull();
  });
});

describe("toIntOrNull", () => {
  it("keeps integers, including negatives", () => {
    expect(toIntOrNull("40")).toBe("40");
    expect(toIntOrNull("-1")).toBe("-1");
    expect(toIntOrNull(" 7 ")).toBe("7");
  });
  it("returns null for blank or non-integer", () => {
    expect(toIntOrNull("")).toBeNull();
    expect(toIntOrNull(null)).toBeNull();
    expect(toIntOrNull("6-05")).toBeNull();
  });
});

describe("textOrNull", () => {
  it("trims and nulls empties", () => {
    expect(textOrNull("  hi ")).toBe("hi");
    expect(textOrNull("")).toBeNull();
    expect(textOrNull("   ")).toBeNull();
    expect(textOrNull(null)).toBeNull();
  });
});
