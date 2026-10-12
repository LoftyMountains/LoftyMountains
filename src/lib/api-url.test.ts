import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.test/');
  vi.stubGlobal('window', { location: { origin: 'https://pages.example.test' } });
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('separate Pages and API deployments', () => {
  it('rewrites API paths and own-origin proxy URLs without changing external sources', async () => {
    const { apiUrl } = await import('./api-url');
    expect(apiUrl('/api')).toBe('https://api.example.test/api');
    expect(apiUrl('/api/news?q=x')).toBe('https://api.example.test/api/news?q=x');
    expect(apiUrl('https://pages.example.test/api/proxy-tiles?url=x')).toBe('https://api.example.test/api/proxy-tiles?url=x');
    expect(apiUrl('https://earthquake.usgs.gov/api/feed')).toBe('https://earthquake.usgs.gov/api/feed');
    expect(apiUrl('/vendor/maplibre/6.7.0/maplibre-gl-worker.mjs')).toBe('/vendor/maplibre/6.7.0/maplibre-gl-worker.mjs');
    expect(apiUrl(apiUrl('/api/news'))).toBe('https://api.example.test/api/news');
  });
  it('retains request options and resolves SSE on the API origin', async () => {
    const calls: unknown[][] = [];
    class FakeEventSource { constructor(...args: unknown[]) { calls.push(args); } }
    const nativeFetch = vi.fn(async () => new Response('{}'));
    vi.stubGlobal('window', { location: { origin: 'https://pages.example.test' }, fetch: nativeFetch, EventSource: FakeEventSource });
    const { installApiTransport } = await import('./api-url');
    installApiTransport();
    const controller = new AbortController();
    const options = { method: 'POST', body: '{"question":"x"}', headers: { 'x-oi-key': 'test-user-supplied-key' }, signal: controller.signal };
    await window.fetch('/api/oi/assist', options);
    expect(nativeFetch).toHaveBeenCalledWith('https://api.example.test/api/oi/assist', options);
    new window.EventSource('/api/malware/stream', { withCredentials: false });
    expect(calls).toEqual([['https://api.example.test/api/malware/stream', { withCredentials: false }]]);
  });
});

it('resolves backend-owned media returned inside camera records for all playback paths', async () => {
  const { resolveCameraUrls } = await import('./camera-feed');
  const { previewMedia } = await import('./camera-preview');
  const original = { id: 'test', feed_url: '/api/cctv/texas/snapshot?id=1', stream_url: '/api/cctv/proxy?url=https%3A%2F%2Fvideo.example%2Findex.m3u8', external_url: 'https://camera.example/live', stream_type: 'hls' };
  const camera = resolveCameraUrls(original);
  expect(camera.feed_url).toBe('https://api.example.test/api/cctv/texas/snapshot?id=1');
  expect(camera.stream_url).toBe('https://api.example.test/api/cctv/proxy?url=https%3A%2F%2Fvideo.example%2Findex.m3u8');
  expect(camera.external_url).toBe(original.external_url);
  expect(original.feed_url).toBe('/api/cctv/texas/snapshot?id=1');
  expect(resolveCameraUrls(camera)).toBe(camera);
  expect(previewMedia(original)?.url).toBe(camera.stream_url);
  expect(previewMedia({ stream_type: 'jpg', feed_url: '/api/cctv/proxy?url=x' })?.url).toBe('https://api.example.test/api/cctv/proxy?url=x');
});
