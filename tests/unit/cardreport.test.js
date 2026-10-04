import { describe, it, expect, beforeEach, vi } from 'vitest';
import { openCardReport, REPORT_REASONS } from '../../js/cardreport.js';
import { storage } from '../../js/storage.js';

const card = { id: 'x1', bw: ['clue one', 'clue two'], ans: 'Answer', d: ['Wrong A', 'Wrong B'], subj: 'S', tp: 'tp' };

describe('reporting a card', () => {
  beforeEach(() => { localStorage.clear(); storage.data = null; storage.load(); document.body.innerHTML = ''; });

  it('shows the card, needs a reason, and saves the report with the reason and the note', () => {
    const toast = vi.fn();
    const d = openCardReport(card, toast);
    expect(d.textContent).toMatch(/clue one • clue two/);
    expect(d.textContent).toMatch(/Wrong A · Wrong B/);
    const send = [...d.querySelectorAll('button')].find((b) => /Send report/.test(b.textContent));
    expect(send.disabled).toBe(true);
    // "a clue gives away the answer" is one of the reasons
    expect(REPORT_REASONS.map((r) => r[0])).toContain('clue gives away the answer');
    [...d.querySelectorAll('.report-reason')].find((b) => /gives away/.test(b.textContent)).click();
    expect(send.disabled).toBe(false);
    d.querySelector('.report-note').value = 'The title is in the first clue';
    send.click();
    const reports = storage.getCardReports();
    expect(reports.length).toBe(1);
    expect(reports[0]).toMatchObject({ cardId: 'x1', reason: 'clue gives away the answer', text: 'The title is in the first clue' });
    expect(document.getElementById('cardReportDialog')).toBeNull();
    expect(toast).toHaveBeenCalled();
  });

  it('Cancel and Escape close it without saving', () => {
    let d = openCardReport(card);
    [...d.querySelectorAll('button')].find((b) => /Cancel/.test(b.textContent)).click();
    expect(storage.getCardReports().length).toBe(0);
    d = openCardReport(card);
    d.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(document.getElementById('cardReportDialog')).toBeNull();
    expect(storage.getCardReports().length).toBe(0);
  });
});
