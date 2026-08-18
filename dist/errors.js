"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FetchSmartError = void 0;
exports.isFetchSmartError = isFetchSmartError;
class FetchSmartError extends Error {
    code;
    url;
    attempts;
    status;
    /**
     * Redeclared rather than inherited: `Error.cause` only exists when the
     * consumer's `lib` includes ES2022, so relying on inheritance would hide
     * `cause` from anyone targeting ES2020 or earlier.
     */
    cause;
    constructor(message, init) {
        super(message, { cause: init.cause });
        this.name = 'FetchSmartError';
        this.code = init.code;
        this.url = init.url;
        this.attempts = init.attempts;
        this.status = init.status;
        this.cause = init.cause;
    }
}
exports.FetchSmartError = FetchSmartError;
function isFetchSmartError(error) {
    return error instanceof FetchSmartError;
}
