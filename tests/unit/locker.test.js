import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';

// The Locker separates characters that can be customized from those that cannot.

function loadPage() {
  const html = readFileSync('index.html', 'utf8');
  const body = html.slice(html.indexOf('<body'), html.indexOf('</body>'));
  document.body.innerHTML = body.replace(/<script[\s\S]*?<\/script>/g, '');
}

const headings = () => [...document.querySelectorAll('#shopItems h3')].map((h) => h.textContent);
const clickTab = (label) => [...document.querySelectorAll('#shopItems [role="tab"]')].find((b) => b.textContent.includes(label)).click();

describe('Locker tabs', () => {
  let ui;
  let storage;
  beforeEach(async () => {
    localStorage.clear();
    loadPage();
    ({ ui } = await import('../../js/ui.js'));
    ({ storage } = await import('../../js/storage.js'));
    ui._lockerTab = 'characters';
  });

  it('lists characters and vehicles, and keeps the archived classic ones out of sight', () => {
    ui.renderShop();
    expect(headings()).toEqual([
      expect.stringContaining('Characters'),
      expect.stringContaining('Vehicles')
    ]);
    const text = document.getElementById('shopItems').textContent;
    expect(text).not.toMatch(/classic|blocky|3D/i);
    expect(text).toMatch(/cannot wear hats/i);
    const groups = [...document.querySelectorAll('#shopItems h3')].map((h) => h.parentElement.textContent);
    expect(groups[0]).toContain('Intern');
    ['Nurse', 'Surgeon', 'Skeleton', 'Zombie Resident', 'Robot Medic'].forEach((n) => expect(text).not.toContain(n));
  });

  it('the old monsters are archived too', () => {
    ui.renderShop();
    clickTab('Trails');
    const text = document.getElementById('shopItems').textContent;
    ['Pager Wraith', 'Textbook Golem', 'Caffeine Kraken'].forEach((n) => expect(text).not.toContain(n));
    expect(text).not.toMatch(/Exam Monster(?!s)/);
    expect(text).toContain('Ghost of Boards Past');
  });

  it('a character gets color pickers for its own parts, but no headwear', () => {
    storage.data.progression.equipped.skin = 'avatar_intern'; // Dr. Dash
    ui._lockerTab = 'customize';
    ui.renderShop();
    expect(document.getElementById('shopItems').textContent).toMatch(/Dr\. Dash colors/);
    const parts = [...document.querySelectorAll('#shopItems .color-part')].map((p) => p.getAttribute('data-part'));
    expect(parts).toEqual(['top', 'pants', 'skin', 'hair']);
    expect(document.querySelectorAll('#shopItems .scrub-swatch').length).toBeGreaterThan(8);
    expect(headings().join('|')).not.toContain('Headwear');
    expect(headings().join('|')).not.toContain('Clothing');
  });

  it('another character has nothing to customize, and the screen says why', () => {
    storage.data.progression.equipped.skin = 'avatar_m_skeleton'; // animated 3D, no scrubs
    ui._lockerTab = 'customize';
    ui.renderShop();
    expect(headings().join('|')).not.toContain('Headwear');
    expect(headings().join('|')).not.toContain('Clothing');
    expect(headings().join('|')).not.toContain('Gear');
    const text = document.getElementById('shopItems').textContent;
    expect(text).toMatch(/This character keeps its own look/);
    expect(text).not.toMatch(/classic|3D/i);
    expect(document.querySelector('#shopItems').textContent).not.toMatch(/Hair\s*Skin\s*Coat/);
  });

  it('a classic character gets colors, clothing, headwear and gear', () => {
    storage.data.progression.equipped.skin = 'avatar_classic';
    ui._lockerTab = 'customize';
    ui.renderShop();
    const h = headings().join('|');
    ['Colors', 'Clothing', 'Headwear', 'Gear'].forEach((name) => expect(h).toContain(name));
  });

  it('vehicles cannot be customized', () => {
    storage.data.progression.equipped.skin = 'avatar_ambulance';
    ui._lockerTab = 'customize';
    ui.renderShop();
    expect(headings().join('|')).not.toContain('Headwear');
    expect(document.getElementById('shopItems').textContent).toMatch(/Vehicles cannot wear anything/);
  });

  it('trails and monsters have their own tab', () => {
    ui.renderShop();
    clickTab('Trails');
    expect(headings().join('|')).toContain('Trails');
    expect(headings().join('|')).toContain('Exam Monsters');
    expect(headings().join('|')).not.toContain('Avatars');
  });
});
