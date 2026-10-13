# Testing the AI-helper prompt under player conditions

Players turn their own flashcards into runner questions by pasting `buildAiPrompt()` (js/importguide.js) plus their cards into a
free chat AI. To test that honestly we copy what a player does: the app's own prompt, 25 cards pasted the way an Anki
plain-text export looks (HTML and tags left in), a fresh model with no repo access and no extra hints (a small fast model
and a stronger one), the raw reply saved verbatim, then parsed by the app's real `parseAiReply` and graded by an independent
reviewer who re-reads the source card. Harness: `tools/opendecks/realistic/` (`make-batches.mjs`, `score.mjs`).

| | Round 1 (old prompt) | Round 2 (v2) | Round 3 (v3, shipped) |
|---|---|---|---|
| Cards rated GOOD | 50% | 79% | 87% (fresh batches only: 89%) |
| Good cards per 25 pasted | 7.5 | 9.2 | 11.7 |
| Runner-fit | 56% | 68% | 77% |
| Answers of 5+ words | 29% | 3% | ~3% |
| Wrongly skipped (of sampled skips) | 37% | 39% | 36% |

Fresh batches are cards that no earlier prompt or reviewer saw (round 2's examples came from the test cards, so its numbers were
flattered). Samples are 56-72 cards per round, roughly +/-10 points, so only the large moves are real.

Still weak: distractors of the wrong kind or ones the clues already rule out; small models skipping crisp one-line facts;
near-duplicate "template" cards; a clue that restates the answer in other words (the parser catches the exact and
most-word cases only). Full gradings: `docs/ai-prompt-test/`.
Re-run: `node tools/opendecks/realistic/make-batches.mjs <cards.json> <dir>`, send each prompt file to a fresh chat model,
save replies, then `node tools/opendecks/realistic/score.mjs <repliesDir> <promptsDir>` and grade a sample.
