// Copyright (c) 2026 Syd Polk
// SPDX-License-Identifier: BSD-3-Clause
//
// CLI over dataChanges.ts for scripts/data-changes.sh, which runs it inside the
// loader container (the host has git but no Node; the image has Node but no
// git). Usage:
//
//   node dist/etl/dataChangesCli.js <old data version> <new data version> < paths
//
// stdin is the output of `git diff --name-status --no-renames <old> <new>`:
// one `<status>\t<path>` per line (a bare path counts as modified; may be
// empty). Prints formatChanges() followed by a `describe=` line with the human
// sentence. Exit 0 always; a malformed version is reported as `full`, not as an
// error.
import { readFileSync } from "node:fs";
import { planChanges, formatChanges, describeChanges, type ChangeEntry } from "./dataChanges.js";

const [oldVersion, newVersion] = process.argv.slice(2);
let entries: (ChangeEntry | string)[] = [];
try {
  entries = readFileSync(0, "utf8")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const tab = l.indexOf("\t");
      return tab < 0 ? l : { status: l.slice(0, tab).trim(), path: l.slice(tab + 1).trim() };
    });
} catch {
  // No stdin (a tty, or closed): no changes.
}
const plan = planChanges(oldVersion, newVersion, entries);
console.log(formatChanges(plan));
console.log(`describe=${describeChanges(plan)}`);
