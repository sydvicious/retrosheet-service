<!-- Copyright (c) 2026 Syd Polk -->
<!-- SPDX-License-Identifier: BSD-3-Clause -->

# Findings — HOF sightings

**56 Hall of Famers** seen take the field, across ~267 attended MLB games
(1975–2024). The full list is in [01-hall-of-famers.md](01-hall-of-famers.md);
this is the interpretation. Players only — see the note on managers below.

## The arc

The sightings trace the life. The earliest are **Astrodome** guys off a
kid's-eye-view of Houston baseball — McCovey and Winfield in 1976, Schmidt and
Carlton in '79, Bench and Nolan Ryan in '81, Sutton and Niekro in '82. The
middle fills in with the **1994 cross-country stadium tour** — a burst of first
sightings in a single summer (Piazza, Sandberg, Thomas, Molitor, Maddux, Thome,
Pudge, Frank Thomas, all within weeks). The late entries are the **Bay Area A's
and Giants years** — the Coliseum and Candlestick/Pac Bell regulars: Henderson,
Eckersley, Ichiro, Pedro, Ortiz, Helton, Rolen, Halladay, Vlad, Sabathia, Mauer.

## The surprise: Ted Simmons

The one that drew a blank in memory was **Ted Simmons**, first (and only) seen
**Oct 5, 1986** at the Astrodome. The mart explains why it's forgettable: it was
the last game of the season, Simmons a 37-year-old Braves backup, and he came off
the bench to pinch-hit a **single in the top of the 9th** of a game Houston had
already won 4–1. (Also a good reminder there are *two* HOF Simmonses — Ted Lyle,
and Al Simmons of the 1920s–40s — so match on `player_id`, not last name.)

Context the data can't hold: it was **Fan Appreciation Day for the NL-West-
champion '86 Astros**, the club headed for that 16-inning NLCS Game 6 vs the Mets.
Festive, playoff-bound, and — per the eyewitness — there was beer. The box score
remembers the pinch-hit single so the fan doesn't have to.

## Coverage note (aside)

Chasing why a Dodger Stadium game got scored from TV turned up a nice fact about
1988 Project-Scoresheet-era coverage: in-park scoring was rare *everywhere*
(Astrodome 16 of 81 home games, Dodger Stadium only 10 of 87). Dodger home games
were scored from **radio** more than any other way — 39 of them — i.e. a lot of
Retrosheet's Dodgers data came in through people scoring off **Vin Scully's**
call.

## Data quality

Two box-score links in the log were internally inconsistent (right team, wrong
date) — see [bad-links.md](bad-links.md). Corrected in the source spreadsheet.

## Ordering

The checklist is sorted in **Hall of Fame induction order** — the way the
Cooperstown Plaque Gallery itself is arranged (chronological by class, the 1936
inaugural five in the center of the rotunda) — so it reads as a walking route past
the plaques. The induction *year* is the one field Retrosheet doesn't ship in its
data (the `biofile` HOF column is a bare yes/no); it's on their website but not the
repo, so each player's year was fetched once from their Retrosheet bio page and
cached in `hof-induction.ts`.

## Managers (deliberately excluded)

The checklist is **players only**. Managers are a different kind of sighting —
seeing a Hall of Famer *manage* isn't the same as the plaque you check off — so
they're left off. That decision also sidesteps a data trap worth recording:
Retrosheet's `hof` flag is binary (in / not in), with **no induction category**,
and the category can't be inferred — **130 HOF people carry a `mgr_debut`**
(player-managers, plus modern coaches with a one-game acting-manager stint — even
Robin Yount has one), while only ~22 were enshrined *as* managers. So "HOF
managers I saw" can't be answered by the flag alone; it needs the curated
manager-inductee list in `hof-managers.ts`.

Both pieces are **retained for future queries**: the manager-of-record data lives
in the mart's `game_log` table, and `hof-managers.ts` holds the curated list. For
the record, the seven HOF *managers* seen (by that method) were Sparky Anderson,
Bobby Cox, Whitey Herzog, Tony La Russa, Tommy Lasorda, Jim Leyland, and Joe Torre
— and the game logs correct a tempting-but-wrong postseason answer: La Russa's
first sighting is a **1989 A's regular-season game at the Coliseum**, not the 1992
ALCS.
