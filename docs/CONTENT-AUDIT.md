# Dx Dash content audit

Audit date: 2026-10-12. Scope: all 3010 built-in cards (15 subject files in `js/cards/`), checked against openly available sources (MedlinePlus, NCBI Bookshelf/StatPearls, CDC, NCI, USPSTF, AHA/ACC, ACG, ACR, ADA, AAP/ACOG statements, DermNet NZ, EyeWiki, NIDCD, NEI, USMLE and NBOME outlines).

Companion files: `docs/proposed-card-changes.json` (machine-readable proposals), `docs/proposed-new-cards.js` (117 draft cards, not shipped), `docs/CONTENT-STATS.md` (regenerate with `npm run audit:content-stats`).

**Nothing in this report has been applied to the live deck except five pure typo/format fixes listed below.** Every medical-fact change is a proposal needing human clinical review. Where guidance is recent or politically volatile (CDC schedules, 2026 lipid guideline, USPSTF drafts) confidence is lowered and the rationale says so.

## 1. Summary

- Cards reviewed: 3010. Cards with at least one proposal: 137 (4.6%). Field-level proposals: 178.
- Severity: 20 high (clinically wrong or contradicts current guideline), 69 medium (outdated or imprecise), 89 low (nuance, wording, internal inconsistency).
- Confidence in the correction: 71 high, 86 medium, 21 low.
- The deck loads cleanly (0 dropped, 0 loader warnings, 0 strict clue leaks, every card has pearls). The deck has 264 answer-text duplicate groups (see CONTENT-STATS.md); many are deliberate cross-subject re-asks but they inflate topic counts.

### Per subject

| Subject | Cards | Cards flagged | Proposals | High | Medium | Low |
|---|---:|---:|---:|---:|---:|---:|
| Neurology | 200 | 6 | 6 | 2 | 1 | 3 |
| Cardiology | 210 | 15 | 19 | 3 | 9 | 7 |
| Nephrology | 130 | 9 | 11 | 0 | 2 | 9 |
| Psychiatry | 200 | 6 | 8 | 2 | 3 | 3 |
| Gastroenterology | 200 | 12 | 18 | 2 | 9 | 7 |
| Pulmonology | 200 | 6 | 10 | 0 | 8 | 2 |
| Infectious Disease | 220 | 13 | 20 | 0 | 9 | 11 |
| Endocrinology | 200 | 11 | 12 | 0 | 4 | 8 |
| Hematology/Oncology | 250 | 8 | 9 | 1 | 3 | 5 |
| Rheumatology | 180 | 10 | 13 | 7 | 2 | 4 |
| Obstetrics/Gynecology | 200 | 14 | 19 | 0 | 5 | 14 |
| Pediatrics | 200 | 8 | 9 | 0 | 4 | 5 |
| Surgery | 200 | 8 | 10 | 1 | 4 | 5 |
| Emergency Medicine | 180 | 8 | 11 | 1 | 6 | 4 |
| Multisystem / Mixed | 240 | 3 | 3 | 1 | 0 | 2 |

## 2. Edits actually made to js/cards (typo/format only)

| Card | File | Change |
|---|---|---|
| id096 | infectious.js | removed stray citation marker " [1]" from `tp` |
| em163 | emergency.js | removed stray citation markers " [8]" from `tp` and `pearls[1]` |
| em176 | emergency.js | removed stray citation marker " [5]" from `pearls[2]` |
| p146 | psychiatry.js | "vermillion" to "vermilion" (clue and pearl) |
| su004 | surgery.js | "Homan sign" to "Homans sign" (clue and pearl) |

None of these changes meaning. Card ids, answers and distractors are untouched, so the card-pool hash is unchanged.

## 3. Most serious findings

1. **n167** (Neurology, pearls[2]): Triple-H (hypervolemia/hemodilution) was abandoned; the 2023 AHA/ASA aSAH guideline recommends euvolemia and does not support prophylactic hypervolemia or hemodilution. Source: https://www.ahajournals.org/doi/10.1161/STR.0000000000000436
2. **n132** (Neurology, pearls[1]): The 2024 AASM RLS guideline reversed the 2012 position and no longer endorses dopamine agonists as first-line therapy. Source: https://aasm.org/summary-of-new-clinical-practice-guideline-for-rls-and-plmd/
3. **c012** (Cardiology, pearls[1]): The 2013 STEMI guideline and the 2021/2025 chest pain and ACS guidelines removed isolated new LBBB as an automatic STEMI equivalent. The deck also contradicts itself (c156 already says this). Source: https://www.ahajournals.org/doi/10.1161/CIR.0000000000001309
4. **g090** (Gastroenterology, tp): ACG 2024 dropped empiric clarithromycin triple therapy as first-line because of US resistance. Source: https://pubmed.ncbi.nlm.nih.gov/39626064/
5. **he193** (Hematology/Oncology, tp): Two listed drugs are withdrawn or unproven. Source: https://www.pfizer.com/news/press-release/press-release-detail/pfizer-voluntarily-withdraws-all-lots-sickle-cell-disease
6. **mu234** (Multisystem / Mixed, tp): Card labeled 2024-2025 but states the superseded 2016 USPSTF breast recommendation; contradicts ob148 and he181. Source: https://www.uspreventiveservicestaskforce.org/uspstf/recommendation/breast-cancer-screening
7. **rh001** (Rheumatology, pearls[1]): Contradicts ACR 2020; appears in five cards (rh001, rh033, rh034, rh096, rh102). Source: https://doi.org/10.1002/art.41247
8. **su091** (Surgery, tp): MSLT-II showed no melanoma-specific survival benefit from routine completion dissection. Source: https://doi.org/10.1056/NEJMoa1613210

Rheumatology gout cards rh001, rh033, rh034, rh096, rh102 share one contradiction with ACR 2020 (see proposals). Cards c012, c072, em024 repeat the isolated-new-LBBB STEMI-equivalent claim. Cards n132 and p113 repeat the pre-2024 restless-legs first-line claim.

## 4. Coverage gaps versus the published outlines

