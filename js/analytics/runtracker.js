/**
 * runtracker.js — turns what the game engine reports during a run into the run_start, run_end and run_cards
 * analytics events (and the smaller in-run events: power-ups, fusions, hazards, map changes, secrets, coin chains).
 *
 * It listens to the engine's own event stream (game.setEventSink), so the engine does not need to know analytics
 * exists. Nothing here touches the page; the caller supplies the clock and reads the live game when it needs to.
 */

/** Frame-time histogram: counts of frames per millisecond of frame time, so the average and the slow end are cheap to keep. */
export function createFrameMeter() {
  var bins = new Array(251).fill(0); // 0..250 ms, the last bin holds everything slower
  var frames = 0;
  var totalMs = 0;
  var slow = 0;
  return {
    /** Add one frame's duration. Gaps over 1 second (the tab was hidden) are not frames. */
    add: function (ms) {
      if (!(ms > 0) || ms > 1000) return;
      var bin = Math.min(250, Math.round(ms));
      bins[bin]++;
      frames++;
      totalMs += ms;
      if (ms > 40) slow++;
    },
    frames: function () { return frames; },
    slowFrames: function () { return slow; },
    /** Average frames per second over everything recorded. */
    avgFps: function () { return frames ? Math.round(1000 / (totalMs / frames)) : 0; },
    /** The frame rate of the slowest 5% of frames (what a stutter feels like). */
    p5Fps: function () {
      if (!frames) return 0;
      var target = Math.ceil(frames * 0.05);
      var seen = 0;
      for (var b = 250; b >= 0; b--) {
        seen += bins[b];
        if (seen >= target) return b > 0 ? Math.round(1000 / b) : 0;
      }
      return 0;
    },
    reset: function () { bins.fill(0); frames = 0; totalMs = 0; slow = 0; }
  };
}

function median(list) {
  if (!list.length) return 0;
  var a = list.slice().sort(function (x, y) { return x - y; });
  var mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid] : Math.round((a[mid - 1] + a[mid]) / 2);
}

function inc(map, key, by) { map[key] = (map[key] || 0) + (by === undefined ? 1 : by); }

/**
 * @param {{now?: function(): number, track: function(string, object): *, game?: object}} deps
 *   track: sends an event; game: the live engine, read for the current streak, map and coin balance
 */
