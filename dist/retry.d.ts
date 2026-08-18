/**
 * Exponential backoff, capped. Attempt 0 waits `base`, attempt 1 waits `base * 2`,
 * and so on, never exceeding `max`.
 *
 * There is deliberately no jitter here — see README "Design notes".
 */
export declare function backoffDelay(attempt: number, base: number, max: number): number;
export interface RetryOptions<T> {
    /** Number of *additional* attempts after the first. `retries: 3` issues 4 requests. */
    retries: number;
    baseDelay: number;
    maxDelay: number;
    /** Retry even though `fn` resolved — used to retry retryable HTTP status codes. */
    shouldRetryResult?: (result: T) => boolean;
    /** Retry after `fn` threw. Defaults to retrying every error. */
    shouldRetryError?: (error: unknown) => boolean;
}
/**
 * Iterative rather than recursive: the original implementation recursed once per
 * retry, which grows the stack for no benefit.
 */
export declare function withRetry<T>(fn: (attempt: number) => Promise<T>, options: RetryOptions<T>): Promise<T>;
