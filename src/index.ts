import { withRetry } from './retry';
import { fetchWithTimeout } from './timeout';
import { buildCacheKey, getCache, isCacheable, setCache } from './cache';
import { FetchSmartError } from './errors';

export { FetchSmartError, isFetchSmartError } from './errors';
export type { FetchSmartErrorCode } from './errors';
export { clearCache, cacheSize } from './cache';

/**
 * Retried by default: transient conditions only.
 *
 * 501 and 505 are deliberately absent — they are permanent server-side refusals,
 * so retrying them only adds latency before the same failure.
 */
export const DEFAULT_RETRY_STATUS_CODES: readonly number[] = [
  408, 429, 500, 502, 503, 504
];

export interface FetchSmartOptions extends RequestInit {
  /** Additional attempts after the first. `retries: 3` issues up to 4 requests. Default 3. */
  retries?: number;
  /** Per-attempt timeout in ms. Not a budget for the whole call. 0 disables. Default 5000. */
  timeout?: number;
  /** Cache lifetime in ms. 0 disables caching. GET/HEAD only. Default 0. */
  cacheTtl?: number;
  /** HTTP status codes that trigger a retry. Default {@link DEFAULT_RETRY_STATUS_CODES}. */
  retryOn?: readonly number[];
  /** Backoff base in ms; doubles each attempt. Default 500. */
  retryDelay?: number;
  /** Upper bound on any single backoff wait, in ms. Default 30000. */
  maxRetryDelay?: number;
}

/**
 * An unread body keeps its connection alive in undici, so discard the bodies of
 * responses we are about to throw away and retry.
 */
function discardBody(response: Response): void {
  try {
    void response.body?.cancel();
  } catch {
    // Body already consumed or unsupported; nothing to release.
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

export async function iFetchSmart(
  url: string,
  options: FetchSmartOptions = {}
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped return until generics land in Stage 3
): Promise<any> {
  const {
    retries = 3,
    timeout = 5000,
    cacheTtl = 0,
    retryOn = DEFAULT_RETRY_STATUS_CODES,
    retryDelay = 500,
    maxRetryDelay = 30000,
    ...fetchOptions
  } = options;

  const cacheEnabled = cacheTtl > 0 && isCacheable(fetchOptions);
  const cacheKey = cacheEnabled ? buildCacheKey(url, fetchOptions) : '';

  if (cacheEnabled) {
    const lookup = getCache(cacheKey);
    if (lookup.hit) return lookup.data;
  }

  let attempts = 0;
  let response: Response;

  try {
    response = await withRetry<Response>(
      (attempt) => {
        attempts = attempt + 1;
        return fetchWithTimeout(url, fetchOptions, timeout, attempt);
      },
      {
        retries,
        baseDelay: retryDelay,
        maxDelay: maxRetryDelay,
        shouldRetryResult: (res) => {
          const retryable = retryOn.includes(res.status);
          if (retryable) discardBody(res);
          return retryable;
        },
        // A caller-initiated abort is a decision, not a transient fault.
        shouldRetryError: (error) => !isAbortError(error)
      }
    );
  } catch (error) {
    if (error instanceof FetchSmartError) throw error;

    if (isAbortError(error)) {
      throw new FetchSmartError(`Request to ${url} was aborted`, {
        code: 'ABORTED',
        url,
        attempts,
        cause: error
      });
    }

    throw new FetchSmartError(
      `Request to ${url} failed after ${attempts} attempt(s): ${
        error instanceof Error ? error.message : String(error)
      }`,
      { code: 'NETWORK_ERROR', url, attempts, cause: error }
    );
  }

  if (!response.ok) {
    discardBody(response);
    throw new FetchSmartError(
      `Request to ${url} failed with HTTP ${response.status}`,
      { code: 'HTTP_ERROR', url, status: response.status, attempts }
    );
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch (error) {
    const contentType = response.headers?.get('content-type') ?? 'unknown';
    throw new FetchSmartError(
      `Response from ${url} was not valid JSON (content-type: ${contentType})`,
      {
        code: 'PARSE_ERROR',
        url,
        status: response.status,
        attempts,
        cause: error
      }
    );
  }

  if (cacheEnabled) {
    setCache(cacheKey, data, cacheTtl);
  }

  return data;
}
