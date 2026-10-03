import { describe, it, expect, afterEach, vi } from 'vitest';
import { copyText, shareText, saveFile, setPlatformPluginsForTest } from '../../js/platform.js';

afterEach(() => { setPlatformPluginsForTest(null); vi.restoreAllMocks(); delete navigator.share; });

describe('platform: inside the phone app (no navigator.share, no blob downloads)', () => {
  it('shareText uses the native share sheet', async () => {
    const Share = { share: vi.fn().mockResolvedValue({}) };
    setPlatformPluginsForTest({ Share });
    expect(await shareText({ title: 'T', text: 'hello', url: 'https://x.test/' })).toBe('shared');
    expect(Share.share).toHaveBeenCalledWith(expect.objectContaining({ text: 'hello', url: 'https://x.test/' }));
  });
  it('a cancelled share sheet is not an error', async () => {
    setPlatformPluginsForTest({ Share: { share: vi.fn().mockRejectedValue(new Error('Share canceled')) } });
    expect(await shareText({ text: 'x' })).toBe('shared');
  });
  it('saveFile writes the file and opens the share sheet instead of a blob download', async () => {
    const Share = { share: vi.fn().mockResolvedValue({}) };
    const Filesystem = { writeFile: vi.fn().mockResolvedValue({ uri: 'file:///cache/backup.json' }) };
    setPlatformPluginsForTest({ Share, Filesystem });
    URL.createObjectURL = vi.fn();
    const spy = URL.createObjectURL;
    const how = await saveFile(new Blob(['{"a":1}'], { type: 'application/json' }), 'backup.json');
    expect(how).toBe('shared');
    expect(spy).not.toHaveBeenCalled();
    const arg = Filesystem.writeFile.mock.calls[0][0];
    expect(arg.path).toBe('backup.json');
    expect(atob(arg.data)).toBe('{"a":1}');
    expect(Share.share).toHaveBeenCalledWith(expect.objectContaining({ files: ['file:///cache/backup.json'] }));
  });
});

describe('platform: in a browser', () => {
  it('shareText falls back to copying when there is no share sheet', async () => {
    const writeText = vi.fn().mockResolvedValue();
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    expect(await shareText({ text: 'score', url: 'https://x.test/' })).toBe('copied');
    expect(writeText).toHaveBeenCalledWith('score https://x.test/');
  });
  it('shareText reports failure only when nothing at all works', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
    document.execCommand = () => false;
    expect(await shareText({ text: 'x' })).toBe('failed');
  });
  it('copyText falls back to a hidden textarea when the clipboard API is missing', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
    document.execCommand = vi.fn(() => true);
    expect(await copyText('abc')).toBe(true);
    expect(document.querySelector('textarea')).toBeNull();
  });
  it('saveFile downloads through a temporary link', async () => {
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
    const clicks = [];
    const orig = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () { clicks.push(this.download); };
    expect(await saveFile(new Blob(['x']), 'f.json')).toBe('downloaded');
    expect(clicks).toEqual(['f.json']);
    HTMLAnchorElement.prototype.click = orig;
  });
});
