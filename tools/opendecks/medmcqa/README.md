# MedMCQA runner deck (id `medmcqa`)

Source: MedMCQA (Pal, Umapathi, Sankarasubbu; CHIL 2022), Hugging Face `openlifescienceai/medmcqa`, licence Apache-2.0 as listed on the dataset card. Exam questions compiled from Indian medical entrance exams; provenance unclear (accepted by the project owner). Rewritten into runner cards by an AI, checked automatically, NOT verified by a clinician.

Output: `tools/opendecks/out/medmcqa-runner.json` (copy `medmcqa.json` for the packager). Passages for the checker: `source/<row id>.txt` (the dataset explanation text, cleaned of HTML).

## Procedure and numbers
1. Download: parquet of the train split (182,822 rows) kept in /tmp. `screen.py` samples 20,000 rows (seed 150) and screens them:
   single-choice 13,282; relevant subject 10,186; not image/figure 10,107; no all/none/both 10,087; no except/not 9,249; no "which of the following"/statement 7,837; no calculation words 7,659; no year/guideline/India-programme words 7,306; no "old/previously" 6,944; stem 12-160 chars 6,695; options short 6,319; explanation >= 40 chars 5,034; no grade/type/number answers 4,512 survivors.
2. `strat.py` (kept in /tmp) drew a stratified 1,500 (170 Medicine ... 30 PSM). 1,440 were read and converted by hand/AI in batches of 40-60 (`batches/*.txt`, one line per kept card: `row|subject|type|hint|answer|wrong1|wrong2|pearl`); 759 cards were written, the rest excluded (poor runner fit, ambiguous, keyed answer doubtful, duplicates). The last 60 sampled rows were never read.
3. `build_stage.py` attaches the dataset row and picks a verbatim one-sentence evidence from the explanation (answer-word overlap >= 0.5): 597 of 759 kept. `fixes.json` holds manual rewrites/drops (clues over length, 6+-word answers, direction-only options such as raised/lowered), `ww*.txt` the why-wrong lines. `mkdeck.py` assembles the deck.
4. `node tools/opendecks/check.mjs tools/opendecks/out/medmcqa-runner.json --source tools/opendecks/medmcqa/source`: 576 of 576 pass (first pass 541 of 597; the failures were lengths, long answers, near-duplicate or opposite options).
5. Independent review of 80 random cards (see report): about 90% good runner fit, ~9% weak distractors, ~4% uncertain/contestable keys; 6 cards dropped afterwards.

Known limits: 459 of 576 cards have a single clue (warning only); evidence is the dataset's own explanation, which is often a textbook paste; several why-wrong lines in the later chunks are terse.