Sources: USMLE Step 1 and Step 2 CK content outlines (https://www.usmle.org/sites/default/files/2022-01/USMLE_Content_Outline_0.pdf and the Step 1 / Step 2 CK exam-content pages) and the NBOME COMLEX-USA Level 1/2 master blueprint (https://www.nbome.org/assessments/comlex-usa/). Outline percentages are quoted as extracted from the PDFs/pages and are subject to change; the Step 2 CK page text extracted with a "Nutrition 15-20%" row that looks like a parsing artifact, so treat that line with caution.

### Deck by subject against outline categories

| Deck subject | Cards | Share of deck | Nearest outline category | Step 1 weight | Step 2 CK weight |
|---|---:|---:|---|---|---|
| Neurology | 200 | 6.6% | Behavioral Health & Nervous Systems/Special Senses | 10-14% | 5-10% (Nervous/Special Senses) |
| Cardiology | 210 | 7.0% | Cardiovascular | 7-11% | 6-12% |
| Nephrology | 130 | 4.3% | Renal & Urinary | 11-15% (with Respiratory) | 7-13% (with Reproductive) |
| Psychiatry | 200 | 6.6% | Behavioral Health | within 10-14% | 5-10% |
| Gastroenterology | 200 | 6.6% | Gastrointestinal | 6-10% | 5-10% |
| Pulmonology | 200 | 6.6% | Respiratory | within 11-15% | 5-10% |
| Infectious Disease | 220 | 7.3% | Multisystem / immune | 8-12% (Multisystem) | 4-8% (Multisystem) |
| Endocrinology | 200 | 6.6% | Endocrine | 12-16% (with Reproductive) | 3-7% |
| Hematology/Oncology | 250 | 8.3% | Blood & Lymphoreticular/Immune | 9-13% | 5-10% |
| Rheumatology | 180 | 6.0% | Musculoskeletal, Skin & Subcutaneous | 8-12% | 6-12% |
| Obstetrics/Gynecology | 200 | 6.6% | Reproductive / Pregnancy | within 12-16% | 3-7% (Pregnancy) |
| Pediatrics | 200 | 6.6% | Human Development / cross-cutting | 1-3% | 2-4% |
| Surgery | 200 | 6.6% | Cross-cutting | - | - |
| Emergency Medicine | 180 | 6.0% | Cross-cutting | - | - |
| Multisystem / Mixed | 240 | 8.0% | Multisystem; Biostat; Social sciences | 8-12%; 4-6%; 6-9% | 4-8%; 3-5%; 10-15% (Legal/Ethical) |

### Topic families (keyword counts)

Counted by regex over answers and tags. These are upper bounds (e.g. "Dermatology" also matches dermatomyositis, squamous cancers of non-skin sites and cellulitis variants); a manual read of the dermatology list found roughly 25 true skin-disease cards.

| Family | Approx. cards | Share of 3010 | Outline weight (approx.) | Verdict |
|---|---:|---:|---|---|
| Dermatology / skin | ~25 true (61 regex) | ~1-2% | Step 1 MSK+Skin 8-12%; Step 2 CK 6-12% (shared with MSK); COMLEX integumentary 5% | Severely underrepresented |
| Ophthalmology / ENT / special senses | ~53 regex, mostly neuro or pediatric | ~1.8% | within Nervous/Special Senses 10-14% / 5-10% | Underrepresented (no glaucoma, AMD, retinal detachment, otosclerosis, etc.) |
| Ethics / professionalism / social | ~41 | ~1.4% | Step 2 CK Legal/Ethical/Systems 10-15%; Step 1 Social Sciences 6-9%; COMLEX professionalism and communication 5-10% | Underrepresented |
| Urology / male reproductive | ~48 | ~1.6% | within Renal/Reproductive blocks | Thin (BPH, torsion, prostate/bladder cancer gaps partly filled by the new-card file; several already exist) |
| Musculoskeletal / orthopedic | ~151 regex (mostly rheum) | ~5% | MSK+Skin 8-12% Step 1; 13% COMLEX MSK | Rheumatology is strong; orthopedic tumors, fractures and pediatric ortho are sparse |
| Biostatistics / epidemiology | ~146 regex | ~4.8% | Step 1 4-6%; Step 2 CK 3-5% | Roughly on target; some gaps (NNH, kappa, herd immunity) |
| Nutrition / vitamins | ~139 regex | ~4.6% | COMLEX GI/nutritional health | Adequate; cards exist for scurvy, pellagra-type items, kwashiorkor, refeeding |
| Geriatrics / prevention | ~175 regex | ~5.8% | Human Development 1-4%; Step 2 prevention 5-10% | Adequate but lacks frailty, sarcopenia, overflow incontinence, Beers list |

Interpretation: the deck is organ-system and buzzword heavy. Cardiology, GI, neurology, heme/onc and infectious disease are covered in depth; the largest outline-versus-deck gaps are skin (the outline weight for MSK/Skin is 8-12% on Step 1, but the deck has roughly 1-2% skin cards), special senses, and ethics/professionalism (10-15% of Step 2 CK). COMLEX also tests osteopathic principles and manipulative treatment (about 10-15% of Level 1), which the deck does not address at all.

### Draft new cards

117 cards in `docs/proposed-new-cards.js` (not imported anywhere; human review required). Distribution:

| Group | Cards |
|---|---:|
| Dermatology | 36 |
| Ophthalmology / ENT | 27 |
| Urology / male reproductive | 12 |
| Ethics / professionalism | 14 |
| Orthopedics / MSK tumors | 6 |
| Biostatistics | 8 |
| Geriatrics / prevention | 8 |
| Nutrition | 3 |
| Anatomy / nerve injury | 3 |

Each card has 3-4 clues within the 260-character budget, exactly two distractors with why-wrong text, a teaching point, pearls, exam tags and a `source_ref` URL. They were checked with `validateCard()`, the clue-length and fragment rules, `strictLeakReport()` and a check that no id or answer duplicates a live card (20 of the first drafts were dropped because the deck already covers them). Dermatology, ophthalmology and ENT lack a canonical subject in `js/cardschema.js`, so they use "Multisystem / Mixed" with a specialty tag; promoting them may justify adding subjects. `source_ref` is not a schema field; strip it or extend the schema when promoting.

## 5. Caveats

- Many publisher sites (CDC, NCBI Bookshelf, AHA, ACOG) return 403 or a bot check to automated requests, so those URLs were not machine-verified. Open them manually. Several StatPearls links in the new-card file are NCBI search URLs for the same reason.
- Volatile guidance: CDC immunization schedules (2025-26), the 2026 lipid guideline, USPSTF drafts and ACOG updates change often. Re-check dates before applying any proposal that cites them.
- The review was a read-through of every card with spot verification against sources, not an independent re-derivation of every number. Low-confidence items are labelled as such.
- No attempt was made to rewrite clue text or difficulty ratings.

## 6. Details: all proposals

Each entry: card id, field, what the card says, what the source says, confidence, suggested replacement. Same data as `docs/proposed-card-changes.json`.

### Neurology

- **n167** `pearls[2]` (high severity, high confidence)
  - Card says: Triple-H therapy (hypertension, hypervolemia, hemodilution) for symptomatic vasospasm
  - Source says: Triple-H (hypervolemia/hemodilution) was abandoned; the 2023 AHA/ASA aSAH guideline recommends euvolemia and does not support prophylactic hypervolemia or hemodilution. https://www.ahajournals.org/doi/10.1161/STR.0000000000000436
  - Suggested: Prophylactic triple-H therapy is no longer recommended; maintain euvolemia and consider induced hypertension only for delayed cerebral ischemia
- **n132** `pearls[1]` (high severity, high confidence)
  - Card says: Dopamine agonists (pramipexole, ropinirole) or gabapentin for treatment
  - Source says: The 2024 AASM RLS guideline reversed the 2012 position and no longer endorses dopamine agonists as first-line therapy. https://aasm.org/summary-of-new-clinical-practice-guideline-for-rls-and-plmd/
  - Suggested: AASM 2024: gabapentin enacarbil, gabapentin or pregabalin are preferred, plus IV ferric carboxymaltose if iron-deficient; standard use of dopamine agonists (pramipexole, ropinirole) is now conditionally recommended against because of augmentation
- **n091** `tp` (low severity, medium confidence)
  - Card says: tPA within 4.5 hours of symptom onset if no contraindications. BP must be <185/110 before administration.
  - Source says: Tenecteplase 0.25 mg/kg is now an accepted alternative (FDA labeled it for acute ischemic stroke in 2025); the alteplase-only wording is incomplete, not wrong. https://www.ahajournals.org/doi/10.1161/STR.0000000000000211
  - Suggested: IV thrombolysis (alteplase or tenecteplase) within 4.5 hours of symptom onset if no contraindications. BP must be <185/110 before administration.
- **n175** `pearls[2]` (medium severity, medium confidence)
  - Card says: Treatment: RIPE therapy + dexamethasone for severe cases
  - Source says: ATS/CDC/IDSA 2016 recommends adjunctive corticosteroids for TB meningitis; restricting them to severe disease is outdated. https://doi.org/10.1093/cid/ciw376
  - Suggested: Treatment: RIPE therapy + adjunctive dexamethasone (recommended for TB meningitis generally, not only severe cases)
- **n088** `pearls[2]` (low severity, medium confidence)
  - Card says: Acute BP control: target SBP <140 within 1 hour
  - Source says: The 2022 ICH guideline specifies a 130-150 mmHg range and warns against intensive lowering below 130. https://www.ahajournals.org/doi/10.1161/STR.0000000000000407
  - Suggested: Acute BP control (AHA/ASA 2022): lower SBP toward 140 mmHg and keep it in the 130-150 range; avoid SBP <130
- **n089** `tp` (low severity, medium confidence)
  - Card says: GBM: most common primary malignant brain tumor in adults. WHO grade IV. Pseudopalisading necrosis on histology.
  - Source says: WHO CNS5 restricts the term glioblastoma to IDH-wildtype tumors; IDH-mutant astrocytomas are no longer called GBM. https://doi.org/10.1093/neuonc/noab106
  - Suggested: GBM: most common primary malignant brain tumor in adults. IDH-wildtype, CNS WHO grade 4 (WHO 2021). Pseudopalisading necrosis on histology.

### Cardiology

- **c012** `pearls[1]` (high severity, high confidence)
  - Card says: New LBBB + chest pain = STEMI equivalent
  - Source says: The 2013 STEMI guideline and the 2021/2025 chest pain and ACS guidelines removed isolated new LBBB as an automatic STEMI equivalent. The deck also contradicts itself (c156 already says this). https://www.ahajournals.org/doi/10.1161/CIR.0000000000001309
  - Suggested: New LBBB alone is no longer a STEMI equivalent; apply (modified) Sgarbossa criteria and clinical judgment
- **c072** `tp` (high severity, high confidence)
  - Card says: LBBB: broad notched R in lateral leads. New LBBB + chest pain = STEMI equivalent. Treat as STEMI.
  - Source says: Same as c012; contradicts c156. https://www.ahajournals.org/doi/10.1161/CIR.0000000000001309
  - Suggested: LBBB: broad notched R in lateral leads. New LBBB with chest pain is not by itself a STEMI equivalent in current guidelines; use (modified) Sgarbossa criteria and clinical judgment.
- **c072** `pearls[1]` (high severity, high confidence)
  - Card says: New LBBB + chest pain = treat as STEMI
  - Source says: Same as c012. https://www.ahajournals.org/doi/10.1161/CIR.0000000000001309
  - Suggested: New LBBB + chest pain: apply Sgarbossa criteria; not an automatic STEMI equivalent
- **c022** `pearls[2]` (medium severity, medium confidence)
  - Card says: Standard HF therapy but avoid ACEi/ARBs if breastfeeding
  - Source says: Enalapril/captopril are compatible with lactation; the blanket warning is not supported. https://www.ahajournals.org/doi/10.1161/CIR.0000000000001063
  - Suggested: Standard HF therapy postpartum; ACEi/ARBs are contraindicated in pregnancy, but enalapril and captopril are acceptable during breastfeeding
- **c200** `tp` (medium severity, high confidence)
  - Card says: RCRI: IHD, CHF, CVA/TIA, DM on insulin, CrCl ≤2, high-risk surgery. If ≥4 METs without symptoms → proceed to surgery without further testing.
  - Source says: The RCRI renal criterion is preoperative serum creatinine >2.0 mg/dL; "CrCl ≤2" is not a valid threshold. https://www.ahajournals.org/doi/10.1161/CIR.0000000000001285
  - Suggested: RCRI: IHD, CHF, CVA/TIA, DM on insulin, serum creatinine >2.0 mg/dL, high-risk surgery. If ≥4 METs without symptoms → proceed to surgery without further testing.
- **c045** `tp` (medium severity, medium confidence)
  - Card says: Stable demand ischemia. Stress test for diagnosis. Medical therapy: aspirin, statin, beta-blocker, nitrate.
  - Source says: 2021 AHA/ACC chest pain and 2023 chronic coronary disease guidelines favor CCTA or stress imaging; beta-blockers improve outcomes mainly after MI or with reduced EF. https://www.ahajournals.org/doi/10.1161/CIR.0000000000001029
  - Suggested: Stable demand ischemia. Initial testing: coronary CTA or stress imaging (CCTA is favored for many patients without known CAD). Medical therapy: aspirin, statin, plus a beta-blocker or CCB (± long-acting nitrate) for symptom control.
- **c045** `pearls[0]` (medium severity, medium confidence)
  - Card says: Stress test is initial diagnostic test in stable angina
  - Source says: See tp. https://www.ahajournals.org/doi/10.1161/CIR.0000000000001029
  - Suggested: Coronary CTA or stress testing (ECG or imaging) is the initial evaluation of stable chest pain (2021 AHA/ACC)
- **c045** `pearls[2]` (medium severity, medium confidence)
  - Card says: Medical therapy: aspirin + statin + beta-blocker ± long-acting nitrate
  - Source says: 2023 chronic coronary disease guideline. https://www.ahajournals.org/doi/10.1161/CIR.0000000000001168
  - Suggested: Antianginals: beta-blocker or CCB first; add long-acting nitrate or ranolazine; beta-blockers improve outcomes mainly after MI or with EF ≤50%
- **c110** `pearls[0]` (low severity, medium confidence)
  - Card says: Exercise stress test is first-line for stable angina evaluation
  - Source says: See c045. https://www.ahajournals.org/doi/10.1161/CIR.0000000000001029
  - Suggested: Exercise ECG stress testing is one option for stable chest pain; coronary CTA or stress imaging are preferred in many patients (2021 AHA/ACC)
- **c069** `tp` (low severity, low confidence)
  - Card says: Duke criteria: 2 major or 1 major + 3 minor or 5 minor. Blood cultures + echo. Empiric vanc + gent.
  - Source says: AHA 2015 and ESC 2023 de-emphasize gentamicin for staphylococcal native-valve endocarditis; regimen choice depends on risk and local resistance. https://doi.org/10.1093/eurheartj/ehad193
  - Suggested: Duke criteria: 2 major or 1 major + 3 minor or 5 minor. Blood cultures + echo. Empiric therapy per AHA/ESC: vancomycin plus a second agent chosen by risk (for example ceftriaxone or cefepime); routine gentamicin is no longer favored for staphylococcal native-valve IE. Duke-ISCVID 2023 criteria are the current update.
- **c104** `tp` (medium severity, medium confidence)
  - Card says: JNC 8/ACC 2017: thiazide, CCB, ACEi, or ARB for uncomplicated HTN. Target <130/80 for most adults.
  - Source says: The 2025 AHA/ACC guideline replaced the 2017 document (JNC 8 was never an ACC/AHA guideline). https://www.acc.org/latest-in-cardiology/journal-scans/2025/08/14/15/36/new-acc-aha-guideline-addresses-prevention-detection-evaluation-and-management-of-hbp
  - Suggested: 2025 AHA/ACC: thiazide-type diuretic, ACEi/ARB, or dihydropyridine CCB first-line; a two-drug single-pill combination is preferred for stage 2 (≥140/90). Target <130/80 for most adults.
- **c104** `pearls[1]` (medium severity, medium confidence)
  - Card says: African Americans: thiazide or CCB preferred (not ACEi/ARB monotherapy)
  - Source says: Race-based first-line selection was dropped in 2025. https://www.acc.org/latest-in-cardiology/journal-scans/2025/08/14/15/36/new-acc-aha-guideline-addresses-prevention-detection-evaluation-and-management-of-hbp
  - Suggested: The 2025 AHA/ACC guideline no longer recommends different first-line drugs by race; choose by comorbidities (ACEi/ARB for albuminuric CKD or diabetes)
- **c168** `tp` (low severity, medium confidence)
  - Card says: 2017 ACC/AHA: Stage 1 HTN = 130-139/80-89. Stage 2 = ≥140/90. Confirm with out-of-office measurements. Lifestyle for Stage 1 low-risk; meds if high-risk or Stage 2.
  - Source says: Title/body cite the 2017 guideline; the 2025 guideline keeps categories but changes treatment initiation (PREVENT). https://www.acc.org/latest-in-cardiology/journal-scans/2025/08/14/15/36/new-acc-aha-guideline-addresses-prevention-detection-evaluation-and-management-of-hbp
  - Suggested: 2017 ACC/AHA: Stage 1 HTN = 130-139/80-89. Stage 2 = ≥140/90. Confirm with out-of-office measurements. Stage 1: start drugs if PREVENT 10-year CVD risk ≥7.5% or established CVD/diabetes/CKD (2025 AHA/ACC keeps the 2017 categories); Stage 2: two-drug combination.
- **c161** `tp` (medium severity, medium confidence)
  - Card says: Four statin benefit groups: clinical ASCVD, LDL ≥190, diabetes 40-75, 10-year ASCVD risk ≥7.5%. High-intensity: atorvastatin 40-80mg or rosuvastatin 20-40mg.
  - Source says: A 2026 guideline superseded the 2018 thresholds the card teaches. Exam boards may still test 2018; consider dual-labeling. https://www.consultant360.com/exclusive/accaha-issue-2026-cholesterol-guideline-lower-ldl-targets-expanded-risk-assessment
  - Suggested: Four statin benefit groups (2018 ACC/AHA): clinical ASCVD, LDL ≥190, diabetes 40-75, 10-year risk ≥7.5%. The 2026 ACC/AHA dyslipidemia guideline now uses PREVENT risk (statin indicated from about 5% 10-year risk) and restores LDL-C goals (<70 mg/dL in ASCVD, <55 in very high risk). Verify against the guideline text before adopting. High-intensity: atorvastatin 40-80mg or rosuvastatin 20-40mg.
- **c137** `pearls[2]` (low severity, low confidence)
  - Card says: Target BP <140/90 (or <135/85 per CHAP trial)
  - Source says: The <135/85 number could not be verified against CHAP; keep only after checking. https://www.acc.org/latest-in-cardiology/journal-scans/2025/08/14/15/36/new-acc-aha-guideline-addresses-prevention-detection-evaluation-and-management-of-hbp
  - Suggested: CHAP trial: treating chronic hypertension at ≥140/90 (goal <140/90) improved pregnancy outcomes; verify the <135/85 figure before keeping it
- **c151** `pearls[1]` (low severity, medium confidence)
  - Card says: Group 1 (PAH): PCWP ≤15 and PVR ≥3 Wood units
  - Source says: 2022 ESC/ERS lowered the precapillary PH PVR threshold to >2 WU. https://doi.org/10.1093/eurheartj/ehac237
  - Suggested: Group 1 (PAH): PCWP ≤15 and PVR >2 Wood units (2022 ESC/ERS; older criterion ≥3)
- **c176** `pearls[0]` (medium severity, high confidence)
  - Card says: Idarucizumab reverses dabigatran; andexanet alfa reverses Xa inhibitors
  - Source says: AstraZeneca withdrew Andexxa from the US after thrombosis concerns (ANNEXA-I). https://www.tctmd.com/news/andexanet-alfa-pulled-us-market
  - Suggested: Idarucizumab reverses dabigatran; 4-factor PCC is used for life-threatening Xa-inhibitor bleeding (andexanet alfa was withdrawn from the US market in December 2025)
- **c160** `tp` (low severity, low confidence)
  - Card says: Treat urgently: IV calcium gluconate (stabilize membrane) → insulin + glucose (shift K into cells) → kayexalate/patiromer (remove K). Dialysis if refractory.
  - Source says: SPS carries bowel-necrosis warnings and slow onset; newer binders are preferred. Low-priority modernization. https://doi.org/10.1093/eurheartj/ehad193
  - Suggested: Treat urgently: IV calcium gluconate (stabilize membrane) → insulin + glucose (shift K into cells) → a K binder such as sodium zirconium cyclosilicate or patiromer (sodium polystyrene sulfonate is slow and falling out of favor) (remove K). Dialysis if refractory.
- **c078** `pearls[1]` (low severity, low confidence)
  - Card says: Digibind (Fab fragments) is antidote — also binds and lowers K
  - Source says: Brand name and wording. https://litfl.com/calcium-digoxin-toxicity-and-stone-heart-theory/
  - Suggested: Digoxin-specific Fab (DigiFab; the Digibind brand is discontinued) is the antidote; reversing Na/K-ATPase inhibition also lowers K

### Nephrology

- **ne034** `tp` (medium severity, medium confidence)
  - Card says: HRS: functional renal failure in advanced liver disease. FeNa <1%. Liver transplant definitive. Midodrine + octreotide bridge.
  - Source says: AASLD 2021 guidance prefers terlipressin/norepinephrine with albumin for HRS-AKI. https://doi.org/10.1002/hep.32049
  - Suggested: HRS: functional renal failure in advanced liver disease. FeNa <1%. Liver transplant definitive. Albumin plus a vasoconstrictor: terlipressin (FDA-approved 2022) or norepinephrine preferred; midodrine + octreotide is a less effective alternative.
- **ne069** `tp` (medium severity, medium confidence)
  - Card says: HRS: functional renal failure in advanced liver disease. FeNa <1% (kidneys structurally normal). Liver transplant definitive. Bridge: midodrine + octreotide + albumin.
  - Source says: Same as ne034. https://doi.org/10.1002/hep.32049
  - Suggested: HRS: functional renal failure in advanced liver disease. FeNa <1% (kidneys structurally normal). Liver transplant definitive. Treatment: albumin + terlipressin (or norepinephrine); midodrine + octreotide + albumin is a less effective alternative.
- **ne127** `pearls[0]` (low severity, high confidence)
  - Card says: ACEi/ARBs are Category X in pregnancy — absolute contraindication
  - Source says: Letter categories no longer exist. https://www.fda.gov/drugs/labeling-information-drug-products/pregnancy-and-lactation-labeling-drugs-final-rule
  - Suggested: ACEi/ARBs carry a boxed warning for fetal toxicity (FDA letter categories were retired in 2015) — contraindicated in pregnancy
- **ne093** `pearls[0]` (low severity, medium confidence)
  - Card says: Keep Ca x P product <55 to prevent metastatic calcification
  - Source says: KDIGO 2009/2017 dropped the Ca×P target. https://kdigo.org/guidelines/ckd-mbd/
  - Suggested: Older teaching: keep Ca × P <55; KDIGO CKD-MBD no longer uses the product and targets individual calcium, phosphate and PTH values
- **ne092** `pearls[1]` (low severity, medium confidence)
  - Card says: Target Hgb 10-11 g/dL — avoid >13 (thrombosis risk)
  - Source says: The ">13" cut is far above current labeling/KDIGO caution. https://kdigo.org/guidelines/anemia-in-ckd/
  - Suggested: Use the lowest ESA dose that avoids transfusion; KDIGO advises not to intentionally exceed Hgb 11.5 g/dL (higher targets raise stroke and CV risk)
- **ne095** `pearls[0]` (low severity, medium confidence)
  - Card says: <5mm stones pass spontaneously ~90% of the time
  - Source says: The 90% figure overstates published passage rates. https://www.ncbi.nlm.nih.gov/pmc/articles/PMC5635101/
  - Suggested: Stones <5 mm pass spontaneously in roughly two-thirds or more of patients (pooled estimate ~68%; ~47% for 5-10 mm)
- **ne095** `tp` (low severity, medium confidence)
  - Card says: Stones <5mm usually pass spontaneously (90%). Hydration + NSAIDs for pain. Alpha-blockers (tamsulosin) for medical expulsive therapy.
  - Source says: Same as above. https://www.ncbi.nlm.nih.gov/pmc/articles/PMC5635101/
  - Suggested: Stones <5mm usually pass spontaneously (about two-thirds or more). Hydration + NSAIDs for pain. Alpha-blockers (tamsulosin) for medical expulsive therapy.
- **ne095** `pearls[2]` (low severity, medium confidence)
  - Card says: Tamsulosin relaxes ureteral smooth muscle to aid passage
  - Source says: Evidence for medical expulsive therapy is mixed. https://www.ncbi.nlm.nih.gov/pmc/articles/PMC5635101/
  - Suggested: Tamsulosin relaxes ureteral smooth muscle, but trials (SUSPEND, STONE) showed little benefit; any benefit is mainly for larger (>5 mm) distal stones
- **ne025** `tp` (low severity, low confidence)
  - Card says: WBC casts localize infection to kidney. Treat fluoroquinolones or TMP-SMX. Urine culture confirms.
  - Source says: Rising fluoroquinolone/TMP-SMX resistance changes empiric choices. https://www.idsociety.org/practice-guideline/complicated-urinary-tract-infections/
  - Suggested: WBC casts localize infection to kidney. Outpatient: fluoroquinolone only if local resistance is <10%, otherwise a ceftriaxone dose then culture-directed oral therapy (TMP-SMX or a beta-lactam). Urine culture confirms.
- **ne091** `pearls[0]` (low severity, medium confidence)
  - Card says: CKD-EPI is preferred over MDRD for GFR estimation
  - Source says: NKF-ASN 2021 removed the race coefficient. https://doi.org/10.1056/NEJMoa2102953
  - Suggested: CKD-EPI (2021 race-free creatinine and creatinine-cystatin C equations) is preferred over MDRD; race is no longer used
- **ne040** `pearls[2]` (low severity, medium confidence)
  - Card says: Most common cause of secondary hypertension
  - Source says: Primary aldosteronism is the leading endocrine cause; OSA and renal disease are also very common. https://www.endocrine.org/clinical-practice-guidelines/primary-aldosteronism-2
  - Suggested: Most common endocrine cause of secondary hypertension (2025 Endocrine Society guideline suggests screening all adults with hypertension)

### Psychiatry

- **p113** `tp` (high severity, high confidence)
  - Card says: Check serum ferritin — treat iron deficiency if ferritin <75. Dopamine agonists (pramipexole, ropinirole) or gabapentin first-line.
  - Source says: Same AASM 2024 reversal as n132. https://aasm.org/summary-of-new-clinical-practice-guideline-for-rls-and-plmd/
  - Suggested: Check serum ferritin — treat iron deficiency if ferritin <75. AASM 2024: gabapentinoids (gabapentin, pregabalin, gabapentin enacarbil) are first-line and IV ferric carboxymaltose is preferred when iron-deficient; dopamine agonists are no longer recommended for standard use (augmentation risk).
- **p113** `pearls[1]` (high severity, high confidence)
  - Card says: Dopamine agonists or gabapentin/pregabalin are first-line
  - Source says: Same AASM 2024 reversal as n132. https://aasm.org/summary-of-new-clinical-practice-guideline-for-rls-and-plmd/
  - Suggested: Gabapentin enacarbil, gabapentin or pregabalin are first-line (AASM 2024); dopamine agonists are conditionally recommended against
- **p056** `pearls[1]` (medium severity, high confidence)
  - Card says: REMS program: mandatory ANC monitoring (weekly → biweekly → monthly)
  - Source says: FDA announced removal of the REMS in 2025; labeled ANC monitoring continues. https://www.fda.gov/drugs/drug-safety-and-availability/fda-removes-risk-evaluation-and-mitigation-strategy-rems-program-antipsychotic-drug-clozapine
  - Suggested: ANC monitoring is still required by the label (weekly for 6 months, then biweekly, then monthly); the Clozapine REMS program itself was eliminated by the FDA in 2025
- **p165** `ans` (medium severity, high confidence)
  - Card says: Excited Delirium
  - Source says: ACEP withdrew its 2009 white paper (Oct 2023); "excited delirium" is not a recognized diagnosis. https://www.psychiatrist.com/news/acep-drops-endorsement-for-2009-excited-delirium-paper
  - Suggested: Severe Hyperactive Delirium (formerly "Excited Delirium")
- **p165** `tp` (medium severity, high confidence)
  - Card says: Controversial entity. Agitation + hyperthermia + altered consciousness + often stimulant use. Risk of sudden cardiac death. Rapid sedation and cooling. Avoid prolonged physical restraint.
  - Source says: Same as above. https://www.psychiatrist.com/news/acep-drops-endorsement-for-2009-excited-delirium-paper
  - Suggested: "Excited delirium" is not a recognized diagnosis (ACEP withdrew its 2009 white paper in 2023; AMA and APA reject the term). Modern framing: hyperactive delirium or severe agitation with hyperadrenergic features and hyperthermia. Treat as a medical emergency: rapid sedation, cooling, avoid prolonged prone restraint.
- **p039** `pearls[1]` (low severity, medium confidence)
  - Card says: Most common personality disorder in clinical settings
  - Source says: Borderline PD, not OCPD, predominates in clinical samples. https://www.ncbi.nlm.nih.gov/books/NBK493158/
  - Suggested: OCPD is among the most prevalent personality disorders in the general population (borderline PD is the most common in clinical settings)
- **p167** `pearls[2]` (low severity, low confidence)
  - Card says: Cluster C: most commonly seen in clinical practice
  - Source says: See p039. https://www.ncbi.nlm.nih.gov/books/NBK493158/
  - Suggested: Borderline (Cluster B) is the most common personality disorder in clinical settings; OCPD (Cluster C) is the most prevalent in community samples
- **p046** `pearls[0]` (low severity, high confidence)
  - Card says: Malingering is NOT a psychiatric diagnosis (it's a V-code)
  - Source says: V-codes were replaced by ICD-10-CM Z-codes. https://www.icd10data.com/ICD10CM/Codes/Z00-Z99/Z69-Z76/Z76-/Z76.5
  - Suggested: Malingering is NOT a psychiatric diagnosis (it is coded as a Z-code: "other conditions that may be a focus of clinical attention", ICD-10-CM Z76.5)

### Gastroenterology

- **g187** `tp` (medium severity, medium confidence)
  - Card says: Rapidly progressive renal failure in advanced cirrhosis. Diagnosis of exclusion. Type 1: creatinine doubles in <2 weeks. Bridge: midodrine + octreotide + albumin. Liver transplant definitive.
  - Source says: Same as ne034. https://doi.org/10.1002/hep.32049
  - Suggested: Rapidly progressive renal failure in advanced cirrhosis. Diagnosis of exclusion. Type 1: creatinine doubles in <2 weeks. Treatment: albumin + terlipressin (or norepinephrine); midodrine + octreotide + albumin is a less effective alternative. Liver transplant definitive.
- **g090** `tp` (high severity, high confidence)
  - Card says: First-line: PPI + clarithromycin + amoxicillin × 14 days. Bismuth quadruple therapy if penicillin allergic. Confirm eradication with urea breath test or stool antigen.
  - Source says: ACG 2024 dropped empiric clarithromycin triple therapy as first-line because of US resistance. https://pubmed.ncbi.nlm.nih.gov/39626064/
  - Suggested: First-line (ACG 2024): optimized bismuth quadruple therapy for 14 days (PPI + bismuth + tetracycline + metronidazole). Clarithromycin triple therapy only when clarithromycin susceptibility is documented. Alternatives: rifabutin triple or vonoprazan-based regimens. Confirm eradication with urea breath test or stool antigen.
- **g090** `pearls[2]` (high severity, high confidence)
  - Card says: Bismuth quadruple therapy is alternative if penicillin allergy
  - Source says: Same as tp. https://pubmed.ncbi.nlm.nih.gov/39626064/
  - Suggested: Bismuth quadruple therapy is the preferred first-line regimen in the US; it is essential in penicillin allergy
- **g060** `ans` (medium severity, high confidence)
  - Card says: Non-Alcoholic Fatty Liver Disease
  - Source says: The 2023 multisociety nomenclature renamed NAFLD to MASLD and NASH to MASH. https://doi.org/10.1097/HEP.0000000000000520
  - Suggested: Metabolic Dysfunction-Associated Steatotic Liver Disease (MASLD, formerly NAFLD)
- **g060** `tp` (medium severity, high confidence)
  - Card says: NAFLD: most common liver disease worldwide. Can progress: steatosis → NASH → cirrhosis → HCC. Weight loss and exercise first-line.
  - Source says: Nomenclature change. https://doi.org/10.1097/HEP.0000000000000520
  - Suggested: MASLD (formerly NAFLD): most common liver disease worldwide. Can progress: steatosis → MASH (formerly NASH) → cirrhosis → HCC. Weight loss and exercise first-line; resmetirom is approved for noncirrhotic MASH with F2-F3 fibrosis.
- **g163** `ans` (medium severity, high confidence)
  - Card says: NASH (Nonalcoholic Steatohepatitis)
  - Source says: Nomenclature change. https://doi.org/10.1097/HEP.0000000000000520
  - Suggested: MASH (Metabolic Dysfunction-Associated Steatohepatitis, formerly NASH)
- **g163** `tp` (medium severity, high confidence)
  - Card says: NASH = steatosis + inflammation + hepatocyte ballooning ± fibrosis. Diagnosis requires liver biopsy. Can progress to cirrhosis and HCC. Weight loss is cornerstone.
  - Source says: Nomenclature change. https://doi.org/10.1097/HEP.0000000000000520
  - Suggested: MASH (formerly NASH) = steatosis + inflammation + hepatocyte ballooning ± fibrosis. Diagnosis requires liver biopsy. Can progress to cirrhosis and HCC. Weight loss is cornerstone.
- **g193** `tp` (medium severity, high confidence)
  - Card says: Low-risk adenoma (1-2, <10mm, tubular): repeat in 7-10 years. High-risk (≥3, ≥10mm, villous, HGD): repeat in 3 years. Serrated polyps: varies by size/location.
  - Source says: The 2020 update split the old 3-year "advanced" group; 3-4 small adenomas now get 3-5 years. https://doi.org/10.1053/j.gastro.2019.10.026
  - Suggested: 2020 USMSTF: 1-2 tubular adenomas <10 mm: 7-10 years; 3-4 adenomas <10 mm: 3-5 years; 5-10 adenomas, or any adenoma ≥10 mm, villous histology or HGD: 3 years; >10 adenomas: 1 year. Serrated polyps: varies by size/location.
- **g193** `pearls[0]` (medium severity, high confidence)
  - Card says: Low-risk: 7-10 years; high-risk: 3 years
  - Source says: Same as tp. https://doi.org/10.1053/j.gastro.2019.10.026
  - Suggested: 1-2 small tubular adenomas: 7-10 years; 3-4 small adenomas: 3-5 years; advanced adenoma or 5-10 adenomas: 3 years
- **g183** `pearls[0]` (low severity, medium confidence)
  - Card says: Carvedilol may be superior to propranolol (additional alpha-1 block)
  - Source says: Guidelines now prefer carvedilol. https://doi.org/10.1016/j.jhep.2021.12.022
  - Suggested: Carvedilol is now preferred in compensated cirrhosis with clinically significant portal hypertension (Baveno VII; AASLD 2024)
- **g046** `pearls[1]` (low severity, medium confidence)
  - Card says: Non-selective beta-blockers (propranolol, nadolol) for prophylaxis
  - Source says: Same as g183. https://doi.org/10.1016/j.jhep.2021.12.022
  - Suggested: Non-selective beta-blockers for prophylaxis; carvedilol is now preferred (propranolol or nadolol are alternatives)
- **g099** `tp` (low severity, low confidence)
  - Card says: Encapsulated fluid collection without solid component, develops >4 weeks after interstitial edematous pancreatitis. Drain if symptomatic or >6cm.
  - Source says: Modern pancreatic fluid collection management is symptom- and complication-driven. https://doi.org/10.1136/gutjnl-2012-302779
  - Suggested: Encapsulated fluid collection without solid component, develops >4 weeks after interstitial edematous pancreatitis. Drain only if symptomatic, infected or obstructing; size alone (>6 cm) is no longer an indication.
- **g099** `pearls[1]` (low severity, low confidence)
  - Card says: Drain if symptomatic, infected, or >6cm
  - Source says: Same as tp. https://doi.org/10.1136/gutjnl-2012-302779
  - Suggested: Drain if symptomatic, infected, or obstructing; size alone is not an indication
- **g127** `tp` (medium severity, high confidence)
  - Card says: GI relevance: allopurinol can cause hepatotoxicity; febuxostat preferred in CKD. Colchicine causes diarrhea (common GI side effect). NSAIDs risk GI bleed.
  - Source says: ACR 2020 strongly prefers allopurinol over other xanthine oxidase inhibitors, including in CKD. https://doi.org/10.1002/art.41247
  - Suggested: GI relevance: allopurinol can cause hepatotoxicity; allopurinol is first-line urate-lowering therapy even in CKD (ACR 2020); febuxostat is second-line. Colchicine causes diarrhea (common GI side effect). NSAIDs risk GI bleed.
- **g127** `pearls[2]` (medium severity, high confidence)
  - Card says: Febuxostat doesn't need renal dose adjustment
  - Source says: Same as tp. https://doi.org/10.1002/art.41247
  - Suggested: Febuxostat needs no dose adjustment in mild-moderate CKD but carries a boxed warning for cardiovascular death
- **g031** `pearls[2]` (low severity, medium confidence)
  - Card says: TMP-SMX long-term treatment
  - Source says: Current regimens use a parenteral induction phase before long-term TMP-SMX. https://doi.org/10.1053/j.gastro.2009.10.041
  - Suggested: Initial ceftriaxone (or meropenem) for about 2 weeks, then TMP-SMX for about 12 months
- **g122** `tp` (low severity, medium confidence)
  - Card says: MELD uses bilirubin, INR, and creatinine. Higher score = higher transplant priority. MELD-Na incorporates sodium for better prediction.
  - Source says: Allocation score changed in 2023. https://optn.transplant.hrsa.gov/policies-bylaws/a-closer-look/meld-3-0/
  - Suggested: MELD uses bilirubin, INR, and creatinine. Higher score = higher transplant priority. MELD-Na incorporates sodium; MELD 3.0 (adopted by OPTN in July 2023) also adds albumin and female sex.
- **g033** `tp` (low severity, medium confidence)
  - Card says: Inflammation of diverticulum. Left-sided appendicitis. CT with contrast diagnostic. Antibiotics ± drainage.
  - Source says: AGA 2021 recommends selective rather than routine antibiotics. https://doi.org/10.1053/j.gastro.2020.09.059
  - Suggested: Inflammation of diverticulum. Left-sided appendicitis. CT with contrast diagnostic. Uncomplicated disease in immunocompetent patients can often be managed without antibiotics (AGA 2021); abscesses >3-4 cm need drainage plus antibiotics.

### Pulmonology

- **pu010** `pearls[2]` (medium severity, high confidence)
  - Card says: Step therapy: SABA PRN → low-dose ICS → ICS-LABA → high-dose ICS-LABA → biologics
  - Source says: The SABA-first stepwise ladder was retired by GINA (2019+) and NAEPP 2020. https://ginasthma.org/2024-report/
  - Suggested: GINA 2024 (age ≥12): preferred track is as-needed low-dose ICS-formoterol at every step (± daily ICS-formoterol); SABA-only treatment is no longer recommended; biologics for severe asthma
- **pu048** `tp` (medium severity, high confidence)
  - Card says: Latent: positive test, negative CXR, asymptomatic. Treat with isoniazid 9 months (add pyridoxine/B6) or rifampin 4 months.
  - Source says: Short rifamycin-based regimens are now preferred over 9 months of isoniazid. https://www.cdc.gov/mmwr/volumes/69/rr/rr6901a1.htm
  - Suggested: Latent: positive test, negative CXR, asymptomatic. CDC/NTCA 2020 preferred regimens: 3 months of weekly isoniazid + rifapentine (3HP), 4 months of rifampin (4R) or 3 months of daily isoniazid + rifampin (3HR); 6-9 months of isoniazid (with pyridoxine) is an alternative.
- **pu058** `tp` (medium severity, medium confidence)
  - Card says: RSV most common cause. <2 years old. Supportive care (suctioning, O2). Palivizumab prophylaxis for high-risk infants.
  - Source says: Long-acting RSV monoclonals and the maternal vaccine now cover most infants. https://www.cdc.gov/rsv/hcp/vaccine-clinical-guidance/infants-young-children.html
  - Suggested: RSV most common cause. <2 years old. Supportive care (suctioning, O2). Prevention: nirsevimab (or clesrovimab) for infants <8 months entering their first RSV season, or maternal RSV vaccine at 32-36 weeks; palivizumab only for select high-risk infants when those are unavailable.
- **pu058** `pearls[1]` (medium severity, medium confidence)
  - Card says: Palivizumab prophylaxis for premature infants and those with CHD/BPD
  - Source says: Same as tp. https://www.cdc.gov/rsv/hcp/vaccine-clinical-guidance/infants-young-children.html
  - Suggested: Nirsevimab/clesrovimab (single dose) or maternal RSV vaccine now cover most infants; palivizumab (monthly) is reserved for select high-risk infants
- **pu077** `tp` (low severity, medium confidence)
  - Card says: LAMA (tiotropium, umeclidinium) first-line maintenance for COPD. Reduces exacerbations. Different from short-acting ipratropium.
  - Source says: Card contradicts pu145 (GOLD ABE). https://goldcopd.org/2024-gold-report/
  - Suggested: GOLD 2024: LABA + LAMA is initial therapy for Group B and E (LAMA alone is acceptable for Group A); add ICS if blood eosinophils ≥300 in Group E. LAMA examples: tiotropium, umeclidinium. Reduces exacerbations. Different from short-acting ipratropium.
- **pu077** `pearls[0]` (low severity, medium confidence)
  - Card says: GOLD guidelines: LAMA or LABA first-line maintenance
  - Source says: Same as tp. https://goldcopd.org/2024-gold-report/
  - Suggested: GOLD 2024: Group B/E start LABA + LAMA; consider ICS with eosinophils ≥300
- **pu142** `tp` (medium severity, high confidence)
  - Card says: Most common type (85%): proximal esophageal atresia with distal TEF (H-type). NG tube coils in proximal pouch. Polyhydramnios in utero.
  - Source says: H-type fistula is a different, rare entity without atresia (pe182); the card contradicts itself. Internal contradiction with pe097/pe182 in this deck; Gross classification of esophageal atresia (no URL)
  - Suggested: Most common type (85%): proximal esophageal atresia with distal TEF (Gross type C). NG tube coils in proximal pouch. Polyhydramnios in utero.
- **pu197** `tp` (medium severity, high confidence)
  - Card says: CDC recommends PCV15 followed by PPSV23 (or PCV20 alone) for adults ≥65 or immunocompromised or with chronic conditions. Prevents invasive pneumococcal disease.
  - Source says: ACIP lowered the universal age to 50 and added PCV21. https://cdc.gov/mmwr/volumes/74/wr/mm7401a1.htm
  - Suggested: CDC/ACIP (Oct 2024; MMWR Jan 2025): one dose of PCV20 or PCV21 (or PCV15 followed by PPSV23) for all adults ≥50 without prior PCV, and for ages 19-49 with risk conditions or immunocompromise. Prevents invasive pneumococcal disease.
- **pu197** `pearls[1]` (medium severity, high confidence)
  - Card says: PCV15 → PPSV23 sequence for broader serotype coverage
  - Source says: Same as tp. https://cdc.gov/mmwr/volumes/74/wr/mm7401a1.htm
  - Suggested: PCV15 must be followed by PPSV23; PCV20 or PCV21 alone completes the series
- **pu197** `pearls[2]` (medium severity, high confidence)
  - Card says: All adults ≥65 and high-risk younger adults should receive
  - Source says: Same as tp. https://cdc.gov/mmwr/volumes/74/wr/mm7401a1.htm
  - Suggested: All adults ≥50 and high-risk adults 19-49 should receive

### Infectious Disease

- **id096** `tp` (low severity, low confidence)
  - Card says: E. coli most common cause. WBC casts localize to kidney. Treat: fluoroquinolone or TMP-SMX for 7-14 days outpatient; IV ceftriaxone if inpatient.
  - Source says: Same as ne025. https://www.idsociety.org/practice-guideline/complicated-urinary-tract-infections/
  - Suggested: E. coli most common cause. WBC casts localize to kidney. Outpatient: culture-directed therapy (fluoroquinolone 7 days or TMP-SMX 14 days if susceptible; otherwise a ceftriaxone dose then an oral beta-lactam); IV ceftriaxone if inpatient.
- **id147** `tp` (medium severity, high confidence)
  - Card says: Latent TB: positive PPD/IGRA, negative CXR, asymptomatic. Treat to prevent reactivation. INH × 9 months (+ B6) OR rifampin × 4 months. Do NOT treat with RIPE.
  - Source says: Same as pu048. https://www.cdc.gov/mmwr/volumes/69/rr/rr6901a1.htm
  - Suggested: Latent TB: positive PPD/IGRA, negative CXR, asymptomatic. Treat to prevent reactivation. Preferred: 3HP, 4R or 3HR (CDC/NTCA 2020); alternatives: INH 6-9 months (+ B6). Do NOT treat with RIPE.
- **id147** `pearls[0]` (medium severity, high confidence)
  - Card says: INH × 9 months is standard; always add pyridoxine (B6)
  - Source says: Same as pu048. https://www.cdc.gov/mmwr/volumes/69/rr/rr6901a1.htm
  - Suggested: Short-course rifamycin regimens (3HP, 4R, 3HR) are preferred; if INH is used (6-9 months), add pyridoxine (B6)
- **id184** `tp` (medium severity, high confidence)
  - Card says: PCV15 or PCV20 for all adults ≥65 (updated 2023). If PCV15 given, follow with PPSV23. Also for immunocompromised, asplenic, CSF leak, cochlear implant at any age.
  - Source says: Same as pu197. https://cdc.gov/mmwr/volumes/74/wr/mm7401a1.htm
  - Suggested: PCV20 or PCV21 (or PCV15 followed by PPSV23) for all adults ≥50 (ACIP Oct 2024; MMWR Jan 2025). Also for immunocompromised, asplenic, CSF leak, cochlear implant at any age.
- **id184** `pearls[1]` (medium severity, high confidence)
  - Card says: All adults ≥65 and high-risk younger adults
  - Source says: Same as pu197. https://cdc.gov/mmwr/volumes/74/wr/mm7401a1.htm
  - Suggested: All adults ≥50 and high-risk adults 19-49
- **id032** `tp` (low severity, high confidence)
  - Card says: GBS: leading cause of neonatal sepsis/meningitis. Screen mothers at 35-37 weeks. Intrapartum penicillin prophylaxis.
  - Source says: ACOG/CDC changed the window to 36 0/7-37 6/7 weeks in 2019-2020; pearl[0] and ob060 already say 36-37. https://www.acog.org/clinical/clinical-guidance/committee-opinion/articles/2020/02/prevention-of-group-b-streptococcal-early-onset-disease-in-newborns
  - Suggested: GBS: leading cause of neonatal sepsis/meningitis. Screen mothers at 36 0/7-37 6/7 weeks. Intrapartum penicillin prophylaxis.
- **id045** `tp` (medium severity, high confidence)
  - Card says: Neisseria gonorrhoeae. Often co-infects with Chlamydia. Treat both: ceftriaxone IM + doxycycline (or azithromycin). NAAT gold standard.
  - Source says: CDC 2021 recommends doxycycline, not azithromycin, for co-treatment of chlamydia. https://www.cdc.gov/std/treatment-guidelines/gonorrhea-adults.htm
  - Suggested: Neisseria gonorrhoeae. Often co-infects with Chlamydia. Ceftriaxone 500 mg IM once (1 g if ≥150 kg); add doxycycline 100 mg BID for 7 days if chlamydia is not excluded (CDC 2021). NAAT gold standard.
- **id045** `pearls[0]` (low severity, high confidence)
  - Card says: Always treat for Chlamydia simultaneously
  - Source says: Same as tp. https://www.cdc.gov/std/treatment-guidelines/gonorrhea-adults.htm
  - Suggested: Treat for chlamydia too unless chlamydial infection has been excluded
- **id045** `pearls[2]` (low severity, high confidence)
  - Card says: Ceftriaxone 500mg IM single dose (updated 2020 CDC guidelines)
  - Source says: Citation update. https://www.cdc.gov/std/treatment-guidelines/gonorrhea-adults.htm
  - Suggested: Ceftriaxone 500 mg IM single dose (CDC 2021 STI treatment guidelines)
- **id061** `tp` (medium severity, high confidence)
  - Card says: MAC: most common opportunistic mycobacterial infection in AIDS. Prophylaxis with azithromycin when CD4 <50. Treat with clarithromycin + ethambutol.
  - Source says: NIH OI guidelines no longer recommend primary MAC prophylaxis for patients starting ART immediately. https://clinicalinfo.hiv.gov/en/guidelines/hiv-clinical-guidelines-adult-and-adolescent-opportunistic-infections/disseminated-mycobacterium-avium
  - Suggested: MAC: most common opportunistic mycobacterial infection in AIDS. Primary prophylaxis (azithromycin, CD4 <50) is not recommended if ART is started immediately. Treat with clarithromycin + ethambutol.
- **id061** `pearls[0]` (medium severity, high confidence)
  - Card says: Prophylaxis with azithromycin when CD4 <50
  - Source says: Same as tp. https://clinicalinfo.hiv.gov/en/guidelines/hiv-clinical-guidelines-adult-and-adolescent-opportunistic-infections/disseminated-mycobacterium-avium
  - Suggested: Primary prophylaxis (azithromycin) only if ART cannot be started immediately and CD4 <50
- **id080** `tp` (medium severity, high confidence)
  - Card says: Vancomycin: binds D-Ala-D-Ala → inhibits cell wall synthesis. Red man syndrome is histamine release (not allergy) — slow infusion rate. Monitor trough levels.
  - Source says: 2020 ASHP/IDSA/PIDS/SIDP guideline replaced trough-only monitoring with AUC/MIC (400-600) dosing for serious MRSA infections. https://doi.org/10.1093/ajhp/zxaa036
  - Suggested: Vancomycin: binds D-Ala-D-Ala → inhibits cell wall synthesis. Red man syndrome is histamine release (not allergy) — slow infusion rate. Monitor AUC (preferred) or trough levels.
- **id080** `pearls[1]` (medium severity, high confidence)
  - Card says: Monitor trough levels (target 15-20 for serious infections)
  - Source says: Same as tp. https://doi.org/10.1093/ajhp/zxaa036
  - Suggested: AUC/MIC-guided dosing (AUC 400-600 mg·h/L) is preferred over trough-only monitoring (15-20) for serious MRSA infections (2020 consensus)
- **id108** `tp` (low severity, high confidence)
  - Card says: First recurrence: fidaxomicin preferred or vancomycin taper/pulse. Second recurrence: fecal microbiota transplant (FMT). Bezlotoxumab for prevention of recurrence.
  - Source says: Drug is off the market. https://www.ashp.org/Drug-Shortages/Current-Shortages/Drug-Shortage-Detail.aspx?id=1130
  - Suggested: First recurrence: fidaxomicin preferred or vancomycin taper/pulse. Second recurrence: fecal microbiota transplant (FMT). Bezlotoxumab was discontinued by Merck in January 2025 and is no longer available.
- **id108** `pearls[2]` (low severity, high confidence)
  - Card says: Bezlotoxumab (anti-toxin B monoclonal antibody) prevents recurrence
  - Source says: Same as tp. https://www.ashp.org/Drug-Shortages/Current-Shortages/Drug-Shortage-Detail.aspx?id=1130
  - Suggested: Bezlotoxumab (anti-toxin B antibody) reduced recurrence but was discontinued by the manufacturer in January 2025
- **id097** `pearls[0]` (low severity, medium confidence)
  - Card says: S. aureus is #1 in ALL populations (even sickle cell)
  - Source says: Contradicts he088/rh161/pe197; evidence in SCD is mixed but the board answer is Salmonella. Internal contradiction with he088, rh161, pe197 in this deck; conventional board teaching: Salmonella in sickle cell osteomyelitis (no URL)
  - Suggested: S. aureus is #1 overall; in sickle cell disease Salmonella is the classic board-tested pathogen (S. aureus remains common)
- **id122** `pearls[0]` (low severity, medium confidence)
  - Card says: Osteomyelitis in SCD: Salmonella is #2 (S. aureus still #1)
  - Source says: Same as id097. Internal contradiction with he088, rh161, pe197 in this deck; conventional board teaching: Salmonella in sickle cell osteomyelitis (no URL)
  - Suggested: Osteomyelitis in SCD: Salmonella is the classic board-tested pathogen (S. aureus remains common)
- **id063** `tp` (low severity, medium confidence)
  - Card says: qSOFA: altered mental status, RR ≥22, SBP ≤100. Hour-1 bundle: cultures, lactate, broad-spectrum antibiotics, 30mL/kg crystalloid, vasopressors if refractory.
  - Source says: SSC 2021 softened these items. https://www.sccm.org/survivingsepsiscampaign/guidelines-and-resources/surviving-sepsis-campaign-adult-guidelines
  - Suggested: qSOFA: altered mental status, RR ≥22, SBP ≤100. Hour-1 bundle: cultures, lactate, broad-spectrum antibiotics, 30 mL/kg crystalloid for hypoperfusion (weak recommendation in SSC 2021), vasopressors if refractory. SSC 2021 recommends against qSOFA as a single screening tool.
- **id173** `pearls[0]` (low severity, low confidence)
  - Card says: Most common HAI in the US
  - Source says: Rank has changed in prevalence surveys. https://doi.org/10.1056/NEJMoa1801550
  - Suggested: Among the most common HAIs (CDC prevalence surveys list pneumonia and surgical-site infection first)
- **id210** `pearls[0]` (low severity, low confidence)
  - Card says: Rheumatic fever: ONLY from pharyngitis (never skin)
  - Source says: "Never skin" is too absolute. Debated in the literature: Australian ARF guideline 2020 (RHDAustralia) vs AHA 2015 Jones criteria statement (no URL)
  - Suggested: Rheumatic fever classically follows GAS pharyngitis; skin infection as a trigger is debated (Australian data)

### Endocrinology

- **en030** `pearls[0]` (low severity, medium confidence)
  - Card says: Most common cause of secondary hypertension
  - Source says: Same as ne040. https://www.endocrine.org/clinical-practice-guidelines/primary-aldosteronism-2
  - Suggested: Most common endocrine cause of secondary hypertension (2025 Endocrine Society guideline suggests screening all adults with hypertension)
- **en164** `pearls[0]` (low severity, low confidence)
  - Card says: Spironolactone must be stopped 6 weeks before testing
  - Source says: Testing-condition advice was relaxed in 2025; confirm exact wording before adopting. https://www.endocrine.org/clinical-practice-guidelines/primary-aldosteronism-2
  - Suggested: Older protocol: stop spironolactone about 4-6 weeks before testing; the 2025 Endocrine Society guideline suggests screening can often proceed on most antihypertensives (verify against the guideline)
- **en014** `tp` (low severity, medium confidence)
  - Card says: Type 2 DM. Osmolarity >320. Higher mortality than DKA. IV fluids first priority, then insulin.
  - Source says: 2024 consensus changed the HHS threshold. https://doi.org/10.2337/dci24-0032
  - Suggested: Type 2 DM. Effective osmolality ≥300 mOsm/kg (2024 ADA/EASD consensus; older teaching >320). Higher mortality than DKA. IV fluids first priority, then insulin.
- **en014** `pearls[2]` (low severity, medium confidence)
  - Card says: Serum osmolarity >320 mOsm/kg is diagnostic
  - Source says: Same as tp. https://doi.org/10.2337/dci24-0032
  - Suggested: Effective serum osmolality ≥300 mOsm/kg (older teaching >320) with glucose ≥600 mg/dL and minimal ketosis
- **en033** `pearls[1]` (low severity, medium confidence)
  - Card says: Metformin is first-line unless contraindicated
  - Source says: ADA moved to comorbidity-driven therapy. https://diabetesjournals.org/care/issue/48/Supplement_1
  - Suggested: Metformin remains a common first agent, but ADA 2025 recommends a GLP-1 RA or SGLT2i with proven benefit for ASCVD, HF or CKD independent of A1c and metformin use
- **en099** `tp` (low severity, medium confidence)
  - Card says: Metformin first-line. If CVD: add GLP-1 RA or SGLT2i. If CKD: SGLT2i. If HF: SGLT2i. If HbA1c still above target: add another agent.
  - Source says: Same as en033. https://diabetesjournals.org/care/issue/48/Supplement_1
  - Suggested: ADA 2025: for ASCVD, HF or CKD start a GLP-1 RA and/or SGLT2i with proven benefit regardless of A1c or metformin use; otherwise metformin is a common first agent; favor GLP-1 RA or tirzepatide when weight loss is a priority.
- **en102** `pearls[2]` (low severity, low confidence)
  - Card says: Diabetes is a coronary artery disease equivalent
  - Source says: CAD-equivalent concept was retired. https://www.ahajournals.org/doi/10.1161/CIR.0000000000001168
  - Suggested: Older teaching; current guidelines treat diabetes as a risk enhancer and stratify by age and risk factors rather than as a CAD equivalent
- **en127** `tp` (low severity, medium confidence)
  - Card says: Recombinant PTH(1-34). Intermittent dosing stimulates osteoblast activity (anabolic). Continuous PTH = catabolic. Limited to 2 years (osteosarcoma risk in rats).
  - Source says: Label change. https://pi.lilly.com/us/forteo-pi.pdf
  - Suggested: Recombinant PTH(1-34). Intermittent dosing stimulates osteoblast activity (anabolic). Continuous PTH = catabolic. Typically limited to about 2 years (the FDA removed the osteosarcoma boxed warning in 2020).
- **en149** `tp` (medium severity, medium confidence)
  - Card says: Increase levothyroxine by ~30% upon pregnancy confirmation. Monitor TSH every 4 weeks in first half, then at least once per trimester. Goal TSH <4 mIU/L.
  - Source says: ATA 2017 targets <2.5 when no local range exists. https://doi.org/10.1089/thy.2016.0457
  - Suggested: Increase levothyroxine by ~30% upon pregnancy confirmation. Monitor TSH every 4 weeks in first half, then at least once per trimester. Goal TSH in the lower half of the trimester-specific reference range (or <2.5 mIU/L if unavailable) (ATA 2017).
- **en183** `pearls[1]` (medium severity, high confidence)
  - Card says: Metformin and insulin are only FDA-approved for pediatric T2DM
  - Source says: Statement is outdated since 2019-2024 approvals. https://diabetesjournals.org/care/issue/48/Supplement_1
  - Suggested: Metformin, insulin, GLP-1 RAs (liraglutide, exenatide ER, dulaglutide) and SGLT2 inhibitors (empagliflozin, dapagliflozin) are now FDA-approved for pediatric T2DM (age ≥10)
- **en189** `tp` (medium severity, high confidence)
  - Card says: Indications: BMI ≥40 or ≥35 with comorbidities (T2DM, OSA, HTN). Roux-en-Y: most weight loss but more complications. Sleeve: simpler, fewer deficiencies.
  - Source says: The 2022 guideline removed the comorbidity requirement. https://doi.org/10.1016/j.soard.2022.08.013
  - Suggested: ASMBS/IFSO 2022: BMI ≥35 regardless of comorbidity; consider at BMI 30-34.9 with metabolic disease. Roux-en-Y: most weight loss but more complications. Sleeve: simpler, fewer deficiencies.
- **en057** `pearls[0]` (medium severity, medium confidence)
  - Card says: Always rule out pheochromocytoma first (metanephrines)
  - Source says: 2023 ESE/ENSAT guideline individualizes testing. https://eje.bioscientifica.com/view/journals/eje/189/1/EJE-23-0430.xml
  - Suggested: Biochemical pheochromocytoma testing is needed unless unenhanced CT attenuation is ≤10 HU (ESE/ENSAT 2023); all need a 1-mg dexamethasone suppression test for autonomous cortisol

### Hematology/Oncology

- **he106** `pearls[0]` (medium severity, high confidence)
  - Card says: Andexanet alfa reverses Xa inhibitors
  - Source says: Same as c176. https://www.tctmd.com/news/andexanet-alfa-pulled-us-market
  - Suggested: 4-factor PCC is used for life-threatening Xa-inhibitor bleeding (andexanet alfa was withdrawn from the US market in December 2025)
- **he107** `tp` (medium severity, high confidence)
  - Card says: Vaccinate at least 2 weeks before elective splenectomy: pneumococcal (PCV13 + PPSV23), meningococcal (MenACWY + MenB), Hib. Daily penicillin prophylaxis in children.
  - Source says: PCV13 was replaced by PCV15/20/21. https://cdc.gov/mmwr/volumes/74/wr/mm7401a1.htm
  - Suggested: Vaccinate at least 2 weeks before elective splenectomy: pneumococcal (PCV20 or PCV21 alone, or PCV15 + PPSV23; PCV13 is no longer used), meningococcal (MenACWY + MenB), Hib. Daily penicillin prophylaxis in children.
- **he193** `tp` (high severity, high confidence)
  - Card says: Hydroxyurea: increases HbF, reduces crises. Voxelotor: polymerization inhibitor, increases Hb. Crizanlizumab: anti-P-selectin, reduces vaso-occlusive events. L-glutamine: reduces oxidative stress.
  - Source says: Two listed drugs are withdrawn or unproven. https://www.pfizer.com/news/press-release/press-release-detail/pfizer-voluntarily-withdraws-all-lots-sickle-cell-disease
  - Suggested: Hydroxyurea: increases HbF, reduces crises. Voxelotor was withdrawn worldwide in September 2024 for safety (excess vaso-occlusive crises and deaths). Crizanlizumab (anti-P-selectin): phase 3 STAND did not show fewer crises and EU authorization was revoked. L-glutamine: reduces oxidative stress.
- **he193** `pearls[1]` (medium severity, medium confidence)
  - Card says: Crizanlizumab (anti-P-selectin) is newer addition for VOC prevention
  - Source says: Same as tp. https://www.pfizer.com/news/press-release/press-release-detail/pfizer-voluntarily-withdraws-all-lots-sickle-cell-disease
  - Suggested: Crizanlizumab's benefit was not confirmed in phase 3 (STAND)
- **he210** `tp` (low severity, medium confidence)
  - Card says: MDS/MPN overlap syndrome. Persistent peripheral monocytosis >1 × 10⁹/L for >3 months. Dysplastic features. Can transform to AML. Treat with hypomethylating agents or allogeneic BMT.
  - Source says: Diagnostic threshold lowered in 2022. https://doi.org/10.1038/s41375-022-01613-1
  - Suggested: MDS/MPN overlap syndrome. Persistent absolute monocytosis ≥0.5 × 10⁹/L with monocytes ≥10% of WBC (WHO 5th ed./ICC 2022; WHO 2016 used ≥1 × 10⁹/L). Dysplastic features. Can transform to AML. Treat with hypomethylating agents or allogeneic BMT.
- **he243** `tp` (low severity, medium confidence)
  - Card says: Ferrous sulfate 325mg (65mg elemental iron) TID on empty stomach. Vitamin C enhances absorption. GI side effects (nausea, constipation) are most common reason for non-compliance. Reticulocyte count should rise within 1 week.
  - Source says: Hepcidin physiology favors single daily or alternate-day dosing. https://doi.org/10.1016/S2352-3026(17)30182-5
  - Suggested: Ferrous sulfate 325mg (65mg elemental iron) once daily or on alternate days (better fractional absorption and tolerance than TID). Vitamin C enhances absorption. GI side effects (nausea, constipation) are most common reason for non-compliance. Reticulocyte count should rise within 1 week.
- **he174** `tp` (low severity, medium confidence)
  - Card says: Protamine is a positively charged protein that binds negatively charged heparin. 1mg protamine per 100 units heparin. Partially reverses LMWH (anti-IIa but not anti-Xa activity).
  - Source says: Current wording is internally confusing/inaccurate. https://products.sanofi.us/lovenox/lovenox.pdf
  - Suggested: Protamine is a positively charged protein that binds negatively charged heparin. 1mg protamine per 100 units heparin. Fully reverses unfractionated heparin; only partially reverses LMWH (neutralizes anti-IIa but only about 60% of anti-Xa activity).
- **he164** `tp` (low severity, low confidence)
  - Card says: Monoclonal antibody against EGFR. Only effective in KRAS wild-type tumors (mutant KRAS signals downstream of EGFR regardless of blockade). Acneiform rash is common.
  - Source says: Testing expanded to RAS. https://doi.org/10.1200/JCO.22.02864
  - Suggested: Monoclonal antibody against EGFR. Only effective in RAS (KRAS and NRAS) wild-type, BRAF V600E wild-type, typically left-sided tumors (mutant KRAS signals downstream of EGFR regardless of blockade). Acneiform rash is common.
- **he181** `tp` (low severity, medium confidence)
  - Card says: Colon: colonoscopy q10yr starting at 45. Lung: annual LDCT for 50-80yo with ≥20 pack-year history. Breast: mammography starting at 40 (USPSTF 2024). Cervix: Pap q3yr 21-29, cotesting q5yr 30-65.
  - Source says: Primary HPV testing is now preferred by ACS (2020) and the 2024 USPSTF draft. https://www.cancer.org/cancer/types/cervical-cancer/detection-diagnosis-staging/cervical-cancer-screening-guidelines.html
  - Suggested: Colon: colonoscopy q10yr starting at 45. Lung: annual LDCT for 50-80yo with ≥20 pack-year history. Breast: mammography starting at 40 (USPSTF 2024). Cervix: cytology q3yr age 21-29; age 30-65 primary HPV testing q5yr (ACS 2020; USPSTF 2024 draft preferred), cotesting q5yr, or cytology q3yr.

### Rheumatology

- **rh003** `tp` (medium severity, high confidence)
  - Card says: Type III hypersensitivity. ANA sensitive (>95%), anti-dsDNA and anti-Smith specific. 11 ACR criteria, need 4+.
  - Source says: Classification criteria were replaced in 2019. https://doi.org/10.1136/annrheumdis-2018-214819
  - Suggested: Type III hypersensitivity. ANA sensitive (>95%), anti-dsDNA and anti-Smith specific. 2019 EULAR/ACR classification: ANA ≥1:80 entry criterion plus weighted domains totaling ≥10 points (older: 11 ACR criteria with ≥4; SLICC 2012).
- **rh001** `pearls[1]` (high severity, high confidence)
  - Card says: Never start allopurinol during acute flare
  - Source says: Contradicts ACR 2020; appears in five cards (rh001, rh033, rh034, rh096, rh102). https://doi.org/10.1002/art.41247
  - Suggested: ACR 2020: urate-lowering therapy can be started during a flare (with anti-inflammatory prophylaxis); do not stop it if already taking
- **rh033** `tp` (medium severity, high confidence)
  - Card says: Colchicine inhibits microtubule polymerization → decreased neutrophil migration. First-line if NSAIDs contraindicated. GI side effects (diarrhea).
  - Source says: ACR 2020 does not rank colchicine behind NSAIDs. https://doi.org/10.1002/art.41247
  - Suggested: Colchicine inhibits microtubule polymerization → decreased neutrophil migration. Colchicine, NSAIDs or glucocorticoids are all first-line for a flare (ACR 2020). GI side effects (diarrhea).
- **rh033** `pearls[2]` (high severity, high confidence)
  - Card says: Never start allopurinol during acute attack
  - Source says: Same as rh001. https://doi.org/10.1002/art.41247
  - Suggested: ACR 2020: ULT may be started during a flare with prophylaxis
- **rh034** `tp` (high severity, high confidence)
  - Card says: First-line chronic gout. Lower uric acid target <6 mg/dL. Do NOT start during acute attack. Rash → SJS risk (check HLA-B*5801).
  - Source says: Same as rh001. https://doi.org/10.1002/art.41247
  - Suggested: First-line chronic gout. Lower uric acid target <6 mg/dL. Can be started during an acute flare with anti-inflammatory prophylaxis (ACR 2020); start low (≤100 mg/day) and titrate. Rash → SJS risk (check HLA-B*5801).
- **rh034** `pearls[2]` (high severity, high confidence)
  - Card says: Do NOT start during acute attack — can worsen flare
  - Source says: Same as rh001. https://doi.org/10.1002/art.41247
  - Suggested: ACR 2020: starting ULT during a flare does not need to be delayed (use prophylaxis)
- **rh096** `tp` (high severity, high confidence)
  - Card says: NSAIDs (indomethacin, naproxen) or colchicine for acute gout. Steroids if both contraindicated. Never start urate-lowering therapy during acute attack.
  - Source says: Same as rh001. https://doi.org/10.1002/art.41247
  - Suggested: NSAIDs (indomethacin, naproxen) or colchicine for acute gout. Steroids if both contraindicated. ACR 2020: all three (NSAID, colchicine, glucocorticoid) are first-line, and ULT can be started during a flare with prophylaxis.
- **rh096** `pearls[0]` (high severity, high confidence)
  - Card says: Never start allopurinol during acute flare
  - Source says: Same as rh001. https://doi.org/10.1002/art.41247
  - Suggested: ACR 2020: ULT can be started during a flare; if already on allopurinol, do not stop
- **rh102** `tp` (high severity, high confidence)
  - Card says: Xanthine oxidase inhibitor → decreases uric acid production. Start after acute flare resolves. Target uric acid <6 mg/dL.
  - Source says: Same as rh001. https://doi.org/10.1002/art.41247
  - Suggested: Xanthine oxidase inhibitor → decreases uric acid production. Can be started during a flare with prophylaxis (ACR 2020). Target uric acid <6 mg/dL.
- **rh133** `pearls[1]` (low severity, medium confidence)
  - Card says: Stop methotrexate 3 months before conception
  - Source says: Interval differs between ACR 2020 and older sources. https://doi.org/10.1002/art.41191
  - Suggested: ACR 2020 reproductive guideline: stop methotrexate at least 1 month before conception (older EULAR advice: 3 months)
- **rh175** `pearls[2]` (low severity, medium confidence)
  - Card says: Nintedanib approved for RA-associated ILD
  - Source says: No RA-ILD-specific indication exists. https://doi.org/10.1056/NEJMoa1908681
  - Suggested: Nintedanib is FDA-approved for chronic fibrosing ILDs with a progressive phenotype (including RA-ILD) and for SSc-ILD
- **rh005** `pearls[1]` (low severity, medium confidence)
  - Card says: First-line treatment: exercise + weight loss + acetaminophen
  - Source says: Acetaminophen demoted in OA guidance. https://doi.org/10.1002/art.41142
  - Suggested: ACR 2019: exercise and weight loss first; topical (knee) and oral NSAIDs preferred drugs; acetaminophen only conditionally recommended
- **rh142** `tp` (low severity, medium confidence)
  - Card says: Recombinant PTH analog (PTH 1-34). Anabolic — stimulates osteoblasts. Limited to 2 years due to osteosarcoma risk in animal studies.
  - Source says: Same as en127. https://pi.lilly.com/us/forteo-pi.pdf
  - Suggested: Recombinant PTH analog (PTH 1-34). Anabolic — stimulates osteoblasts. Typically limited to about 2 years; the FDA removed the osteosarcoma boxed warning in 2020.

### Obstetrics/Gynecology

- **ob033** `tp` (low severity, medium confidence)
  - Card says: Pap screening: 21-29 (Pap alone q3yr), 30-65 (Pap + HPV co-testing q5yr). ASCUS + HPV → colposcopy. CIN 2/3 → LEEP or cold knife cone.
  - Source says: Same as he181. https://www.cancer.org/cancer/types/cervical-cancer/detection-diagnosis-staging/cervical-cancer-screening-guidelines.html
  - Suggested: Screening: cytology q3yr age 21-29; age 30-65 primary HPV q5yr (ACS 2020; USPSTF 2024 draft), cotesting q5yr, or cytology q3yr. ASCUS + HPV → colposcopy. CIN 2/3 → LEEP or cold knife cone.
- **ob021** `tp` (medium severity, high confidence)
  - Card says: No cervical change for ≥6 hours with adequate contractions (Montevideo units ≥200). Cesarean delivery if truly arrested.
  - Source says: The 2014 consensus shortened the arrest definition to 4 hours. https://www.acog.org/clinical/clinical-guidance/obstetric-care-consensus/articles/2014/03/safe-prevention-of-the-primary-cesarean-delivery
  - Suggested: Active-phase arrest (≥6 cm with ruptured membranes): no cervical change for ≥4 hours with adequate contractions (>200 MVU) or ≥6 hours with inadequate contractions despite oxytocin (ACOG/SMFM 2014). Cesarean delivery if truly arrested.
- **ob021** `pearls[0]` (medium severity, high confidence)
  - Card says: ≥6 hours with adequate contractions and no change = arrest
  - Source says: Same as tp. https://www.acog.org/clinical/clinical-guidance/obstetric-care-consensus/articles/2014/03/safe-prevention-of-the-primary-cesarean-delivery
  - Suggested: ≥4 hours of adequate contractions (or ≥6 hours of inadequate contractions with oxytocin) at ≥6 cm = arrest
- **ob006** `tp` (low severity, medium confidence)
  - Card says: β-hCG above discriminatory zone (~2000) without IUP. Ampulla most common site. Methotrexate if stable and unruptured.
  - Source says: Higher threshold avoids interrupting viable IUPs. https://www.acog.org/clinical/clinical-guidance/practice-bulletin/articles/2018/03/tubal-ectopic-pregnancy
  - Suggested: β-hCG above the discriminatory zone (traditionally 1,500-2,000; ACOG 2018 notes up to 3,500 mIU/mL) without IUP. Ampulla most common site. Methotrexate if stable and unruptured.
- **ob023** `pearls[2]` (low severity, medium confidence)
  - Card says: Planned cesarean at 35-37 weeks if diagnosed prenatally
  - Source says: ACOG/SMFM window is 34-37 weeks. https://www.acog.org/clinical/clinical-guidance/committee-opinion/articles/2021/02/medically-indicated-late-preterm-and-early-term-deliveries
  - Suggested: Planned cesarean at 34 0/7-37 0/7 weeks if diagnosed prenatally (ACOG)
- **ob024** `tp` (medium severity, medium confidence)
  - Card says: Pruritus (especially palms/soles) with elevated serum bile acids. Risk of fetal demise. Ursodeoxycholic acid treatment. Deliver at 36-37 weeks.
  - Source says: SMFM stratified delivery timing by bile acids. https://www.smfm.org/publications/
  - Suggested: Pruritus (especially palms/soles) with elevated serum bile acids. Risk of fetal demise. Ursodeoxycholic acid treatment. Timing of delivery depends on bile acid level (SMFM 2021): ≥100 µmol/L at 36 weeks; 40-99 at 36-39 weeks; <40 at 39 weeks.
- **ob024** `pearls[2]` (medium severity, medium confidence)
  - Card says: Deliver at 36-37 weeks due to risk of sudden fetal demise
  - Source says: Same as tp. https://www.smfm.org/publications/
  - Suggested: Delivery timing is stratified by bile acids (≥100 µmol/L: 36 weeks; 40-99: 36-39 weeks; <40: 39 weeks)
- **ob078** `tp` (low severity, medium confidence)
  - Card says: Local progestin effect. Mirena 7 years, Liletta 8 years. Also treats menorrhagia, endometrial hyperplasia. Can cause amenorrhea (beneficial side effect).
  - Source says: Mirena extended from 7 to 8 years in 2022. https://www.bayer.com/media/en-us/mirena-from-bayer-approved-in-the-us-for-extended-duration-of-use-in-contraception/
  - Suggested: Local progestin effect. Mirena 8 years (FDA 2022), Liletta 8 years. Also treats menorrhagia, endometrial hyperplasia. Can cause amenorrhea (beneficial side effect).
- **ob050** `tp` (low severity, medium confidence)
  - Card says: IUDs: copper (non-hormonal, 10yr) and levonorgestrel (hormonal, 3-7yr depending on type). Implant (etonogestrel, 3yr). >99% effective.
  - Source says: Same as ob078. https://www.bayer.com/media/en-us/mirena-from-bayer-approved-in-the-us-for-extended-duration-of-use-in-contraception/
  - Suggested: IUDs: copper (non-hormonal, 10yr) and levonorgestrel (hormonal, 3-8yr depending on type). Implant (etonogestrel, 3yr). >99% effective.
- **ob071** `pearls[1]` (low severity, medium confidence)
  - Card says: Planned cesarean hysterectomy at 34-36 weeks
  - Source says: ACOG OCC 7 window. https://www.acog.org/clinical/clinical-guidance/obstetric-care-consensus/articles/2018/12/placenta-accreta-spectrum
  - Suggested: Planned cesarean hysterectomy at 34 0/7-35 6/7 weeks (ACOG)
- **ob072** `tp` (low severity, medium confidence)
  - Card says: Do NOT attempt manual removal (catastrophic hemorrhage). Planned cesarean hysterectomy at 34-36 weeks with placenta left untouched. Requires blood products, urology, IR available.
  - Source says: Same as ob071. https://www.acog.org/clinical/clinical-guidance/obstetric-care-consensus/articles/2018/12/placenta-accreta-spectrum
  - Suggested: Do NOT attempt manual removal (catastrophic hemorrhage). Planned cesarean hysterectomy at 34 0/7-35 6/7 weeks with placenta left untouched. Requires blood products, urology, IR available.
- **ob072** `pearls[2]` (low severity, medium confidence)
  - Card says: Planned delivery at 34-36 weeks
  - Source says: Same as ob071. https://www.acog.org/clinical/clinical-guidance/obstetric-care-consensus/articles/2018/12/placenta-accreta-spectrum
  - Suggested: Planned delivery at 34 0/7-35 6/7 weeks
- **ob036** `tp` (low severity, medium confidence)
  - Card says: Ectopic endometrial tissue. Laparoscopy is gold standard diagnosis. Medical: OCPs, GnRH agonists, progestins. Surgical: excision/ablation.
  - Source says: Guidelines moved away from mandatory surgical diagnosis. https://www.eshre.eu/guideline/endometriosis
  - Suggested: Ectopic endometrial tissue. Diagnosis can be clinical plus imaging (TVUS/MRI); laparoscopy is no longer required before empiric treatment (ESHRE 2022; ACOG 2021). Medical: OCPs, GnRH agonists, progestins. Surgical: excision/ablation.
- **ob036** `pearls[0]` (low severity, medium confidence)
  - Card says: Laparoscopy is gold standard for diagnosis
  - Source says: Same as tp. https://www.eshre.eu/guideline/endometriosis
  - Suggested: Laparoscopy with histology is the definitive test, but clinical/imaging diagnosis with empiric therapy is now standard
- **ob126** `tp` (low severity, medium confidence)
  - Card says: Ovarian failure before age 40. Elevated FSH (>40) on two occasions 4 weeks apart. Causes: autoimmune, Turner mosaicism, fragile X premutation, iatrogenic (chemo/radiation).
  - Source says: ESHRE lowered the diagnostic threshold. https://www.eshre.eu/guideline/pof
  - Suggested: Ovarian failure before age 40. FSH >25 IU/L on two occasions >4 weeks apart (ESHRE; older criterion >40). Causes: autoimmune, Turner mosaicism, fragile X premutation, iatrogenic (chemo/radiation).
- **ob126** `pearls[0]` (low severity, medium confidence)
  - Card says: FSH >40 mIU/mL on two occasions confirms diagnosis
  - Source says: Same as tp. https://www.eshre.eu/guideline/pof
  - Suggested: FSH >25 IU/L on two occasions >4 weeks apart confirms diagnosis (ESHRE; older teaching >40)
- **ob171** `tp` (medium severity, medium confidence)
  - Card says: ART (combination antiretroviral therapy) throughout pregnancy. Viral load at 36 weeks: <1000 → vaginal delivery OK. ≥1000 → scheduled cesarean at 38 weeks. IV zidovudine intrapartum if viral load detectable.
  - Source says: DHHS thresholds. https://clinicalinfo.hiv.gov/en/guidelines/perinatal
  - Suggested: ART (combination antiretroviral therapy) throughout pregnancy. Viral load at 36 weeks: <1000 → vaginal delivery OK. ≥1000 → scheduled cesarean at 38 weeks. IV zidovudine intrapartum if viral load >1,000 copies/mL or unknown (consider at 50-999); not required if ≤50 and adherent.
- **ob142** `tp` (low severity, medium confidence)
  - Card says: Most accurate dating: first trimester US (crown-rump length, ±5 days). Second trimester: ±2 weeks. Third trimester: ±3 weeks. If US and LMP differ by >7 days in first trimester, use US dates.
  - Source says: Threshold depends on gestational age. https://www.acog.org/clinical/clinical-guidance/committee-opinion/articles/2017/05/methods-for-estimating-the-due-date
  - Suggested: Most accurate dating: first trimester US (crown-rump length, ±5 days). Second trimester: ±2 weeks. Third trimester: ±3 weeks. ACOG 2017: redate by CRL when discrepancy is >5 days at <9 0/7 weeks or >7 days at 9 0/7-13 6/7 weeks.
- **ob200** `pearls[2]` (low severity, low confidence)
  - Card says: Hysteroscopic resection is minimally invasive and improves outcomes
  - Source says: Benefit of septum resection is debated. https://www.eshre.eu/guideline/RPL
  - Suggested: Hysteroscopic resection is minimally invasive, but randomized evidence that it improves live birth is limited and conflicting (ESHRE suggests considering after counseling)

### Pediatrics

- **pe100** `pearls[1]` (low severity, low confidence)
  - Card says: Intermittent: SABA PRN only; persistent: add ICS
  - Source says: Pediatric nuance; adult-adolescent algorithm changed. https://www.nhlbi.nih.gov/health-topics/all-publications-and-resources/2020-focused-updates-asthma-management-guidelines
  - Suggested: Ages 6-11: intermittent = SABA PRN (or ICS with each SABA use); persistent = daily low-dose ICS. Age ≥12: as-needed ICS-formoterol (GINA/NAEPP 2020)
- **pe013** `tp` (medium severity, medium confidence)
  - Card says: RSV most common cause. Supportive care (suctioning, O2). Palivizumab prophylaxis for high-risk infants (premature, CHD, BPD).
  - Source says: Same as pu058. https://www.cdc.gov/rsv/hcp/vaccine-clinical-guidance/infants-young-children.html
  - Suggested: RSV most common cause. Supportive care (suctioning, O2). Prevention: nirsevimab or clesrovimab for infants <8 months in their first RSV season (or maternal RSV vaccine); palivizumab only for select high-risk infants.
- **pe013** `pearls[1]` (medium severity, medium confidence)
  - Card says: Palivizumab for high-risk infants (premature <29wk, CHD, BPD)
  - Source says: Same as pu058. https://www.cdc.gov/rsv/hcp/vaccine-clinical-guidance/infants-young-children.html
  - Suggested: Nirsevimab/clesrovimab now cover most infants; palivizumab only for select high-risk infants
- **pe082** `pearls[2]` (medium severity, high confidence)
  - Card says: Use hour-specific bilirubin nomogram to decide on phototherapy
  - Source says: AAP 2022 revised thresholds. https://doi.org/10.1542/peds.2022-058859
  - Suggested: Use the 2022 AAP phototherapy thresholds (age in hours, gestational age, neurotoxicity risk factors), which replaced the 2004 Bhutani-based curves
- **pe074** `pearls[2]` (low severity, medium confidence)
  - Card says: EDTA chelation for levels ≥45; dimercaprol + EDTA for levels ≥70
  - Source says: Oral succimer is used for 45-69; the CDC blood lead reference value is now 3.5 µg/dL. https://www.cdc.gov/lead-prevention/hcp/clinical-guidance/index.html
  - Suggested: Chelation at BLL ≥45 µg/dL (oral succimer); dimercaprol + CaNa2EDTA for ≥70 µg/dL or encephalopathy
- **pe057** `pearls[2]` (low severity, low confidence)
  - Card says: Most common preventable cause of intellectual disability
  - Source says: Contradicts p146/ob135/pe174 ("most common preventable" = FASD). https://www.aap.org/en/patient-care/immunizations/shared-clinical-decision-making-for-immunizations/
  - Suggested: A leading preventable cause of intellectual disability (alongside fetal alcohol spectrum disorder)
- **pe059** `pearls[0]` (medium severity, low confidence)
  - Card says: HepB is the only vaccine given at birth
  - Source says: Federal and AAP schedules diverged in 2025-2026; verify which source the target exam follows. https://www.aap.org/en/patient-care/immunizations/shared-clinical-decision-making-for-immunizations/
  - Suggested: HepB is the only routine birth vaccine (AAP recommends it for all medically stable newborns; the federal CDC schedule revised in Dec 2025-Jan 2026 moved it to individual decision-making for infants of HBsAg-negative mothers)
- **pe095** `pearls[0]` (low severity, low confidence)
  - Card says: Screen for Wilms tumor with abdominal US every 3 months until age 8
  - Source says: AACR BWS screening ends at age 7 (verify). https://pubmed.ncbi.nlm.nih.gov/?term=Kalish+Clin+Cancer+Res+2017+Beckwith-Wiedemann+Wilms+screening
  - Suggested: Screen for Wilms tumor with abdominal US every 3 months until the 7th birthday (AACR 2017)
- **pe032** `tp` (low severity, medium confidence)
  - Card says: Most common at birth in premature boys. If not descended by 6 months → orchiopexy by 12 months. Increased risk of testicular cancer and infertility.
  - Source says: AUA window. https://www.auanet.org/guidelines-and-quality/guidelines/cryptorchidism-guideline
  - Suggested: Most common at birth in premature boys. If not descended by 6 months → orchiopexy between 6 and 18 months of corrected age (AUA 2014). Increased risk of testicular cancer and infertility.

### Surgery

- **su031** `pearls[1]` (low severity, medium confidence)
  - Card says: Colonoscopy 6-8 weeks after resolution to rule out cancer
  - Source says: Guideline shift (AGA 2021, ASCRS 2020). https://doi.org/10.1053/j.gastro.2020.09.059
  - Suggested: Colonoscopy after complicated diverticulitis (or if none is recent); routine colonoscopy after a first uncomplicated episode is no longer required
- **su109** `tp` (medium severity, high confidence)
  - Card says: Indications: BMI ≥40, or BMI ≥35 with obesity-related comorbidity (DM2, HTN, OSA). Roux-en-Y gastric bypass or sleeve gastrectomy most common.
  - Source says: Same as en189. https://doi.org/10.1016/j.soard.2022.08.013
  - Suggested: ASMBS/IFSO 2022: BMI ≥35 regardless of comorbidity; consider at BMI 30-34.9 with metabolic disease. Roux-en-Y gastric bypass or sleeve gastrectomy most common.
- **su109** `pearls[0]` (medium severity, high confidence)
  - Card says: BMI ≥40 or ≥35 with comorbidity = eligible for bariatric surgery
  - Source says: Same as en189. https://doi.org/10.1016/j.soard.2022.08.013
  - Suggested: BMI ≥35 (any comorbidity status) = eligible; consider 30-34.9 with metabolic disease (ASMBS/IFSO 2022)
- **su086** `pearls[1]` (medium severity, medium confidence)
  - Card says: Rule out pheo in ALL cases (even if normotensive)
  - Source says: Same as en057. https://eje.bioscientifica.com/view/journals/eje/189/1/EJE-23-0430.xml
  - Suggested: Screen for pheochromocytoma (metanephrines) if unenhanced CT is >10 HU; lipid-rich adenomas ≤10 HU can skip it (ESE/ENSAT 2023)
- **su187** `tp` (low severity, medium confidence)
  - Card says: If not descended by 6 months, unlikely to descend spontaneously. Orchiopexy by 12 months to preserve fertility and reduce (but not eliminate) cancer risk.
  - Source says: Same as pe032. https://www.auanet.org/guidelines-and-quality/guidelines/cryptorchidism-guideline
  - Suggested: If not descended by 6 months, unlikely to descend spontaneously. Orchiopexy between 6 and 18 months of corrected age (AUA 2014) to preserve fertility and reduce (but not eliminate) cancer risk.
- **su091** `tp` (high severity, high confidence)
  - Card says: SLNB recommended for melanoma >1mm Breslow depth or with ulceration. Positive SLNB = complete lymph node dissection.
  - Source says: MSLT-II showed no melanoma-specific survival benefit from routine completion dissection. https://doi.org/10.1056/NEJMoa1613210
  - Suggested: SLNB recommended for melanoma >1mm Breslow depth or with ulceration. A positive SLNB no longer mandates completion lymph node dissection (MSLT-II); nodal ultrasound surveillance is standard.
- **su055** `tp` (medium severity, medium confidence)
  - Card says: Gustilo classification (I-III). Emergent: tetanus, IV antibiotics, irrigation, surgical debridement within 6 hours. Cover wound with sterile saline dressing.
  - Source says: The 6-hour rule is not supported. https://www.boa.ac.uk/resource/boast-4-pdf.html
  - Suggested: Gustilo classification (I-III). Emergent: tetanus, IV antibiotics, irrigation, debridement timed per BOAST-4 (immediate for gross contamination or vascular injury, within 12 hours for high-energy fractures, within 24 hours for others) with antibiotics as early as possible (ideally within 1 hour). Cover wound with sterile saline dressing.
- **su057** `tp` (low severity, medium confidence)
  - Card says: CTA to identify aneurysm. Nimodipine for vasospasm prevention (days 4-10). Surgical clipping or endovascular coiling.
  - Source says: Card contradicts n167 and itself (days 4-10 vs 4-14). https://www.ahajournals.org/doi/10.1161/STR.0000000000000436
  - Suggested: CTA to identify aneurysm. Nimodipine (60 mg q4h for 21 days) improves outcome after SAH; it does not prevent angiographic vasospasm (vasospasm peaks days 4-14). Surgical clipping or endovascular coiling.
- **su057** `pearls[0]` (low severity, medium confidence)
  - Card says: Nimodipine prevents vasospasm (days 4-14 post-SAH)
  - Source says: Same as tp. https://www.ahajournals.org/doi/10.1161/STR.0000000000000436
  - Suggested: Nimodipine improves neurologic outcome after SAH (it does not prevent vasospasm); vasospasm peaks days 4-14
- **su040** `tp` (low severity, medium confidence)
  - Card says: Cold nodule with suspicious FNA → total thyroidectomy. Papillary most common thyroid cancer. Excellent prognosis.
  - Source says: ATA 2015 de-escalated surgery for low-risk tumors. https://doi.org/10.1089/thy.2015.0020
  - Suggested: Cold nodule with suspicious FNA → thyroidectomy: lobectomy is acceptable for low-risk papillary cancer ≤4 cm (ATA 2015); total thyroidectomy for >4 cm, extrathyroidal extension, nodal or distant disease. Papillary most common thyroid cancer. Excellent prognosis.

### Emergency Medicine

- **em024** `pearls[1]` (high severity, high confidence)
  - Card says: STEMI equivalents: new LBBB + chest pain, posterior MI, de Winter T waves
  - Source says: Same as c012. https://www.ahajournals.org/doi/10.1161/CIR.0000000000001309
  - Suggested: STEMI equivalents: posterior MI, de Winter T waves, Sgarbossa-positive LBBB or paced rhythm (new LBBB alone no longer qualifies)
- **em076** `tp` (medium severity, high confidence)
  - Card says: Emergent reversal: warfarin → IV vitamin K + 4-factor PCC (or FFP). DOAC → idarucizumab (dabigatran) or andexanet alfa (Xa inhibitors).
  - Source says: Same as c176. https://www.tctmd.com/news/andexanet-alfa-pulled-us-market
  - Suggested: Emergent reversal: warfarin → IV vitamin K + 4-factor PCC (or FFP). DOAC → idarucizumab (dabigatran) or 4-factor PCC for Xa inhibitors (andexanet alfa was withdrawn from the US market in December 2025).
- **em076** `pearls[2]` (medium severity, high confidence)
  - Card says: Andexanet alfa reverses factor Xa inhibitors (rivaroxaban, apixaban)
  - Source says: Same as c176. https://www.tctmd.com/news/andexanet-alfa-pulled-us-market
  - Suggested: Andexanet alfa (no longer marketed in the US since December 2025) reverses factor Xa inhibitors; 4F-PCC is the US alternative
- **em046** `pearls[1]` (low severity, medium confidence)
  - Card says: <5mm stones: 90% pass spontaneously. >10mm: almost always need intervention
  - Source says: Same as ne095. https://www.ncbi.nlm.nih.gov/pmc/articles/PMC5635101/
  - Suggested: <5mm stones: roughly two-thirds or more pass spontaneously (about half for 5-10 mm). >10mm: almost always need intervention
- **em048** `pearls[0]` (low severity, medium confidence)
  - Card says: β-hCG >2000 without IUP on TVUS = ectopic until proven otherwise
  - Source says: Same as ob006. https://www.acog.org/clinical/clinical-guidance/practice-bulletin/articles/2018/03/tubal-ectopic-pregnancy
  - Suggested: β-hCG above the discriminatory level (about 1,500-3,500) without IUP on TVUS = ectopic until proven otherwise; no threshold should delay TVUS
- **em044** `tp` (low severity, low confidence)
  - Card says: Airway first (intubate if inhalation suspected). Parkland formula: 4mL × kg × %TBSA. Half in first 8 hours from time of burn.
  - Source says: Teaching vs current practice; low priority. https://ameriburn.org/education/abls/
  - Suggested: Airway first (intubate if inhalation suspected). Parkland formula: 4mL × kg × %TBSA (classic exam answer; current ABLS starts at 2 mL/kg/%TBSA and titrates to urine output). Half in first 8 hours from time of burn.
- **em011** `tp` (medium severity, medium confidence)
  - Card says: Narrow therapeutic index. Hypokalemia increases toxicity. Treat with Digibind (Fab fragments). Avoid calcium (worsens toxicity).
  - Source says: Retrospective data (Levine 2011) show no excess arrhythmia/mortality; still a popular board point, so verify target exam. https://litfl.com/calcium-digoxin-toxicity-and-stone-heart-theory/
  - Suggested: Narrow therapeutic index. Hypokalemia increases toxicity. Treat with Digibind (Fab fragments). IV calcium is no longer considered contraindicated for hyperkalemia in digoxin toxicity (the "stone heart" concern is not supported by data).
- **em011** `pearls[2]` (medium severity, medium confidence)
  - Card says: AVOID IV calcium in digoxin toxicity (stone heart)
  - Source says: Same as tp. https://litfl.com/calcium-digoxin-toxicity-and-stone-heart-theory/
  - Suggested: "Stone heart" is not supported: retrospective data show no excess arrhythmia or mortality with IV calcium; digoxin Fab is definitive treatment
- **em095** `tp` (medium severity, high confidence)
  - Card says: Rochester/Philadelphia/Step-by-Step criteria identify low-risk infants. Low-risk: blood, urine, ± LP based on protocol. May observe without antibiotics if truly low-risk. High-risk: full workup + empiric antibiotics.
  - Source says: AAP 2021 replaced the older criteria. https://doi.org/10.1542/peds.2021-052228
  - Suggested: AAP 2021 (8-60 days) and the PECARN rule risk-stratify well-appearing febrile infants using urinalysis, ANC, CRP and procalcitonin (PCT >0.5 ng/mL, CRP >20 mg/L, ANC >4,000 guide LP and antibiotics); Rochester/Philadelphia/Step-by-Step are older criteria. Low-risk: blood, urine, ± LP based on protocol. May observe without antibiotics if truly low-risk. High-risk: full workup + empiric antibiotics.
- **em095** `pearls[0]` (medium severity, high confidence)
  - Card says: 29-90 days: risk-stratify. <28 days: ALL get full workup + antibiotics
  - Source says: Same as tp. https://doi.org/10.1542/peds.2021-052228
  - Suggested: AAP 2021: 8-21 days = full workup incl. LP + antibiotics + admission; 22-28 days = inflammatory markers guide LP/antibiotics; 29-60 days = risk-stratify with markers
- **em055** `tp` (low severity, low confidence)
  - Card says: Clean wounds: primary closure within 6-8h (12-24h for face). Irrigate copiously. Assess tetanus status. Tdap if >5 years for dirty wounds.
  - Source says: Modern wound-closure evidence; low priority. General wound-closure evidence (Quinn et al., Ann Emerg Med 2014; no URL)
  - Suggested: No strict golden period: well-irrigated clean wounds can often be closed primarily well beyond 6-8 h (face up to 24 h), depending on contamination and location. Irrigate copiously. Assess tetanus status. Tdap if >5 years for dirty wounds.

### Multisystem / Mixed

- **mu234** `tp` (high severity, high confidence)
  - Card says: Colorectal: 45 for all. Breast: mammography 40-50 (shared decision), biennial 50-74. Cervical: Pap at 21, co-testing 30-65. Lung: LDCT 50-80 with 20+ pack-year history.
  - Source says: Card labeled 2024-2025 but states the superseded 2016 USPSTF breast recommendation; contradicts ob148 and he181. https://www.uspreventiveservicestaskforce.org/uspstf/recommendation/breast-cancer-screening
  - Suggested: Colorectal: 45 for all. Breast: USPSTF 2024 biennial mammography ages 40-74 (ACS: annual 45-54, option to start at 40). Cervical: cytology from 21; HPV-based testing for 30-65. Lung: LDCT 50-80 with 20+ pack-year history.
- **mu085** `pearls[1]` (low severity, high confidence)
  - Card says: HAD 2 Gs: H2, Alpha(nope—wrong), D1 — Beta-1/2 are the classic Gs
  - Source says: Pearl contains broken text ("Alpha(nope—wrong)") and no usable mnemonic. https://doi.org/10.1080/00031305.2016.1154108
  - Suggested: Gs-coupled receptors include β1, β2, D1, H2 and V2 (also glucagon, TSH, ACTH and PTH receptors)
- **mu087** `tp` (low severity, medium confidence)
  - Card says: p < 0.05 = <5% probability the result is due to chance alone. Does NOT mean clinically significant. Type I error (alpha) = rejecting true null.
  - Source says: Common but incorrect p-value interpretation. https://doi.org/10.1080/00031305.2016.1154108
  - Suggested: p < 0.05: if the null hypothesis were true, a result at least this extreme would occur <5% of the time (it is not the probability that chance explains the result). Does NOT mean clinically significant. Type I error (alpha) = rejecting true null.
