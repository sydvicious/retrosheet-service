<!-- Copyright (c) 2026 Syd Polk -->
<!-- SPDX-License-Identifier: BSD-3-Clause -->

# Findings — blown leads of 11 runs or more

## The answer

Ten games, 1900–2025. Eight ended in defeat; two teams gave the whole lead back
and won anyway.

| Date | Game | Blew it | Peak lead | Level again | Result |
| --- | --- | --- | --- | --- | --- |
| Jun 18, 1911 | CHA @ DET | White Sox, 13–1 (5th) | 12 | 15–15 (9th) | Tigers 16–15 |
| Jun 15, 1925 | CLE @ PHA | Indians, 14–2 (6th) | 12 | straight past level (8th) | A's 17–15 |
| Jun 17, 1936 | PHA @ SLA | Athletics, 13–2 (6th) | 11 | 13–13 (8th) | Browns 14–13 |
| Aug 28, 1950 | CLE @ BOS | Indians, 12–1 (4th) | 11 | 13–13 (8th) | Red Sox 15–14 |
| Jun 15, 1952 (g1) | SLN @ NY1 | Giants, 11–0 (3rd) | 11 | 11–11 (8th) | Cardinals 14–12 |
| Apr 17, 1976 | PHI @ CHN | Cubs, 12–1 (3rd) | 11 | 13–13 (9th) | Phillies 18–16 (10) |
| May 17, 1979 | PHI @ CHN | Phillies, 21–9 (5th) | 12 | 22–22 (8th) | **Phillies 23–22 (10)** |
| Jul 18, 1994 ★ | SLN @ HOU | Cardinals, 11–0 (3rd) | 11 | 11–11 (6th) | Astros 15–12 |
| Aug 5, 2001 | SEA @ CLE | Mariners, 12–0 (3rd) | 12 | 14–14 (9th) | Indians 15–14 (11) |
| Sep 4, 2002 ★ | KCA @ OAK | Athletics, 11–0 (3rd) | 11 | 11–11 (9th) | **A's 12–11** |

★ Syd was there. Team nicknames above are the era-correct ones; the generated
`01-blown-leads.md` shows the franchise's current nickname, because the mart
holds a single name per team id (1925 Cleveland reads "Guardians").

**The record is 12 runs, and it has been matched four times** — 1911, 1925, 1979,
2001. Nobody has surrendered 13.

## How rare this is

An 11-run lead was held in 6,006 of the 201,874 games with play-by-play. Ten of
those collapsed: the lead survives **99.8%** of the time, so this is roughly a
**one-in-600** event, or about once every five seasons in the modern schedule.

**Rarer than a perfect game, far rarer than a triple play.** Syd's guess was that
this sits somewhere between the two; the mart says it is rarer than both.

| Event | Games, 1900–2025 | Roughly |
| --- | --- | --- |
| A triple play in the game | 535 | 1 in 377 |
| A perfect game | 23 | 1 in 8,800 |
| **An 11-run lead surrendered** | **10** | **1 in 20,000** |

Perfect games are counted here as a pitcher with 27+ outs who allowed no hits, no
walks, no hit batters and no runs, and faced exactly as many batters as he
recorded outs. The 23 are the 22 perfect games since 1900 plus Harvey Haddix's 12
perfect innings on May 26, 1959 — which he lost in the 13th, and which is arguably
the right company for this list anyway.

*(That count needs the internal-consistency filter, because
`pitching_daily.batters_faced` is broken the same way `runs_on_play` is: asking
only for `batters_faced = outs` returns **98** games, including pitchers charged
with three hits. A batter who reaches isn't being counted as faced. Third column
in this study to fail an independent check — see below.)*

A 10-run lead is a different animal only in degree — 9 more games gave one of
those away entirely (`02-near-misses.md`), including two that read like near
misses of the main list: the Pirates' 10–0 lead at Philadelphia on Jun 8, 1989
and the Dodgers' 11–1 on Aug 21, 1990.

## Shape of the collapse

The peak lead is almost always **early** — six of the ten peaked by the 5th
inning, five of them by the 3rd — and it is almost always erased **late**: eight
of ten drew level in the 8th or 9th. That is the signature of the thing. These
aren't games that drift; they're games where a starter's cushion sits untouched
for five innings and then the bullpen gives it back in two.

