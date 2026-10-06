/**
 * uisettings.js — Settings, rule settings, color pickers and the Locker shop.
 *
 * Split out of ui.js. These methods are attached to UI.prototype (see the end of ui.js), so
 * `this` is the UI controller and nothing about how they are called has changed.
 */

import { requireGate, proGiftState } from './pro.js';
import { renderProSettings, applyProLock } from './proui.js';
import { tipJarReady } from './tipjar.js';
import { openTipJar } from './tipui.js';
import { track as trackEvent } from './analytics/index.js';
import { renderAnalyticsSettings } from './analyticsui.js';
import { storyFor } from './stories.js';
import { setText, createElement, clearElement } from './dom.js';
import { storage } from './storage.js';
import { audio } from './audio.js';
import { LOCKER_ITEMS, ARCHIVE_CLASSIC, AVATARS } from './game/shopdata.js';
import { getTipUrl, openTipPage } from './tips.js';
import { POWERUP_OPTIONS, describeRules, getRunRules, normalizeSpeedRamp, SPEED_RAMP_EVERY_OPTIONS, SPEED_RAMP_STEP_OPTIONS } from './rules.js';
import { SKINS, isMapUnlocked, isIndoorSkin } from './game/skins.js';
import { levelFromXp } from './progress.js';
import { mapUnlockLevel, UNLOCK_EVERY } from './game/mapunlocks.js';
import { getPal, palLine } from './companions.js';
import { getQuality } from './game/quality.js';
import { THEME_CHOICES } from './theme.js';
import { FEATURES } from './features.js';
import { canRemind, requestReminderPermission } from './reminders.js';
import { isNative } from './native.js';
import { canDownloadPack, downloadPack, packStatus, formatBytes } from './offlinepack.js';
import { loadCards } from './cardhub.js';
import { buildStudyReport, reportToText, reportToCsv } from './studyreport.js';
import { copyText, saveFile } from './platform.js';
import { canRate, rateTheApp, openStorePage } from './review.js';
import { buildFeedbackForm } from './feedback.js';
import { KEY_ACTIONS, getKeyBindings, setKey, clearKey, resetKeyBindings, keyLabel, isDefaultBindings } from './keybindings.js';

