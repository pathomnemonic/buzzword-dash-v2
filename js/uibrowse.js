/**
 * uibrowse.js — Card browser and custom card list.
 *
 * Split out of ui.js. These methods are attached to UI.prototype (see the end of ui.js), so
 * `this` is the UI controller and nothing about how they are called has changed.
 */

import { setText, createElement, clearElement } from './dom.js';
import { SUBJECTS, CARDS } from './cardhub.js';
import { storage } from './storage.js';
import { customCards } from './customcards.js';
import { debounce } from './uihelpers.js';

export var browseMethods = {

  renderCardBrowser() {
    var container = document.getElementById('cardBrowserContent');
    if (!container) return;
    var self = this;
    // Preserve existing search input if mounted
    var existingSearch = container.querySelector('#cbSearch');
    if (!existingSearch) {
      clearElement(container);
      // Build controls (only once, kept mounted during typing)
      var searchInput = createElement('input', {
        className: 'card-browser-search',
        attributes: { type: 'text', placeholder: '🔍 Search buzzwords, answers, teaching points...', id: 'cbSearch' }
      });
      searchInput.value = this.cardBrowserSearch || '';
      var debouncedSearch = debounce(function () {
        self.cardBrowserSearch = searchInput.value;
        self.cardBrowserPage = 0;
        self._renderCardBrowserResults();
      }, 300);
      searchInput.addEventListener('input', debouncedSearch);
      container.appendChild(searchInput);

      // Filter row
      var filterRow = createElement('div', { className: 'card-browser-filters' });

      var subjectSelect = createElement('select', {
        attributes: { id: 'cbSubjectFilter' }
      });
      subjectSelect.style.cssText = 'padding:6px;border-radius:8px;background:rgba(30,15,70,0.6);color:#fff;border:1px solid rgba(187,102,255,0.15);font-size:11px';
      subjectSelect.appendChild(createElement('option', { text: 'All Subjects', attributes: { value: '' } }));
      SUBJECTS.forEach(function (s) {
        var opt = createElement('option', { text: s, attributes: { value: s } });
        if (self.cardBrowserSubject === s) opt.selected = true;
        subjectSelect.appendChild(opt);
      });
      subjectSelect.addEventListener('change', function () {
        self.cardBrowserSubject = subjectSelect.value;
        self.cardBrowserPage = 0;
        self._renderCardBrowserResults();
      });
      filterRow.appendChild(subjectSelect);

      var statusSelect = createElement('select', {
        attributes: { id: 'cbStatusFilter' }
      });
      statusSelect.style.cssText = 'padding:6px;border-radius:8px;background:rgba(30,15,70,0.6);color:#fff;border:1px solid rgba(187,102,255,0.15);font-size:11px';
      ['all', 'seen', 'unseen', 'disabled'].forEach(function (val) {
        var labels = { all: 'All Cards', seen: 'Seen', unseen: 'Unseen', disabled: 'Disabled' };
        var opt = createElement('option', { text: labels[val], attributes: { value: val } });
        if (self.cardBrowserFilter === val) opt.selected = true;
        statusSelect.appendChild(opt);
      });
      statusSelect.addEventListener('change', function () {
        self.cardBrowserFilter = statusSelect.value;
        self.cardBrowserPage = 0;
        self._renderCardBrowserResults();
      });
      filterRow.appendChild(statusSelect);

      container.appendChild(filterRow);

      // Results container
      container.appendChild(createElement('div', { attributes: { id: 'cbResults' } }));
    }

    this._renderCardBrowserResults();
  },

  _renderCardBrowserResults() {
    var resultsContainer = document.getElementById('cbResults');
    if (!resultsContainer) return;
    clearElement(resultsContainer);

    var self = this;
    var allCards = CARDS.concat(customCards.getAll());
    var disabledCards = storage.get('disabledCards') || [];

    // Apply filters
    var filtered = allCards;
    if (this.cardBrowserSubject) {
      filtered = filtered.filter(function (c) { return c.subj === self.cardBrowserSubject; });
    }
    if (this.cardBrowserSearch) {
      var q = this.cardBrowserSearch.toLowerCase();
      filtered = filtered.filter(function (c) {
        var text = (c.bw.join(' ') + ' ' + c.ans + ' ' + c.tp).toLowerCase();
        return text.indexOf(q) >= 0;
      });
    }
    if (this.cardBrowserFilter === 'seen') {
      filtered = filtered.filter(function (c) { return storage.getCardStat(c.id).seen > 0; });
    } else if (this.cardBrowserFilter === 'unseen') {
      filtered = filtered.filter(function (c) { return storage.getCardStat(c.id).seen === 0; });
    } else if (this.cardBrowserFilter === 'disabled') {
      filtered = filtered.filter(function (c) { return disabledCards.indexOf(c.id) >= 0; });
    }

    // Pagination
    var pageSize = this.cardBrowserPageSize;
    var totalPages = Math.ceil(filtered.length / pageSize);
    var page = Math.min(this.cardBrowserPage, totalPages - 1);
    if (page < 0) page = 0;
    var start = page * pageSize;
    var displayCards = filtered.slice(start, start + pageSize);

    // Count
    var countEl = createElement('div', {
      className: 'card-browser-stats',
      text: 'Showing ' + (start + 1) + '-' + Math.min(start + pageSize, filtered.length) + ' of ' + filtered.length + ' cards'
    });
    resultsContainer.appendChild(countEl);

    // Cards list
    var list = createElement('div', { className: 'card-browser-list' });

    displayCards.forEach(function (c) {
      var stat = storage.getCardStat(c.id);
      var isDisabled = disabledCards.indexOf(c.id) >= 0;
      var accuracy = stat.seen > 0 ? Math.round(stat.correct / stat.seen * 100) : -1;

      var item = createElement('div', {
        className: 'card-browser-item' + (isDisabled ? ' disabled-card' : '') + (stat.wrong > 2 ? ' missed-card' : '')
      });

      // Buzzwords (safe)
      var bwEl = createElement('div', { className: 'cb-buzzwords' });
      setText(bwEl, c.bw.join(' • '));
      item.appendChild(bwEl);

      // Answer (safe)
      var ansEl = createElement('div', { className: 'cb-answer' });
      setText(ansEl, c.ans);
      item.appendChild(ansEl);

      // Meta row
      var meta = createElement('div', { className: 'cb-meta' });
      var subjTag = createElement('span', { className: 'tag tag-subject' });
      setText(subjTag, c.subj);
      meta.appendChild(subjTag);

      if (accuracy >= 0) {
        var accTag = createElement('span', {
          className: 'tag ' + (accuracy >= 70 ? 'tag-correct' : 'tag-wrong'),
          text: accuracy + '% (' + stat.seen + ')'
        });
        meta.appendChild(accTag);
      } else {
        meta.appendChild(createElement('span', { className: 'tag', text: 'Not seen' }));
      }

      // Toggle button
      var toggleBtn = createElement('div', {
        className: 'card-browser-toggle' + (isDisabled ? '' : ' enabled'),
        text: isDisabled ? '🚫 Disabled' : '✅ Enabled'
      });
      toggleBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        if (storage.isCardDisabled) {
          storage.toggleCardDisabled(c.id);
        } else {
          var disabled = storage.get('disabledCards') || [];
          var idx = disabled.indexOf(c.id);
          if (idx >= 0) disabled.splice(idx, 1);
          else disabled.push(c.id);
          storage.set('disabledCards', disabled);
        }
        self._renderCardBrowserResults();
      });
      meta.appendChild(toggleBtn);

      item.appendChild(meta);
      list.appendChild(item);
    });

    resultsContainer.appendChild(list);

    // Pagination controls
    if (totalPages > 1) {
      var pagRow = createElement('div');
      pagRow.style.cssText = 'display:flex;justify-content:center;gap:8px;margin-top:10px';

      if (page > 0) {
        var prevBtn = createElement('button', { className: 'btn btn-outline btn-sm', text: '← Prev' });
        prevBtn.addEventListener('click', function () { self.cardBrowserPage--; self._renderCardBrowserResults(); });
        pagRow.appendChild(prevBtn);
      }

      pagRow.appendChild(createElement('span', { text: 'Page ' + (page + 1) + ' of ' + totalPages }));
      pagRow.lastChild.style.cssText = 'font-size:11px;color:var(--text-muted);display:flex;align-items:center';

      if (page < totalPages - 1) {
        var nextBtn = createElement('button', { className: 'btn btn-outline btn-sm', text: 'Next →' });
        nextBtn.addEventListener('click', function () { self.cardBrowserPage++; self._renderCardBrowserResults(); });
        pagRow.appendChild(nextBtn);
      }

      resultsContainer.appendChild(pagRow);
    }
  },

  renderCustomCardList() {
    var cards = customCards.getAll();
    var container = document.getElementById('customCardList');
    if (!container) return;
    clearElement(container);
    var self = this;

    if (cards.length === 0) {
      var empty = createElement('div', { text: 'No custom cards yet. Tap "Create New Card" to add your own!' });
      empty.style.cssText = 'text-align:center;padding:20px;color:var(--text-muted);font-size:13px';
      container.appendChild(empty);
      return;
    }

    var countLabel = createElement('p', { text: cards.length + ' custom card' + (cards.length === 1 ? '' : 's') });
    countLabel.style.cssText = 'font-size:12px;color:var(--text-secondary);margin-bottom:8px';
    container.appendChild(countLabel);

    cards.forEach(function (card) {
      var cardEl = createElement('div', { className: 'review-card' });
      cardEl.style.borderLeftColor = 'var(--accent-blue)';

      // Buzzwords (safe text)
      var h4 = createElement('h4');
      setText(h4, card.bw.join(' • '));
      cardEl.appendChild(h4);

      // Tags
      var tagRow = createElement('div');
      var ansTag = createElement('span', { className: 'tag tag-correct' });
      setText(ansTag, card.ans);
      tagRow.appendChild(ansTag);
      var subjTag = createElement('span', { className: 'tag tag-subject' });
      setText(subjTag, card.subj);
      tagRow.appendChild(subjTag);
      cardEl.appendChild(tagRow);

      // Teaching point (safe text)
      var tp = createElement('p');
      setText(tp, card.tp);
      tp.style.marginTop = '4px';
      cardEl.appendChild(tp);

      // Action buttons (event delegation instead of global callbacks)
      var btnRow = createElement('div');
      btnRow.style.cssText = 'display:flex;gap:6px;margin-top:6px';

      var editBtn = createElement('button', { className: 'btn btn-outline btn-sm', text: '✏️ Edit' });
      editBtn.addEventListener('click', function () { self.openCardEditor(card.id); });
      btnRow.appendChild(editBtn);

      var deleteBtn = createElement('button', { className: 'btn btn-outline btn-sm', text: '🗑️ Delete' });
      deleteBtn.style.cssText = 'border-color:rgba(255,82,82,0.5);color:var(--accent-red)';
      deleteBtn.addEventListener('click', function () {
        if (confirm('Delete this card? This cannot be undone.')) {
          customCards.remove(card.id);
          self.renderCustomCardList();
        }
      });
      btnRow.appendChild(deleteBtn);

      cardEl.appendChild(btnRow);
      container.appendChild(cardEl);
    });
  },
};
