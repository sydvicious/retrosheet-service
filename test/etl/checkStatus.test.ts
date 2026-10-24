// Copyright (c) 2026 Syd Polk
// SPDX-License-Identifier: BSD-3-Clause
import { describe, it, expect } from "vitest";
import { checkStatus } from "../../src/etl/checkStatus.js";

const code = { schemaVersion: 3, etlVersion: 2 };
const data = "abc123+gl:0123456789abcdef";
const current = { version: 3, etl_version: 2, data_version: data };

describe("checkStatus", () => {
  it("is current when schema, ETL and data all match", () => {
    expect(checkStatus(current, data, code).status).toBe("current");
  });

  it("is empty when the database has no schema_meta row", () => {
    expect(checkStatus(undefined, data, code).status).toBe("empty");
  });

  it("is changed when the schema version differs", () => {
    const r = checkStatus({ ...current, version: 2 }, data, code);
    expect(r.status).toBe("changed");
    expect(r.message).toMatch(/schema v2.*code is v3/);
  });

  it("is changed when the ETL version differs", () => {
    const r = checkStatus({ ...current, etl_version: 1 }, data, code);
    expect(r.status).toBe("changed");
    expect(r.message).toMatch(/ETL v1.*code is v2/);
  });

  it("says no full load has finished when the schema matches but no ETL version was recorded", () => {
    const r = checkStatus({ version: 3, etl_version: null, data_version: null }, data, code);
    expect(r.status).toBe("changed");
    expect(r.message).not.toMatch(/ETL v0/);
    expect(r.message).toMatch(/schema v3/);
    expect(r.message).toMatch(/no full load has finished/);
  });

  it("is loading when another load is running, whatever schema_meta says", () => {
    for (const meta of [current, undefined, { version: 3, etl_version: null, data_version: null }]) {
      const r = checkStatus(meta, data, code, true);
      expect(r.status).toBe("loading");
      expect(r.message).toMatch(/load is running/);
      expect(r.message).toMatch(/wait for it to finish/i);
    }
  });

  it("is not loading when no other load is running", () => {
    expect(checkStatus(current, data, code, false).status).toBe("current");
  });

  it("is data-changed when only the data version differs", () => {
    const r = checkStatus(current, "def456+gl:fedcba9876543210", code);
    expect(r.status).toBe("data-changed");
    expect(r.message).toContain(data);
    expect(r.message).toContain("def456+gl:fedcba9876543210");
  });

  it("is unknown when the database recorded no data version", () => {
    const r = checkStatus({ ...current, data_version: null }, data, code);
    expect(r.status).toBe("unknown");
  });

  it("is unknown when no data version was supplied", () => {
    expect(checkStatus(current, undefined, code).status).toBe("unknown");
  });

  it("reports a version mismatch before an unknown data version", () => {
    const r = checkStatus({ version: 2, etl_version: 2, data_version: null }, data, code);
    expect(r.status).toBe("changed");
  });

  it("maps each status to its exit code", () => {
    expect(checkStatus(current, data, code).exitCode).toBe(0);
    expect(checkStatus({ ...current, version: 2 }, data, code).exitCode).toBe(10);
    expect(checkStatus({ ...current, etl_version: 1 }, data, code).exitCode).toBe(10);
    expect(checkStatus(undefined, data, code).exitCode).toBe(11);
    expect(checkStatus(current, undefined, code).exitCode).toBe(12);
    expect(checkStatus(current, data, code, true).exitCode).toBe(14);
  });

  it("gives a data-only change its own status and exit code, so a partial load can be offered", () => {
    const r = checkStatus(current, "def456+gl:fedcba9876543210", code);
    expect(r.status).toBe("data-changed");
    expect(r.exitCode).toBe(13);
  });

  it("keeps schema and ETL differences as changed, even when the data also differs", () => {
    expect(checkStatus({ ...current, etl_version: 1 }, "def456+gl:fedcba9876543210", code).status).toBe("changed");
  });
});
