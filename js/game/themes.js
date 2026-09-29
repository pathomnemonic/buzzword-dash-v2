/**
 * themes.js — Specialty theme color configs with night mode variants
 *
 * ARCHITECTURE CONTRACT (§23, §30):
 * - Agent 13 owns this file.
 * - Each theme defines colors for: bg, ground, wall, glow, gate, accent.
 * - Night mode variants darken backgrounds and reduce glow intensity.
 * - getTheme() is called on run start and when night mode toggles.
 * - getSubjectTheme() supports specialty-specific decorations.
 * - Does not import storage directly for night mode check;
 *   caller passes nightMode flag or we read it at call time.
 */

import { storage } from '../storage.js';

var THEMES_NORMAL = {
  "Neurology": {
    bg: 0x0a0828, ground: 0x0c0a30, wall: 0x2020aa,
    glow: 0x8844ff, gate: 0x1a1060, accent: 0xaa66ff
  },
  "Cardiology": {
    bg: 0x1a0808, ground: 0x200a0a, wall: 0xaa2020,
    glow: 0xff4444, gate: 0x601020, accent: 0xff6666
  },
  "Nephrology": {
    bg: 0x081820, ground: 0x0a1828, wall: 0x2080aa,
    glow: 0x44ccff, gate: 0x103050, accent: 0x66eeff
  },
  "Psychiatry": {
    bg: 0x140828, ground: 0x180a30, wall: 0x8830aa,
    glow: 0xcc66ff, gate: 0x401060, accent: 0xdd88ff
  },
  "Gastroenterology": {
    bg: 0x181008, ground: 0x201410, wall: 0xaa6620,
    glow: 0xffaa44, gate: 0x604020, accent: 0xffcc66
  },
  "Pulmonology": {
    bg: 0x081018, ground: 0x0a1420, wall: 0x2060aa,
    glow: 0x44aaff, gate: 0x103060, accent: 0x66ccff
  },
  "Infectious Disease": {
    bg: 0x081808, ground: 0x0a200a, wall: 0x20aa40,
    glow: 0x44ff66, gate: 0x104020, accent: 0x66ff88
  },
  "Endocrinology": {
    bg: 0x181808, ground: 0x201e0a, wall: 0xaaaa20,
    glow: 0xffff44, gate: 0x605020, accent: 0xffff88
  },
  "Hematology/Oncology": {
    bg: 0x180810, ground: 0x200a14, wall: 0xaa2060,
    glow: 0xff44aa, gate: 0x601040, accent: 0xff66cc
  },
  "Rheumatology": {
    bg: 0x100818, ground: 0x140a20, wall: 0x6020aa,
    glow: 0x9944ff, gate: 0x401060, accent: 0xbb66ff
  },
  "Obstetrics/Gynecology": {
    bg: 0x180814, ground: 0x200a18, wall: 0xaa2080,
    glow: 0xff44cc, gate: 0x601050, accent: 0xff88dd
  },
  "Pediatrics": {
    bg: 0x081018, ground: 0x101828, wall: 0x4060aa,
    glow: 0x66aaff, gate: 0x204060, accent: 0x88ccff
  },
  "Surgery": {
    bg: 0x0a0a10, ground: 0x101018, wall: 0x606080,
    glow: 0xaaaacc, gate: 0x303050, accent: 0xccccee
  },
  "Emergency Medicine": {
    bg: 0x181008, ground: 0x201408, wall: 0xaa4420,
    glow: 0xff6644, gate: 0x603020, accent: 0xff8866
  },
  "Multisystem / Mixed": {
    bg: 0x050816, ground: 0x0a1030, wall: 0x1a3060,
    glow: 0x18ffff, gate: 0x102040, accent: 0x44ddff
  },
  "default": {
    bg: 0x050816, ground: 0x0a1030, wall: 0x1a3060,
    glow: 0x18ffff, gate: 0x102040, accent: 0x44ddff
  }
};

