import { iFetchSmart } from '../src/index';
import { clearCache } from '../src/cache';
import {
  hangingFetch,
  installFetchMock,
  jsonResponse,
  releaseHangingRequests
} from './helpers';

describe('timeout', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    clearCache();
  });

  afterEach(() => {
    releaseHangingRequests();
    jest.useRealTimers();
  });

  it('rejects with an identifiable timeout error', async () => {
    hangingFetch();

    const promise = iFetchSmart('https://api.test/slow', {
      timeout: 1000,
      retries: 0
    });
    const assertion = expect(promise).rejects.toMatchObject({
      name: 'FetchSmartError',
      code: 'TIMEOUT'
    });

    await jest.advanceTimersByTimeAsync(1000);
    await assertion;
  });

  it('names the timeout duration in the message', async () => {
    hangingFetch();

    const promise = iFetchSmart('https://api.test/slow', {
      timeout: 250,
      retries: 0
    });
    const assertion = expect(promise).rejects.toThrow(/timed out after 250ms/);

    await jest.advanceTimersByTimeAsync(250);
    await assertion;
  });

  it('actually aborts the underlying request rather than abandoning it', async () => {
    const signals: Array<AbortSignal | null | undefined> = [];
    hangingFetch((init) => signals.push(init?.signal));

    const promise = iFetchSmart('https://api.test/slow', {
      timeout: 1000,
      retries: 0
    });
    promise.catch(() => undefined);

    await jest.advanceTimersByTimeAsync(999);
    expect(signals[0]?.aborted).toBe(false);

    await jest.advanceTimersByTimeAsync(1);
    expect(signals[0]?.aborted).toBe(true);

    await expect(promise).rejects.toMatchObject({ code: 'TIMEOUT' });
  });

  it('gives every retry attempt its own timeout budget', async () => {
    const signals: Array<AbortSignal | null | undefined> = [];
    const mock = hangingFetch((init) => signals.push(init?.signal));

    const promise = iFetchSmart('https://api.test/slow', {
      timeout: 1000,
      retries: 1,
      retryDelay: 500
    });
    const assertion = expect(promise).rejects.toMatchObject({
      code: 'TIMEOUT',
      attempts: 2
    });

    // Attempt 1 times out on its own 1000ms clock.
    await jest.advanceTimersByTimeAsync(1000);
    expect(mock).toHaveBeenCalledTimes(1);
    expect(signals[0]?.aborted).toBe(true);

    // Backoff, then attempt 2 starts with a fresh 1000ms.
    await jest.advanceTimersByTimeAsync(500);
    expect(mock).toHaveBeenCalledTimes(2);
    expect(signals[1]?.aborted).toBe(false);

    await jest.advanceTimersByTimeAsync(999);
    expect(signals[1]?.aborted).toBe(false);
    await jest.advanceTimersByTimeAsync(1);
    expect(signals[1]?.aborted).toBe(true);

    await assertion;
  });

  it('does not fire the timeout when the request resolves in time', async () => {
    const mock = installFetchMock();
    mock.mockResolvedValue(jsonResponse({ fast: true }));

    const promise = iFetchSmart('https://api.test/fast', { timeout: 1000 });
    await jest.advanceTimersByTimeAsync(0);

    await expect(promise).resolves.toEqual({ fast: true });
    // No stray timer should be left behind holding the process open.
    expect(jest.getTimerCount()).toBe(0);
  });

  it('disables the timeout when set to 0', async () => {
    const signals: Array<AbortSignal | null | undefined> = [];
    hangingFetch((init) => signals.push(init?.signal));

    const promise = iFetchSmart('https://api.test/slow', {
      timeout: 0,
      retries: 0
    });
    promise.catch(() => undefined);

    await jest.advanceTimersByTimeAsync(60_000);
    // No controller of ours, and nothing aborted it.
    expect(signals[0] ?? null).toBeNull();
    expect(jest.getTimerCount()).toBe(0);
  });

  describe('caller-supplied AbortSignal', () => {
    it('surfaces a caller abort as ABORTED, not TIMEOUT', async () => {
      hangingFetch();
      const controller = new AbortController();

      const promise = iFetchSmart('https://api.test/slow', {
        timeout: 10_000,
        retries: 3,
        signal: controller.signal
      });
      const assertion = expect(promise).rejects.toMatchObject({
        code: 'ABORTED'
      });

      controller.abort();
      await jest.advanceTimersByTimeAsync(0);
      await assertion;
    });

    it('does not retry after a caller abort', async () => {
      const mock = hangingFetch();
      const controller = new AbortController();

      const promise = iFetchSmart('https://api.test/slow', {
        timeout: 10_000,
        retries: 3,
        signal: controller.signal
      });
      const assertion = expect(promise).rejects.toMatchObject({
        code: 'ABORTED'
      });

      controller.abort();
      await jest.runAllTimersAsync();
      await assertion;

      expect(mock).toHaveBeenCalledTimes(1);
    });

    it('aborts immediately when handed an already-aborted signal', async () => {
      const mock = hangingFetch();

      const promise = iFetchSmart('https://api.test/slow', {
        timeout: 10_000,
        retries: 0,
        signal: AbortSignal.abort()
      });
      const assertion = expect(promise).rejects.toMatchObject({
        code: 'ABORTED'
      });

      await jest.runAllTimersAsync();
      await assertion;
      expect(mock).toHaveBeenCalledTimes(1);
    });
  });
});
