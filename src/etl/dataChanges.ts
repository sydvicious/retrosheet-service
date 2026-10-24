// Copyright (c) 2026 Syd Polk
// SPDX-License-Identifier: BSD-3-Clause
//
// What a Retrosheet data update changed, from two data-version strings and the
// entries `git diff --name-status --no-renames` lists between their clone
// commits. Pure, so the classification is tested without git or a database;
// scripts/data-changes.sh does the git work on the host and feeds this (via
// dataChangesCli.ts) the results. The plan is in "Incremental updates.md".
//
// Two levels. Season level (Phase 2): any path under seasons/<year>/ marks the
// season. File level (Phase 5): an event file is replaced on its own (the games
// its old version held are deleted, the new file loaded), a roster file as its
// team-year, a schedule file as its season. A season falls back to the whole
// season when a change can't be read file by file (an unexpected status) or
// when too many of its event files changed.

/** `<clone commit>+gl:<hash of the downloaded game logs>` (scripts/data-version.sh). */
export interface DataVersion {
  commit: string;
  gamelogHash: string;
}

export function parseDataVersion(s: string | undefined): DataVersion | undefined {
  const m = /^([0-9a-f]{7,40})\+gl:([0-9a-f]+)$/.exec((s ?? "").trim());
  return m ? { commit: m[1]!, gamelogHash: m[2]! } : undefined;
}

/** Which inputs a set of changed paths touches, at season level. */
export interface PathClasses {
  /** Four-digit season years under seasons/, sorted, deduped. */
  seasons: string[];
  /** Anything under reference/. */
  reference: boolean;
  /** Anything under gamelog/ (the postseason logs that ship in the clone). */
  gamelog: boolean;
}

/** One line of `git diff --name-status --no-renames`: A, M or D and the path. */
export interface ChangeEntry {
  status: string;
  path: string;
}

/** What to reload, down to the file where that is possible. */
export interface FileClasses extends PathClasses {
  /** Event files to load (added or modified), relative to the data dir. */
  eventFiles: string[];
  /** Event files whose OLD version's game ids must be deleted (modified or removed). */
  oldEventFiles: string[];
  /** Roster team-years to replace, as "<year>:<TEAM>". */
  rosters: string[];
  /** Seasons whose schedule to replace. */
  schedules: string[];
}

const SEASON_PATH = /^seasons\/(\d{4})\/([^/]+)$/;
const EVENT_FILE = /\.EV[NAER]$/i; // the kinds paths.ts eventFiles() reads
const ROSTER_FILE = /^(.+?)(\d{4})\.ROS$/i;

/** Season and team of a roster file path (`seasons/2019/BAL2019.ROS` → 2019, BAL). */
export function rosterTeamYear(path: string): { year: string; team: string } | undefined {
  const m = SEASON_PATH.exec(path);
  if (!m) return undefined;
  const r = ROSTER_FILE.exec(m[2]!);
  if (!r || r[2] !== m[1]) return undefined;
  return { year: m[1]!, team: r[1]! };
}

/** More changed event files than this in one season → reload the season instead. */
export const DEFAULT_MAX_FILES_PER_SEASON = 10;

/**
 * File-level classification. Within a season directory: event files are
 * replaced one by one (A: load; M: delete old games + load; D: delete old
 * games), roster files as their team-year, the schedule file as the season,
 * and other files (box scores, notes) are ignored. A status other than A/M/D,
 * or more than maxFilesPerSeason changed event files, makes that season a
 * whole-season reload and drops its file-level entries.
 */
export function classifyChanges(
  entries: readonly ChangeEntry[],
  opts: { maxFilesPerSeason?: number } = {},
): FileClasses {
  const max = opts.maxFilesPerSeason ?? DEFAULT_MAX_FILES_PER_SEASON;
  const whole = new Set<string>();
  const perSeason = new Map<string, { events: Set<string>; old: Set<string>; rosters: Set<string>; schedule: boolean }>();
  let reference = false;
  let gamelog = false;

  for (const { status, path } of entries) {
    const m = SEASON_PATH.exec(path);
    if (!m) {
      if (path.startsWith("reference/")) reference = true;
      else if (path.startsWith("gamelog/")) gamelog = true;
      continue;
    }
    const [, year, file] = m as unknown as [string, string, string];
    let s = perSeason.get(year);
    if (!s) { s = { events: new Set(), old: new Set(), rosters: new Set(), schedule: false }; perSeason.set(year, s); }
    if (EVENT_FILE.test(file)) {
      if (status === "A") s.events.add(path);
      else if (status === "M") { s.events.add(path); s.old.add(path); }
      else if (status === "D") s.old.add(path);
      else whole.add(year);
    } else if (rosterTeamYear(path)) {
      const r = rosterTeamYear(path)!;
      s.rosters.add(`${r.year}:${r.team}`);
    } else if (file.toLowerCase() === `${year}schedule.csv`) {
      s.schedule = true;
    }
    // Anything else in a season directory (.EB* box scores, notes) is not read
    // by the loader.
  }

  const eventFiles: string[] = [];
  const oldEventFiles: string[] = [];
  const rosters: string[] = [];
  const schedules: string[] = [];
  for (const [year, s] of perSeason) {
    if (new Set([...s.events, ...s.old]).size > max) whole.add(year);
    if (whole.has(year)) continue; // the season reload covers everything in it
    eventFiles.push(...s.events);
    oldEventFiles.push(...s.old);
    rosters.push(...s.rosters);
    if (s.schedule) schedules.push(year);
  }
  return {
    seasons: [...whole].sort(),
    eventFiles: eventFiles.sort(),
    oldEventFiles: oldEventFiles.sort(),
    rosters: rosters.sort(),
    schedules: schedules.sort(),
    reference,
    gamelog,
  };
}

