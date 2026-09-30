/**
 * flashcardmode.js — Standalone flashcard study session logic
 *
 * Owns session state. Returns structured data, not HTML.
 * The composition layer (main.js) is responsible for:
 *   - Calling storage.finalizeFlashcardSession(summary)
 *   - Rendering UI from the structured data returned here
 *
 * Key contracts (ARCHITECTURE.md §22):
 *   - start(options) begins a session
 *   - getState() returns current session state
 *   - getCurrentCard() returns the current card data
 *   - reveal() reveals the answer
 *   - rate(result) rates 'correct' or 'incorrect'
 *   - complete() finalizes and returns the canonical summary
 *   - startMissedReview() finalizes the primary, starts a child review
 *   - end(reason) ends without completing (abandon)
 *
 * Rules:
 *   - getSummary() is side-effect free
 *   - complete() produces the canonical summary exactly once per session
 *   - startMissedReview() finalizes the primary session first
 *   - Starting a new session when one is unfinalized throws
 *   - Disabled and mode-ineligible cards are excluded
 *   - Flashcard-only raw imports (enabledModes includes 'flashcard') are eligible
 *   - No direct storage writes; produces summaries for the composition layer
 */

import { CARDS, SUBJECTS } from '../cardhub.js';
import { storage } from '../storage.js';
import { customCards } from '../customcards.js';

// --- Helpers ---

function generateSessionId() {
  return 'fc_' + Date.now() + '_' + Math.floor(Math.random() * 100000);
}

/**
 * Check if a card is enabled for flashcard mode.
 * Cards without enabledModes are assumed eligible for all modes.
 * Cards with enabledModes must include 'flashcard' (or the mode is absent,
 * meaning legacy cards are included).
 */
function isCardEligibleForFlashcard(card) {
  if (!card.enabledModes || !Array.isArray(card.enabledModes) || card.enabledModes.length === 0) {
    return true;
  }
  return card.enabledModes.indexOf('flashcard') >= 0;
}

/**
 * Patch missing fields onto custom cards that bypass hub cleanCards().
 */
function patchCardDefaults(c) {
  if (c.exams === undefined) c.exams = [];
  if (c.baseDifficulty === undefined) c.baseDifficulty = 2;
  if (c.questionType === undefined) c.questionType = 'buzzword_dx';
  if (c.source === undefined) c.source = 'clinical_medicine';
  if (c.tags === undefined) c.tags = c.subj ? [c.subj.toLowerCase()] : [];
  if (c.hx === undefined) c.hx = false;
  if (c.yr === undefined) c.yr = 2;
  if (c.pearls === undefined) c.pearls = c.tp ? [c.tp.split('.')[0]] : [];
  return c;
}

/**
 * Build the eligible card pool applying all filters.
 * Returns { cards, error }.
 */
function buildCardPool(options) {
  var subjects = options.subjects;
  var filters = options.filters || {};
  var includeCustomCards = filters.includeCustomCards !== false;

  var customs = includeCustomCards
    ? customCards.getAll().map(patchCardDefaults)
    : [];
  var allCards = CARDS.concat(customs);

  // Explicit card list (study plan, exam review): bypasses subject/filter
  // selection but still respects disabled cards.
  if (Array.isArray(options.cardIds) && options.cardIds.length > 0) {
    var wanted = {};
    options.cardIds.forEach(function (id) { wanted[id] = true; });
    var disabledNow = storage.get('disabledCards') || [];
    return {
      cards: allCards.filter(function (c) { return wanted[c.id] && disabledNow.indexOf(c.id) < 0; }),
      error: null
    };
  }

  // If subjects is empty, use all
  if (!subjects || subjects.length === 0) {
    subjects = SUBJECTS.slice();
  }

  var pool = allCards.filter(function (c) {
    return subjects.indexOf(c.subj) >= 0;
  });

  // Flashcard mode eligibility
  pool = pool.filter(isCardEligibleForFlashcard);

  // Exam filter
  if (filters.exams && Array.isArray(filters.exams) && filters.exams.length > 0) {
    pool = pool.filter(function (c) {
      if (!c.exams || !Array.isArray(c.exams) || c.exams.length === 0) return true;
      for (var i = 0; i < filters.exams.length; i++) {
        if (c.exams.indexOf(filters.exams[i]) >= 0) return true;
      }
      return false;
    });
  }

  // Question type filter
  if (filters.questionTypes && Array.isArray(filters.questionTypes) && filters.questionTypes.length > 0) {
    pool = pool.filter(function (c) {
      if (!c.questionType) return true;
      return filters.questionTypes.indexOf(c.questionType) >= 0;
    });
  }

  // Source filter
  if (filters.sources && Array.isArray(filters.sources) && filters.sources.length > 0) {
    pool = pool.filter(function (c) {
      if (!c.source) return true;
      return filters.sources.indexOf(c.source) >= 0;
    });
  }

  // Year filter
  if (filters.years && Array.isArray(filters.years) && filters.years.length > 0) {
    pool = pool.filter(function (c) {
      if (!c.yr) return true;
      return filters.years.indexOf(c.yr) >= 0;
    });
  }

  // High-yield only
  if (filters.highYieldOnly) {
    pool = pool.filter(function (c) {
      return c.hx === true;
    });
  }

  // Disabled cards
  var disabledCards = storage.get('disabledCards') || [];
  pool = pool.filter(function (c) {
    return disabledCards.indexOf(c.id) < 0;
  });

  if (pool.length === 0) {
    return {
      cards: [],
      error: {
        code: 'NO_MATCHING_CARDS',
        message: 'No cards match the selected filters for flashcard mode.'
      }
    };
  }

  return { cards: pool, error: null };
}

