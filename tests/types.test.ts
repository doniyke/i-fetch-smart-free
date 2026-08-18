/**
 * Compile-time tests for the public API surface.
 *
 * These assert against the *types*, not the runtime: `npm run typecheck` is what
 * really runs them. Jest executes the file too so the assertions cannot rot
 * silently behind a skipped suite, but the single runtime expectation below is
 * incidental — a `@ts-expect-error` that stops erroring fails the typecheck.
 */
import {
  iFetchSmart,
  FetchSmartError,
  isFetchSmartError,
  DEFAULT_RETRY_STATUS_CODES,
  clearCache,
  cacheSize
} from '../src/index';
import type { FetchSmartOptions, FetchSmartErrorCode } from '../src/index';

/** Exact type equality, not merely mutual assignability. */
type Equals<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2
    ? true
    : false;

function expectType<T extends true>(_assertion?: T): void {
  /* compile-time only */
}

/**
 * Never invoked. Everything inside is checked by the compiler and must not run:
 * these calls would otherwise issue real network requests.
 */
async function compileTimeOnly(): Promise<void> {
  void iFetchSmart('https://api.test/a');
  void iFetchSmart(new URL('https://api.test/a'));

  // @ts-expect-error a number is not a valid URL
  void iFetchSmart(42);
}
void compileTimeOnly;

describe('public types', () => {
  it('type assertions compile', () => {
    // --- return type -------------------------------------------------------

    // Defaults to `unknown`, not `any`: the body genuinely is unknown until
    // the caller says otherwise.
    expectType<Equals<Awaited<ReturnType<typeof iFetchSmart>>, unknown>>();

    // A type argument flows straight through to the resolved value.
    type Todo = { id: number; title: string };
    expectType<Equals<Awaited<ReturnType<typeof iFetchSmart<Todo>>>, Todo>>();

    // (url parameter forms are asserted in `compileTimeOnly` above, which is
    // never executed because those calls would hit the network.)

    // --- options -----------------------------------------------------------

    const options: FetchSmartOptions = {
      retries: 3,
      timeout: 5000,
      cacheTtl: 1000,
      retryOn: [503],
      retryDelay: 500,
      maxRetryDelay: 30000,
      // RequestInit members must survive alongside our own options; this is
      // exactly what broke in 1.0.1.
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ a: 1 }),
      signal: new AbortController().signal,
      redirect: 'follow'
    };
    void options;

    // @ts-expect-error retries is a number
    const badRetries: FetchSmartOptions = { retries: 'three' };
    void badRetries;

    // @ts-expect-error unknown options are rejected rather than silently ignored
    const unknownOption: FetchSmartOptions = { retires: 3 };
    void unknownOption;

    // --- error shape -------------------------------------------------------

    const error = new FetchSmartError('boom', {
      code: 'TIMEOUT',
      url: 'https://api.test/a',
      attempts: 2
    });

    expectType<Equals<typeof error.code, FetchSmartErrorCode>>();
    expectType<Equals<typeof error.url, string>>();
    expectType<Equals<typeof error.attempts, number>>();
    expectType<Equals<typeof error.status, number | undefined>>();
    // Declared on the class rather than inherited, so it resolves even for
    // consumers whose `lib` predates ES2022.
    expectType<Equals<typeof error.cause, unknown>>();

    // @ts-expect-error the fields are readonly
    error.code = 'HTTP_ERROR';

    // @ts-expect-error code is a fixed union, not an arbitrary string
    const badCode: FetchSmartErrorCode = 'NOPE';
    void badCode;

    // --- narrowing ---------------------------------------------------------

    const unknownError: unknown = error;
    if (isFetchSmartError(unknownError)) {
      expectType<Equals<typeof unknownError, FetchSmartError>>();
    }

    // --- other exports -----------------------------------------------------

    expectType<Equals<typeof DEFAULT_RETRY_STATUS_CODES, readonly number[]>>();
    expectType<Equals<typeof clearCache, () => void>>();
    expectType<Equals<typeof cacheSize, () => number>>();

    expect(isFetchSmartError(error)).toBe(true);
  });
});
