export type CacheLookup = {
    hit: true;
    data: unknown;
} | {
    hit: false;
};
export declare function isCacheable(init: RequestInit): boolean;
/**
 * Keys include method, URL, body and headers. Headers matter for correctness as
 * well as cache-hit accuracy: without them, a response fetched with one
 * `Authorization` header could be served to a request carrying a different one.
 */
export declare function buildCacheKey(url: string, init: RequestInit): string;
export declare function setCache(key: string, data: unknown, ttl: number): void;
export declare function getCache(key: string): CacheLookup;
/** Drops every cached entry. Exposed mainly so tests and long-lived apps can reset. */
export declare function clearCache(): void;
/** Number of entries currently held, expired-but-unswept included. */
export declare function cacheSize(): number;
