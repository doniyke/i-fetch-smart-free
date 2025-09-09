"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setCache = setCache;
exports.getCache = getCache;
const cache = {};
function setCache(key, data, ttl = 60000) {
    cache[key] = { data, expiry: Date.now() + ttl };
}
function getCache(key) {
    const entry = cache[key];
    if (!entry)
        return null;
    if (Date.now() > entry.expiry) {
        delete cache[key];
        return null;
    }
    return entry.data;
}
