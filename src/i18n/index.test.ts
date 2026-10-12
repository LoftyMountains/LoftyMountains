import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal('localStorage', { getItem: () => 'en' });
});
afterEach(() => vi.unstubAllGlobals());

describe('source-level interface messages', () => {
  it('decodes JSX entities rather than exposing encoded text after extraction', async () => {
    const { t, decodeEntities } = await import('./index');
    expect(t('Dots &amp; labels')).toBe('Dots & labels');
    expect(t('curl {0}\n  --header test', '/api/stats')).toBe('curl /api/stats\n  --header test');
    expect(t('The market&apos;s price &rarr; {0}', 12)).toBe("The market's price → 12");
    expect(decodeEntities('&#x1F6F0; &#39; &#128752;')).toBe("🛰 ' 🛰");
  });
  it('keeps values, zero and original reporting unchanged in English', async () => {
    const { t, translateValue } = await import('./index');
    expect(t('{0} aircraft at {1} UTC', 0, '01:02')).toBe('0 aircraft at 01:02 UTC');
    expect(translateValue('Original newsroom headline with a quoted “source”')).toBe('Original newsroom headline with a quoted “source”');
    const record = { title: 'Close', source: 'NASA' };
    expect(translateValue(record)).toBe(record);
    expect(translateValue(0)).toBe(0);
  });
  it('reads browser language only when no explicit preference exists', async () => {
    vi.stubGlobal('localStorage', { getItem: () => null });
    vi.stubGlobal('navigator', { language: 'zh-CN' });
    const { locale } = await import('./index');
    expect(locale()).toBe('zh');
  });
  it('honors an English preference on a Chinese browser', async () => {
    vi.stubGlobal('navigator', { language: 'zh-CN' });
    const { locale } = await import('./index');
    expect(locale()).toBe('en');
  });
});
