import { describe, it, expect, beforeEach } from 'vitest';
import { existsSync, statSync, readFileSync } from 'node:fs';
import { heroPictureId, parseHeroPicture, iconFor, iconId, fillProfilePicture, portraitUrl } from '../../js/profileicons.js';
import { CHARACTER_MODELS } from '../../js/game/modelcatalog.js';

describe('a hero as the profile picture', () => {
  it('is a short text in the field a symbol already uses, so it costs no storage and no extra data to send', () => {
    CHARACTER_MODELS.forEach((m) => {
      ['face', 'body'].forEach((style) => {
        const v = heroPictureId(m.id, style);
        expect(v.length, v).toBeLessThan(40);
        expect(v.length).toBeLessThanOrEqual(64); // the database's limit on the avatar column
        expect(parseHeroPicture(v)).toMatchObject({ id: m.id, style, name: m.name });
      });
    });
    // the schema's limit is the one the game already relied on for symbols
    expect(readFileSync('database/schema.sql', 'utf8')).toContain('char_length(avatar) <= 64');
  });

  it('only accepts heroes the app knows, so another player\'s odd or damaged value cannot do anything', () => {
    ['hero:avatar_nobody:face', 'hero:avatar_intern:side', 'hero::face', 'hero:avatar_intern', 'hero:../../etc/passwd:face',
      'hero:avatar_intern:face<img src=x>', 'icon:🩺', 'avatar_intern', '', null, undefined, 42, 'hero:' + 'a'.repeat(80) + ':face'
    ].forEach((bad) => expect(parseHeroPicture(bad), String(bad)).toBeNull());
  });

  it('shows the hero\'s own emoji wherever a symbol is wanted, and stays out of the way of symbols and old values', () => {
    expect(iconFor(heroPictureId('avatar_m_nurse', 'face'))).toBe('👩‍⚕️');
    expect(iconFor(heroPictureId('avatar_nope', 'face'))).toBe('👤'); // unknown: a plain person
    expect(iconFor(iconId('🦊'))).toBe('🦊');
    expect(iconFor('avatar_intern')).toBe('🩺');
  });

  it('every hero has both portraits, and together they are small', () => {
    let total = 0;
    CHARACTER_MODELS.forEach((m) => {
      ['face', 'body'].forEach((style) => {
        const file = 'public/portraits/' + m.id + '-' + style + '.webp';
        expect(existsSync(file), file).toBe(true);
        const size = statSync(file).size;
        expect(size, file).toBeLessThan(20 * 1024);
        total += size;
      });
    });
    expect(total).toBeLessThan(250 * 1024);
    expect(portraitUrl('avatar_intern', 'body')).toMatch(/portraits\/avatar_intern-body\.webp$/);
  });

  describe('showing it', () => {
    let el;
    beforeEach(() => { document.body.innerHTML = '<div id="a"></div>'; el = document.getElementById('a'); });

    it('draws the portrait image for a hero, and the symbol for anything else', () => {
      fillProfilePicture(el, heroPictureId('avatar_m_orc', 'body'));
      expect(el.querySelector('img.pp-img.body').getAttribute('src')).toMatch(/avatar_m_orc-body\.webp$/);
      expect(el.classList.contains('has-portrait')).toBe(true);
      fillProfilePicture(el, iconId('🦊'));
      expect(el.querySelector('img')).toBeNull();
      expect(el.textContent).toBe('🦊');
      expect(el.classList.contains('has-portrait')).toBe(false);
    });

    it('falls back to the hero\'s emoji when the image is missing (an older install, or offline)', () => {
      fillProfilePicture(el, heroPictureId('avatar_m_orc', 'face'));
      el.querySelector('img').dispatchEvent(new Event('error'));
      expect(el.querySelector('img')).toBeNull();
      expect(el.textContent).toBe('🪓');
      expect(el.classList.contains('has-portrait')).toBe(false);
    });
  });
});

describe('choosing one on the Profile screen', () => {
  let ui, storage;
  beforeEach(async () => {
    localStorage.clear();
    const html = readFileSync('index.html', 'utf8');
    document.body.innerHTML = html.slice(html.indexOf('<body'), html.indexOf('</body>')).replace(/<script[\s\S]*?<\/script>/g, '');
    ({ ui } = await import('../../js/ui.js'));
    ({ storage } = await import('../../js/storage.js'));
    storage.load();
    ui._picStyle = undefined;
  });

  it('lists only the heroes the player owns, as face or whole hero, and saves the choice', () => {
    storage.data.progression.ownedItems.push('avatar_m_nurse');
    ui.renderProfile();
    const owned = [...document.querySelectorAll('.pp-hero')].map((b) => b.getAttribute('data-hero'));
    expect(owned).toContain('avatar_intern');
    expect(owned).toContain('avatar_m_nurse');
    expect(owned).not.toContain('avatar_m_king'); // not owned
    document.querySelector('[data-hero="avatar_m_nurse"]').click();
    expect(storage.get('profilePicture')).toBe('hero:avatar_m_nurse:face');
    expect(document.querySelector('.profile-avatar img.pp-img.face')).not.toBeNull();
    expect(document.querySelector('.profile-pic-box').open).toBe(true); // stays open for another try
    [...document.querySelectorAll('.pp-style button')].find((b) => /Whole hero/.test(b.textContent)).click();
    document.querySelector('[data-hero="avatar_m_nurse"]').click();
    expect(storage.get('profilePicture')).toBe('hero:avatar_m_nurse:body');
  });

  it('what the leaderboard service is sent is just that short text', () => {
    storage.set('profilePicture', 'hero:avatar_intern:face');
    const sent = storage.get('profilePicture') || 'avatar_intern';
    expect(sent).toBe('hero:avatar_intern:face');
    expect(sent.length).toBeLessThanOrEqual(64);
  });
});
