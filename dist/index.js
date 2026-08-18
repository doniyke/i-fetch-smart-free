"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_RETRY_STATUS_CODES = exports.cacheSize = exports.clearCache = exports.isFetchSmartError = exports.FetchSmartError = void 0;
exports.iFetchSmart = iFetchSmart;
const retry_1 = require("./retry");
const timeout_1 = require("./timeout");
const cache_1 = require("./cache");
const errors_1 = require("./errors");
var errors_2 = require("./errors");
Object.defineProperty(exports, "FetchSmartError", { enumerable: true, get: function () { return errors_2.FetchSmartError; } });
Object.defineProperty(exports, "isFetchSmartError", { enumerable: true, get: function () { return errors_2.isFetchSmartError; } });
var cache_2 = require("./cache");
Object.defineProperty(exports, "clearCache", { enumerable: true, get: function () { return cache_2.clearCache; } });
Object.defineProperty(exports, "cacheSize", { enumerable: true, get: function () { return cache_2.cacheSize; } });
/**
 * Retried by default: transient conditions only.
 *
 * 501 and 505 are deliberately absent — they are permanent server-side refusals,
 * so retrying them only adds latency before the same failure.
 */
exports.DEFAULT_RETRY_STATUS_CODES = [
    408, 429, 500, 502, 503, 504
];
/**
 * An unread body keeps its connection alive in undici, so discard the bodies of
 * responses we are about to throw away and retry.
 */
function discardBody(response) {
    try {
        void response.body?.cancel();
    }
    catch {
        // Body already consumed or unsupported; nothing to release.
    }
}
function isAbortError(error) {
    return error instanceof Error && error.name === 'AbortError';
}
async function iFetchSmart(url, options = {}
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped return until generics land in Stage 3
) {
    const { retries = 3, timeout = 5000, cacheTtl = 0, retryOn = exports.DEFAULT_RETRY_STATUS_CODES, retryDelay = 500, maxRetryDelay = 30000, ...fetchOptions } = options;
    const cacheEnabled = cacheTtl > 0 && (0, cache_1.isCacheable)(fetchOptions);
    const cacheKey = cacheEnabled ? (0, cache_1.buildCacheKey)(url, fetchOptions) : '';
    if (cacheEnabled) {
        const lookup = (0, cache_1.getCache)(cacheKey);
        if (lookup.hit)
            return lookup.data;
    }
    let attempts = 0;
    let response;
    try {
        response = await (0, retry_1.withRetry)((attempt) => {
            attempts = attempt + 1;
            return (0, timeout_1.fetchWithTimeout)(url, fetchOptions, timeout, attempt);
        }, {
            retries,
            baseDelay: retryDelay,
            maxDelay: maxRetryDelay,
            shouldRetryResult: (res) => {
                const retryable = retryOn.includes(res.status);
                if (retryable)
                    discardBody(res);
                return retryable;
            },
            // A caller-initiated abort is a decision, not a transient fault.
            shouldRetryError: (error) => !isAbortError(error)
        });
    }
    catch (error) {
        if (error instanceof errors_1.FetchSmartError)
            throw error;
        if (isAbortError(error)) {
            throw new errors_1.FetchSmartError(`Request to ${url} was aborted`, {
                code: 'ABORTED',
                url,
                attempts,
                cause: error
            });
        }
        throw new errors_1.FetchSmartError(`Request to ${url} failed after ${attempts} attempt(s): ${error instanceof Error ? error.message : String(error)}`, { code: 'NETWORK_ERROR', url, attempts, cause: error });
    }
    if (!response.ok) {
        discardBody(response);
        throw new errors_1.FetchSmartError(`Request to ${url} failed with HTTP ${response.status}`, { code: 'HTTP_ERROR', url, status: response.status, attempts });
    }
    let data;
    try {
        data = await response.json();
    }
    catch (error) {
        const contentType = response.headers?.get('content-type') ?? 'unknown';
        throw new errors_1.FetchSmartError(`Response from ${url} was not valid JSON (content-type: ${contentType})`, {
            code: 'PARSE_ERROR',
            url,
            status: response.status,
            attempts,
            cause: error
        });
    }
    if (cacheEnabled) {
        (0, cache_1.setCache)(cacheKey, data, cacheTtl);
    }
    return data;
}
