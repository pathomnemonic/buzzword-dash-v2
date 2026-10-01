import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  START_STYLES, CAMERA_STYLES, LOOKBACK_STYLE, LOOKBACK_HOLD, DEATH_STYLES, INTRO_DURATION, DEATH_DURATION,
  getStartPose, getIntroCamera, pickDeathStyle, getDeathPose
} from '../../js/game/cinematics.js';
import { isTouchFirst, getControlText } from '../../js/controlhints.js';
import { placeFloatingProp } from '../../js/game/scenery.js';

const finite = (pose) => Object.values(pose).every((v) => Number.isFinite(v));

describe('start animations', () => {
  it('has several distinct styles, each ending at rest so the run starts cleanly', () => {
    expect(START_STYLES.length).toBeGreaterThanOrEqual(5);
    START_STYLES.forEach((style) => {
      for (let t = 0; t <= INTRO_DURATION; t += 0.05) expect(finite(getStartPose(style, t).pose), `${style} ${t}`).toBe(true);
      const end = getStartPose(style, INTRO_DURATION + 0.1).pose;
      expect(end, style).toEqual({ x: 0, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scale: 1, squash: 1 });
    });
  });

  it('each style actually looks different from a plain idle at some point', () => {
    START_STYLES.forEach((style) => {
      let moved = false;
      for (let t = 0; t < INTRO_DURATION; t += 0.05) {
        const p = getStartPose(style, t).pose;
        if (p.x || p.y || p.z || p.rotX || p.rotY || p.rotZ || p.scale !== 1 || p.squash !== 1) moved = true;
      }
      expect(moved, style).toBe(true);
    });
  });

  it('the camera moves land on the normal chase view', () => {
    const base = { x: 0, y: 4.5, z: 10 };
    CAMERA_STYLES.forEach((style) => {
      const end = getIntroCamera(style, 5, base).position;
      expect(end, style).toEqual(base);
      const start = getIntroCamera(style, 0, base).position;
      expect(Object.values(start).every(Number.isFinite), style).toBe(true);
    });
  });
});

describe('death animations', () => {
  it('has a varied set and every one stays finite for its whole duration', () => {
    expect(DEATH_STYLES.length).toBeGreaterThanOrEqual(7);
    DEATH_STYLES.forEach((style) => {
      for (let t = 0; t <= DEATH_DURATION + 0.2; t += 0.04) {
        expect(finite(getDeathPose(style, t).pose), `${style} ${t}`).toBe(true);
        expect(getDeathPose(style, t).pose.scale, style).toBeGreaterThan(0);
      }
    });
  });

  it('picks deaths that suit the cause and does not repeat back to back', () => {
    const monster = new Set();
    for (let i = 0; i < 200; i++) monster.add(pickDeathStyle('monster'));
    expect([...monster].sort()).toEqual(['launch', 'poof', 'spin_out', 'tumble']);
    const overhead = new Set();
    for (let i = 0; i < 200; i++) overhead.add(pickDeathStyle('overhead'));
    expect(overhead.has('faceplant')).toBe(false);
    for (let i = 0; i < 100; i++) expect(pickDeathStyle('ground', 'tumble')).not.toBe('tumble');
  });

  it('big deaths make a mess and shake the camera', () => {
    const l = getDeathPose('launch', 0.02);
    expect(l.impact).toBe('sparkle');
    expect(l.camShake).toBeGreaterThan(0);
    expect(getDeathPose('launch', 0.7).pose.y).toBeGreaterThan(3);
  });
});

describe('controls wording', () => {
  it('keyboard wording for laptops, including touch-screen laptops', () => {
    expect(isTouchFirst({ coarse: false, fine: true, touchPoints: 10 })).toBe(false);
    const text = getControlText(false);
    expect(text.rush).toMatch(/Shift or Space/);
    expect(text.rush).not.toMatch(/tap/i);
    expect(text.move).toMatch(/arrow/i);
  });

  it('touch wording for phones and tablets', () => {
    expect(isTouchFirst({ coarse: true, fine: false, touchPoints: 5 })).toBe(true);
    expect(getControlText(true).rush).toMatch(/Double-tap/);
    expect(getControlText(true).move).toMatch(/Swipe/);
  });
});

describe('floating scenery', () => {
  it('never sits over the lanes, and farther layers are bigger and pass slower', () => {
    const near = [];
    const far = [];
    for (let i = 0; i < 300; i++) {
      const g = new THREE.Group();
      placeFloatingProp(g);
      expect(Math.abs(g.position.x), 'clear of the track').toBeGreaterThanOrEqual(9.4);
      expect(g.position.y).toBeGreaterThan(1);
      expect(g.userData.speed).toBeGreaterThan(0);
      (Math.abs(g.position.x) < 14.5 ? near : far).push(g);
    }
    expect(near.length).toBeGreaterThan(0);
    expect(far.length).toBeGreaterThan(0);
    const avg = (list, f) => list.reduce((a, g) => a + f(g), 0) / list.length;
    expect(avg(far, (g) => g.userData.speed)).toBeLessThan(avg(near, (g) => g.userData.speed));
    expect(avg(far, (g) => g.scale.x)).toBeGreaterThan(avg(near, (g) => g.scale.x));
  });
});

describe('look-back opening (the monster is behind you)', () => {
  const base = { x: 0, y: 4.5, z: 10 };

  it('starts in front of the runner, looking back toward the monster', () => {
    const cam = getIntroCamera(LOOKBACK_STYLE, 0, base);
    expect(cam.position.z).toBeLessThan(0);          // in front of the runner (who faces -z)
    expect(cam.lookAt.z).toBeGreaterThan(0);          // looking back along +z
  });

  it('holds on the monster, then swings around into the normal chase view', () => {
    const held = getIntroCamera(LOOKBACK_STYLE, LOOKBACK_HOLD * 0.9, base).position;
    const first = getIntroCamera(LOOKBACK_STYLE, 0, base).position;
    expect(held).toEqual(first);
    const end = getIntroCamera(LOOKBACK_STYLE, 5, base);
    expect(end.position).toEqual(base);
    expect(end.lookAt).toEqual({ x: 0, y: 1, z: -20 });
  });

  it('moves smoothly (no jumps) the whole way', () => {
    let prev = getIntroCamera(LOOKBACK_STYLE, 0, base).position;
    for (let t = 0.02; t <= 3; t += 0.02) {
      const p = getIntroCamera(LOOKBACK_STYLE, t, base).position;
      const step = Math.hypot(p.x - prev.x, p.y - prev.y, p.z - prev.z);
      expect(step, `t=${t}`).toBeLessThan(1.2);
      prev = p;
    }
  });

  it('is not part of the random pool', () => {
    expect(CAMERA_STYLES).not.toContain(LOOKBACK_STYLE);
  });
});
