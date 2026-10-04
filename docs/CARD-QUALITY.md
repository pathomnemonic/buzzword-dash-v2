# Card quality: the "CLL Rai Staging" post-mortem

A player reported a card whose answer was **CLL Rai Staging** and whose clues were *"CLL staging"* and
*"Rai staging system"*. The clue is the answer. This document records how that got through, what was done
to every card in the deck, and what now stops it happening again.

## How it slipped through

The load-time filter (`clueLeaksAnswer` in `js/cardleaks.js`) was written to drop clues that repeat the answer,
and it was tuned to avoid dropping good clues. Each tuning decision opened a hole:

| Hole | What it hid in he146 |
| --- | --- |
| Word stems shorter than 4 letters were ignored | `CLL` and `Rai` were never compared |
| Words that also appear in a distractor are treated as "category" words | `staging` is in *Ann Arbor Staging* and *TNM Staging*, so it was exempt, and the rest of the clue was waved through |
| Bracketed text was stripped before comparing | aliases such as `(Prinzmetal)`, `(WAGR)`, `(HNPCC)` never counted |
| Deck-frequency "generic word" list | common medical words (`syndrome`, `disease`, `deficiency`) could never leak |
| No check for initials or acronym expansions | *Myasthenia gravis* for `MG`, *Rheumatoid arthritis* for `RA`, *Ulcerative colitis* for `UC` |
| The filter only *removed* clues, and the tests only ran on the filtered output | a card with two leaking clues still shipped, as long as two clues survived, and nothing reported how many were being dropped |
| Authoring review looked at a sample, never at every card | there was no whole-deck read |

The filter was a safety net that was also being used as the quality bar.

## What was done to the deck

1. **Strict detector** (`strictClueLeak`, `strictLeakReport` in `js/cardleaks.js`). It compares every token of
   two letters or more, includes bracketed aliases, checks the answer's initials, checks acronyms spelled out in the
   clue (including two-letter ones such as MG, UC and RA), and only exempts words that are genuinely shared with a
   distractor or are plain modifiers.
2. **Audit tool**: `node tools/audit-leaks.mjs` lists every flagged card by subject (`--json out` for a report).
   First run: **308 of 3,010 cards flagged, 145 left with fewer than three clues**.
3. **Rewrite**: all 309 flagged clue sets were rewritten by hand so they describe the entity without naming it.
4. **Full read-through of all 3,010 cards**, subject by subject, for leaks no detector can see:
   - exact synonyms and eponyms used as clues (*Prinzmetal angina* for variant angina, *Hand-foot syndrome* for
     sickle dactylitis, *Folie à deux* for shared psychosis)
   - acronyms expanded in the clues (POEMS, CREST, CURB-65, ABVD, R-CHOP, SNOOP, ATRA, ADHD)
   - the clue that restates the answer ("Hepatitis B surface antigen" for *Chronic hepatitis B*, "Trisomy 21" for
     Down syndrome, "Tricyclic antidepressant overdose" for *TCA Overdose*)
   - a factual error (clindamycin was listed as acting on the 30S subunit; it is 50S)
   About 500 more clues were rewritten in this pass. Cards that are genuinely topic cards (for example
   *Right shift of the O2-Hb curve*) now describe the mechanism instead of restating the title.
5. **Runtime defence in depth**: after the old filter, `validateCard` now also drops clues the strict detector
   flags, but only while at least three clues remain, so a card is never starved.

## What now stops it coming back

- `tests/unit/cardquality.test.js` fails the build if **any** built-in card has a clue that the strict detector
  flags, or has fewer than three clues. It also pins the original he146 case.
- `tests/unit/cardcount.test.js` keeps the clue text of a card to 260 characters so it fits a phone screen.
- Players can now report a card from the Card Browser and from the results screen, with *"a clue gives away the
  answer"* as a reason (`js/cardreport.js`), so what the detector and the read-through miss reaches us.

## Known limits

The detector is lexical. It cannot see a clue that is a *definition* of the answer in different words (for example
"Potassium above 6.5" for *Hyperkalemia ECG progression*), a synonym it has never been told about, or a clue that
is merely too easy. Those are caught by reading, which is why the player report button matters. When reports
arrive, fix the card in `js/cards/<subject>.js`; the test will tell you if the fix itself leaks.
