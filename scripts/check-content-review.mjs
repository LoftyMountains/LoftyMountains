import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

// Run against a production build preview, not Vite's development/HMR server.
const base = new URL(process.env.REVIEW_BASE_URL || 'http://127.0.0.1:5197');
const file = process.env.REVIEW_EVIDENCE_FILE || '/tmp/jingxing-content-review-check.json';
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
    const responses = [];
    const requestFailures = [];
    const interceptedRequests = [];
    const result = { viewport, passed: false, functionalPassed: false, networkPassed: false, requests, responses, requestFailures, interceptedRequests, violations, errors, failure: null, checks: [] };
    // Register evidence before navigation so any assertion/navigation failure is retained.
    results.push(result);
    page.on('request', request => {
      const url = new URL(request.url());
      const http = ['http:', 'https:'].includes(url.protocol);
      const api = url.pathname === '/api' || url.pathname.startsWith('/api/');
      const classification = !http ? 'non-http' : url.origin !== base.origin ? 'external-attempt' : api ? 'api-attempt' : 'same-origin';
      requests.push({ url: request.url(), type: request.resourceType(), method: request.method(), protocol: url.protocol, origin: url.origin, classification });
      // CSP can cancel a request before route interception. The request event is
      // still an attempt and must fail the zero-attempt requirement independently.
      if (classification === 'external-attempt' || classification === 'api-attempt') violations.push(`Forbidden ${classification}: ${url.href}`);
    });
    page.on('response', response => responses.push({ url: response.url(), status: response.status() }));
    page.on('requestfailed', request => requestFailures.push({ url: request.url(), error: request.failure()?.errorText }));
    page.on('pageerror', error => errors.push(error.message));
    page.on('websocket', socket => violations.push(`WebSocket: ${socket.url()}`));
    page.on('worker', worker => violations.push(`Worker: ${worker.url()}`));
    try {
      // Prevent any attempted external/API access that reaches route interception.
      await context.route('**/*', route => {
        const url = new URL(route.request().url());
        if (url.origin !== base.origin || url.pathname === '/api' || url.pathname.startsWith('/api/')) {
          interceptedRequests.push({ url: url.href, action: 'aborted-before-network' });
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
      result.functionalPassed = true;
      result.checks = ['bilingual keyboard control', 'persisted language', 'deep links', 'no horizontal overflow', 'no service worker'];
      assert.equal(violations.length, 0, violations.join('\n'));
      assert(requests.every(request => ['document', 'script', 'stylesheet', 'image'].includes(request.type)), JSON.stringify(requests));
      assert(requests.every(request => request.origin === base.origin), `Unexpected request origin (expected ${base.origin}): ${JSON.stringify(requests.filter(request => request.origin !== base.origin))}`);
      const unexpectedAssets = requests.filter(request => request.type !== 'document' && !/^\/assets\/index-[^/]+\.(js|css)$/.test(new URL(request.url).pathname));
      assert.equal(unexpectedAssets.length, 0, `Unexpected asset requests: ${JSON.stringify(unexpectedAssets)}`);
      result.networkPassed = true;
      result.passed = true;
      result.checks.push('no API/external requests');
    } catch (error) {
      result.failure = error instanceof Error ? error.message : String(error);
    } finally {
      await context.close();
    }
  }
  if (!results.every(result => result.passed)) process.exitCode = 1;
} catch (error) {
  if (results.length) results.at(-1).failure = error instanceof Error ? error.message : String(error);
  throw error;
} finally {
  await writeFile(file, JSON.stringify(results, null, 2));
  console.log(JSON.stringify({ passed: results.length === 2 && results.every(result => result.passed), cases: results.map(result => ({
    viewport: result.viewport, functionalPassed: result.functionalPassed, networkPassed: result.networkPassed,
    externalAttempts: result.requests.filter(request => request.classification === 'external-attempt').length,
    apiAttempts: result.requests.filter(request => request.classification === 'api-attempt').length,
    cspFailures: result.requestFailures.filter(request => request.error === 'csp').length,
    externalResponses: result.responses.filter(response => new URL(response.url).origin !== base.origin).length,
    failure: result.failure,
  })), evidence: file }));
  await browser.close();
}
