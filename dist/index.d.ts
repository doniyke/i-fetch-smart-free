export { FetchSmartError, isFetchSmartError } from './errors';
export type { FetchSmartErrorCode } from './errors';
export { clearCache, cacheSize } from './cache';
/**
 * Retried by default: transient conditions only.
 *
 * 501 and 505 are deliberately absent — they are permanent server-side refusals,
 * so retrying them only adds latency before the same failure.
 */
export declare const DEFAULT_RETRY_STATUS_CODES: readonly number[];
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
export declare function iFetchSmart<T = unknown>(url: string | URL, options?: FetchSmartOptions): Promise<T>;
