/**
 * cardmeta.js — the small, always-needed card constants.
 *
 * Kept separate from the 2.6 MB card database (cards.js) so the app can show
 * its screens immediately and load the questions in the background.
 */

export const SUBJECTS = Object.freeze([
  'Neurology',
  'Cardiology',
  'Nephrology',
  'Psychiatry',
  'Gastroenterology',
  'Pulmonology',
  'Infectious Disease',
  'Endocrinology',
  'Hematology/Oncology',
  'Rheumatology',
  'Obstetrics/Gynecology',
  'Pediatrics',
  'Surgery',
  'Emergency Medicine',
  'Multisystem / Mixed'
]);

export const EXAM_FILTERS = Object.freeze([
  'step1', 'step2', 'step3', 'comlex1', 'comlex2',
  'shelf_im', 'shelf_surg', 'shelf_peds', 'shelf_obgyn',
  'shelf_psych', 'shelf_neuro', 'shelf_fm'
]);

export const QUESTION_TYPES = Object.freeze([
  'buzzword_dx', 'dx_to_tx', 'dx_to_workup', 'mechanism',
  'side_effect', 'lab_dx', 'pharm', 'prevention', 'management'
]);

export const SOURCE_DISCIPLINES = Object.freeze([
  'pathology', 'pharmacology', 'physiology', 'biochemistry',
  'microbiology', 'anatomy', 'embryology', 'behavioral',
  'biostatistics', 'clinical_medicine', 'surgery_principles',
  'genetics', 'immunology', 'ethics'
]);

// Content version: bump when card content changes materially
export const CONTENT_VERSION = '2.0.0';
