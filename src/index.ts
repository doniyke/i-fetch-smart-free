import fetch, { RequestInit } from 'node-fetch';
import { withRetry } from './retry';
import { withTimeout } from './timeout';
import { getCache, setCache } from './cache';

export interface FetchSmartOptions extends RequestInit {
  retries?: number;
  timeout?: number;
  cacheTtl?: number;
}

export async function iFetchSmart(
  url: string,
  options: FetchSmartOptions = {}
): Promise<any> {
  const {
    retries = 3,
    timeout = 5000,
    cacheTtl = 0,
    ...fetchOptions
  } = options;

  // 1. Check cache
  if (cacheTtl > 0) {
    const cached = getCache(url);
    if (cached) return cached;
  }

  // 2. Perform fetch with retry + timeout
  const response = await withRetry(
    () => withTimeout(fetch(url, fetchOptions), timeout),
    retries
  );

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const data = await response.json();

  // 3. Save to cache if enabled
  if (cacheTtl > 0) {
    setCache(url, data, cacheTtl);
  }

  return data;
}
