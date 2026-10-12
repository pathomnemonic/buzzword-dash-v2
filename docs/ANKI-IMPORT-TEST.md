# Anki import test report

Date: 2026-10-11. Code under test: `js/ankiimport.js` (and the reply parser in `js/importguide.js`, covered by the existing `tests/unit/importflow.test.js`).

## How it was tested

- The importer was driven in jsdom/vitest the same way `tests/unit/anki.test.js` does it (a `File`-like object with `size` and `arrayBuffer()`), over a scratch corpus kept **outside the repo** (`/tmp/.../scratch`). No third-party deck file is committed. Only tiny hand-written fixtures live in `tests/fixtures`.
- Note for anyone repeating this in vitest: the production `loadSqlJs()` resolves the wasm through Vite's `?url`, which becomes `/node_modules/sql.js/dist/sql-wasm.wasm` under vitest and fails on a cold start. Existing tests avoid it by initialising sql.js with `require.resolve` first; do the same in new tests.
- Sources of real files:
  1. Files produced by the **real Anki 26.9.3 exporter** (the official `anki` PyPI package, `Collection.export_anki_package`, `export_collection_package`, `export_note_csv`). One deck with every note kind below, exported as "Support older Anki versions" (legacy) and as the latest format (`legacy=False`), plus a 6,500-note version.
  2. Anki's own test fixtures from `ankitects/anki` (`pylib/tests/support/`: `diffmodels2-1.apkg`, `diffmodeltemplates-1.apkg`, `media.apkg`, `update1.apkg`, `text-2fields.txt`, `text-tags.txt`), fetched via raw.githubusercontent.com. License: the Anki repo is AGPL-3.0; used only locally for testing.
  3. A real third-party deck repository, `giladfeldman/MedicalBookExamStudyCards` (38 `.apkg` files, 4,557 pediatrics cards built from a Nelson summary, Hebrew text, cloze-heavy). **No license file was found in the repo** and the content is derived from a textbook, so it was read locally only and nothing from it is committed or quoted beyond card counts.
  - Not found/reachable: AnkiWeb shared decks (needs login/JS), AnKing decks (distributed through AnkiHub behind a subscription, so I did not test them; the `langfield/AnKing-v11` repo holds only note-type templates, no deck). Unverified: behaviour on a real AnKing export. A synthetic note type with the same shape (cloze `Text` + 6 extra fields) was used instead.

## Results

