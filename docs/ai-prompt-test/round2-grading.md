# Dx Dash AI-import review, ROUND 2 (new prompt) vs ROUND 1

Reviewer: physician-educator + quiz-game lens. No repo files modified. Inputs: /tmp/realistic2/{prompts,replies,parsed.json} (all 8 replies incl. late haiku-B1), round-1 materials in /tmp/realistic/, round-1 re-parsed with the new parser in /tmp/realistic2/parsed-r1.json. Same rubric as round 1 (F faithful, C correct, R runner-fit, D distractors; GOOD = ship as is, FIXABLE = 1-2 small edits, BAD = unusable/wrong/trivial).

## 0. Headline (blunt)
- New prompt works. GOOD rate in the graded sample 50% -> 79% (n=72 vs n=56, roughly +/-10 points each). BAD 10% -> 5%, FIXABLE 40% -> 16%. Runner-fit Y 56% -> 68% (N 19% -> 7%). Distractors Y 64% -> 66% (flat; see 4). Faithful 99% -> 100%, correct 90% -> 98% (wrong: 3% -> 0%).
- Yield fell: 200 cards pasted -> 94 usable (47%). Round 1 shipped 120 (60%) but the app parser now screens 20 of those, so 100 (50%) is the fair baseline.
- Net, "good cards per 25 pasted": 7.5 (R1 as shipped) / 7.1 (R1 + new parser) -> 9.2 (R2) = +23-30%. The whole gain is set A (3.7 -> 6.6, x1.8); set B is flat (13.8 -> 13.6) because B yield fell as much as quality rose.
- Wrongly skipped: unchanged (39% of sampled AI skips, 27/69, vs 37% in round 1). The prompt did not fix skipping.
- Caveat 1 (contamination): the four bad/good examples in the new prompt came from these same 200 cards. Six of the 56 sampled R2 cards are near-copies of them (coarctation, Pseudomonas "Oxygen requirement" template x3, menorrhagia >80 ml), all GOOD. Excluding them GOOD = 38/50 = 76%. The 6 cards also inflate the batches that contain them. Real players' cards will not contain the example facts, so the true gain is somewhat smaller than measured. Round 3 must use examples that are not in the test cards (v3 does).
- Caveat 2 (parser): the new "answer given away" screen has false positives on numeric / unit answers: haiku-B0 lost "6 days", "100-120 per minute" and "Moderately hard water" (all good cards, 3 of the 4 parser rejections in the whole round; the 4th, "Colipase" with clue "Procolipase", was a correct reject).

## 1. What was produced
- 8 replies x 25 source cards = 200 cards. Usable after AI skipping and the app parser: 94 (haiku A0 9, A1 11, A2 4, A3 9, B0 17, B1 20; sonnet A0 10, B0 14). Every reply was pure JSON. Parser rejections: 4 (all "a clue gave the answer away"). Raw reply card counts: 98.
- Round 1 as shipped: 120 cards. Re-parsed with the new parser: 100 (rejects: 16-20, mostly leaks/sentence answers/dups, i.e. the parser alone removes 9 of the 72 sampled R1 cards, 8 of them FIXABLE/BAD).

## 2. Graded sample, round 2 (56 of 94)
Sampling: Python random.seed(20261012), random.sample per reply file, quotas ~0.6 x file size, every file covered, total 56: haiku-B1 12, haiku-B0 10, sonnet-B0 8, haiku-A1 7, sonnet-A0 6, haiku-A0 5, haiku-A3 5, haiku-A2 3. Indices are 0-based positions in /tmp/realistic2/parsed.json:
[0, 5, 6, 7, 8, 9, 10, 12, 16, 17, 18, 19, 20, 21, 22, 24, 25, 27, 28, 29, 34, 35, 37, 38, 40, 42, 44, 45, 47, 49, 50, 51, 52, 53, 54, 59, 60, 61, 62, 63, 64, 68, 70, 72, 73, 75, 76, 79, 80, 81, 84, 86, 87, 88, 92, 93]