// The loader reads exactly these three places (paths.ts, gamelog.ts); a change
// anywhere else cannot alter a loaded row. Any four-digit directory is a
// season: Retrosheet adds a new year each fall and older years at any time.
export function classifyPaths(paths: readonly string[]): PathClasses {
  const seasons = new Set<string>();
  let reference = false;
  let gamelog = false;
  for (const p of paths) {
    const m = /^seasons\/(\d{4})\//.exec(p);
    if (m) seasons.add(m[1]!);
    else if (p.startsWith("reference/")) reference = true;
    else if (p.startsWith("gamelog/")) gamelog = true;
  }
  return { seasons: [...seasons].sort(), reference, gamelog };
}

/** What to reload. `full` means the rest is meaningless: reload everything. */
export interface ChangePlan extends FileClasses {
  full: boolean;
}

const NOTHING: FileClasses = {
  seasons: [], eventFiles: [], oldEventFiles: [], rosters: [], schedules: [], reference: false, gamelog: false,
};

/**
 * Combine the two versions with the diff between their commits. Either version
 * unparseable → full (nothing to compare against). The diff is a list of
 * name-status entries; a bare path counts as modified. The game logs are
 * flagged when their hash moved (the downloaded files) or the diff touched
 * gamelog/ (the postseason files in the clone).
 */
export function planChanges(
  oldVersion: string | undefined,
  newVersion: string | undefined,
  changes: readonly (ChangeEntry | string)[],
): ChangePlan {
  const oldV = parseDataVersion(oldVersion);
  const newV = parseDataVersion(newVersion);
  if (!oldV || !newV) return { full: true, ...NOTHING };
  const entries = changes.map((c) => (typeof c === "string" ? { status: "M", path: c } : c));
  const classes = oldV.commit === newV.commit ? NOTHING : classifyChanges(entries);
  return {
    full: false,
    ...classes,
    gamelog: classes.gamelog || oldV.gamelogHash !== newV.gamelogHash,
  };
}

const seasonOf = (path: string): string => SEASON_PATH.exec(path)?.[1] ?? "?";

/** One clause per kind, for the "Reload …?" question. */
export function describeChanges(plan: ChangePlan): string {
  if (plan.full) return "everything (full reload)";
  const parts: string[] = [];
  const plural = (n: number, one: string, many: string): string => (n === 1 ? one : many);
  if (plan.seasons.length) {
    parts.push(`${plural(plan.seasons.length, "season", "seasons")} ${plan.seasons.join(", ")}`);
  }
  const files = new Set([...plan.eventFiles, ...plan.oldEventFiles]);
  if (files.size) {
    const years = [...new Set([...files].map(seasonOf))].sort();
    parts.push(`${files.size} event ${plural(files.size, "file", "files")} (${plural(years.length, "season", "seasons")} ${years.join(", ")})`);
  }
  if (plan.rosters.length) {
    const named = plan.rosters.map((r) => { const [y, t] = r.split(":"); return `${t} ${y}`; });
    parts.push(`${plural(plan.rosters.length, "roster", "rosters")} ${named.join(", ")}`);
  }
  if (plan.schedules.length) {
    parts.push(`${plural(plan.schedules.length, "schedule", "schedules")} ${plan.schedules.join(", ")}`);
  }
  if (plan.reference) parts.push("reference data");
  if (plan.gamelog) parts.push("game logs");
  return parts.length ? parts.join("; ") : "nothing";
}

/**
 * key=value lines for a shell script, or the single word `full`. The
 * file-level keys appear only when non-empty, so the season-level output is
 * unchanged.
 */
export function formatChanges(plan: ChangePlan): string {
  if (plan.full) return "full";
  const lines = [`seasons=${plan.seasons.join(",")}`];
  if (plan.eventFiles.length) lines.push(`files=${plan.eventFiles.join(",")}`);
  if (plan.oldEventFiles.length) lines.push(`oldfiles=${plan.oldEventFiles.join(",")}`);
  if (plan.rosters.length) lines.push(`rosters=${plan.rosters.join(",")}`);
  if (plan.schedules.length) lines.push(`schedules=${plan.schedules.join(",")}`);
  lines.push(`reference=${plan.reference ? 1 : 0}`, `gamelog=${plan.gamelog ? 1 : 0}`);
  return lines.join("\n");
}
