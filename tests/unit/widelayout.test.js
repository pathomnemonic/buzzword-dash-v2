import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { WIDE_QUERY, WIDE_PANEL_PX, isWideLayout, trackShiftPx, applyTrackShift } from '../../js/game/widelayout.js';

const win = (matches) => ({ matchMedia: (q) => ({ matches: matches && q === WIDE_QUERY }) });

describe('wide landscape layout', () => {
  it('the stylesheet uses the same condition and the same column width as the 3D view', () => {
    const css = readFileSync('css/arcade.css', 'utf8');
    expect(css).toContain('@media ' + WIDE_QUERY + ' {');
    expect(css).toContain('--wide-panel: ' + WIDE_PANEL_PX + 'px');
  });

  it('is off without matchMedia, and follows the query when there is one', () => {
    expect(isWideLayout({})).toBe(false);
    expect(isWideLayout(win(false))).toBe(false);
    expect(isWideLayout(win(true))).toBe(true);
  });

  it('slides the track half a column to the right on a wide screen, and not at all otherwise', () => {
    expect(trackShiftPx(win(true))).toBe(WIDE_PANEL_PX / 2);
    expect(trackShiftPx(win(false))).toBe(0);
  });

  it('puts the track in the middle of the free space, and puts it back', () => {
    const cam = new THREE.PerspectiveCamera(70, 1440 / 800, 0.1, 300);
    applyTrackShift(cam, 1440, 800, win(true));
    expect(cam.view.enabled).toBe(true);
    expect(cam.view.offsetX).toBe(-WIDE_PANEL_PX / 2);
    // the point straight ahead now lands right of the screen center, half a column over
    const p = new THREE.Vector3(0, 0, -10).applyMatrix4(cam.matrixWorldInverse).applyMatrix4(cam.projectionMatrix);
    expect((p.x * 1440) / 2).toBeCloseTo(WIDE_PANEL_PX / 2, 0);
    applyTrackShift(cam, 1440, 800, win(false));
    expect(cam.view.enabled).toBe(false);
    expect(applyTrackShift(null, 1, 1)).toBeUndefined();
  });
});