var THEMES_NIGHT = {
  "Neurology": {
    bg: 0x040414, ground: 0x060518, wall: 0x151566,
    glow: 0x5522aa, gate: 0x100a40, accent: 0x7744aa
  },
  "Cardiology": {
    bg: 0x0d0404, ground: 0x100505, wall: 0x661212,
    glow: 0xaa2222, gate: 0x400a10, accent: 0xaa4444
  },
  "Nephrology": {
    bg: 0x040c10, ground: 0x050c14, wall: 0x144066,
    glow: 0x228899, gate: 0x0a1830, accent: 0x449999
  },
  "Psychiatry": {
    bg: 0x0a0414, ground: 0x0c0518, wall: 0x551a66,
    glow: 0x8844aa, gate: 0x280a40, accent: 0x9955aa
  },
  "Gastroenterology": {
    bg: 0x0c0804, ground: 0x100a08, wall: 0x664012,
    glow: 0xaa7722, gate: 0x402810, accent: 0xaa8844
  },
  "Pulmonology": {
    bg: 0x04080c, ground: 0x050a10, wall: 0x143866,
    glow: 0x226699, gate: 0x0a1838, accent: 0x448899
  },
  "Infectious Disease": {
    bg: 0x040c04, ground: 0x051005, wall: 0x126628,
    glow: 0x22aa33, gate: 0x0a2810, accent: 0x44aa55
  },
  "Endocrinology": {
    bg: 0x0c0c04, ground: 0x100f05, wall: 0x666612,
    glow: 0xaaaa22, gate: 0x383010, accent: 0xaaaa55
  },
  "Hematology/Oncology": {
    bg: 0x0c0408, ground: 0x10050a, wall: 0x661238,
    glow: 0xaa2266, gate: 0x400a28, accent: 0xaa4488
  },
  "Rheumatology": {
    bg: 0x08040c, ground: 0x0a0510, wall: 0x381266,
    glow: 0x6622aa, gate: 0x280a40, accent: 0x7744aa
  },
  "Obstetrics/Gynecology": {
    bg: 0x0c040a, ground: 0x10050c, wall: 0x661250,
    glow: 0xaa2288, gate: 0x400a30, accent: 0xaa5599
  },
  "Pediatrics": {
    bg: 0x04080c, ground: 0x080c14, wall: 0x283866,
    glow: 0x446699, gate: 0x142838, accent: 0x558899
  },
  "Surgery": {
    bg: 0x050508, ground: 0x08080c, wall: 0x383850,
    glow: 0x666688, gate: 0x1a1a30, accent: 0x888899
  },
  "Emergency Medicine": {
    bg: 0x0c0804, ground: 0x100a04, wall: 0x662812,
    glow: 0xaa4422, gate: 0x381810, accent: 0xaa5544
  },
  "Multisystem / Mixed": {
    bg: 0x03040c, ground: 0x050818, wall: 0x101838,
    glow: 0x0c9999, gate: 0x081028, accent: 0x228899
  },
  "default": {
    bg: 0x03040c, ground: 0x050818, wall: 0x101838,
    glow: 0x0c9999, gate: 0x081028, accent: 0x228899
  }
};

/**
 * Get the active theme based on selected subjects and night mode.
 * @param {string[]} selectedSubjects
 * @returns {object} Theme color config
 */
export function getTheme(selectedSubjects) {
  var isNight = storage.get('nightMode');
  var themes = isNight ? THEMES_NIGHT : THEMES_NORMAL;

  if (selectedSubjects && selectedSubjects.length > 0) {
    for (var i = 0; i < selectedSubjects.length; i++) {
      if (themes[selectedSubjects[i]]) {
        return themes[selectedSubjects[i]];
      }
    }
  }

  return themes["default"];
}

/**
 * Get theme for a specific subject name.
 * @param {string} subject
 * @returns {object} Theme color config
 */
export function getSubjectTheme(subject) {
  var isNight = storage.get('nightMode');
  var themes = isNight ? THEMES_NIGHT : THEMES_NORMAL;
  return themes[subject] || themes["default"];
}