/**
 * Select cards for the session using spaced repetition weighting.
 */
function selectCards(pool, count) {
  var now = Date.now();
  var freshnessWeight = storage.get('cardFreshnessWeight') || 5;

  var weighted = pool.map(function (c) {
    var s = storage.getCardStat(c.id);
    var w = 10;

    // Unseen cards get highest priority
    if (s.seen === 0) {
      w *= freshnessWeight;
    }

    // Poor accuracy cards get higher weight
    if (s.seen > 0) {
      var accuracy = s.correct / s.seen;
      if (accuracy < 0.3) w *= 6;
      else if (accuracy < 0.5) w *= 4;
      else if (accuracy < 0.7) w *= 2;
      else if (accuracy > 0.9 && s.seen > 5) w *= 0.3;
    }

    // Spaced repetition: cards not seen recently get priority
    if (s.lastSeen > 0) {
      var hoursSince = (now - s.lastSeen) / (1000 * 60 * 60);
      if (hoursSince < 1) w *= 0.3;
      else if (hoursSince > 168) w *= 3;
      else if (hoursSince > 72) w *= 2;
      else if (hoursSince > 24) w *= 1.5;
    } else {
      w *= 3;
    }

    return { card: c, weight: Math.max(w, 0.01) };
  });

  var selected = [];
  var limit = Math.min(count || 20, weighted.length);

  for (var pick = 0; pick < limit; pick++) {
    var total = 0;
    for (var i = 0; i < weighted.length; i++) total += weighted[i].weight;
    var r = Math.random() * total;
    var chosen = null;
    var chosenIdx = -1;
    for (var j = 0; j < weighted.length; j++) {
      r -= weighted[j].weight;
      if (r <= 0) {
        chosen = weighted[j];
        chosenIdx = j;
        break;
      }
    }
    if (!chosen) {
      chosen = weighted[weighted.length - 1];
      chosenIdx = weighted.length - 1;
    }
    selected.push(chosen.card);
    weighted.splice(chosenIdx, 1);
    if (weighted.length === 0) break;
  }

  return selected;
}


// --- Session States ---
var SESSION_STATES = {
  IDLE: 'idle',
  ACTIVE: 'active',
  REVEALED: 'revealed',
  COMPLETED: 'completed',
  ENDED: 'ended'
};


// --- FlashcardMode Class ---

export class FlashcardMode {
  constructor() {
    this._reset();
  }

  _reset() {
    this.sessionId = null;
    this.parentSessionId = null;
    this.kind = null; // 'primary' | 'missed_review'
    this.state = SESSION_STATES.IDLE;
    this.cards = [];
    this.currentIndex = 0;
    this.results = []; // { cardId, card, rating, revealedAt, ratedAt }
    this.startedAt = null;
    this.endedAt = null;
    this.finalized = false;
  }

