// Copyright (c) 2026 Syd Polk
// SPDX-License-Identifier: BSD-3-Clause
//
// CLI over dataChanges.ts for scripts/data-changes.sh, which runs it inside the
// loader container (the host has git but no Node; the image has Node but no
// git). Usage:
//
//   node dist/etl/dataChangesCli.js <old data version> <new data version> < paths
//
// stdin is the output of `git diff --name-only <old commit> <new commit>`, one
// path per line (may be empty). Prints formatChanges() followed by a
// `describe=` line with the human sentence. Exit 0 always; a malformed version
// is reported as `full`, not as an error.
import { readFileSync } from "node:fs";
import { planChanges, formatChanges, describeChanges } from "./dataChanges.js";

const [oldVersion, newVersion] = process.argv.slice(2);
let paths: string[] = [];
try {
  paths = readFileSync(0, "utf8").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
} catch {
  // No stdin (a tty, or closed): no paths.
}
const plan = planChanges(oldVersion, newVersion, paths);
console.log(formatChanges(plan));
console.log(`describe=${describeChanges(plan)}`);
