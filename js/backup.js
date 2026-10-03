/**
 * backup.js — save and restore everything the player made, in one file.
 *
 * Progress lives in one place and the player's own cards (typed in or imported from Anki) in another, so a backup
 * has to carry both: otherwise restoring on a new phone brings back the progress but loses the cards.
 */

/**
 * @param {{exportBackup: function(): string}} storage
 * @param {{getAll: function(): object[]}} customCards
 * @returns {string} the backup file's text
 */
export function buildBackup(storage, customCards) {
  var parsed = JSON.parse(storage.exportBackup());
  parsed.customCards = customCards.getAll();
  return JSON.stringify(parsed, null, 2);
}

/**
 * @param {string} text the backup file's text
 * @param {{importBackup: function(string): {ok: boolean, error?: string}}} storage
 * @param {{replaceAll: function(object[]): number}} customCards
 * @returns {{ok: boolean, error?: string, cards: number}}
 */
export function restoreBackup(text, storage, customCards) {
  var result = storage.importBackup(text);
  if (!result.ok) return { ok: false, error: result.error, cards: 0 };
  var cards = 0;
  try {
    var parsed = JSON.parse(text);
    // A backup made before cards were included has no list: leave the player's cards alone
    if (Array.isArray(parsed.customCards)) cards = customCards.replaceAll(parsed.customCards);
  } catch (e) { /* the progress was restored; the cards list was unreadable */ }
  return { ok: true, cards: cards };
}
