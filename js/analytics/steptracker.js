/**
 * steptracker.js — the same few events for any step-by-step flow (the tutorials and the app tour): which step was
 * seen, how long it took, and how the flow ended. Analytics-safe: sends only step ids and counts.
 */

import { track } from './index.js';

/**
 * @param {'real_track'|'practice'|'tour'} kind
 * @param {{firstTime?: boolean, now?: function(): number, send?: function(string, object): *}} [o]
 */
export function createStepTracker(kind, o) {
  o = o || {};
  var now = o.now || function () { return Date.now(); };
  var send = o.send || track;
  var startedAt = now();
  var stepAt = startedAt;
  var current = '';
  var currentIndex = -1;
  var seen = {};
  var done = 0;
  var ended = false;
  send('tutorial_started', { kind: kind, first_time: !!o.firstTime });

  function leave(outcome) {
    if (!current) return;
    if (outcome === 'completed') done++;
    send('tutorial_step', { step: current, index: currentIndex, outcome: outcome, ms: now() - stepAt, kind: kind });
    current = '';
  }

  return {
    /** A step is now showing (the previous one, if any, was completed). */
    view: function (id, index) {
      if (ended) return;
      leave('completed');
      current = String(id || 'step');
      currentIndex = index;
      stepAt = now();
      if (!seen[current]) { seen[current] = true; send('tutorial_step', { step: current, index: index, outcome: 'viewed', kind: kind }); }
    },
    /** The flow ended: 'completed' (reached the end), 'skipped' (left early), or 'replaced'. */
    end: function (result, confirmShown) {
      if (ended) return;
      ended = true;
      var last = current;
      if (result === 'completed') leave('completed'); else leave('skipped');
      send('tutorial_ended', { outcome: result === 'completed' ? 'finished' : result === 'replaced' ? 'replaced' : 'exited', last_step: last, steps_done: done, ms: now() - startedAt, exit_confirm_shown: !!confirmShown, kind: kind });
    }
  };
}
