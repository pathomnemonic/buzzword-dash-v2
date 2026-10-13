# MedQA runner deck (pilot)

Source: Hugging Face `GBaker/MedQA-USMLE-4-options`, train split `phrases_no_exclude_train.jsonl` (10,178 rows), pinned to
commit `0fb93dd23a7339b6dcd27e241cb9b5eca62d4d18`, sha256 `3a65baf7...0324`. Licence as listed on the dataset card: CC BY 4.0.
Provenance of the underlying exam questions is NOT verified (the maintainer accepted that risk); every card says so in the
deck header (`provenance`, `attribution`). Cards are AI-distilled and have not been checked by a clinician.

Output: `tools/opendecks/out/medqa-runner.json` (500 cards, format 1, passes `tools/opendecks/check.mjs` 500/500, 25 with warnings).
Passage files for the checker: `tools/opendecks/medqa/source/medqa-<row>.txt` (vignette, options, keyed answer).

## Procedure and numbers

1. `fetch.sh` downloads the file. `screen.mjs` screens all 10,178 rows programmatically (first matching rule wins):
   image wording 1,108; lab/vitals-heavy (6+ values) 869; option over 70 characters 429; calculation/biostatistics/study design 361;
   stem not ending in ?/. 219; vignette over 190 words 225; ethics/communication 153; negated stem 17; multi-part option 1.
   Dropped 3,382, survivors 6,796 (step1 4,044; step2&3 2,752). Keyword organ-system classifier maps survivors to the 15 app subjects.
   `screen.mjs` then draws a seeded stratified sample of 1,000 survivors: 500 step1 + 500 step2&3, 66-68 per subject.
2. AI distillation (`view.mjs` prints 30 rows per batch, the model wrote one JSON line per row in `distilled/b*.jsonl`, corrections in
   `distilled/fix.jsonl`): 1,000 rows -> 618 cards, 382 excluded (reasons in `distilled/excluded.json`: about 101 concept duplicates,
   35 truncated vignettes, 13 calculations, about 109 ambiguous/disputed/outdated keys, 29 whose card answer is not supported by the keyed
   option, 12 ethics/jargon, rest other). 59 of the 618 are rewrites (same concept, runner-friendly question).
3. Checks: `assemble.mjs` builds cards (clues split into 1-3 hints of at most 60 characters, answers at most 5 words, two distractors, a why-wrong
   line each, pearl at most 300 characters) and runs `check.mjs` `checkCard` plus duplicate detection. First pass: 0 of 618 passed (470 had no
   why-wrong yet; 74 length, 46 opposite-comparative or long-answer, 61 evidence-support, 9 near-duplicate options). After fixes: 618/618 pass.
   Evidence rule: for this source the only sentence that names the answer is the dataset's keyed-answer line ("The keyed answer is D) ..."),
   so `evidence` is that line; it proves the key, not the medicine. Rewrites whose answer is not in the keyed option were dropped.
4. Independent review: seeded random 80 of the 618 (`review-sample.mjs`), original vignette re-read against the card. Rates are in the report
   that accompanied this commit; failures led to 4 deck drops (8138, 989, 7056, 8715) and clue-text fixes (broken comma splits).
5. Deck: the 618 minus the 59 rewrites and 4 review drops (555), trimmed to 500 by seeded random removal from the largest subject x step cells
   (`build-deck.mjs`). Final: step1 264, step2&3 236; 25-38 cards per subject (Multisystem 25, Pediatrics 29).

Rebuild: `sh fetch.sh /tmp/raw/train.jsonl; node screen.mjs /tmp/raw/train.jsonl /tmp/work` then copy `distilled/*.jsonl` into `/tmp/work/b/`,
`node assemble.mjs /tmp/work /tmp/work/assembled.json --source /tmp/work/passages`, `node build-deck.mjs /tmp/work/assembled.json /tmp/work/passages ../out/medqa-runner.json source`.