/** Can this device buzz? (Phones in the app, and browsers that offer vibration; not iPhones in Safari or most computers.) */
export function canVibrate() {
  return isNative() || (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function');
}

export var settingsMethods = {

  /** The Keyboard page: every action with its two keys. Tap a key, then press the one you want. */
  _renderKeySettings(content) {
    var self = this;
    var NOTES = {
      moveLeft: 'Switch to the lane on the left.',
      moveRight: 'Switch to the lane on the right.',
      jump: 'Jump over things on the ground.',
      slide: 'Slide under things hanging down.',
      rush: 'Dash through the gate for bonus points.',
      autoPilot: 'Use the Auto-Pilot you are holding on the question that is up.',
      pause: 'Pause the run.'
    };
    content.appendChild(createElement('p', { className: 'setting-sublabel', text: 'For a computer, Chromebook or tablet with a keyboard. Tap a key, then press the key you want. Press Backspace to leave a key empty, or Escape to cancel. A key can only do one thing, so giving it to a new action takes it from the old one.' }));
    var list = createElement('div', { className: 'key-list' });
    content.appendChild(list);
    var capturing = null;

    function stopCapture() {
      if (!capturing) return;
      document.removeEventListener('keydown', capturing.onKey, true);
      capturing = null;
    }

    function draw() {
      stopCapture();
      clearElement(list);
      var now = getKeyBindings();
      KEY_ACTIONS.forEach(function (a) {
        var row = createElement('div', { className: 'setting-row key-row', attributes: { 'data-action': a.id } });
        var label = createElement('div');
        label.style.flex = '1';
        label.appendChild(createElement('div', { className: 'setting-label-text', text: a.label }));
        label.appendChild(createElement('span', { className: 'setting-sublabel', text: NOTES[a.id] }));
        row.appendChild(label);
        var slots = createElement('div', { className: 'key-slots' });
        [0, 1].forEach(function (slot) {
          var current = now[a.id][slot];
          var btn = createElement('button', {
            className: 'key-btn' + (current ? '' : ' empty'),
            text: current ? keyLabel(current) : '—',
            attributes: { type: 'button', 'data-slot': String(slot), 'aria-label': a.label + ' key ' + (slot + 1) + ': ' + (current ? keyLabel(current) : 'not set') + '. Press to change.' }
          });
          btn.addEventListener('click', function () {
            if (capturing && capturing.btn === btn) { draw(); return; }
            draw();
            var b2 = list.querySelector('[data-action="' + a.id + '"] [data-slot="' + slot + '"]');
            b2.textContent = 'Press a key…';
            b2.classList.add('capturing');
            function onKey(e) {
              e.preventDefault();
              e.stopPropagation();
              if (e.key === 'Escape') { draw(); return; }
              if (e.key === 'Backspace' || e.key === 'Delete') { clearKey(a.id, slot); draw(); return; }
              var res = setKey(a.id, slot, e.key);
              if (!res.ok) { self._showToast(res.message); draw(); return; }
              if (res.tookFrom) {
                var from = KEY_ACTIONS.filter(function (x) { return x.id === res.tookFrom; })[0];
                self._showToast(keyLabel(e.key) + ' now ' + a.label.toLowerCase() + '. ' + (from ? from.label : 'The other action') + ' lost it.');
              }
              draw();
            }
            document.addEventListener('keydown', onKey, true);
            capturing = { btn: b2, onKey: onKey };
            b2.focus();
          });
          slots.appendChild(btn);
        });
        row.appendChild(slots);
        list.appendChild(row);
      });
      var reset = createElement('button', { className: 'btn btn-outline btn-block', text: '↺ Back to the standard keys', attributes: { type: 'button', id: 'resetKeysBtn' } });
      reset.disabled = isDefaultBindings();
      reset.style.marginTop = '12px';
      reset.addEventListener('click', function () { resetKeyBindings(); self._showToast('Standard keys restored.'); draw(); });
      list.appendChild(reset);
    }
    draw();
  },

  renderSettings() {
    var self = this;
    var content = document.getElementById('settingsContent');
    if (!content) return;
    clearElement(content);

    var sections = this._settingsSections();
    var current = null;
    for (var si = 0; si < sections.length; si++) if (sections[si].id === this._settingsSection) current = sections[si];

    // ---- the list of sections ----
    if (!current) {
      var hub = createElement('div', { className: 'settings-hub' });
      sections.forEach(function (sec) {
        var card = createElement('button', { className: 'settings-card', attributes: { type: 'button', 'data-section': sec.id } });
        card.appendChild(createElement('span', { className: 'settings-card-icon', text: sec.icon }));
        var text = createElement('span', { className: 'settings-card-text' });
        text.appendChild(createElement('span', { className: 'settings-card-title', text: sec.title }));
        text.appendChild(createElement('span', { className: 'settings-card-desc', text: sec.desc }));
        card.appendChild(text);
        card.appendChild(createElement('span', { className: 'settings-card-arrow', text: '›' }));
        card.addEventListener('click', function () { self._settingsSection = sec.id; self.renderSettings(); });
        hub.appendChild(card);
      });
      content.appendChild(hub);
      document.dispatchEvent(new CustomEvent('dx:attention-changed')); // the new sections wear their red dots
      return;
    }

    // ---- one section ----
    // (the Back button at the top of the screen steps from a section back to this list)
    var title = createElement('h3', { className: 'settings-section-title', text: current.icon + ' ' + current.title });
    content.appendChild(title);

    // Every setting says what it does, in plain words
    var ROWS = {
      sound: [
        { key: 'musicOn', label: '🎵 Music', desc: 'Background music while you run.', type: 'toggle' },
        { key: 'masterVolume', label: '🔊 Master volume', desc: 'The overall loudness of everything.', type: 'range', min: 0, max: 1, step: 0.1, pct: true },
        { key: 'sfxVolume', label: '💥 Sound effects', desc: 'Jumps, coins, answers, menus and rewards.', type: 'range', min: 0, max: 1, step: 0.1, pct: true },
        { key: 'musicVolume', label: '🎶 Music volume', desc: 'How loud the background music is.', type: 'range', min: 0, max: 1, step: 0.1, pct: true },
        { key: 'ttsEnabled', label: '🗣 Read questions aloud', desc: 'Your device reads the clues and answers out loud.', type: 'toggle' }
      ].concat(canVibrate() ? [
        { key: 'hapticsEnabled', label: '📳 Vibration', desc: 'A short buzz when you answer, collect a power-up or get caught. Turn off if you prefer your phone still.', type: 'toggle' }
      ] : []).concat(FEATURES.characterVoices ? [
        { key: 'characterVoices', label: '💬 Character voices', desc: 'Your runner cheers when you score and groans when you miss, each with a voice of their own.', type: 'toggle' }
      ] : []),
      look: [
        { key: 'uiTheme', label: '🎨 Colors', desc: 'Surprise me changes the whole color of the menus after every run: purple, ocean blue, forest green, ember red and more. Seasonal follows the date. Or pick a season by hand, or Classic for the original colors.', type: 'select', options: THEME_CHOICES },
        { key: 'nightMode', label: '🌙 Night Shift', desc: 'Darker, softer colors for studying late at night.', type: 'toggle' },
        { key: 'colorblindMode', label: '👁 Colorblind-safe colors', desc: 'Swaps red and green cues for colors that are easier to tell apart.', type: 'toggle' },
        { key: 'dyslexiaFont', label: '🔤 Dyslexia-friendly font', desc: 'Switches every word in the game to OpenDyslexic, a typeface with weighted bottoms that keep letters from flipping, with a little more room between letters and lines.', type: 'toggle' },
        { key: 'handedness', label: '🖐 Button side', desc: 'Moves the Dash and Auto-Pilot buttons to the side your thumb rests on. Swiping to change lane works anywhere on the screen either way.', type: 'select', options: [['right', 'Right hand (buttons on the right)'], ['left', 'Left hand (buttons on the left)']] },
        { key: 'dashControl', label: '⚡ Dash control', desc: 'How you dash toward the answer gates. Double-tap the screen, use an on-screen Dash button (handy if double-taps trigger by accident), or turn dashing off. The keyboard Space and Shift keys always dash on a computer.', type: 'select', options: [['auto', 'Automatic (button on phones, double-tap on computers)'], ['double', 'Double-tap the screen'], ['button', 'On-screen Dash button'], ['off', 'Off']] },
        { key: 'cameraView', label: '🎥 Camera', desc: 'How far behind your runner the camera sits. Close feels faster, Far shows more of the track.', type: 'select', options: [['default', 'Standard'], ['close', 'Close'], ['far', 'Far']] },
        { key: 'quality', label: '🎮 Graphics', desc: 'Auto picks what suits your device. Lower settings run smoother on older devices (the game reloads when you change this).', type: 'select', options: [['auto', 'Auto'], ['high', 'High (all 3D)'], ['medium', 'Medium (3D character)'], ['low', 'Low (fastest)']] },
        { key: 'ambientParticles', label: '🌟 Floating glow particles', desc: 'Soft glowing specks drifting across the track. Pretty, but they can be distracting while you read. Off by default.', type: 'toggle' },
        { key: 'glowEffects', label: '✨ Glow effects', desc: 'A soft glow around bright things. It looks great but makes the game noticeably more demanding: it can slow older laptops and drain a phone battery faster. Off by default.', type: 'toggle' },
        { key: 'batterySaver', label: '🎞 30 frames per second', desc: 'Keeps the game at a steady 30 fps: cooler, smoother and easier on the battery. Turn off for up to 60 fps on a fast device.', type: 'toggle' }
      ],
      data: [
        { key: 'sendDiagnostics', label: '🩹 Help fix problems', desc: 'Sends an anonymous report when the game crashes or runs slowly: a short message, where it happened, the app version and your graphics level. Never your name, scores, cards or account. Off unless you turn it on.', type: 'toggle' }
      ],
      study: [
        { key: 'dailyGoal', label: '🎯 Daily goal', desc: 'How many cards you aim to study each day. Hitting it keeps your streak going.', type: 'range', min: 5, max: 100, step: 5, unit: ' cards' },
        { key: 'reminders', label: '🔔 Daily reminder', desc: 'A notification at your reminder time. In the phone app it arrives even when the app is closed, and skips a day when you have already hit your goal.', type: 'toggle' },
        { key: 'reminderHour', label: '⏰ Reminder time', desc: 'The hour of the day for the reminder (0 is midnight, 13 is 1 pm).', type: 'range', min: 0, max: 23, step: 1, unit: ':00' },
        { key: 'cardFreshnessWeight', label: '🆕 New-card priority', desc: 'How much more often you see cards you have never answered. 1 treats every card the same; 10 brings new cards up much more often than ones you already know.', type: 'range', min: 1, max: 10, step: 1 }
      ]
    };

    function buildRow(s) {
      var row = createElement('div', { className: 'setting-row', attributes: { 'data-setting': s.key } });
      var label = createElement('div');
      label.appendChild(createElement('div', { className: 'setting-label-text', text: s.label }));
      label.appendChild(createElement('span', { className: 'setting-sublabel', text: s.desc }));
      label.style.flex = '1';
      row.appendChild(label);

      if (s.type === 'toggle') {
        var toggle = createElement('div', {
          className: 'toggle' + (storage.get(s.key) ? ' on' : ''),
          attributes: { role: 'switch', tabindex: '0', 'aria-label': s.label, 'aria-checked': storage.get(s.key) ? 'true' : 'false' }
        });
        toggle.addEventListener('keydown', function (e) {
          if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggle.click(); }
        });
        toggle.addEventListener('click', function () {
          var newVal = !storage.get(s.key);
          if (s.key === 'reminders' && newVal) {
            // Notifications need explicit permission (from the browser, or from the phone inside the app).
            if (!canRemind()) { self._showToast('This device cannot show notifications.'); return; }
            requestReminderPermission().then(function (res) {
              if (!res.ok) {
                trackEvent('reminder_state', { action: res.reason === 'unsupported' ? 'unsupported' : 'permission_denied', native: isNative() });
                self._showToast(res.reason === 'unsupported' ? 'This device cannot show notifications.' : 'Notifications were blocked. Turn them on for Dx Dash in your phone or browser settings.');
                return;
              }
              trackEvent('reminder_state', { action: 'permission_granted', native: isNative() });
              storage.set('reminders', true);
              toggle.classList.add('on');
              toggle.setAttribute('aria-checked', 'true');
              document.dispatchEvent(new CustomEvent('dx:reminders-changed'));
            });
            return;
          }
          storage.set(s.key, newVal);
          if (s.key === 'reminders') document.dispatchEvent(new CustomEvent('dx:reminders-changed'));
          toggle.classList.toggle('on');
          toggle.setAttribute('aria-checked', newVal ? 'true' : 'false');
          if (s.key === 'colorblindMode' || s.key === 'dyslexiaFont') self.applySettings();
          if (s.key === 'nightMode') {
            self.applySettings();
            if (self.onNightModeChange) self.onNightModeChange();
          }
          if (s.key === 'musicOn') {
            if (newVal) audio.startMusic(); else audio.stopMusic();
          }
          if (s.key === 'hapticsEnabled') {
            audio.updateSettings();
            if (newVal) audio._vibrate(40); // a taste of what it feels like
          }
        });
        row.appendChild(toggle);
      } else if (s.type === 'select') {
        var select = createElement('select', { attributes: { 'aria-label': s.label } });
        select.style.cssText = 'padding:6px 8px;border-radius:8px;background:rgba(30,15,70,.8);color:#fff;border:1px solid rgba(187,102,255,.3)';
        s.options.forEach(function (opt) {
          var o = createElement('option', { text: opt[1], attributes: { value: opt[0] } });
          if ((storage.get(s.key) || 'auto') === opt[0]) o.selected = true;
          select.appendChild(o);
        });
        if (s.key === 'uiTheme') {
          label.appendChild(createElement('span', { className: 'setting-sublabel', text: 'Right now: ' + (document.documentElement.getAttribute('data-theme-name') || 'Classic') }));
        }
        if (s.key === 'quality') {
          label.appendChild(createElement('span', { className: 'setting-sublabel', text: 'Now using: ' + getQuality().charAt(0).toUpperCase() + getQuality().slice(1) }));
        }
        select.addEventListener('change', function () {
          storage.set(s.key, select.value);
          if (s.key === 'uiTheme') document.dispatchEvent(new CustomEvent('dx:theme-changed'));
          if (s.key === 'handedness') self.applySettings();
          if (s.key === 'dashControl') document.dispatchEvent(new CustomEvent('dx:controls-changed'));
          if (s.key === 'quality') {
            storage.set('perfHint', '');
            storage.set('perfStrikes', 0);
            self._showToast('Graphics changed. Reloading…');
            setTimeout(function () { window.location.reload(); }, 700);
          }
        });
        row.appendChild(select);
      } else if (s.type === 'range') {
        var currentVal = storage.get(s.key);
        if (currentVal === undefined || currentVal === null) currentVal = s.min;
        var range = createElement('input', {
          attributes: { type: 'range', min: String(s.min), max: String(s.max), step: String(s.step), value: String(currentVal), 'aria-label': s.label }
        });
        range.style.cssText = 'width:100px;accent-color:var(--accent-cyan)';
        var valueEl = createElement('span', { className: 'setting-value' });
        var showValue = function (v) {
          setText(valueEl, s.pct ? Math.round(v * 100) + '%' : v + (s.unit || ''));
        };
        showValue(currentVal);
        range.addEventListener('input', function () {
          var val = parseFloat(range.value);
          storage.set(s.key, val);
          showValue(val);
          if (s.key === 'dailyGoal') self.renderStudyGoal();
          if (s.key === 'reminderHour') document.dispatchEvent(new CustomEvent('dx:reminders-changed'));
          if (s.key === 'masterVolume' || s.key === 'sfxVolume' || s.key === 'musicVolume') {
            audio.updateSettings();
          }
        });
        var rangeWrap = createElement('div', { className: 'setting-range' });
        rangeWrap.appendChild(range);
        rangeWrap.appendChild(valueEl);
        row.appendChild(rangeWrap);
      }
      return row;
    }

    if (ROWS[current.id]) {
      ROWS[current.id].forEach(function (s) { content.appendChild(buildRow(s)); });
    }

    if (current.id === 'keys') {
      this._renderKeySettings(content);
    }

    if (current.id === 'study') {
      // Anki import container (mount point for the importer)
      content.appendChild(createElement('div', { attributes: { id: 'ankiImportContainer' } }));
    }

    if (current.id === 'rules') {
      this._renderRuleSettings(content);
    }

    if (current.id === 'data') {
      var explain = function (text) {
        var n = createElement('div', { className: 'setting-sublabel', text: text });
        n.style.cssText = 'margin:6px 0 10px;line-height:1.4';
        return n;
      };
      content.appendChild(explain('Your progress lives on this device. Save a backup file before switching devices, then restore it on the new one.'));
      renderAnalyticsSettings(content, function (m) { self._showToast(m); });

      if (canDownloadPack({ isNative: isNative() })) {
        var packRow = createElement('div', { className: 'setting-row', attributes: { id: 'offlinePackRow' } });
        var packLabel = createElement('div');
        packLabel.style.flex = '1';
        packLabel.appendChild(createElement('div', { className: 'setting-label-text', text: '📶 Play with no connection' }));
        packLabel.appendChild(createElement('span', { className: 'setting-sublabel', text: 'Saves all the questions, heroes, monsters and maps on this device (about 15 MB) so everything works without internet, on a plane or in the library basement.' }));
        var packState = createElement('span', { className: 'setting-sublabel', text: packStatus(storage.get('offlinePackAt')) });
        packState.id = 'offlinePackState';
        packLabel.appendChild(packState);
        packRow.appendChild(packLabel);
        var packBtn = createElement('button', { className: 'btn btn-outline btn-sm', text: storage.get('offlinePackAt') ? 'Update' : 'Download', attributes: { type: 'button', id: 'offlinePackBtn' } });
        packBtn.addEventListener('click', function () {
          if (!requireGate('offline_pack')) return;
          packBtn.disabled = true;
          setText(packState, 'Downloading… 0%');
          downloadPack({
            loadCards: loadCards,
            onProgress: function (done, total) { setText(packState, 'Downloading… ' + Math.round((done / Math.max(1, total)) * 100) + '%'); }
          }).then(function (res) {
            packBtn.disabled = false;
            trackEvent('offline_pack', { ok: !!res.ok, mb: res.bytes ? Math.round(res.bytes / 104857.6) / 10 : 0 });
            if (res.ok) {
              setText(packState, packStatus(storage.get('offlinePackAt')) + ' (' + formatBytes(res.bytes) + ')');
              setText(packBtn, 'Update');
              self._showToast('Saved for offline play.');
            } else {
              setText(packState, 'That did not finish. Check your connection and try again.');
            }
          });
        });
        applyProLock(packBtn, 'offline_pack');
        packRow.appendChild(packBtn);
        content.appendChild(packRow);
      }

      var reportRow2 = createElement('div', { className: 'setting-row', attributes: { id: 'studyReportRow' } });
      var reportLabel2 = createElement('div');
      reportLabel2.style.flex = '1';
      reportLabel2.appendChild(createElement('div', { className: 'setting-label-text', text: '📊 Study report' }));
      reportLabel2.appendChild(createElement('span', { className: 'setting-sublabel', text: 'A summary of your level, streak and accuracy by subject to paste into a message, or a spreadsheet file. It has no name or account details: only what you choose to send.' }));
      reportRow2.appendChild(reportLabel2);
      var reportBtns2 = createElement('div');
      var copyReport = createElement('button', { className: 'btn btn-outline btn-sm', text: 'Copy', attributes: { type: 'button', id: 'copyStudyReport' } });
      copyReport.addEventListener('click', function () {
        if (!requireGate('analytics_detail', { trigger: 'export_report' })) return;
        copyText(reportToText(buildStudyReport(storage.data))).then(function (ok) { self._showToast(ok ? 'Study report copied.' : 'Could not copy. Try the spreadsheet instead.'); });
      });
      var csvReport = createElement('button', { className: 'btn btn-outline btn-sm', text: 'CSV', attributes: { type: 'button', id: 'csvStudyReport' } });
      csvReport.addEventListener('click', function () {
        if (!requireGate('analytics_detail', { trigger: 'export_csv' })) return;
        var blob = new Blob([reportToCsv(buildStudyReport(storage.data))], { type: 'text/csv' });
        saveFile(blob, 'dx-dash-study-report-' + new Date().toISOString().slice(0, 10) + '.csv').then(function (how) {
          self._showToast(how === 'failed' ? 'Could not save the file.' : 'Study report saved.');
        });
      });
      applyProLock(copyReport, 'analytics_detail');
      applyProLock(csvReport, 'analytics_detail');
      reportBtns2.appendChild(copyReport);
      reportBtns2.appendChild(csvReport);
      reportRow2.appendChild(reportBtns2);
      content.appendChild(reportRow2);

      var backupRow = createElement('div', { className: 'setting-row' });
      var backupLabel = createElement('div');
      backupLabel.style.flex = '1';
      backupLabel.appendChild(createElement('div', { className: 'setting-label-text', text: '💾 Progress backup' }));
      backupLabel.appendChild(createElement('span', { className: 'setting-sublabel', text: 'Save everything to a file, or load a file you saved before.' }));
      backupRow.appendChild(backupLabel);
      var backupBtns = createElement('div');
      var backupBtn = createElement('button', { className: 'btn btn-outline btn-sm', text: 'Save', attributes: { type: 'button' } });
      backupBtn.addEventListener('click', function () { self.downloadBackup(); });
      var restoreBtn = createElement('button', { className: 'btn btn-outline btn-sm', text: 'Restore', attributes: { type: 'button' } });
      var restoreInput = createElement('input', {
        attributes: { type: 'file', accept: 'application/json,.json', hidden: '', 'aria-label': 'Backup file' }
      });
      restoreBtn.addEventListener('click', function () { restoreInput.click(); });
      restoreInput.addEventListener('change', function () { self.restoreBackup(restoreInput.files[0]); });
      backupBtns.appendChild(backupBtn);
      backupBtns.appendChild(restoreBtn);
      backupBtns.appendChild(restoreInput);
      backupRow.appendChild(backupBtns);
      content.appendChild(backupRow);

      var reportRow = createElement('div', { className: 'setting-row' });
      var reportLabel = createElement('div');
      reportLabel.style.flex = '1';
      reportLabel.appendChild(createElement('div', { className: 'setting-label-text', text: '🚩 Card reports' }));
      reportLabel.appendChild(createElement('span', { className: 'setting-sublabel', text: 'Save the list of cards you flagged as wrong or confusing, to send to the author.' }));
      reportRow.appendChild(reportLabel);
      var reportBtn = createElement('button', { className: 'btn btn-outline btn-sm', text: 'Export', attributes: { type: 'button' } });
      reportBtn.addEventListener('click', function () { self.exportCardReports(); });
      reportRow.appendChild(reportBtn);
      content.appendChild(reportRow);

      var resetWrap = createElement('div');
      resetWrap.style.marginTop = '20px';
      resetWrap.appendChild(explain('Reset erases your coins, unlocks, stats and settings from this device. It cannot be undone, so save a backup first.'));
      var resetBtn = createElement('button', { className: 'btn btn-red btn-block', text: '🗑 Reset all progress', attributes: { type: 'button' } });
      resetBtn.addEventListener('click', function () {
        if (confirm('Reset ALL progress? This cannot be undone.')) {
          storage.reset();
          window.location.reload();
        }
      });
      resetWrap.appendChild(resetBtn);
      content.appendChild(resetWrap);
    }

    if (current.id === 'about') {
      var tutRow = createElement('div', { className: 'setting-row' });
      var tutLabel = createElement('div');
      tutLabel.style.flex = '1';
      tutLabel.appendChild(createElement('div', { className: 'setting-label-text', text: '❓ How to play' }));
      tutLabel.appendChild(createElement('span', { className: 'setting-sublabel', text: 'Practice the controls step by step. The same tutorial as the How to Play button on Home.' }));
      tutRow.appendChild(tutLabel);
      var tutBtn = createElement('button', { className: 'btn btn-outline btn-sm', text: 'Start', attributes: { type: 'button', id: 'settingsTutorialBtn' } });
      tutBtn.addEventListener('click', function () { self.showTutorial(); });
      tutRow.appendChild(tutBtn);
      content.appendChild(tutRow);

      // Feedback: always available (the same form as "Not really" in the rating question)
      var fbRow = createElement('div', { className: 'setting-row' });
      var fbLabel = createElement('div');
      fbLabel.style.flex = '1';
      fbLabel.appendChild(createElement('div', { className: 'setting-label-text', text: '💬 Send feedback' }));
      fbLabel.appendChild(createElement('span', { className: 'setting-sublabel', text: 'Found a bug, or have an idea? Tell the developer. We read every message.' }));
      fbRow.appendChild(fbLabel);
      var fbBtn = createElement('button', { className: 'btn btn-outline btn-sm', text: 'Write', attributes: { type: 'button', id: 'settingsFeedbackBtn' } });
      fbRow.appendChild(fbBtn);
      content.appendChild(fbRow);
      var fbSlot = createElement('div');
      content.appendChild(fbSlot);
      fbBtn.addEventListener('click', function () {
        if (fbSlot.firstChild) { clearElement(fbSlot); return; }
        fbSlot.appendChild(buildFeedbackForm({
          mood: 'idea',
          prompt: 'What would you like to tell us?',
          submit: self.submitFeedback || null,
          toast: function (m) { self._showToast(m); },
          onDone: function () { clearElement(fbSlot); }
        }));
      });

      if (canRate()) {
        var rateRow = createElement('div', { className: 'setting-row' });
        var rateLabel = createElement('div');
        rateLabel.style.flex = '1';
        rateLabel.appendChild(createElement('div', { className: 'setting-label-text', text: '⭐ Rate Dx Dash' }));
        rateLabel.appendChild(createElement('span', { className: 'setting-sublabel', text: 'Enjoying it? A rating on the store helps other students find the game.' }));
        rateRow.appendChild(rateLabel);
        var rateBtn = createElement('button', { className: 'btn btn-outline btn-sm', text: 'Rate', attributes: { type: 'button', id: 'settingsRateBtn' } });
        rateBtn.addEventListener('click', function () {
          rateTheApp().then(function (res) {
            if (res.how === 'copied') self._showToast('Link copied. Paste it into your browser to rate.');
            else if (res.how === 'failed') self._showToast('Could not open the store from here.');
            else if (res.how === 'in-app') {
              // the store decides whether its rating box appears; the page is the back-up
              rateBtn.textContent = 'Open store page';
              rateBtn.onclick = function () { openStorePage(); };
            }
          });
        });
        rateRow.appendChild(rateBtn);
        content.appendChild(rateRow);
      }

      var aboutRow = createElement('div', { className: 'setting-row' });
      var aboutLinks = createElement('div');
      aboutLinks.style.cssText = 'display:flex;gap:14px;flex-wrap:wrap;font-size:13px';
      [['Privacy Policy', 'privacy.html'], ['Terms of Use', 'terms.html']].forEach(function (l) {
        var a = createElement('a', { text: l[0], attributes: { href: l[1], target: '_blank', rel: 'noopener noreferrer' } });
        a.style.color = 'var(--accent-cyan)';
        aboutLinks.appendChild(a);
      });
      aboutRow.appendChild(aboutLinks);
      content.appendChild(aboutRow);
      var disclaimer = createElement('div', {
        className: 'setting-sublabel',
        text: 'Dx Dash is a study aid, not medical advice. Content may contain errors; verify important facts against authoritative sources.'
      });
      disclaimer.style.cssText = 'margin:4px 0 12px;line-height:1.4;font-size:11px';
      content.appendChild(disclaimer);
      var credits = createElement('details', { className: 'credit-box' });
      credits.appendChild(createElement('summary', { text: '🎨 Credits' }));
      var creditsBody = createElement('div', { className: 'howto-body' });
      [
        'Characters, monsters, props, the hospital bed and traffic cone: Quaternius (CC0). Screens and signs: Kenney (CC0). More props: CreativeTrio, iPoly3D (CC0).',
        'Bright-map props (food, kitchen, furniture, pumpkins, buildings): KayKit Restaurant, Halloween, City Builder and Furniture Bits by Kay Lousberg (CC0).',
        'Hospital, lab and ambulance set pieces, from Poly Pizza (CC BY 3.0): Wheelchair and Ambulance by Poly by Google; IV stand by Daisuke Takeoka; Doctor and Ambulance by jeremy; Wet Floor Sign by J-Toastie; Microscope and Lab Desk by Colonel Cthulu; Science Tubes by Ryan Donaldson; Fire Extinguisher by Jarlan Perez.',
        'Doctor, nurse and paramedic: Quaternius characters (CC0).',
        'Scout: KayKit Adventurers Rogue by Kay Lousberg (CC0), www.kaylousberg.com.',
        'Interface font: Fredoka (SIL Open Font License 1.1); big titles: Jersey 10 and Press Start 2P (SIL Open Font License 1.1).',
        'Dyslexia-friendly font: OpenDyslexic by Abbie Gonzalez (SIL Open Font License 1.1).'
      ].forEach(function (t) { creditsBody.appendChild(createElement('div', { className: 'howto-item', text: t })); });
      credits.appendChild(creditsBody);
      content.appendChild(credits);

      renderProSettings(content); // (nothing until Pro is switched on)
      // Optional tip link (only when a tip page is configured at build time)
      if (getTipUrl() || tipJarReady()) {
        var tipRow = createElement('div', { className: 'setting-row' });
        var tipLabel = createElement('div');
        tipLabel.style.flex = '1';
        tipLabel.appendChild(createElement('div', { text: '☕ Support the developer' }));
        tipLabel.appendChild(createElement('span', { className: 'setting-sublabel', text: 'Dx Dash is free. Tips help keep it going.' }));
        tipRow.appendChild(tipLabel);
        var tipBtn = createElement('button', { className: 'btn btn-gold btn-sm', text: 'Leave a tip', attributes: { type: 'button' } });
        tipBtn.addEventListener('click', function () { trackEvent('tip_prompt', { step: 'opened_settings' }); if (tipJarReady()) openTipJar(function (m) { self._showToast(m); }); else openTipPage(); });
        tipRow.appendChild(tipBtn);
        content.appendChild(tipRow);
      }
    }

    this.applySettings();

    // Mount settings extensions (Section 21.1) [2]
    this.mountSettingsExtensions();
  },

  /** Settings: power-up, hazard and monster switches, and a favorite map. */
  _renderRuleSettings(content) {
    var self = this;
    var heading = createElement('h3', { text: '🎛️ Your Rules (single-player)' });
    heading.style.cssText = 'margin:16px 0 4px;font-size:14px;color:var(--text-secondary)';
    content.appendChild(heading);
    var note = createElement('div', {
      className: 'setting-sublabel',
      text: 'Turn things off for endless, study and weakness runs. To keep rankings fair, a run with any rule changed still counts for your own progress but is not posted to leaderboards. Daily, challenges, the Gauntlet and multiplayer always use standard rules.'
    });
    note.style.cssText = 'margin-bottom:8px;line-height:1.4;font-size:11px';
    content.appendChild(note);

    function toggleRow(icon, label, desc, isOn, onChange) {
      var row = createElement('div', { className: 'setting-row' });
      var text = createElement('div');
      text.appendChild(createElement('div', { text: icon + ' ' + label }));
      text.appendChild(createElement('span', { className: 'setting-sublabel', text: desc }));
      row.appendChild(text);
      var sw = createElement('div', {
        className: 'toggle' + (isOn ? ' on' : ''),
        attributes: { role: 'switch', tabindex: '0', 'aria-label': label, 'aria-checked': isOn ? 'true' : 'false' }
      });
      function flip() {
        var next = !sw.classList.contains('on');
        sw.classList.toggle('on', next);
        sw.setAttribute('aria-checked', next ? 'true' : 'false');
        onChange(next);
        refreshBadge();
      }
      sw.addEventListener('click', flip);
      sw.addEventListener('keydown', function (e) {
        if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); flip(); }
      });
      row.appendChild(sw);
      content.appendChild(row);
    }

    var badge = createElement('div', { className: 'setting-sublabel' });
    badge.style.cssText = 'margin:6px 0;font-weight:700';
    function refreshBadge() {
      var rules = getRunRules('endless', {
        disabledPowerups: storage.get('disabledPowerups'),
        hazardsOff: storage.get('hazardsOff'),
        monsterOff: storage.get('monsterOff'),
        relaxedPace: storage.get('relaxedPace'),
        speedRamp: storage.get('speedRamp')
      });
      setText(badge, rules.custom ? '⚠ Custom rules on: ' + describeRules(rules) + '. Runs will not be ranked.' : '✓ Standard rules: runs are ranked.');
      badge.style.color = rules.custom ? 'var(--accent-gold)' : 'var(--accent-green)';
    }

    POWERUP_OPTIONS.forEach(function (p) {
      var disabled = storage.get('disabledPowerups') || [];
      toggleRow(p.icon, p.label + ' power-up', p.desc, disabled.indexOf(p.id) < 0, function (on) {
        var list = (storage.get('disabledPowerups') || []).filter(function (id) { return id !== p.id; });
        if (!on) list.push(p.id);
        storage.set('disabledPowerups', list);
      });
    });
    toggleRow('🌀', 'Map hazards', 'Blackouts, tremors, fog and other map events', !storage.get('hazardsOff'), function (on) {
      storage.set('hazardsOff', !on);
    });
    toggleRow('👾', 'Exam monster', 'The monster that chases you when you slip', !storage.get('monsterOff'), function (on) {
      storage.set('monsterOff', !on);
    });
    toggleRow('🐢', 'Relaxed pace', 'Everything moves at about two thirds of the normal speed and never speeds up, so there is time to read every clue. An accessibility mode: your coins, levels and streaks still count, but runs are not posted to leaderboards.', !!storage.get('relaxedPace'), function (on) {
      storage.set('relaxedPace', on);
    });
    // Speed-up: the run gets a little faster as you go. The standard is +0.5 every 20 questions.
    var ramp = normalizeSpeedRamp(storage.get('speedRamp'));
    function saveRamp() { storage.set('speedRamp', { on: ramp.on, every: ramp.every, step: ramp.step }); refreshBadge(); }
    toggleRow('⚡', 'Speed up as you go', 'The run gets faster the longer you last. Turn off to keep your starting speed.', ramp.on, function (on) {
      ramp.on = on;
      saveRamp();
      everySelect.disabled = !on;
      stepSelect.disabled = !on;
    });
    function rampSelect(label, options, current, fmt, onPick) {
      var row = createElement('div', { className: 'setting-row' });
      row.appendChild(createElement('div', { text: label }));
      var sel = createElement('select', { attributes: { 'aria-label': label } });
      sel.style.cssText = 'padding:6px 8px;border-radius:8px;background:rgba(30,15,70,.8);color:#fff;border:1px solid rgba(187,102,255,.3)';
      options.forEach(function (v) {
        var o = createElement('option', { text: fmt(v), attributes: { value: String(v) } });
        if (v === current) o.selected = true;
        sel.appendChild(o);
      });
      sel.addEventListener('change', function () { onPick(Number(sel.value)); saveRamp(); });
      row.appendChild(sel);
      content.appendChild(row);
      return sel;
    }
    var everySelect = rampSelect('🔁 Speed up every', SPEED_RAMP_EVERY_OPTIONS, ramp.every, function (v) { return v + ' questions'; }, function (v) { ramp.every = v; });
    var stepSelect = rampSelect('➕ Each time, add', SPEED_RAMP_STEP_OPTIONS, ramp.step, function (v) { return '+' + v + '×'; }, function (v) { ramp.step = v; });
    everySelect.disabled = !ramp.on;
    stepSelect.disabled = !ramp.on;

    content.appendChild(badge);
    refreshBadge();

    // Favorite map: purely cosmetic, so it never affects ranking
    var mapRow = createElement('div', { className: 'setting-row' });
    var mapLabel = createElement('div');
    mapLabel.appendChild(createElement('div', { text: '🗺️ Favorite map' }));
    mapLabel.appendChild(createElement('span', { className: 'setting-sublabel', text: 'Run on one map instead of rotating (cosmetic, still ranked)' }));
    mapRow.appendChild(mapLabel);
    var mapSelect = createElement('select', { attributes: { 'aria-label': 'Favorite map' } });
    mapSelect.style.cssText = 'padding:6px 8px;border-radius:8px;background:rgba(30,15,70,.8);color:#fff;border:1px solid rgba(187,102,255,.3);max-width:160px';
    mapSelect.appendChild(createElement('option', { text: 'Rotate maps', attributes: { value: '' } }));
    SKINS.filter(function (sk) { return isMapUnlocked(sk, function (id) { return storage.ownsItem(id); }); }).forEach(function (sk) {
      var o = createElement('option', { text: sk.name, attributes: { value: sk.name } });
      if (storage.get('preferredMap') === sk.name) o.selected = true;
      mapSelect.appendChild(o);
    });
    mapSelect.addEventListener('change', function () { storage.set('preferredMap', mapSelect.value); });
    mapRow.appendChild(mapSelect);
    content.appendChild(mapRow);
    void self;
  },

  /** Locker section: recolor hair, skin, coat, pants and shoes. */
  _renderColorPickers() {
    var self = this;
    var wrap = createElement('div');
    var heading = createElement('h3', { text: '🎨 Colors' });
    heading.style.cssText = 'margin:12px 0 6px;font-size:14px;color:var(--text-secondary)';
    wrap.appendChild(heading);

    // The 3D characters ship with their own colors; only the classic blocky
    // characters can be recolored.
    var equippedSkin = storage.get('equipped').skin || 'avatar_intern';
    var equippedAvatar = AVATARS.filter(function (a) { return a.id === equippedSkin; })[0];
    if (equippedAvatar && equippedAvatar.isModel) {
      wrap.appendChild(createElement('div', {
        className: 'setting-sublabel',
        text: 'This character keeps its own look.'
      }));
      return wrap;
    }

    var current = storage.get('avatarColors') || {};
    var grid = createElement('div');
    grid.style.cssText = 'display:grid;grid-template-columns:repeat(5,1fr);gap:6px;text-align:center';
    var fields = [['hair', 'Hair'], ['skin', 'Skin'], ['body', 'Coat'], ['pants', 'Pants'], ['shoe', 'Shoes']];

    // Show the equipped avatar's real colors as the starting values.
    var base = {};
    AVATARS.forEach(function (a) {
      if (a.id === (storage.get('equipped').skin || 'avatar_intern')) {
        base = { hair: a.hairColor, skin: a.skinColor, body: a.bodyColor, pants: a.pantsColor, shoe: a.shoeColor };
      }
    });
    var toHex = function (n) { return '#' + ('000000' + (n || 0).toString(16)).slice(-6); };

    fields.forEach(function (f) {
      var cell = createElement('label');
      cell.style.cssText = 'font-size:10px;color:var(--text-muted);display:flex;flex-direction:column;align-items:center;gap:2px';
      var input = createElement('input', {
        attributes: { type: 'color', value: current[f[0]] || toHex(base[f[0]]), 'aria-label': f[1] + ' color' }
      });
      input.style.cssText = 'width:100%;height:32px;border:none;border-radius:8px;background:none;padding:0';
      input.addEventListener('change', function () {
        var colors = Object.assign({}, storage.get('avatarColors') || {});
        colors[f[0]] = input.value;
        storage.set('avatarColors', colors);
        if (self.characterPreview) { self.characterPreview.clearPreview(); self.characterPreview.rebuildCharacter(); }
        if (self.onEquipChange) self.onEquipChange();
      });
      cell.appendChild(input);
      cell.appendChild(createElement('span', { text: f[1] }));
      grid.appendChild(cell);
    });
    wrap.appendChild(grid);

    var reset = createElement('button', { className: 'btn btn-outline btn-sm', text: 'Reset colors' });
    reset.style.marginTop = '6px';
    reset.addEventListener('click', function () {
      storage.set('avatarColors', {});
      self.renderShop();
      if (self.characterPreview) { self.characterPreview.clearPreview(); self.characterPreview.rebuildCharacter(); }
      if (self.onEquipChange) self.onEquipChange();
    });
    wrap.appendChild(reset);
    return wrap;
  },

  /**
   * The "🎁 FREE" button beside a price while this month's Pro gift is unspent. The first tap asks, the second takes it.
   * @param {object} item a Locker item
   * @param {function(): void} done what to do after it is claimed (equip, redraw)
   * @returns {HTMLElement|null}
   */
  _giftButton(item, done) {
    var self = this;
    if (!proGiftState().available || storage.ownsItem(item.id)) return null;
    var btn = createElement('button', { className: 'btn btn-gift btn-sm', text: '🎁 FREE', attributes: { type: 'button', 'aria-label': 'Use your monthly Pro gift on ' + item.name } });
    var armed = false;
    var timer = null;
    btn.addEventListener('click', function () {
      if (!armed) {
        armed = true;
        setText(btn, 'Pick this? Tap again');
        timer = setTimeout(function () { armed = false; setText(btn, '🎁 FREE'); }, 4000);
        return;
      }
      clearTimeout(timer);
      if (!storage.claimProGift(item.id, proGiftState().key)) { self._showToast('Your gift is already used this month.'); self.renderShop(); return; }
      audio.play('buy');
      trackEvent('pro_gift_claimed', { item: String(item.id).slice(0, 40) });
      var earned = storage.afterPurchase();
      if (earned.length) self.showAchievementNotification(earned);
      self._showToast('🎁 ' + item.name + ' is yours. Your Pro gift is back next month!');
      done();
    });
    return btn;
  },

  renderShop() {
    var self = this;
    var shopCoinsEl = document.getElementById('shopCoins');
    if (shopCoinsEl) setText(shopCoinsEl, storage.get('coins'));
    var giftBar = document.getElementById('shopGiftBar');
    if (giftBar) {
      var gs = proGiftState();
      giftBar.hidden = !gs.eligible;
      giftBar.classList.toggle('shop-gift-used', gs.eligible && !gs.available);
      if (gs.eligible) {
        setText(giftBar, gs.available
          ? '🎁 Your Pro gift: pick any one item below and tap 🎁 FREE. It is on the house, once a month, counted from when you joined Pro.'
          : '🎁 Pro gift used for now. Your next free pick opens ' + new Date(gs.nextAt).toLocaleDateString(undefined, { month: 'long', day: 'numeric' }) + '.');
      }
    }

    var renderGroup = function (type, title, filter, note) {
      var items = LOCKER_ITEMS.filter(function (i) { return i.type === type; });
      if (filter) items = items.filter(filter);
      // cheapest first (free ones on top), so what you can afford is always at the top of the list
      items = items.map(function (it, idx) { return { it: it, idx: idx }; }).sort(function (a, b) { return (a.it.price - b.it.price) || (a.idx - b.idx); }).map(function (x) { return x.it; });
      if (type === 'skin') {
        items = items.filter(function (i) {
          if (i.id === 'avatar_golden' && !storage.hasAchievement('ach_golden_doctor')) return false;
          return true;
        });
      }
      var equipped = storage.get('equipped');
      var container = createElement('div');

      var heading = createElement('h3', { text: title });
      heading.style.cssText = 'margin:12px 0 6px;font-size:14px;color:var(--text-secondary)';
      container.appendChild(heading);
      if (note) {
        var noteEl = createElement('div', { className: 'setting-sublabel', text: note });
        noteEl.style.cssText = 'margin:-2px 0 8px;line-height:1.4';
        container.appendChild(noteEl);
      }

      items.forEach(function (item) {
        var owned = storage.ownsItem(item.id);
        var isEquipped = equipped[type] === item.id;

        var row = createElement('div', {
          className: 'shop-item stacked' + (isEquipped ? ' equipped' : '')
        });

        // Color swatch
        var colorHex = item.color ? '#' + item.color.toString(16).padStart(6, '0') : '#333';
        var swatch = createElement('div', { text: item.icon || '' });
        swatch.style.cssText = 'width:36px;height:36px;border-radius:8px;background:' + colorHex + ';flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:16px';
        row.appendChild(swatch);

        // Name
        var nameWrap = createElement('div');
        nameWrap.style.flex = '1';
        nameWrap.appendChild(createElement('div', { text: item.name }));
        nameWrap.firstChild.style.cssText = 'font-size:13px;font-weight:700';
        if ((self._lockerFresh || []).indexOf(item.id) >= 0) {
          var itemDot = createElement('span', { className: 'new-dot', attributes: { 'aria-label': 'You can afford this now', title: 'You can afford this now' } });
          nameWrap.firstChild.appendChild(itemDot);
        }
        var story = storyFor(item.id);
        if (story || item.desc) {
          var descLine = createElement('div', { className: 'setting-sublabel', text: story ? story.short : item.desc });
          descLine.style.cssText = 'font-size:11px;line-height:1.3;margin-top:2px';
          nameWrap.appendChild(descLine);
        }
        if (story) {
          var longLine = createElement('div', { className: 'story-long', text: story.long, attributes: { id: 'story-' + item.id } });
          longLine.hidden = true;
        }
        row.appendChild(nameWrap);

        if (story) row.appendChild(longLine);

        // Buttons
        var btnWrap = createElement('div');
        btnWrap.style.cssText = 'display:flex;align-items:center;gap:2px';

        // Try-on: shows the item in the display at the top (a trail streams behind the character, a monster takes
        // its place). For trails and monsters, tapping the row does the same.
        var showItem = function () {
          if (type === 'pal') {
            // a buddy has no 3D model: let it say hello in its own voice
            var palDef = getPal(item.id);
            self._showToast(palDef ? palDef.emoji + ' ' + palDef.name + ': ' + palLine(palDef, 'greet', storage.getStreakStatus().streak) : 'No buddy on the Home screen');
            return;
          }
          trackEvent('item_previewed', { item_id: item.id, item_type: type, owned: storage.ownsItem(item.id), affordable: (storage.get('coins') || 0) >= (item.price || 0) });
          if (self.characterPreview) self.characterPreview.previewItem(item.id, type);
        };
        if (story) {
          var storyBtn = createElement('button', {
            className: 'btn btn-outline btn-sm story-btn',
            text: '📖',
            attributes: { type: 'button', 'aria-label': 'Story of ' + item.name, 'aria-expanded': 'false', 'aria-controls': 'story-' + item.id }
          });
          storyBtn.style.cssText = 'font-size:10px;padding:4px 8px;margin-left:4px';
          storyBtn.addEventListener('click', function () {
            var open = longLine.hidden;
            longLine.hidden = !open;
            storyBtn.setAttribute('aria-expanded', String(open));
          });
          btnWrap.appendChild(storyBtn);
        }
        var tryBtn = createElement('button', {
          className: 'btn btn-outline btn-sm',
          text: '👁',
          attributes: { 'aria-label': 'Preview ' + item.name },
          dataset: { preview: item.id, prevslot: type }
        });
        tryBtn.style.cssText = 'font-size:10px;padding:4px 8px;margin-left:4px';
        tryBtn.addEventListener('click', showItem);
        btnWrap.appendChild(tryBtn);
        // A paint icon marks the characters whose colors can be changed, and takes you to their colors
        var avatarDef = type === 'skin' ? AVATARS.filter(function (a) { return a.id === item.id; })[0] : null;
        if (avatarDef && avatarDef.parts && avatarDef.parts.length) {
          var paintBtn = createElement('button', {
            className: 'btn btn-outline btn-sm paint-btn',
            text: '🎨',
            attributes: { type: 'button', 'aria-label': owned ? 'Change ' + item.name + '\'s colors' : item.name + ' can be recolored once you own it', title: owned ? 'Change colors' : 'Can be recolored once you own it' },
            dataset: { paint: item.id }
          });
          paintBtn.style.cssText = 'font-size:11px;padding:4px 8px;margin-left:4px';
          if (!owned) paintBtn.style.opacity = '0.55';
          paintBtn.addEventListener('click', function () {
            if (!owned) { self._showToast('Unlock ' + item.name + ' to change its colors.'); return; }
            if (!isEquipped) {
              storage.equipItem(item.id, 'skin');
              audio.play('equip');
              if (self.onEquipChange) self.onEquipChange();
            }
            self._lockerTab = 'heroes';
            self._heroColorsOpen = true;
            self.renderShop();
            if (self.characterPreview) { self.characterPreview.clearPreview(); self.characterPreview.rebuildCharacter(); }
          });
          btnWrap.appendChild(paintBtn);
        }

        if (type === 'trail' || type === 'monster' || type === 'pal') {
          row.style.cursor = 'pointer';
          row.addEventListener('click', function (e) {
            if (e.target && e.target.closest && e.target.closest('button')) return;
            showItem();
          });
        }

        if (isEquipped) {
          var eqLabel = createElement('span', { text: 'EQUIPPED' });
          eqLabel.style.cssText = 'color:var(--accent-cyan);font-size:11px;font-weight:700';
          btnWrap.appendChild(eqLabel);
        } else if (owned) {
          var equipBtn = createElement('button', {
            className: 'btn btn-outline btn-sm',
            text: 'Equip'
          });
          equipBtn.addEventListener('click', function () {
            storage.equipItem(item.id, type);
            audio.play('equip');
            self.renderShop();
            if (self.characterPreview) {
              self.characterPreview.clearPreview();
              // what was just equipped stays on show
              if (type === 'monster') self.characterPreview.previewItem(item.id, 'monster');
            }
            if (self.onEquipChange) self.onEquipChange();
          });
          btnWrap.appendChild(equipBtn);
        } else {
          var buyBtn = createElement('button', {
            className: 'btn btn-gold btn-sm',
            text: '🪙 ' + item.price
          });
          buyBtn.addEventListener('click', function () {
            if (storage.buyItem(item.id, item.price)) {
              audio.play('buy');
              var earned = storage.afterPurchase();
              if (earned.length) self.showAchievementNotification(earned);
              // what you just bought is worn straight away
              storage.equipItem(item.id, type);
              if (self.onEquipChange) self.onEquipChange();
              self.renderShop();
              if (self.characterPreview) {
                self.characterPreview.clearPreview();
                if (type === 'trail' || type === 'monster') self.characterPreview.previewItem(item.id, type);
              }
            } else {
              self._showToast('Need more coins! Keep running.');
            }
          });
          btnWrap.appendChild(buyBtn);
          var giftBtn = self._giftButton(item, function () {
            storage.equipItem(item.id, type);
            if (self.onEquipChange) self.onEquipChange();
            self.renderShop();
            if (self.characterPreview) {
              self.characterPreview.clearPreview();
              if (type === 'trail' || type === 'monster') self.characterPreview.previewItem(item.id, type);
            }
          });
          if (giftBtn) btnWrap.appendChild(giftBtn);
        }

        row.appendChild(btnWrap);
        container.appendChild(row);
      });

      return container;
    };

    // ----- Tabs: which characters you can pick, what you can customize, and extras -----
    var avatarOf = function (id) { return AVATARS.filter(function (a) { return a.id === id; })[0] || null; };
    var kindOf = function (id) {
      var a = avatarOf(id);
      if (!a) return 'classic';
      if (a.isVehicle) return 'vehicle';
      return a.isModel ? 'model' : 'classic';
    };
    var isKind = function (kind) {
      return function (item) { return kindOf(item.id) === kind; };
    };

    // Three tabs on one line: Heroes (with the colors of the hero you wear, right there), Trails and Monsters.
    // (Older saves of the tab name still work: 'characters' and 'customize' are Heroes, 'extras' is Trails.)
    var rawTab = this._lockerTab || 'heroes';
    var tab = rawTab === 'characters' || rawTab === 'customize' ? 'heroes' : (rawTab === 'extras' ? 'trails' : rawTab);
    if (tab === 'pals' && !FEATURES.studyBuddies) tab = 'heroes';
    if (rawTab === 'customize') this._heroColorsOpen = true;
    this._lockerTab = tab;
    // The Locker opens as one calm screen (the display, the tabs and what you wear). Tapping a tab opens its list
    // below (the page stays where it is: it never scrolls by itself); tapping the open tab again folds it away. (Undefined counts as open, for
    // callers that draw a particular tab directly.)
    var listOpen = this._lockerOpen === undefined || rawTab === 'customize' ? true : !!this._lockerOpen;
    if (rawTab === 'customize') this._lockerOpen = true;
    var shopItems = document.getElementById('shopItems');
    clearElement(shopItems);

    var tabBar = createElement('div', { className: 'locker-tabs' + (FEATURES.studyBuddies ? ' five' : ''), attributes: { role: 'tablist', 'aria-label': 'Locker sections' } });
    var fresh = this._lockerFresh || [];
    var tabOf = function (item) { return item.type === 'skin' ? 'heroes' : item.type === 'trail' ? 'trails' : item.type === 'monster' ? 'monsters' : item.type === 'map' ? 'maps' : item.type === 'pal' ? 'pals' : 'heroes'; };
    var freshTabs = {};
    LOCKER_ITEMS.forEach(function (item) { if (fresh.indexOf(item.id) >= 0) freshTabs[tabOf(item)] = (freshTabs[tabOf(item)] || 0) + 1; });
    [['heroes', '🦸', 'Heroes'], ['trails', '✨', 'Trails'], ['maps', '🗺️', 'Maps'], ['monsters', '👾', 'Monsters'], ['pals', '🐾', 'Pals']].filter(function (t) { return t[0] !== 'pals' || FEATURES.studyBuddies; }).forEach(function (t) {
      var b = createElement('button', {
        className: 'btn btn-sm locker-tab ' + (listOpen && tab === t[0] ? 'btn-primary' : 'btn-outline'),
        attributes: { type: 'button', role: 'tab', 'aria-selected': listOpen && tab === t[0] ? 'true' : 'false', 'aria-expanded': listOpen && tab === t[0] ? 'true' : 'false' }
      });
      b.addEventListener('click', function () {
        if (listOpen && self._lockerTab === t[0]) self._lockerOpen = false;
        else { self._lockerTab = t[0]; self._lockerOpen = true; trackEvent('tab_changed', { screen: 'shop', tab: String(t[0]) }); }
        self.renderShop();
        // changing tab sets the display to what suits it: your hero with the trail you wear, the monster you have
        // equipped, or a map
        self._syncLockerPreview();
      });
      b.appendChild(createElement('span', { className: 'tab-icon', text: t[1], attributes: { 'aria-hidden': 'true' } }));
      b.appendChild(document.createTextNode(t[2]));
      if (freshTabs[t[0]]) b.appendChild(createElement('span', { className: 'new-dot', attributes: { 'aria-label': 'New items you can afford' } }));
      tabBar.appendChild(b);
    });
    shopItems.appendChild(tabBar);

    if (!listOpen) {
      // folded: just the hero you wear (with its colors), so everything fits on one screen
      shopItems.appendChild(this._renderHeroCard(avatarOf, kindOf, renderGroup));
      document.dispatchEvent(new CustomEvent('dx:attention-changed'));
      return;
    }

    if (fresh.length) {
      var why = createElement('div', { className: 'locker-why', text: 'You can now afford ' + (fresh.length === 1 ? 'a new item' : fresh.length + ' new items') + '! Look for the red dots.' });
      shopItems.appendChild(why);
    }

    if (tab === 'heroes') {
      shopItems.appendChild(this._renderHeroCard(avatarOf, kindOf, renderGroup));
      shopItems.appendChild(renderGroup('skin', '🎬 Heroes', isKind('model'),
        'A 🎨 beside a hero means you can change its colors. Tap it to start.'));
      if (!ARCHIVE_CLASSIC) shopItems.appendChild(renderGroup('skin', '🧱 Classic characters', isKind('classic'),
        'Fully customizable: colors, clothing, headwear and gear all work on these.'));
      if (!ARCHIVE_CLASSIC) shopItems.appendChild(renderGroup('skin', '🚗 Vehicles', isKind('vehicle'),
        'Ride in style. Vehicles cannot wear hats, clothing or gear.'));
    } else if (tab === 'trails') {
      shopItems.appendChild(renderGroup('trail', '✨ Trails', null, 'Trails work with every hero. Tap one to see it in the display above.'));
    } else if (tab === 'maps') {
      shopItems.appendChild(this._renderMapsTab());
    } else if (tab === 'pals') {
      shopItems.appendChild(renderGroup('pal', '🐾 Study buddies', null, 'A buddy lives on your Home screen. It cheers your streaks, naps when you are away and cheers you on in its own way. Tap one to hear it say hello.'));
    } else {
      shopItems.appendChild(renderGroup('monster', '👾 Exam Monsters', null, 'The monster that chases you. Tap one to see it in the display above.'));
    }
    document.dispatchEvent(new CustomEvent('dx:attention-changed')); // (the tabs wear their red dots)
  },

  /** Put the display at the top of the Locker in step with the tab: hero + trail, the equipped monster, or a map. */
  _syncLockerPreview() {
    var cp = this.characterPreview;
    if (!cp) return;
    var tab = this._lockerTab;
    cp.showTrail = tab === 'trails';
    cp.clearPreview();
    if (tab === 'monsters') {
      var monster = (storage.get('equipped') || {}).monster;
      if (monster) cp.previewItem(monster, 'monster');
    } else if (tab === 'maps') {
      var fav = SKINS.filter(function (s) { return s.name === storage.get('preferredMap'); })[0];
      var first = LOCKER_ITEMS.filter(function (i) { return i.type === 'map'; })[0];
      var id = fav ? fav.id : (first && first.skinId);
      if (id && cp.previewMap) cp.previewMap(id);
    }
  },

  /**
   * The Maps tab: the indoor hospital maps are free for everyone; the rest are bought here. Every map you own
   * joins the rotation, and one can be made your favorite (a run then stays on it).
   */
  _renderMapsTab() {
    var self = this;
    var wrap = createElement('div');
    var free = SKINS.filter(isIndoorSkin);
    var heading = createElement('h3', { text: '🗺️ Maps' });
    heading.style.cssText = 'margin:12px 0 6px;font-size:14px;color:var(--text-secondary)';
    wrap.appendChild(heading);
    var intro = createElement('div', { className: 'setting-sublabel', text: 'Runs rotate through the maps you own. The ' + free.length + ' hospital rooms are yours from the start. Every other map unlocks as a reward, one more every ' + UNLOCK_EVERY + ' levels, or you can buy it early. Tap one to see it above.' });
    intro.style.cssText = 'margin:-2px 0 8px;line-height:1.4';
    wrap.appendChild(intro);

    // in the order they unlock
    LOCKER_ITEMS.filter(function (i) { return i.type === 'map'; }).sort(function (a, b) { return (mapUnlockLevel(a.id) || 999) - (mapUnlockLevel(b.id) || 999); }).forEach(function (item) {
      var owned = storage.ownsItem(item.id);
      var skin = SKINS.filter(function (s) { return s.id === item.skinId; })[0];
      var isFavorite = !!skin && storage.get('preferredMap') === skin.name;
      var row = createElement('div', { className: 'shop-item stacked' + (isFavorite ? ' equipped' : ''), attributes: { 'data-map': item.id } });

      var swatch = createElement('div', { text: item.icon || '' });
      swatch.style.cssText = 'width:36px;height:36px;border-radius:8px;background:#' + item.color.toString(16).padStart(6, '0') + ';flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:16px';
      row.appendChild(swatch);

      var nameWrap = createElement('div');
      nameWrap.style.flex = '1';
      nameWrap.appendChild(createElement('div', { text: item.name }));
      nameWrap.firstChild.style.cssText = 'font-size:13px;font-weight:700';
      var unlockAt = mapUnlockLevel(item.id);
      var reached = unlockAt > 0 && levelFromXp(storage.get('xp') || 0).level >= unlockAt;
      var descLine = createElement('div', { className: 'setting-sublabel', text: item.desc + (owned ? (reached && storage.data.progression.ownedItems.indexOf(item.id) < 0 ? ' · Unlocked at level ' + unlockAt : '') : ' · Unlocks at level ' + unlockAt + ' (or buy it now)') });
      descLine.style.cssText = 'font-size:11px;line-height:1.3;margin-top:2px';
      nameWrap.appendChild(descLine);
      if (storage.secretFound(item.name)) nameWrap.firstChild.appendChild(createElement('span', { text: ' 🔎', attributes: { title: 'You found this map\'s secret', 'aria-label': 'Secret found' } }));
      if ((self._lockerFresh || []).indexOf(item.id) >= 0) {
        nameWrap.firstChild.appendChild(createElement('span', { className: 'new-dot', attributes: { 'aria-label': 'You can afford this now', title: 'You can afford this now' } }));
      }
      row.appendChild(nameWrap);

      var btnWrap = createElement('div');
      btnWrap.style.cssText = 'display:flex;align-items:center;gap:2px';
      var seeMap = function () { if (self.characterPreview && self.characterPreview.previewMap) self.characterPreview.previewMap(item.skinId); };
      var eye = createElement('button', { className: 'btn btn-outline btn-sm', text: '\uD83D\uDC41', attributes: { type: 'button', 'aria-label': 'Preview ' + item.name } });
      eye.style.cssText = 'font-size:10px;padding:4px 8px;margin-left:4px';
      eye.addEventListener('click', seeMap);
      btnWrap.appendChild(eye);
      row.style.cursor = 'pointer';
      row.addEventListener('click', function (e) { if (e.target && e.target.closest && e.target.closest('button')) return; seeMap(); });
      if (owned) {
        var fav = createElement('button', {
          className: 'btn btn-outline btn-sm',
          text: isFavorite ? '★ Favorite' : '☆ Favorite',
          attributes: { type: 'button', 'aria-pressed': isFavorite ? 'true' : 'false', 'aria-label': (isFavorite ? 'Stop using ' : 'Always run on ') + item.name }
        });
        fav.addEventListener('click', function () {
          storage.set('preferredMap', isFavorite ? '' : skin.name);
          audio.play('equip');
          self.renderShop();
        });
        btnWrap.appendChild(fav);
      } else {
        var buy = createElement('button', { className: 'btn btn-gold btn-sm', text: '🪙 ' + item.price, attributes: { type: 'button', 'aria-label': 'Buy ' + item.name + ' for ' + item.price + ' coins' } });
        buy.addEventListener('click', function () {
          if (storage.buyItem(item.id, item.price)) {
            audio.play('buy');
            var earned = storage.afterPurchase();
            if (earned.length) self.showAchievementNotification(earned);
            self._showToast(item.name + ' unlocked. It is now in your map rotation.');
            self.renderShop();
          } else {
            self._showToast('Need more coins! Keep running.');
          }
        });
        btnWrap.appendChild(buy);
        var mapGift = self._giftButton(item, function () { self.renderShop(); });
        if (mapGift) btnWrap.appendChild(mapGift);
      }
      row.appendChild(btnWrap);
      wrap.appendChild(row);
    });
    return wrap;
  },

  /**
   * The card at the top of the Heroes tab: who you are wearing, and (if that hero can be recolored) a button that
   * opens the colors right here. The colors are part of the hero, not a tab of their own.
   */
  _renderHeroCard(avatarOf, kindOf, renderGroup) {
    var self = this;
    var eqSkin = storage.get('equipped').skin || 'avatar_intern';
    var eqAvatar = avatarOf(eqSkin);
    var kind = kindOf(eqSkin);
    var recolorable = kind === 'model' && !!(eqAvatar && eqAvatar.parts && eqAvatar.parts.length);

    var wrap = createElement('div', { className: 'hero-card' });
    var head = createElement('div', { className: 'hero-card-head' });
    var title = createElement('div', { className: 'hero-card-title' });
    title.appendChild(createElement('span', { className: 'hero-card-label', text: 'You are wearing' }));
    title.appendChild(createElement('strong', { text: eqAvatar ? eqAvatar.name : eqSkin }));
    head.appendChild(title);
    if (recolorable) {
      var open = !!this._heroColorsOpen;
      var toggle = createElement('button', {
        className: 'btn btn-sm ' + (open ? 'btn-primary' : 'btn-outline'),
        text: open ? '🎨 Hide colors' : '🎨 Change colors',
        attributes: { type: 'button', id: 'heroColorsToggle', 'aria-expanded': open ? 'true' : 'false' }
      });
      toggle.addEventListener('click', function () { self._heroColorsOpen = !self._heroColorsOpen; self.renderShop(); });
      head.appendChild(toggle);
    }
    wrap.appendChild(head);

    if (!recolorable && kind === 'model') {
      wrap.appendChild(createElement('div', { className: 'setting-sublabel', text: 'This hero keeps its own look.' }));
    } else if (kind === 'vehicle') {
      wrap.appendChild(createElement('div', { className: 'setting-sublabel', text: 'Vehicles cannot wear anything. Pick a hero to change colors.' }));
    }
    if (recolorable && this._heroColorsOpen) wrap.appendChild(this._renderModelColors(eqAvatar));
    if (kind === 'classic') {
      wrap.appendChild(this._renderColorPickers());
      wrap.appendChild(renderGroup('hat', '🧢 Headwear'));
      wrap.appendChild(renderGroup('clothing', '🥼 Clothing'));
      wrap.appendChild(renderGroup('gear', '🩺 Gear'));
    }
    return wrap;
  },
};
