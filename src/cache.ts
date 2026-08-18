interface CacheEntry {
  data: unknown;
  expiry: number;
}

export type CacheLookup = { hit: true; data: unknown } | { hit: false };

const cache = new Map<string, CacheEntry>();

/** Only safe methods are cached; caching a POST response and replaying it is a bug. */
const CACHEABLE_METHODS = new Set(['GET', 'HEAD']);

/**
 * Field separator for cache keys. NUL is used because it cannot legally appear
 * in a URL, method or header value, so key fields can never run together.
 */
const SEP = '\u0000';

export function isCacheable(init: RequestInit): boolean {
  const method = (init.method ?? 'GET').toUpperCase();
  if (!CACHEABLE_METHODS.has(method)) return false;
  // A non-string body cannot be fingerprinted reliably, so refuse to cache it
  // rather than risk serving one request's response to a different request.
  if (init.body != null && typeof init.body !== 'string') return false;
  return true;
}

type HeadersInput = RequestInit['headers'];

function serializeHeaders(headers: HeadersInput): string {
  if (!headers) return '';
  const entries: Array<[string, string]> = [];

  if (typeof Headers !== 'undefined' && headers instanceof Headers) {
    headers.forEach((value, key) => entries.push([key.toLowerCase(), value]));
  } else if (Array.isArray(headers)) {
    for (const [key, value] of headers) {
      entries.push([String(key).toLowerCase(), String(value)]);
    }
  } else {
    for (const [key, value] of Object.entries(headers)) {
      entries.push([key.toLowerCase(), String(value)]);
    }
  }

  entries.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return entries.map(([key, value]) => key + ':' + value).join(SEP);
}

/**
 * Keys include method, URL, body and headers. Headers matter for correctness as
 * well as cache-hit accuracy: without them, a response fetched with one
 * `Authorization` header could be served to a request carrying a different one.
 */
export function buildCacheKey(url: string, init: RequestInit): string {
  const method = (init.method ?? 'GET').toUpperCase();
  const body = typeof init.body === 'string' ? init.body : '';
  return [method, url, body, serializeHeaders(init.headers)].join(SEP);
}

export function setCache(key: string, data: unknown, ttl: number): void {
  // Clone on write so the caller keeps an isolated object and cannot mutate
  // what later callers will receive.
  cache.set(key, { data: structuredClone(data), expiry: Date.now() + ttl });
}

export function getCache(key: string): CacheLookup {
  const entry = cache.get(key);
  if (!entry) return { hit: false };

  if (Date.now() > entry.expiry) {
    cache.delete(key);
    return { hit: false };
  }

  // Presence, not truthiness: a cached body of `null`/`0`/`false`/`""` is a hit.
  return { hit: true, data: structuredClone(entry.data) };
}

/** Drops every cached entry. Exposed mainly so tests and long-lived apps can reset. */
export function clearCache(): void {
  cache.clear();
}

/** Number of entries currently held, expired-but-unswept included. */
export function cacheSize(): number {
  return cache.size;
}
