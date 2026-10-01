import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';

describe('a new run starts with a blank question area', () => {
  let ui;
  beforeEach(async () => {
    localStorage.clear();
    const html = readFileSync('index.html', 'utf8');
    document.body.innerHTML = html.slice(html.indexOf('<body'), html.indexOf('</body>')).replace(/<script[\s\S]*?<\/script>/g, '');
    ({ ui } = await import('../../js/ui.js'));
    (await import('../../js/storage.js')).storage.load();
  });

  it('clears the previous question, answers, feedback and teaching point when a run starts', () => {
    ui.showBuzzwords({ id: 'x', bw: ['old', 'question'] });
    ui.showAnswerChoices([{ label: 'A' }, { label: 'B' }, { label: 'C' }]);
    ui.showFeedback({ ans: 'Old answer', tp: 'Old tip' }, false);
    ui.resetQuestionDisplay();
    expect(document.getElementById('buzzText').textContent).toBe('GET READY');
    for (let i = 0; i < 3; i++) expect(document.getElementById('ansText' + i).textContent).toBe('');
    expect(document.getElementById('feedbackEl').textContent).toBe('');
    expect(document.getElementById('teachEl').classList.contains('show')).toBe(false);
  });
});
