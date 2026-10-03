/**
 * uistudy.js — Flashcard study, study picker and plan, hands-free mode.
 *
 * Split out of ui.js. These methods are attached to UI.prototype (see the end of ui.js), so
 * `this` is the UI controller and nothing about how they are called has changed.
 */

import { setText, createElement, clearElement } from './dom.js';
import { SUBJECTS } from './cardhub.js';
import { canSpeak, cancelSpeech } from './tts.js';
import { storage } from './storage.js';

export var studyMethods = {

  renderFlashcardScreen() {
    var container = document.getElementById('flashcardContent');
    if (!container) return;
    clearElement(container);
    var self = this;
    var fm = this.flashcardMode;

    if (this._hf && (this._hf.active || this._hf.finished)) {
      this._renderHandsFree(container);
      return;
    }

    if (!this._flashcardActive()) {
      this._renderStudyPicker(container);
      return;
    }

    if (fm.isComplete()) {
      if (fm.state !== 'completed') {
        var done = fm.complete();
        if (done.success) this._persistFlashcardSummary(done.summary);
      }
      this._renderFlashcardSummary(container);
      return;
    }

    var progress = fm.getProgress();
    var card = fm.getCurrentCard();

    // Progress bar
    var progressWrap = createElement('div');
    progressWrap.style.cssText = 'text-align:center;margin-bottom:10px';
    var label = (fm.kind === 'missed_review' ? 'Missed review — ' : '') + 'Card ' + progress.current + ' of ' + progress.total;
    progressWrap.appendChild(this._flashcardText('div', label, 'font-size:11px;color:var(--text-muted)'));

    var barOuter = createElement('div', { className: 'fc-progress-bar' });
    barOuter.style.margin = '6px 0';
    var barInner = createElement('div', { className: 'fc-progress-fill' });
    barInner.style.width = Math.round((progress.current - 1) / progress.total * 100) + '%';
    barOuter.appendChild(barInner);
    progressWrap.appendChild(barOuter);
    progressWrap.appendChild(this._flashcardText('div', '✅ ' + progress.correctSoFar + ' | ❌ ' + progress.wrongSoFar, 'font-size:10px;color:var(--text-muted)'));
    container.appendChild(progressWrap);

    // Card display area (structured data, rendered as text only)
    var cardArea = createElement('div');
    cardArea.style.cssText = 'background:var(--bg-card-solid);border-radius:var(--radius-lg);padding:20px;text-align:center;border:var(--border-glow)';
    cardArea.appendChild(this._flashcardText('div', card.subject, 'font-size:10px;color:var(--text-muted);margin-bottom:8px'));
    card.buzzwords.forEach(function (bw) {
      cardArea.appendChild(self._flashcardText('div', '• ' + bw, 'font-size:16px;font-weight:700;margin:4px 0'));
    });

    if (!card.revealed) {
      var revealBtn = createElement('button', { className: 'btn btn-primary btn-block', text: 'Show Answer', attributes: { id: 'fcRevealBtn' } });
      revealBtn.style.marginTop = '16px';
      revealBtn.addEventListener('click', function () {
        self._flashcardAnswer = fm.reveal();
        self.renderFlashcardScreen();
      });
      cardArea.appendChild(revealBtn);
    } else {
      var ans = this._flashcardAnswer || fm.reveal() || {};
      var answerArea = createElement('div');
      answerArea.style.marginTop = '12px';
      answerArea.appendChild(this._flashcardText('div', '✓ ' + ans.answer, 'font-size:18px;font-weight:800;color:var(--accent-green);margin-bottom:6px'));
      if (ans.teachingPoint) {
        answerArea.appendChild(this._flashcardText('p', ans.teachingPoint, 'font-size:12px;color:var(--text-secondary);margin:6px 0'));
      }
      (ans.whyWrong || []).forEach(function (w) {
        answerArea.appendChild(self._flashcardText('div', '✗ ' + w.distractor + ': ' + w.explanation, 'font-size:11px;color:var(--text-muted);margin:2px 0'));
      });
      cardArea.appendChild(answerArea);

      var btnRow = createElement('div');
      btnRow.style.cssText = 'display:flex;gap:8px;margin-top:16px';
      var gotItBtn = createElement('button', { className: 'btn btn-green', text: '✅ Got it (→)', attributes: { id: 'fcGotBtn' } });
      gotItBtn.style.flex = '1';
      gotItBtn.addEventListener('click', function () { fm.rate('correct'); self._flashcardAnswer = null; self.renderFlashcardScreen(); });
      btnRow.appendChild(gotItBtn);

      var missedBtn = createElement('button', { className: 'btn btn-red', text: '❌ Missed it (←)', attributes: { id: 'fcMissBtn' } });
      missedBtn.style.flex = '1';
      missedBtn.addEventListener('click', function () { fm.rate('incorrect'); self._flashcardAnswer = null; self.renderFlashcardScreen(); });
      btnRow.appendChild(missedBtn);
      cardArea.appendChild(btnRow);
    }

    container.appendChild(cardArea);

    var endBtn = createElement('button', { className: 'btn btn-outline btn-block', text: '✕ End Session' });
    endBtn.style.marginTop = '10px';
    endBtn.addEventListener('click', function () { self._endFlashcardSession(); self.show('screenHome'); });
    container.appendChild(endBtn);
  },

  _renderFlashcardSummary(container) {
    var self = this;
    var fm = this.flashcardMode;
    var summary = fm.getSummary();
    var missed = fm.getMissedCards();

    var header = createElement('div');
    header.style.cssText = 'text-align:center;padding:16px 0';
    header.appendChild(createElement('h2', { text: '📋 Session Complete' }));

    var statsRow = createElement('div', { className: 'post-stats' });
    statsRow.style.margin = '10px 0';
    [
      { val: summary.correct, label: 'Correct', color: 'var(--accent-green)' },
      { val: summary.wrong, label: 'Missed', color: 'var(--accent-red)' },
      { val: summary.accuracy + '%', label: 'Accuracy' }
    ].forEach(function (s) {
      var stat = createElement('div', { className: 'post-stat' });
      var valEl = createElement('div', { className: 'val', text: String(s.val) });
      if (s.color) valEl.style.color = s.color;
      stat.appendChild(valEl);
      stat.appendChild(createElement('div', { className: 'label', text: s.label }));
      statsRow.appendChild(stat);
    });
    header.appendChild(statsRow);
    container.appendChild(header);

    // Missed cards
    if (missed.length > 0) {
      container.appendChild(createElement('h3', { text: '❌ Missed Cards' }));
      container.lastChild.style.cssText = 'margin:10px 0 6px';

      missed.forEach(function (r) {
        var card = createElement('div', { className: 'review-card' });
        var h4 = createElement('h4');
        setText(h4, '❌ ' + r.card.bw.join(' • '));
        card.appendChild(h4);

        var tagRow = createElement('div');
        var ansTag = createElement('span', { className: 'tag tag-correct' });
        setText(ansTag, '✓ ' + r.card.ans);
        tagRow.appendChild(ansTag);
        var subjTag = createElement('span', { className: 'tag tag-subject' });
        setText(subjTag, r.card.subj);
        tagRow.appendChild(subjTag);
        card.appendChild(tagRow);

        var tp = createElement('p');
        setText(tp, r.card.tp);
        tp.style.cssText = 'margin-top:4px;font-size:11px;color:var(--text-secondary)';
        card.appendChild(tp);

        container.appendChild(card);
      });
    } else {
      container.appendChild(createElement('h3', { text: '🎉 Perfect Session!' }));
      container.lastChild.style.cssText = 'margin:10px 0 6px;color:var(--accent-green)';
    }

    // Action buttons
    var actionRow = createElement('div');
    actionRow.style.cssText = 'display:flex;gap:6px;margin-top:14px';

    if (missed.length > 0) {
      var reviewBtn = createElement('button', { className: 'btn btn-primary', text: '🔄 Review Missed' });
      reviewBtn.style.flex = '1';
      reviewBtn.addEventListener('click', function () {
        var res = fm.startMissedReview();
        if (!res.success) self._showToast((res.error && res.error.message) || 'Could not start review.');
        self.renderFlashcardScreen();
      });
      actionRow.appendChild(reviewBtn);
    }

    var newBtn = createElement('button', { className: 'btn btn-green', text: '📖 New Session' });
    newBtn.style.flex = '1';
    newBtn.addEventListener('click', function () { self._endFlashcardSession(); self.startFlashcardSession(); });
    actionRow.appendChild(newBtn);
    container.appendChild(actionRow);

    var homeBtn = createElement('button', { className: 'btn btn-outline btn-block', text: '🏠 Home' });
    homeBtn.style.marginTop = '6px';
    homeBtn.addEventListener('click', function () { self._endFlashcardSession(); self.show('screenHome'); });
    container.appendChild(homeBtn);
  },

  /** "What do you want to study?" for flashcards and hands-free audio: pick the cards, then the way. */
  _renderStudyPicker(container) {
    var self = this;
    var pools = this._pickerPools();
    var pick = this._fcPick || (this._fcPick = { source: 'mine', subjects: [], count: 20 });
    var wrap = createElement('div');
    wrap.className = 'study-picker';

    wrap.appendChild(this._flashcardText('h3', 'What do you want to study?', 'font-size:16px;margin:6px 0 4px'));
    wrap.appendChild(this._flashcardText('p', 'Choose the cards, then how to study them: flip cards yourself, or listen hands-free.', 'font-size:12px;color:var(--text-secondary);margin-bottom:10px'));

    var sources = [
      ['mine', '🎯 My subjects', pools.mine.length + ' subject' + (pools.mine.length === 1 ? '' : 's') + ' chosen in Home. A random mix.'],
      ['due', '⏰ Due for review', pools.due.length + ' card' + (pools.due.length === 1 ? '' : 's') + ' ready to see again (most overdue first).'],
      ['missed', '🩹 Cards I miss', pools.missed.length + ' card' + (pools.missed.length === 1 ? '' : 's') + ' you get wrong the most.'],
      ['fresh', '🆕 New cards', pools.fresh.length + ' card' + (pools.fresh.length === 1 ? '' : 's') + ' you have not seen yet.'],
      ['subjects', '📚 Pick subjects', 'Choose exactly which subjects to study.']
    ];
    var list = createElement('div');
    list.className = 'pick-list';
    var detail = createElement('div');
    var renderDetail = function () {
      clearElement(detail);
      if (pick.source !== 'subjects') return;
      var chips = createElement('div');
      chips.className = 'pick-chips';
      SUBJECTS.forEach(function (s) {
        var on = pick.subjects.indexOf(s) >= 0;
        var chip = createElement('button', { className: 'pick-chip' + (on ? ' on' : ''), text: s, attributes: { type: 'button', 'aria-pressed': on ? 'true' : 'false' } });
        chip.addEventListener('click', function () {
          var i = pick.subjects.indexOf(s);
          if (i >= 0) pick.subjects.splice(i, 1); else pick.subjects.push(s);
          chip.classList.toggle('on', i < 0);
          chip.setAttribute('aria-pressed', i < 0 ? 'true' : 'false');
        });
        chips.appendChild(chip);
      });
      detail.appendChild(chips);
    };
    sources.forEach(function (src) {
      var btn = createElement('button', { className: 'pick-source' + (pick.source === src[0] ? ' on' : ''), attributes: { type: 'button', 'aria-pressed': pick.source === src[0] ? 'true' : 'false' } });
      btn.appendChild(self._flashcardText('strong', src[1]));
      btn.appendChild(self._flashcardText('span', src[2]));
      btn.addEventListener('click', function () {
        pick.source = src[0];
        list.querySelectorAll('.pick-source').forEach(function (el) { el.classList.remove('on'); el.setAttribute('aria-pressed', 'false'); });
        btn.classList.add('on');
        btn.setAttribute('aria-pressed', 'true');
        renderDetail();
      });
      list.appendChild(btn);
    });
    wrap.appendChild(list);
    renderDetail();
    wrap.appendChild(detail);

    wrap.appendChild(this._flashcardText('div', 'How many cards?', 'font-size:12px;font-weight:700;margin:12px 0 4px'));
    var counts = createElement('div');
    counts.className = 'pick-chips';
    [10, 20, 40, 80].forEach(function (n) {
      var chip = createElement('button', { className: 'pick-chip' + (pick.count === n ? ' on' : ''), text: String(n), attributes: { type: 'button', 'aria-pressed': pick.count === n ? 'true' : 'false' } });
      chip.addEventListener('click', function () {
        pick.count = n;
        counts.querySelectorAll('.pick-chip').forEach(function (el) { el.classList.remove('on'); el.setAttribute('aria-pressed', 'false'); });
        chip.classList.add('on');
        chip.setAttribute('aria-pressed', 'true');
      });
      counts.appendChild(chip);
    });
    wrap.appendChild(counts);

    // Resolve the choice into subjects / explicit card ids, or explain what is missing
    var resolve = function () {
      var p = self._pickerPools();
      if (pick.source === 'due') return p.due.length ? { ids: p.due.slice(0, pick.count) } : { error: 'Nothing is due yet. Play a few runs or flashcards first, and cards will come back here.' };
      if (pick.source === 'missed') return p.missed.length ? { ids: p.missed.slice(0, pick.count) } : { error: 'No missed cards yet. Cards you get wrong will show up here.' };
      if (pick.source === 'fresh') return p.fresh.length ? { ids: p.fresh.sort(function () { return Math.random() - 0.5; }).slice(0, pick.count) } : { error: 'You have seen every card in your subjects.' };
      if (pick.source === 'subjects') return pick.subjects.length ? { subjects: pick.subjects.slice() } : { error: 'Pick at least one subject above.' };
      return { subjects: null };
    };

    var go = createElement('div');
    go.style.cssText = 'display:flex;gap:8px;margin-top:14px';
    var flip = createElement('button', { className: 'btn btn-green', text: '📖 Flip cards', attributes: { type: 'button' } });
    flip.style.flex = '1';
    flip.addEventListener('click', function () {
      var r = resolve();
      if (r.error) { self._showToast(r.error); return; }
      self.startFlashcardSession(r.subjects, r.ids || null, pick.count);
    });
    var listen = createElement('button', { className: 'btn btn-outline', text: '🎧 Listen hands-free', attributes: { type: 'button' } });
    listen.style.flex = '1';
    listen.addEventListener('click', function () {
      var r = resolve();
      if (r.error) { self._showToast(r.error); return; }
      self.startHandsFree(r.subjects, r.ids || null, pick.count);
    });
    go.appendChild(flip);
    go.appendChild(listen);
    wrap.appendChild(go);

    var back = createElement('button', { className: 'btn btn-outline btn-block', text: '🏠 Back to Home', attributes: { type: 'button' } });
    back.style.marginTop = '8px';
    back.addEventListener('click', function () { self.show('screenHome'); });
    wrap.appendChild(back);
    container.appendChild(wrap);
  },

  startFlashcardSession(subjects, cardIds, count) {
    var subjs = subjects || storage.get('selectedSubjects');
    if (!subjs || subjs.length === 0) subjs = SUBJECTS.slice();
    var fm = this.flashcardMode;
    // Abandon any leftover session so a new one can start.
    if (fm.state === 'active' || fm.state === 'revealed') this._endFlashcardSession();
    var result = fm.start({
      subjects: subjs,
      cardIds: cardIds || null,
      cardCount: count || 20,
      filters: {
        exams: storage.get('selectedExams') || [],
        questionTypes: storage.get('selectedQuestionTypes') || [],
        sources: storage.get('selectedSources') || [],
        years: storage.get('selectedYears') || []
      }
    });
    if (!result.success) {
      this._showToast((result.error && result.error.message) || 'No cards available for the selected filters.');
      return;
    }
    this.show('screenFlashcard');
    this.renderFlashcardScreen();
  },

  startHandsFree(subjects, cardIds, count) {
    if (!canSpeak()) {
      this._showToast('This device has no voice to read with. Try another browser, or check the phone\'s text-to-speech settings.');
      return;
    }
    var subjs = subjects || storage.get('selectedSubjects');
    if (!subjs || subjs.length === 0) subjs = SUBJECTS.slice();
    var fm = this.flashcardMode;
    if (fm.state === 'active' || fm.state === 'revealed') this._endFlashcardSession();
    this._hfLast = { subjects: subjects || null, cardIds: cardIds || null, count: count || 20 };
    var result = fm.start({
      subjects: subjs,
      cardIds: cardIds || null,
      cardCount: count || 20,
      filters: {
        exams: storage.get('selectedExams') || [],
        questionTypes: storage.get('selectedQuestionTypes') || [],
        sources: storage.get('selectedSources') || [],
        years: storage.get('selectedYears') || []
      }
    });
    if (!result.success) {
      this._showToast((result.error && result.error.message) || 'No cards available for the selected filters.');
      return;
    }
    var cards = fm.cards.slice();
    fm.end('handsfree'); // only borrowed the card selection
    this._hf = { active: true, finished: false, cancel: false, index: 0, phase: 'clue', cards: cards, heard: 0, last: this._hfLast };
    this.show('screenFlashcard');
    this._runHandsFree();
  },

  stopHandsFree() {
    if (!this._hf) return;
    this._hf.cancel = true;
    cancelSpeech();
    if (this._hf.wake) this._hf.wake();
  },
};
