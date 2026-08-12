// Copyright (c) 2026 Syd Polk
// SPDX-License-Identifier: BSD-3-Clause
//
// Clean-room tokenizer for Retrosheet event (.EV*) files, implemented from the
// published Retrosheet event-file format specification (retrosheet.org). It
// splits a file into games and typed records. Phase 2 consumes the file
// *structure* only — id / info / start / sub / com / data / adjustment records —
// and deliberately does NOT interpret the play `event` string (that is Phase 3).
//
// Record layouts (from the spec, confirmed against the data):
//   id,<gameid>
//   version,<n>
//   info,<key>,<value>
//   start,<playerid>,"<name>",<side 0=vis|1=home>,<battingorder 0-9>,<fieldpos 1-12>
//   sub,  <playerid>,"<name>",<side>,<battingorder>,<fieldpos>
//   play,<inning>,<side>,<batterid>,<count>,<pitches>,<event>      (ignored here)
//   com,"<text>"
//   data,er,<pitcherid>,<earnedruns>
//   badj,<playerid>,<hand> | padj,<playerid>,<hand> | ladj,<team>,<order>
//   radj,<playerid>,<base> | presadj,<playerid>,<base>

export interface LineupRecord {
  playerId: string;
  playerName: string;
  side: number | null; // 0 = visiting, 1 = home
  battingOrder: number | null; // 0-9 (0 = pitcher in a DH lineup)
  fieldingPosition: number | null; // 1-9 field, 10 DH, 11 PH, 12 PR
}

export interface SubRecord extends LineupRecord {
  seq: number; // record index within the game (preserves interleave order)
}

export interface CommentRecord {
  seq: number;
  text: string;
}

export interface DataRecord {
  kind: string; // "er"
  playerId: string;
  value: string;
}

export interface AdjustmentRecord {
  seq: number;
  type: string; // badj | padj | ladj | radj | presadj
  field1: string;
  field2: string;
}

export interface ParsedGame {
  gameId: string;
  info: Array<[string, string]>; // ordered key/value pairs, verbatim
  starts: LineupRecord[];
  subs: SubRecord[];
  comments: CommentRecord[];
  data: DataRecord[];
  adjustments: AdjustmentRecord[];
}

const ADJUSTMENTS = new Set(["badj", "padj", "ladj", "radj", "presadj"]);

/**
 * Split a single event-file line into fields. Handles double-quoted fields
 * (player names, comment text) with "" as an escaped quote. Operates per line
 * so one malformed record cannot derail the rest of the file.
 */
export function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let i = 0;
  const n = line.length;
  for (;;) {
    let field = "";
    if (i < n && line[i] === '"') {
      i++; // consume opening quote
      while (i < n) {
        const c = line[i]!;
        if (c === '"') {
          if (i + 1 < n && line[i + 1] === '"') {
            field += '"';
            i += 2;
          } else {
            i++;
            break;
          }
        } else {
          field += c;
          i++;
        }
      }
    }
    while (i < n && line[i] !== ",") {
      field += line[i];
      i++;
    }
    fields.push(field);
    if (i < n && line[i] === ",") {
      i++;
      continue;
    }
    break;
  }
  return fields;
}

function toIntOrNull(s: string | undefined): number | null {
  if (s === undefined) return null;
  const t = s.trim();
  if (t === "" || !/^-?\d+$/.test(t)) return null;
  return Number(t);
}

function parseLineup(f: string[]): LineupRecord | null {
  const playerId = (f[1] ?? "").trim();
  if (playerId === "") return null;
  return {
    playerId,
    playerName: f[2] ?? "",
    side: toIntOrNull(f[3]),
    battingOrder: toIntOrNull(f[4]),
    fieldingPosition: toIntOrNull(f[5]),
  };
}

/** Parse an event file's text into its games and their structural records. */
export function parseEventFile(text: string): ParsedGame[] {
  const games: ParsedGame[] = [];
  let cur: ParsedGame | null = null;
  let seq = 0;

  for (const rawLine of text.split(/\r?\n/)) {
    if (rawLine === "") continue;
    const f = parseCsvLine(rawLine);
    const type = f[0] ?? "";

    if (type === "id") {
      cur = {
        gameId: (f[1] ?? "").trim(),
        info: [],
        starts: [],
        subs: [],
        comments: [],
        data: [],
        adjustments: [],
      };
      games.push(cur);
      seq = 0;
      continue;
    }
    if (cur === null) continue; // ignore any records before the first id
    seq++;

    switch (type) {
      case "info":
        cur.info.push([f[1] ?? "", f[2] ?? ""]);
        break;
      case "start": {
        const s = parseLineup(f);
        if (s) cur.starts.push(s);
        break;
      }
      case "sub": {
        const s = parseLineup(f);
        if (s) cur.subs.push({ ...s, seq });
        break;
      }
      case "com":
        cur.comments.push({ seq, text: f[1] ?? "" });
        break;
      case "data":
        cur.data.push({ kind: f[1] ?? "", playerId: f[2] ?? "", value: f[3] ?? "" });
        break;
      default:
        if (ADJUSTMENTS.has(type)) {
          cur.adjustments.push({ seq, type, field1: f[1] ?? "", field2: f[2] ?? "" });
        }
        // "play" and "version" are intentionally ignored in Phase 2.
        break;
    }
  }

  return games;
}
