// node:ffi for the Hub's own launcher code under Node (node-runtime.ts, hub-store.ts systemTryLock): the npm package's
// `hoody hub`. The engine's Node build asks Node for node:ffi itself; the launcher asks first (nodeFfi), so Node's
// one-time experimental warning is dropped there and never printed.
/** The part of node:ffi the launcher and hub-store.ts use. */
export interface NodeFfi {
  dlopen(file: string, symbols: Record<string, { arguments: string[]; return: string }>): { lib: unknown; functions: Record<string, (...a: number[]) => number> };
  dlclose(lib: unknown): void;
}

/** Node's one-time "FFI is an experimental feature" warning, printed on the first node:ffi access. */
function isFfiWarning(w: unknown, rest: unknown[]): boolean {
  const message = typeof w === 'string' ? w : w instanceof Error ? w.message : '';
  const type = typeof rest[0] === 'string' ? rest[0] : (rest[0] as { type?: string } | undefined)?.type ?? (w instanceof Error ? w.name : undefined);
  return type === 'ExperimentalWarning' && /^FFI is an experimental feature/.test(message);
}

/** node:ffi, or null when this Node has none (before 26, or started with --no-experimental-ffi). Node's experimental
 *  warning for it is not printed: the Hub is about to take the terminal, and the line would stay above it. */
export function nodeFfi(): NodeFfi | null {
  const get = (process as { getBuiltinModule?: (id: string) => unknown }).getBuiltinModule;
  if (typeof get !== 'function') return null;
  const emit = process.emitWarning;
  process.emitWarning = function (this: unknown, w: unknown, ...rest: unknown[]) {
    if (isFfiWarning(w, rest)) return;
    return (emit as (...a: unknown[]) => void).call(process, w, ...rest);
  } as typeof process.emitWarning;
  try {
    const ffi = get.call(process, 'node:ffi') as NodeFfi | undefined;
    return ffi && typeof ffi.dlopen === 'function' ? ffi : null;
  } catch {
    return null;
  } finally {
    process.emitWarning = emit;
  }
}
