/**
 * Exponential backoff, capped. Attempt 0 waits `base`, attempt 1 waits `base * 2`,
 * and so on, never exceeding `max`.
 *
 * There is deliberately no jitter here — see README "Design notes".
 */
export function backoffDelay(attempt: number, base: number, max: number): number {
  return Math.min(base * Math.pow(2, attempt), max);
}

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

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Iterative rather than recursive: the original implementation recursed once per
 * retry, which grows the stack for no benefit.
 */
export async function withRetry<T>(
  fn: (attempt: number) => Promise<T>,
  options: RetryOptions<T>
): Promise<T> {
  const { retries, baseDelay, maxDelay, shouldRetryResult, shouldRetryError } =
    options;

  for (let attempt = 0; ; attempt++) {
    try {
      const result = await fn(attempt);

      // Out of retries: hand back the result anyway so the caller can report the
      // real status code rather than a generic "retries exhausted" error.
      if (attempt >= retries || !shouldRetryResult?.(result)) {
        return result;
      }
    } catch (error) {
      const retryable = shouldRetryError ? shouldRetryError(error) : true;
      if (attempt >= retries || !retryable) throw error;
    }

    await sleep(backoffDelay(attempt, baseDelay, maxDelay));
  }
}
