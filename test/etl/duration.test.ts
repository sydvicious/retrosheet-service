// Copyright (c) 2026 Syd Polk
// SPDX-License-Identifier: BSD-3-Clause
import { describe, it, expect } from "vitest";
import { formatDuration } from "../../src/etl/duration.js";

describe("formatDuration", () => {
  it("shows minutes and seconds under an hour", () => {
    expect(formatDuration(1235.1 * 1000)).toBe("20:35");
  });

  it("pads seconds to two digits", () => {
    expect(formatDuration(65 * 1000)).toBe("1:05");
  });

  it("shows zero minutes under a minute", () => {
    expect(formatDuration(0)).toBe("0:00");
    expect(formatDuration(42 * 1000)).toBe("0:42");
  });

  it("drops the fraction of a second rather than rounding up", () => {
    expect(formatDuration(59_999)).toBe("0:59");
  });

  it("adds hours from an hour on, padding the minutes", () => {
    expect(formatDuration(3600 * 1000)).toBe("1:00:00");
    expect(formatDuration((2 * 3600 + 3 * 60 + 4) * 1000)).toBe("2:03:04");
  });
});
