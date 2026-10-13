# Dx Dash AI-import review (independent grading)

Reviewer: physician-educator + quiz-game lens. No repo files modified. Inputs: /tmp/realistic/{prompts,replies,parsed.json}, buildAiPrompt() and parseAiReply() in js/importguide.js.

## 0. What was produced
- 8 replies, 200 source cards sent (25 per batch x 8 runs). Raw reply item counts equal parsed counts (120 accepted), so the parser rejected nothing; 80 source cards (40%) were skipped by the AI itself. Haiku kept 92/150 (61%), Sonnet 28/50 (56%).
- Note the parser only checks bw/ans/2 distractors; it does not check ww keys, clue/answer overlap, answer length, or tp length, so every problem below passes the parser.
- Source sets: A = medalpaca-style Anki cards (question, then a long, chatty, often generic AI-written paragraph, with HTML and fake AnKing tags that do not match the content). B = MedMCQA "question TAB answer. explanation".

## 1. Graded sample (72 of 120 parsed cards)
Sampling: Python random.seed(20261012), `random.sample` per reply file, quotas proportional (0.6 x file size, every file covered): haiku-B1 14, haiku-B0 11, sonnet-B0 10, haiku-A1 8, haiku-A0 8, haiku-A2 7, sonnet-A0 7, haiku-A3 7. Indices are 0-based positions in parsed.json:
[0, 1, 3, 6, 7, 9, 10, 11, 13, 14, 15, 16, 17, 21, 23, 24, 28, 31, 32, 33, 35, 36, 37, 40, 41, 42, 43, 44, 45, 46, 51, 52, 53, 54, 55, 56, 57, 58, 59, 63, 68, 69, 70, 73, 75, 76, 77, 78, 79, 80, 81, 84, 87, 88, 90, 92, 93, 94, 96, 98, 99, 100, 104, 105, 109, 110, 112, 114, 116, 117, 118, 119]
(Source card located by keyword overlap between the card and the batch's source cards; all 72 matched unambiguously on inspection.)

Axis keys: F = faithful (Y/P/N), C = correct (Y/P/N/U=unsure), R = runner-fit (single defensible gate, clues sufficient in ~3 s, no leak, answer a term), D = distractors (same kind, plausible). Verdict: GOOD = ship as is; FIXABLE = one or two small edits; BAD = unusable without rewrite, or the fact is wrong, or trivial/tautological.

### Headline rates (n=72)
| Slice | n | Faithful Y | Correct Y (wrong) | Runner-fit Y (N) | Distractors Y (N) | GOOD | FIXABLE | BAD |
|---|---|---|---|---|---|---|---|---|
| ALL | 72 | 99% | 90% (3%) | 56% (19%) | 64% (11%) | 50% | 40% | 10% |
| Set A (medalpaca) | 37 | 100% | 89% (3%) | 27% (35%) | 49% (14%) | 30% | 57% | 14% |
| Set B (MedMCQA) | 35 | 97% | 91% (3%) | 86% (3%) | 80% (9%) | 71% | 23% | 6% |
| Small model (haiku) | 55 | 100% | 91% (2%) | 51% (22%) | 60% (11%) | 45% | 44% | 11% |
| Stronger model (sonnet) | 17 | 94% | 88% (6%) | 71% (12%) | 76% (12%) | 65% | 29% | 6% |
| haiku, A | 30 | 100% | 90% | 23% (37%) | 50% (10%) | 27% | 60% | 13% |
| haiku, B | 25 | 100% | 92% | 84% (4%) | 72% (12%) | 68% | 24% | 8% |
| sonnet, A | 7 | 100% | 86% | 43% (29%) | 43% (29%) | 43% | 43% | 14% |
| sonnet, B | 10 | 90% | 90% | 90% (0%) | 100% | 80% | 20% | 0% |

Small-n caution: sonnet cells are 7 and 10 cards. Direction is clear, exact numbers are not.
Per file GOOD rate: haiku-A0 25%, A1 12%, A2 0%, A3 71%, B0 82%, B1 57%, sonnet-A0 43%, sonnet-B0 80%.

Take-aways
- Fidelity and medical correctness are NOT the problem (99% faithful; only 2 of 72 contain a medical error: idx 17 Moraxella, idx 112 spongiosis clue; both come from or are made worse by the source/mix-up). Hallucinated extra facts are rare and mild.
- Playability IS the problem: only half the cards are ship-ready, and the failure is concentrated in set A (30% GOOD) where the source is a paragraph answer to a "what is the relationship / reason / effect" question. Set B (short factoid + one-word answer) converts well (71%, 80% with the stronger model).
- The stronger model helps mostly on set B and on the distractors; on set A it is only modestly better (43% vs 27% GOOD) because it still faithfully turns a descriptive answer into a sentence answer. Sonnet also skipped a bit more selectively (kept 56% vs 61%).
- Whole-set statistics on all 120 parsed cards: answers of 5+ words 35/120 (29%; haiku-A 52%, haiku-B 12%, sonnet-B 0%); 5 answers of 8+ words; 19/120 (16%) have at least half of the answer's key words already inside the clues; 41/120 have only 1-2 clues (34%; 36 of those in set B, where it is mostly fine because one strong buzzword suffices).

### Per-card table
| idx | file | answer (trunc.) | F | C | R | D | verdict | note / fix |
|---|---|---|---|---|---|---|---|---|
| 0 | haiku-A0 | Uterine smooth muscle | Y | Y | P | P | FIXABLE | FIX: trivial, "labor" gives it away; name oxytocin, use other smooth-muscle/other-tissue distractors |
| 1 | haiku-A0 | Contraction of myoepithelial cells around alv | Y | Y | P | Y | FIXABLE | FIX: answer is a long phrase; shorten to "Myoepithelial cell contraction" |
| 3 | haiku-A0 | Pulmonary veins | Y | Y | P | P | FIXABLE | FIX: restated question; SVC is a silly distractor (use pulmonary capillaries / aorta) |
| 6 | haiku-A0 | Urgency urinary incontinence | Y | Y | Y | Y | GOOD | ok |
| 7 | haiku-A0 | LH surge, triggered by estradiol positive fee | Y | Y | N | P | FIXABLE | FIX: clue "Estradiol positive feedback" is in the answer; answer is a clause; use "LH surge" with midcycle clues |
| 9 | haiku-A0 | Abrupt postpartum drop in estrogen levels | Y | Y | Y | P | GOOD | ok (distractors are false-premise "rises") |
| 10 | haiku-A0 | Higher hCG levels from the placenta | Y | Y | P | P | FIXABLE | FIX: source also names progesterone; "elevated estrogen" is arguably also a driver; prolactin silly |
| 11 | haiku-A0 | Narrowing of the descending aorta beyond the  | Y | Y | N | P | FIXABLE | FIX: clue "Narrowed descending aorta" = answer, answer is description; ans should be "Coarctation of the aorta" |
| 13 | haiku-A1 | Identify the allergen causing contact dermati | Y | Y | N | N | BAD | BAD: answer is a sentence restating the clue "contact dermatitis"; distractors absurd; needs full rewrite (ans "Patch test", new d) |
| 14 | haiku-A1 | Obligate aerobe | Y | Y | P | Y | FIXABLE | FIX: the question (oxygen requirement) is never named in clues; 3 near-identical cards (idx 14-16) share ans+distractors |
| 15 | haiku-A1 | Obligate aerobe | Y | Y | P | Y | FIXABLE | FIX: same: add "Oxygen requirement" clue |
| 16 | haiku-A1 | Obligate aerobe | Y | Y | P | Y | FIXABLE | FIX: same: add "Oxygen requirement" clue |
| 17 | haiku-A1 | Facultative anaerobe | Y | N | N | Y | BAD | BAD: source card wrong (Moraxella catarrhalis is a strict aerobe); the "Obligate aerobe" distractor is actually correct; clues fit many bugs |
| 21 | haiku-A1 | Small and located in the rectosigmoid colon | Y | Y | P | P | FIXABLE | FIX: clues never name hyperplastic polyp; sentence answer; description-style distractors |
| 23 | haiku-A1 | Primary adrenal insufficiency (Addison diseas | Y | Y | Y | Y | GOOD | ok |
| 24 | haiku-A1 | Renal failure (secondary hyperparathyroidism) | Y | Y | N | Y | FIXABLE | FIX: clue "kidneys cannot remove phosphate" gives answer away |
| 28 | haiku-A2 | Glucose above 600 mg/dL with serum osmolarity | Y | Y | N | N | BAD | BAD: answer is the clues restated (glucose >600, osm >320); diagnosis (HHS) never offered |
| 31 | haiku-A2 | Ion channel myopathies (channelopathies) | Y | Y | N | Y | FIXABLE | FIX: clue "ion channel dysfunction" = answer; name periodic paralysis |
| 32 | haiku-A2 | Drug-induced reduced aldosterone effect (RAAS | Y | Y | P | N | FIXABLE | FIX: trivial; distractors (hypokalemia/hypercalcemia) cannot fit the hyperkalemia clue; mechanism-sentence answer |
| 33 | haiku-A2 | Rapid, uncontrolled growth | Y | Y | N | P | BAD | BAD: trivial definition, "rapid/uncontrolled growth" appears in clues and answer |
| 35 | haiku-A2 | Hypermetabolic muscle crisis triggered by vol | Y | Y | N | P | FIXABLE | FIX: ans should be "Malignant hyperthermia" (distractors already fine); current answer repeats clue |
| 36 | haiku-A2 | Skin yeast causing fungemia in neonates on TP | Y | Y | N | P | FIXABLE | FIX: ans should be "Malassezia furfur"; sentence repeats clues |
| 37 | haiku-A2 | Mosquito-borne disease caused by Plasmodium s | Y | Y | N | Y | FIXABLE | FIX: ans "Malaria"; "Plasmodium" clue is the answer |
| 40 | haiku-A3 | Immature hypothalamic-pituitary-gonadal (HPG) | Y | Y | Y | Y | GOOD | ok |
| 41 | haiku-A3 | Decreased renal perfusion | Y | Y | P | Y | GOOD | ok (only 2 clues; true reason is Na/water retention too, but ok) |
| 42 | haiku-A3 | Pulmonary monoamine oxidase (MAO) inactivates | Y | Y | P | Y | FIXABLE | FIX: 3 long sentence options, cannot read in 3 s; shorten ("Lung MAO inactivates serotonin") |
| 43 | haiku-A3 | Right-to-left shunting lets bacteria bypass p | Y | Y | P | P | FIXABLE | FIX: sentence options; shorten ("Right-to-left shunt") |
| 44 | haiku-A3 | Bordetella pertussis | Y | Y | Y | Y | GOOD | ok (very easy) |
| 45 | haiku-A3 | Adults aged 18 to 79 years | Y | U | Y | Y | GOOD | ok (guideline-dependent: USPSTF 18-79) |
| 46 | haiku-A3 | Neonates | Y | P | Y | P | GOOD | ok (distractors "healthy" are giveaways) |
| 51 | haiku-B0 | Gadolinium | Y | Y | Y | Y | GOOD | ok |
| 52 | haiku-B0 | Squamous cell carcinoma | Y | Y | Y | Y | GOOD | ok (ww for BCC is circular) |
| 53 | haiku-B0 | Moderately hard water | Y | Y | Y | Y | GOOD | ok |
| 54 | haiku-B0 | Riboflavin | Y | Y | Y | Y | GOOD | ok |
| 55 | haiku-B0 | Prevent relapse | Y | Y | Y | P | GOOD | ok |
| 56 | haiku-B0 | Bacillus cereus | Y | Y | Y | Y | GOOD | ok |
| 57 | haiku-B0 | Bupivacaine | Y | Y | Y | Y | GOOD | ok |
| 58 | haiku-B0 | Best disease | Y | Y | P | Y | FIXABLE | FIX: "AD ocular condition" fits many diseases; odd-one-out question lost its options |
| 59 | haiku-B0 | Colipase | Y | Y | Y | Y | GOOD | ok |
| 63 | haiku-B0 | 2500 kcal per day | Y | U | P | Y | FIXABLE | FIX: clue "extra 300 kcal" leaks derivation; guideline-specific (Park); ask "total daily kcal in pregnancy" |
| 68 | haiku-B0 | Alcuronium | Y | Y | Y | Y | GOOD | ok |
| 69 | haiku-B1 | Rate of increase in height and weight | Y | Y | Y | P | FIXABLE | FIX: distractor "Body weight" is inside the answer "height and weight"; use chest circumference |
| 70 | haiku-B1 | More than 80 ml of blood loss | Y | Y | Y | N | FIXABLE | FIX: both distractors "less than" are absurd for heavy bleeding; use 60 ml / 120 ml |
| 73 | haiku-B1 | Vinblastine | Y | Y | Y | Y | GOOD | ok |
| 75 | haiku-B1 | Nicorandil | Y | Y | Y | Y | GOOD | ok |
| 76 | haiku-B1 | Rods and cones | Y | Y | Y | P | BAD | BAD: trivial (rods and cones vs touch corpuscles) |
| 77 | haiku-B1 | tRNA | Y | Y | Y | Y | GOOD | ok |
| 78 | haiku-B1 | MRI with gadolinium | Y | P | Y | N | FIXABLE | FIX: skull X-ray / non-contrast CT are silly; CSF cytology issue (gold standard) not addressed |
| 79 | haiku-B1 | cAMP | Y | Y | N | Y | BAD | BAD: tautology (adenylate cyclase -> cAMP) |
| 80 | haiku-B1 | Apoptosis | Y | Y | Y | Y | GOOD | ok |
| 81 | haiku-B1 | Systemic lupus erythematosus | Y | Y | Y | Y | GOOD | ok (drug name never stated, two-step) |
| 84 | haiku-B1 | Nifedipine | Y | Y | Y | Y | GOOD | ok |
| 87 | haiku-B1 | Pseudomonas aeruginosa | Y | Y | P | N | FIXABLE | FIX: "gram-negative bacilli" clue eliminates both distractors (gram-pos cocci / diplococcus); use Haemophilus/Bordetella |
| 88 | haiku-B1 | Air embolism | Y | Y | Y | P | GOOD | ok (thyroid storm is a weak distractor) |
| 90 | haiku-B1 | Sleep terror | Y | Y | Y | Y | GOOD | ok |
| 92 | sonnet-A0 | Uterine smooth muscle | Y | Y | P | P | FIXABLE | FIX: same as idx 0: "childbirth" gives it away; weak distractors |
| 93 | sonnet-A0 | Myoepithelial cell contraction (milk ejection | Y | Y | N | Y | FIXABLE | FIX: clue "Myoepithelial cells" = answer |
| 94 | sonnet-A0 | Decreased uteroplacental blood flow | Y | P | P | N | FIXABLE | FIX: increased / decreased / no change triple; "fetal distress" leaks; mechanism dubious (tachysystole, not vasoconstriction) |
| 96 | sonnet-A0 | Pulmonary veins | Y | Y | Y | P | GOOD | ok (easy) |
| 98 | sonnet-A0 | Scavenger receptor A | Y | Y | Y | Y | GOOD | ok |
| 99 | sonnet-A0 | Estradiol surge causing an LH surge | Y | Y | N | N | BAD | BAD: both clues are the answer ("estradiol burst" / "LH surge"), sentence options, silly "inhibin B -> GnRH surge" |
| 100 | sonnet-A0 | True hermaphroditism | Y | Y | Y | Y | GOOD | ok (dated term "hermaphroditism") |
| 104 | sonnet-B0 | 6 days | Y | Y | Y | Y | GOOD | ok |
| 105 | sonnet-B0 | Gadolinium | Y | Y | Y | Y | GOOD | ok |
| 109 | sonnet-B0 | Bacillus cereus | Y | Y | Y | Y | GOOD | ok |
| 110 | sonnet-B0 | Bupivacaine | Y | Y | Y | Y | GOOD | ok |
| 112 | sonnet-B0 | Stratum spinosum | P | N | Y | Y | FIXABLE | FIX: clue "Intracellular edema" is wrong for spongiosis (intercellular); copied from neighbouring line of source (ballooning) |
| 114 | sonnet-B0 | Best disease | Y | Y | P | Y | FIXABLE | FIX: same vague clue as 58 (distractors better) |
| 116 | sonnet-B0 | Macrolides | Y | Y | Y | Y | GOOD | ok (tetracyclines also anti-inflammatory, not offered) |
| 117 | sonnet-B0 | Conduct disorder | Y | Y | Y | Y | GOOD | ok |
| 118 | sonnet-B0 | 100-120 compressions per minute | Y | Y | Y | Y | GOOD | ok |
| 119 | sonnet-B0 | RAS | Y | Y | Y | Y | GOOD | ok |

## 2. Skipped source cards
Skipped = source card with no matching output card (matched by overlap, then greedy one-to-one; the parser rejected no cards, so all are AI skips). Haiku skipped: A0 12, A1 11, A2 13, A3 14, B0 6, B1 2. Sonnet skipped: A0 13, B0 9. 10 skipped cards sampled per batch (all of them when fewer than 10 existed; seed 7).

| Batch/reply | skipped | sampled | skip was RIGHT | MISSED opportunity | missed ones (source question -> what the card should be) |
|---|---|---|---|---|---|
| haiku-A0 | 12 | 10 | 5 | 5 | oxytocin toxicity -> hyponatremia; triggers of oxytocin release (cervical stretch / nipple); oxybutynin -> M3 receptor; oxidized LDL -> scavenger receptor A; acetaminophen delayed effect -> hepatotoxicity |
| haiku-A1 | 11 | 10 | 5 | 5 | B. anthracis -> obligate aerobe (it made the same card for 3 other bugs); Pseudomonas -> oxidase positive; most common colon polyp -> hyperplastic; hyperplastic arteriolosclerosis -> fibrinoid necrosis (malignant HTN); sinus histiocytosis -> node draining cancer |
| haiku-A2 | 13 | 10 | 7 | 3 | type 4 RTA urine pH <5.5; elderly + new hyperglycemia + temporal wasting -> pancreatic adenocarcinoma (best vignette in the batch, skipped); most common metastasis to gallbladder -> melanoma |
| haiku-A3 | 14 | 10 | 4 | 6 | macrolides raise theophylline/warfarin; macrolide for AOM with immediate penicillin allergy; hormonal contraception avoided in breast cancer; steroid injection in insertional tendinopathy -> tendon rupture; pertussis PEP -> household contacts; Whipple steatorrhea -> lacteal compression |
| haiku-B0 | 6 | 6 | 5 | 1 | alkalinization of urine -> aspirin (needs care: barbiturates also valid; choose acid-excreted drugs as distractors) |
| haiku-B1 | 2 | 2 | 2 | 0 | both odd-one-out ("wrong pair", "not indicated") with options missing |
| sonnet-A0 | 13 | 10 | 6 | 4 | oxytocin toxicity -> hyponatremia; triggers of oxytocin; oxybutynin M3; coarctation (card could have been made well) |
| sonnet-B0 | 9 | 9 | 8 | 1 | water hardness 1 meq/L (garbled source table, but the fact is standard; haiku made it) |
| TOTAL haiku | 58 | 48 | 28 | 20 (42%) | |
| TOTAL sonnet | 22 | 19 | 14 | 5 (26%) | |
| ALL | 80 | 67 | 42 | 25 (37%) | |

Wrongly skipped rate: 37% of sampled skips overall (25/67); haiku 42% (20/48), sonnet 26% (5/19). Set A: 23/50 sampled skips missed (46%; haiku-A 19/40 = 48%); set B: 2/17 (12%). Extrapolation: haiku skipped 50 of the 100 set-A cards, so roughly 20-24 good cards (about 1 in 5 source cards) were left on the table; in set B almost none.

Typical reasons for RIGHT skips (agree with the AI): ordered lists / sequences (myelination order, surrogate order, orientation loss order), definitions ("what is N:C ratio / mitotic activity / poorly circumscribed / fixed tumour"), two-part questions, odd-one-out MCQs with the options stripped out (B1 x2), garbled or self-contradicting source (rabies "viral culture", thalassemia "normal Hb structure", oral pills with no content, Tdap "19-65 every 10 y", leiomyoma "blood flow shifts to fetus"), and multi-correct answers (PEM complications).
Typical reasons for WRONG skips: (1) the question is phrased as "what are the consequences/effects/triggers/reason for...", but the back contains one crisp term (hyponatremia, M3, tendon rupture, melanoma, hepatotoxicity) that could simply be extracted; the AI treats "not a short-answer question" as "skip" even though the prompt's own rule says "clear question with one short answer"; (2) inconsistency: the AI made the card for 3 organisms' oxygen requirement but skipped the 4th identical card; (3) the question is two-part ("X and what else?"), where either half alone would be a fine card. Haiku also skipped the single best vignette of the A batches (pancreatic cancer).

## 3. Failure patterns (ranked by frequency in the 72-card sample; a card can have several)
1. Answer leaks into the clues / answer = clues restated (12 of 72 cards = 17%, 11 of them set A): idx 7 ("Estradiol positive feedback" -> "LH surge, triggered by estradiol positive feedback"), 11 ("Narrowed descending aorta" -> "Narrowing of the descending aorta..."), 28 (HHS: clues "Glucose above 600", "osm above 320"; answer "Glucose above 600 with osm above 320"), 31, 33, 35, 36, 37, 93, 99, 24, 13. This is the signature of "question restated as the answer": the source question "What is the underlying pathology of coarctation?" has a descriptive paragraph for an answer, so the AI makes the description the answer and the disease name never appears.
2. Sentence-length / clause answers (about 25% of the sample, 29% of all 120; 52% of haiku set-A answers have 5+ words): "Skin yeast causing fungemia in neonates on TPN", "Hypermetabolic muscle crisis triggered by volatile anesthetics", "Right-to-left shunting lets bacteria bypass pulmonary circulation", "Pulmonary MAO inactivates serotonin before left heart". Three such options cannot be read in 3 seconds, and distractors become sentences too.
3. Question stem lost, so clues do not single out the question (about 8%): "Pseudomonas / CF / resistance" -> "Obligate aerobe" never says "oxygen requirement"; Nocardia and M. tb cards identical; Moraxella clues fit dozens of bugs; hyperplastic polyp clues never name the polyp; Best disease "autosomal dominant ocular condition" fits many. The player sees a bug-description and gates that are an oxygen category, with no way to know which attribute is asked. Near-duplicate cards (same answer, same two distractors) appear 3-4 times in haiku-A1.
4. Weak distractors (11% clearly bad, another 25% partial): opposite-direction triples (increased / decreased / no change, idx 94), "less than 20 ml / less than 40 ml" for menorrhagia (70), Meissner/Pacinian for vision (76), skull X-ray (78), thyroid storm for air embolism (88), gram-positive coccus and diplococcus against a "gram-negative bacilli" clue (87), SVC for a pulmonary-vein card (3), "healthy school-age children" (46), skeletal/cardiac muscle for a uterine card (0, 92). Overlap: "Body weight" vs answer "height and weight" (69). Distractor that is arguably also right: estrogen for hyperemesis (10), "Obligate aerobe" as distractor for the wrong Moraxella card (17).
5. Trivial / definitional / tautological cards (about 10%): "adenylate cyclase -> cAMP" (79), rods and cones for vision (76), "malignant tumor -> rapid uncontrolled growth" (33), pulmonary veins for "lungs to left atrium" (3, 96), oxytocin -> uterine smooth muscle (0, 92). These pass the parser and give no learning but clutter the deck. Note some B cards (MRI -> gadolinium, whooping cough -> pertussis) are easy but fine as warm-up.
6. Source errors faithfully propagated: Moraxella catarrhalis labelled facultative anaerobe (it is a strict aerobe), so the card is wrong and the "wrong" gate is correct (17); the oxytocin "constricts uterine vessels" claim (94) is dubious (tachysystole/hyperstimulation is the mechanism). The AI does not catch these; the prompt's "if you are unsure, skip" is not working for the small model. The source-set A tags (AK_Step1... Cardio on a Moraxella card) also show that tags are unreliable, so subj should come from content (the AI did this correctly).
7. Subtle model-introduced medical errors (rare, 2 of 72): idx 112 clue "Intracellular edema" for spongiosis (it is intercellular; ballooning is intracellular; the AI lifted the wrong neighbouring line of the source). Hallucinated extra facts are otherwise rare and mild (extra "tachycardia", "5-HIAA", "30:2" all came from the source; a few why-wrong sentences add true outside facts, e.g. glucocorticoid treatment).
8. Why-wrong quality is mostly good; weak ones: circular ("Not the cancer linked to chronic ulcers in this teaching", idx 52), generic ("Shorter than the recommended period", 104), and in idx 41 the why-wrong for the distractor states the real mechanism (Na retention) that arguably competes with the "correct" answer. No ww was factually wrong in the sample.
9. Clues too few/generic in B: 30 of 42 haiku-B cards have 1-2 clues. Usually fine for recall facts (single buzzword), but "Pavor nocturnus", "Whooping cough" cards are effectively 1-second lookups: fine, just easy.

Not seen: clues longer than ~8 words (clues were reliably short), invalid subjects, answers equal to a distractor, "None of the above".

## 4. Prompt diagnosis
The current prompt (importguide.js buildAiPrompt, ~315 words) is good on format and honesty (no invented facts, skip if unsure) but says nothing about what makes a card playable. Specific gaps and why they cause the observed failures:
- "ans: ... short (a diagnosis, drug, mechanism, or next step). Under 80 characters" allows an 80-character sentence; there is no instruction that the answer is a term. 80 chars is about 12 words. (Failure 2)
- "bw: short clues that point to the answer ... taken from my card" is read as "copy phrases from the card", including the phrases that are the answer. Nothing says the clues must not contain the answer or must name the subject/attribute asked. (Failures 1, 3)
- Distractors: "plausible look-alikes of the same kind" is right but the model has no examples of bad ones (opposites, thresholds, categories) and not that neither may be also correct. (Failure 4)
- Skip rule: "clear question with one short answer (long lists, images, definitions...)" is read too broadly by the small model (skips "what are the consequences of X" whose back has a crisp term, 37% missed) and not broadly enough (it still makes definitional cards and cards from questions with options removed). (Section 2 and Failure 5)
- No flip instruction for "what is X?"-type cards whose back is a description. (Failure 1)
- "If unsure skip" is the only guard for wrong sources; a one-line "your own knowledge must agree with the card" would have caught Moraxella with a stronger model but not the small one.

Proposed prompt: /tmp/realistic/proposed-prompt.txt (about 680 words vs 315; the added cost for a player is about 500 tokens per paste, trivial next to 25+ cards). Main edits, all text only, and the parser accepts the same schema:
1. Opens by telling the AI how the game works (2-4 clues, 3 seconds, three gates, exactly one defensible) so every later rule has a reason; this is the single most effective sentence for small models.
2. "ans" must be a TERM, 1-4 words, never more than 8; extract the key term from a sentence back; flip "what is X?" cards (description in bw, NAME in ans).
3. Clue rules: never put the answer or its key words in a clue; name the subject and what is asked for property cards; use specific buzzwords, not generic words.
4. Distractor rules: real terms of the same kind and similar length, sibling items from the same list or nearby numbers, never opposites/silly/different category, never also correct.
5. Skip rules rewritten as "make a card when it boils down to one fact -> one short term", with an explicit SKIP list (lists/sequences, definitions, explain/consequences questions, yes/no, two-in-one, odd-one-out with options missing, vague or self-contradicting backs), plus "extract the term" so crisp-answer "what are the effects" cards are not skipped, plus "one card per fact" to stop the 3-4 duplicate organism cards.
6. Four bad-vs-good mini-examples drawn from the observed failures (coarctation leak/sentence, menorrhagia absurd distractors, malignant hyperthermia sentence answer, Pseudomonas vague clues). The example object now has a term-style answer ("Infective endocarditis", capitalisation as in the existing example otherwise).
7. ww instruction: say what the wrong option actually is/does, not "not the answer" (fixes circular why-wrong).

Not fixable by prompt: the wrong-source problem (Moraxella) and the model's quiet acceptance of dubious claims; the app should keep the existing "skim the cards for mistakes" warning, and ideally show a one-tap "report wrong" per card.
Optional code-side guards (suggestions only, not done): reject or flag cards where more than half of the answer's content words appear in bw, where ans has more than 8 words, or where two cards in one import share ans plus both distractors. These three checks flag 21 of the 120 cards (12 of them inside the graded sample, all leak or duplicate cases, none of them GOOD), at zero cost to the player; they do not catch vague clues or weak distractors.

### Expected improvement (estimate, not tested; I did not re-run the models)
Based on which failures the added rules directly address:
- Leak (17%) and sentence-answer (about 25%) cards are the main FIXABLE/BAD cause in set A; the flip and "term not sentence" rules should convert most of them: expected GOOD rate set A haiku 27% -> about 50-55%, sonnet-A 43% -> about 65-70%.
- Set B already at 68-80%: expected to reach about 80-85% mainly through better distractors (menorrhagia, gram-stain, vision cases) and fewer trivial cards.
- Overall GOOD 50% -> about 65-70%; FIXABLE+BAD from 50% -> about 30-35%.
- Wrongly skipped rate: telling the AI to extract the key term from "effects/consequences/triggers/reason" backs should recover perhaps half of the 37% wrongly skipped cards (-> about 15-20%), at the cost of some risk of more mediocre cards being produced from vague backs; the explicit skip list should offset that.
- Remaining ceiling: set A sources are low-quality AI-written paragraphs; even a perfect conversion will not make half of them good runner cards. Suggest that the app default to recommending set-B style (short factoid) cards or tell players that paragraph-style decks convert poorly.