| Input | Result before | Result after |
|---|---|---|
| `.apkg` legacy (`collection.anki21` + stand-in `collection.anki2`) | OK, 14 cards from 13 notes | OK (unchanged) |
| `.apkg` / `.colpkg` latest (`collection.anki21b`, zstd, + stand-in `collection.anki2`) | **0 cards**, misleading warning "A note with only a picture or sound was skipped" | OK, 14 cards. Reads `collection.anki21b` through `fzstd` |
| Old Anki 2.0/2.1 `.apkg` with only `collection.anki2` (2012-2014 fixtures) | OK | OK |
| `.apkg` holding only the "Please update to the latest Anki" stand-in | 0 cards, wrong warning | 0 cards, correct "Support older Anki versions" advice |
| `.colpkg` (whole collection) | file picker did not offer it | accepted, same code path, OK |
| Big deck, 6,514 notes (legacy and latest) | OK, truncated to 5,000 with a warning, 50-135 ms | same |
| Nelson deck, 14,471 cards after cloze split | truncated to 5,000, ~0.5 s | same |
| Notes in Plain Text, all options ticked (`#separator`, `#html`, guid/notetype/deck/tags columns) | OK but back sides ended with `, , , ,` (Anki pads every note to the field count); cloze Extra polluted the same way | clean |
| Same, plain text with `html:false` | entities such as `&#8805;` left raw | decoded |
| Tab file with no `#separator` line whose text has more commas than tabs | **read as CSV** (wrong columns) | read as TSV |
| `# comment` first line (Anki's own `text-2fields.txt`) | one bogus "Row 1" warning | skipped quietly |
| Text containing `<` and `>` as words (`BP <90 and HR >100`) | everything between `<` and `>` deleted | kept |
| `&amp;lt;` | became `<` | becomes the text `&lt;` |
| Numeric/hex/named entities (`&#8805; &#x2265; &ndash; &beta;`) | left raw | decoded |

### Format matrix

| Feature | Status |
|---|---|
| `.apkg` v2 (`collection.anki2`) | works |
| `.apkg` v21 (`collection.anki21`) | works (stand-in `anki2` ignored) |
| `.apkg` v3 (`collection.anki21b`, zstd) | **now works** (new `fzstd` dependency, MIT, ~8 KB, loaded only on import) |
| `.colpkg` | works |
| Field separator `\x1f` in `flds` | works |
| Plain-text separators tab, comma, semicolon, space, pipe via `#separator:` | work; no directive: tab if the first line has a tab, else comma/tab count |
| Quoted fields with delimiters, doubled quotes, embedded newlines, BOM, CRLF | work |
| Cloze (`{{c1::a::hint}}`, several numbers, extra field) | one card per cloze number, hint shown as `[hint]`; works in apkg and text. Only field 1 is read as the cloze text and field 2 as Extra |
| Basic / Basic (and reversed) / optional reversed / type-in | first two fields only; reversed cards are not generated (one card per note) |
| Notes with 3+ fields (AnKing-style) | cloze notes fine; non-cloze: only fields 1 and 2 in apkg, all non-empty extras joined in text export |
| HTML (`<b>`, `<br>`, `<div>`, lists, tables) | tags stripped; `<br>` is a space in apkg and ` / ` in text exports (known inconsistency, kept because an existing test fixes the apkg behaviour) |
| Images (`<img>`) | removed; a note that is only an image/occlusion is skipped with a warning |
| Audio (`[sound:x.mp3]`) | removed |
| Media files inside the package | ignored, not imported |
| Tags | not imported (the tags column is dropped); an old text export with a tags column but no `#tags column` directive gets the tags appended to the back |
| Unicode (accents, CJK, Hebrew, emoji) | work |
| Size limits | file 100 MB, text 10 MB, 5,000 cards per import (a warning says so) |
| Scheduling/review history | ignored by design |
| Image occlusion notes (stock type) | skipped with a warning |

## Bugs fixed (all in `js/ankiimport.js`)

1. Latest-format decks imported nothing and showed a wrong warning: now unpacks `collection.anki21b` (zstd); if unpacking fails it says so and suggests the "Support older Anki versions" export.
2. "Update Anki" stand-in detection required both sides filled; now matches the first field only.
3. Padding columns glued onto card backs in plain-text exports.
4. Tab-separated files misdetected as CSV when the text had many commas.
5. HTML stripping deleted text between a bare `<` and `>`; entities were decoded in the wrong order and numeric/named entities were skipped.
6. Comment lines (`# ...`) before the data produced a bogus row.
7. Optional-reversed notes got their "y" flag appended to the answer when the export includes the note type column.
8. `.colpkg` is now offered by the file picker.

Tests: `tests/unit/ankiformats.test.js` (8 tests, builds apkg and a zstd `anki21b` in memory with `zlib.zstdCompressSync`, skipped on Node versions without it) and the fixture `tests/fixtures/anki-export-wide.txt`.

## Known gaps / suggestions

- Only the first 5,000 cards of a large deck are imported, silently skewed to the front of the deck; a "choose a sub-deck" step would help (Anki's deck/tag columns are available in the data).
- Tags are thrown away. Mapping Anki tags (`Step1::Cardio`) to Dx Dash subjects would make imports land in the right system instead of "Multisystem / Mixed".
- Reversed cards, image-occlusion and image-only cards are not represented; images could be kept as flashcard-only cards if media import were added.
- `<br>` handling differs between the two paths.
- AnKing-class decks (30k+ notes, many fields) were not tested with a real file; the 5,000 cap and the Pro gate (`anki_import`) apply.

## Update 2026-10-12: popular decks, tags and filtering

New in the importer (see `docs/ANKING-INTEGRATION.md` for the research and what was not possible):

| Feature | Status |
|---|---|
| Tags read from the notes table (space-separated, `::` hierarchy) and from text exports with a `#tags column` | works; stored on each imported card as `tags` (at most 15, plain text, `leech`/`marked` dropped) |
| Suspended (queue -1) and buried (-2, -3) cards, per cloze card (ord = cloze number - 1) | works; "Skip suspended" on by default, "Skip buried" off |
| Cloze: several clozes, same number twice, nested clozes, hints | one card per number; front blanks it as `[...]`/`[hint]`, back is the answer, teaching text is the full sentence plus Extra and the other fields |
| Image occlusion notes | skipped, counted in the warning |
| Re-import | card key = Anki guid (+ `#cN` for clozes) or a hash of the text; same key updates in place (same card id), unchanged cards are reported as already up to date |
| Cap | parsing reads up to 100,000 cards; My Cards holds 5,000 by default, the player can raise it to 50,000 in the panel; a failed browser save changes nothing and says so |
| Big decks | import runs in chunks of 400 with progress and yields to the page between chunks; one read and one write of storage |
| Tag tree | searchable, counts per node (each card once), tri-state checkboxes, Select all / none / matches, chips for Step 1/2/3, 14 subjects and 5 resources (only those present), live count and storage estimate |
| Imported subject | guessed from tags (`Cardiology`...), otherwise "Multisystem / Mixed" |
| Display | flashcards show a short tag line (last parts of up to 3 tags); My Cards search also matches tags |

Verified with: `tests/unit/ankifilter.test.js` (29 tests: synthetic collections with real column names, tag tree, filters, presets, dedupe, chunks, storage failure, tag text never rendered as markup, the panel in jsdom), and in Chromium against a production build: a 1,888-card AnKing-shaped deck exported by the real Anki 26.9.3 in the latest zstd format with 60 suspended cards (chips Step 1 + Cardiology gave 66 cards, import then re-import reported 66 new then 66 already up to date, tags visible in Flashcard mode, no page errors).

Performance note: `customCards.getAll()` parses the whole list on every call; at 30,000+ cards that is tens of milliseconds per call in several screens. Not measured in the browser at that size.


## Real-scale test (30,000 notes, 480 MB), 2026-10-12

Generator: `/tmp/claude-0/scratch/gen/gen3.py` (real Anki 26 python package: `python gen3.py 30000 1800 256 legacy,latest`). 30,000 notes (cloze and basic, HTML extra fields, `#AK_Step1_v12::#B&B::System::Topic::Subtopic::Concept`-style tags with several resources per note, about 20,000 distinct tag levels, 5% suspended, 1% buried, 46,371 cards) plus 1,800 dummy 256 KB images stored as media. Result: `legacy.apkg` 479.6 MB (collection.anki21), `latest.apkg` 479.1 MB (zstd collection.anki21b). Both deleted after the test. The collection itself is only 39 MB; a real AnKing collection is larger.

Driven in headless Chromium (software-rendered container, 4 cores, so slow on 3D) against `npx vite build` output, CSP enforced, viewport 390x780 (edge cases at 320x568). The worker was used.

| Stage | Time | Peak JS heap (page) | Longest main-thread freeze |
|---|---|---|---|
| Read 480 MB file: ZIP index, unpack collection, read 30,000 notes (worker) | 2.3 to 3.3 s | 125 MB | 300 ms (building the filter panel) |
| Tag search / chips / expand | 0.3 to 0.7 s | 143 MB | 136 ms |
| Import 44,053 cards (check + save to IndexedDB) | 1.5 to 1.7 s | 159 MB | 191 ms (738 ms in nine pieces) |
| Import the same deck again (all "already up to date", no writes) | 1.0 s | 158 MB | 161 ms |
| Reload page, cards back from IndexedDB | 0.6 to 0.9 s | 232 MB | 574 ms |
| My Cards open / search over 44,053 cards / next page | 70 ms / 0.6 s / 0.4 s | 156 MB | 163 ms |
| Flashcard session start with the 44k deck | 70 to 105 ms | 161 MB | 105 ms |
| Home pool counts (`_pickerPools`) | 14 ms per call | | |

Memory outside the page: whole-browser RSS grew by about 230 MB while the file was read (the worker's copy of the collection plus WebAssembly), and the worker is terminated afterwards. Reading the same files in Node (no worker) peaked at about 250 MB RSS: 1.7 s legacy, 1.8 s latest (46,371 cards both). The old code would have refused the file (100 MB cap) and, without the cap, needed the whole 480 MB buffer plus a JSZip copy.

Before and after: single-card rows in IndexedDB took 14.5 s to save 44,000 cards in this container (disk bound); 250-card pages take 0.3 s. Parse of the 3,500 notes in the unit tests is paged by 1,000.

Edge cases run in the real app:
- truncated .apkg (first 100 MB of the file), random bytes named .apkg: "That file is not an Anki deck package ... the download may have stopped early".
- a ZIP with no collection: "Could not find any notes in that file. It is a ZIP, but not an Anki deck."
- an Anki text export with tags (`tests/fixtures/anki-export-sample.txt`): 6 cards, tags kept.
- cancel while reading: worker terminated at once, "Cancelled. Nothing was imported."
- cancel while importing: "Cancelled", earlier cards untouched.
- quota exceeded (IndexedDB `put` mocked to throw `QuotaExceededError`): "Your browser ran out of storage space, so nothing was saved and your earlier cards are unchanged", count unchanged.
- reload: all cards come back from IndexedDB, in the same order.

Not tested in this container: a real phone, Safari/Firefox (not installed; the code paths use only standard APIs and fall back when `DecompressionStream`, module workers or IndexedDB are missing), the 3D run with imported cards (a run started and played normally; imported cards are flashcard-only and are skipped before any work is done on them), the Playwright e2e specs (the configured browser build is not installed here; the importer flow was driven by the scripts above).

Unit tests added: `tests/unit/apkgzip.test.js` (stored and deflated entries, ZIP64, comments, cut files, bad checksum, encryption, never reading media, JSZip fallback), `tests/unit/apkgparse.test.js` (paged reading, progress, cancel, zstd, friendly messages), `tests/unit/cardstore.test.js` with `tests/unit/fakeidb.js` (a minimal in-test IndexedDB: save/load, pages, write-behind, quota rollback, cancel, re-import, localStorage migration and fallback).
