const configured = (import.meta.env.VITE_API_BASE_URL || (import.meta.env.PROD ? 'https://api.loftymountains.com' : '')).replace(/\/$/, '');
/** Keep relative browser API paths local in development and on the API host in Pages. */
export function apiUrl(value: string): string {
  if (!configured) return value;
  if (value.startsWith('/api/') || value === '/api') return configured + value;
  if (typeof window !== 'undefined' && value.startsWith(window.location.origin + '/api/')) return configured + value.slice(window.location.origin.length);
  return value;
}
export function installApiTransport() {
  const nativeFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    if (typeof input === 'string') return nativeFetch(apiUrl(input), init);
    if (input instanceof URL) return nativeFetch(apiUrl(input.href), init);
    const url = apiUrl(input.url);
    return nativeFetch(url === input.url ? input : new Request(url, input), init);
  };
  const NativeEventSource = window.EventSource;
  window.EventSource = class extends NativeEventSource {
    constructor(url: string | URL, options?: EventSourceInit) { super(apiUrl(String(url)), options); }
  };
}