export function createRunTracker(deps) {
  var now = deps.now || function () { return Date.now(); };
  var track = deps.track;
  var game = deps.game || {};
  var frames = createFrameMeter();
  var run = null;

  function sec() { return run ? Math.max(0, Math.round((now() - run.startedAt) / 1000)) : 0; }
  function mapName() { return game.currentSkin && game.currentSkin.name ? game.currentSkin.name : ''; }

  var self = {
    active: function () { return !!run; },
    runId: function () { return run ? run.id : null; },
    frames: frames,

    /** The run began (the engine's run_started). `config` is what was set up for it. */
    start: function (id, mode, config) {
      frames.reset();
      run = {
        id: id, mode: mode, startedAt: now(), config: config || {}, powerups: {}, fusions: {}, hazards: {}, subjects: {}, subjectCorrect: {}, maps: [], decisions: [],
        correctDecisions: [], rows: [], secrets: 0, coinsAir: 0, chainMax: 0, chain: 0, chainAir: 0, livesLostGate: 0, livesLostObstacle: 0, obstaclesHit: 0,
        monsterWarnings: 0, monsterCaught: false, pauses: 0, pausedMs: 0, pauseStart: 0, continueOffered: false, continueAccepted: false, continueCost: 0,
        mapChanges: 0, autoPilots: 0, fpsTierEnd: '', unique: {}, repeats: 0, lastMap: mapName(), speedStart: Number(config && config.speed_dial) || 0, ended: false
      };
      if (run.lastMap) run.maps.push(run.lastMap);
    },

    /** One engine event (the same stream game.setEventSink receives). */
    event: function (type, payload) {
      if (!run) return;
      payload = payload || {};
      var i;
      switch (type) {
        case 'encounter_resolved': {
          var er = payload.encounterResult || {};
          var card = payload.card || er.card || {};
          var ok = !!payload.correct;
          var ms = Math.max(0, Math.round(er.decisionMs || 0));
          run.decisions.push(ms);
          if (ok) run.correctDecisions.push(ms);
          var subj = String(card.subj || 'unknown');
          inc(run.subjects, subj);
          if (ok) inc(run.subjectCorrect, subj);
          if (run.unique[card.id]) run.repeats++; else run.unique[card.id] = true;
          var wrongIndex = -1;
          if (!ok && Array.isArray(card.d)) wrongIndex = card.d.indexOf(er.choice);
          run.rows.push([String(card.id || ''), ok ? 1 : 0, ms, er.committedLane === undefined ? -1 : er.committedLane, er.correctLane === undefined ? -1 : er.correctLane,
            wrongIndex, er.rushed ? 1 : 0, game.streak || 0]);
          break;
        }
        case 'damage_taken':
          if (payload.source === 'wrong_answer') run.livesLostGate++;
          else if (payload.source === 'obstacle') { run.livesLostObstacle++; run.obstaclesHit++; }
          break;
        case 'coin_collected':
          if (payload.type === 'coin' && typeof payload.chain === 'number') {
            if (payload.air) run.coinsAir++;
            var len = payload.chain + 1;
            if (payload.chain === 0 && run.chain >= 10) track('coin_chain', { length: run.chain, air: run.chainAir, run_id: run.id });
            if (payload.chain === 0) { run.chain = 0; run.chainAir = 0; }
            run.chain = len;
            if (payload.air) run.chainAir++;
            if (len > run.chainMax) run.chainMax = len;
          }
          break;
        case 'powerup_collected':
          inc(run.powerups, String(payload.type || 'unknown'));
          track('powerup_collected', { type: String(payload.type || 'unknown'), run_id: run.id, second_into_run: sec() });
          break;
        case 'powerup_fused':
          inc(run.fusions, String(payload.id || 'unknown'));
          track('powerup_fused', { fusion: String(payload.id || 'unknown'), run_id: run.id });
          break;
        case 'autopilot_used':
          run.autoPilots++;
          track('auto_pilot_used', { run_id: run.id });
          break;
        case 'hazard_started':
          inc(run.hazards, String(payload.type || 'unknown'));
          track('hazard_started', { kind: String(payload.type || 'unknown'), map: mapName(), run_id: run.id });
          break;
        case 'secret_found':
          run.secrets++;
          track('secret_found', { map: mapName(), first_time: !!payload.first, coins: payload.coins || 0 });
          break;
        case 'streak_milestone':
          track('streak_milestone', { streak: payload.streak, multiplier: payload.multiplier, run_id: run.id });
          break;
        case 'skin_transition_started': {
          var to = String(payload.skinName || '');
          var from = run.lastMap;
          run.mapChanges++;
          if (to && run.maps.indexOf(to) < 0) run.maps.push(to);
          track('map_changed', { from: from, to: to, run_id: run.id, answers_on_from: (game.mapAnswers && game.mapAnswers[from]) || 0 });
          run.lastMap = to;
          break;
        }
        case 'monster_warning':
          run.monsterWarnings++;
          track('monster_event', { kind: 'warning', run_id: run.id });
          break;
        case 'monster_caught':
          run.monsterCaught = true;
          track('monster_event', { kind: 'caught', run_id: run.id });
          break;
        case 'continue_requested':
          run.continueOffered = true;
          run.continueCost = payload.cost || 0;
          break;
        case 'continue_applied':
          run.continueAccepted = true;
          track('continue_prompt', { run_id: run.id, cost: run.continueCost, coins: game.coins || 0, affordable: true, accepted: true, score: game.score || 0 });
          run.continueResolved = true;
          track('coins_spent', { on: 'continue', amount: run.continueCost, coins_before: (game.coins || 0) + run.continueCost });
          break;
        case 'state_changed':
          if (payload.to === 'paused') { run.pauseStart = now(); }
          else if (payload.from === 'paused' && run.pauseStart) {
            run.pauses++;
            var paused = now() - run.pauseStart;
            run.pausedMs += paused;
            run.pauseStart = 0;
            track('run_resumed', { run_id: run.id, paused_s: Math.round(paused / 1000) });
          }
          if (payload.to === 'paused') {
            track('run_paused', { run_id: run.id, reason: typeof document !== 'undefined' && document.visibilityState === 'hidden' ? 'visibility' : 'button', second_into_run: sec() });
          }
          break;
        default:
          break;
      }
      i = 0; void i;
    },

    /** Frame time in milliseconds (call once per drawn frame while a run is going). */
    frame: function (ms) { if (run) frames.add(ms); },

    /** The packed question rows split into events of at most 40 rows. */
    cardEvents: function (mode) {
      if (!run) return [];
      var parts = [];
      for (var i = 0; i < run.rows.length; i += 40) parts.push(run.rows.slice(i, i + 40));
      return parts.map(function (rows, n) {
        return { run_id: run.id, mode: mode || run.mode, part: n + 1, parts: parts.length, rows: rows, subjects: Object.keys(run.subjects).slice(0, 20) };
      });
    },

    /**
     * Everything about the finished run, for the run_end event.
     * @param {object} summary the engine's canonical run summary
     * @param {object} extra { level_before, level_after, xp_gain, new_best, ranked, quests_completed, achievements, map_masteries, coins_wallet_after, run_number, session_run_index, tier_end, res_scale, scenery_density }
     */
    endProps: function (summary, extra) {
      if (!run) return null;
      extra = extra || {};
      summary = summary || {};
      var durationS = Math.max(0, Math.round((summary.durationMs || (now() - run.startedAt)) / 1000));
      var pausedS = Math.round(run.pausedMs / 1000);
      var answered = (summary.correct || 0) + (summary.wrong || 0);
      var fastest = run.correctDecisions.length ? Math.min.apply(null, run.correctDecisions) : 0;
      var slowest = run.decisions.length ? Math.max.apply(null, run.decisions) : 0;
      var avg = run.decisions.length ? Math.round(run.decisions.reduce(function (a, b) { return a + b; }, 0) / run.decisions.length) : 0;
      var lostTotal = run.livesLostGate + run.livesLostObstacle;
      return {
        run_id: run.id, mode: run.mode, reason: summary.endReason || 'other',
        duration_s: durationS, active_s: Math.max(0, durationS - pausedS), paused_s: pausedS, pauses: run.pauses,
        score: summary.score || 0, answered: answered, correct: summary.correct || 0, wrong: summary.wrong || 0,
        accuracy: answered ? Math.round((summary.correct / answered) * 1000) / 1000 : 0, best_streak: summary.bestStreak || 0, streak_end: game.streak || 0,
        avg_decision_ms: avg, median_decision_ms: median(run.decisions), fastest_decision_ms: fastest, slowest_decision_ms: slowest,
        rushes: summary.rushesUsed || 0, auto_pilots: run.autoPilots,
        obstacles_jumped: summary.obstaclesJumped || 0, obstacles_slid: summary.obstaclesSlid || 0, obstacles_hit: run.obstaclesHit,
        lives_start: Number(run.config.lives) || 0, lives_lost: lostTotal, lives_lost_gate: run.livesLostGate, lives_lost_obstacle: run.livesLostObstacle,
        coins_pickup: summary.coinsCollected || 0, coins_total: summary.coinsEarned || 0, coins_air: run.coinsAir, coin_chain_max: run.chainMax,
        coins_missed: game.runCoinsMissed || 0, powerups: run.powerups, fusions: run.fusions, secrets: run.secrets,
        continue_offered: run.continueOffered, continued: !!summary.continued, monster_caught: run.monsterCaught, monster_warnings: run.monsterWarnings,
        hazards: run.hazards, maps: run.maps.slice(0, 20), map_changes: run.mapChanges, speed_start: run.speedStart, speed_end: Number(game.speed ? game.speed / 1.875 : 0) || 0,
        xp_gain: extra.xp_gain || 0, level_before: extra.level_before || 0, level_after: extra.level_after || 0, new_best: !!extra.new_best,
        ranked: extra.ranked !== false && !summary.custom, custom: !!summary.custom, unique_cards: Object.keys(run.unique).length, repeat_cards: run.repeats,
        subjects: run.subjects, subject_correct: run.subjectCorrect, fps_avg: frames.avgFps(), fps_p5: frames.p5Fps(), frames_slow: frames.slowFrames(),
        tier_end: extra.tier_end || '', res_scale: extra.res_scale || 0, scenery_density: extra.scenery_density || 0, coins_wallet_after: extra.coins_wallet_after || 0,
        quests_completed: extra.quests_completed || 0, achievements: extra.achievements || 0, map_masteries: extra.map_masteries || 0,
        session_run_index: extra.session_run_index || 0, run_number: extra.run_number || 0
      };
    },

    /** The "continue?" offer, when it was turned down (accepted ones are sent as they happen). */
    unresolvedContinue: function () {
      return run && run.continueOffered && !run.continueResolved ? { run_id: run.id, cost: run.continueCost, coins: game.coins || 0, affordable: (game.coins || 0) >= run.continueCost, accepted: false, score: game.score || 0 } : null;
    },

    /** The run is over: forget it. */
    finish: function () { run = null; }
  };
  return self;
}
