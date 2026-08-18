"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.backoffDelay = backoffDelay;
exports.withRetry = withRetry;
/**
 * Exponential backoff, capped. Attempt 0 waits `base`, attempt 1 waits `base * 2`,
 * and so on, never exceeding `max`.
 *
 * There is deliberately no jitter here — see README "Design notes".
 */
function backoffDelay(attempt, base, max) {
    return Math.min(base * Math.pow(2, attempt), max);
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
/**
 * Iterative rather than recursive: the original implementation recursed once per
 * retry, which grows the stack for no benefit.
 */
async function withRetry(fn, options) {
    const { retries, baseDelay, maxDelay, shouldRetryResult, shouldRetryError } = options;
    for (let attempt = 0;; attempt++) {
        try {
            const result = await fn(attempt);
            // Out of retries: hand back the result anyway so the caller can report the
            // real status code rather than a generic "retries exhausted" error.
            if (attempt >= retries || !shouldRetryResult?.(result)) {
                return result;
            }
        }
        catch (error) {
            const retryable = shouldRetryError ? shouldRetryError(error) : true;
            if (attempt >= retries || !retryable)
                throw error;
        }
        await sleep(backoffDelay(attempt, baseDelay, maxDelay));
    }
}
