/**
 * Every failure surfaced by `iFetchSmart` is a `FetchSmartError`, so callers can
 * branch on `error.code` instead of matching error message strings.
 */
export type FetchSmartErrorCode =
  | 'HTTP_ERROR'
  | 'TIMEOUT'
  | 'NETWORK_ERROR'
  | 'PARSE_ERROR'
  | 'ABORTED';

export interface FetchSmartErrorInit {
  code: FetchSmartErrorCode;
  url: string;
  /** How many requests were actually issued, including the failed one. */
  attempts: number;
  /** Set whenever a response was received, so absent for TIMEOUT and ABORTED. */
  status?: number;
  cause?: unknown;
}

export class FetchSmartError extends Error {
  readonly code: FetchSmartErrorCode;
  readonly url: string;
  readonly attempts: number;
  readonly status?: number;
  /**
   * Redeclared rather than inherited: `Error.cause` only exists when the
   * consumer's `lib` includes ES2022, so relying on inheritance would hide
   * `cause` from anyone targeting ES2020 or earlier.
   */
  readonly cause?: unknown;

  constructor(message: string, init: FetchSmartErrorInit) {
    super(message, { cause: init.cause });
    this.name = 'FetchSmartError';
    this.code = init.code;
    this.url = init.url;
    this.attempts = init.attempts;
    this.status = init.status;
    this.cause = init.cause;
  }
}

export function isFetchSmartError(error: unknown): error is FetchSmartError {
  return error instanceof FetchSmartError;
}
