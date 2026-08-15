<!-- Copyright (c) 2026 Syd Polk -->
<!-- SPDX-License-Identifier: BSD-3-Clause -->

# Findings

Ryan in 1987: 34 starts, 211.1 IP, **2.76 ERA (led the National League)**, 270
strikeouts (led the NL), and an **8–16** record. What follows tests the two
stated hypotheses against the play-by-play, and then prices out the bullpen.

## Summary

| Question | Verdict |
| --- | --- |
| 1987 had the fewest batters faced per start of his career as a starter | **No** — 7th-lowest of 26 seasons |
| ...but his *exposure* beyond 18 batters was near a career low | **Yes** — 30.1%, second only to 1986 |
| 1987 shows an unusual third-time-through decline | **No** — the split is dead-on his career norm |
| The bullpen cost him wins | **Yes** — about 2.4, with ~4 blown leads |
| The bullpen was the main reason for 8–16 | **No** — all 4 blown leads were no-decisions, so it cost wins, not losses |
| The 16 losses were the offense | **Yes** — 1.69 runs of support per loss |

## Attribution ledger

What each candidate cause is worth, how likely it is to be real, and what part of
the 8–16 it can account for.

| Cause | Effect size | Significance | Ryan's losses | Ryan's wins denied |
| --- | --- | --- | --- | --- |
| **Houston's offense** | 3.35 vs 4.22 runs/start | p ≈ 0.11 overall; p ≈ 0.02 at home (post-hoc) | **8–9 of 16** | — |
| **Bullpen** | 6.49 RA/9 vs 4.73 same pen elsewhere; 4 blown leads vs 1.6 expected | p ≈ 0.065 | **0 of 16** | **~2.4–4** |
| **Ryan himself** | 4 starts of 4+ runs allowed | n/a — observed | **4 of 16** | — |
| **Bequeathed runners** | 6 scored, 3 earned | n/a — observed | 0 (already trailing in all 6) | — |
| **Early hooks** | 30.1% of IP after batter 18 | descriptive | 0 directly | indirect — exposed 97 relief IP |
| **Platoon/lineup shift** | 0.46 fewer regulars at home | mix difference p ≈ 0.14; **refuted** — gap sits in RHP games | ~0 | — |

**The loss column, 16 games:**

* **13** — Houston scored 2 runs or fewer
* **9** — Ryan allowed 2 runs or fewer
* **8** — both at once: he allowed ≤2 *and* they scored ≤2
* **4** — Ryan allowed 4 or more (his own doing)
* **0** — bullpen blew a lead he had handed over

The single most important structural fact: **the bullpen cost him wins, never
losses.** All four blown leads became no-decisions, and in all six games where his
bequeathed runners scored he was already trailing when he left. Conversely the
offense cost him losses, not wins. The two causes are almost perfectly disjoint,
which is why "it was the bullpen" and "it was the offense" are both half-right.

Counterfactuals, in descending order of confidence:

| Scenario | Record |
| --- | --- |
| Actual | 8–16 |
| League-average bullpen (traceable to 4 specific games) | **12–16** |
| ...plus Houston's normal run support (modelled) | roughly 15–12 |

## 1. Batters faced per start — hypothesis not supported as stated

1987's **25.68 BF/start** is not his lowest. Six seasons were lower: 1993
(22.31), 1969 (23.80), 1986 (24.27), 1992 (24.96), 1991 (25.26), 1984 (25.33).
It ranks 7th-lowest of the 26 seasons in which he made 10+ starts.

The drop is also not a 1987 event. Ryan's workload steps down permanently after
1983, from roughly 30–34 BF/start in the Angels years to 24–28 for the rest of
his career. 1987 sits inside that later regime rather than standing out from it.

**The framing that does survive** is exposure share. Of the innings Ryan threw in
1987, only **30.1% came after the 18th batter** — versus 48.8% (1974), 48.4%
(1977) and 48.0% (1973) at his peak. Only 1986 (28.1%) is lower among his full
seasons. Put the other way: in his prime nearly half his work came the third time
through the order; by 1986–87 it was under a third.

And he was being removed while pitching *well*. In 1987 he made **22 starts
allowing 2 runs or fewer** — his third-most ever, behind 1972 (28) and 1973
(23), both seasons of 39 starts against his 34 — and in
**12 of them (54.5%) he was pulled before facing 27 batters**. The comparable
figures are 66.7% (1986), 53.3% (1991), 40.0% (1984 and 1992). In 1973–74 it was
under 5%.

