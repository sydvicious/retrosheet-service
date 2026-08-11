// Copyright (c) 2026 Syd Polk
// SPDX-License-Identifier: BSD-3-Clause
//
// Pure conversions used by the loaders. These are part of the tested logic
// boundary. They return strings (or null) suitable for COPY into typed columns.

/** "MM/DD/YYYY" -> "YYYY-MM-DD", or null if blank/unrecognized. */
export function usDateToIso(s: string | null | undefined): string | null {
  if (!s) return null;
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s.trim());
  if (!m) return null;
  const [, mm = "", dd = "", yyyy = ""] = m;
  return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
}

/** "YYYYMMDD" -> "YYYY-MM-DD", or null if blank/unrecognized. */
export function compactDateToIso(s: string | null | undefined): string | null {
  if (!s) return null;
  const m = /^(\d{4})(\d{2})(\d{2})$/.exec(s.trim());
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

/** Trimmed integer string, or null if blank/non-integer. */
export function toIntOrNull(s: string | null | undefined): string | null {
  if (s === null || s === undefined) return null;
  const t = s.trim();
  if (t === "") return null;
  return /^-?\d+$/.test(t) ? t : null;
}

/** Trimmed value, or null if blank. */
export function textOrNull(s: string | null | undefined): string | null {
  if (s === null || s === undefined) return null;
  const t = s.trim();
  return t === "" ? null : t;
}
