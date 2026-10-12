import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

// Run against a production build preview, not Vite's development/HMR server.
const base = new URL(process.env.REVIEW_BASE_URL || 'http://127.0.0.1:5197');
const browser = await chromium.launch({
  headless: true,
  ...(process.env.REVIEW_BROWSER_EXECUTABLE ? { executablePath: process.env.REVIEW_BROWSER_EXECUTABLE } : {}),
});
const results = [];
try {
  for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
    const context = await browser.newContext({ viewport, locale: 'en-US', reducedMotion: 'reduce' });
    const page = await context.newPage();
    const requests = [];
    const errors = [];
    const violations = [];
    page.on('request', request => requests.push({ url: request.url(), type: request.resourceType() }));
    page.on('pageerror', error => errors.push(error.message));
    page.on('websocket', socket => violations.push(`WebSocket: ${socket.url()}`));
    page.on('worker', worker => violations.push(`Worker: ${worker.url()}`));
    // Capture and fail on attempted external/API access, while preventing it.
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin !== base.origin || url.pathname.startsWith('/api/')) {
        violations.push(`Blocked request: ${url.href}`);
        return route.abort();
      }
      return route.continue();
    });
    await page.goto(base.href);
    await page.getByRole('heading', { level: 1, name: 'Content review in progress', exact: true }).waitFor();
    await page.getByRole('button', { name: '中文', exact: true }).focus();
    await page.keyboard.press('Enter');
    await page.getByRole('heading', { level: 1, name: '内容安全审查中', exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: '中文', exact: true }).getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('html').getAttribute('lang'), 'zh-CN');
    assert(await page.getByText('此页面不连接消息源，也不加载外部内容。', { exact: true }).isVisible());
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Horizontal overflow');
    await page.screenshot({ path: `/tmp/jingxing-content-review-${viewport.width < 500 ? 'mobile' : 'desktop'}.png`, fullPage: true });
    for (const path of ['/docs/', '/privacy/', '/unlisted/deep/link', '/404.html']) {
      await page.goto(new URL(path, base).href);
      await page.getByRole('heading', { level: 1, name: '内容安全审查中', exact: true }).waitFor();
      await page.waitForLoadState('networkidle');
      assert.equal(await page.locator('iframe, link[rel="manifest"], link[rel="preconnect"], link[rel="prefetch"]').count(), 0);
      assert.equal(await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length), 0);
      assert.equal(await page.locator('link[rel="stylesheet"]').count(), 1);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    }
    await page.getByRole('button', { name: 'English', exact: true }).click();
    await page.getByRole('heading', { level: 1, name: 'Content review in progress', exact: true }).waitFor();
    assert.equal(await page.locator('html').getAttribute('lang'), 'en');
    assert.equal(errors.length, 0, errors.join('\n'));
    assert.equal(violations.length, 0, violations.join('\n'));
    assert(requests.every(request => ['document', 'script', 'stylesheet', 'image'].includes(request.type)), JSON.stringify(requests));
    assert(requests.every(request => new URL(request.url).origin === base.origin));
    assert(requests.filter(request => request.type !== 'document').every(request => /^\/assets\/index-[^/]+\.(js|css)$/.test(new URL(request.url).pathname)), 'Unexpected asset request');
    results.push({ viewport, passed: true, requests, violations, errors, checks: ['bilingual keyboard control', 'persisted language', 'deep links', 'no horizontal overflow', 'no service worker', 'no API/external requests'] });
    await context.close();
  }
  const file = process.env.REVIEW_EVIDENCE_FILE || '/tmp/jingxing-content-review-check.json';
  await writeFile(file, JSON.stringify(results, null, 2));
  console.log(JSON.stringify({ passed: true, cases: results.length, evidence: file }));
} finally {
  await browser.close();
}
