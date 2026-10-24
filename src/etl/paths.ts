// Copyright (c) 2026 Syd Polk
// SPDX-License-Identifier: BSD-3-Clause
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

/** Four-digit season years present under <root>/seasons, ascending. */
export function seasonYears(root: string): string[] {
  const dir = join(root, "seasons");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((n) => /^\d{4}$/.test(n))
    .sort();
}

export function seasonDir(root: string, year: string): string {
  return join(root, "seasons", year);
}

/** Roster files (*.ROS) for a season, sorted. */
export function rosterFiles(root: string, year: string): string[] {
  const dir = seasonDir(root, year);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((n) => n.toUpperCase().endsWith(".ROS"))
    .map((n) => join(dir, n))
    .sort();
}

/**
 * Event files (play-by-play) for a season, sorted: .EVN (NL home games), .EVA
 * (AL), .EVE (postseason, All-Star, early leagues) and .EVR (Negro Leagues,
 * 1903–1961). game.source_file records which one each game came from.
 */
export function eventFiles(root: string, year: string): string[] {
  const dir = seasonDir(root, year);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((n) => /\.EV[NAER]$/i.test(n))
    .map((n) => join(dir, n))
    .sort();
}

/** Path to <year>schedule.csv for a season, or null if absent. */
export function scheduleFile(root: string, year: string): string | null {
  const p = join(seasonDir(root, year), `${year}schedule.csv`);
  return existsSync(p) ? p : null;
}

export function referenceFile(root: string, name: string): string {
  return join(root, "reference", name);
}
