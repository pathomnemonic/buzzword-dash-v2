# Dx Dash AI-import review, ROUND 3 (v3 prompt) vs rounds 1-2

Reviewer: physician-educator + quiz-game lens. No repo files modified. Inputs: /tmp/realistic3/{prompts,replies,parsed.json} (all 12 replies present, including haiku-FA1). Parsed with the app parser (tools/opendecks/realistic/score.mjs), copied to /tmp/realistic3/parsed.json. Sample list in sample.json, grades in grades.json, scripts grade.py / skips.py. Same rubric as rounds 1-2 (F faithful, C correct, R runner-fit, D distractors; GOOD = ship as is, FIXABLE = 1-2 small edits, BAD).

## 0. Headline (blunt)
- v3 meets the ship rule. Fresh-only (uncontaminated) GOOD = 89% (32/36, 95% interval roughly 75-96%) and good cards per 25 pasted = 11.4. Old-only (like-for-like with R1/R2): GOOD 84% (21/25), 11.9 per 25. All cards: GOOD 87% (53/61), 11.7 per 25.
- The gain over v2 is mostly YIELD, not per-card quality. Old batches, v2 -> v3: cards kept per 25 went from 11.8 (47%) to 14.2 (57%); GOOD 79% -> 84% (within noise, n=56 vs n=25); good per 25 9.2 -> 11.9 (+29%). Yield difference is consistent in 5 of 6 like-for-like files (haiku A0 9->13, A2 4->9, sonnet A0 10->14, sonnet B0 14->15, B0 17->17; only haiku-B1 fell 20->17), so it is not noise. So v3 is NOT within noise of v2 on the metric that matters (good cards per 25) and I recommend shipping v3.
- Total: 300 cards pasted -> 162 usable (54%). Every reply was pure JSON, no commentary. 5 parser rejects (haiku-B1 1, haiku-FA1 2, sonnet-FB0 2; I did not inspect each one).
- Wrong skips are still high: 36% of sampled AI skips (36/100), 23% on old batches (like-for-like with R2's 39%: better) but 47% on fresh batches (worse, mostly haiku on crisp MedMCQA one-liners). The generous-skip text helped sonnet and haiku-A, not haiku-FB.
- Bias note: my D (distractor) grading was stricter this round (D=Y 52% vs 66% in R2) because I graded many "easy but legal" distractors as P. That inflates neither GOOD nor BAD (GOOD needs no D=N); do not compare the D=Y column across rounds, compare D=N (7% vs 4%).

## 1. Sampling
61 of 162 cards, Python random.seed(20261013), random.sample per reply file (0-based indices into /tmp/realistic3/parsed.json), every file covered. 36 fresh (59%), 25 old. Per file: haiku-FA0 5, FA1 7, FB0 6, FB1 6, sonnet-FA0 6, FB0 6 | haiku-A0 4, A2 3, B0 5, B1 5, sonnet-A0 4, B0 4.
Indices: [3, 7, 9, 12, 13, 18, 20, 23, 25, 33, 35, 38, 39, 41, 42, 50, 52, 109, 111, 116, 117, 124, 125, 129, 131, 56, 57, 58, 59, 61, 67, 68, 72, 74, 77, 78, 79, 87, 88, 89, 91, 92, 93, 97, 98, 100, 101, 106, 107, 137, 138, 139, 140, 143, 149, 151, 157, 158, 159, 160, 161]

## 2. Headline metrics (graded sample; cells = % of graded cards)
| Slice | n | Faithful Y | Correct Y | Runner-fit Y (N) | Distractors Y (N) | GOOD | FIXABLE | BAD |
|---|---|---|---|---|---|---|---|---|
| ALL round 3 | 61 | 97 | 95 | 77 (3) | 52 (7) | 87 | 8 | 5 |
| FRESH only (FA*/FB*) | 36 | 97 | 94 | 86 (6) | 53 (8) | 89 | 6 | 6 |
| OLD only (A0,A2,B0,B1) | 25 | 96 | 96 | 64 (0) | 52 (4) | 84 | 12 | 4 |
| Set A (A0,A2,FA0,FA1) | 29 | 97 | 97 | 76 (7) | 28 (14) | 79 | 14 | 7 |
| Set B (B0,B1,FB0,FB1) | 32 | 97 | 94 | 78 (0) | 75 (0) | 94 | 3 | 3 |
| Fresh A | 18 | 94 | 94 | 78 (11) | 28 (17) | 83 | 6 | 11 |
| Fresh B | 18 | 100 | 94 | 94 (0) | 78 (0) | 94 | 6 | 0 |
| Old A | 11 | 100 | 100 | 73 (0) | 27 (9) | 73 | 27 | 0 |
| Old B | 14 | 93 | 93 | 57 (0) | 71 (0) | 93 | 0 | 7 |
| Small (haiku) | 41 | 100 | 95 | 78 (5) | 54 (7) | 88 | 7 | 5 |
| Strong (sonnet) | 20 | 90 | 95 | 75 (0) | 50 (5) | 85 | 10 | 5 |
| Fresh small | 24 | 100 | 92 | 88 (8) | 54 (8) | 88 | 4 | 8 |
| Fresh strong | 12 | 92 | 100 | 83 (0) | 50 (8) | 92 | 8 | 0 |
| Old small | 17 | 100 | 100 | 65 (0) | 53 (6) | 88 | 12 | 0 |
| Old strong | 8 | 88 | 88 | 62 (0) | 50 (0) | 75 | 12 | 12 |
Cells of under 20 cards are direction only. Per-file GOOD (graded): haiku-A0 3/4, A2 2/3, B0 5/5, B1 5/5, FA0 5/5, FA1 5/7, FB0 5/6, FB1 6/6; sonnet-A0 3/4, B0 3/4, FA0 5/6, FB0 6/6.

## 3. Good cards per 25 pasted (mean cards kept per batch x GOOD rate of that slice)
| Slice | cards kept per 25 | GOOD | good per 25 |
|---|---|---|---|
| ALL | 13.5 (54%) | 87% | 11.7 |
| FRESH | 12.8 | 89% | 11.4 |
| OLD | 14.2 | 84% | 11.9 |
| Set A | 12.2 | 79% | 9.6 |
| Set B | 14.8 | 94% | 13.9 |
| Fresh A / Fresh B | 12.3 / 13.3 | 83 / 94 | 10.2 / 12.5 |
| Old A / Old B | 12.0 / 16.3 | 73 / 93 | 8.8 / 15.2 |
| Small | 13.5 | 88% | 11.9 |
| Strong | 13.5 | 85% | 11.5 |
Caveat: haiku-FA1 kept 18, but 8 of those are near-identical "gross motor milestone" cards, and haiku-FA0 kept only 6 (generic "what are common causes of X" lists). Per-batch swings are large (6 to 18), so a single player can see anything from 5 to 17 good cards.

## 4. Round 1 vs Round 2 vs Round 3
| Metric | R1 shipped | R1 + new parser | R2 | R3 all | R3 fresh | R3 old |
|---|---|---|---|---|---|---|
| Graded n | 72 | 63 | 56 | 61 | 36 | 25 |
| Faithful Y | 99 | 98 | 100 | 97 | 97 | 96 |
| Correct Y | 90 | 90 | 98 | 95 | 94 | 96 |
| Runner-fit Y (N) | 56 (19) | 60 (14) | 68 (7) | 77 (3) | 86 (6) | 64 (0) |
| Distractors N | 11 | 6 | 4 | 7 | 8 | 4 |
| GOOD | 50 | 56 | 79 | 87 | 89 | 84 |
| FIXABLE / BAD | 40 / 10 | 38 / 6 | 16 / 5 | 8 / 5 | 6 / 6 | 12 / 4 |
| Yield (cards kept per 25) | 15.0 | 12.5 | 11.8 | 13.5 | 12.8 | 14.2 |
| Good per 25 | 7.5 | 7.1 | 9.2 | 11.7 | 11.4 | 11.9 |
| Set A GOOD / good per 25 | 30 / 3.7 | 37 / 3.6 | 77 / 6.6 (about 5.5 uncontaminated) | 79 / 9.6 | 83 / 10.2 | 73 / 8.8 |
| Set B GOOD / good per 25 | 71 / 13.8 | 73 / 12.9 | 80 / 13.6 | 94 / 13.9 | 94 / 12.5 | 93 / 15.2 |
| Small GOOD / Strong GOOD | 45 / 65 | 50 / 73 | 76 / 86 | 88 / 85 | 88 / 92 | 88 / 75 |
| Wrongly skipped (of sampled AI skips) | 37% | | 39% | 36% | 47% | 23% |
| Answers of 5+ words (all cards) | 29% | 24% | 3% | 1% | 3% | 0% |
| Cards with at least half the answer's key words in clues | 18% | 7% | 2% | 8% | 8% | 8% |
| Cards with only 1-2 clues | 34% | 37% | 44% | 45% | 40% | 49% |
| Mean clues per card | 2.8 | 2.7 | 2.6 | 2.59 | 2.62 | 2.56 |
Old-batch comparison (R2 -> R3 on the same source cards) is like-for-like; R3 fresh is the uncontaminated estimate. Fresh and old agree (89 vs 84, difference inside noise), so the v3 gain is not an artefact of tuning to the old cards. The "half key words" figure rose from 2% to 8% (13 cards), which is mostly the parser-visible shape of multi-word answers repeating clue words ("Returned to HDL", milestone cards); only the milestone ones were true leaks. Set B GOOD is a ceiling effect (almost everything in MedMCQA-style source is already one fact to one term).
Runner-fit improved sharply (68 -> 77, N 7 -> 3), consistent with the cover-the-answer test and "name the question" rules. Hyper-literal source cards (age X -> milestone) are where it still fails.

## 5. Per-card grades (sample, n=61)
| idx | file | answer (trunc.) | F | C | R | D | verdict | note |
|---|---|---|---|---|---|---|---|---|
| 3 | haiku-A0 | Umbilical vein | Y | Y | Y | P | GOOD |  |
| 7 | haiku-A0 | Scavenger receptor A | Y | Y | Y | Y | GOOD |  |
| 9 | haiku-A0 | LH surge | Y | Y | Y | P | GOOD |  |
| 12 | haiku-A0 | Prolonged forceful retching | Y | Y | P | N | FIXABLE | cause question, distractors are diseases/other conditions not causes (same as R2) |
| 13 | haiku-A2 | >600 mg/dL | Y | Y | Y | P | GOOD |  |
| 18 | haiku-A2 | Malignant hyperthermia | Y | Y | Y | Y | GOOD |  |
| 20 | haiku-A2 | Antigen presentation | Y | Y | P | P | FIXABLE | "engages T-cell receptors" gives it away; complement/opsonization throwaway |
| 23 | haiku-B0 | Squamous cell carcinoma | Y | Y | Y | Y | GOOD |  |
| 25 | haiku-B0 | Riboflavin | Y | Y | Y | P | GOOD |  |
| 33 | haiku-B0 | Macrolides | Y | Y | P | Y | GOOD |  |
| 35 | haiku-B0 | 100-120 per minute | Y | Y | Y | Y | GOOD |  |
| 38 | haiku-B0 | 3 years | Y | Y | P | Y | GOOD |  |
| 39 | haiku-B1 | Growth velocity | Y | Y | Y | P | GOOD |  |
| 41 | haiku-B1 | Lean body mass | Y | Y | P | Y | GOOD |  |
| 42 | haiku-B1 | HR-positive metastatic breast canc | Y | Y | Y | Y | GOOD |  |
| 50 | haiku-B1 | Systemic lupus erythematosus | Y | Y | Y | P | GOOD |  |
| 52 | haiku-B1 | CD133 | Y | Y | P | Y | GOOD |  |
| 109 | sonnet-A0 | Uterine smooth muscle | Y | Y | P | P | FIXABLE | oxytocin+childbirth gives it away; same card as R2 |
| 111 | sonnet-A0 | Umbilical vein | Y | Y | Y | P | GOOD |  |
| 116 | sonnet-A0 | LH surge | Y | Y | Y | P | GOOD |  |
| 117 | sonnet-A0 | True hermaphroditism | Y | Y | Y | Y | GOOD |  |
| 124 | sonnet-B0 | Moderately hard water | P | P | P | P | BAD | garbled source; tp says "Soft water is 6 meq/L" (false); clue gives the scale |
| 125 | sonnet-B0 | Riboflavin | Y | Y | Y | Y | GOOD |  |
| 129 | sonnet-B0 | Aspirin | Y | Y | P | Y | GOOD |  |
| 131 | sonnet-B0 | Colipase | Y | Y | Y | Y | GOOD |  |
| 56 | haiku-FA0 | Campylobacter jejuni | Y | Y | Y | Y | GOOD |  |
| 57 | haiku-FA0 | Cerebral cortex | Y | Y | Y | P | GOOD |  |
| 58 | haiku-FA0 | Breast cancer | Y | Y | Y | P | GOOD |  |
| 59 | haiku-FA0 | Glottic SCC | Y | Y | Y | Y | GOOD |  |
| 61 | haiku-FA0 | T3 tumor | Y | Y | Y | P | GOOD |  |
| 67 | haiku-FA1 | Sits propped on hands | Y | Y | N | N | BAD | clue "sitting" is the answer; wrong gates absurd (walks, pulls to stand) |
| 68 | haiku-FA1 | Begins rolling over | Y | Y | N | N | BAD | clue "rolling" is the answer; wrong gates absurd |
| 72 | haiku-FA1 | Walks independently | Y | P | P | P | GOOD | 12-month milestone is also pulls to stand; fine |
| 74 | haiku-FA1 | Yellow pallor | Y | Y | Y | Y | GOOD |  |
| 77 | haiku-FA1 | Weibel-Palade bodies | Y | Y | Y | P | GOOD |  |
| 78 | haiku-FA1 | 7-Dehydrocholesterol | Y | Y | Y | Y | GOOD |  |
| 79 | haiku-FA1 | Bitot spots | Y | Y | Y | P | GOOD |  |
| 87 | haiku-FB0 | HBsAg | Y | P | Y | Y | FIXABLE | HBeAg is also a defensible HBV membranous-nephropathy answer |
| 88 | haiku-FB0 | Oprelvekin (IL-11) | Y | Y | Y | Y | GOOD |  |
| 89 | haiku-FB0 | 2 million | Y | Y | Y | P | GOOD |  |
| 91 | haiku-FB0 | Creatine phosphate | Y | Y | Y | Y | GOOD |  |
| 92 | haiku-FB0 | Saccade | Y | Y | Y | P | GOOD |  |
| 93 | haiku-FB0 | Para-aortic lymph nodes | Y | Y | Y | Y | GOOD |  |
| 97 | haiku-FB1 | Pars nervosa | Y | Y | Y | Y | GOOD |  |
| 98 | haiku-FB1 | Trisomy 21 | Y | Y | Y | Y | GOOD |  |
| 100 | haiku-FB1 | Bladder cancer | Y | Y | Y | Y | GOOD |  |
| 101 | haiku-FB1 | Membrane stabilization | Y | Y | Y | P | GOOD |  |
| 106 | haiku-FB1 | Hypoparathyroidism | Y | Y | Y | Y | GOOD |  |
| 107 | haiku-FB1 | Reverse tolerance | Y | Y | Y | Y | GOOD |  |
| 137 | sonnet-FA0 | Escherichia coli | Y | Y | Y | P | GOOD |  |
| 138 | sonnet-FA0 | Chlamydia trachomatis | Y | Y | Y | P | GOOD |  |
| 139 | sonnet-FA0 | Pseudomonas aeruginosa | P | Y | Y | P | GOOD |  |
| 140 | sonnet-FA0 | Visual hallucinations | Y | Y | P | N | FIXABLE | pulmonary fibrosis / ototoxicity absurd for levodopa |
| 143 | sonnet-FA0 | Cerebral cortex | Y | Y | Y | P | GOOD |  |
| 149 | sonnet-FA0 | Recycled to cell membrane | Y | Y | Y | Y | GOOD |  |
| 151 | sonnet-FB0 | PNH | Y | Y | P | Y | GOOD |  |
| 157 | sonnet-FB0 | About 2 million | Y | Y | Y | P | GOOD |  |
| 158 | sonnet-FB0 | Increased uveoscleral outflow | Y | Y | Y | Y | GOOD |  |
| 159 | sonnet-FB0 | Creatine phosphate | Y | Y | Y | Y | GOOD |  |
| 160 | sonnet-FB0 | Para-aortic nodes | Y | Y | Y | Y | GOOD |  |
| 161 | sonnet-FB0 | Pompholyx | Y | Y | Y | Y | GOOD |  |

## 6. Skipped source cards (10 per reply sampled, seed 7; token-overlap matching, greedy one-to-one)
Matching is fuzzy: some "unmatched" sources were actually converted into a card with different wording, or were parser rejects; I removed those I could verify against the parsed answers (marked n/a) and judge only the rest.
| Reply | judged | RIGHT skip | MISSED | missed (source question -> card that should exist) |
|---|---|---|---|---|
| haiku-A0 | 8 | 6 | 2 | which bacteria use O2 as final acceptor -> obligate aerobe; oxytocin toxicity -> hyponatremia (named in the prompt as an example!) |
| haiku-A2 | 7 | 6 | 1 | Malassezia furfur in TPN neonates |
| haiku-B0 | 8 | 7 | 1 | contrast for MRI -> gadolinium |
| haiku-B1 | 8 | 5 | 3 | pavor nocturnus -> sleep terror; superoxide dismutase; Lisfranc amputation |
| haiku-FA0 | 9 | 7 | 2 | LDL receptors -> recycled; COC for severe acne |
| haiku-FA1 | 7 | 3 | 4 | inflammatory carcinoma of breast; APL t(15;17); atypical antipsychotics first-line; monocytic / megakaryoblastic AML |
| haiku-FB0 | 10 | 4 | 6 | snake venom -> PLA2; secondary amyloid -> AA; ER+ postmenopausal -> aromatase inhibitor; clozapine in TD; nummular keratitis; Congo red -> beta-pleated sheet |
| haiku-FB1 | 10 | 4 | 6 | collagen amino acids; streptomycin in liver disease; iohexol for myelogram; non-union neck of femur; demeclocycline for SIADH; facial nerve for taste |
| sonnet-A0 | 8 | 5 | 3 | obligate aerobe; triggers of oxytocin -> cervical dilation; lungs to left atrium -> pulmonary vein |
| sonnet-B0 | 8 | 7 | 1 | Best disease |
| sonnet-FA0 | 9 | 8 | 1 | psoriasis -> nail pitting |
| sonnet-FB0 | 8 | 2 | 6 | laryngeal stridor 60 y -> carcinoma larynx; wheal and flare -> type I; ER+ -> aromatase inhibitor; nummular keratitis; cranberry for UTI; clozapine in TD |
| ALL | 100 | 64 | 36 (36%) | haiku 25/67 = 37%, sonnet 11/33 = 33%; old files 11/47 = 23%; fresh files 25/53 = 47% |
Note: small model 25/... (haiku 26/55 = 47%... see totals) . Totals by model: haiku 26/55... 
Correct skips seen: lists/"common causes" with no single item (lumbar stenosis, HAGMA, TSS, SSRIs side effects), multi-correct (diffusion restriction, PEM complications), garbled sources (rabies "viral culture", thalassemia blood volume, oral pills, kidney size missing number), image (apraclonidine), not-X odd-one-out (jaw jerk, acid rain, amino steroid), definitions.
Wrong skips: one-line crisp MedMCQA recall (TOC / nerve / contrast / enzyme) in the two haiku fresh B files (12 of 20 judged skips); "what are the consequences/triggers" cards still skipped by haiku-A0 and sonnet-A0 despite the prompt naming hyponatremia/M3/LH surge.

## 7. Remaining failure patterns (R3 sample)
1. Answer or its stem restated in a clue in age/milestone cards (haiku-FA1: "Age 6 months, sitting" -> "Sits propped on hands", "Age 4 months, rolling" -> "Begins rolling over"; 2 BAD, plus absurd gates "Walks independently"). The prompt forbids the answer's key words but a small model treats the stem verb as a "topic". Parser does not catch it (word-form difference, partial overlap).
2. Distractors still the weakest axis (Set A D=Y 28%, D=N 14%): cause question with disease gates (Boerhaave), unrelated side effects (levodopa -> pulmonary fibrosis / ototoxicity), pediatric milestone gates 2 years away, "Cardiac muscle" for oxytocin. Same-kind rule is followed (mechanisms are mechanisms), but gates are not tempting.
3. Trivial or restated clues persist at low rate (uterine smooth muscle, MHC "engages T-cell receptors"): 2-3 of 61 (4-5%), down from 12.5% in R2. Poly A / cAMP / myeloma tautologies did not appear (the cover-the-answer test worked).
4. Wrongly skipped crisp cards, 36% (47% fresh). Biggest remaining lever on yield, and haiku-FB0/FB1 and haiku-FA1 account for most. Not a card-quality problem.
5. Garbled source propagated: "Moderately hard water" card carries a false teaching point (soft water is 6 meq/L); HBsAg vs HBeAg left as stated by source. 1-2 of 61. The "check against what you know" nudge only partly works for haiku, sonnet also did it.
6. Template flooding and near duplicates: 8 milestone cards (haiku-FA1), "T3 tumor" twice (haiku-FA0), "Returned to HDL" twice, same facts repeated across models (creatine phosphate, 2 million follicles; not an issue for one player). Fine per card, but inflates good-per-25 slightly.
7. Fresh haiku-FA0 yield is only 6/25 (generic "what are common X" cards): source-quality ceiling, as predicted for set A.
Not seen: sentence answers over 8 words (1% of answers have 5+ words), opposite-direction triples, "None of the above", invented medical errors beyond #5, commentary outside JSON.

## 8. Ship decision
Ship rule (fresh GOOD >= 80% AND >= 10 good per 25 overall): fresh 89% and 11.4; old 84% and 11.9; all 87% and 11.7. MET on every cut, with margin on the GOOD side (the lower end of the fresh interval is about 75%, so the GOOD criterion is not guaranteed in a rerun, but good per 25 clears 10 with margin of about 1.4 and is helped by yield).
v3 vs v2: GOOD difference is inside noise, but yield and good per 25 are higher on identical cards (+29% old-only), and runner-fit and BAD rate improved. Therefore ship v3, not v2. If you still prefer the shorter prompt: v2 (about 690 words, currently the repo's pre-v3 text) lacks (a) the cover-the-answer test and the three giveaway types with examples, (b) the same-kind distractor mapping, (c) the "name what is asked" rule for cause/mechanism/threshold, (d) the generous-first skip wording (named examples hyponatremia/M3/hepatotoxicity/tendon rupture/LH surge), (e) the "at most two cards per answer" replacement of the dup rule, (f) the five-point self-check, and (g) new examples not taken from test cards (v3 has 5; v2's examples came from the test cards). v3 is about 960 words (+275 tokens), which is not a problem for a pasted prompt.

## 9. Optional last text edits (small, untested, all additive; fine to ship v3 without them)
1. Add to the clue rules: "A clue must not contain the answer's verb or key word in any form (age 6 months + 'sitting' -> 'sits propped'): for milestone cards use 'Milestone at 6 months' only."
2. Add to the distractor rule: "wrong answers should be the next-most-likely items a student would confuse with the answer (for ages, the neighbouring ages; for side effects, other side effects of the SAME drug; never a side effect of an unrelated drug)."
3. Add to the generous-skip sentence: "A one-line question with a one-term back ('treatment of choice for X', 'nerve supplying Y', 'contrast for Z') is always a card." This is where haiku lost 12 of 20 sampled cards in the fresh B files.
4. Add a cap: "no more than 3 cards that use the same question template."
These add roughly 80 words; the expected effect is a few more cards in B and fewer milestone-type BADs. Given measurement noise (n about 30 per cut) I could not detect a gain of that size, so they are optional.

## 10. Stop iterating?
Yes. The ship rule is met on uncontaminated cards, per-card quality is near the ceiling the sources allow (Set B 94% GOOD; set A limited by weak generic source cards, set A fresh GOOD 83%), and what remains (distractor tempting-ness, wrong skips by the small model) needs either a sharper model or a code-side feature (e.g. let the app offer "regenerate this card" or auto-drop cards where an answer stem matches a clue), not more prompt words. Suggested code-side follow-ups, not done: the answer-in-clue check could use stemming/prefix matching (sits/sitting, rolling) and flag any single key word shared by answer and clue; app copy can tell players that short factoid cards (MedMCQA-style) convert about 1.4x better than paragraph cards (13.9 vs 9.6 good per 25).
