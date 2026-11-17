/**
 * `await using` support for the handles the tunnel helpers return.
 *
 * `Symbol.asyncDispose` is missing before Node 20.4, and there a computed
 * `[Symbol.asyncDispose]` key in an object literal becomes the string key
 * "undefined". The method is therefore attached only where the runtime has the
 * symbol; `close()` / `stop()` work everywhere.
 */
export function withAsyncDispose(target, dispose) {
    const sym = Symbol.asyncDispose;
    if (typeof sym === 'symbol') {
        Object.defineProperty(target, sym, { value: dispose, enumerable: true, configurable: true, writable: true });
    }
    return target;
}
