/**
 * backup.js — save and restore everything the player made, in one file.
 *
 * Progress lives in one place and the player's own cards (typed in or imported from Anki) in another, so a backup
 * has to carry both: otherwise restoring on a new phone brings back the progress but loses the cards.
 */

/**
 * A small checksum over the backup's contents (FNV-1a over the canonical
 * JSON). It is not a signature: it catches a truncated, corrupted or
 * hand-edited file before its numbers are trusted as a save.
 * @param {object} parsed the backup object, without its checksum field
 * @returns {string}
 */
export function backupChecksum(parsed) {
  var text = JSON.stringify(parsed);
  var hash = 0x811c9dc5;
  for (var i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return ('0000000' + (hash >>> 0).toString(16)).slice(-8);
}

/**
 * @param {{exportBackup: function(): string}} storage
 * @param {{getAll: function(): object[]}} customCards
 * @returns {string} the backup file's text
 */
export function buildBackup(storage, customCards) {
  var parsed = JSON.parse(storage.exportBackup());
  parsed.customCards = customCards.getAll();
  parsed.checksum = backupChecksum(parsed);
  return JSON.stringify(parsed, null, 2);
}

/**
 * @param {string} text the backup file's text
 * @param {{importBackup: function(string): {ok: boolean, error?: string}}} storage
 * @param {{replaceAll: function(object[]): number}} customCards
 * @returns {{ok: boolean, error?: string, cards: number}}
 */
export function restoreBackup(text, storage, customCards) {
  // A backup carrying a checksum must match it before anything is
  // restored. Backups made before checksums existed have none and are
  // restored as before.
  try {
    var stamped = JSON.parse(text);
    if (stamped && typeof stamped.checksum === 'string') {
      var claimed = stamped.checksum;
      delete stamped.checksum;
      if (backupChecksum(stamped) !== claimed) {
        return { ok: false, error: 'This backup file is damaged or was changed: its checksum does not match its contents.', cards: 0 };
      }
    }
  } catch (e) { /* unparseable: importBackup reports it properly below */ }
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
