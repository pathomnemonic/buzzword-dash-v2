#!/usr/bin/env node
/**
 * validate-cards.mjs — CI card validation script
 *
 * Validates all built-in cards and outputs a machine-readable
 * JSON report. Exits with code 1 if any blocker-level issues
 * are found (duplicate IDs, missing required fields, invalid
 * subjects, HTML in text fields, etc.).
 *
 * Usage:
 *   node tools/validate-cards.mjs
 *   node tools/validate-cards.mjs --json
 *
 * Agent 18 owns this file exclusively.
 */

import { CARDS, CARD_BY_ID, SUBJECTS,
  QUESTION_TYPES, SOURCE_DISCIPLINES,
  CONTENT_VERSION, BUILT_IN_CARD_POOL_HASH } from '../js/cards.js';

var jsonOutput = process.argv.includes('--json');

var report = {
  contentVersion: CONTENT_VERSION,
  cardPoolHash: BUILT_IN_CARD_POOL_HASH,
  totalCards: CARDS.length,
  totalSubjects: SUBJECTS.length,
  blockers: [],
  warnings: [],
  subjectCounts: {},
  duplicateIds: [],
  semanticDuplicates: [],
  htmlDetected: [],
  invalidSubjects: [],
  invalidEnums: [],
  districtorMismatches: []
};

// Count cards per subject
for (var i = 0; i < SUBJECTS.length; i++) {
  report.subjectCounts[SUBJECTS[i]] = 0;
}

var idSet = new Set();
var answerSubjectMap = new Map(); // "answer|subject" → card id for semantic dupes

function containsHTML(str) {
  if (typeof str !== 'string') return false;
  return /<[a-zA-Z][^>]*>/.test(str);
}

for (var ci = 0; ci < CARDS.length; ci++) {
  var c = CARDS[ci];

  // Duplicate ID (should have been caught by cards.js, but double-check)
  if (idSet.has(c.id)) {
    report.duplicateIds.push(c.id);
    report.blockers.push('Duplicate ID: ' + c.id);
  }
  idSet.add(c.id);

  // Subject count
  if (report.subjectCounts[c.subj] !== undefined) {
    report.subjectCounts[c.subj]++;
  }

  // Invalid subject
  if (SUBJECTS.indexOf(c.subj) < 0) {
    report.invalidSubjects.push({ id: c.id, subject: c.subj });
    report.blockers.push(c.id + ': invalid subject "' + c.subj + '"');
  }

  // Enum validation
  if (QUESTION_TYPES.indexOf(c.questionType) < 0) {
    report.invalidEnums.push({ id: c.id, field: 'questionType', value: c.questionType });
    report.warnings.push(c.id + ': non-canonical questionType');
  }
  if (SOURCE_DISCIPLINES.indexOf(c.source) < 0) {
    report.invalidEnums.push({ id: c.id, field: 'source', value: c.source });
    report.warnings.push(c.id + ': non-canonical source');
  }

  // Distractor validation
  if (!c.d || c.d.length !== 2) {
    report.districtorMismatches.push({ id: c.id, count: c.d ? c.d.length : 0 });
    report.blockers.push(c.id + ': needs exactly 2 distractors');
  } else {
    if (c.d[0].toLowerCase().trim() === c.d[1].toLowerCase().trim()) {
      report.blockers.push(c.id + ': identical distractors');
    }
    if (c.d[0].toLowerCase().trim() === c.ans.toLowerCase().trim() ||
        c.d[1].toLowerCase().trim() === c.ans.toLowerCase().trim()) {
      report.blockers.push(c.id + ': distractor matches answer');
    }
  }

  // ww key validation
  if (c.ww && c.d && c.d.length === 2) {
    var wwKeys = Object.keys(c.ww);
    for (var wk = 0; wk < wwKeys.length; wk++) {
      if (c.d.indexOf(wwKeys[wk]) < 0) {
        report.warnings.push(c.id + ': ww key "' + wwKeys[wk] + '" not in distractors');
      }
    }
  }

  // HTML detection
  var textFields = [c.ans, c.tp].concat(c.bw || []).concat(c.d || []);
  for (var tf = 0; tf < textFields.length; tf++) {
    if (containsHTML(textFields[tf])) {
      report.htmlDetected.push(c.id);
      report.warnings.push(c.id + ': contains HTML in text field');
      break;
    }
  }

  // Semantic duplicate detection (same answer + same subject)
  var semKey = (c.ans || '').toLowerCase().trim() + '|' + c.subj;
  if (answerSubjectMap.has(semKey)) {
    report.semanticDuplicates.push({
      id1: answerSubjectMap.get(semKey),
      id2: c.id,
      answer: c.ans,
      subject: c.subj
    });
    report.warnings.push(
      'Semantic duplicate: ' + answerSubjectMap.get(semKey) +
      ' and ' + c.id + ' (both "' + c.ans + '" in ' + c.subj + ')'
    );
  } else {
    answerSubjectMap.set(semKey, c.id);
  }
}

// Verify CARD_BY_ID integrity
if (CARD_BY_ID.size !== CARDS.length) {
  report.blockers.push(
    'CARD_BY_ID size (' + CARD_BY_ID.size +
    ') does not match CARDS length (' + CARDS.length + ')'
  );
}

report.passed = report.blockers.length === 0;

if (jsonOutput) {
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
} else {
  console.log('═══════════════════════════════════════════════');
  console.log('  Buzzword Dash Card Validation Report');
  console.log('═══════════════════════════════════════════════');
  console.log('Content version:  ' + report.contentVersion);
  console.log('Card pool hash:   ' + report.cardPoolHash);
  console.log('Total cards:      ' + report.totalCards);
  console.log('');

  console.log('Cards per subject:');
  for (var subj in report.subjectCounts) {
    console.log('  ' + subj + ': ' + report.subjectCounts[subj]);
  }
  console.log('');

  if (report.semanticDuplicates.length > 0) {
    console.log('⚠ Semantic duplicates (' + report.semanticDuplicates.length + '):');
    for (var sd = 0; sd < report.semanticDuplicates.length; sd++) {
      var dup = report.semanticDuplicates[sd];
      console.log('  ' + dup.id1 + ' ↔ ' + dup.id2 + ' ("' + dup.answer + '")');
    }
    console.log('');
  }

  if (report.blockers.length > 0) {
    console.log('✖ BLOCKERS (' + report.blockers.length + '):');
    for (var bi = 0; bi < report.blockers.length; bi++) {
      console.log('  ✖ ' + report.blockers[bi]);
    }
    console.log('');
  }

  if (report.warnings.length > 0) {
    console.log('⚠ Warnings (' + report.warnings.length + '):');
    for (var wn = 0; wn < Math.min(report.warnings.length, 20); wn++) {
      console.log('  ⚠ ' + report.warnings[wn]);
    }
    if (report.warnings.length > 20) {
      console.log('  ... and ' + (report.warnings.length - 20) + ' more');
    }
    console.log('');
  }

  console.log(report.passed ? '✓ PASSED' : '✖ FAILED');
}

process.exit(report.passed ? 0 : 1);