So: 1987 was not uniquely short, but 1986–87 together are the point where Ryan
stopped being allowed to face a lineup a third time despite pitching well. If the
Houston papers were reporting a pitch limit, the data is consistent with one —
it just started in 1986, and 1986 is the more extreme year.

## 2. First 18 batters vs the whole start — no unusual 1987 effect

1987: **2.57 ERA through 18 batters, 3.24 after, 2.77 overall** — a third-time
penalty of **+0.67**.

Against his own career that is unremarkable. Across his 26 qualifying seasons the
penalty averages **+0.74** and the median is **+0.72**. 1987 lands on the median.
His genuinely severe years were 1969 (+3.56), 1985 (+2.77), 1983 (+2.64) and 1968
(+2.30); he was actually *better* late in starts in nine seasons, including 1990
(−1.34) and 1977 (−0.77).

There is an important circularity here, and it cuts in favour of the hypothesis
rather than against it: **a starter pulled at 100 pitches never gets charged for
the innings that would have gone badly.** In 1987 only 63.7 of Ryan's 211.1
innings came after the 18th batter, so the "after 18" sample is both small and
selected — those are the days he had earned the right to keep going. The modest
penalty is partly a consequence of the usage pattern, not independent evidence
against it.

So the honest reading of hypothesis 2 is: **Houston was not reacting to a
measurable 1987 collapse the third time through.** They were limiting his
exposure for other reasons (the back, and his age — he turned 40 that season),
and the effect of that limiting looks like modern usage. The preview is real; the
underlying third-time cliff that modern teams cite is not visible in his 1987
numbers.

## 3. What the bullpen actually cost him

The Houston bullpen was ordinary in 1987 and catastrophic behind Ryan.

| Group | IP | Runs | RA/9 |
| --- | --- | --- | --- |
| NL relievers, all 12 teams | 5690.0 | 3181 | 5.03 |
| HOU relievers, all games | 432.0 | 246 | 5.13 |
| HOU relievers, **non**-Ryan starts | 335.0 | 176 | 4.73 |
| HOU relievers, **Ryan** starts | 97.0 | 70 | **6.49** |

The same bullpen allowed 4.73 runs per nine in everyone else's starts and 6.49
behind Ryan — about **15.7 runs worse than the NL average** over those 97 innings.

The direct cost shows up in leads:

| Group | Exits with a lead | Leads held | % |
| --- | --- | --- | --- |
| All other NL starters | 721 | 625 | 86.7 |
| Other HOU starters | 52 | 43 | 82.7 |
| **Ryan 1987** | **12** | **8** | **66.7** |

Ryan left 12 starts with a lead and Houston lost 4 of them. At the league rate
he would have lost 1.6, so roughly **2.4 wins evaporated** — and in all four
blown leads he had already pitched deep enough to qualify for the win, so all
four would have been Ryan wins. (He took no decision in any of them; his 16
losses are untouched.) At 12 trials this is suggestive rather than conclusive —
losing 4 or more when 1.6 are expected happens about 6.5% of the time by chance.

A smaller, separate cost: **6 runners Ryan left on base were allowed to score by
relievers**, and 3 of those were earned, meaning they are sitting in his 2.76
ERA. Charge them to the bullpen and his ERA is about **2.63**.

**Projected record.** Restoring the four blown leads at league-average bullpen
performance takes him from 8–16 to about **12–16** — the only projection here
traceable to specific games. Going further requires modelling: with an
NL-average bullpen, Houston's Pythagorean record in his 34 starts improves from
their actual 12–22 to roughly 15–19, and with normal run support as well to
around 19–15. A mid-teens win total was a reasonable expectation for the season
he pitched.

## 4. The bigger culprit: run support

Houston scored **3.35 runs per game in Ryan's starts** versus 4.22 in their other
games — about 30 runs of missing offense, comfortably larger than the bullpen's
15.7.

The Astrodome makes the raw number untrustworthy, so it is worth splitting, with
the caveat that this leaves only 17 games per cell:

| Venue | Ryan starts | Runs behind Ryan | Other games | Runs otherwise |
| --- | --- | --- | --- | --- |
| Astrodome | 17 | 2.88 | 64 | 4.53 |
| Road | 17 | 3.82 | 64 | 3.91 |

