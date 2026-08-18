import { iFetchSmart } from '../src/index';
import { buildCacheKey, cacheSize, clearCache, isCacheable } from '../src/cache';
import { FetchMock, installFetchMock, jsonResponse } from './helpers';

describe('cache', () => {
  let mockFetch: FetchMock;

  beforeEach(() => {
    jest.useFakeTimers();
    clearCache();
    mockFetch = installFetchMock();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('serves a repeat request within the TTL without a second fetch', async () => {
    mockFetch.mockImplementation(async () => jsonResponse({ cached: true }));

    const first = await iFetchSmart('https://api.test/a', { cacheTtl: 5000 });
    const second = await iFetchSmart('https://api.test/a', { cacheTtl: 5000 });

    expect(first).toEqual({ cached: true });
    expect(second).toEqual({ cached: true });
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('issues a new fetch once the TTL has expired', async () => {
    mockFetch.mockImplementation(async () => jsonResponse({ v: 1 }));

    await iFetchSmart('https://api.test/a', { cacheTtl: 5000 });
    expect(mockFetch).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(5001);

    await iFetchSmart('https://api.test/a', { cacheTtl: 5000 });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('still serves from cache one tick before expiry', async () => {
    mockFetch.mockImplementation(async () => jsonResponse({ v: 1 }));

    await iFetchSmart('https://api.test/a', { cacheTtl: 5000 });
    jest.advanceTimersByTime(4999);
    await iFetchSmart('https://api.test/a', { cacheTtl: 5000 });

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('does not cache at all when cacheTtl is 0', async () => {
    mockFetch.mockImplementation(async () => jsonResponse({ v: 1 }));

    await iFetchSmart('https://api.test/a');
    await iFetchSmart('https://api.test/a');

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(cacheSize()).toBe(0);
  });

  it('caches a falsy body such as null', async () => {
    mockFetch.mockImplementation(async () => jsonResponse(null));

    const first = await iFetchSmart('https://api.test/a', { cacheTtl: 5000 });
    const second = await iFetchSmart('https://api.test/a', { cacheTtl: 5000 });

    expect(first).toBeNull();
    expect(second).toBeNull();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('does not hand callers a reference into the cache', async () => {
    mockFetch.mockImplementation(async () => jsonResponse({ user: 'alice', tags: ['a'] }));

    const first = await iFetchSmart('https://api.test/a', { cacheTtl: 5000 });
    first.user = 'MUTATED';
    first.tags.push('injected');

    const second = await iFetchSmart('https://api.test/a', { cacheTtl: 5000 });

    expect(second).toEqual({ user: 'alice', tags: ['a'] });
    expect(second).not.toBe(first);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  describe('key construction', () => {
    it('distinguishes different URLs', async () => {
      mockFetch.mockImplementation(async () => jsonResponse({ v: 1 }));

      await iFetchSmart('https://api.test/a', { cacheTtl: 5000 });
      await iFetchSmart('https://api.test/b', { cacheTtl: 5000 });

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('distinguishes methods', () => {
      expect(buildCacheKey('https://api.test/a', { method: 'GET' })).not.toBe(
        buildCacheKey('https://api.test/a', { method: 'HEAD' })
      );
    });

    it('treats a missing method as GET', () => {
      expect(buildCacheKey('https://api.test/a', {})).toBe(
        buildCacheKey('https://api.test/a', { method: 'get' })
      );
    });

    it('distinguishes request bodies', () => {
      expect(
        buildCacheKey('https://api.test/a', { body: 'one' })
      ).not.toBe(buildCacheKey('https://api.test/a', { body: 'two' }));
    });

    it('distinguishes differing headers', () => {
      expect(
        buildCacheKey('https://api.test/a', {
          headers: { authorization: 'Bearer alice' }
        })
      ).not.toBe(
        buildCacheKey('https://api.test/a', {
          headers: { authorization: 'Bearer bob' }
        })
      );
    });

    it('does not let one user cached response leak to another', async () => {
      mockFetch
        .mockResolvedValueOnce(jsonResponse({ user: 'alice' }))
        .mockResolvedValueOnce(jsonResponse({ user: 'bob' }));

      const alice = await iFetchSmart('https://api.test/me', {
        cacheTtl: 5000,
        headers: { authorization: 'Bearer alice' }
      });
      const bob = await iFetchSmart('https://api.test/me', {
        cacheTtl: 5000,
        headers: { authorization: 'Bearer bob' }
      });

      expect(alice).toEqual({ user: 'alice' });
      expect(bob).toEqual({ user: 'bob' });
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('accepts headers as a Headers instance', () => {
      const viaHeaders = buildCacheKey('https://api.test/a', {
        headers: new Headers({ accept: 'application/json' })
      });
      const viaObject = buildCacheKey('https://api.test/a', {
        headers: { accept: 'application/json' }
      });

      expect(viaHeaders).toBe(viaObject);
    });

    it('accepts headers as an array of pairs', () => {
      const viaArray = buildCacheKey('https://api.test/a', {
        headers: [['Accept', 'application/json']]
      });
      const viaObject = buildCacheKey('https://api.test/a', {
        headers: { accept: 'application/json' }
      });

      expect(viaArray).toBe(viaObject);
    });

    it('is insensitive to header order and casing', () => {
      expect(
        buildCacheKey('https://api.test/a', {
          headers: { Accept: 'application/json', 'X-Trace': '1' }
        })
      ).toBe(
        buildCacheKey('https://api.test/a', {
          headers: { 'x-trace': '1', accept: 'application/json' }
        })
      );
    });
  });

  describe('method eligibility', () => {
    it.each(['GET', 'HEAD'])('caches %s', (method) => {
      expect(isCacheable({ method })).toBe(true);
    });

    it.each(['POST', 'PUT', 'PATCH', 'DELETE'])(
      'does not cache %s',
      (method) => {
        expect(isCacheable({ method })).toBe(false);
      }
    );

    it('does not cache a POST response even with cacheTtl set', async () => {
      mockFetch.mockImplementation(async () => jsonResponse({ created: true }));

      await iFetchSmart('https://api.test/a', {
        method: 'POST',
        body: 'x=1',
        cacheTtl: 5000
      });
      await iFetchSmart('https://api.test/a', {
        method: 'POST',
        body: 'x=1',
        cacheTtl: 5000
      });

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(cacheSize()).toBe(0);
    });

    it('never serves a POST response to a subsequent GET', async () => {
      mockFetch
        .mockResolvedValueOnce(jsonResponse({ from: 'POST' }))
        .mockResolvedValueOnce(jsonResponse({ from: 'GET' }));

      await iFetchSmart('https://api.test/a', {
        method: 'POST',
        body: 'x=1',
        cacheTtl: 5000
      });
      const get = await iFetchSmart('https://api.test/a', { cacheTtl: 5000 });

      expect(get).toEqual({ from: 'GET' });
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('refuses to cache a request with a non-string body', () => {
      expect(isCacheable({ method: 'GET', body: new Uint8Array([1, 2]) })).toBe(
        false
      );
    });
  });

  it('does not cache failed responses', async () => {
    mockFetch.mockImplementation(async () => jsonResponse({ err: true }, 404));

    await expect(
      iFetchSmart('https://api.test/a', { cacheTtl: 5000, retries: 0 })
    ).rejects.toMatchObject({ code: 'HTTP_ERROR' });

    expect(cacheSize()).toBe(0);
  });

  it('clearCache empties the store', async () => {
    mockFetch.mockImplementation(async () => jsonResponse({ v: 1 }));

    await iFetchSmart('https://api.test/a', { cacheTtl: 5000 });
    expect(cacheSize()).toBe(1);

    clearCache();
    expect(cacheSize()).toBe(0);

    await iFetchSmart('https://api.test/a', { cacheTtl: 5000 });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});
