import { describe, it, expect } from 'vitest';
import { CARDS } from '../../js/cards.js';
import { NEUROLOGY_CARDS } from '../../js/cards/neurology.js';
import { CARDIOLOGY_CARDS } from '../../js/cards/cardiology.js';
import { NEPHROLOGY_CARDS } from '../../js/cards/nephrology.js';
import { PSYCHIATRY_CARDS } from '../../js/cards/psychiatry.js';
import { GASTRO_CARDS } from '../../js/cards/gastroenterology.js';
import { PULM_CARDS } from '../../js/cards/pulmonology.js';
import { ID_CARDS } from '../../js/cards/infectious.js';
import { ENDO_CARDS } from '../../js/cards/endocrinology.js';
import { HEMEONC_CARDS } from '../../js/cards/hemeonc.js';
import { RHEUM_CARDS } from '../../js/cards/rheumatology.js';
import { OBGYN_CARDS } from '../../js/cards/obgyn.js';
import { PEDS_CARDS } from '../../js/cards/pediatrics.js';
import { SURGERY_CARDS } from '../../js/cards/surgery.js';
import { EM_CARDS } from '../../js/cards/emergency.js';
import { MULTI_CARDS } from '../../js/cards/multisystem.js';

const SOURCES = [NEUROLOGY_CARDS, CARDIOLOGY_CARDS, NEPHROLOGY_CARDS, PSYCHIATRY_CARDS, GASTRO_CARDS, PULM_CARDS, ID_CARDS, ENDO_CARDS, HEMEONC_CARDS, RHEUM_CARDS, OBGYN_CARDS, PEDS_CARDS, SURGERY_CARDS, EM_CARDS, MULTI_CARDS];

describe('no card is silently dropped', () => {
  it('every card in the source files loads (about 3000 of them)', () => {
    const raw = SOURCES.flat();
    const loaded = new Set(CARDS.map((c) => c.id));
    const missing = raw.filter((c) => !loaded.has(c.id)).map((c) => c.id);
    expect(missing).toEqual([]);
    expect(CARDS.length).toBe(raw.length);
    expect(CARDS.length).toBeGreaterThanOrEqual(3000);
  });
  it('ids are unique', () => {
    const ids = SOURCES.flat().map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
