import { FetchSmartError } from './errors';

/**
 * Runs a single attempt under its own AbortController, so an expired timeout
 * actually cancels the in-flight request instead of abandoning it.
 *
 * An `AbortSignal` supplied by the caller is honoured and kept distinguishable
 * from a timeout: caller aborts surface as ABORTED, ours as TIMEOUT.
 */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  attempt: number
): Promise<Response> {
  if (timeoutMs <= 0) {
    return fetch(url, init);
  }

  const controller = new AbortController();
  const externalSignal = init.signal ?? undefined;
  const onExternalAbort = () => controller.abort();

  if (externalSignal) {
    if (externalSignal.aborted) controller.abort();
    else externalSignal.addEventListener('abort', onExternalAbort, { once: true });
  }

  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (timedOut) {
      throw new FetchSmartError(
        `Request to ${url} timed out after ${timeoutMs}ms`,
        { code: 'TIMEOUT', url, attempts: attempt + 1, cause: error }
      );
    }
    throw error;
  } finally {
    clearTimeout(timer);
    externalSignal?.removeEventListener('abort', onExternalAbort);
  }
}
