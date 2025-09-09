type CacheEntry = {
  data: any;
  expiry: number;
};

const cache: Record<string, CacheEntry> = {};

export function setCache(key: string, data: any, ttl: number = 60000): void {
  cache[key] = { data, expiry: Date.now() + ttl };
}

export function getCache(key: string): any | null {
  const entry = cache[key];
  if (!entry) return null;
  if (Date.now() > entry.expiry) {
    delete cache[key];
    return null;
  }
  return entry.data;
}
