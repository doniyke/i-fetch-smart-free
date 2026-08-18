import { iFetchSmart } from '../src/index';
import { clearCache } from '../src/cache';
import { FetchMock, installFetchMock, jsonResponse } from './helpers';

describe('retry', () => {
  let mockFetch: FetchMock;

  beforeEach(() => {
    jest.useFakeTimers();
    clearCache();
    mockFetch = installFetchMock();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('retries network errors up to the configured maximum, then rejects', async () => {
    mockFetch.mockRejectedValue(new Error('ECONNRESET'));

    const promise = iFetchSmart('https://api.test/a', { retries: 2 });
    const assertion = expect(promise).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
      attempts: 3
    });

    await jest.runAllTimersAsync();
    await assertion;

    // retries: 2 means the first attempt plus 2 more.
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it('issues exactly one request when retries is 0', async () => {
    mockFetch.mockRejectedValue(new Error('ECONNRESET'));

    const promise = iFetchSmart('https://api.test/a', { retries: 0 });
    const assertion = expect(promise).rejects.toMatchObject({ attempts: 1 });

    await jest.runAllTimersAsync();
    await assertion;

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('treats retries: 3 as four total requests', async () => {
    mockFetch.mockRejectedValue(new Error('ECONNRESET'));

    const promise = iFetchSmart('https://api.test/a');
    const assertion = expect(promise).rejects.toBeInstanceOf(Error);

    await jest.runAllTimersAsync();
    await assertion;

    expect(mockFetch).toHaveBeenCalledTimes(4);
  });

  it('resolves normally when the second attempt succeeds', async () => {
    mockFetch
      .mockRejectedValueOnce(new Error('ECONNRESET'))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));

    const promise = iFetchSmart('https://api.test/a', { retries: 3 });
    await jest.runAllTimersAsync();

    await expect(promise).resolves.toEqual({ ok: true });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  describe('HTTP status codes', () => {
    it.each([408, 429, 500, 502, 503, 504])('retries %i', async (status) => {
      mockFetch.mockImplementation(async () => jsonResponse({ err: true }, status));

      const promise = iFetchSmart('https://api.test/a', { retries: 2 });
      const assertion = expect(promise).rejects.toMatchObject({
        code: 'HTTP_ERROR',
        status
      });

      await jest.runAllTimersAsync();
      await assertion;

      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it.each([400, 401, 403, 404, 422, 501])(
      'does not retry %i',
      async (status) => {
        mockFetch.mockImplementation(async () => jsonResponse({ err: true }, status));

        const promise = iFetchSmart('https://api.test/a', { retries: 3 });
        const assertion = expect(promise).rejects.toMatchObject({
          code: 'HTTP_ERROR',
          status,
          attempts: 1
        });

        await jest.runAllTimersAsync();
        await assertion;

        expect(mockFetch).toHaveBeenCalledTimes(1);
      }
    );

    it('honours a custom retryOn list', async () => {
      mockFetch.mockImplementation(async () => jsonResponse({ err: true }, 404));

      const promise = iFetchSmart('https://api.test/a', {
        retries: 1,
        retryOn: [404]
      });
      const assertion = expect(promise).rejects.toMatchObject({ status: 404 });

      await jest.runAllTimersAsync();
      await assertion;

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('recovers when a retryable status is followed by success', async () => {
      mockFetch
        .mockResolvedValueOnce(jsonResponse({ err: true }, 503))
        .mockResolvedValueOnce(jsonResponse({ recovered: true }));

      const promise = iFetchSmart('https://api.test/a', { retries: 2 });
      await jest.runAllTimersAsync();

      await expect(promise).resolves.toEqual({ recovered: true });
    });
  });

  describe('backoff', () => {
    it('grows exponentially between attempts', async () => {
      mockFetch.mockRejectedValue(new Error('ECONNRESET'));

      const promise = iFetchSmart('https://api.test/a', { retries: 3 });
      promise.catch(() => undefined); // keep the rejection handled while we step the clock

      // First attempt fires immediately.
      await jest.advanceTimersByTimeAsync(0);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // 500ms before attempt 2.
      await jest.advanceTimersByTimeAsync(499);
      expect(mockFetch).toHaveBeenCalledTimes(1);
      await jest.advanceTimersByTimeAsync(1);
      expect(mockFetch).toHaveBeenCalledTimes(2);

      // 1000ms before attempt 3.
      await jest.advanceTimersByTimeAsync(999);
      expect(mockFetch).toHaveBeenCalledTimes(2);
      await jest.advanceTimersByTimeAsync(1);
      expect(mockFetch).toHaveBeenCalledTimes(3);

      // 2000ms before attempt 4.
      await jest.advanceTimersByTimeAsync(1999);
      expect(mockFetch).toHaveBeenCalledTimes(3);
      await jest.advanceTimersByTimeAsync(1);
      expect(mockFetch).toHaveBeenCalledTimes(4);

      await jest.runAllTimersAsync();
      await expect(promise).rejects.toBeInstanceOf(Error);
    });

    it('respects a custom retryDelay', async () => {
      mockFetch.mockRejectedValue(new Error('ECONNRESET'));

      const promise = iFetchSmart('https://api.test/a', {
        retries: 1,
        retryDelay: 100
      });
      promise.catch(() => undefined);

      await jest.advanceTimersByTimeAsync(99);
      expect(mockFetch).toHaveBeenCalledTimes(1);
      await jest.advanceTimersByTimeAsync(1);
      expect(mockFetch).toHaveBeenCalledTimes(2);

      await jest.runAllTimersAsync();
      await expect(promise).rejects.toBeInstanceOf(Error);
    });

    it('caps the wait at maxRetryDelay', async () => {
      mockFetch.mockRejectedValue(new Error('ECONNRESET'));

      const promise = iFetchSmart('https://api.test/a', {
        retries: 2,
        retryDelay: 1000,
        maxRetryDelay: 1500
      });
      promise.catch(() => undefined);

      await jest.advanceTimersByTimeAsync(1000);
      expect(mockFetch).toHaveBeenCalledTimes(2);

      // Uncapped this would be 2000ms; the cap pulls it back to 1500ms.
      await jest.advanceTimersByTimeAsync(1499);
      expect(mockFetch).toHaveBeenCalledTimes(2);
      await jest.advanceTimersByTimeAsync(1);
      expect(mockFetch).toHaveBeenCalledTimes(3);

      await jest.runAllTimersAsync();
      await expect(promise).rejects.toBeInstanceOf(Error);
    });
  });
});