On the road Houston scored essentially the same behind Ryan as behind anyone
else. **The entire shortfall is 17 home games.** Tested properly against the rest
of the rotation:

| Split | Ryan | Others | Diff | t | Ryan starts ≤1 run | Others ≤1 run |
| --- | --- | --- | --- | --- | --- | --- |
| All games | 3.35 (34) | 4.22 (128) | −0.87 | −1.63 | 32.4% | 17.2% |
| Astrodome | 2.88 (17) | 4.53 (64) | **−1.65** | **−2.43** | **47.1%** | 10.9% |
| Road | 3.82 (17) | 3.91 (64) | −0.08 | −0.10 | 17.6% | 23.4% |

The pre-specified comparison across all 34 starts is not significant (p ≈ 0.11).
The Astrodome subgroup on its own is (p ≈ 0.02 on Welch's df, which only just
clears a two-way Bonferroni threshold of 0.025). Houston was held to one run or
fewer in **8 of Ryan's 17 home starts, against 7 of the other 64**.

Because that split was chosen after the fact, the next question is whether any
mechanism supports it. Three were tested and essentially none does:

| Check | Ryan (Astrodome) | Others (Astrodome) |
| --- | --- | --- |
| Caught by Alan Ashby | 70.6% | 67.2% |
| Opposing starter ERA | 4.26 | 4.23 |
| Regulars in lineup (of 8) | **5.76** | **6.22** |

There was no personal catcher and no tougher opposition. Houston did start about
**0.46 fewer regulars** behind Ryan at home, and the players involved look like a
platoon pattern rather than rest — the three biggest gaps (Craig Reynolds, Denny
Walling, José Cruz) all bat left-handed, while every switch-hitter shows no gap
at all. Ryan's home turns also fell against left-handed starters 47.1% of the
time against 28.1% for the rest of the rotation.

That looks like a mechanism, and it is not one. Three things sink it:

1. **The handedness difference is not significant.** 8 of 17 against 18 of 64 is
   χ² ≈ 2.2, p ≈ 0.14 — a 19-point gap that 17 games produce by chance easily.
2. **Its run value is trivial.** Houston scored 4.28 against LHP and 4.63 against
   RHP at home, so shifting the mix 19 points buys about 0.07 runs a game — some
   4% of the 1.65-run shortfall.
3. **The gap sits in the wrong games.** Splitting Ryan's 17 home starts by
   opposing hand puts the damage where no platooning was happening at all:

| Opposing hand | Ryan (home) | Others (home) | Diff | t |
| --- | --- | --- | --- | --- |
| LHP — left-handed bats sat | 3.50 (8) | 4.28 (18) | −0.78 | −0.71 |
| RHP — regular lineup intact | **2.33 (9)** | 4.63 (46) | **−2.30** | **−2.54** |

Against left-handers, with the weakened lineup, Houston was 0.78 runs light and
the difference is not significant. Against right-handers, with Reynolds, Walling
and Cruz all in the lineup, they were **2.30 runs light**. The shortfall is
concentrated precisely where the offense was at full strength, which is the
opposite of what the platoon story predicts.

So the honest verdict is weaker than "bad luck" and weaker than "real effect":
**the home shortfall is statistically suggestive, survives every mechanism test
thrown at it, and rests on 17 games — 9 of them for the significant part.** A
post-hoc subgroup with no causal story is the classic profile of a result that
fails to replicate. It should not be leaned on without a second season of
evidence, and equally should not be waved away as noise.

For context on the park: the Astrodome yielded 7.54 combined runs per game in
1987, second-lowest in the NL and far below Atlanta's 10.85 — which is also why
comparing Houston's raw offense to the league average would be misleading.

## 5. Which was it — the bullpen or the offense?

They damaged different columns, and conflating them is the easiest mistake to
make with this season.

| Decision | Games | Ryan's IP | Ryan allowed | Houston scored |
| --- | --- | --- | --- | --- |
| Win | 8 | 7.13 | 1.13 | 5.63 |
| No decision | 10 | 6.63 | 1.80 | 4.20 |
| Loss | 16 | 5.50 | 2.75 | **1.69** |

In his 16 losses Houston scored **1.69 runs per game**, and in **13 of the 16
they scored 2 or fewer**. In 9 of those 16 losses Ryan allowed 2 runs or fewer.
Exactly one was a genuine blowup (28 June, 8 runs).

