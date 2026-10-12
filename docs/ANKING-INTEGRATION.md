# AnKing and popular Anki decks: what can be integrated

Date: 2026-10-12. Public pages only; nothing was scraped behind a login and no deck is bundled or committed. Items I could not confirm are marked **unverified**.

## Decision

Dx Dash does **not** download decks for the player. The flow is: open the deck's official page (one tap), get your own copy into Anki, export it, drop the file in Dx Dash, pick tags, import. The file is read in the browser and never uploaded. An "Import automatically" button was deliberately not built, for the reasons below.

## How the decks are distributed

| Deck | Where it is distributed | Notes |
|---|---|---|
| AnKing Step Deck (Step 1/2/3) | AnkiHub (https://www.ankihub.net/step-deck); an older third-party re-share exists on AnkiWeb (https://ankiweb.net/shared/info/1590561118) | AnkiHub's own page says "over 300,000 downloads" and "Direct sync with shared decks like the AnKing Step Deck". A forum thread reports the AnkiWeb copy came with 139 images instead of 30,000+ and that AnKing "distributes their decks through their own subscription service" (https://forums.ankiweb.net/t/anking-step1-shared-deck-from-ankiweb/46435). I did not link the re-share. |
| AnkiHub plans | https://www.ankihub.net/step-deck lists Free $0, $6, $10 per month, $450 lifetime (also quoted by https://studycardsai.com/blog/ankihub-guide, third party) | Free account can explore; syncing needs the AnkiHub add-on inside Anki. Prices change: unverified beyond the page text. |
| Zanki, Lightyear | Third-party guides point to Google Drive / AnkiWeb (https://webstrawmcmaster.notion.site/Downloadable-Anki-Decks-be9294859a3a43628c7b73da9794e33d, third party) | **Unverified**: I found no official page. The app links to an AnkiWeb search, not a deck page. |
| Pepper, Dirty Medicine | **Unverified**: not researched beyond a search | Linked to AnkiWeb searches only; the app says some are sold by their authors. |
| MileDown | MCAT deck on AnkiWeb (third-party mention) | MCAT, outside Dx Dash's USMLE/COMLEX scope, so not listed. |

## Licences and terms

- AnkiWeb and AnkiHub terms contain the same "Shared Deck License": downloading a shared deck grants "a permanent, non-revocable, worldwide, royalty free, non-exclusive license to use the material in your personal studies. This license is for personal use only, and the deck may not be redistributed, re-uploaded, published, or used for any other purposes without explicit permission from the copyright holder." Text read at https://community.ankihub.net/tos (the same wording is quoted from AnkiWeb's terms at https://ankiweb.net/account/terms by a search result; that page is JavaScript-rendered so I could not read it directly).
- The same terms forbid "automated use of our resources, including ... using scripts".
- AnKing's own licence: **unverified**. https://www.ankingmed.com was unreachable from here. I did not confirm CC BY-NC-SA or any other licence, so nothing assumes one.
- Consequence: bundling, mirroring or fetching these decks for users would be redistribution. Reading a file the user exported for their own study, on their own device, is personal use.

## Can a browser app fetch them?

- **AnkiWeb**: https://ankiweb.net/shared/decks is a JavaScript app; an unauthenticated `curl` of its download path returned HTTP 404 and none of ankiweb.net's responses carried `Access-Control-Allow-Origin`, so a page on another origin cannot read them. The AnkiWeb developer says the login limits exist "to make it harder for people to mirror the shared decks in bulk and redistribute them elsewhere" (https://forums.ankiweb.net/t/shared-decks-the-current-state-of-ankiweb/45904). Not possible, and not appropriate.
- **AnkiHub**: https://app.ankihub.net/ redirects to a login page (HTTP 301 to /accounts/login/); decks sync through the Anki add-on. No public file URL.
- **GitHub or Drive copies**: unofficial redistribution of the same material; not linked.

## How AnKing-style decks are structured (what the importer is built for)

Facts taken from AnkiHub's page and AnKing's public descriptions (https://www.ankihub.net/step-deck, https://www.ankihub.net/), plus my own reading of tags used in a synthetic deck; the exact real tag names are **unverified** because I could not obtain the real deck:

- Cloze notes with a first field `Text` and further fields such as Extra, Lecture Notes, Missed Questions and one per resource (Pathoma, Boards and Beyond, First Aid, Sketchy).
- Hierarchical tags separated by `::`, for example `#AK_Step1_v12::#B&B::Cardiovascular::Heart_failure` or `#AK_Step1_v12::#UWorld::Step::1`.
- Users suspend and unsuspend cards by tag as they study, so exports often contain suspended cards.

## What was built

- `js/importguide.js`: `POPULAR_DECKS` (names, official page, whether the link is a real deck page), the three steps, and the "why no automatic download" text.
- `js/ankiimport.js` and `js/ankifilterui.js`: the "Import a popular deck" section (list, buttons that open the official page, drop zone), then the tag filter panel.
- `js/ankitags.js`: tag tree, selection, presets (Step 1 / 2 / 3, subject, resource), subject guessing from tags, size estimate.
- `js/customcards.js`: tags and an Anki key stored on each card, `upsertMany` (chunked, deduplicating), a player-set card limit (default 5,000, at most 50,000).
- Flashcard mode shows the imported card's tags; My Cards search matches tags.

## What could not be done

- No automatic download (above). If AnkiHub or AnKing ever publish an open, CORS-enabled, licence-permitting export URL, `POPULAR_DECKS` is the place to add an "Import automatically" button.
- Real AnKing, Zanki, Lightyear, Pepper and Dirty Medicine files were not available, so tag presets were tested on a synthetic deck built with the real Anki exporter. Subject guessing is keyword matching on tags and will leave decks with unfamiliar tag vocabularies in "Multisystem / Mixed".
- Images and audio in decks are dropped, not imported.
- Storage: every imported card lives in one `localStorage` entry (about 5 MB per site, shared with the save). Roughly 10,000 to 20,000 short cards fit; a full 30,000-card deck usually will not. The panel shows an estimate and, if saving fails, nothing is changed and the player is told to import a smaller part.
