/**
 * sharecard.js — a shareable image of a run result.
 *
 * Draws a 1080x1350 card on a canvas (no server, no external assets), then
 * shares it with the native share sheet when files are supported, or
 * downloads it.
 */

import { getSubjectStyle, getSubjectCssColor } from './game/subjectstyle.js';

var W = 1080;
var H = 1350;

/**
 * Rank subjects by how many encounters they had (top three).
 * @param {{card?: {subj?: string}, ok?: boolean}[]} runCards
 * @returns {{subject: string, n: number, ok: number}[]}
 */
export function topSubjects(runCards) {
  var by = {};
  (runCards || []).forEach(function (r) {
    var subj = r && r.card && r.card.subj;
    if (!subj) return;
    by[subj] = by[subj] || { subject: subj, n: 0, ok: 0 };
    by[subj].n++;
    if (r.ok) by[subj].ok++;
  });
  return Object.keys(by).map(function (k) { return by[k]; })
    .sort(function (a, b) { return b.n - a.n; }).slice(0, 3);
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * @param {object} data
 * @param {string} data.name
 * @param {number} data.score
 * @param {number} data.correct
 * @param {number} data.wrong
 * @param {number} data.bestStreak
 * @param {string} data.modeLabel
 * @param {string} [data.trackName]
 * @param {{subject: string, n: number, ok: number}[]} [data.subjects]
 * @returns {Promise<Blob>}
 */
export function renderShareCard(data) {
  var canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  var ctx = canvas.getContext('2d');
  if (!ctx) return Promise.reject(new Error('Canvas unavailable'));

  var bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#1b0a45');
  bg.addColorStop(0.55, '#3a0f7a');
  bg.addColorStop(1, '#0a3a6b');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Soft glow blobs
  [[220, 260, '#ff3399'], [880, 1050, '#18ffff'], [860, 200, '#9d4dff']].forEach(function (b) {
    var g = ctx.createRadialGradient(b[0], b[1], 0, b[0], b[1], 380);
    g.addColorStop(0, b[2] + '55');
    g.addColorStop(1, b[2] + '00');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  });

  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  ctx.font = '900 84px "Arial Black", Impact, sans-serif';
  ctx.fillText('BUZZWORD DASH', W / 2, 150);
  ctx.font = '600 34px "Segoe UI", sans-serif';
  ctx.fillStyle = '#b9a8ff';
  ctx.fillText('USMLE & COMLEX Board Runner', W / 2, 205);

  // Player + mode
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 46px "Segoe UI", sans-serif';
  ctx.fillText((data.name || 'A future doctor').slice(0, 24), W / 2, 330);
  ctx.fillStyle = '#18ffff';
  ctx.font = '600 32px "Segoe UI", sans-serif';
  ctx.fillText(data.modeLabel + (data.trackName ? '  ·  ' + data.trackName : ''), W / 2, 380);

  // Big score
  ctx.fillStyle = '#ffd700';
  ctx.font = '900 210px "Arial Black", Impact, sans-serif';
  ctx.fillText(Number(data.score || 0).toLocaleString(), W / 2, 620);
  ctx.fillStyle = '#ffffff';
  ctx.font = '600 38px "Segoe UI", sans-serif';
  ctx.fillText('POINTS', W / 2, 675);

  // Stat pills
  var total = (data.correct || 0) + (data.wrong || 0);
  var accuracy = total > 0 ? Math.round((data.correct || 0) / total * 100) : 0;
  var stats = [
    [accuracy + '%', 'Accuracy'],
    [String(data.bestStreak || 0), 'Best streak'],
    [String(data.correct || 0), 'Correct']
  ];
  stats.forEach(function (s, i) {
    var x = 90 + i * 300;
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    roundRect(ctx, x, 750, 270, 190, 28);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = '900 76px "Arial Black", Impact, sans-serif';
    ctx.fillText(s[0], x + 135, 852);
    ctx.fillStyle = '#b9a8ff';
    ctx.font = '600 30px "Segoe UI", sans-serif';
    ctx.fillText(s[1], x + 135, 905);
  });

  // Top subjects
  var subjects = data.subjects || [];
  if (subjects.length) {
    ctx.fillStyle = '#b9a8ff';
    ctx.font = '600 32px "Segoe UI", sans-serif';
    ctx.fillText('MOST PLAYED', W / 2, 1035);
    var slot = W / subjects.length;
    subjects.forEach(function (s, i) {
      var cx = slot * i + slot / 2;
      ctx.font = '84px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(getSubjectStyle(s.subject).icon, cx, 1130);
      ctx.font = '600 28px "Segoe UI", sans-serif';
      ctx.fillStyle = getSubjectCssColor(s.subject);
      ctx.fillText(s.subject.length > 18 ? s.subject.slice(0, 17) + '…' : s.subject, cx, 1180);
    });
  }

  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.font = '600 30px "Segoe UI", sans-serif';
  ctx.fillText('Can you beat it?', W / 2, 1290);

  return new Promise(function (resolve, reject) {
    canvas.toBlob(function (blob) {
      if (blob) resolve(blob); else reject(new Error('Could not encode image'));
    }, 'image/png');
  });
}

/**
 * Share the image if the device supports sharing files, else download it.
 * @param {Blob} blob
 * @returns {Promise<'shared'|'downloaded'>}
 */
export function shareOrDownload(blob) {
  var file = new File([blob], 'buzzword-dash-result.png', { type: 'image/png' });
  if (navigator.canShare && navigator.canShare({ files: [file] }) && navigator.share) {
    return navigator.share({ files: [file], title: 'Buzzword Dash result' }).then(function () { return 'shared'; }, function (e) {
      if (e && e.name === 'AbortError') return 'shared';
      throw e;
    });
  }
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = 'buzzword-dash-result.png';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  return Promise.resolve('downloaded');
}
