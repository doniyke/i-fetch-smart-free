"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.withRetry = withRetry;
async function withRetry(fn, retries = 3, delay = 500) {
    try {
        return await fn();
    }
    catch (error) {
        if (retries <= 0)
            throw error;
        await new Promise((res) => setTimeout(res, delay));
        return withRetry(fn, retries - 1, delay * 2); // Exponential backoff
    }
}
