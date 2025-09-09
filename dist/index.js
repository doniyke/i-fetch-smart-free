"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.iFetchSmart = iFetchSmart;
const node_fetch_1 = __importDefault(require("node-fetch"));
const retry_1 = require("./retry");
const timeout_1 = require("./timeout");
const cache_1 = require("./cache");
async function iFetchSmart(url, options = {}) {
    const { retries = 3, timeout = 5000, cacheTtl = 0, ...fetchOptions } = options;
    // 1. Check cache
    if (cacheTtl > 0) {
        const cached = (0, cache_1.getCache)(url);
        if (cached)
            return cached;
    }
    // 2. Perform fetch with retry + timeout
    const response = await (0, retry_1.withRetry)(() => (0, timeout_1.withTimeout)((0, node_fetch_1.default)(url, fetchOptions), timeout), retries);
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    // 3. Save to cache if enabled
    if (cacheTtl > 0) {
        (0, cache_1.setCache)(url, data, cacheTtl);
    }
    return data;
}
