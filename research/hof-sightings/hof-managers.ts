// Copyright (c) 2026 Syd Polk
// SPDX-License-Identifier: BSD-3-Clause
//
// Curated list of the Hall of Famers inducted AS MANAGERS.
//
// RETAINED FOR FUTURE QUERIES. The HOF-sightings study is players-only, so nothing
// imports this today — but the manager-of-record data lives in the mart's
// `game_log` table, and this list is what makes a "HOF managers I saw" query
// meaningful (join game_log × these ids). Kept here so that work isn't lost.
//
// WHY IT HAS TO BE CURATED: Retrosheet's biofile has a single binary `hof` flag
// ("HOF" or blank) — it records WHO has a plaque, never for WHAT. And induction
// category can't be inferred from the data: 130 HOF people carry a `mgr_debut`
// (player-managers were common, and modern coaches log acting-manager games — even
// Robin Yount has one), yet only these ~22 were enshrined as managers. Induction
// category is an external Hall-of-Fame fact (not even shown on Retrosheet's own
// bio pages, which display only the induction year), so it must be curated.
//
// A HOF *player* seen managing (Molitor, Trammell, Frank Robinson, Yogi Berra,
// Tony Perez, Yount…) is NOT in this list — those are player inductees.
//
// Source: the Baseball Hall of Fame's managers (public fact). Player_ids verified
// against retrosheet.people. Deliberately EXCLUDED as not manager-inductees:
// Clark Griffith (pioneer/executive) and the Negro-League executive/pioneer
// inductees. Player-managers inducted as players (Anson, F. Chance, F. Clarke,
// Hughie Jennings, Cap Anson, …) are likewise excluded by design.
export const HOF_MANAGERS: Record<string, string> = {
  alstw101: "Walter Alston",
  andes101: "Sparky Anderson",
  "cox-b103": "Bobby Cox",
  durol101: "Leo Durocher",
  hanln101: "Ned Hanlon",
  harrb106: "Bucky Harris",
  herzw101: "Whitey Herzog",
  huggm101: "Miller Huggins",
  larut101: "Tony La Russa",
  lasot101: "Tommy Lasorda",
  leylj801: "Jim Leyland",
  lopea102: "Al Lopez",
  mackc101: "Connie Mack",
  mccaj802: "Joe McCarthy",
  mcgrj101: "John McGraw",
  mckeb101: "Bill McKechnie",
  robiw101: "Wilbert Robinson",
  selef801: "Frank Selee",
  stenc101: "Casey Stengel",
  torrj101: "Joe Torre",
  willd104: "Dick Williams",
  weave801: "Earl Weaver",
};

export const HOF_MANAGER_IDS = Object.keys(HOF_MANAGERS);
