/**
 * `await using` support for the handles the tunnel helpers return.
 *
 * `Symbol.asyncDispose` is missing before Node 20.4, and there a computed
 * `[Symbol.asyncDispose]` key in an object literal becomes the string key
 * "undefined". The method is therefore attached only where the runtime has the
 * symbol; `close()` / `stop()` work everywhere.
 */
export function withAsyncDispose<T extends object>(target: T, dispose: () => Promise<void>): NoInfer<T> & { [Symbol.asyncDispose](): Promise<void> } {
  const sym = (Symbol as unknown as { asyncDispose?: symbol }).asyncDispose;
  if (typeof sym === 'symbol') {
    Object.defineProperty(target, sym, { value: dispose, enumerable: true, configurable: true, writable: true });
  }
  return target as T & { [Symbol.asyncDispose](): Promise<void> };
}
