# i-fetch-smart

[![CI](https://github.com/doniyke/i-fetch-smart-free/actions/workflows/ci.yml/badge.svg)](https://github.com/doniyke/i-fetch-smart-free/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/i-fetch-smart.svg)](https://www.npmjs.com/package/i-fetch-smart)
[![license](https://img.shields.io/npm/l/i-fetch-smart.svg)](./LICENSE)

A small `fetch` wrapper that adds **retries with exponential backoff, per-attempt
timeouts, and optional in-memory caching**, then hands you the parsed JSON body.

Zero runtime dependencies. Written in TypeScript.

```ts
import { iFetchSmart } from 'i-fetch-smart';

type Todo = { id: number; title: string };

const todo = await iFetchSmart<Todo>('https://api.example.com/todos/1', {
  retries: 3,
  timeout: 5000
});
```

---

## Requirements

| | |
|---|---|
| **Node** | 20 or later (uses the built-in global `fetch`) |
| **Runtime dependencies** | none |
| **Module format** | CommonJS, with TypeScript declarations |
| **Browsers** | works wherever `fetch`, `AbortController` and `structuredClone` exist, if you bundle it |

The package ships CommonJS. Both of these are tested and work:

```js
const { iFetchSmart } = require('i-fetch-smart');   // CommonJS
```
```js
import { iFetchSmart } from 'i-fetch-smart';        // ESM named imports
```

There is no separate ESM build; Node resolves the named imports from the
CommonJS output. If you need a true ESM bundle, please open an issue.

## Installation

```bash
npm install i-fetch-smart
```

## Usage

### With error handling

`iFetchSmart` resolves with the parsed JSON body, or rejects with a
`FetchSmartError`. Every failure mode uses that one class, so you can branch on
`error.code` instead of matching message strings.

```ts
import { iFetchSmart, isFetchSmartError } from 'i-fetch-smart';

type User = { id: number; name: string };

try {
  const user = await iFetchSmart<User>('https://api.example.com/users/1', {
    retries: 3,
    timeout: 5000,
    cacheTtl: 30_000
  });
  console.log(user.name);
} catch (error) {
  if (!isFetchSmartError(error)) throw error;

  switch (error.code) {
    case 'HTTP_ERROR':
      console.error(`Server said ${error.status} after ${error.attempts} attempts`);
      break;
    case 'TIMEOUT':
      console.error('Too slow, request aborted');
      break;
    case 'NETWORK_ERROR':
      console.error('Could not reach the server:', error.cause);
      break;
    case 'PARSE_ERROR':
      console.error('Response was not JSON:', error.message);
      break;
    case 'ABORTED':
      console.error('Cancelled by the caller');
      break;
  }
}
```

### POST

```ts
const created = await iFetchSmart<{ id: number }>('https://api.example.com/posts', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ title: 'Hello', userId: 1 }),
  retries: 2,
  timeout: 3000
});
```

### Cancelling a request

Pass your own `AbortSignal`. A caller-initiated abort rejects with code
`ABORTED` and is never retried — cancelling means cancelling.

```ts
const controller = new AbortController();
setTimeout(() => controller.abort(), 100);

await iFetchSmart('https://api.example.com/slow', { signal: controller.signal });
```

### Retrying on your own terms

```ts
// Retry rate limits only, with a gentler backoff.
await iFetchSmart('https://api.example.com/search', {
  retryOn: [429],
  retries: 5,
  retryDelay: 1000,
  maxRetryDelay: 10_000
});
```

## Options

Every option is optional. Anything not listed here is passed straight through to
`fetch`, so `method`, `headers`, `body`, `signal`, `redirect` and friends all
work as normal.

| Option | Type | Default | Effect |
|---|---|---|---|
| `retries` | `number` | `3` | Additional attempts **after** the first. `retries: 3` issues up to 4 requests. `0` disables retrying. |
| `timeout` | `number` | `5000` | Per-attempt timeout in ms. On expiry the request is aborted and the attempt fails with `TIMEOUT`. `0` disables the timeout. |
| `cacheTtl` | `number` | `0` | How long to cache a successful response, in ms. `0` disables caching. Only `GET` and `HEAD` are ever cached. |
| `retryOn` | `readonly number[]` | `[408, 429, 500, 502, 503, 504]` | HTTP status codes that trigger a retry. Anything else — including `400`, `404` and `501` — fails immediately. |
| `retryDelay` | `number` | `500` | Base backoff in ms. Doubles each attempt: 500, 1000, 2000, … |
| `maxRetryDelay` | `number` | `30000` | Upper bound on any single backoff wait. |
| *…rest* | `RequestInit` | — | Passed through to `fetch` untouched. |

### Errors

`FetchSmartError extends Error`:

| Property | Type | Notes |
|---|---|---|
| `code` | `'HTTP_ERROR' \| 'TIMEOUT' \| 'NETWORK_ERROR' \| 'PARSE_ERROR' \| 'ABORTED'` | Branch on this. |
| `url` | `string` | The requested URL. |
| `attempts` | `number` | How many requests were actually issued. |
| `status` | `number \| undefined` | Set whenever a response was received; absent for `TIMEOUT` and `ABORTED`. |
| `cause` | `unknown` | The underlying error, where there was one. |

### Other exports

| Export | Description |
|---|---|
| `isFetchSmartError(e)` | Type guard, narrows `unknown` to `FetchSmartError`. |
| `DEFAULT_RETRY_STATUS_CODES` | The default `retryOn` list. |
| `clearCache()` | Empties the response cache. |
| `cacheSize()` | Number of entries currently cached. |

## Behaviour worth knowing

These are the things most likely to surprise you. All are covered by tests.

- **`timeout` is per attempt, not a budget for the whole call.** With the
  defaults, a hanging server costs `4 × 5s` of requests plus `0.5s + 1s + 2s` of
  backoff — about **23 seconds** before the promise rejects. Set `retries: 0` if
  you need `timeout` to mean total elapsed time.
- **`retries: 3` means four requests.** The first attempt is not a retry.
- **Only `GET` and `HEAD` are cached.** A `POST` response is never stored, and
  never served to a later request, even with `cacheTtl` set.
- **Cache keys include method, URL, body and headers.** Headers are part of the
  key so a response fetched with one `Authorization` header is never served to a
  request carrying a different one. The cost is a lower hit rate if you send
  per-request headers such as trace IDs.
- **`cacheTtl` is fixed when the entry is written.** If one call caches a URL
  for 60s, a later call passing `cacheTtl: 1000` still gets the existing entry
  until the original 60s elapses — the shorter TTL does not shorten it. Use
  `clearCache()` if you need to force a refresh.
- **Cached values are cloned in and out.** Mutating what you get back cannot
  corrupt what the next caller receives.
- **Empty bodies resolve to `null`.** A `204`, a `205`, or a zero-length body is
  a success, not a parse error. Type accordingly: `iFetchSmart<Todo | null>(…)`.
- **The response body must be JSON.** There is no way to get at the raw
  `Response`, its headers, or its status on success. See the limitations below.

## Limitations

Stated plainly, because they may rule the package out for you:

- **JSON only.** `iFetchSmart` always parses the body as JSON and returns it.
  You cannot reach the `Response` object, response headers, the status code of a
  *successful* request, or stream the body. If you need any of that, use a
  library that returns a `Response`.
- **The cache is unbounded and in-process.** Entries are evicted only when they
  are requested after expiry. A long-lived process hitting many distinct URLs
  will grow indefinitely. Call `clearCache()` periodically if that matters. It is
  also per-process — no sharing across workers.
- **No request de-duplication.** Ten concurrent identical requests issue ten
  fetches. The cache only helps once the first one has resolved.
- **No jitter in the backoff.** Delays are deterministic, so a fleet of clients
  retrying against the same failing service will stay in lockstep.
- **No `Retry-After` support.** A `429` or `503` carrying that header is retried
  on the ordinary backoff schedule, ignoring what the server asked for.
- **No conditional requests.** `304` responses surface as `HTTP_ERROR`.

## How this compares

Honest comparison against the two most similar packages. Both are more
established than this one.

| | **i-fetch-smart** | **fetch-retry** | **node-fetch-retry** |
|---|---|---|---|
| Version compared | 2.0.0 | 6.0.0 | 2.0.1 |
| Returns | parsed JSON body | `Response` | `Response` |
| Retries | ✅ | ✅ | ✅ |
| Backoff | exponential, capped | configurable, incl. a function | fixed `pause` |
| Retry on status | `retryOn` array | array **or predicate function** | — |
| Timeout | ✅ per attempt, aborts | — | — |
| Caching | ✅ TTL, GET/HEAD | — | — |
| Runtime deps | none | none | `node-fetch@3` |
| TypeScript types | ✅ | ✅ | ❌ none shipped, and no `@types` package |

**The real design difference is the return value.** `fetch-retry` and
`node-fetch-retry` are drop-in wrappers: they hand back a `Response` and stay out
of your way, so you keep full access to headers, status, and streaming, and you
can layer them onto any fetch implementation. `i-fetch-smart` is opinionated in
the other direction — it assumes a JSON API and gives you the parsed body, which
is less code at the call site and a dead end if you ever need the response
itself.

**Choose `fetch-retry`** if you want maximum flexibility over retry decisions, or
you need the `Response`. Its function-valued `retryOn` and `retryDelay` are
strictly more expressive than this package's array and numbers.

**Choose `node-fetch-retry`** if you are already committed to `node-fetch`.

**Choose this** if you want retries, timeouts and caching in one dependency-free
package, you are talking to a JSON API, and you value a single typed error shape
over access to the raw response.

Also worth knowing about: [`ky`](https://github.com/sindresorhus/ky) and
[`got`](https://github.com/sindresorhus/got) are considerably more capable than
any of the above, at a larger size.

## Project status

Small and young. It was rewritten substantially for 2.0.0 — see
[CHANGELOG.md](./CHANGELOG.md) — and while the test suite covers the retry,
timeout, cache and error paths, this has **not** seen meaningful production use.
Treat it accordingly, and please report what breaks.

## Development

```bash
git clone https://github.com/doniyke/i-fetch-smart-free.git
cd i-fetch-smart-free
npm install
```

| Script | Purpose |
|---|---|
| `npm test` | Run the test suite |
| `npm run test:coverage` | Tests with a coverage report |
| `npm run typecheck` | Type-check `src`, `tests` and `demo.ts` |
| `npm run lint` | ESLint |
| `npm run format` | Prettier |
| `npm run build` | Compile to `dist/` |

CI runs lint, typecheck, tests and build on Node 20, 22 and 24.

## License

MIT © Ezema Ikechukwu Davis — see [LICENSE](./LICENSE).