Crucially, **all four blown leads became no-decisions, not losses.** The bullpen
therefore accounts for none of his 16 defeats. It denied him wins; the offense
handed him losses:

* **The 16 losses were the offense.** 1.69 runs of support is unsurvivable no
  matter who relieves you.
* **The gap between 8 wins and roughly 12 was the bullpen.** Four leads given
  away, each in a game he had pitched deep enough to win.

Fixing the bullpen alone leaves him 12–16 — still a losing record behind a
league-leading ERA. Both causes are needed to explain 8–16, and the 5.63 / 4.20 /
1.69 support spread is itself the signature of small-sample luck rather than
anything structural, consistent with the venue split in section 4.

## 6. Ryan against the rest of the Houston rotation

He got the least support on the staff, but the gap does not survive scrutiny.

| Starter | GS | Runs/start | SE | % starts with ≤2 | Opp. starter ERA |
| --- | --- | --- | --- | --- | --- |
| Nolan Ryan | 34 | **3.35** | 0.47 | 47.1 | 4.28 |
| Mike Scott | 36 | 3.75 | 0.48 | 36.1 | 4.23 |
| Bob Knepper | 31 | 4.19 | 0.46 | 35.5 | 4.11 |
| Danny Darwin | 30 | 4.47 | 0.52 | 30.0 | 4.19 |
| Jim Deshaies | 25 | 4.64 | 0.56 | 24.0 | 4.28 |

Ryan was scored for **1.29 fewer runs per start than Deshaies** and 0.87 fewer
than the staff's other starts, and was held to 2 runs or fewer in **47% of his
starts** against Deshaies' 24%.

Two checks say this is noise:

1. **The spread is exactly what chance predicts.** The five starter means have a
   standard deviation of 0.53. With a per-game scoring SD of about 2.77 and ~31
   starts each, pure sampling error alone predicts 0.50. There is essentially no
   excess variation left for a real effect to live in.
2. **The one plausible mechanism is absent.** If Ryan as the ace routinely drew
   the other team's ace, low support would be structural rather than luck. He did
   not: opposing starters in his games averaged a **4.28** ERA, the *weakest*
   opposition on the staff (Knepper faced the toughest at 4.11). The 0.17 spread
   across the rotation is trivial. He faced slightly worse pitchers than his
   teammates and still scored least.

## 7. 1986 vs 1987 — the league moved, not Houston

| Season | HOU runs/game | NL rank | NL average | vs league | Ryan support | Other HOU starts |
| --- | --- | --- | --- | --- | --- | --- |
| 1986 | 4.12 | 7th of 12 | 4.22 | −0.10 | 3.90 | 4.17 |
| 1987 | 4.04 | **11th of 12** | 4.56 | **−0.53** | 3.35 | 4.22 |

Houston's offense scored 4.12 runs per game in 1986 and 4.04 in 1987 — a change
of 0.08, or about a dozen runs across the season. What changed was the league,
which jumped from 4.22 to 4.56 in the 1987 offensive spike widely attributed to the
ball. Houston stood still while everyone else gained, and fell from 7th to 11th
on a rounding error's worth of actual decline.

This matters for reading the season: Houston's offense was not substantially
worse in absolute terms in 1987, only in relative terms. Ryan's ERA looks better
against that inflated backdrop too — his 2.76 came in a year when the league
scored half a run per game more than the year before.

Ryan was below his own team's support in both seasons (−0.27 in 1986, −0.87 in
1987). Two consecutive years is suggestive, but even pooling both (64 starts)
leaves t well short of significance, and with no mechanism behind it.

## Conclusion

The Houston papers were describing something real, but it started in 1986 and it
was about *exposure*, not raw innings: by 1986–87 Ryan was throwing under a third
of his innings the third time through the order, down from nearly half in his
prime, and was being lifted while cruising in more than half his good starts.
That is recognisably modern usage arrived thirty years early.

What it was not was a response to a measurable third-time-through collapse — his
1987 late-start penalty is exactly his career norm. And the 8–16 record was
driven more by an offense that scored 3.35 runs a game behind him than by a
bullpen that blew four leads, though both were adverse and neither is
statistically damning on its own. The truest summary is that a 2.76 ERA turned
into 8–16 through a pile-up of ordinary bad luck, in front of a pitcher his
manager had already decided to protect.
