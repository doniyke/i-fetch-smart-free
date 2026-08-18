/**
 * Shared test scaffolding.
 *
 * Responses are real undici `Response` objects rather than hand-rolled stubs, so
 * `.json()`, `.ok` and `.headers` behave exactly as they do in production.
 */

export type FetchMock = jest.Mock<
  Promise<Response>,
  [string | URL | Request, RequestInit?]
>;

export function installFetchMock(): FetchMock {
  const mock = jest.fn() as unknown as FetchMock;
  global.fetch = mock as unknown as typeof fetch;
  return mock;
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

export function textResponse(body: string, status = 200, contentType = 'text/html'): Response {
  return new Response(body, { status, headers: { 'content-type': contentType } });
}

/**
 * Rejecters for hanging requests that are still pending, so a test can leave one
 * dangling without stranding a promise in the Jest worker at teardown.
 */
const pendingRejecters = new Set<(reason: Error) => void>();

/** Settles anything still hanging. Call from afterEach alongside useRealTimers. */
export function releaseHangingRequests(): void {
  for (const reject of pendingRejecters) {
    const error = new Error('test teardown');
    error.name = 'AbortError';
    reject(error);
  }
  pendingRejecters.clear();
}

/** A request that never settles until its signal aborts, mimicking a hung server. */
export function hangingFetch(onCall?: (init?: RequestInit) => void): FetchMock {
  const mock = jest.fn((_url: string | URL | Request, init?: RequestInit) => {
    onCall?.(init);
    return new Promise<Response>((_resolve, reject) => {
      pendingRejecters.add(reject);
      const settle = (error: Error) => {
        pendingRejecters.delete(reject);
        reject(error);
      };
      const signal = init?.signal;
      if (!signal) return;

      const abortError = () => {
        const error = new Error('This operation was aborted');
        error.name = 'AbortError';
        return error;
      };

      // Real fetch rejects synchronously on an already-aborted signal rather
      // than waiting for an 'abort' event that will never fire.
      if (signal.aborted) return settle(abortError());
      signal.addEventListener('abort', () => settle(abortError()));
    });
  }) as unknown as FetchMock;
  global.fetch = mock as unknown as typeof fetch;
  return mock;
}
