# MedAlpaca medical flashcards -> runner deck (pilot)

Output: `tools/opendecks/out/medalpaca-runner.json` (deck id `medalpaca`, 722 cards, format 1, passes `tools/opendecks/check.mjs`).

Source: Hugging Face `medalpaca/medical_meadow_medical_flashcards` (33,955 rows `{input, output}`), derived by Han et al. (MedAlpaca, 2023) from a community-made Anki medical curriculum deck and rephrased with GPT-3.5. The dataset card lists the licence as "cc" with no variant. **Provenance is unverified**; the user explicitly accepted that risk for this dataset. The deck header records: licence name "cc, variant not specified on the dataset card", the origin above, and `"unverified": true` (an optional extra field), and the attribution text says so.

## Procedure

1. **Download** (raw data stays outside the repo): `curl -L -o /tmp/medalpaca/raw.json https://huggingface.co/datasets/medalpaca/medical_meadow_medical_flashcards/resolve/main/medical_meadow_wikidoc_medical_flashcards.json` (that file holds the 33,955 rows).
2. **Programmatic screen** `python3 -I screen.py raw.json workdir` -> `survivors.json`, `screen_counts.json`.
3. **Stratified sample**: `classify.py` gives each survivor a keyword-based app subject and a source discipline (pharmacology, microbiology, pathology, anatomy, immunology, biochemistry, physiology, clinical_medicine); 150 random survivors per discipline = 1,200 (seed 20261012).
4. **AI conversion** (done by Claude, in batches of 40-90 rows, `conv/*.txt`, one line per row: `n|hint|answer|wrong1|wrong2[|S=Subject]` or `n|X|reason`). Rules applied: answer is a short term (at most 5 words), hint names what is asked and does not contain the answer, wrong answers are siblings of the same kind (never increased/decreased/no change, never silly), fact must be in the row or certain textbook knowledge, wrong facts logged and excluded. `conv/ww.json` holds one why-wrong sentence per wrong answer; the pearl (`tp`) is the dataset's own output sentence(s), trimmed.
5. **Build + checks** `node tools/opendecks/medalpaca/build.mjs workdir` assembles the deck and runs `check.mjs` (schema, hint/answer/option length, answer not in hint, near-duplicate options, opposites, answer supported by the evidence sentence, duplicates, no HTML). `evidence` is the row sentence that best supports the answer; `source/<source_ref>.txt` holds question and answer text of each kept row so the checker (and `package.mjs --source tools/opendecks/medalpaca/source`) can find it. `source_ref` is `mp<row index in the raw file>`.
6. **Independent review** of 80 random kept cards, then curation.

## Numbers

Stage 1, screen (rules applied in this order; each row counted once at the first rule it fails): 33,955 rows -> 14,053 survivors.

| rule | rows dropped |
|---|---|
| answer is a paragraph (over 260 chars or over 2 sentences) | 10,274 |
| boilerplate / hedging ("consult a healthcare provider", "it depends") | 2,714 |
| near-duplicate of an earlier row (question and answer-term overlap) | 2,431 |
| vague "what is / explain / how does" with long answer | 1,125 |
| list-style answer (4+ items, "list/what are the types") | 1,121 |
| yes/no or either/or question | 901 |
| empty or too short | 419 |
| exact duplicate question | 272 |
| needs an image or figure | 266 |
| answer only restates the question | 188 |
| mnemonic | 155 |
| answer over 38 words | 36 |

Stage 2, AI conversion of the 1,200 sampled survivors: 804 kept, 396 excluded on the first pass (vague 155, trivial 29, dubious or wrong fact 26 + 8 imprecise + 6 contested + 2 outdated, duplicate concept 26, list or two-part 40, garbled/obscure 24, other). After the coordinator's note that the app's helper wrongly skipped about a third of its rejects, I re-read the 230 "vague / trivial / weak" rejects and rescued 29 (12.6 percent; most of that group really are explain-style rows). Facts found wrong in the row and excluded include: HCO3- exits the early PCT cell by facilitated diffusion (it is Na+/HCO3- cotransport), ependymoma as the solid-cystic pediatric tumor (pilocytic astrocytoma), lymph node levels IIA/IIB separated by the jugular vein (spinal accessory nerve), CagA as the mucus-degrading factor, desmopressin for variceal bleeding, nasal calcitonin to prevent vertebral fracture, routine antibiotics for uncomplicated diverticulitis, azithromycin as chlamydia treatment (doxycycline now preferred), PCV13/PPSV23 for HIV, and a few more (see `conv/excluded.json`).

Stage 3, checks: 833 candidate cards (804 plus 29 rescued), 107 failed the stricter `check.mjs` (failure codes, a card can have several: answer not supported by the row sentence 48, runner rule 45 = answer over 5 words or opposite-type wrong answers, near-duplicate options 7, length 7, evidence too short 4, leak 2). I reworded about 48 of them and dropped about 59. Then curation after the review below removed another 50 (opposite or ambiguous options, trivial or definition-style). **Final: 722 cards, 0 failures**, 553 carry only the "one clue" warning (most hints are a single 4-9 word phrase) and 0 carry a leak warning.

Stage 4, independent review of 80 random kept cards (taken before curation, graded from the original row without looking at my conversion notes):

| axis | result |
|---|---|
| fact preserved from the row | 80/80 |
| runner-fit (answerable from the hint in a few seconds, one defensible gate, plausible sibling distractors) | 56 good (70 percent), 23 partial (29 percent), 1 poor (1 percent) |
| medical correctness | 77 correct, 3 uncertain (4 percent: long thoracic vs intercostobrachial nerve in axillary dissection, 72-hour cholecystectomy window, demographic of Whipple disease), none found wrong |

Failure patterns: weak or other-category distractors (Midodrine risk with "hypoglycemia / hyperkalemia", OCD with "Marfan syndrome"); hint that nearly restates the answer or never says what is asked (distal RTA, corticopapillary gradient); definition-style answers (Km); opposite-direction options (falsely low / falsely high); demographic "typical patient" cards with giveaway distractors. All of these were fixed or dropped in curation. Good examples: natural killer cells for tumors that downregulate MHC I; terminal deoxynucleotidyl transferase for random nucleotides in V(D)J recombination; sudden abdominal pain with a motionless patient -> perforated viscus (renal and biliary colic as distractors); streptokinase as the GAS product used to dissolve clots; peau d'orange for inflammatory breast cancer; Histoplasma for the Ohio/Mississippi valleys. Bad examples (fixed or dropped): midodrine, Whipple demographics, OCD syndrome distractors, HbA1c falsely low/high, Km definition, distal RTA hint.

Limits: the reviewer and the converter are the same model family, so "medical correctness" is a consistency check, not a clinician review. Subjects: 15 app subjects are system-based, so basic-science rows land mostly in "Multisystem / Mixed" or the nearest organ system (kept: Infectious Disease 130, Hematology/Oncology 86, Neurology 81, Multisystem 70, Gastroenterology 57, Nephrology 46, OB/GYN 44, Endocrinology 38, Cardiology 34, Pulmonology 34, Pediatrics 31, Surgery 22, Rheumatology 20, Psychiatry 17, Emergency Medicine 12). Tags carry the source discipline.

## Yield and verdict

14,053 survivors (41 percent of rows) -> 1,200 sampled -> 722 final cards = 60 percent of the sample. Extrapolated to all 14,053 survivors, roughly 8,000 more cards would be possible, but only by repeating the manual AI step.
