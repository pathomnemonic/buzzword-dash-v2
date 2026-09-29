#!/usr/bin/env node
/**
 * audit-content.mjs — Content audit and quality reporting
 *
 * Generates a detailed quality report across the built-in card
 * database, including coverage gaps, difficulty distribution,
 * question type distribution, and content staleness.
 *
 * Usage:
 *   node tools/audit-content.mjs
 *   node tools/audit-content.mjs --json
 *
 * Agent 18 owns this file exclusively.
 */

import { CARDS, SUBJECTS, EXAM_FILTERS, QUESTION_TYPES,
  SOURCE_DISCIPLINES, CONTENT_VERSION,
  BUILT_IN_CARD_POOL_HASH } from '../js/cards.js';

var jsonOutput = process.argv.includes('--json');

var audit = {
  contentVersion: CONTENT_VERSION,
  cardPoolHash: BUILT_IN_CARD_POOL_HASH,
  totalCards: CARDS.length,
  coverage: {},
  difficultyDistribution: { 1: 0, 2: 0, 3: 0 },
  questionTypeDistribution: {},
  sourceDistribution: {},
  examCoverage: {},
  yearDistribution: { 1: 0, 2: 0, 3: 0, 4: 0 },
  highYieldCount: 0,
  averageBuzzwordsPerCard: 0,
  cardsWithoutTeachingPoint: 0,
  cardsWithoutWhyWrong: 0,
  cardsWithPearls: 0,
  gaps: []
};

// Initialize counters
for (var si = 0; si < SUBJECTS.length; si++) {
  audit.coverage[SUBJECTS[si]] = 0;
}
for (var qi = 0; qi < QUESTION_TYPES.length; qi++) {
  audit.questionTypeDistribution[QUESTION_TYPES[qi]] = 0;
}
for (var sdi = 0; sdi < SOURCE_DISCIPLINES.length; sdi++) {
  audit.sourceDistribution[SOURCE_DISCIPLINES[sdi]] = 0;
}
for (var efi = 0; efi < EXAM_FILTERS.length; efi++) {
  audit.examCoverage[EXAM_FILTERS[efi]] = 0;
}

var totalBuzzwords = 0;

for (var ci = 0; ci < CARDS.length; ci++) {
  var c = CARDS[ci];

  // Subject coverage
  if (audit.coverage[c.subj] !== undefined) {
    audit.coverage[c.subj]++;
  }

  // Difficulty
  if (audit.difficultyDistribution[c.baseDifficulty] !== undefined) {
    audit.difficultyDistribution[c.baseDifficulty]++;
  }

  // Question type
  if (audit.questionTypeDistribution[c.questionType] !== undefined) {
    audit.questionTypeDistribution[c.questionType]++;
  }

  // Source
  if (audit.sourceDistribution[c.source] !== undefined) {
    audit.sourceDistribution[c.source]++;
  }

  // Exam coverage
  if (c.exams) {
    for (var ei = 0; ei < c.exams.length; ei++) {
      if (audit.examCoverage[c.exams[ei]] !== undefined) {
        audit.examCoverage[c.exams[ei]]++;
      }
    }
  }

  // Year
  if (audit.yearDistribution[c.yr] !== undefined) {
    audit.yearDistribution[c.yr]++;
  }

  // High yield
  if (c.hx) audit.highYieldCount++;

  // Buzzwords
  totalBuzzwords += (c.bw ? c.bw.length : 0);

  // Teaching point
  if (!c.tp || c.tp.trim() === '') audit.cardsWithoutTeachingPoint++;

  // Why wrong
  if (!c.ww || Object.keys(c.ww).length === 0) audit.cardsWithoutWhyWrong++;

  // Pearls
  if (c.pearls && c.pearls.length > 0 && c.pearls[0] !== '') audit.cardsWithPearls++;
}

audit.averageBuzzwordsPerCard = CARDS.length > 0 ?
  Math.round((totalBuzzwords / CARDS.length) * 10) / 10 : 0;

// Identify coverage gaps
for (var subj in audit.coverage) {
  if (audit.coverage[subj] < 20) {
    audit.gaps.push({
      type: 'low_coverage',
      subject: subj,
      count: audit.coverage[subj],
      recommendation: 'Subject "' + subj + '" has only ' +
        audit.coverage[subj] + ' cards (minimum recommended: 20)'
    });
  }
}

// Check exam coverage gaps
for (var exam in audit.examCoverage) {
  if (audit.examCoverage[exam] < 10) {
    audit.gaps.push({
      type: 'exam_gap',
      exam: exam,
      count: audit.examCoverage[exam],
      recommendation: 'Exam filter "' + exam + '" only matches ' +
        audit.examCoverage[exam] + ' cards'
    });
  }
}

if (jsonOutput) {
  process.stdout.write(JSON.stringify(audit, null, 2) + '\n');
} else {
  console.log('═══════════════════════════════════════════════');
  console.log('  Buzzword Dash Content Audit Report');
  console.log('═══════════════════════════════════════════════');
  console.log('Content version:  ' + audit.contentVersion);
  console.log('Card pool hash:   ' + audit.cardPoolHash);
  console.log('Total cards:      ' + audit.totalCards);
  console.log('High yield:       ' + audit.highYieldCount);
  console.log('Avg buzzwords:    ' + audit.averageBuzzwordsPerCard);
  console.log('With pearls:      ' + audit.cardsWithPearls);
  console.log('Missing TP:       ' + audit.cardsWithoutTeachingPoint);
  console.log('Missing WW:       ' + audit.cardsWithoutWhyWrong);
  console.log('');

  console.log('Subject coverage:');
  for (var s in audit.coverage) {
    var bar = '';
    var count = audit.coverage[s];
    for (var b = 0; b < Math.min(Math.round(count / 2), 50); b++) bar += '█';
    console.log('  ' + s.padEnd(25) + bar + ' ' + count);
  }
  console.log('');

  console.log('Difficulty distribution:');
  console.log('  Easy (1):   ' + audit.difficultyDistribution[1]);
  console.log('  Medium (2): ' + audit.difficultyDistribution[2]);
  console.log('  Hard (3):   ' + audit.difficultyDistribution[3]);
  console.log('');

  console.log('Question types:');
  for (var qt in audit.questionTypeDistribution) {
    console.log('  ' + qt.padEnd(20) + audit.questionTypeDistribution[qt]);
  }
  console.log('');

  if (audit.gaps.length > 0) {
    console.log('⚠ Gaps identified (' + audit.gaps.length + '):');
    for (var gi = 0; gi < audit.gaps.length; gi++) {
      console.log('  ⚠ ' + audit.gaps[gi].recommendation);
    }
  } else {
    console.log('✓ No coverage gaps identified');
  }
}
