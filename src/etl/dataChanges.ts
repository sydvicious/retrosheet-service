// Copyright (c) 2026 Syd Polk
// SPDX-License-Identifier: BSD-3-Clause
//
// What a Retrosheet data update changed, from two data-version strings and the
// paths `git diff --name-only` lists between their clone commits. Pure, so the
// classification is tested without git or a database; scripts/data-changes.sh
// does the git work on the host and feeds this (via dataChangesCli.ts) the
// results. The plan is in "Incremental updates.md".

/** `<clone commit>+gl:<hash of the downloaded game logs>` (scripts/data-version.sh). */
export interface DataVersion {
  commit: string;
  gamelogHash: string;
}

export function parseDataVersion(s: string | undefined): DataVersion | undefined {
  const m = /^([0-9a-f]{7,40})\+gl:([0-9a-f]+)$/.exec((s ?? "").trim());
  return m ? { commit: m[1]!, gamelogHash: m[2]! } : undefined;
}

/** Which inputs a set of changed paths touches. */
export interface PathClasses {
  /** Four-digit season years under seasons/, sorted, deduped. */
  seasons: string[];
  /** Anything under reference/. */
  reference: boolean;
  /** Anything under gamelog/ (the postseason logs that ship in the clone). */
  gamelog: boolean;
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
export interface ChangePlan extends PathClasses {
  full: boolean;
}

/**
 * Combine the two versions with the diff between their commits. Either version
 * unparseable → full (nothing to compare against). The game logs are flagged
 * when their hash moved (the downloaded files) or the diff touched gamelog/
 * (the postseason files in the clone).
 */
export function planChanges(
  oldVersion: string | undefined,
  newVersion: string | undefined,
  changedPaths: readonly string[],
): ChangePlan {
  const oldV = parseDataVersion(oldVersion);
  const newV = parseDataVersion(newVersion);
  if (!oldV || !newV) return { full: true, seasons: [], reference: false, gamelog: false };
  const classes = oldV.commit === newV.commit
    ? { seasons: [], reference: false, gamelog: false }
    : classifyPaths(changedPaths);
  return {
    full: false,
    ...classes,
    gamelog: classes.gamelog || oldV.gamelogHash !== newV.gamelogHash,
  };
}

/** One clause per kind, for the "Reload …?" question. */
export function describeChanges(plan: ChangePlan): string {
  if (plan.full) return "everything (full reload)";
  const parts: string[] = [];
  if (plan.seasons.length) {
    parts.push(`${plan.seasons.length === 1 ? "season" : "seasons"} ${plan.seasons.join(", ")}`);
  }
  if (plan.reference) parts.push("reference data");
  if (plan.gamelog) parts.push("game logs");
  return parts.length ? parts.join("; ") : "nothing";
}

/** key=value lines for a shell script, or the single word `full`. */
export function formatChanges(plan: ChangePlan): string {
  if (plan.full) return "full";
  return [
    `seasons=${plan.seasons.join(",")}`,
    `reference=${plan.reference ? 1 : 0}`,
    `gamelog=${plan.gamelog ? 1 : 0}`,
  ].join("\n");
}
