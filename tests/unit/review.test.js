import { describe, it, expect, afterEach, vi } from 'vitest';
import { storeLinks, shareableStoreLink, rateTheApp, openStorePage, setReviewPluginForTest, canRate } from '../../js/review.js';
import { sendFeedback, supportEmail, feedbackBody } from '../../js/feedback.js';
import { setPlatformPluginsForTest } from '../../js/platform.js';

afterEach(() => {
  setReviewPluginForTest(null);
  setPlatformPluginsForTest(null);
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

const noClipboard = () => {
  Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
  document.execCommand = () => false;
};

describe('where a rating can be sent, on each store', () => {
  it('Android: the Play Store app first, then its web page', () => {
    expect(storeLinks({ platform: 'android', appId: 'com.x.y', reviewUrl: '' })).toEqual([
      'market://details?id=com.x.y', 'https://play.google.com/store/apps/details?id=com.x.y'
    ]);
  });
  it('iPhone: the App Store review page, once the app has an App Store id', () => {
    expect(storeLinks({ platform: 'ios', iosAppId: '123456789', reviewUrl: '' })).toEqual([
      'itms-apps://apps.apple.com/app/id123456789?action=write-review', 'https://apps.apple.com/app/id123456789?action=write-review'
    ]);
    expect(storeLinks({ platform: 'ios', iosAppId: '', reviewUrl: '' })).toEqual([]); // no id yet: only the in-app box can work
  });
  it('a configured link is a last back-up on every platform; a plain website with none offers nothing', () => {
    expect(storeLinks({ platform: 'web', reviewUrl: 'https://example.com/rate' })).toEqual(['https://example.com/rate']);
    expect(storeLinks({ platform: 'web', reviewUrl: '' })).toEqual([]);
    expect(storeLinks({ platform: 'web', reviewUrl: 'http://insecure.example' })).toEqual([]);
    expect(canRate({ platform: 'web', reviewUrl: '' })).toBe(false);
  });
  it('the link that gets copied is always one a browser can open', () => {
    expect(shareableStoreLink({ platform: 'android', appId: 'a.b', reviewUrl: '' })).toBe('https://play.google.com/store/apps/details?id=a.b');
    expect(shareableStoreLink({ platform: 'ios', iosAppId: '', reviewUrl: '' })).toBe('');
  });
});

describe('rating, with a back-up for every step', () => {
  const opts = { platform: 'android', appId: 'a.b', reviewUrl: '' };

  it('uses the store\'s own rating box when it can', async () => {
    const InAppReview = { requestReview: vi.fn().mockResolvedValue() };
    const AppLauncher = { openUrl: vi.fn() };
    setReviewPluginForTest(InAppReview);
    setPlatformPluginsForTest({ AppLauncher });
    expect(await rateTheApp(opts)).toEqual({ how: 'in-app' });
    expect(AppLauncher.openUrl).not.toHaveBeenCalled();
  });

  it('falls back to the Play Store app, then its web page, when the rating box is not available', async () => {
    setReviewPluginForTest({ requestReview: vi.fn().mockRejectedValue(new Error('quota')) });
    const AppLauncher = { openUrl: vi.fn().mockResolvedValueOnce({ completed: false }).mockResolvedValueOnce({ completed: true }) };
    setPlatformPluginsForTest({ AppLauncher });
    expect(await rateTheApp(opts)).toEqual({ how: 'opened' });
    expect(AppLauncher.openUrl.mock.calls.map((c) => c[0].url)).toEqual(['market://details?id=a.b', 'https://play.google.com/store/apps/details?id=a.b']);
  });

  it('copies the web link when nothing opens, and says so when even that fails', async () => {
    setReviewPluginForTest(null);
    setPlatformPluginsForTest({ AppLauncher: { openUrl: vi.fn().mockRejectedValue(new Error('no app')) } });
    const writeText = vi.fn().mockResolvedValue();
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    expect(await openStorePage(opts)).toBe('copied');
    expect(writeText).toHaveBeenCalledWith('https://play.google.com/store/apps/details?id=a.b');
    noClipboard();
    expect(await openStorePage(opts)).toBe('failed');
  });

  it('works the same way on an iPhone', async () => {
    setReviewPluginForTest({ requestReview: vi.fn().mockResolvedValue() });
    expect(await rateTheApp({ platform: 'ios', iosAppId: '99', reviewUrl: '' })).toEqual({ how: 'in-app' });
    setReviewPluginForTest(null);
    const AppLauncher = { openUrl: vi.fn().mockResolvedValue({ completed: true }) };
    setPlatformPluginsForTest({ AppLauncher });
    expect(await rateTheApp({ platform: 'ios', iosAppId: '99', reviewUrl: '' })).toEqual({ how: 'opened' });
    expect(AppLauncher.openUrl.mock.calls[0][0].url).toMatch(/^itms-apps:\/\/apps\.apple\.com\/app\/id99\?action=write-review/);
  });
});

describe('feedback never gets lost', () => {
  const fb = { mood: 'unhappy', message: 'The gates feel too close', contact: 'me@example.com' };

  it('goes to the backend when it can', async () => {
    const submit = vi.fn().mockResolvedValue({ success: true });
    expect((await sendFeedback(fb, { submit })).how).toBe('sent');
    expect(submit.mock.calls[0][0]).toMatchObject({ mood: 'unhappy', message: 'The gates feel too close', contact: 'me@example.com' });
  });

  it('opens an email with the message filled in when the backend cannot be reached', async () => {
    const AppLauncher = { openUrl: vi.fn().mockResolvedValue({ completed: true }) };
    setPlatformPluginsForTest({ AppLauncher });
    const res = await sendFeedback(fb, { submit: vi.fn().mockResolvedValue({ success: false }), email: 'help@example.com' });
    expect(res.how).toBe('email');
    const url = AppLauncher.openUrl.mock.calls[0][0].url;
    expect(url).toMatch(/^mailto:help@example\.com\?subject=/);
    expect(decodeURIComponent(url)).toContain('The gates feel too close');
  });

  it('copies the message when there is no backend and no email, and only fails when nothing works', async () => {
    const writeText = vi.fn().mockResolvedValue();
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    expect((await sendFeedback(fb, { email: '' })).how).toBe('copied');
    expect(writeText.mock.calls[0][0]).toContain('The gates feel too close');
    noClipboard();
    expect((await sendFeedback(fb, { email: '' })).how).toBe('failed');
  });

  it('a backend that throws is the same as one that is down; an empty message is refused', async () => {
    const writeText = vi.fn().mockResolvedValue();
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    expect((await sendFeedback(fb, { submit: () => { throw new Error('boom'); }, email: '' })).how).toBe('copied');
    expect((await sendFeedback({ mood: 'bug', message: '   ' }, {})).how).toBe('failed');
  });

  it('only a real address counts as the support email', () => {
    expect(supportEmail('a@b.co')).toBe('a@b.co');
    expect(supportEmail('not an email')).toBe('');
    expect(feedbackBody({ message: 'hi', contact: 'x@y.z' }, { version: '1', platform: 'ios' })).toMatch(/Dx Dash 1 on ios\nReply to: x@y\.z/);
  });
});
