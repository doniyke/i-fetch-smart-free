# Changelog

All notable changes to this project are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] — 2026-08-18

A correctness release. Several advertised features did not work as described,
and the shipped TypeScript definitions were broken for consumers. Fixing them
required breaking changes, so this is a major version.

**Migrating:** most callers only need to add a type argument
(`iFetchSmart<Todo>(url)`) and catch `FetchSmartError` instead of `Error`.
The full list is under *Breaking changes* below.

### Breaking changes

- **Node 20 or later is now required.** The `node-fetch` dependency has been
  removed in favour of the platform's global `fetch`. The package now has **zero
  runtime dependencies**.
- **`FetchSmartOptions` now extends undici's `RequestInit`**, not `node-fetch`'s.
  The two are similar but not identical; `node-fetch`-specific members such as
  `agent` are gone.
- **`iFetchSmart` is generic and returns `Promise<unknown>` by default**, instead
  of `Promise<any>`. Opt in to a type with `iFetchSmart<Todo>(url)`, or narrow
  the result. `any` silently disabled type checking at every call site.
- **All failures now reject with `FetchSmartError`.** Previously four unrelated
  error shapes were thrown. Code matching on error message strings will break.
- **Only `GET` and `HEAD` responses are cached.** A `POST` response is no longer
  stored, and can no longer be served to a later request.
- **Cache keys now include the method, request body and headers**, not just the
  URL. Requests that previously shared a cache entry may no longer do so.
- **Empty response bodies resolve to `null`** instead of throwing. This affects
  `204`, `205`, and any zero-length body.

### Added

- `retryOn` — HTTP status codes that should trigger a retry. Defaults to
  `[408, 429, 500, 502, 503, 504]`, exported as `DEFAULT_RETRY_STATUS_CODES`.
- `retryDelay` and `maxRetryDelay` — the backoff base and its upper bound. The
  backoff was previously fixed at 500 ms and grew without limit.
- `FetchSmartError` and the `isFetchSmartError` type guard, carrying `code`,
  `url`, `status`, `attempts` and `cause`.
- `clearCache()` and `cacheSize()`.
- The `url` parameter accepts a `URL` object as well as a string.
- A caller-supplied `AbortSignal` is honoured, reported as `ABORTED`, and never
  retried.
- Test suite: 76 unit tests covering the retry, timeout, cache and error paths,
  plus compile-time assertions over the public API.
- GitHub Actions CI running lint, typecheck, tests and build on Node 20, 22
  and 24.
- `npm run typecheck` and `npm run test:coverage` scripts.

### Fixed

- **HTTP errors were never retried.** The `response.ok` check sat outside the
  retry loop, so `fetch` resolving on a 503 counted as success and the request
  returned without a single retry — despite `retries` defaulting to 3.
- **A cached `POST` response could be served to a later `GET`** on the same URL,
  because cache keys were built from the URL alone.
- **Cached values were handed out by reference**, so any caller mutating a
  result corrupted what every later caller received. Entries are now cloned on
  both read and write.
- **A cached body of `null`, `0`, `false` or `""` was always treated as a miss**,
  because cache hits were detected by truthiness rather than key presence.
- **Timeouts abandoned requests instead of aborting them.** `Promise.race` left
  the underlying socket open and downloading; under retries, timed-out attempts
  accumulated. Each attempt now runs under its own `AbortController`.
- **The shipped type definitions were unusable.** `dist/index.d.ts` imported
  `RequestInit` from `node-fetch` while `@types/node-fetch` was only a dev
  dependency, so `FetchSmartOptions` silently degraded to
  `{ retries, timeout, cacheTtl }` and `method`, `headers` and `body` all failed
  to compile. The README's own POST example did not typecheck.
- **`cause` was unreachable for consumers targeting `lib: ES2020`**, since
  `Error.cause` only exists from ES2022. `FetchSmartError` now declares it.
- **A `204 No Content` response threw `PARSE_ERROR`**, so a successful `DELETE`
  failed.
- **Non-JSON bodies threw a bare `SyntaxError`.** They now produce a
  `PARSE_ERROR` naming the response's content-type.
- **`npm run lint` had never worked.** ESLint 9 requires flat config, the repo
  carried `.eslintrc.json`, and the `@typescript-eslint` parser and plugin it
  referenced were not installed.
- **The license metadata disagreed with itself.** `package.json` declared ISC
  while the `LICENSE` file and README said MIT. MIT is correct.

### Known limitations

Documented rather than fixed; see the README for detail.

- The response body must be JSON. There is no access to the raw `Response`,
  response headers, or the status code of a successful request.
- The cache is unbounded and per-process. Expired entries are evicted only when
  requested again.
- Concurrent identical requests are not de-duplicated.
- Backoff has no jitter, and `Retry-After` is ignored.

## [1.0.1] — 2025-09-09

Initial published release: `fetch` wrapper with retries, timeouts and in-memory
caching.

[2.0.0]: https://github.com/doniyke/i-fetch-smart-free/releases/tag/v2.0.0
[1.0.1]: https://github.com/doniyke/i-fetch-smart-free/releases/tag/v1.0.1
