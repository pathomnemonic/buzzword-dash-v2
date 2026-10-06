import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { CONCEPTS, VIDEOS } from '../../tools/make-ads.mjs';

describe('marketing ads', () => {
  it('every concept has a unique id, a real screenshot and a rendered file for each size', () => {
    var ids = CONCEPTS.map(function (c) { return c.id; });
    expect(new Set(ids).size).toBe(ids.length);
    CONCEPTS.forEach(function (c) {
      expect(existsSync('docs/marketing/assets/screens/' + c.screen + '.png')).toBe(true);
      ['feed', 'story', 'square', 'wide'].forEach(function (f) { expect(existsSync('docs/marketing/assets/static/' + c.id + '-' + f + '.png')).toBe(true); });
    });
  });

  it('the exam-name disclaimer is on every ad that talks about boards or questions', () => {
    CONCEPTS.forEach(function (c) {
      var text = c.head + ' ' + c.sub;
      if (/\b(board|question|study)/i.test(text) && !/adhd|accessible/i.test(c.id)) expect(c.fine).toMatch(/not affiliated/i);
    });
  });

  it('the ADHD ad describes the design and carries the no-claims line, never "you"', () => {
    var a = CONCEPTS.filter(function (c) { return /adhd/.test(c.id); })[0];
    expect(a.fine).toMatch(/does not diagnose, treat or claim/i);
    expect(a.head + ' ' + a.sub).not.toMatch(/\byou(r)?\b|struggl|cure|treat|help(s)? (with )?adhd|do you have/i);
    VIDEOS.filter(function (v) { return /adhd/.test(v.id); }).forEach(function (v) {
      var html = JSON.stringify(v.scenes);
      expect(html).toMatch(/does not diagnose, treat or claim/i);
      expect(html).not.toMatch(/do you have|struggl|cure/i);
    });
  });

  it('no ad promises a result', () => {
    var all = JSON.stringify(CONCEPTS) + JSON.stringify(VIDEOS);
    expect(all).not.toMatch(/guarantee|pass your|raise your score|#1|official/i);
  });

  it('the landing page forwards the campaign tags and loads nothing from outside', () => {
    var html = readFileSync('public/landing/index.html', 'utf8');
    expect(html).toMatch(/location\.search/);
    expect(html).not.toMatch(/<script[^>]+src=/i);
    expect(html).not.toMatch(/https?:\/\/(?!claude)[^"' )]+\.(js|css|woff2?)/i);
    expect(html).toMatch(/not affiliated with or endorsed by NBME, FSMB or NBOME/);
    ['run.png', 'home.png', 'locker.png', 'stats.png', 'jersey-10-latin-400-normal.woff2', 'press-start-2p-latin-400-normal.woff2'].forEach(function (f) { expect(existsSync('public/landing/' + f)).toBe(true); });
  });
});
