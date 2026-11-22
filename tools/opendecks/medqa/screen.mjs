// Stage 1+2a: programmatic screen of all MedQA train rows and stratified sampling.
// Usage: node screen.mjs <train.jsonl> <workdir>   -> workdir/screened.json (survivors), workdir/sample.json, workdir/screen-report.json
import { readFileSync, writeFileSync } from 'node:fs';
var src = process.argv[2], wd = process.argv[3];
var rows = readFileSync(src, 'utf8').trim().split('\n').map(function (l, i) { var r = JSON.parse(l); r.i = i; return r; });
var reasons = {};
function drop(r, why) { reasons[why] = (reasons[why] || 0) + 1; return false; }

// organ-system classifier (keyword score) -> canonical subject
var SUBJ = {
 'Neurology': /\b(seizure|stroke|neuro|cerebell|cranial nerve|dementia|parkinson|migraine|meningi|multiple sclerosis|myasthenia|guillain|spinal cord|ataxia|paresthesia|weakness of|brain|hemiparesis|aphasia|neuropathy|huntington|encephal|ptosis|glioma|nystagmus)/i,
 'Cardiology': /\b(murmur|myocardial|chest pain|heart failure|ECG|atrial|ventricular|cardiac|aortic|mitral|endocarditis|pericardi|hypertension|angina|statin|cardiomyopathy|troponin|arrhythmia|coronary|valve)/i,
 'Nephrology': /\b(renal|kidney|nephr|creatinine|hematuria|proteinuria|dialysis|hyponatremia|hyperkalemia|acidosis|glomerul|urinalysis|diuretic|bladder|ureter|nephrolith)/i,
 'Psychiatry': /\b(depress|schizo|bipolar|anxiety|psychosis|suicid|panic|antipsychotic|personality|ADHD|autis|alcohol use|withdrawal|hallucinat|delusion|OCD|obsessive|manic|eating disorder|anorexia nervosa|conduct)/i,
 'Gastroenterology': /\b(abdominal pain|liver|hepat|cirrho|bowel|crohn|colitis|pancrea|esophag|gastr|diarrhea|jaundice|colon|celiac|dysphagia|cholecyst|biliary|vomiting|appendic|constipation|stool|ulcer)/i,
 'Pulmonology': /\b(cough|dyspnea|asthma|COPD|pneumonia|pulmonary|lung|respiratory|wheez|pleural|sarcoid|pneumothorax|bronch|smoking|tuberculosis|hypoxi)/i,
 'Infectious Disease': /\b(infection|antibiotic|fever|HIV|bacteri|virus|viral|culture|sepsis|abscess|malaria|vaccin|parasit|fungal|STD|gonorr|chlamydia|syphilis|cellulitis|travel|mosquito|tick|lyme|herpes|candid)/i,
 'Endocrinology': /\b(diabet|thyroid|insulin|adrenal|cortisol|pituitary|hormone|glucose|cushing|hypercalcemia|parathyroid|obesity|prolactin|acromegaly|osteoporosis|HbA1c|goiter)/i,
 'Hematology/Oncology': /\b(anemia|leukemia|lymphoma|cancer|carcinoma|tumor|malignan|chemotherapy|platelet|hemoglobin|sickle|thalassemia|coagulation|transfusion|hemophilia|neoplasm|metasta|bleeding|thrombo|mass)/i,
 'Rheumatology': /\b(arthritis|lupus|joint pain|rheumat|vasculitis|gout|autoimmune|sjogren|scleroderma|ankylosing|polymyalgia|psoria|dermatomyositis|synovi|ANA|knee|back pain)/i,
 'Obstetrics/Gynecology': /\b(pregnan|gestation|menstru|contracepti|uterus|ovarian|cervical|prenatal|postpartum|labor|vaginal|delivery|gravida|amenorrhea|breast|fetal|fetus|menopaus|miscarriage|eclampsia|placent|preeclampsia)/i,
 'Pediatrics': /\b(\d+[- ](month|week|day)[- ]old|newborn|infant|child|toddler|neonat|adolescent|boy|girl|developmental|immunization|congenital)/i,
 'Surgery': /\b(surgery|postoperative|trauma|fracture|operat|hernia|laparotomy|incision|wound|burn|amputat|appendectomy|orthop|dislocation|splenectomy)/i,
 'Emergency Medicine': /\b(emergency department|overdose|poison|intoxicat|ingest|anaphylaxis|shock|unresponsive|drowning|hypotherm|toxic|bite|stab|gunshot|resuscitat)/i
};
function classify(r) {
  var txt = r.question + ' ' + Object.values(r.options).join(' ');
  var best = 'Multisystem / Mixed', bs = 0;
  Object.keys(SUBJ).forEach(function (s) { var m = txt.match(new RegExp(SUBJ[s].source, 'gi')); var n = m ? m.length : 0; if (s === 'Pediatrics' || s === 'Emergency Medicine' || s === 'Surgery') n *= 0.8; if (n > bs) { bs = n; best = s; } });
  return best;
}
var IMG = /\b(image|images|photograph|photomicrograph|micrograph|radiograph|x-ray (is|are) shown|shown (below|here)|figure|depicted|the (accompanying|following) (ECG|tracing|graph|diagram|image)|pictured|illustrat|arrow|biopsy specimen is shown|is shown|are shown|as shown|shown in the)\b/i;
var CALC = /\b(calculate|probability|number needed|NNT|NNH|sensitivity|specificity|positive predictive|negative predictive|relative risk|odds ratio|p[- ]value|confidence interval|standard deviation|hazard ratio|incidence rate|prevalence|likelihood ratio|how many|attributable|null hypothesis|power of the study|type (I|II) error|cohort study|case-control|randomized|clinical trial|a study (is|was)|researchers|investigators|bias|correlation|regression|sample size|variance|mean .* of)\b/i;
var LABU = /\b\d+(\.\d+)?\s?(mg\/dL|mEq\/L|g\/dL|\/mm3|\/mm\^3|U\/L|mmol\/L|ng\/mL|pg\/mL|IU\/L|µg\/dL|mcg\/dL|mm Hg|mmHg|%|\/min|\/uL|µU\/mL|mIU\/L|µm3|fL|pg|ng\/dL)/gi;
var ETHICS = /\b(what (should|would) (the physician|you|the doctor)|how should the physician|most appropriate response|physician'?s? (response|statement)|best response|which of the following statements|tell (the patient|her|him)|inform (the patient|her|him)|disclos|consent|autonomy|confidential|power of attorney|advance directive|surrogate|report to|ethical|interpreter)\b/i;
var survivors = [];
rows.forEach(function (r) {
  var q = r.question, w = q.split(/\s+/).length;
  var opts = Object.values(r.options);
  if (IMG.test(q)) return drop(r, 'image-dependent wording');
  if (CALC.test(q + ' ' + opts.join(' '))) return drop(r, 'calculation / biostatistics / study design');
  if (ETHICS.test(q)) return drop(r, 'ethics / communication / disclosure');
  var labs = (q.match(LABU) || []).length;
  if (labs >= 6) return drop(r, 'lab/vitals-value heavy (>=6 numeric values)');
  if (w > 190) return drop(r, 'vignette >190 words');
  if (opts.some(function (o) { return o.length > 70; })) return drop(r, 'option >70 chars (will not fit a gate)');
  if (opts.some(function (o) { return /\b(all|none) of the above|\band\b.*\band\b.*\band\b/i.test(o); })) return drop(r, 'multi-part / all-of-above option');
  if (/\b(EXCEPT|NOT|LEAST)\b/.test(q.split(/\.\s/).pop())) return drop(r, 'negated stem (EXCEPT/NOT/LEAST)');
  if (/\b(which of the following (is|are) (most )?(likely|expected).*(finding|result|value|level|lab))\b/i.test(q) && labs >= 3) return drop(r, 'lab-interpretation');
  if (!/\?\s*$|\.\s*$/.test(q.trim())) return drop(r, 'stem does not end in ? or .');
  r.subj = classify(r); r.words = w; r.labs = labs;
  survivors.push(r);
});
var by = {}; survivors.forEach(function (r) { var k = r.meta_info + '|' + r.subj; by[k] = (by[k] || 0) + 1; });
// stratified sample: ~500 per step stratum, round-robin across subjects (balanced), shortest-biased tiebreak avoided: seeded shuffle
function rng(s) { return function () { s |= 0; s = s + 0x6D2B79F5 | 0; var t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
var rand = rng(12345);
function shuffle(a) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(rand() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
var sample = [];
['step1', 'step2&3'].forEach(function (step) {
  var groups = {};
  shuffle(survivors.filter(function (r) { return r.meta_info === step; })).forEach(function (r) { (groups[r.subj] = groups[r.subj] || []).push(r); });
  var names = Object.keys(groups), got = 0, k = 0;
  while (got < 500 && names.some(function (n) { return groups[n].length; })) { var g = groups[names[k % names.length]]; if (g.length) { sample.push(g.shift()); got++; } k++; }
});
var rep = { total: rows.length, dropReasons: reasons, survivors: survivors.length, survivorsByStep: {}, survivorsBySubject: {}, sample: sample.length, sampleByStep: {}, sampleBySubject: {} };
survivors.forEach(function (r) { rep.survivorsByStep[r.meta_info] = (rep.survivorsByStep[r.meta_info] || 0) + 1; rep.survivorsBySubject[r.subj] = (rep.survivorsBySubject[r.subj] || 0) + 1; });
sample.forEach(function (r) { rep.sampleByStep[r.meta_info] = (rep.sampleByStep[r.meta_info] || 0) + 1; rep.sampleBySubject[r.subj] = (rep.sampleBySubject[r.subj] || 0) + 1; });
rep.totalDropped = rows.length - survivors.length;
writeFileSync(wd + '/screened.json', JSON.stringify(survivors));
writeFileSync(wd + '/sample.json', JSON.stringify(sample));
writeFileSync(wd + '/screen-report.json', JSON.stringify(rep, null, 1));
console.log(JSON.stringify(rep, null, 1));