  /**
   * Start a new flashcard session.
   *
   * @param {object} options
   * @param {string} [options.sessionId] - Generated if not provided
   * @param {string|null} [options.parentSessionId] - For missed reviews
   * @param {string[]} options.subjects
   * @param {object} [options.filters]
   * @param {number} [options.cardCount]
   * @param {string} [options.kind] - 'primary' | 'missed_review'
   * @returns {{ success: boolean, error: object|null }}
   */
  start(options) {
    // Prevent silently discarding unfinalized results
    if (this.state === SESSION_STATES.ACTIVE || this.state === SESSION_STATES.REVEALED) {
      return {
        success: false,
        error: {
          code: 'SESSION_ACTIVE',
          message: 'A session is already active. Call complete() or end() first.'
        }
      };
    }

    this._reset();

    options = options || {};
    var poolResult = buildCardPool(options);
    if (poolResult.error) {
      return { success: false, error: poolResult.error };
    }

    var selected = selectCards(poolResult.cards, options.cardCount || 20);
    if (selected.length === 0) {
      return {
        success: false,
        error: {
          code: 'NO_MATCHING_CARDS',
          message: 'No cards available for the selected filters.'
        }
      };
    }

    this.sessionId = options.sessionId || generateSessionId();
    this.parentSessionId = options.parentSessionId || null;
    this.kind = options.kind || 'primary';
    this.cards = selected;
    this.currentIndex = 0;
    this.results = [];
    this.startedAt = Date.now();
    this.endedAt = null;
    this.finalized = false;
    this.state = SESSION_STATES.ACTIVE;

    return { success: true, error: null };
  }

  /**
   * Returns the current session state.
   * @returns {object}
   */
  getState() {
    return {
      sessionId: this.sessionId,
      parentSessionId: this.parentSessionId,
      kind: this.kind,
      state: this.state,
      currentIndex: this.currentIndex,
      totalCards: this.cards.length,
      resultsCount: this.results.length,
      finalized: this.finalized
    };
  }

  /**
   * Returns structured data for the current card.
   * Does NOT return HTML.
   *
   * @returns {object|null}
   */
  getCurrentCard() {
    if (this.state !== SESSION_STATES.ACTIVE && this.state !== SESSION_STATES.REVEALED) {
      return null;
    }
    if (this.currentIndex >= this.cards.length) {
      return null;
    }

    var card = this.cards[this.currentIndex];
    return {
      index: this.currentIndex,
      total: this.cards.length,
      cardId: card.id,
      subject: card.subj,
      buzzwords: card.bw,
      baseDifficulty: card.baseDifficulty || 2,
      exams: card.exams || [],
      questionType: card.questionType || 'buzzword_dx',
      revealed: this.state === SESSION_STATES.REVEALED
    };
  }

  /**
   * Reveal the answer for the current card.
   * Returns structured answer data, NOT HTML.
   *
   * @returns {object|null}
   */
  reveal() {
    if (this.state !== SESSION_STATES.ACTIVE) {
      return null;
    }
    if (this.currentIndex >= this.cards.length) {
      return null;
    }

    this.state = SESSION_STATES.REVEALED;

    var card = this.cards[this.currentIndex];
    var whyWrong = [];
    if (card.ww) {
      for (var key in card.ww) {
        if (Object.prototype.hasOwnProperty.call(card.ww, key)) {
          whyWrong.push({
            distractor: key,
            explanation: card.ww[key]
          });
        }
      }
    }

    return {
      cardId: card.id,
      answer: card.ans,
      teachingPoint: card.tp,
      distractors: card.d || [],
      whyWrong: whyWrong,
      pearls: card.pearls || [],
      exception: card.exception || null
    };
  }

  /**
   * Rate the current card after reveal.
   *
   * @param {'correct'|'incorrect'} result
   * @returns {boolean} true if rating was accepted
   */
  rate(result) {
    if (this.state !== SESSION_STATES.REVEALED) {
      return false;
    }
    if (result !== 'correct' && result !== 'incorrect') {
      return false;
    }
    if (this.currentIndex >= this.cards.length) {
      return false;
    }

    var card = this.cards[this.currentIndex];
    this.results.push({
      cardId: card.id,
      card: card,
      rating: result,
      revealedAt: Date.now(),
      ratedAt: Date.now()
    });

    this.currentIndex++;

    // If more cards remain, go back to ACTIVE
    if (this.currentIndex < this.cards.length) {
      this.state = SESSION_STATES.ACTIVE;
    } else {
      // All cards answered — still ACTIVE until complete() is called
      this.state = SESSION_STATES.ACTIVE;
    }

    return true;
  }

  /**
   * Check if all cards have been rated.
   * @returns {boolean}
   */
  isComplete() {
    return this.currentIndex >= this.cards.length;
  }

