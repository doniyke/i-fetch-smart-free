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
/**
 * Reads the body as JSON, treating a legitimately empty response as `null`
 * rather than a parse failure — a 204 from a successful DELETE must not throw.
 */
async function parseBody(response, href, attempts) {
    if (EMPTY_BODY_STATUSES.has(response.status))
        return null;
    let text;
    try {
        text = await response.text();
    }
    catch (error) {
        throw new errors_1.FetchSmartError(`Response body from ${href} could not be read`, { code: 'NETWORK_ERROR', url: href, status: response.status, attempts, cause: error });
    }
    if (text.trim() === '')
        return null;
    try {
        return JSON.parse(text);
    }
    catch (error) {
        const contentType = response.headers?.get('content-type') ?? 'unknown';
        throw new errors_1.FetchSmartError(`Response from ${href} was not valid JSON (content-type: ${contentType})`, { code: 'PARSE_ERROR', url: href, status: response.status, attempts, cause: error });
    }
}
async function iFetchSmart(url, options = {}) {
    // `fetch` accepts a URL object, and so does this; everything downstream
    // (cache keys, error messages) works with the string form.
    const href = typeof url === 'string' ? url : url.toString();
    const { retries = 3, timeout = 5000, cacheTtl = 0, retryOn = exports.DEFAULT_RETRY_STATUS_CODES, retryDelay = 500, maxRetryDelay = 30000, ...fetchOptions } = options;
    const cacheEnabled = cacheTtl > 0 && (0, cache_1.isCacheable)(fetchOptions);
    const cacheKey = cacheEnabled ? (0, cache_1.buildCacheKey)(href, fetchOptions) : '';
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
            return (0, timeout_1.fetchWithTimeout)(href, fetchOptions, timeout, attempt);
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
            throw new errors_1.FetchSmartError(`Request to ${href} was aborted`, {
                code: 'ABORTED',
                url: href,
                attempts,
                cause: error
            });
        }
        throw new errors_1.FetchSmartError(`Request to ${href} failed after ${attempts} attempt(s): ${error instanceof Error ? error.message : String(error)}`, { code: 'NETWORK_ERROR', url: href, attempts, cause: error });
    }
    if (!response.ok) {
        discardBody(response);
        throw new errors_1.FetchSmartError(`Request to ${href} failed with HTTP ${response.status}`, { code: 'HTTP_ERROR', url: href, status: response.status, attempts });
    }
    const data = await parseBody(response, href, attempts);
    if (cacheEnabled) {
        (0, cache_1.setCache)(cacheKey, data, cacheTtl);
    }
    return data;
}
