/* eslint-disable no-unused-vars -- one-off conversion tool; kept for reproducibility */
// Print batch N (size B) of the sample compactly for distillation: node view.mjs sample.json N [B=40]
import { readFileSync } from 'node:fs';
var s = JSON.parse(readFileSync(process.argv[2], 'utf8')), n = +process.argv[3], B = +(process.argv[4] || 40);
var ab = { 'Obstetrics/Gynecology': 'OB', 'Pulmonology': 'PU', 'Hematology/Oncology': 'HO', 'Gastroenterology': 'GI', 'Multisystem / Mixed': 'MX', 'Pediatrics': 'PD', 'Neurology': 'NE', 'Cardiology': 'CA', 'Psychiatry': 'PS', 'Infectious Disease': 'ID', 'Nephrology': 'NP', 'Emergency Medicine': 'EM', 'Endocrinology': 'EN', 'Rheumatology': 'RH', 'Surgery': 'SU' };
s.slice(n * B, (n + 1) * B).forEach(function (r, k) {
  var w = r.question.split(/\s+/), t = w.length > 100 ? w.slice(0, 55).join(" ") + " [...] " + w.slice(-40).join(' ') : r.question;
  console.log('#' + r.i + ' ' + (r.meta_info === 'step1' ? 'S1' : 'S23') + ' ' + ab[r.subj] + ' | ' + t + '\n  ' + Object.keys(r.options).map(function (l) { return l + ') ' + r.options[l]; }).join(' | ') + '  KEY=' + r.answer_idx);
});