Three of the ten went extra innings. Two of the ten happened at **Wrigley Field,
Cubs against Phillies, three years apart** — Apr 17, 1976 (Cubs blew 12–1, Schmidt
hit four home runs, Phillies 18–16 in 10) and May 17, 1979 (Phillies blew 21–9 and
still won 23–22 in 10).

That is not coincidence: **late-1970s Wrigley was the most hitter-extreme park in
the National League.** Over 1975–79, NL-vs-NL regular-season games there averaged
9.72 runs against 7.83 in the Cubs' road games — a park factor of **1.240**, the
league's highest, with Atlanta–Fulton County close behind at 1.212 and nobody else
above 1.03. Wrigley ranked 1st or 2nd in the NL in all five of those seasons; the
two games above came in at 1.235 (1976) and 1.279 (1979). The opposite pole was
the **Astrodome at 0.814** — which is where the 1994 collapse happened, an 11-run
lead given away in the hardest park in the league to score in.

## The two Syd was at

**Jul 18, 1994 — Cardinals at Astros, Astrodome, 24,012.** St. Louis scored 11 in
the first three innings and did not score again until the game was gone. Houston
was level by the 6th and won 15–12.

**Sep 4, 2002 — Royals at Athletics, Oakland Coliseum, 55,528.** Oakland led 11–0
in the 3rd; Kansas City drew level 11–11 in the 9th; Scott Hatteberg ended it with
a pinch-hit home run, 12–11. This is the **20th consecutive win** — the American
League record game. It is the only game in this study that was simultaneously
one of the great collapses and one of the great wins.

Attending two of ten is the sort of coincidence worth stating plainly: given 268
logged games, expecting even one was a long shot.

## The data problem, which was the real work

The question needs the score *at every moment*, and the mart's stored answer to
that is wrong often enough to change the result. `play.runs_on_play` summed per
game disagrees with `game_log`'s official final in **26,875 of 201,870 games
(13.3%)**, in both directions, from two parser bugs:

- **Phantom runs on force outs** — a run credited on events like `64(1)/FO` and
  `5(2)/FO` that have **no advance section at all**, so no runner was ever written
  as reaching home. 19,646 plays across 18,582 games.
- **Dropped runs on multi-run plays** — fewer runs than there are `-H` advances in
  the event, typically when the second is marked `(UR)`:
  `S9/L9M.3-H;2-H(UR);1-3` scores two, the mart records one. 6,092 plays across
  5,404 games.

Re-deriving runs straight from the event string takes final-score agreement from
**86.7% to 98.8%**, and that number is the fix's own regression test.

The correction changed the answer three times:

- **Jun 8, 1989 (PIT @ PHI)** — a phantom run on `5(2)/FO` turned a 10–0 lead into
  11–0. False positive, removed.
- **Aug 21, 1990 (PHI @ LAN)** — a phantom run on `46(1)/FO/G4M` turned 11–1 into
  12–1. False positive, removed.
- **Sep 4, 2002 (KCA @ OAK)** — a dropped run on
  `S9/L9M.3-H;2-H(UR);1-3` left the ninth-inning tie reading 11–10, so the game
  never showed as level. **False negative** — and it is one of the two Syd
  attended. Had the study trusted the stored column, it would have answered his
  actual question wrong.

That is the argument for making verification part of the play-by-play state work
rather than a follow-up: the state column this study needed already existed, and
the reason it couldn't be used had nothing to do with what was persisted. The
check that catches both bugs is one full-table pass — each game's cumulative
score after the last play must equal `game_log`'s final — and it is *independent*
of the parser, because the game logs are a separate Retrosheet download. Recorded
under "Future — full game-state analysis" in the project plan.

## Caveats

- **462 candidate games have no play-by-play** (both teams 11+ runs, game log
  only) — 404 of them pre-1900, the rest trailing off through 1955. Any 11-run
  collapse in those is invisible here. The pre-1900 gap is total: Retrosheet has
  no event files before 1900.
- **Residual reconstruction error.** Even derived, 1.2% of games (2,364) don't
  match their official final — concentrated pre-1930, and presumably games whose
  play-by-play is itself incomplete or deduced. None of them are candidates for
  this study, but a study working at the play level in the deadball era should
  expect them.
- **Definition sensitivity.** "Blew an 11-run lead" is read here as *gave it all
  back*. Under the stricter "and lost", it is 8 games. Under a looser reading
  ("lost most of a big lead"), the near-miss table is the place to look.
