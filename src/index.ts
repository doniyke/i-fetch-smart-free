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
 * Successful statuses defined to carry no body. Reading them as JSON would fail
 * even though the request itself succeeded.
 *
 * 304 is deliberately absent: it is not an `ok` response, this library has no
 * conditional-request support, and it surfaces as HTTP_ERROR like any other
 * non-2xx status.
 */
const EMPTY_BODY_STATUSES = new Set([204, 205]);

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

/**
 * Reads the body as JSON, treating a legitimately empty response as `null`
 * rather than a parse failure — a 204 from a successful DELETE must not throw.
 */
async function parseBody(
  response: Response,
  href: string,
  attempts: number
): Promise<unknown> {
  if (EMPTY_BODY_STATUSES.has(response.status)) return null;

  let text: string;
  try {
    text = await response.text();
  } catch (error) {
    throw new FetchSmartError(
      `Response body from ${href} could not be read`,
      { code: 'NETWORK_ERROR', url: href, status: response.status, attempts, cause: error }
    );
  }

  if (text.trim() === '') return null;

  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    const contentType = response.headers?.get('content-type') ?? 'unknown';
    throw new FetchSmartError(
      `Response from ${href} was not valid JSON (content-type: ${contentType})`,
      { code: 'PARSE_ERROR', url: href, status: response.status, attempts, cause: error }
    );
  }
}

export async function iFetchSmart<T = unknown>(
  url: string | URL,
  options: FetchSmartOptions = {}
): Promise<T> {
  // `fetch` accepts a URL object, and so does this; everything downstream
  // (cache keys, error messages) works with the string form.
  const href = typeof url === 'string' ? url : url.toString();
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
  const cacheKey = cacheEnabled ? buildCacheKey(href, fetchOptions) : '';

  if (cacheEnabled) {
    const lookup = getCache(cacheKey);
    if (lookup.hit) return lookup.data as T;
  }

  let attempts = 0;
  let response: Response;

  try {
    response = await withRetry<Response>(
      (attempt) => {
        attempts = attempt + 1;
        return fetchWithTimeout(href, fetchOptions, timeout, attempt);
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
      throw new FetchSmartError(`Request to ${href} was aborted`, {
        code: 'ABORTED',
        url: href,
        attempts,
        cause: error
      });
    }

    throw new FetchSmartError(
      `Request to ${href} failed after ${attempts} attempt(s): ${
        error instanceof Error ? error.message : String(error)
      }`,
      { code: 'NETWORK_ERROR', url: href, attempts, cause: error }
    );
  }

  if (!response.ok) {
    discardBody(response);
    throw new FetchSmartError(
      `Request to ${href} failed with HTTP ${response.status}`,
      { code: 'HTTP_ERROR', url: href, status: response.status, attempts }
    );
  }

  const data = await parseBody(response, href, attempts);

  if (cacheEnabled) {
    setCache(cacheKey, data, cacheTtl);
  }

  return data as T;
}
