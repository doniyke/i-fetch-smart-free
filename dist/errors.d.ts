/**
 * Every failure surfaced by `iFetchSmart` is a `FetchSmartError`, so callers can
 * branch on `error.code` instead of matching error message strings.
 */
export type FetchSmartErrorCode = 'HTTP_ERROR' | 'TIMEOUT' | 'NETWORK_ERROR' | 'PARSE_ERROR' | 'ABORTED';
export interface FetchSmartErrorInit {
    code: FetchSmartErrorCode;
    url: string;
    /** How many requests were actually issued, including the failed one. */
    attempts: number;
    /** Present only for HTTP_ERROR and PARSE_ERROR, where a response was received. */
    status?: number;
    cause?: unknown;
}
export declare class FetchSmartError extends Error {
    readonly code: FetchSmartErrorCode;
    readonly url: string;
    readonly attempts: number;
    readonly status?: number;
    constructor(message: string, init: FetchSmartErrorInit);
}
export declare function isFetchSmartError(error: unknown): error is FetchSmartError;
