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
