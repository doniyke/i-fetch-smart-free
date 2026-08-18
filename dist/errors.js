"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FetchSmartError = void 0;
exports.isFetchSmartError = isFetchSmartError;
class FetchSmartError extends Error {
    code;
    url;
    attempts;
    status;
    constructor(message, init) {
        super(message, { cause: init.cause });
        this.name = 'FetchSmartError';
        this.code = init.code;
        this.url = init.url;
        this.attempts = init.attempts;
        this.status = init.status;
    }
}
exports.FetchSmartError = FetchSmartError;
function isFetchSmartError(error) {
    return error instanceof FetchSmartError;
}