### Per-card table
| idx | file | answer (trunc.) | F | C | R | D | verdict | note |
|---|---|---|---|---|---|---|---|---|
| 0 | haiku-A0 | Uterine smooth muscle | Y | Y | P | P | FIXABLE | trivial: 'oxytocin/childbirth' gives it away; skeletal/cardiac muscle are throwaway distractors |
| 5 | haiku-A0 | Overactive bladder | Y | Y | Y | Y | GOOD | ok |
| 6 | haiku-A0 | Scavenger receptor A | Y | Y | Y | Y | GOOD | ok |
| 7 | haiku-A0 | Coarctation of the aorta | Y | Y | Y | Y | GOOD | ok |
| 8 | haiku-A0 | Prolonged forceful retching | Y | Y | P | N | FIXABLE | question ('what is the CAUSE') never named; distractors are diseases but answer is a cause (use blunt trauma / caustic ingestion) |
| 9 | haiku-A1 | Contact dermatitis | Y | Y | Y | P | GOOD | ok |
| 10 | haiku-A1 | Obligate aerobe | Y | Y | Y | Y | GOOD | ok |
| 12 | haiku-A1 | Obligate aerobe | Y | Y | Y | Y | GOOD | ok |
| 16 | haiku-A1 | Onion-skin appearance | Y | Y | P | P | FIXABLE | 'concentric thickening' is the definition of onion-skin; fibrinoid necrosis is also present in the lesion |
| 17 | haiku-A1 | Primary adrenal insufficiency | Y | Y | Y | P | GOOD | ok |
| 18 | haiku-A1 | Renal failure | Y | Y | N | P | FIXABLE | clue 3 'kidney clearance impaired' gives away renal failure; ask via 'secondary hyperparathyroidism' + 'low calcium' |
| 19 | haiku-A1 | Subperiosteal thinning | Y | Y | P | Y | GOOD | ok |
| 20 | haiku-A2 | Biconvex lenses | Y | Y | Y | Y | GOOD | ok |
| 21 | haiku-A2 | Ion channel myopathies | Y | Y | Y | Y | GOOD | ok |
| 22 | haiku-A2 | Pancreatic adenocarcinoma | Y | Y | Y | Y | GOOD | ok |
| 24 | haiku-A3 | Immature hypothalamic-pituitary-g… | Y | Y | Y | P | GOOD | ok |
| 25 | haiku-A3 | Bordetella pertussis | Y | Y | Y | Y | GOOD | ok |
| 27 | haiku-A3 | Right-to-left shunting | Y | Y | P | N | FIXABLE | distractors are defects (VSD, PDA) but answer is a mechanism; mismatched kind |
| 28 | haiku-A3 | Monoamine oxidase | Y | Y | P | Y | GOOD | ok |
| 29 | haiku-A3 | Neonates | Y | Y | Y | P | GOOD | ok |
| 34 | haiku-B0 | Squamous cell carcinoma | Y | Y | Y | Y | GOOD | ok |
| 35 | haiku-B0 | Riboflavin | Y | Y | Y | P | GOOD | ok |
| 37 | haiku-B0 | Bupivacaine | Y | Y | Y | Y | GOOD | ok |
| 38 | haiku-B0 | Aspirin | Y | Y | P | Y | GOOD | ok |
| 40 | haiku-B0 | Best disease | Y | Y | Y | Y | GOOD | ok |
| 42 | haiku-B0 | Colipase | Y | Y | Y | Y | GOOD | ok |
| 44 | haiku-B0 | Conduct disorder | Y | Y | Y | P | GOOD | ok |
| 45 | haiku-B0 | Multiple myeloma | Y | Y | P | Y | FIXABLE | clue 2 'malignancy of plasma cells' IS myeloma; clue 1 points to osteosarcoma (source's own contradiction) |
| 47 | haiku-B0 | RAS | Y | Y | P | P | FIXABLE | dropped 'most common'; HER2 is also a signal-transduction oncogene |
| 49 | haiku-B0 | Poly A tail | Y | Y | N | Y | BAD | tautology: 'only adenine bases' = poly A |
| 50 | haiku-B1 | Rate of increase in height and we… | Y | Y | P | Y | FIXABLE | 7-word answer; shorten to 'Growth velocity' |
| 51 | haiku-B1 | More than 80 ml | Y | Y | Y | P | GOOD | ok |
| 52 | haiku-B1 | Lean body mass | Y | Y | P | Y | GOOD | ok |
| 53 | haiku-B1 | Hormone receptor-positive metasta… | Y | Y | Y | Y | GOOD | ok |
| 54 | haiku-B1 | Vinblastine | Y | Y | Y | Y | GOOD | ok |
| 59 | haiku-B1 | MRI with gadolinium | Y | P | Y | P | GOOD | source says MRI; CSF cytology is the gold standard, distractors a bit weak |
| 60 | haiku-B1 | cAMP | Y | Y | N | Y | BAD | tautology: adenylate cyclase -> cAMP |
| 61 | haiku-B1 | Apoptosis | Y | Y | Y | Y | GOOD | ok |
| 62 | haiku-B1 | Systemic lupus erythematosus | Y | Y | Y | Y | GOOD | ok |
| 63 | haiku-B1 | CD133 | Y | Y | P | Y | GOOD | ok |
| 64 | haiku-B1 | 3/60 | Y | Y | Y | Y | GOOD | ok |
| 68 | haiku-B1 | Lisfranc amputation | Y | Y | Y | Y | GOOD | ok |
| 70 | sonnet-A0 | Uterine smooth muscle | Y | Y | P | P | FIXABLE | trivial; weak distractors (same as haiku card) |
| 72 | sonnet-A0 | Umbilical vein | Y | Y | Y | Y | GOOD | ok |
| 73 | sonnet-A0 | Pulmonary vein | Y | Y | Y | P | GOOD | ok |
| 75 | sonnet-A0 | Overactive bladder | Y | Y | Y | Y | GOOD | ok |
| 76 | sonnet-A0 | Scavenger receptor-A | Y | Y | Y | Y | GOOD | ok |
| 79 | sonnet-A0 | Forceful retching | Y | Y | Y | P | GOOD | ok |
| 80 | sonnet-B0 | 6 days | Y | Y | Y | Y | GOOD | ok |
| 81 | sonnet-B0 | Gadolinium | Y | Y | Y | Y | GOOD | ok |
| 84 | sonnet-B0 | Relapse prevention | Y | Y | Y | P | GOOD | ok |
| 86 | sonnet-B0 | Bupivacaine | Y | Y | Y | Y | GOOD | ok |
| 87 | sonnet-B0 | Aspirin | Y | Y | P | Y | GOOD | ok |
| 88 | sonnet-B0 | Stratum spinosum | Y | Y | Y | Y | GOOD | ok |
| 92 | sonnet-B0 | RAS | Y | Y | Y | P | GOOD | ok |
| 93 | sonnet-B0 | Poly A | Y | Y | N | Y | BAD | tautology (same as 49) |

## 3. Round 1 vs Round 2, by metric
R1 = as shipped to the player (old parser, 120 cards, graded n=72). R1+NP = same graded cards minus those the new parser would reject (n=63; the fair "prompt-only effect" is R1+NP vs R2). Cells: % of graded cards.

| Slice | version | n | Faithful Y | Correct Y | Runner-fit Y (N) | Distractors Y (N) | GOOD | FIXABLE | BAD |
|---|---|---|---|---|---|---|---|---|---|
| ALL | R1 | 72 | 99 | 90 | 56 (19) | 64 (11) | 50 | 40 | 10 |
| ALL | R1+NP | 63 | 98 | 90 | 60 (14) | 70 (6) | 56 | 38 | 6 |
| ALL | R2 | 56 | 100 | 98 | 68 (7) | 66 (4) | 79 | 16 | 5 |
| Set A | R1 | 37 | 100 | 89 | 27 (35) | 49 (14) | 30 | 57 | 14 |
| Set A | R1+NP | 30 | 100 | 90 | 33 (27) | 57 (7) | 37 | 57 | 7 |
| Set A | R2 | 26 | 100 | 100 | 69 (4) | 54 (8) | 77 | 23 | 0 |
| Set B | R1 | 35 | 97 | 91 | 86 (3) | 80 (9) | 71 | 23 | 6 |
| Set B | R1+NP | 33 | 97 | 91 | 85 (3) | 82 (6) | 73 | 21 | 6 |
| Set B | R2 | 30 | 100 | 97 | 67 (10) | 77 (0) | 80 | 10 | 10 |
| Small (haiku) | R1 | 55 | 100 | 91 | 51 (22) | 60 (11) | 45 | 44 | 11 |
| Small (haiku) | R1+NP | 48 | 100 | 90 | 54 (17) | 65 (8) | 50 | 42 | 8 |
| Small (haiku) | R2 | 42 | 100 | 98 | 64 (7) | 67 (5) | 76 | 19 | 5 |
| Strong (sonnet) | R1 | 17 | 94 | 88 | 71 (12) | 76 (12) | 65 | 29 | 6 |
| Strong (sonnet) | R1+NP | 15 | 93 | 93 | 80 (7) | 87 (0) | 73 | 27 | 0 |
| Strong (sonnet) | R2 | 14 | 100 | 100 | 79 (7) | 64 (0) | 86 | 7 | 7 |
| haiku A | R1 / R1+NP / R2 | 30/25/20 | 100 | 90/88/100 | 23 / 28 / 65 | 50 / 56 / 55 | 27 / 32 / 75 | 60 / 60 / 25 | 13 / 8 / 0 |
| haiku B | R1 / R1+NP / R2 | 25/23/22 | 100 | 92/91/95 | 84 / 83 / 64 | 72 / 74 / 77 | 68 / 70 / 77 | 24 / 22 / 14 | 8 / 9 / 9 |
| sonnet A | R1 / R1+NP / R2 | 7/5/6 | 100 | 86/100/100 | 43 / 60 / 83 | 43 / 60 / 50 | 43 / 60 / 83 | 43 / 40 / 17 | 14 / 0 / 0 |
| sonnet B | R1 / R1+NP / R2 | 10/10/8 | 90/90/100 | 90/90/100 | 90 / 90 / 75 | 100 / 100 / 75 | 80 / 80 / 88 | 20 / 20 / 0 | 0 / 0 / 12 |

Per-file GOOD (graded): R1 haiku-A0 25%, A1 12%, A2 0%, A3 71%, B0 82%, B1 57%, sonnet-A0 43%, sonnet-B0 80%. R2: haiku-A0 60% (3/5), A1 71% (5/7), A2 100% (3/3), A3 80% (4/5), B0 70% (7/10), B1 83% (10/12), sonnet-A0 83% (5/6), sonnet-B0 88% (7/8). Cells of 3-8 cards: direction only.

Readings
- Set A is fixed in kind: leak/sentence answers vanished. Answers of 5+ words (all cards): 29% -> 3% (R1+NP 24%); set A 48% -> 0%. Cards with at least half the answer's key words in the clues: 18% -> 2%. Parser-visible failures are essentially gone.
- Set B got no better and runner-fit dipped (86 -> 67, one-clue or two-clue cards that restate the answer: Poly A x2, cAMP, myeloma, macrolides-with-members). B cards in R1 were already mostly fine; the new prompt's stricter wording made the model write clues more indirectly ("Normal finding that usually rules it out"), a few of which are vague. Sonnet-B and haiku-B GOOD rates within noise of R1 (80 -> 88, 68 -> 77).
- Small model closed most of the gap: haiku GOOD 76% vs sonnet 86% (R1: 45% vs 65%). Strong model still better on runner-fit, worse on distractors in this small sample (n=14).
- Distractors did NOT improve overall (64% -> 66%). Set A 49 -> 54, set B 80 -> 77. The "same kind" rule fixed the absurd ones (N 11% -> 4%) but the model now plays safe with sibling terms that the clues already exclude, so they are not tempting (D=P).

### Whole-set statistics (all cards, not only sample)
| Metric | R1 shipped (120) | R1 + new parser (100) | R2 (94) |
|---|---|---|---|
| Yield from 200 pasted | 60% | 50% | 47% |
| Answer 5+ words | 29% | 24% | 3% |
| Answer > 8 words | 3 | 0 | 0 |
| Half+ of answer key words in clues | 18% | 7% | 2% |
| Cards with only 1-2 clues | 34% | 37% | 44% |
| Mean clues per card | 2.8 | 2.7 | 2.6 |
| Most repeated answer | Obligate aerobe x4 | same | Obligate aerobe x6 |

### Good cards per 25 pasted (cards kept x GOOD rate; per-batch averages)
| Slice | R1 shipped | R1 + new parser | R2 | R2 vs R1 shipped |
|---|---|---|---|---|
| ALL | 7.5 | 7.1 | 9.2 | +23% |
| Set A | 3.7 | 3.6 | 6.6 | x1.8 |
| Set B | 13.8 | 12.9 | 13.6 | -1% |
| Small (haiku) | 7.0 | 6.3 | 8.9 | +27% |
| Strong (sonnet) | 9.0 | 9.4 | 10.3 | +14% |
| haiku A | 3.4 | 3.0 | 6.2 | x1.8 |
| haiku B | 14.3 | 12.9 | 14.2 | flat |
| sonnet A | 5.2 | 6.0 | 8.3 | x1.6 |
| sonnet B | 12.8 | 12.8 | 12.3 | -4% |
(Cards kept: haiku A 50/37/33, haiku B 42/37/37, sonnet A 12/10/10, sonnet B 16/16/14 for R1/R1+NP/R2.) The stricter prompt is a clear net win on set A and neutral on set B; the lost cards in B are partly parser false positives (3 good cards) and partly the extra skips. Remove the contaminated example cards (6 in the sample, about 8 of 94 overall) and the R2 figure for set A falls to roughly 5.5.

## 4. Skipped source cards (sample 10 per reply, seed 7; all when fewer)
Skip = source card with no matching output card (token-overlap matching, greedy one-to-one; source cards re-assembled from multi-line Anki rows). AI skips: haiku A0 16, A1 14, A2 21, A3 16, B0 5, B1 5; sonnet A0 15, B0 10. Parser rejections are listed separately (haiku-B0 3, sonnet-B0 1).

| Reply | AI skips | sampled | skip RIGHT | MISSED | missed (source question -> card that should exist) |
|---|---|---|---|---|---|
| haiku-A0 | 16 | 10 | 5 | 5 | oxytocin toxicity -> hyponatremia; triggers of oxytocin -> cervical dilation; oxybutynin/tolterodine -> M3; ovulation process -> LH surge; acetaminophen delayed effect -> hepatotoxicity |
| haiku-A1 | 14 | 10 | 6 | 4 | Pseudomonas -> oxidase positive; hyperplastic polyp size/location (flip -> name the polyp); most common polyp -> hyperplastic; sinus histiocytosis -> node draining cancer |
| haiku-A2 | 21 | 10 | 7 | 3 | malignant gastric ulcer description (large, irregular, heaped margins) -> flip to name; Malassezia melanocyte-damaging acids; "what is malaria and what causes it" |
| haiku-A3 | 16 | 10 | 6 | 4 | macrolide + theophylline/warfarin; macrolide for AOM with immediate penicillin allergy; hormonal contraception avoided in breast cancer; pertussis PEP -> household contacts |
| haiku-B0 | 5 | 5 | 4 | 1 | naltrexone -> relapse prevention |
| haiku-B1 | 5 | 5 | 2 | 3 | "row of tombstones" -> pemphigus; antihypertensive to continue in pregnancy -> nifedipine; pavor nocturnus -> sleep terror |
| sonnet-A0 | 15 | 10 | 5 | 5 | hyponatremia; triggers of oxytocin; M3; LH surge; ovotesticular DSD -> true hermaphroditism |
| sonnet-B0 | 10 | 9 | 7 | 2 | Best disease (AD eye condition; haiku made it fine); film-holding age 3 years |
| TOTAL haiku | 77 | 50 | 30 | 20 (40%) | |
| TOTAL sonnet | 25 | 19 | 12 | 7 (37%) | |
| ALL | 102 | 69 | 42 | 27 (39%) | |
Round 1: 37% (25/67; haiku 42%, sonnet 26%). Set A 21/50 = 42% (R1 46%); set B 6/19 = 32% (R1 12%). Unchanged to slightly worse. The missed cards are the same ones as in round 1 (oxytocin toxicity, triggers, M3, LH surge, macrolide interactions, pertussis PEP): questions phrased "what are the consequences/triggers/effects", which the new SKIP wording ("a definition or 'explain / what are the consequences / how does it differ' question") literally tells the model to skip. The same prompt also says "flip 'what is X?'" and "skip definitions", which collide ("what is malaria" skipped).
Parser rejects: haiku-B0 "6 days" (clue "Days after leaving..."), "100-120 per minute" (clue "...per minute"), "Moderately hard water" (clue "Water hardness"): false positives on generic unit words, 3 cards lost (2 clean GOOD, 1 from a garbled source). sonnet-B0 "Colipase" with clue "Procolipase": correct reject.
Correct skips seen: ordered lists/sequences, definitions with no name, odd-one-out with options missing, garbled sources (rabies "viral culture", Tdap 19-65, leiomyoma blood flow, thalassemia blood volume, oral pills with empty back), and Moraxella (the wrong source "facultative anaerobe" that haiku turned into a wrong card in round 1 was skipped this time: wrong-source propagation 0 in the R2 sample).

## 5. Remaining failure patterns (R2 sample, n=56; a card can have several)
1. Trivial / tautological cards (7 of 56 = 12.5%; all 3 BAD cards and 4 of the 9 FIXABLE): Poly A x2 ("only adenine bases"), cAMP ("adenylate cyclase"), uterine smooth muscle x2 ("oxytocin / contraction"), myeloma ("malignancy of plasma cells"), onion-skin ("concentric thickening"), and, outside the sample but in the set, macrolides ("erythromycin, azithromycin" in the clue) and biopsy ("histologic review of tissue"). The parser cannot see these; the prompt only forbids "the answer or its key words" in clues, not definitions, synonyms or members. This is the new #1 problem.
2. Distractors of the wrong kind or already excluded by the clues (D not Y: 34%): Boerhaave (diseases offered for a cause question), right-to-left shunting (VSD/PDA offered for a mechanism), onion-skin, myoepithelial/alveolar, nystatin (arguably also right), healthy young adults, IVC, "Elevated cortisol". Stays at 64-66%.
3. Question not named in the clues when the card asks a cause/mechanism/threshold ("Boerhaave syndrome / esophageal tear / chest pain" -> answer "prolonged forceful retching"): 3 of 56.
4. Wrongly skipped crisp-term cards (39%): see section 4. Makes yield fall for no quality reason; the recovered cards in A would add about 2-3 good cards per 25.
5. Template over-use copied from the examples: "Obligate aerobe" 6 times (5 in the A0/A1 haiku pair, 1 sonnet), all with distractor pairs rotated to defeat the "same answer + same distractors" duplicate rule. A player will learn the answer from the pattern. Cards are individually fine.
6. Source error propagation: none seen in the sample (haiku skipped Moraxella). One reinterpretation of a garbled source (thalassemia "blood volume reduced" -> "reduced amount of hemoglobin", faithful=P, not in final sample) and one guideline-dependent number (2500 kcal, 18-79 y HCV).
7. One-to-two-clue cards: 44% of all R2 cards (R1 34%). Fine for B recall facts, but the cause of 4 of the trivial cards: with only two clues the model puts the definition in one of them.
8. Parser false positives on numbers/units (3 good cards lost) and false negatives on semantic leaks (none of the above 7 trivial cards were screened).
Not seen: sentence answers > 8 words, opposite-direction triples, "None of the above", invalid subjects, medical errors in clues (0 in sample; R1 had 2 of 72), hallucinated facts beyond mild extras.

## 6. Proposed further prompt edits (v3, text only; full text in /tmp/realistic2/proposed-prompt-v3.txt, 963 words vs 687 now)
1. Give the cover-the-answer test and name the three giveaway types (synonym, definition, class members) with the three observed examples. Targets pattern 1.
2. Distractors: "same KIND as the answer" with explicit mapping (mechanism -> mechanisms, cause -> causes, number -> nearby numbers), "never a disease when the answer is a mechanism", and "never something the clues already rule out". Targets 2.
3. Clues: if the card asks a cause/mechanism/threshold/next step, one clue must say so. Targets 3.
4. Skip rules rewritten generous-first: explicit sentence that long or two-part questions and "effects/consequences/triggers/reasons" cards whose back has a crisp term are NOT to be skipped (named: hyponatremia, M3, hepatotoxicity, tendon rupture, LH surge); the SKIP list now only has lists with no key item, pure definitions with no name, yes/no, options-missing odd-one-out, images, vague/contradictory/doubtful. This removes the collision between "skip definitions" and "flip what-is-X". Targets 4.
5. "At most two cards with the same answer, and vary the wording" instead of "no same answer + distractors". Targets 5.
6. A five-point self-check list right before the examples (answer not in clues / question named / short term / same-kind distractors / one correct option). Small models follow checklists.
7. Replace the four bad/good examples with five new ones that are NOT in the test cards (pulmonic stenosis, glucose threshold, metformin mechanism with wrong-kind distractors, beta-lactam member list, pneumococcal capsule). Same object example line as the current prompt. This fixes the contamination in measurement and adds a wrong-kind-distractor and a member-leak example.
8. Medical-correctness line: "check against what you know, not just my card" (the existing "unsure -> skip" worked this round, so only a nudge).
Code-side (suggestions, not done): in answerInClues ignore generic/unit words (days, minute, per, water, hard) and skip the rule when the answer starts with a digit (would have saved 3 good cards); add a cheap "member of class" check is not feasible, so rely on the prompt.
Expected effect (estimate): trivial cards 12% -> ~5%, wrongly skipped 39% -> ~20% (yield up ~6-8 cards per 100 pasted), GOOD 79% -> ~83-85%, good-per-25 9.2 -> ~10.5-11. Risk: longer prompt (about 960 words, +275 tokens); the small model may start writing distractors that are too close; skip loosening can let mediocre cards through (watch FIXABLE).

## 7. Is another round worth it?
Yes, one more, then stop. Reasons: the round-2 gain is real but partly measured on cards that the prompt examples were taken from, so the true number is unknown within about 5 points; the main remaining losses (skips 39%, trivial 12%, weak distractors 34%) each have a concrete fix that is cheap to test; and the examples must be swapped to keep the test honest. Design: same 8 batches plus 2-4 fresh batches (new Anki/MedMCQA cards) so we can separate "fixed these cards" from "fixed the prompt", and run haiku and sonnet on all of them (round 2 had only 3 sonnet files). If GOOD is at least 80% on uncontaminated cards and good-per-25 reaches 10+, ship v3 and stop; if v3 is within noise of v2, ship v2 (shorter). Ceiling: set A sources are generic AI-written paragraphs; even ideal conversion yields about 7 good cards per 25 from them versus 13-14 from MedMCQA-style cards, so the app should tell players that short factoid cards convert about twice as well.