  /**
   * Get progress info. Side-effect free.
   * @returns {object}
   */
  getProgress() {
    var correct = 0;
    var wrong = 0;
    for (var i = 0; i < this.results.length; i++) {
      if (this.results[i].rating === 'correct') correct++;
      else wrong++;
    }
    return {
      current: Math.min(this.currentIndex + 1, this.cards.length),
      total: this.cards.length,
      correctSoFar: correct,
      wrongSoFar: wrong
    };
  }

  /**
   * Get the canonical session summary. Side-effect free.
   * Can be called multiple times safely.
   *
   * @returns {object}
   */
  getSummary() {
    var correct = 0;
    var wrong = 0;
    var cardResults = [];

    for (var i = 0; i < this.results.length; i++) {
      var r = this.results[i];
      if (r.rating === 'correct') correct++;
      else wrong++;

      cardResults.push({
        cardId: r.cardId,
        subject: r.card.subj,
        rating: r.rating,
        ratedAt: r.ratedAt
      });
    }

    var total = correct + wrong;
    var endTime = this.endedAt || Date.now();

    return {
      sessionId: this.sessionId,
      parentSessionId: this.parentSessionId,
      kind: this.kind,
      startedAt: this.startedAt,
      endedAt: endTime,
      durationMs: endTime - this.startedAt,
      total: total,
      correct: correct,
      wrong: wrong,
      accuracy: total > 0 ? Math.round(correct / total * 100) : 0,
      cardResults: cardResults
    };
  }

  /**
   * Get missed cards from the session.
   * @returns {object[]} Array of { cardId, card }
   */
  getMissedCards() {
    return this.results
      .filter(function (r) { return r.rating === 'incorrect'; })
      .map(function (r) { return { cardId: r.cardId, card: r.card }; });
  }

  /**
   * Complete the session. Returns the canonical summary.
   * This is the signal to the composition layer to call
   * storage.finalizeFlashcardSession(summary).
   *
   * Can only be called once per session.
   *
   * @returns {{ success: boolean, summary: object|null, error: object|null }}
   */
  complete() {
    if (this.finalized) {
      return {
        success: false,
        summary: null,
        error: { code: 'ALREADY_FINALIZED', message: 'Session already finalized.' }
      };
    }

    if (this.state === SESSION_STATES.IDLE || this.state === SESSION_STATES.ENDED) {
      return {
        success: false,
        summary: null,
        error: { code: 'NO_ACTIVE_SESSION', message: 'No active session to complete.' }
      };
    }

    this.endedAt = Date.now();
    this.finalized = true;
    this.state = SESSION_STATES.COMPLETED;

    return {
      success: true,
      summary: this.getSummary(),
      error: null
    };
  }

  /**
   * Start a missed-card review. Finalizes the primary session first.
   *
   * @returns {{ success: boolean, summary: object|null, error: object|null }}
   *   summary is the finalized primary session summary (for the caller to persist).
   */
  startMissedReview() {
    // Must finalize primary first
    var primarySummary = null;
    if (!this.finalized) {
      var completeResult = this.complete();
      if (!completeResult.success) {
        return {
          success: false,
          summary: null,
          error: completeResult.error
        };
      }
      primarySummary = completeResult.summary;
    } else {
      primarySummary = this.getSummary();
    }

    var missed = this.getMissedCards();
    if (missed.length === 0) {
      return {
        success: false,
        summary: primarySummary,
        error: { code: 'NO_MISSED_CARDS', message: 'No missed cards to review.' }
      };
    }

    var parentId = this.sessionId;
    var missedCardObjects = missed.map(function (m) { return m.card; });

    // Reset for child session
    this._reset();

    this.sessionId = generateSessionId();
    this.parentSessionId = parentId;
    this.kind = 'missed_review';
    this.cards = missedCardObjects;
    this.currentIndex = 0;
    this.results = [];
    this.startedAt = Date.now();
    this.endedAt = null;
    this.finalized = false;
    this.state = SESSION_STATES.ACTIVE;

    return {
      success: true,
      summary: primarySummary,
      error: null
    };
  }

  /**
   * End the session without completing (abandon).
   * Returns a summary of what was answered so far, but does NOT
   * mark the session as finalized for persistence.
   *
   * @param {string} [reason]
   * @returns {object} summary of partial results
   */
  end(reason) {
    this.endedAt = Date.now();
    var summary = this.getSummary();
    this.state = SESSION_STATES.ENDED;
    // Note: not setting finalized = true; this is an abandonment, not a completion.
    // The composition layer decides whether to persist an abandoned session.
    this._reset();
    return summary;
  }
}
