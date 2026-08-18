/**
 * Runs a single attempt under its own AbortController, so an expired timeout
 * actually cancels the in-flight request instead of abandoning it.
 *
 * An `AbortSignal` supplied by the caller is honoured and kept distinguishable
 * from a timeout: caller aborts surface as ABORTED, ours as TIMEOUT.
 */
export declare function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number, attempt: number): Promise<Response>;
