// Copyright (c) 2026 Syd Polk
// SPDX-License-Identifier: BSD-3-Clause
//
// Retrosheet roster (.ROS) line format (no header), 7 comma-separated fields:
//   player_id, last, first, bats, throws, team, position
// e.g.  adamj003,Adams,Jordyn,R,R,ANA,OF

export interface RosterEntry {
  playerId: string;
  lastName: string;
  firstName: string;
  bats: string;
  throws: string;
  team: string;
  position: string;
}

/** Map a parsed roster row to a typed entry, or null if it has no player id. */
export function parseRosterRow(fields: string[]): RosterEntry | null {
  const playerId = (fields[0] ?? "").trim();
  if (playerId === "") return null;
  return {
    playerId,
    lastName: (fields[1] ?? "").trim(),
    firstName: (fields[2] ?? "").trim(),
    bats: (fields[3] ?? "").trim(),
    throws: (fields[4] ?? "").trim(),
    team: (fields[5] ?? "").trim(),
    position: (fields[6] ?? "").trim(),
  };
}
