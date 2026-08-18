import { iFetchSmart, FetchSmartError, isFetchSmartError } from '../src/index';
import { clearCache } from '../src/cache';
import {
  FetchMock,
  installFetchMock,
  jsonResponse,
  textResponse
} from './helpers';

describe('error handling', () => {
  let mockFetch: FetchMock;

  beforeEach(() => {
    jest.useFakeTimers();
    clearCache();
    mockFetch = installFetchMock();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  /** Every failure mode should arrive as the same class, carrying the same fields. */
  async function captureError(
    options: Parameters<typeof iFetchSmart>[1],
    url = 'https://api.test/a'
  ): Promise<FetchSmartError> {
    const promise = iFetchSmart(url, options);
    const caught = promise.then(
      () => null,
      (error: unknown) => error as FetchSmartError
    );
    await jest.runAllTimersAsync();

    const error = await caught;
    if (!error) throw new Error('expected the request to reject');
    return error;
  }

  describe('non-JSON bodies', () => {
    it('reports an HTML error page as a parse failure, not a raw SyntaxError', async () => {
      mockFetch.mockImplementation(async () => textResponse('<html>nope</html>'));

      const error = await captureError({ retries: 0 });

      expect(isFetchSmartError(error)).toBe(true);
      expect(error.code).toBe('PARSE_ERROR');
      expect(error.message).toMatch(/not valid JSON/);
      expect(error.status).toBe(200);
    });

    it('names the content-type so the cause is obvious', async () => {
      mockFetch.mockImplementation(async () => textResponse('plain', 200, 'text/plain'));

      const error = await captureError({ retries: 0 });

      expect(error.message).toMatch(/text\/plain/);
    });

    it('preserves the underlying parse error as `cause`', async () => {
      mockFetch.mockImplementation(async () => textResponse('<html>nope</html>'));

      const error = await captureError({ retries: 0 });

      // Not `toBeInstanceOf(Error)`: undici throws from a different JS realm
      // than the Jest test context, so cross-realm instanceof is unreliable.
      expect(error.cause).toBeDefined();
      expect((error.cause as Error).name).toBe('SyntaxError');
      expect(typeof (error.cause as Error).message).toBe('string');
    });

    it('treats a completely empty body as null rather than a parse failure', async () => {
      mockFetch.mockImplementation(async () => new Response('', { status: 200 }));

      const promise = iFetchSmart('https://api.test/a', { retries: 0 });
      await jest.runAllTimersAsync();

      await expect(promise).resolves.toBeNull();
    });

    it.each([204, 205])(
      'resolves %i with null instead of throwing',
      async (status) => {
        mockFetch.mockImplementation(async () => new Response(null, { status }));

        const promise = iFetchSmart('https://api.test/a', { retries: 0 });
        await jest.runAllTimersAsync();

        await expect(promise).resolves.toBeNull();
      }
    );

    it('still reports a genuinely malformed body as a parse failure', async () => {
      mockFetch.mockImplementation(async () => textResponse('{"a":', 200, 'application/json'));

      const error = await captureError({ retries: 0 });

      expect(error.code).toBe('PARSE_ERROR');
    });

    it('does not retry a parse failure', async () => {
      mockFetch.mockImplementation(async () => textResponse('<html>nope</html>'));

      await captureError({ retries: 3 });

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('consistent error shape', () => {
    it('uses FetchSmartError for HTTP failures', async () => {
      mockFetch.mockImplementation(async () => jsonResponse({ err: true }, 404));

      const error = await captureError({ retries: 0 });

      expect(error).toBeInstanceOf(FetchSmartError);
      expect(error.name).toBe('FetchSmartError');
      expect(error.code).toBe('HTTP_ERROR');
      expect(error.status).toBe(404);
      expect(error.url).toBe('https://api.test/a');
      expect(error.attempts).toBe(1);
    });

    it('uses FetchSmartError for network failures', async () => {
      mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));

      const error = await captureError({ retries: 1 });

      expect(error).toBeInstanceOf(FetchSmartError);
      expect(error.code).toBe('NETWORK_ERROR');
      expect(error.status).toBeUndefined();
      expect(error.attempts).toBe(2);
      expect((error.cause as Error).message).toBe('ECONNREFUSED');
    });

    it.each([
      ['HTTP_ERROR', () => mockFetch.mockImplementation(async () => jsonResponse({}, 404))],
      [
        'NETWORK_ERROR',
        () => mockFetch.mockRejectedValue(new Error('ECONNREFUSED'))
      ],
      [
        'PARSE_ERROR',
        () => mockFetch.mockImplementation(async () => textResponse('<html>x</html>'))
      ]
    ])('%s carries url and attempts', async (code, arrange) => {
      arrange();

      const error = await captureError({ retries: 0 });

      expect(error.code).toBe(code);
      expect(error.url).toBe('https://api.test/a');
      expect(typeof error.attempts).toBe('number');
      expect(error.attempts).toBeGreaterThan(0);
    });

    it('counts every attempt made, not just the last', async () => {
      mockFetch.mockRejectedValue(new Error('ECONNRESET'));

      const error = await captureError({ retries: 3 });

      expect(error.attempts).toBe(4);
    });

    it('is catchable as a plain Error', async () => {
      mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));

      const error = await captureError({ retries: 0 });

      expect(error).toBeInstanceOf(Error);
      expect(error.stack).toBeDefined();
    });

    it('isFetchSmartError rejects unrelated errors', () => {
      expect(isFetchSmartError(new Error('nope'))).toBe(false);
      expect(isFetchSmartError('nope')).toBe(false);
      expect(isFetchSmartError(null)).toBe(false);
    });
  });

  describe('successful responses', () => {
    it('returns the parsed JSON body', async () => {
      mockFetch.mockImplementation(async () => jsonResponse({ id: 1, name: 'thing' }));

      const promise = iFetchSmart('https://api.test/a');
      await jest.runAllTimersAsync();

      await expect(promise).resolves.toEqual({ id: 1, name: 'thing' });
    });

    it('passes fetch options straight through', async () => {
      mockFetch.mockImplementation(async () => jsonResponse({ ok: true }));

      const promise = iFetchSmart('https://api.test/a', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ a: 1 }),
        retries: 0
      });
      await jest.runAllTimersAsync();
      await promise;

      const [, init] = mockFetch.mock.calls[0];
      expect(init?.method).toBe('POST');
      expect(init?.body).toBe(JSON.stringify({ a: 1 }));
      expect(init?.headers).toEqual({ 'content-type': 'application/json' });
    });

    it('does not leak iFetchSmart options into the fetch call', async () => {
      mockFetch.mockImplementation(async () => jsonResponse({ ok: true }));

      const promise = iFetchSmart('https://api.test/a', {
        retries: 1,
        timeout: 1000,
        cacheTtl: 5000,
        retryOn: [503],
        retryDelay: 100,
        maxRetryDelay: 200
      });
      await jest.runAllTimersAsync();
      await promise;

      const [, init] = mockFetch.mock.calls[0];
      const forwarded = Object.keys(init ?? {});
      expect(forwarded).not.toContain('retries');
      expect(forwarded).not.toContain('timeout');
      expect(forwarded).not.toContain('cacheTtl');
      expect(forwarded).not.toContain('retryOn');
      expect(forwarded).not.toContain('retryDelay');
      expect(forwarded).not.toContain('maxRetryDelay');
    });
  });
});
