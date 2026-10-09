/**
 * make-ads.mjs — renders the static ads and short kinetic-text videos in docs/marketing/assets/ from the in-app
 * screenshots (docs/marketing/assets/screens) and the game's own fonts.
 *
 *   node tools/make-ads.mjs            all static ads + videos
 *   node tools/make-ads.mjs --static   only the PNG ads
 *   node tools/make-ads.mjs --video    only the MP4 videos
 *
 * Needs Playwright's Chromium and ffmpeg. To change copy, edit CONCEPTS / VIDEOS below and run again.
 * Screens come from running the real app (see docs/marketing/04-PRODUCTION-PLAN.md for how they were captured).
 */
/* global window */
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

var ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
var ASSETS = path.join(ROOT, 'docs/marketing/assets');
var FONTS = 'file://' + path.join(ROOT, 'css/fonts');
var SCREEN = function (n) { return 'file://' + path.join(ASSETS, 'screens', n + '.png'); };
var CHROME = process.env.CHROMIUM_PATH || (existsSync('/opt/pw-browsers/chromium-1194/chrome-linux/chrome') ? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' : undefined);

var DISCLAIMER = 'Dx Dash is a study aid, not affiliated with or endorsed by NBME, FSMB or NBOME.';

/** id, headline (use [[word]] to highlight in gold), sub line, screen, accent, small print */
export var CONCEPTS = [
  { id: 'same-phone-time', head: 'Same phone time. [[Actually]] studying.', sub: 'Board-style questions as a runner game.', screen: 'run-b', accent: '#ffd23f', fine: DISCLAIMER },
  { id: 'doomscroll-less', head: 'Doomscroll less. [[Diagnose]] more.', sub: '300 questions free. No ads.', screen: 'run-a', accent: '#7fe6ff', fine: DISCLAIMER },
  { id: 'brain-rot', head: 'Brain rot friendly. [[Board-ready.]]', sub: 'It still teaches real vignettes.', screen: 'home', accent: '#ff7ac6', fine: DISCLAIMER },
  { id: 'monster', head: 'The monster is your [[exam date.]]', sub: 'Run. Answer. Outrun it.', screen: 'run-b', accent: '#ff5d5d', fine: DISCLAIMER },
  { id: 'streak', head: 'A streak that [[forgives]] you.', sub: 'Streak shields. Daily goal. Zero guilt.', screen: 'quests', accent: '#ffb347', fine: '' },
  { id: 'adhd-design', head: 'Study design with [[ADHD-friendly]] features.', sub: 'Short runs · instant feedback · rewards for every answer · reduced-motion mode', screen: 'home', accent: '#5af0a0', fine: 'Describes how the app is designed. It does not diagnose, treat or claim to help any condition.' },
  { id: 'free-300', head: '[[300]] board questions. Free.', sub: '20 in every subject. Unlock all 3,010 with Pro.', screen: 'locker', accent: '#ffd23f', fine: DISCLAIMER },
  { id: 'accessible', head: 'Study your way. [[Accessible]] by design.', sub: 'Dyslexia font · colorblind-safe · reduced motion · left-hand layout', screen: 'stats', accent: '#7fe6ff', fine: '' },
  { id: 'beat-my-score', head: 'Beat my [[score.]] Seriously.', sub: 'Friends, study groups and a weekly Gauntlet.', screen: 'run-a', accent: '#c49bff', fine: DISCLAIMER }
];

var FORMATS = {
  feed: { w: 1080, h: 1350, label: '4x5 feed (Instagram, Facebook, TikTok feed)' },
  story: { w: 1080, h: 1920, label: '9x16 story/reel cover (safe zones respected)' },
  square: { w: 1080, h: 1080, label: '1x1 square' },
  wide: { w: 1200, h: 628, label: '1.91x1 link/Google/Reddit' }
};

function css() {
  return '@font-face{font-family:"Jersey 10";src:url("' + FONTS + '/jersey-10-latin-400-normal.woff2")}' +
    '@font-face{font-family:"Press Start 2P";src:url("' + FONTS + '/press-start-2p-latin-400-normal.woff2")}' +
    '*{box-sizing:border-box;margin:0;padding:0}html,body{width:100%;height:100%;overflow:hidden;background:#0b1230;font-family:"Jersey 10",sans-serif;color:#fff}' +
    '.stage{position:relative;width:100%;height:100%;overflow:hidden;background:radial-gradient(1200px 900px at 20% 0%,#2a2570 0%,#14183f 45%,#0a0f28 100%)}' +
    '.dots{position:absolute;inset:0;background-image:radial-gradient(rgba(255,255,255,.08) 2px,transparent 2px);background-size:36px 36px}' +
    '.glow{position:absolute;border-radius:50%;filter:blur(90px);opacity:.55}' +
    'h1{font-weight:400;line-height:.98;letter-spacing:.01em;text-shadow:0 6px 0 rgba(0,0,0,.45)}h1 b{font-weight:400;color:var(--accent)}' +
    '.sub{opacity:.92;line-height:1.15;text-shadow:0 3px 0 rgba(0,0,0,.4)}' +
    '.phone{position:absolute;border-radius:64px;background:#05060f;padding:14px;box-shadow:0 0 0 6px #1b1f4a,0 30px 80px rgba(0,0,0,.55),0 0 120px var(--accentSoft)}' +
    '.phone img{display:block;width:100%;height:100%;object-fit:cover;object-position:top;border-radius:52px}' +
    '.pill{position:absolute;background:var(--accent);color:#14183f;border:6px solid #14183f;border-radius:999px;box-shadow:0 8px 0 #14183f;padding:14px 34px;font-size:46px;letter-spacing:.04em;text-transform:uppercase}' +
    '.logo{position:absolute;font-family:"Press Start 2P";color:#ffd23f;text-shadow:0 5px 0 #14183f,0 0 30px rgba(255,210,63,.4);letter-spacing:.02em}' +
    '.fine{position:absolute;font-size:22px;opacity:.6;font-family:sans-serif;line-height:1.25}';
}

function fit(head, base, minSize, charsAtBase) {
  var n = head.replace(/\[\[|\]\]/g, '').length;
  return Math.max(minSize, Math.round(base * Math.min(1, charsAtBase / n)));
}

function layout(c, f) {
  var accentSoft = c.accent + '55';
  var head = c.head.replace(/\[\[(.+?)\]\]/g, '<b>$1</b>');
  var out = '<div class="stage" style="--accent:' + c.accent + ';--accentSoft:' + accentSoft + '"><div class="dots"></div>' +
    '<div class="glow" style="left:-200px;top:-150px;width:700px;height:700px;background:' + c.accent + '"></div>' +
    '<div class="glow" style="right:-250px;bottom:-250px;width:700px;height:700px;background:#6f4bff"></div>';
  var ph = 844 / 390;
  var fine = c.fine ? '<div class="fine" style="position:static;margin-top:22px;font-size:{F}px">' + c.fine + '</div>' : '';
  function phone(x, y, w, hMax, r) {
    var h = Math.min(Math.round((w - 28) * ph) + 28, hMax);
    return '<div class="phone" style="left:' + x + 'px;top:' + y + 'px;width:' + w + 'px;height:' + h + 'px;' + (r ? 'border-radius:' + r + 'px;padding:10px' : '') + '"><img src="' + SCREEN(c.screen) + '"' + (r ? ' style="border-radius:' + (r - 8) + 'px"' : '') + '></div>';
  }
  function col(x, y, w, hs, ss, ps, ls, fs) {
    return '<div style="position:absolute;left:' + x + 'px;top:' + y + 'px;width:' + w + 'px;display:flex;flex-direction:column;align-items:flex-start;gap:28px">' +
      '<div class="sub" style="font-size:' + ss + 'px">' + c.sub + '</div>' +
      '<div class="pill" style="position:static;font-size:' + ps + 'px;padding:12px 30px;border-width:5px">Free to start</div>' +
      '<div class="logo" style="position:static;font-size:' + ls + 'px">DX DASH</div>' +
      fine.replace('{F}', fs) + '</div>';
  }
  if (f === 'feed') {
    out += '<h1 style="position:absolute;left:70px;top:64px;width:940px;font-size:' + fit(c.head, 132, 96, 34) + 'px">' + head + '</h1>' +
      phone(560, 520, 460, 900) + col(70, 560, 440, 0, 42, 42, 38, 20);
  } else if (f === 'story') {
    out += '<h1 style="position:absolute;left:70px;top:200px;width:940px;font-size:' + fit(c.head, 150, 110, 34) + 'px">' + head + '</h1>' +
      phone(300, 700, 480, 760) + col(70, 1500, 940, 0, 44, 50, 34, 20);
  } else if (f === 'square') {
    out += '<h1 style="position:absolute;left:60px;top:56px;width:580px;font-size:' + fit(c.head, 100, 70, 30) + 'px">' + head + '</h1>' +
      phone(680, 120, 340, 840) + col(60, 540, 580, 0, 36, 36, 30, 16);
  } else {
    out += '<h1 style="position:absolute;left:44px;top:30px;width:720px;font-size:' + fit(c.head, 74, 54, 34) + 'px">' + head + '</h1>' +
      phone(870, 50, 250, 700, 40) + col(46, 300, 740, 0, 30, 30, 24, 14);
  }
  return out + '</div>';
}

function page(c, f) { return '<!doctype html><meta charset="utf-8"><style>' + css() + '</style>' + layout(c, f); }

/** Videos: each scene is [startSec, endSec, html]. Elements animate in with a pop; the engine is deterministic (setT). */
export var VIDEOS = [
  {
    id: 'brain-rot-friendly', title: 'Brain rot friendly studying (B1)', secs: 12,
    scenes: [
      [0, 2.2, '<div class="big shake">me: I\'ll <b>study</b> tonight</div>'],
      [1.4, 3.6, '<div class="big" style="top:1000px">also me:</div><div class="emoji" style="top:1180px">🧠🍟📱</div>'],
      [3.4, 6.2, '<div class="phoneBig"><img src="' + SCREEN('run-b') + '"></div><div class="stamp" style="top:260px">BRAIN ROT FRIENDLY</div>'],
      [5.4, 8.6, '<div class="phoneBig" style="top:560px"><img src="' + SCREEN('run-a') + '"></div><div class="stamp" style="top:220px;background:#7fe6ff">CORRECT 💥 +COINS</div><div class="small" style="top:350px">(it still teaches real vignettes)</div>'],
      [8.6, 12, '<div class="big" style="top:520px">Rot your brain <b>productively.</b></div><div class="pill2" style="top:1120px">FREE TO START</div><div class="logo2" style="top:1330px">DX DASH</div><div class="fine2">Dx Dash is a study aid, not affiliated with NBME, FSMB or NBOME.</div>']
    ]
  },
  {
    id: 'same-phone-time', title: 'Same phone time. Actually studying. (A1/A2)', secs: 12,
    scenes: [
      [0, 3, '<div class="big" style="top:300px">It\'s 11:40pm.</div><div class="big" style="top:520px">You meant to do <b>one block.</b></div><div class="feed"><i></i><i></i><i></i><i></i></div>'],
      [3, 5.2, '<div class="big" style="top:420px">Same thumb.</div><div class="timer">0:45:12</div>'],
      [5, 9, '<div class="phoneBig" style="top:520px"><img src="' + SCREEN('run-b') + '"></div><div class="stamp" style="top:240px">DIFFERENT 5 MINUTES</div>'],
      [9, 12, '<div class="big" style="top:560px">Make the scroll <b>count.</b></div><div class="pill2" style="top:1120px">FREE TO START</div><div class="logo2" style="top:1330px">DX DASH</div><div class="fine2">Dx Dash is a study aid, not affiliated with NBME, FSMB or NBOME.</div>']
    ]
  },
  {
    id: 'adhd-friendly-design', title: 'Study design with ADHD-friendly features (C1)', secs: 14,
    scenes: [
      [0, 2.6, '<div class="big" style="top:520px">A study app with <b>ADHD-friendly</b> design.</div>'],
      [2.4, 4.8, '<div class="feat"><span>⏱️</span>3-minute runs</div>'],
      [4.6, 7, '<div class="feat"><span>⚡️</span>Instant feedback</div>'],
      [6.8, 9.2, '<div class="feat"><span>🪙</span>A reward every answer</div>'],
      [9, 11.4, '<div class="feat"><span>🛡️</span>Streak shields</div>'],
      [11.2, 14, '<div class="feat"><span>🎛️</span>Reduced-motion mode</div><div class="pill2" style="top:1120px">FREE TO START</div><div class="logo2" style="top:1330px">DX DASH</div><div class="fine2">Describes how the app is designed. It does not diagnose, treat or claim to help any condition.</div>']
    ]
  }
];

function videoPage(v) {
  var scenes = v.scenes.map(function (s, i) { return '<div class="scene" data-t0="' + s[0] + '" data-t1="' + s[1] + '" id="s' + i + '">' + s[2] + '</div>'; }).join('');
  return '<!doctype html><meta charset="utf-8"><style>' + css() +
    '.scene{position:absolute;inset:0;opacity:0}.big{position:absolute;left:60px;right:60px;text-align:center;font-size:150px;line-height:1;text-shadow:0 8px 0 rgba(0,0,0,.5)}.big b{color:#ffd23f;font-weight:400}' +
    '.small{position:absolute;left:60px;right:60px;text-align:center;font-size:56px;opacity:.85}' +
    '.emoji{position:absolute;left:0;right:0;text-align:center;font-size:190px}' +
    '.stamp{position:absolute;left:50%;transform:translateX(-50%) rotate(-3deg);white-space:nowrap;background:#ffd23f;color:#14183f;border:8px solid #14183f;border-radius:24px;box-shadow:0 10px 0 #14183f;padding:18px 40px;font-size:88px}' +
    '.phoneBig{position:absolute;left:210px;top:480px;width:660px;height:1300px;border-radius:72px;background:#05060f;padding:16px;box-shadow:0 0 0 8px #1b1f4a,0 40px 100px rgba(0,0,0,.6)}.phoneBig img{width:100%;height:100%;object-fit:cover;object-position:top;border-radius:58px}' +
    '.pill2{position:absolute;left:50%;transform:translateX(-50%);white-space:nowrap;background:#ffd23f;color:#14183f;border:8px solid #14183f;border-radius:999px;box-shadow:0 10px 0 #14183f;padding:18px 56px;font-size:84px}' +
    '.logo2{position:absolute;left:0;right:0;text-align:center;font-family:"Press Start 2P";font-size:64px;color:#ffd23f;text-shadow:0 7px 0 #14183f}' +
    '.fine2{position:absolute;left:80px;right:80px;bottom:150px;text-align:center;font-family:sans-serif;font-size:26px;opacity:.65}' +
    '.feat{position:absolute;left:60px;right:60px;top:640px;text-align:center;font-size:170px;line-height:1.05;text-shadow:0 8px 0 rgba(0,0,0,.5)}.feat span{display:block;font-size:260px;margin-bottom:30px}' +
    '.feed{position:absolute;left:150px;right:150px;top:760px;display:flex;flex-direction:column;gap:30px}.feed i{display:block;height:200px;border-radius:30px;background:linear-gradient(90deg,#2d2f6b,#4a3d99);opacity:.9}' +
    '.timer{position:absolute;left:0;right:0;top:760px;text-align:center;font-family:"Press Start 2P";font-size:96px;color:#ff7ac6}' +
    '.shake{animation:none}</style><div class="stage" style="--accent:#ffd23f"><div class="dots"></div><div class="glow" style="left:-200px;top:-150px;width:800px;height:800px;background:#ffd23f"></div><div class="glow" style="right:-300px;bottom:-250px;width:800px;height:800px;background:#6f4bff"></div>' + scenes + '</div>' +
    '<script>window.setT=function(t){document.querySelectorAll(".scene").forEach(function(s){var a=+s.dataset.t0,b=+s.dataset.t1;var on=t>=a&&t<b;s.style.opacity=on?1:0;if(!on)return;var p=Math.min(1,(t-a)/0.28);var e=1-Math.pow(1-p,3);var q=Math.min(1,(b-t)/0.2);s.style.opacity=Math.min(1,p*4)*Math.min(1,q*5);s.style.transform="translateY("+((1-e)*50)+"px) scale("+(0.92+0.08*e)+")";var sh=s.querySelector(".shake");if(sh){sh.style.transform="translateX("+(Math.sin(t*50)*6)+"px)";}});};window.setT(0);</script>';
}

async function main() {
  var onlyStatic = process.argv.includes('--static');
  var onlyVideo = process.argv.includes('--video');
  var browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--allow-file-access-from-files'] });
  if (!onlyVideo) {
    var tmp = path.join(ASSETS, 'src');
    mkdirSync(tmp, { recursive: true });
    for (var c of CONCEPTS) {
      for (var f of Object.keys(FORMATS)) {
        var fmt = FORMATS[f];
        var file = path.join(tmp, c.id + '-' + f + '.html');
        writeFileSync(file, page(c, f));
        var pg = await browser.newPage({ viewport: { width: fmt.w, height: fmt.h } });
        await pg.goto('file://' + file);
        await pg.waitForTimeout(350);
        mkdirSync(path.join(ASSETS, 'static'), { recursive: true });
        await pg.screenshot({ path: path.join(ASSETS, 'static', c.id + '-' + f + '.png') });
        await pg.close();
      }
    }
    console.log('static ads:', CONCEPTS.length * Object.keys(FORMATS).length);
  }
  if (!onlyStatic) {
    mkdirSync(path.join(ASSETS, 'video'), { recursive: true });
    for (var v of VIDEOS) {
      var vfile = path.join(ASSETS, 'src', 'video-' + v.id + '.html');
      writeFileSync(vfile, videoPage(v));
      var vp = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
      await vp.goto('file://' + vfile);
      await vp.waitForTimeout(400);
      var frames = path.join('/tmp', 'dxads-' + v.id);
      mkdirSync(frames, { recursive: true });
      var fps = 30;
      var n = Math.round(v.secs * fps);
      for (var i = 0; i < n; i++) {
        await vp.evaluate(function (t) { window.setT(t); }, i / fps);
        await vp.screenshot({ path: path.join(frames, 'f' + String(i).padStart(4, '0') + '.jpg'), type: 'jpeg', quality: 92 });
      }
      await vp.close();
      execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(fps), '-i', path.join(frames, 'f%04d.jpg'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-movflags', '+faststart', path.join(ASSETS, 'video', v.id + '.mp4')]);
      console.log('video', v.id, n + ' frames');
    }
  }
  await browser.close();
}

if (process.argv[1] && process.argv[1].endsWith('make-ads.mjs')) main();
