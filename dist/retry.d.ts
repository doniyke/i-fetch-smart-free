export declare function withRetry<T>(fn: () => Promise<T>, retries?: number, delay?: number): Promise<T>;
